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
    durable_functions_base_url: str = "http://localhost:7071"
    durable_functions_human_event: str = "HumanApproval"
    database_url: Optional[str] = None
    storage_dir: Optional[str] = None

    class Config:
        env_file = BASE_DIR.parent / ".env"
        env_file_encoding = "utf-8"


settings = Settings()

# Convert database_url to absolute path for SQLite
if settings.database_url:
    if settings.database_url.startswith("sqlite:///"):
        db_path_str = settings.database_url.replace("sqlite:///", "")
        db_path = Path(db_path_str)
        if not db_path.is_absolute():
            # If relative, make it relative to BASE_DIR.parent (project root)
            abs_db_path = BASE_DIR.parent / db_path
            settings.database_url = f"sqlite:///{abs_db_path}"
else:
    # Default database path
    settings.database_url = f"sqlite:///{BASE_DIR / 'project_db.sqlite'}"

# Convert storage_dir to absolute Path
if settings.storage_dir:
    storage_path = Path(settings.storage_dir)
    if not storage_path.is_absolute():
        # If relative, make it relative to BASE_DIR.parent (project root)
        settings.storage_dir = BASE_DIR.parent / storage_path
    else:
        settings.storage_dir = storage_path
else:
    settings.storage_dir = BASE_DIR / "storage"

settings.storage_dir.mkdir(parents=True, exist_ok=True)
