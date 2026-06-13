package api_test

import (
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "testing"

    "github.com/devops-agentic-ai/infra-orchestrator/internal/api"
)

func TestHealthHandler_StatusCode(t *testing.T) {
    req := httptest.NewRequest(http.MethodGet, "/health", nil)
    w := httptest.NewRecorder()

    api.HealthHandler(w, req)

    if w.Code != http.StatusOK {
        t.Fatalf("expected status 200, got %d", w.Code)
    }
}

func TestHealthHandler_ContentType(t *testing.T) {
    req := httptest.NewRequest(http.MethodGet, "/health", nil)
    w := httptest.NewRecorder()

    api.HealthHandler(w, req)

    ct := w.Header().Get("Content-Type")
    if ct != "application/json" {
        t.Fatalf("expected Content-Type application/json, got %q", ct)
    }
}

func TestHealthHandler_ResponseBody(t *testing.T) {
    req := httptest.NewRequest(http.MethodGet, "/health", nil)
    w := httptest.NewRecorder()

    api.HealthHandler(w, req)

    var resp api.HealthResponse
    if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
        t.Fatalf("failed to decode response body: %v", err)
    }

    if resp.Status != "healthy" {
        t.Errorf("expected status 'healthy', got %q", resp.Status)
    }

    if resp.Service != "infra-orchestrator" {
        t.Errorf("expected service 'infra-orchestrator', got %q", resp.Service)
    }
}

func TestRouter_HealthEndpoint(t *testing.T) {
    router := api.NewRouter()
    srv := httptest.NewServer(router)
    defer srv.Close()

    resp, err := http.Get(srv.URL + "/health")
    if err != nil {
        t.Fatalf("request failed: %v", err)
    }
    defer resp.Body.Close()

    if resp.StatusCode != http.StatusOK {
        t.Fatalf("expected 200, got %d", resp.StatusCode)
    }

    var body api.HealthResponse
    if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
        t.Fatalf("failed to decode: %v", err)
    }

    if body.Status != "healthy" || body.Service != "infra-orchestrator" {
        t.Errorf("unexpected body: %+v", body)
    }
}

func TestRouter_NotFound(t *testing.T) {
    router := api.NewRouter()
    srv := httptest.NewServer(router)
    defer srv.Close()

    resp, err := http.Get(srv.URL + "/nonexistent")
    if err != nil {
        t.Fatalf("request failed: %v", err)
    }
    defer resp.Body.Close()

    if resp.StatusCode != http.StatusNotFound {
        t.Fatalf("expected 404, got %d", resp.StatusCode)
    }
}
