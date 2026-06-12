.PHONY: dev build test lint

dev:
	docker compose up --build

build:
	docker compose build

test:
	cd services/api-gateway && npm run test && npm run test:e2e
	# cd services/agent-runtime && pytest
	# cd services/infra-orchestrator && go test ./...

lint:
	cd services/api-gateway && npm run lint
	# cd services/agent-runtime && ruff check .
	# cd services/infra-orchestrator && golangci-lint run
