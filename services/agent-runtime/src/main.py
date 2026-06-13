from fastapi import FastAPI
from src.config import settings
from src.routers import agents

app = FastAPI(title=settings.app_name, version=settings.app_version)
app.include_router(agents.router)

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "agent-runtime"}
