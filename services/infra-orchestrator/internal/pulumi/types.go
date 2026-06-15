package pulumi

import "github.com/pulumi/pulumi/sdk/v3/go/pulumi"

func getProgram(resourceType string, config map[string]string) pulumi.RunFunc {
	switch resourceType {
	case "postgres":
		return postgresProgram(config)
	default:
		return postgresProgram(config)
	}
}
