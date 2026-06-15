package config_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/devops-agentic-ai/infra-orchestrator/internal/config"
)

func TestReadPostgresOutputs_FileNotFound(t *testing.T) {
	_, err := config.ReadPostgresOutputs("/nonexistent/path.json")
	if err == nil {
		t.Fatal("expected error for nonexistent file")
	}
}

func TestReadPostgresOutputs_InvalidJSON(t *testing.T) {
	tmpDir := t.TempDir()
	path := filepath.Join(tmpDir, "outputs.json")
	if err := os.WriteFile(path, []byte("not json"), 0644); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}

	_, err := config.ReadPostgresOutputs(path)
	if err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}

func TestReadPostgresOutputs_Valid(t *testing.T) {
	tmpDir := t.TempDir()
	path := filepath.Join(tmpDir, "outputs.json")
	input := `{
		"provider": "local",
		"host": "localhost",
		"port": 5432,
		"db_name": "testdb",
		"master_username": "admin",
		"master_password": "secret",
		"connection_string": "postgresql://admin:***@localhost:5432/testdb?sslmode=disable",
		"arn": "",
		"endpoint": "localhost:5432"
	}`

	if err := os.WriteFile(path, []byte(input), 0644); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}

	cfg, err := config.ReadPostgresOutputs(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.Provider != "local" {
		t.Errorf("expected provider 'local', got %q", cfg.Provider)
	}
	if cfg.Host != "localhost" {
		t.Errorf("expected host 'localhost', got %q", cfg.Host)
	}
	if cfg.Port != 5432 {
		t.Errorf("expected port 5432, got %d", cfg.Port)
	}
	if cfg.DBName != "testdb" {
		t.Errorf("expected db_name 'testdb', got %q", cfg.DBName)
	}
	if cfg.Endpoint != "localhost:5432" {
		t.Errorf("expected endpoint 'localhost:5432', got %q", cfg.Endpoint)
	}
}

func TestWriteBackendConfigs(t *testing.T) {
	tmpDir := t.TempDir()
	path := filepath.Join(tmpDir, "backend.json")

	cfg := &config.BackendConfigs{
		Postgres: config.PostgresConfig{
			Provider:         "local",
			Host:             "localhost",
			Port:             5432,
			DBName:           "devops_agentic",
			MasterUsername:   "devops_ai",
			MasterPassword:   "securetestpass456",
			ConnectionString: "postgresql://devops_ai:***@localhost:5432/devops_agentic?sslmode=disable",
			Endpoint:         "localhost:5432",
		},
		AgentRuntimeURL: "http://agent-runtime:8000",
		APIGatewayURL:   "http://api-gateway:3000",
	}

	if err := config.WriteBackendConfigs(cfg, path); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Fatal("expected config file to be created")
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("failed to read back config: %v", err)
	}

	var readCfg config.BackendConfigs
	if err := json.Unmarshal(data, &readCfg); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	if readCfg.Postgres.Endpoint != "localhost:5432" {
		t.Errorf("expected endpoint 'localhost:5432', got %q", readCfg.Postgres.Endpoint)
	}
	if readCfg.AgentRuntimeURL != "http://agent-runtime:8000" {
		t.Errorf("expected agent_runtime_url 'http://agent-runtime:8000', got %q", readCfg.AgentRuntimeURL)
	}
	if readCfg.APIGatewayURL != "http://api-gateway:3000" {
		t.Errorf("expected api_gateway_url 'http://api-gateway:3000', got %q", readCfg.APIGatewayURL)
	}
}

func TestPostgresOutputsToEnv(t *testing.T) {
	cfg := config.PostgresConfig{
		Host:             "myhost",
		Port:             6432,
		DBName:           "mydb",
		MasterUsername:   "myuser",
		MasterPassword:   "mypass",
		ConnectionString: "postgresql://myuser:***@myhost:6432/mydb?sslmode=disable",
	}

	env := config.PostgresOutputsToEnv(&cfg)

	if len(env) == 0 {
		t.Fatal("expected non-empty env output")
	}
}
