"""Document Intelligence helpers for parsing and chunking uploaded PDFs."""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Sequence, Tuple

from azure.ai.documentintelligence import DocumentIntelligenceClient
from azure.ai.documentintelligence.models import DocumentContentFormat
from azure.core.credentials import AzureKeyCredential
from azure.core.exceptions import AzureError

from .config import settings

logger = logging.getLogger(__name__)
PAGE_MARKER_PATTERN = re.compile(r"<pageNum>(?P<num>\d+)</pageNum>", re.IGNORECASE)


class DocumentIntelligenceNotConfigured(RuntimeError):
    """Raised when Azure Document Intelligence credentials are missing."""


class DocumentProcessingError(RuntimeError):
    """Raised when a document cannot be parsed or chunked."""


@dataclass
class Chunk:
    """Represents a chunk of markdown content with optional page metadata."""

    sequence: int
    content: str
    page_number: Optional[int]


class DocumentIntelligenceService:
    """Wrapper around Azure Document Intelligence with markdown chunking helpers."""

    def __init__(self) -> None:
        if not settings.azure_document_intelligence_endpoint or not settings.azure_document_intelligence_api_key:
            raise DocumentIntelligenceNotConfigured(
                "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT/API_KEY must be configured."
            )

        self._client = DocumentIntelligenceClient(
            endpoint=settings.azure_document_intelligence_endpoint,
            credential=AzureKeyCredential(settings.azure_document_intelligence_api_key),
        )

    def parse_to_markdown(self, file_path: Path | str) -> str:
        path = Path(file_path)
        if not path.exists():
            raise DocumentProcessingError(f"File '{path}' does not exist.")

        file_bytes = path.read_bytes()
        try:
            poller = self._client.begin_analyze_document(
                model_id="prebuilt-layout",
                body=file_bytes,
                content_type="application/pdf",
                output_content_format=DocumentContentFormat.MARKDOWN,
            )
            result = poller.result()
        except AzureError as exc:
            raise DocumentProcessingError("Azure Document Intelligence request failed") from exc

        content = getattr(result, "content", None)
        if not content:
            raise DocumentProcessingError("No markdown content returned from Document Intelligence.")
        return content

    def extract_chunks(
        self,
        file_path: Path | str,
        *,
        chunk_size: int = 1500,
        overlap: int = 200,
    ) -> List[Chunk]:
        markdown = self.parse_to_markdown(file_path)
        return self.chunk_markdown(markdown, chunk_size=chunk_size, overlap=overlap)

    def chunk_markdown(self, markdown: str, *, chunk_size: int = 1500, overlap: int = 200) -> List[Chunk]:
        paragraphs = list(self._iter_paragraphs(markdown))
        buffer: List[Tuple[str, Optional[int]]] = []
        buffer_chars = 0
        sequence = 1
        chunks: List[Chunk] = []

        def flush_buffer() -> None:
            nonlocal buffer, buffer_chars, sequence
            if not buffer:
                return

            chunk_text = "\n\n".join(part for part, _ in buffer).strip()
            if not chunk_text:
                buffer.clear()
                buffer_chars = 0
                return

            first_page = next((page for _, page in buffer if page is not None), None)
            chunks.append(Chunk(sequence=sequence, content=chunk_text, page_number=first_page))
            sequence += 1

            if overlap > 0 and buffer:
                retained: List[Tuple[str, Optional[int]]] = []
                retained_len = 0
                for text, page in reversed(buffer):
                    retained_len += len(text)
                    retained.append((text, page))
                    if retained_len >= overlap:
                        break
                buffer = list(reversed(retained))
            else:
                buffer = []

            if buffer:
                buffer_chars = sum(len(text) for text, _ in buffer) + max(len(buffer) - 1, 0) * 2
            else:
                buffer_chars = 0

        for text, page in paragraphs:
            text_length = len(text)
            if buffer and buffer_chars + text_length + 2 > chunk_size:
                flush_buffer()

            buffer.append((text, page))
            buffer_chars += text_length
            if len(buffer) > 1:
                buffer_chars += 2

        flush_buffer()

        if not chunks:
            raise DocumentProcessingError("Unable to produce any chunks from the document.")

        return chunks

    @staticmethod
    def _iter_paragraphs(markdown: str) -> Sequence[Tuple[str, Optional[int]]]:
        current_page: Optional[int] = None
        for block in re.split(r"(?:\r?\n){2,}", markdown):
            text = block.strip()
            if not text:
                continue

            match = PAGE_MARKER_PATTERN.fullmatch(text)
            if match:
                current_page = int(match.group("num"))
                continue

            yield text, current_page


def get_document_service() -> Optional[DocumentIntelligenceService]:
    global _DOCUMENT_SERVICE, _DOCUMENT_SERVICE_INITIALIZED
    if _DOCUMENT_SERVICE is None and not _DOCUMENT_SERVICE_INITIALIZED:
        try:
            _DOCUMENT_SERVICE = DocumentIntelligenceService()
        except DocumentIntelligenceNotConfigured as exc:
            logger.warning("Document Intelligence disabled: %s", exc)
            _DOCUMENT_SERVICE_INITIALIZED = True
        except Exception:
            logger.exception("Failed to initialize Document Intelligence client")
            _DOCUMENT_SERVICE_INITIALIZED = True
    return _DOCUMENT_SERVICE


_DOCUMENT_SERVICE: Optional[DocumentIntelligenceService] = None
_DOCUMENT_SERVICE_INITIALIZED = False

__all__ = [
    "Chunk",
    "DocumentIntelligenceService",
    "DocumentIntelligenceNotConfigured",
    "DocumentProcessingError",
    "get_document_service",
]
