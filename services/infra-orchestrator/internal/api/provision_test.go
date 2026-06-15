package api_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/devops-agentic-ai/infra-orchestrator/internal/api"
)

func TestProvisionHandler_Validation_MissingFields(t *testing.T) {
	router := api.NewRouter()
	srv := httptest.NewServer(router)
	defer srv.Close()

	tests := []struct {
		name       string
		body       map[string]interface{}
		expectCode int
	}{
		{
			name:       "empty body",
			body:       map[string]interface{}{},
			expectCode: http.StatusUnprocessableEntity,
		},
		{
			name: "missing tenant_id",
			body: map[string]interface{}{
				"stack_name":   "test",
				"project_name": "test",
			},
			expectCode: http.StatusUnprocessableEntity,
		},
		{
			name: "missing stack_name",
			body: map[string]interface{}{
				"project_name": "test",
				"tenant_id":    "t1",
			},
			expectCode: http.StatusUnprocessableEntity,
		},
		{
			name: "missing project_name",
			body: map[string]interface{}{
				"stack_name": "test",
				"tenant_id":  "t1",
			},
			expectCode: http.StatusUnprocessableEntity,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body, _ := json.Marshal(tt.body)
			resp, err := http.Post(srv.URL+"/api/v1/provision", "application/json", bytes.NewReader(body))
			if err != nil {
				t.Fatalf("request failed: %v", err)
			}
			defer resp.Body.Close()

			if resp.StatusCode != tt.expectCode {
				t.Errorf("expected status %d, got %d", tt.expectCode, resp.StatusCode)
			}

			var respBody map[string]interface{}
			if err := json.NewDecoder(resp.Body).Decode(&respBody); err != nil {
				t.Fatalf("failed to decode response: %v", err)
			}
			if respBody["code"] != "VALIDATION_FAILED" {
				t.Errorf("expected error code VALIDATION_FAILED, got %v", respBody["code"])
			}
		})
	}
}

func TestProvisionHandler_InvalidJSON(t *testing.T) {
	router := api.NewRouter()
	srv := httptest.NewServer(router)
	defer srv.Close()

	resp, err := http.Post(srv.URL+"/api/v1/provision", "application/json", bytes.NewReader([]byte("{invalid")))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", resp.StatusCode)
	}

	var respBody map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&respBody); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if respBody["code"] != "INVALID_REQUEST" {
		t.Errorf("expected error code INVALID_REQUEST, got %v", respBody["code"])
	}
}

func TestDestroyHandler_Validation_MissingFields(t *testing.T) {
	router := api.NewRouter()
	srv := httptest.NewServer(router)
	defer srv.Close()

	tests := []struct {
		name       string
		body       map[string]interface{}
		expectCode int
	}{
		{
			name:       "empty body",
			body:       map[string]interface{}{},
			expectCode: http.StatusUnprocessableEntity,
		},
		{
			name: "missing stack_name",
			body: map[string]interface{}{
				"project_name": "test",
			},
			expectCode: http.StatusUnprocessableEntity,
		},
		{
			name: "missing project_name",
			body: map[string]interface{}{
				"stack_name": "test",
			},
			expectCode: http.StatusUnprocessableEntity,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body, _ := json.Marshal(tt.body)
			resp, err := http.Post(srv.URL+"/api/v1/destroy", "application/json", bytes.NewReader(body))
			if err != nil {
				t.Fatalf("request failed: %v", err)
			}
			defer resp.Body.Close()

			if resp.StatusCode != tt.expectCode {
				t.Errorf("expected status %d, got %d", tt.expectCode, resp.StatusCode)
			}

			var respBody map[string]interface{}
			if err := json.NewDecoder(resp.Body).Decode(&respBody); err != nil {
				t.Fatalf("failed to decode response: %v", err)
			}
			if respBody["code"] != "VALIDATION_FAILED" {
				t.Errorf("expected error code VALIDATION_FAILED, got %v", respBody["code"])
			}
		})
	}
}

func TestDestroyHandler_InvalidJSON(t *testing.T) {
	router := api.NewRouter()
	srv := httptest.NewServer(router)
	defer srv.Close()

	resp, err := http.Post(srv.URL+"/api/v1/destroy", "application/json", bytes.NewReader([]byte("{invalid")))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", resp.StatusCode)
	}

	var respBody map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&respBody); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if respBody["code"] != "INVALID_REQUEST" {
		t.Errorf("expected error code INVALID_REQUEST, got %v", respBody["code"])
	}
}

func TestProvisionHandler_DefaultsResourceType(t *testing.T) {
	router := api.NewRouter()
	srv := httptest.NewServer(router)
	defer srv.Close()

	body := map[string]interface{}{
		"stack_name":   "stack1",
		"project_name": "proj1",
		"tenant_id":    "tenant1",
	}
	jsonBody, _ := json.Marshal(body)

	resp, err := http.Post(srv.URL+"/api/v1/provision", "application/json", bytes.NewReader(jsonBody))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		t.Error("expected provision route to be registered, got 404")
	}
}

func TestProvisionAndDestroyRoutes_Registered(t *testing.T) {
	router := api.NewRouter()
	srv := httptest.NewServer(router)
	defer srv.Close()

	routes := []struct {
		method string
		path   string
	}{
		{"POST", "/api/v1/provision"},
		{"POST", "/api/v1/destroy"},
	}

	for _, route := range routes {
		t.Run(route.method+" "+route.path, func(t *testing.T) {
			req := httptest.NewRequest(route.method, route.path, nil)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code == http.StatusNotFound {
				t.Errorf("route %s %s returned 404, expected it to be registered", route.method, route.path)
			}
		})
	}
}

func TestRouter_RootHealth(t *testing.T) {
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

func TestProvisionHandler_ResponseFormat(t *testing.T) {
	router := api.NewRouter()
	w := httptest.NewRecorder()

	body := map[string]interface{}{
		"stack_name":   "stack1",
		"project_name": "proj1",
		"tenant_id":    "tenant1",
	}
	jsonBody, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/provision", bytes.NewReader(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code == http.StatusNotFound {
		t.Error("route not registered")
	}
}
