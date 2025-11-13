"""Azure AI Search helpers for project-specific indexes."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Sequence

from azure.core.credentials import AzureKeyCredential
from azure.core.exceptions import AzureError, ResourceNotFoundError
from azure.search.documents import SearchClient
from azure.search.documents.indexes import SearchIndexClient
from azure.search.documents.indexes.models import (
    HnswAlgorithmConfiguration,
    SearchField,
    SearchFieldDataType,
    SearchIndex,
    SearchableField,
    SimpleField,
    VectorSearch,
    VectorSearchProfile,
)
from openai import AzureOpenAI, OpenAIError

from .config import settings
from .document_intelligence import Chunk

logger = logging.getLogger(__name__)
VECTOR_PROFILE_NAME = "content-vector-profile"
VECTOR_ALGORITHM_NAME = "content-hnsw"


class SearchServiceNotConfigured(RuntimeError):
    """Raised when Azure AI Search or Azure OpenAI credentials are missing."""


class SearchIndexError(RuntimeError):
    """General wrapper for indexing failures."""


class AzureSearchService:
    """High-level helper for ensuring indexes and uploading chunk documents."""

    def __init__(self) -> None:
        if not settings.azure_ai_search_endpoint or not settings.azure_ai_search_api_key:
            raise SearchServiceNotConfigured("AZURE_AI_SEARCH_ENDPOINT/API_KEY must be configured.")
        if (
            not settings.azure_openai_endpoint
            or not settings.azure_openai_api_key
            or not settings.azure_openai_embedding_deployment
        ):
            raise SearchServiceNotConfigured(
                "Azure OpenAI endpoint, API key, and embedding deployment must be configured."
            )

        self._index_client = SearchIndexClient(
            endpoint=settings.azure_ai_search_endpoint,
            credential=AzureKeyCredential(settings.azure_ai_search_api_key),
        )
        self._search_clients: Dict[str, SearchClient] = {}
        self._openai = AzureOpenAI(
            api_key=settings.azure_openai_api_key,
            azure_endpoint=settings.azure_openai_endpoint,
            api_version=settings.azure_openai_api_version,
        )
        self._embedding_model = settings.azure_openai_embedding_deployment
        self._vector_dimensions = settings.azure_openai_embedding_dimensions

    def ensure_index(self, index_name: str) -> None:
        try:
            self._index_client.get_index(index_name)
            return
        except ResourceNotFoundError:
            pass

        fields = [
            SimpleField(name="id", type=SearchFieldDataType.String, key=True),
            SearchableField(name="content", type=SearchFieldDataType.String, analyzer_name="en.lucene"),
            SimpleField(name="project_id", type=SearchFieldDataType.String, filterable=True, sortable=True),
            SimpleField(name="source_file_id", type=SearchFieldDataType.String, filterable=True, sortable=True),
            SimpleField(name="page_number", type=SearchFieldDataType.Int32, filterable=True, sortable=True),
            SimpleField(name="created_at", type=SearchFieldDataType.DateTimeOffset, filterable=True, sortable=True),
            SearchField(
                name="content_vector",
                type=SearchFieldDataType.Collection(SearchFieldDataType.Single),
                searchable=True,
                vector_search_dimensions=self._vector_dimensions,
                vector_search_profile_name=VECTOR_PROFILE_NAME,
            ),
        ]

        vector_search = VectorSearch(
            profiles=[
                VectorSearchProfile(
                    name=VECTOR_PROFILE_NAME,
                    algorithm_configuration_name=VECTOR_ALGORITHM_NAME,
                )
            ],
            algorithms=[
                HnswAlgorithmConfiguration(
                    name=VECTOR_ALGORITHM_NAME,
                    metric="cosine",
                )
            ],
        )

        index = SearchIndex(name=index_name, fields=fields, vector_search=vector_search)
        try:
            self._index_client.create_or_update_index(index)
            logger.info("Created Azure AI Search index '%s'", index_name)
        except AzureError as exc:
            raise SearchIndexError(f"Failed to create index '{index_name}'") from exc

    def upload_chunks(self, index_name: str, project_id: str, file_id: str, chunks: Sequence[Chunk]) -> None:
        if not chunks:
            raise SearchIndexError("No chunks supplied for indexing.")

        self.ensure_index(index_name)
        vectors = self._embed_texts([chunk.content for chunk in chunks])
        documents: List[Dict[str, object]] = []
        timestamp = datetime.now(timezone.utc).isoformat()

        for chunk, embedding in zip(chunks, vectors):
            doc_id = f"{file_id}-{chunk.sequence:04d}"
            documents.append(
                {
                    "id": doc_id,
                    "project_id": project_id,
                    "source_file_id": file_id,
                    "content": chunk.content,
                    "content_vector": embedding,
                    "page_number": chunk.page_number or 0,
                    "created_at": timestamp,
                }
            )

        client = self._get_search_client(index_name)
        try:
            client.upload_documents(documents)
        except AzureError as exc:
            raise SearchIndexError(f"Failed to upload documents to index '{index_name}'") from exc

    def delete_file_chunks(self, index_name: str, file_id: str) -> None:
        client = self._get_search_client(index_name, ensure_exists=False)
        if client is None:
            return

        filter_value = self._escape_filter_value(file_id)
        
        try:
            results = client.search(
                search_text="*",
                filter=f"source_file_id eq '{filter_value}'",
                select=["id"],
                top=1000,
                include_total_count=False,
            )
            
            # Convert results to list to avoid pagination issues
            batch = [{"id": doc["id"]} for doc in list(results)]
            
            if batch:
                client.delete_documents(documents=batch)
                logger.info("Deleted %s chunk(s) for file %s in index %s", len(batch), file_id, index_name)
        except AzureError as exc:
            raise SearchIndexError(f"Failed to delete chunks for file {file_id}") from exc

    def delete_index(self, index_name: str) -> None:
        try:
            self._index_client.delete_index(index_name)
            logger.info("Deleted Azure AI Search index '%s'", index_name)
        except ResourceNotFoundError:
            logger.info("Index '%s' did not exist; nothing to delete", index_name)
        except AzureError as exc:
            raise SearchIndexError(f"Failed to delete index '{index_name}'") from exc

    def _embed_texts(self, texts: Sequence[str]) -> List[List[float]]:
        try:
            response = self._openai.embeddings.create(
                model=self._embedding_model,
                input=list(texts),
            )
        except OpenAIError as exc:
            raise SearchIndexError("Failed to generate embeddings for content chunks") from exc

        ordered = sorted(response.data, key=lambda item: item.index)
        return [item.embedding for item in ordered]

    def _get_search_client(self, index_name: str, *, ensure_exists: bool = True) -> Optional[SearchClient]:
        if ensure_exists:
            self.ensure_index(index_name)
        elif index_name not in self._search_clients:
            try:
                self._index_client.get_index(index_name)
            except ResourceNotFoundError:
                return None

        if index_name not in self._search_clients:
            self._search_clients[index_name] = SearchClient(
                endpoint=settings.azure_ai_search_endpoint,
                index_name=index_name,
                credential=AzureKeyCredential(settings.azure_ai_search_api_key),
            )
        return self._search_clients[index_name]

    @staticmethod
    def _escape_filter_value(value: str) -> str:
        return value.replace("'", "''")


def get_search_service() -> Optional[AzureSearchService]:
    global _SEARCH_SERVICE, _SEARCH_SERVICE_INITIALIZED
    if _SEARCH_SERVICE is None and not _SEARCH_SERVICE_INITIALIZED:
        try:
            _SEARCH_SERVICE = AzureSearchService()
        except SearchServiceNotConfigured as exc:
            logger.warning("Azure Search disabled: %s", exc)
            _SEARCH_SERVICE_INITIALIZED = True
        except Exception:
            logger.exception("Failed to initialize Azure Search service")
            _SEARCH_SERVICE_INITIALIZED = True
    return _SEARCH_SERVICE


_SEARCH_SERVICE: Optional[AzureSearchService] = None
_SEARCH_SERVICE_INITIALIZED = False

__all__ = [
    "AzureSearchService",
    "SearchIndexError",
    "SearchServiceNotConfigured",
    "get_search_service",
]
