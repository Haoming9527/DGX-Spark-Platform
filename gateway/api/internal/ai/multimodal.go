package ai

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"path"
	"strings"
	"unicode/utf8"
)

const (
	maxInlineBytes = 8 << 20
	maxImageBytes  = 32 << 20
	maxImages      = 32
)

var errUnsupportedPart = errors.New("unsupported content part")

type mediaDecoder struct {
	ctx    context.Context
	images int
	bytes  int
}

type visionCtxKey struct{}

func withVision(r *http.Request) *http.Request {
	return r.WithContext(context.WithValue(r.Context(), visionCtxKey{}, true))
}

func requestHasVision(r *http.Request) bool {
	v, _ := r.Context().Value(visionCtxKey{}).(bool)
	return v
}

func isOllamaNativeChat(p string) bool {
	return p == "/olla/ollama/api/chat" || strings.HasSuffix(p, "/api/chat")
}

func prepareGenerationImages(r *http.Request) (*http.Request, error) {
	if !strings.HasSuffix(r.URL.Path, "/api/generate") || r.Body == nil {
		return r, nil
	}
	raw, err := io.ReadAll(r.Body)
	_ = r.Body.Close()
	if err != nil {
		return r, err
	}
	var payload map[string]json.RawMessage
	if json.Unmarshal(raw, &payload) != nil {
		return r, errors.New("invalid generation request")
	}
	if value, ok := payload["images"]; ok {
		var images any
		if json.Unmarshal(value, &images) != nil {
			return r, errors.New("invalid generation images")
		}
		decoder := &mediaDecoder{ctx: r.Context()}
		images, _, err = decoder.existingImages(images)
		if err != nil {
			return r, err
		}
		payload["images"], _ = json.Marshal(images)
	}
	raw, err = json.Marshal(payload)
	if err != nil {
		return r, err
	}
	r.Body = io.NopCloser(bytes.NewReader(raw))
	r.ContentLength = int64(len(raw))
	r.Header.Set("Content-Length", fmt.Sprintf("%d", len(raw)))
	return r, nil
}

func prepareChatPayload(r *http.Request) (*http.Request, error) {
	if r.Body == nil {
		return r, nil
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 50<<20))
	_ = r.Body.Close()
	if err != nil {
		return r, err
	}
	if len(bytes.TrimSpace(body)) == 0 {
		r.Body = io.NopCloser(bytes.NewReader(body))
		r.ContentLength = int64(len(body))
		return r, nil
	}

	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		r.Body = io.NopCloser(bytes.NewReader(body))
		r.ContentLength = int64(len(body))
		return r, nil
	}

	msgs, ok := payload["messages"].([]any)
	if !ok {
		r.Body = io.NopCloser(bytes.NewReader(body))
		r.ContentLength = int64(len(body))
		return r, nil
	}

	native := isOllamaNativeChat(r.URL.Path)
	normalized, sawVision, err := normalizeMessages(r.Context(), msgs, native)
	if err != nil {
		r.Body = io.NopCloser(bytes.NewReader(body))
		r.ContentLength = int64(len(body))
		return r, err
	}
	payload["messages"] = normalized

	out, err := json.Marshal(payload)
	if err != nil {
		r.Body = io.NopCloser(bytes.NewReader(body))
		r.ContentLength = int64(len(body))
		return r, err
	}
	r.Body = io.NopCloser(bytes.NewReader(out))
	r.ContentLength = int64(len(out))
	r.Header.Set("Content-Length", fmt.Sprintf("%d", len(out)))
	if sawVision {
		return withVision(r), nil
	}
	return r, nil
}

func normalizeMessages(ctx context.Context, msgs []any, native bool) ([]any, bool, error) {
	out := make([]any, 0, len(msgs))
	sawVision := false
	decoder := &mediaDecoder{ctx: ctx}
	for _, raw := range msgs {
		m, ok := raw.(map[string]any)
		if !ok {
			out = append(out, raw)
			continue
		}
		nm := copyMap(m)
		text, images, changed, err := decoder.extractMedia(nm["content"])
		if err != nil {
			return nil, false, err
		}
		extra, hasImages, err := decoder.existingImages(nm["images"])
		if err != nil {
			return nil, false, err
		}
		if hasImages {
			images = append(images, extra...)
			changed = true
		}
		if len(images) > 0 {
			sawVision = true
			nm["images"] = images
		}
		if changed {
			if native {
				nm["content"] = text
			} else if len(images) > 0 {
				nm["content"] = openaiParts(text, images)
			} else if text != "" || nm["content"] != nil {
				nm["content"] = text
			}
		}
		out = append(out, nm)
	}
	return out, sawVision, nil
}

