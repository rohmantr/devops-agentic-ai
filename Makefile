.PHONY: dev build test lint

dev:
	docker compose up --build

build:
	docker compose build

test:
	cd services/api-gateway && npm run test && npm run test:e2e || true
	cd services/infra-orchestrator && PATH="$$HOME/.pulumi/bin:$$PATH" go test ./... -v -count=1

lint:
	cd services/api-gateway && npm run lint || true
	cd services/infra-orchestrator && PATH="$$HOME/.pulumi/bin:$$PATH" go vet ./...
