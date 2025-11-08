from pathlib import Path
from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from .. import crud, schemas
from ..config import settings
from ..database import get_session
from ..workers import process_file

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=List[schemas.ProjectBase])
def list_projects(db: Session = Depends(get_session)):
    return crud.list_projects(db)


@router.post("", response_model=schemas.ProjectBase, status_code=status.HTTP_201_CREATED)
def create_project(payload: schemas.ProjectCreate, db: Session = Depends(get_session)):
    name = (payload.project_name or "Untitled Project").strip() or "Untitled Project"
    return crud.create_project(db, name)


@router.get("/{project_id}", response_model=schemas.ProjectDetail)
def get_project(project_id: str, db: Session = Depends(get_session)):
    project = crud.get_project(db, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.put("/{project_id}", response_model=schemas.ProjectBase)
def update_project(project_id: str, payload: schemas.ProjectUpdate, db: Session = Depends(get_session)):
    project = crud.get_project(db, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    name = payload.project_name.strip() or project.project_name
    return crud.update_project_name(db, project, name)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: str, db: Session = Depends(get_session)):
    project = crud.get_project(db, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    crud.delete_project(db, project)


@router.post("/{project_id}/files", response_model=schemas.FileUploadResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_file(
    project_id: str,
    background_tasks: BackgroundTasks,
    upload: UploadFile = File(...),
    db: Session = Depends(get_session),
):
    project = crud.get_project(db, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    project_dir = Path(settings.storage_dir) / project_id
    project_dir.mkdir(parents=True, exist_ok=True)
    destination = project_dir / upload.filename

    data = await upload.read()
    destination.write_bytes(data)

    source_file = crud.create_source_file(db, project_id, upload.filename, str(destination))
    background_tasks.add_task(process_file, source_file.file_id)
    return schemas.FileUploadResponse(file_id=source_file.file_id, status=source_file.status)
