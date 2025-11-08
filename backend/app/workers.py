from datetime import datetime
from time import sleep

from .database import SessionLocal
from . import crud


def process_file(file_id: str) -> None:
    db = SessionLocal()
    source_file = None
    try:
        source_file = crud.get_source_file(db, file_id)
        if source_file is None:
            return
        source_file.status = "PROCESSING"
        db.commit()
        # Placeholder for Azure pipeline (parsing -> chunking -> embedding -> indexing)
        sleep(0.1)
        source_file.status = "COMPLETED"
        if source_file.project:
            source_file.project.last_modified = datetime.utcnow()
        db.commit()
    except Exception:
        if source_file:
            source_file.status = "FAILED"
            db.commit()
        raise
    finally:
        db.close()
