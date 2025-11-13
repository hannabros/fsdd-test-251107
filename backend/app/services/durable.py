"""Utility client for interacting with Azure Durable Functions HTTP endpoints."""
from __future__ import annotations

import logging
from typing import Optional

import httpx

from ..config import settings

logger = logging.getLogger(__name__)


class DurableFunctionClient:
    """Simple HTTP wrapper around the Durable Functions request-reply pattern."""

    def __init__(self) -> None:
        self.base_url = settings.durable_functions_base_url.rstrip("/")
        self.human_event_name = settings.durable_functions_human_event

    async def start_run(self, query: str, report_length: str) -> dict:
        endpoint = f"{self.base_url}/api/httptrigger"
        payload = {"query": query, "report_length": report_length}
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(endpoint, json=payload)
            response.raise_for_status()
            return response.json()

    async def get_status(self, status_url: str) -> httpx.Response:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.get(status_url)
            return response

    async def send_feedback(self, send_event_url: str, action: str) -> httpx.Response:
        if "{eventName}" in send_event_url:
            endpoint = send_event_url.replace("{eventName}", self.human_event_name)
        else:
            endpoint = send_event_url
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(endpoint, json={"action": action})
            return response


_DURABLE_CLIENT: Optional[DurableFunctionClient] = None


def get_durable_client() -> DurableFunctionClient:
    global _DURABLE_CLIENT
    if _DURABLE_CLIENT is None:
        _DURABLE_CLIENT = DurableFunctionClient()
    return _DURABLE_CLIENT
