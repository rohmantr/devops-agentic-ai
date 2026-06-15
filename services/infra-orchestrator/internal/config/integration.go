package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

type PostgresConfig struct {
	Provider         string `json:"provider"`
	Host             string `json:"host"`
	Port             int    `json:"port"`
	DBName           string `json:"db_name"`
	MasterUsername   string `json:"master_username"`
	MasterPassword   string `json:"master_password"`
	ConnectionString string `json:"connection_string"`
	Endpoint         string `json:"endpoint"`
}

type BackendConfigs struct {
	Postgres PostgresConfig `json:"postgres"`
	AgentRuntimeURL string `json:"agent_runtime_url,omitempty"`
	APIGatewayURL   string `json:"api_gateway_url,omitempty"`
}

func ReadPostgresOutputs(path string) (*PostgresConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read outputs file: %w", err)
	}

	var cfg PostgresConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse outputs: %w", err)
	}

	return &cfg, nil
}

func WriteBackendConfigs(cfg *BackendConfigs, outputPath string) error {
	dir := filepath.Dir(outputPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create output dir: %w", err)
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	if err := os.WriteFile(outputPath, data, 0600); err != nil {
		return fmt.Errorf("failed to write config file: %w", err)
	}

	return nil
}

func PostgresOutputsToEnv(cfg *PostgresConfig) string {
	return fmt.Sprintf(`DATABASE_URL=%s
DATABASE_HOST=%s
DATABASE_PORT=%d
DATABASE_NAME=%s
DATABASE_USER=%s
DATABASE_PASSWORD=%s
`, cfg.ConnectionString, cfg.Host, cfg.Port, cfg.DBName, cfg.MasterUsername, cfg.MasterPassword)
}
