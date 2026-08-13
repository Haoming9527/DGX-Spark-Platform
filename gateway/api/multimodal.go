package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"
	"unicode/utf8"
)

const maxInlineBytes = 8 << 20

var errUnsupportedPart = errors.New("unsupported content part")

var mediaHTTPClient = &http.Client{Timeout: 20 * time.Second}

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
	normalized, sawVision, err := normalizeMessages(msgs, native)
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

func normalizeMessages(msgs []any, native bool) ([]any, bool, error) {
	out := make([]any, 0, len(msgs))
	sawVision := false
	for _, raw := range msgs {
		m, ok := raw.(map[string]any)
		if !ok {
			out = append(out, raw)
			continue
		}
		nm := copyMap(m)
		text, images, changed, err := extractMedia(nm["content"])
		if err != nil {
			return nil, false, err
		}
		if extra, ok := existingImages(nm["images"]); ok {
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

func existingImages(v any) ([]string, bool) {
	arr, ok := v.([]any)
	if !ok {
		return nil, false
	}
	out := make([]string, 0, len(arr))
	for _, item := range arr {
		s, ok := item.(string)
		if !ok || strings.TrimSpace(s) == "" {
			continue
		}
		b64, err := decodeImageRef(s)
		if err != nil {
			continue
		}
		out = append(out, b64)
	}
	return out, len(out) > 0
}

func extractMedia(content any) (text string, images []string, changed bool, err error) {
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
				b64, e := decodeImageRef(ref)
				if e != nil {
					return "", nil, false, e
				}
				images = append(images, b64)
			case "file", "input_file":
				fileText, img, e := decodeFilePart(p)
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

func decodeFilePart(p map[string]any) (string, string, error) {
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
		return "", payload, nil
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

func decodeImageRef(ref string) (string, error) {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return "", errors.New("empty image")
	}
	if strings.HasPrefix(ref, "http://") || strings.HasPrefix(ref, "https://") {
		return fetchImage(ref)
	}
	_, payload, err := splitData(ref)
	return payload, err
}

func splitData(raw string) (mime, payload string, err error) {
	raw = strings.TrimSpace(raw)
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

func fetchImage(rawURL string) (string, error) {
	u, err := url.Parse(rawURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return "", errors.New("image URL must be http or https")
	}
	req, err := http.NewRequest(http.MethodGet, u.String(), nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "dgx-spark-gateway/1")
	res, err := mediaHTTPClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("fetch image: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return "", fmt.Errorf("fetch image: HTTP %d", res.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, maxInlineBytes+1))
	if err != nil {
		return "", err
	}
	if len(data) > maxInlineBytes {
		return "", fmt.Errorf("image larger than %d bytes", maxInlineBytes)
	}
	return base64.StdEncoding.EncodeToString(data), nil
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
