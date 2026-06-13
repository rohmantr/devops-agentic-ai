.PHONY: build test lint run docker-build docker-run

build:
	go build -o bin/server ./cmd/server

test:
	go test ./... -v -race -count=1

lint:
	golangci-lint run ./...

run:
	go run ./cmd/server

docker-build:
	docker build -t infra-orchestrator:latest .

docker-run:
	docker run --rm -p 8080:8080 infra-orchestrator:latest
