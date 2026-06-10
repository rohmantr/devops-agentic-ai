# DevOps Agentic AI as a Service
Multi-tenant platform for deploying and managing autonomous DevOps AI agents.

## Services
| Service              | Language   | Port  | Description                      |
|----------------------|------------|-------|----------------------------------|
| api-gateway          | TypeScript | 3000  | Auth, routing, rate limiting     |
| agent-runtime        | Python     | 8000  | AI agent orchestration           |
| infra-orchestrator   | Go         | 8080  | Infrastructure provisioning      |
| billing              | TypeScript | 3001  | Usage metering & billing         |

## Quick Start
make dev