func (d *mediaDecoder) existingImages(v any) ([]string, bool, error) {
	if v == nil {
		return nil, false, nil
	}
	arr, ok := v.([]any)
	if !ok {
		return nil, false, errors.New("images must be an array")
	}
	out := make([]string, 0, len(arr))
	for _, item := range arr {
		s, ok := item.(string)
		if !ok || strings.TrimSpace(s) == "" {
			return nil, false, errors.New("images must contain non-empty image data")
		}
		b64, err := d.decodeImageRef(s)
		if err != nil {
			return nil, false, err
		}
		out = append(out, b64)
	}
	return out, len(out) > 0, nil
}

func (d *mediaDecoder) extractMedia(content any) (text string, images []string, changed bool, err error) {
	switch c := content.(type) {
	case nil:
		return "", nil, false, nil
	case string:
		return c, nil, false, nil
	case []any:
		var b strings.Builder
		for _, part := range c {
			p, ok := part.(map[string]any)
			if !ok {
				continue
			}
			switch strings.ToLower(str(p["type"])) {
			case "", "text":
				if t := str(p["text"]); t != "" {
					if b.Len() > 0 {
						b.WriteByte('\n')
					}
					b.WriteString(t)
				}
			case "image_url", "input_image":
				ref := imageRef(p)
				b64, e := d.decodeImageRef(ref)
				if e != nil {
					return "", nil, false, e
				}
				images = append(images, b64)
			case "file", "input_file":
				fileText, img, e := d.decodeFilePart(p)
				if e != nil {
					return "", nil, false, e
				}
				if img != "" {
					images = append(images, img)
				}
				if fileText != "" {
					if b.Len() > 0 {
						b.WriteByte('\n')
					}
					b.WriteString(fileText)
				}
			default:
				return "", nil, false, fmt.Errorf("%w: %s", errUnsupportedPart, p["type"])
			}
		}
		return b.String(), images, true, nil
	default:
		return "", nil, false, nil
	}
}

func imageRef(p map[string]any) string {
	if u := str(p["image_url"]); u != "" {
		return u
	}
	if nested, ok := p["image_url"].(map[string]any); ok {
		if u := str(nested["url"]); u != "" {
			return u
		}
	}
	if nested, ok := p["image"].(map[string]any); ok {
		if u := str(nested["url"]); u != "" {
			return u
		}
	}
	return str(p["url"])
}

func (d *mediaDecoder) decodeFilePart(p map[string]any) (string, string, error) {
	file, _ := p["file"].(map[string]any)
	if file == nil {
		file = p
	}
	if id := str(file["file_id"]); id != "" && str(file["file_data"]) == "" && str(file["data"]) == "" {
		return "", "", errors.New("file_id is not supported; send file_data as a data URL or base64")
	}
	name := str(file["filename"])
	if name == "" {
		name = str(file["name"])
	}
	raw := str(file["file_data"])
	if raw == "" {
		raw = str(file["data"])
	}
	if raw == "" {
		return "", "", errors.New("file part is missing file_data")
	}
	mime, payload, err := splitData(raw)
	if err != nil {
		return "", "", err
	}
	if mime == "" {
		mime = mimeFromName(name)
	}
	if strings.HasPrefix(mime, "image/") {
		img, err := d.decodeImageRef(raw)
		return "", img, err
	}
	if isTextMIME(mime, name) {
		decoded, err := base64.StdEncoding.DecodeString(payload)
		if err != nil {
			decoded, err = base64.RawStdEncoding.DecodeString(payload)
		}
		if err != nil {
			return "", "", fmt.Errorf("invalid file_data: %w", err)
		}
		if !utf8.Valid(decoded) {
			return "", "", errors.New("only UTF-8 text files are supported")
		}
		label := name
		if label == "" {
			label = "file"
		}
		return fmt.Sprintf("Attached file (%s):\n%s", label, string(decoded)), "", nil
	}
	return "", "", fmt.Errorf("unsupported file type %q; send images (jpeg/png/webp/gif) or UTF-8 text", mime)
}

func (d *mediaDecoder) decodeImageRef(ref string) (string, error) {
	if err := d.ctx.Err(); err != nil {
		return "", err
	}
	if d.images >= maxImages {
		return "", errors.New("a request may contain at most 32 images")
	}
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return "", errors.New("empty image")
	}
	var data []byte
	var err error
	if strings.HasPrefix(ref, "http://") || strings.HasPrefix(ref, "https://") {
		data, err = fetchImage(d.ctx, ref)
	} else {
		var payload string
		_, payload, err = splitData(ref)
		if err == nil {
			data, err = base64.StdEncoding.DecodeString(payload)
			if err != nil {
				data, err = base64.RawStdEncoding.DecodeString(payload)
			}
		}
	}
	if err != nil {
		return "", err
	}
	if err := validateImage(data); err != nil {
		return "", err
	}
	if d.bytes+len(data) > maxImageBytes {
		return "", errors.New("combined images exceed 32 MiB")
	}
	d.images++
	d.bytes += len(data)
	return base64.StdEncoding.EncodeToString(data), nil
}

