import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import crud
from ..config import settings
from ..database import get_session
from ..create_index import SearchIndexError, get_search_service

router = APIRouter(prefix="/files", tags=["files"])
logger = logging.getLogger(__name__)


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_file(file_id: str, db: Session = Depends(get_session)):
    source_file = crud.get_source_file(db, file_id)
    if source_file is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    path = Path(source_file.storage_path)
    if path.exists() and path.is_file():
        try:
            path.relative_to(settings.storage_dir)
        except ValueError:
            pass
        path.unlink(missing_ok=True)

    search_service = get_search_service()
    if search_service and source_file.project:
        try:
            search_service.delete_file_chunks(source_file.project.index_name, source_file.file_id)
        except SearchIndexError as exc:
            logger.warning(
                "Failed to remove search documents for file %s in index %s: %s",
                file_id,
                source_file.project.index_name,
                exc,
            )

    crud.delete_source_file(db, source_file)
