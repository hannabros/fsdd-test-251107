import logging

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from .. import crud, schemas
from ..database import get_session
from ..services.durable import get_durable_client

router = APIRouter(prefix="/agent-runs", tags=["agent-runs"])
logger = logging.getLogger(__name__)


@router.post("", response_model=schemas.AgentRunStartResponse, status_code=status.HTTP_201_CREATED)
async def start_agent_run(payload: schemas.AgentRunCreate, db: Session = Depends(get_session)):
    if payload.project_id:
        project = crud.get_project(db, payload.project_id)
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    durable_client = get_durable_client()
    try:
        result = await durable_client.start_run(payload.query, payload.report_length)
    except Exception as exc:  # pragma: no cover - httpx raises different subclasses
        logger.exception("Failed to start durable function run")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to start research agent run",
        ) from exc

    run_id = result.get("id")
    status_url = result.get("statusQueryGetUri")
    send_event_url = result.get("sendEventPostUri")

    if not run_id or not status_url or not send_event_url:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Durable Functions response missing required fields",
        )

    agent_run = crud.create_agent_run(
        db,
        run_id=run_id,
        status_url=status_url,
        send_event_url=send_event_url,
        query=payload.query,
        report_length=payload.report_length,
        project_id=payload.project_id,
    )

    return schemas.AgentRunStartResponse(
        run_id=agent_run.run_id,
        status_query_url=agent_run.status_url,
        send_event_url=agent_run.send_event_url,
        query=agent_run.query,
        report_length=agent_run.report_length,
        project_id=agent_run.project_id,
        created_at=agent_run.created_at,
    )


@router.get("/{run_id}")
async def get_agent_run_status(run_id: str, db: Session = Depends(get_session)):
    agent_run = crud.get_agent_run(db, run_id)
    if agent_run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent run not found")

    durable_client = get_durable_client()
    try:
        status_response = await durable_client.get_status(agent_run.status_url)
    except Exception as exc:
        logger.exception("Failed to query durable function status")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to query research agent status",
        ) from exc

    return Response(
        content=status_response.content,
        status_code=status_response.status_code,
        media_type=status_response.headers.get("content-type", "application/json"),
    )


@router.post("/{run_id}/human-feedback", status_code=status.HTTP_202_ACCEPTED)
async def send_human_feedback(
    run_id: str,
    payload: schemas.AgentRunFeedback,
    db: Session = Depends(get_session),
):
    agent_run = crud.get_agent_run(db, run_id)
    if agent_run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent run not found")

    durable_client = get_durable_client()
    try:
        response = await durable_client.send_feedback(agent_run.send_event_url, payload.action)
    except Exception as exc:
        logger.exception("Failed to send human feedback to durable function")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to send feedback to research agent",
        ) from exc

    return Response(status_code=response.status_code)
