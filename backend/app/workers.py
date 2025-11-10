"""Background workers for handling long-running document processing."""
import logging
from datetime import datetime
from pathlib import Path

from . import crud
from .create_index import SearchIndexError, get_search_service
from .database import SessionLocal
from .document_intelligence import DocumentProcessingError, get_document_service

logger = logging.getLogger(__name__)


def process_file(file_id: str) -> None:
    """Parse an uploaded file and push chunks into the associated Azure AI Search index."""
    db = SessionLocal()
    source_file = None
    try:
        source_file = crud.get_source_file(db, file_id)
        if source_file is None or source_file.project is None:
            logger.warning("File %s not found or missing project reference; aborting.", file_id)
            return

        document_service = get_document_service()
        search_service = get_search_service()
        if document_service is None or search_service is None:
            raise RuntimeError("Required Azure services are not configured.")

        source_file.status = "PROCESSING"
        db.commit()

        file_path = Path(source_file.storage_path)
        chunks = document_service.extract_chunks(file_path)
        logger.info("Extracted %s chunk(s) from %s", len(chunks), source_file.original_filename)

        search_service.delete_file_chunks(source_file.project.index_name, source_file.file_id)
        search_service.upload_chunks(
            index_name=source_file.project.index_name,
            project_id=source_file.project.project_id,
            file_id=source_file.file_id,
            chunks=chunks,
        )

        source_file.status = "COMPLETED"
        source_file.project.last_modified = datetime.utcnow()
        db.commit()
    except (DocumentProcessingError, SearchIndexError, RuntimeError) as exc:
        logger.error("Failed to process file %s: %s", file_id, exc)
        if source_file:
            source_file.status = "FAILED"
            if source_file.project:
                source_file.project.last_modified = datetime.utcnow()
            db.commit()
    except Exception:
        logger.exception("Unexpected error while processing file %s", file_id)
        if source_file:
            source_file.status = "FAILED"
            if source_file.project:
                source_file.project.last_modified = datetime.utcnow()
            db.commit()
        raise
    finally:
        db.close()
