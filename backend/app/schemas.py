from datetime import datetime
from typing import List, Optional, Literal

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


class AgentRunCreate(BaseModel):
    query: str
    report_length: str = "medium"
    project_id: Optional[str] = None


class AgentRunStartResponse(BaseModel):
    run_id: str
    status_query_url: str
    send_event_url: str
    query: str
    report_length: str
    project_id: Optional[str]
    created_at: datetime


class AgentRunFeedback(BaseModel):
    action: Literal["continue", "cancel"]
