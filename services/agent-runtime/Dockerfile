# Multi-stage build for Agent Runtime Engine (Python/FastAPI)

# Stage 1: Install deps
FROM python:3.12-slim AS builder

WORKDIR /app

COPY pyproject.toml .
RUN pip install --no-cache-dir uv && \
    uv sync --no-dev --frozen 2>/dev/null || true

# Stage 2: Runtime
FROM python:3.12-slim AS runner

WORKDIR /app

COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY src/ /app/src

EXPOSE 8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
