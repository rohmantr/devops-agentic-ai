package api

import (
	"encoding/json"
	"net/http"

	"github.com/devops-agentic-ai/infra-orchestrator/internal/pulumi"
)

type ProvisionRequest struct {
	StackName    string            `json:"stack_name"`
	ProjectName  string            `json:"project_name"`
	ResourceType string            `json:"resource_type"`
	Config       map[string]string `json:"config"`
	TenantID     string            `json:"tenant_id"`
}

type DestroyRequest struct {
	StackName   string `json:"stack_name"`
	ProjectName string `json:"project_name"`
}

type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func ProvisionHandler(w http.ResponseWriter, r *http.Request) {
	var req ProvisionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(APIError{
			Code:    "INVALID_REQUEST",
			Message: "failed to parse request body",
		})
		return
	}

	if req.StackName == "" || req.ProjectName == "" || req.TenantID == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnprocessableEntity)
		json.NewEncoder(w).Encode(APIError{
			Code:    "VALIDATION_FAILED",
			Message: "stack_name, project_name, and tenant_id are required",
		})
		return
	}

	if req.ResourceType == "" {
		req.ResourceType = "postgres"
	}

	pulumiReq := pulumi.ProvisionRequest{
		StackName:    req.StackName,
		ProjectName:  req.ProjectName,
		ResourceType: req.ResourceType,
		Config:       req.Config,
		TenantID:     req.TenantID,
	}

	result, err := pulumi.Provision(r.Context(), pulumiReq)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(APIError{
			Code:    "PROVISION_FAILED",
			Message: err.Error(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(result)
}

func DestroyHandler(w http.ResponseWriter, r *http.Request) {
	var req DestroyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(APIError{
			Code:    "INVALID_REQUEST",
			Message: "failed to parse request body",
		})
		return
	}

	if req.StackName == "" || req.ProjectName == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnprocessableEntity)
		json.NewEncoder(w).Encode(APIError{
			Code:    "VALIDATION_FAILED",
			Message: "stack_name and project_name are required",
		})
		return
	}

	pulumiReq := pulumi.DestroyRequest{
		StackName:   req.StackName,
		ProjectName: req.ProjectName,
	}

	if err := pulumi.Destroy(r.Context(), pulumiReq); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(APIError{
			Code:    "DESTROY_FAILED",
			Message: err.Error(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "destroyed"})
}
