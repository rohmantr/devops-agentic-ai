package api

import (
    "encoding/json"
    "net/http"
)

type HealthResponse struct {
    Status  string `json:"status"`
    Service string `json:"service"`
}

func HealthHandler(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusOK)

    resp := HealthResponse{
        Status:  "healthy",
        Service: "infra-orchestrator",
    }

    json.NewEncoder(w).Encode(resp)
}
