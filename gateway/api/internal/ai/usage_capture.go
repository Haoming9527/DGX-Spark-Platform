package ai

import (
	"bytes"
	"encoding/json"
	"math"
	"strings"
)

type tokenUsage struct {
	Prompt     int64
	Completion int64
	Total      int64
}

const maxUsageFrame = 8 << 20

type usageCapture struct {
	tokens   tokenUsage
	buffer   []byte
	event    []byte
	format   string
	dropping bool
	badEvent bool
}

func (u *usageCapture) write(b []byte, contentType string) {
	if u.format == "" {
		switch {
		case strings.Contains(contentType, "text/event-stream"):
			u.format = "sse"
		case strings.Contains(contentType, "ndjson"), strings.Contains(contentType, "jsonl"):
			u.format = "lines"
		default:
			u.format = "json"
		}
	}
	if u.format == "json" {
		u.append(b)
		return
	}
	for len(b) > 0 {
		i := bytes.IndexByte(b, '\n')
		if i < 0 {
			u.append(b)
			return
		}
		u.append(b[:i])
		if u.dropping {
			u.badEvent = true
		} else {
			u.line(bytes.TrimSuffix(u.buffer, []byte("\r")))
		}
		u.buffer = u.buffer[:0]
		u.dropping = false
		b = b[i+1:]
	}
}

func (u *usageCapture) append(b []byte) {
	if u.dropping {
		return
	}
	if len(b) > maxUsageFrame-len(u.buffer) {
		u.buffer = nil
		u.dropping = true
		return
	}
	u.buffer = append(u.buffer, b...)
}

func (u *usageCapture) line(line []byte) {
	if u.format != "sse" {
		u.parse(line)
		return
	}
	if len(line) == 0 {
		if !u.badEvent {
			u.parse(u.event)
		}
		u.event = u.event[:0]
		u.badEvent = false
	} else if bytes.HasPrefix(line, []byte("data:")) && !u.badEvent {
		data := bytes.TrimPrefix(line[5:], []byte(" "))
		if len(data)+1 > maxUsageFrame-len(u.event) {
			u.event = nil
			u.badEvent = true
			return
		}
		u.event = append(u.event, data...)
		u.event = append(u.event, '\n')
	}
}

func (u *usageCapture) finish() {
	if u.dropping {
		return
	}
	if u.format == "sse" {
		// Only complete SSE events count, including when the client disconnects.
		return
	}
	u.parse(u.buffer)
	u.buffer = nil
}

func (u *usageCapture) parse(raw []byte) {
	var response struct {
		Usage *struct {
			Prompt     int64  `json:"prompt_tokens"`
			Completion int64  `json:"completion_tokens"`
			Total      int64  `json:"total_tokens"`
			Input      *int64 `json:"input_tokens"`
			Output     *int64 `json:"output_tokens"`
		} `json:"usage"`
		Prompt     *int64 `json:"prompt_eval_count"`
		Completion *int64 `json:"eval_count"`
	}
	if json.Unmarshal(raw, &response) != nil {
		return
	}
	var tokens tokenUsage
	if response.Usage != nil {
		tokens = tokenUsage{response.Usage.Prompt, response.Usage.Completion, response.Usage.Total}
		if response.Usage.Input != nil || response.Usage.Output != nil {
			tokens = tokenUsage{}
			if response.Usage.Input != nil {
				tokens.Prompt = *response.Usage.Input
			}
			if response.Usage.Output != nil {
				tokens.Completion = *response.Usage.Output
			}
		}
	} else if response.Prompt != nil || response.Completion != nil {
		if response.Prompt != nil {
			tokens.Prompt = *response.Prompt
		}
		if response.Completion != nil {
			tokens.Completion = *response.Completion
		}
	} else {
		return
	}
	if tokens.Prompt < 0 || tokens.Completion < 0 || tokens.Total < 0 || tokens.Prompt > math.MaxInt64-tokens.Completion {
		return
	}
	if tokens.Total < tokens.Prompt+tokens.Completion {
		tokens.Total = tokens.Prompt + tokens.Completion
	}
	u.tokens = tokens
}
