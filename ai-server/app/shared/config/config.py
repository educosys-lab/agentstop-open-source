import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Env(BaseSettings):
    AI_PORT: int = 0
    ENV: str = ""
    BASE_URL: str = ""

    FIRECRAWL_API_KEY: str = ""

    MONGODB_URI: str = ""
    MONGODB_NAME: str = ""

    OPENAI_KEY: str = ""

    PINECONE_KEY: str = ""
    PINECONE_REGION: str = ""
    PINECONE_INDEX_NAME: str = "rag-index"

    REDIS_PORT: int = 0
    REDIS_HOST: str = ""
    REDIS_URI: str = ""
    REDIS_USERNAME: str = ""
    REDIS_PASSWORD: str = ""

    model_config = SettingsConfigDict(
        env_file=os.getenv("ENV") == "local" and ".env.local" or ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


env: Env = Env()
