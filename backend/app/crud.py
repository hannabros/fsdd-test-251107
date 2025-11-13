from datetime import datetime
from uuid import uuid4

from typing import List, Optional

from sqlalchemy.orm import Session, selectinload

from . import models


def _project_name_exists(db: Session, name: str, exclude_project_id: Optional[str] = None) -> bool:
    query = db.query(models.Project.project_id).filter(models.Project.project_name == name)
    if exclude_project_id:
        query = query.filter(models.Project.project_id != exclude_project_id)
    return query.first() is not None


def generate_unique_project_name(
    db: Session, desired_name: str, exclude_project_id: Optional[str] = None
) -> str:
    base_name = desired_name or "Untitled Project"
    candidate = base_name
    counter = 1
    while _project_name_exists(db, candidate, exclude_project_id):
        candidate = f"{base_name} ({counter})"
        counter += 1
    return candidate


def create_project(db: Session, name: str) -> models.Project:
    unique_name = generate_unique_project_name(db, name)
    project = models.Project(
        project_id=str(uuid4()),
        project_name=unique_name,
        index_name=f"idx-{uuid4().hex[:8]}",
        last_modified=datetime.utcnow(),
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def list_projects(db: Session) -> List[models.Project]:
    return db.query(models.Project).order_by(models.Project.created_at.desc()).all()


def get_project(db: Session, project_id: str) -> Optional[models.Project]:
    return (
        db.query(models.Project)
        .filter(models.Project.project_id == project_id)
        .options(selectinload(models.Project.files))
        .first()
    )


def update_project_name(db: Session, project: models.Project, name: str) -> models.Project:
    unique_name = generate_unique_project_name(db, name, exclude_project_id=project.project_id)
    project.project_name = unique_name
    project.last_modified = datetime.utcnow()
    db.commit()
    db.refresh(project)
    return project


def delete_project(db: Session, project: models.Project) -> None:
    db.delete(project)
    db.commit()


def create_source_file(db: Session, project_id: str, filename: str, storage_path: str) -> models.SourceFile:
    source_file = models.SourceFile(
        file_id=str(uuid4()),
        project_id=project_id,
        original_filename=filename,
        storage_path=storage_path,
        status="PENDING",
    )
    db.add(source_file)
    project = db.query(models.Project).filter(models.Project.project_id == project_id).first()
    if project:
        project.last_modified = datetime.utcnow()
    db.commit()
    db.refresh(source_file)
    return source_file


def get_source_file(db: Session, file_id: str) -> Optional[models.SourceFile]:
    return (
        db.query(models.SourceFile)
        .filter(models.SourceFile.file_id == file_id)
        .options(selectinload(models.SourceFile.project))
        .first()
    )


def delete_source_file(db: Session, source_file: models.SourceFile) -> None:
    db.delete(source_file)
    db.commit()