func splitData(raw string) (mime, payload string, err error) {
	raw = strings.TrimSpace(raw)
	if len(raw) > base64.StdEncoding.EncodedLen(maxInlineBytes)+1024 {
		return "", "", errors.New("attachment exceeds 8 MiB")
	}
	if strings.HasPrefix(raw, "data:") {
		header, data, ok := strings.Cut(raw, ",")
		if !ok {
			return "", "", errors.New("invalid data URL")
		}
		meta := strings.TrimPrefix(header, "data:")
		mime, _, _ = strings.Cut(meta, ";")
		payload = strings.Map(func(r rune) rune {
			if r == '\n' || r == '\r' || r == ' ' {
				return -1
			}
			return r
		}, data)
		if _, err := base64.StdEncoding.DecodeString(payload); err != nil {
			if _, err2 := base64.RawStdEncoding.DecodeString(payload); err2 != nil {
				return "", "", errors.New("invalid base64 image")
			}
		}
		return mime, payload, nil
	}
	payload = strings.Map(func(r rune) rune {
		if r == '\n' || r == '\r' || r == ' ' {
			return -1
		}
		return r
	}, raw)
	if _, err := base64.StdEncoding.DecodeString(payload); err != nil {
		if _, err2 := base64.RawStdEncoding.DecodeString(payload); err2 != nil {
			return "", "", errors.New("invalid base64 image")
		}
	}
	return "", payload, nil
}

func validateImage(data []byte) error {
	if len(data) > maxInlineBytes {
		return errors.New("image exceeds 8 MiB")
	}
	switch http.DetectContentType(data) {
	case "image/png", "image/jpeg", "image/gif":
		config, _, err := image.DecodeConfig(bytes.NewReader(data))
		if err != nil || config.Width < 1 || config.Height < 1 || config.Width > 40_000 || config.Height > 40_000 || int64(config.Width)*int64(config.Height) > 40_000_000 {
			return errors.New("invalid image or image larger than 40 megapixels")
		}
	case "image/webp":
		width, height, ok := webpSize(data)
		if !ok || width*height > 40_000_000 {
			return errors.New("invalid WebP image")
		}
	default:
		return errors.New("image must contain PNG, JPEG, WebP or GIF data")
	}
	return nil
}

func webpSize(data []byte) (uint64, uint64, bool) {
	if len(data) < 20 || uint64(binary.LittleEndian.Uint32(data[4:8]))+8 != uint64(len(data)) {
		return 0, 0, false
	}
	size := uint64(binary.LittleEndian.Uint32(data[16:20]))
	if size > uint64(len(data)-20) {
		return 0, 0, false
	}
	switch string(data[12:16]) {
	case "VP8 ":
		if size >= 10 && data[20]&1 == 0 && bytes.Equal(data[23:26], []byte{0x9d, 0x01, 0x2a}) {
			width := uint64(binary.LittleEndian.Uint16(data[26:28]) & 0x3fff)
			height := uint64(binary.LittleEndian.Uint16(data[28:30]) & 0x3fff)
			return width, height, width > 0 && height > 0
		}
	case "VP8L":
		if size >= 5 && data[20] == 0x2f {
			bits := binary.LittleEndian.Uint32(data[21:25])
			return uint64(bits&0x3fff) + 1, uint64((bits>>14)&0x3fff) + 1, bits>>29 == 0
		}
	case "VP8X":
		if size == 10 {
			width := uint64(data[24]) | uint64(data[25])<<8 | uint64(data[26])<<16
			height := uint64(data[27]) | uint64(data[28])<<8 | uint64(data[29])<<16
			return width + 1, height + 1, true
		}
	}
	return 0, 0, false
}

func openaiParts(text string, images []string) []any {
	parts := make([]any, 0, 1+len(images))
	if strings.TrimSpace(text) != "" {
		parts = append(parts, map[string]any{"type": "text", "text": text})
	}
	for _, img := range images {
		parts = append(parts, map[string]any{
			"type": "image_url",
			"image_url": map[string]any{
				"url": "data:image/jpeg;base64," + img,
			},
		})
	}
	return parts
}

func mimeFromName(name string) string {
	switch strings.ToLower(path.Ext(name)) {
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".webp":
		return "image/webp"
	case ".gif":
		return "image/gif"
	case ".txt", ".md", ".csv", ".json", ".xml", ".html", ".log":
		return "text/plain"
	default:
		return ""
	}
}

func isTextMIME(mime, name string) bool {
	if strings.HasPrefix(mime, "text/") || mime == "application/json" || mime == "application/xml" {
		return true
	}
	switch strings.ToLower(path.Ext(name)) {
	case ".txt", ".md", ".csv", ".json", ".xml", ".html", ".log":
		return true
	}
	return false
}

func str(v any) string {
	s, _ := v.(string)
	return s
}

func copyMap(in map[string]any) map[string]any {
	out := make(map[string]any, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}
