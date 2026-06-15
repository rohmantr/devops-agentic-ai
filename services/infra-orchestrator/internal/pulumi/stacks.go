package pulumi

import (
	"fmt"

	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"
)

type PostgresStackConfig struct {
	Provider       string
	DBName         string
	DBUser         string
	DBPassword     string
	DBPort         int
	DBVersion      string
	InstanceClass  string
	AllocatedStorage int
	MultiAZ        bool
	DockerImage    string
	DockerContainerName string
	HostPort       int
}

type PostgresStackOutput struct {
	Provider         string `json:"provider"`
	Host             string `json:"host"`
	Port             int    `json:"port"`
	DBName           string `json:"db_name"`
	MasterUsername   string `json:"master_username"`
	MasterPassword   string `json:"master_password"`
	ConnectionString string `json:"connection_string"`
	ARN              string `json:"arn"`
	Endpoint         string `json:"endpoint"`
}

func postgresProgram(configMap map[string]string) pulumi.RunFunc {
	return func(ctx *pulumi.Context) error {
		cfg := postgresConfigFromMap(configMap)

		if cfg.Provider == "rds" {
			return deployPostgresRDS(ctx, cfg)
		}
		return deployPostgresLocal(ctx, cfg)
	}
}

func postgresConfigFromMap(m map[string]string) PostgresStackConfig {
	cfg := PostgresStackConfig{
		Provider:       "local",
		DBName:         "devops_agentic",
		DBUser:         "devops_ai",
		DBPassword:     "",
		DBPort:         5432,
		DBVersion:      "16",
		InstanceClass:  "db.t3.medium",
		AllocatedStorage: 20,
		MultiAZ:        false,
		DockerImage:    "postgres:16-alpine",
		DockerContainerName: "pulumi-postgres-local",
		HostPort:       5432,
	}

	if v, ok := m["provider"]; ok {
		cfg.Provider = v
	}
	if v, ok := m["db_name"]; ok {
		cfg.DBName = v
	}
	if v, ok := m["db_user"]; ok {
		cfg.DBUser = v
	}
	if v, ok := m["db_password"]; ok {
		cfg.DBPassword = v
	}
	if v, ok := m["db_port"]; ok {
		cfg.DBPort = parseInt(v, 5432)
	}
	if v, ok := m["db_version"]; ok {
		cfg.DBVersion = v
	}
	if v, ok := m["instance_class"]; ok {
		cfg.InstanceClass = v
	}
	if v, ok := m["allocated_storage"]; ok {
		cfg.AllocatedStorage = parseInt(v, 20)
	}
	if v, ok := m["multi_az"]; ok {
		cfg.MultiAZ = v == "true"
	}
	if v, ok := m["docker_image"]; ok {
		cfg.DockerImage = v
	}
	if v, ok := m["docker_container_name"]; ok {
		cfg.DockerContainerName = v
	}
	if v, ok := m["host_port"]; ok {
		cfg.HostPort = parseInt(v, 5432)
	}

	return cfg
}

func parseInt(s string, defaultVal int) int {
	var n int
	_, err := fmt.Sscanf(s, "%d", &n)
	if err != nil {
		return defaultVal
	}
	return n
}

func deployPostgresRDS(ctx *pulumi.Context, cfg PostgresStackConfig) error {
	ctx.Export("provider", pulumi.String("rds"))
	ctx.Export("host", pulumi.String(cfg.DBUser+".rds.amazonaws.com"))
	ctx.Export("port", pulumi.Int(cfg.DBPort))
	ctx.Export("db_name", pulumi.String(cfg.DBName))
	ctx.Export("master_username", pulumi.String(cfg.DBUser))
	ctx.Export("master_password", pulumi.ToSecret(pulumi.String(cfg.DBPassword)))
	ctx.Export("connection_string", pulumi.ToSecret(pulumi.Sprintf("postgresql://%s:***@%s.rds.amazonaws.com:%d/%s",
		cfg.DBUser, cfg.DBUser, cfg.DBPort, cfg.DBName)))
	ctx.Export("arn", pulumi.String(fmt.Sprintf("arn:aws:rds:us-east-1:123456789012:db:%s-pg", cfg.DBName)))
	ctx.Export("endpoint", pulumi.Sprintf("%s.rds.amazonaws.com:%d", cfg.DBUser, cfg.DBPort))
	return nil
}

func deployPostgresLocal(ctx *pulumi.Context, cfg PostgresStackConfig) error {
	ctx.Export("provider", pulumi.String("local"))
	ctx.Export("host", pulumi.String("localhost"))
	ctx.Export("port", pulumi.Int(cfg.HostPort))
	ctx.Export("db_name", pulumi.String(cfg.DBName))
	ctx.Export("master_username", pulumi.String(cfg.DBUser))
	ctx.Export("master_password", pulumi.ToSecret(pulumi.String(cfg.DBPassword)))
	ctx.Export("connection_string", pulumi.ToSecret(pulumi.Sprintf("postgresql://%s:***@localhost:%d/%s?sslmode=disable",
		cfg.DBUser, cfg.HostPort, cfg.DBName)))
	ctx.Export("arn", pulumi.String(""))
	ctx.Export("endpoint", pulumi.Sprintf("localhost:%d", cfg.HostPort))

	_ = config.New(ctx, "")
	return nil
}
