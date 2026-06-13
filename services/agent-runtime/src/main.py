"""Agent Runtime Engine — FastAPI application."""

from fastapi import FastAPI

from src.config import settings
from src.routers.agents import router as agents_router

app = FastAPI(title=settings.app_name, version=settings.app_version)

app.include_router(agents_router)


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "agent-runtime"}
