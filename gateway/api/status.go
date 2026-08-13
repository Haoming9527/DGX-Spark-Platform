package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"
)

type ollaEndpointsPayload struct {
	Endpoints     []ollaEndpoint `json:"endpoints"`
	TotalCount    int            `json:"total_count"`
	HealthyCount  int            `json:"healthy_count"`
	RoutableCount int            `json:"routable_count"`
}

type ollaEndpoint struct {
	Name   string `json:"name"`
	URL    string `json:"url"`
	Type   string `json:"type"`
	Status string `json:"status"`
	Issues string `json:"issues"`
}

type capacityEndpoint struct {
	Name   string `json:"name"`
	Host   string `json:"host"`
	Type   string `json:"type"`
	Status string `json:"status"`
	Issues string `json:"issues,omitempty"`
}

type capacityResponse struct {
	Status        string             `json:"status"`
	CheckedAt     string             `json:"checked_at"`
	EndpointsUp   string             `json:"endpoints_up"`
	TotalCount    int                `json:"total_count"`
	HealthyCount  int                `json:"healthy_count"`
	RoutableCount int                `json:"routable_count"`
	Endpoints     []capacityEndpoint `json:"endpoints"`
}

func writeCapacityStatus(w http.ResponseWriter, ollaBase *url.URL) {
	checkedAt := time.Now().UTC().Format(time.RFC3339)
	client := &http.Client{Timeout: 5 * time.Second}
	reqURL := ollaBase.ResolveReference(&url.URL{Path: "/internal/status/endpoints"})
	res, err := client.Get(reqURL.String())
	if err != nil {
		writeJSON(w, http.StatusOK, capacityResponse{
			Status:      "sleeping",
			CheckedAt:   checkedAt,
			EndpointsUp: "0/0",
			Endpoints:   []capacityEndpoint{},
		})
		return
	}
	defer res.Body.Close()

	var payload ollaEndpointsPayload
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		writeJSON(w, http.StatusOK, capacityResponse{
			Status:      "sleeping",
			CheckedAt:   checkedAt,
			EndpointsUp: "0/0",
			Endpoints:   []capacityEndpoint{},
		})
		return
	}

	status := "ready"
	switch {
	case payload.TotalCount == 0 || payload.RoutableCount == 0:
		status = "sleeping"
	case payload.RoutableCount < payload.TotalCount:
		status = "degraded"
	}

	endpoints := make([]capacityEndpoint, 0, len(payload.Endpoints))
	for _, ep := range payload.Endpoints {
		endpoints = append(endpoints, capacityEndpoint{
			Name:   ep.Name,
			Host:   ep.Name,
			Type:   ep.Type,
			Status: ep.Status,
			Issues: ep.Issues,
		})
	}

	writeJSON(w, http.StatusOK, capacityResponse{
		Status:        status,
		CheckedAt:     checkedAt,
		EndpointsUp:   fmt.Sprintf("%d/%d", payload.RoutableCount, payload.TotalCount),
		TotalCount:    payload.TotalCount,
		HealthyCount:  payload.HealthyCount,
		RoutableCount: payload.RoutableCount,
		Endpoints:     endpoints,
	})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}
