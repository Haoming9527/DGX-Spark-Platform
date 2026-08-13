package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
)

func prepareStructuredOutput(r *http.Request) (*http.Request, error) {
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

	native := isOllamaNativeChat(r.URL.Path)
	changed, err := normalizeStructuredOutput(payload, native)
	if err != nil {
		r.Body = io.NopCloser(bytes.NewReader(body))
		r.ContentLength = int64(len(body))
		return r, err
	}
	if !changed {
		r.Body = io.NopCloser(bytes.NewReader(body))
		r.ContentLength = int64(len(body))
		return r, nil
	}

	out, err := json.Marshal(payload)
	if err != nil {
		r.Body = io.NopCloser(bytes.NewReader(body))
		r.ContentLength = int64(len(body))
		return r, err
	}
	r.Body = io.NopCloser(bytes.NewReader(out))
	r.ContentLength = int64(len(out))
	r.Header.Set("Content-Length", strconv.Itoa(len(out)))
	return r, nil
}

func normalizeStructuredOutput(payload map[string]any, native bool) (bool, error) {
	if _, hasFormat := payload["format"]; hasFormat && payload["response_format"] == nil {
		return false, nil
	}

	rf, ok := payload["response_format"]
	if !ok || rf == nil {
		return false, nil
	}

	switch v := rf.(type) {
	case string:
		typ := strings.ToLower(strings.TrimSpace(v))
		if typ == "" {
			return false, nil
		}
		if typ == "json" || typ == "json_object" {
			if native {
				payload["format"] = "json"
				delete(payload, "response_format")
			} else {
				payload["response_format"] = map[string]any{"type": "json_object"}
			}
			return true, nil
		}
		return false, fmt.Errorf("unsupported response_format %q", v)

	case map[string]any:
		typ := strings.ToLower(strings.TrimSpace(str(v["type"])))
		switch typ {
		case "", "text":
			delete(payload, "response_format")
			return true, nil
		case "json", "json_object":
			if native {
				payload["format"] = "json"
				delete(payload, "response_format")
			} else {
				payload["response_format"] = map[string]any{"type": "json_object"}
			}
			return true, nil
		case "json_schema":
			schema, err := extractJSONSchema(v)
			if err != nil {
				return false, err
			}
			if native {
				payload["format"] = schema
				delete(payload, "response_format")
			} else {
				payload["response_format"] = map[string]any{
					"type": "json_schema",
					"json_schema": map[string]any{
						"name":   firstNonEmpty(str(mapGet(v, "json_schema", "name")), "response"),
						"schema": schema,
						"strict": true,
					},
				}
				payload["format"] = schema
			}
			return true, nil
		default:
			return false, fmt.Errorf("unsupported response_format.type %q", typ)
		}

	default:
		return false, fmt.Errorf("invalid response_format")
	}
}

func extractJSONSchema(rf map[string]any) (any, error) {
	if schema, ok := rf["schema"]; ok && schema != nil {
		return schema, nil
	}
	js, ok := rf["json_schema"].(map[string]any)
	if !ok || js == nil {
		return nil, fmt.Errorf("response_format.json_schema is required when type is json_schema")
	}
	if schema, ok := js["schema"]; ok && schema != nil {
		return schema, nil
	}
	return nil, fmt.Errorf("response_format.json_schema.schema is required")
}

func mapGet(m map[string]any, keys ...string) any {
	cur := any(m)
	for _, key := range keys {
		obj, ok := cur.(map[string]any)
		if !ok {
			return nil
		}
		cur = obj[key]
	}
	return cur
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}
