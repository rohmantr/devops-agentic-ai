package pulumi

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"github.com/pulumi/pulumi/sdk/v3/go/auto"
	"github.com/pulumi/pulumi/sdk/v3/go/auto/optup"
	"github.com/pulumi/pulumi/sdk/v3/go/common/tokens"
)

type ProvisionRequest struct {
	StackName    string            `json:"stack_name"`
	ProjectName  string            `json:"project_name"`
	ResourceType string            `json:"resource_type"`
	Config       map[string]string `json:"config"`
	TenantID     string            `json:"tenant_id"`
}

type ProvisionResult struct {
	StackName string            `json:"stack_name"`
	Outputs   map[string]string `json:"outputs"`
	StdOut    string            `json:"stdout"`
}

type DestroyRequest struct {
	StackName   string `json:"stack_name"`
	ProjectName string `json:"project_name"`
}

func Provision(ctx context.Context, req ProvisionRequest) (*ProvisionResult, error) {
	projectName := tokens.QName(req.ProjectName)
	stackName := tokens.QName(req.StackName)

	workDir := filepath.Join(os.TempDir(), "pulumi", req.TenantID, req.StackName)
	if err := os.MkdirAll(workDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create work dir: %w", err)
	}

	prog := getProgram(req.ResourceType, req.Config)

	s, err := auto.UpsertStackInlineSource(ctx, string(stackName), string(projectName), prog, auto.WorkDir(workDir))
	if err != nil {
		return nil, fmt.Errorf("failed to create stack: %w", err)
	}

	pulumiConfig := make(auto.ConfigMap)
	for k, v := range req.Config {
		pulumiConfig[k] = auto.ConfigValue{Value: v}
	}
	if err := s.SetAllConfig(ctx, pulumiConfig); err != nil {
		return nil, fmt.Errorf("failed to set config: %w", err)
	}

	res, err := s.Up(ctx, optup.ProgressStreams(os.Stdout))
	if err != nil {
		return nil, fmt.Errorf("failed to run pulumi up: %w", err)
	}

	outputs := make(map[string]string)
	for k, v := range res.Outputs {
		if v.Value != nil {
			if str, ok := v.Value.(string); ok {
				outputs[k] = str
			} else {
				outputs[k] = fmt.Sprintf("%v", v.Value)
			}
		}
	}

	return &ProvisionResult{
		StackName: req.StackName,
		Outputs:   outputs,
		StdOut:    res.StdOut,
	}, nil
}

func Destroy(ctx context.Context, req DestroyRequest) error {
	projectName := tokens.QName(req.ProjectName)
	stackName := tokens.QName(req.StackName)

	workDir := filepath.Join(os.TempDir(), "pulumi", "system", req.StackName)

	s, err := auto.SelectStackInlineSource(ctx, string(stackName), string(projectName), nil, auto.WorkDir(workDir))
	if err != nil {
		return fmt.Errorf("failed to select stack: %w", err)
	}

	_, err = s.Destroy(ctx)
	if err != nil {
		return fmt.Errorf("failed to destroy stack: %w", err)
	}

	return nil
}
