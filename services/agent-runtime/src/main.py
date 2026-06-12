"""Agent Runtime Engine — FastAPI application."""

from fastapi import FastAPI

from src.config import settings

app = FastAPI(title=settings.app_name, version=settings.app_version)


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "agent-runtime"}
