from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class SourceFileBase(BaseModel):
    file_id: str
    project_id: str
    original_filename: str
    storage_path: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class ProjectBase(BaseModel):
    project_id: str
    project_name: str
    index_name: str
    last_modified: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class ProjectDetail(ProjectBase):
    files: List[SourceFileBase] = Field(default_factory=list)


class ProjectCreate(BaseModel):
    project_name: Optional[str] = None


class ProjectUpdate(BaseModel):
    project_name: str


class FileUploadResponse(BaseModel):
    file_id: str
    status: str
