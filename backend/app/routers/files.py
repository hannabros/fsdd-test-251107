from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import crud
from ..config import settings
from ..database import get_session

router = APIRouter(prefix="/files", tags=["files"])


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

    crud.delete_source_file(db, source_file)
