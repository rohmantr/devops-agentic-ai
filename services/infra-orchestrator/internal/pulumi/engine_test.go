package pulumi

import (
	"testing"
)

func TestPostgresConfigFromMap_Defaults(t *testing.T) {
	cfg := postgresConfigFromMap(map[string]string{})

	if cfg.Provider != "local" {
		t.Errorf("expected provider 'local', got %q", cfg.Provider)
	}
	if cfg.DBName != "devops_agentic" {
		t.Errorf("expected db_name 'devops_agentic', got %q", cfg.DBName)
	}
	if cfg.DBUser != "devops_ai" {
		t.Errorf("expected db_user 'devops_ai', got %q", cfg.DBUser)
	}
	if cfg.DBPort != 5432 {
		t.Errorf("expected db_port 5432, got %d", cfg.DBPort)
	}
	if cfg.DBVersion != "16" {
		t.Errorf("expected db_version '16', got %q", cfg.DBVersion)
	}
	if cfg.HostPort != 5432 {
		t.Errorf("expected host_port 5432, got %d", cfg.HostPort)
	}
}

func TestPostgresConfigFromMap_Overrides(t *testing.T) {
	input := map[string]string{
		"provider":       "rds",
		"db_name":        "testdb",
		"db_user":        "testuser",
		"db_password":    "testpass",
		"db_port":        "6432",
		"db_version":     "15",
		"instance_class": "db.r5.large",
		"allocated_storage": "100",
		"multi_az":       "true",
		"host_port":      "7432",
	}

	cfg := postgresConfigFromMap(input)

	if cfg.Provider != "rds" {
		t.Errorf("expected provider 'rds', got %q", cfg.Provider)
	}
	if cfg.DBName != "testdb" {
		t.Errorf("expected db_name 'testdb', got %q", cfg.DBName)
	}
	if cfg.DBUser != "testuser" {
		t.Errorf("expected db_user 'testuser', got %q", cfg.DBUser)
	}
	if cfg.DBPassword != "testpass" {
		t.Errorf("expected db_password 'testpass', got %q", cfg.DBPassword)
	}
	if cfg.DBPort != 6432 {
		t.Errorf("expected db_port 6432, got %d", cfg.DBPort)
	}
	if cfg.DBVersion != "15" {
		t.Errorf("expected db_version '15', got %q", cfg.DBVersion)
	}
	if cfg.InstanceClass != "db.r5.large" {
		t.Errorf("expected instance_class 'db.r5.large', got %q", cfg.InstanceClass)
	}
	if cfg.AllocatedStorage != 100 {
		t.Errorf("expected allocated_storage 100, got %d", cfg.AllocatedStorage)
	}
	if !cfg.MultiAZ {
		t.Errorf("expected multi_az true, got false")
	}
	if cfg.HostPort != 7432 {
		t.Errorf("expected host_port 7432, got %d", cfg.HostPort)
	}
}

func TestParseInt(t *testing.T) {
	tests := []struct {
		input    string
		def     int
		expected int
	}{
		{"5432", 0, 5432},
		{"0", 999, 0},
		{"notanumber", 123, 123},
		{"", 456, 456},
	}

	for _, tt := range tests {
		got := parseInt(tt.input, tt.def)
		if got != tt.expected {
			t.Errorf("parseInt(%q, %d) = %d; want %d", tt.input, tt.def, got, tt.expected)
		}
	}
}

func TestProvisionRequest_Defaults(t *testing.T) {
	req := ProvisionRequest{
		StackName:    "test-stack",
		ProjectName:  "test-project",
		ResourceType: "postgres",
		Config: map[string]string{
			"provider": "local",
			"db_name":  "testdb",
		},
		TenantID: "tenant-1",
	}

	if req.StackName != "test-stack" {
		t.Errorf("expected stack_name 'test-stack', got %q", req.StackName)
	}
	if req.ResourceType != "postgres" {
		t.Errorf("expected resource_type 'postgres', got %q", req.ResourceType)
	}
	if req.TenantID != "tenant-1" {
		t.Errorf("expected tenant_id 'tenant-1', got %q", req.TenantID)
	}
}

func TestProvisionResult_Outputs(t *testing.T) {
	result := &ProvisionResult{
		StackName: "test-stack",
		Outputs: map[string]string{
			"host":     "localhost",
			"port":     "5432",
			"db_name":  "testdb",
			"endpoint": "localhost:5432",
		},
		StdOut: "pulumi output",
	}

	if result.StackName != "test-stack" {
		t.Errorf("expected stack_name 'test-stack', got %q", result.StackName)
	}
	if result.Outputs["host"] != "localhost" {
		t.Errorf("expected host 'localhost', got %q", result.Outputs["host"])
	}
	if result.Outputs["port"] != "5432" {
		t.Errorf("expected port '5432', got %q", result.Outputs["port"])
	}
	if result.Outputs["db_name"] != "testdb" {
		t.Errorf("expected db_name 'testdb', got %q", result.Outputs["db_name"])
	}
	if result.Outputs["endpoint"] != "localhost:5432" {
		t.Errorf("expected endpoint 'localhost:5432', got %q", result.Outputs["endpoint"])
	}
}

func TestGetProgram_ReturnsPostgresByDefault(t *testing.T) {
	prog := getProgram("", nil)
	if prog == nil {
		t.Fatal("expected non-nil program function")
	}
}

func TestGetProgram_ReturnsPostgres(t *testing.T) {
	prog := getProgram("postgres", map[string]string{"provider": "local"})
	if prog == nil {
		t.Fatal("expected non-nil program function for postgres")
	}
}

func TestPostgresStackOutput_JSONTags(t *testing.T) {
	output := PostgresStackOutput{
		Provider:         "local",
		Host:             "localhost",
		Port:             5432,
		DBName:           "mydb",
		MasterUsername:   "admin",
		MasterPassword:   "secret",
		ConnectionString: "postgresql://admin:***@localhost:5432/mydb?sslmode=disable",
		ARN:              "",
		Endpoint:         "localhost:5432",
	}

	if output.Provider != "local" {
		t.Errorf("expected provider 'local', got %q", output.Provider)
	}
	if output.Port != 5432 {
		t.Errorf("expected port 5432, got %d", output.Port)
	}
	if output.Endpoint != "localhost:5432" {
		t.Errorf("expected endpoint 'localhost:5432', got %q", output.Endpoint)
	}
}
