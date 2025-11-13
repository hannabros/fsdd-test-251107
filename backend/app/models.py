from datetime import datetime
from uuid import uuid4

from sqlalchemy import Column, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import relationship

from .database import Base


class Project(Base):
    __tablename__ = "projects"

    project_id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    project_name = Column(String, nullable=False)
    index_name = Column(String, nullable=False, unique=True)
    last_modified = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

    files = relationship(
        "SourceFile",
        back_populates="project",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    agent_runs = relationship(
        "AgentRun",
        back_populates="project",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class SourceFile(Base):
    __tablename__ = "source_files"

    file_id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    project_id = Column(String, ForeignKey("projects.project_id", ondelete="CASCADE"), nullable=False)
    original_filename = Column(String, nullable=False)
    storage_path = Column(Text, nullable=False)
    status = Column(String, default="PENDING")
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="files")


class AgentRun(Base):
    __tablename__ = "agent_runs"

    run_id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.project_id", ondelete="SET NULL"), nullable=True)
    query = Column(Text, nullable=False)
    report_length = Column(String, nullable=False, default="medium")
    status_url = Column(Text, nullable=False)
    send_event_url = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="agent_runs")
