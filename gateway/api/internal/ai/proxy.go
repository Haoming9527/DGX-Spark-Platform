package ai

import (
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
)

func newOllaProxy(ollaURL *url.URL) *httputil.ReverseProxy {
	proxy := httputil.NewSingleHostReverseProxy(ollaURL)
	proxy.FlushInterval = -1
	proxy.ErrorHandler = func(w http.ResponseWriter, _ *http.Request, e error) {
		log.Printf("upstream error: %v", e)
		if sr, ok := w.(*statusRecorder); ok && sr.wroteHeader {
			return
		}
		writeOpenAIError(w, http.StatusBadGateway, "Upstream gateway error.", "server_error", nil)
	}
	originalDirector := proxy.Director
	proxy.Director = func(r *http.Request) {
		originalDirector(r)
		if strings.HasPrefix(r.URL.Path, "/v1/") || r.URL.Path == "/v1" {
			if systemOnePath(r.URL.Path) || requestHasVision(r) {
				r.URL.Path = "/olla/ollama" + r.URL.Path
			} else {
				r.URL.Path = "/olla/proxy" + r.URL.Path
			}
		}
		r.Host = ollaURL.Host
		r.Header.Del("Authorization")
		r.Header.Del("Accept-Encoding")
	}
	return proxy
}
