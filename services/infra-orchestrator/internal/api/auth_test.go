package api_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/devops-agentic-ai/infra-orchestrator/internal/api"
)

func TestAuthMiddleware_RejectsMissingToken(t *testing.T) {
	os.Setenv("INFRA_ORCHESTRATOR_API_TOKEN", "test-token-123")
	defer os.Unsetenv("INFRA_ORCHESTRATOR_API_TOKEN")

	router := api.NewRouter()
	srv := httptest.NewServer(router)
	defer srv.Close()

	body, _ := json.Marshal(map[string]string{
		"stack_name": "s", "project_name": "p", "tenant_id": "t",
	})
	resp, err := http.Post(srv.URL+"/api/v1/provision", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}

	var respBody map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&respBody); err != nil {
		t.Fatalf("failed to decode: %v", err)
	}
	if respBody["code"] != "UNAUTHORIZED" {
		t.Errorf("expected UNAUTHORIZED code, got %v", respBody["code"])
	}
}

func TestAuthMiddleware_RejectsBadToken(t *testing.T) {
	os.Setenv("INFRA_ORCHESTRATOR_API_TOKEN", "correct-token")
	defer os.Unsetenv("INFRA_ORCHESTRATOR_API_TOKEN")

	router := api.NewRouter()
	srv := httptest.NewServer(router)
	defer srv.Close()

	body, _ := json.Marshal(map[string]string{
		"stack_name": "s", "project_name": "p", "tenant_id": "t",
	})
	req, _ := http.NewRequest("POST", srv.URL+"/api/v1/provision", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer wrong-token")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}
}

func TestAuthMiddleware_AcceptsValidToken(t *testing.T) {
	os.Setenv("INFRA_ORCHESTRATOR_API_TOKEN", "valid-token-456")
	defer os.Unsetenv("INFRA_ORCHESTRATOR_API_TOKEN")

	router := api.NewRouter()
	srv := httptest.NewServer(router)
	defer srv.Close()

	body, _ := json.Marshal(map[string]string{
		"stack_name": "s", "project_name": "p", "tenant_id": "t",
	})
	req, _ := http.NewRequest("POST", srv.URL+"/api/v1/provision", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer valid-token-456")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		t.Error("expected non-401 status with valid token")
	}
}

func TestAuthMiddleware_AllowsWhenNoTokenSet(t *testing.T) {
	os.Unsetenv("INFRA_ORCHESTRATOR_API_TOKEN")

	router := api.NewRouter()
	srv := httptest.NewServer(router)
	defer srv.Close()

	body, _ := json.Marshal(map[string]string{
		"stack_name": "s", "project_name": "p", "tenant_id": "t",
	})
	resp, err := http.Post(srv.URL+"/api/v1/provision", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		t.Error("expected non-401 when no token configured")
	}
}

func TestAuthMiddleware_DestroyRequiresToken(t *testing.T) {
	os.Setenv("INFRA_ORCHESTRATOR_API_TOKEN", "destroy-test-token")
	defer os.Unsetenv("INFRA_ORCHESTRATOR_API_TOKEN")

	router := api.NewRouter()
	srv := httptest.NewServer(router)
	defer srv.Close()

	t.Run("missing token", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{
			"stack_name": "s", "project_name": "p",
		})
		resp, err := http.Post(srv.URL+"/api/v1/destroy", "application/json", bytes.NewReader(body))
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("expected 401, got %d", resp.StatusCode)
		}
	})

	t.Run("valid token passes auth", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{
			"stack_name": "s", "project_name": "p",
		})
		req, _ := http.NewRequest("POST", srv.URL+"/api/v1/destroy", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer destroy-test-token")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode == http.StatusUnauthorized {
			t.Error("expected non-401 with valid token on destroy")
		}
	})
}

func TestAuthMiddleware_HealthEndpointBypassesAuth(t *testing.T) {
	os.Setenv("INFRA_ORCHESTRATOR_API_TOKEN", "health-test-token")
	defer os.Unsetenv("INFRA_ORCHESTRATOR_API_TOKEN")

	router := api.NewRouter()
	srv := httptest.NewServer(router)
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/health")
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200 on /health, got %d", resp.StatusCode)
	}
}
