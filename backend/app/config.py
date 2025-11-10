from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    azure_ai_search_endpoint: Optional[str] = None
    azure_ai_search_api_key: Optional[str] = None
    azure_document_intelligence_endpoint: Optional[str] = None
    azure_document_intelligence_api_key: Optional[str] = None
    azure_openai_endpoint: Optional[str] = None
    azure_openai_api_key: Optional[str] = None
    azure_openai_api_version: str = "2024-05-01-preview"
    azure_openai_embedding_deployment: Optional[str] = None
    azure_openai_embedding_dimensions: int = 1536
    database_url: str = "sqlite:///" + str(BASE_DIR / "project_db.sqlite")
    storage_dir: Path = BASE_DIR / "storage"

    class Config:
        env_file = BASE_DIR.parent / ".env"
        env_file_encoding = "utf-8"


settings = Settings()
settings.storage_dir.mkdir(parents=True, exist_ok=True)
