"""Agent Runtime Engine configuration via Pydantic Settings."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    app_name: str = "Agent Runtime Engine"
    app_version: str = "0.1.0"
    debug: bool = False

    # NATS
    nats_url: str = "nats://localhost:4222"

    # PostgreSQL
    database_url: str = "postgresql+asyncpg://devops_ai:localdev123@localhost:5432/devops_agentic"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # OpenAI / LLM
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    model_config = {
        "env_prefix": "AGENT_",
        "env_file": ".env",
        "extra": "ignore"
    }


settings = Settings()
