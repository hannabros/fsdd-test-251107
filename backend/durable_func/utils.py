### Search data structure

from pydantic import BaseModel
from enum import Enum

class SearchType(str, Enum):
    LOCAL = "local"
    GLOBAL = "global"

class ResearchTopic(BaseModel):
    topic: str
    search_type: SearchType
    steps: list[str]

class ResearchTopics(BaseModel):
    topics: list[ResearchTopic]

"""
AI Search Tool
"""

import os
import json
import base64
import logging
from typing import List, Dict, Any, Optional, Annotated

from azure.core.credentials import AzureKeyCredential
from azure.search.documents import SearchClient
from azure.search.documents.models import (
    VectorizedQuery,
    QueryType,
    QueryCaptionType,
    QueryAnswerType,
)
from openai import AzureOpenAI
from prompt_template import research_instrunction_template

logger = logging.getLogger(__name__)

class AISearchTool():
    """
    Tool for searching documents in Azure AI Search with multiple search methods.

    This tool supports:
    - Hybrid search (text + vector)
    - Semantic search
    - Vector search
    - Traditional text search
    """

    def __init__(
        self,
        search_endpoint: Optional[str] = None,
        search_key: Optional[str] = None,
        index_name: Optional[str] = None,
        openai_endpoint: Optional[str] = None,
        openai_key: Optional[str] = None,
        embedding_deployment: Optional[str] = None,
        openai_api_version: Optional[str] = None,
        search_type: Optional[str] = None,
    ):
        """
        Initialize the AI search executor with required clients.

        Args:
            id: Executor ID
            search_endpoint: Azure AI Search endpoint
            search_key: Azure AI Search API key
            index_name: Azure AI Search index name
            openai_endpoint: Azure OpenAI endpoint for embeddings
            openai_key: Azure OpenAI API key
            embedding_deployment: Azure OpenAI embedding deployment name
            openai_api_version: Azure OpenAI API version
            search_type: Search type (semantic, hybrid, vector, text)
        """

        # AI Search setup
        self.search_endpoint = search_endpoint or os.getenv("AZURE_AI_SEARCH_ENDPOINT")
        self.search_key = search_key or os.getenv("AZURE_AI_SEARCH_API_KEY")
        self.index_name = index_name or os.getenv("AZURE_AI_SEARCH_INDEX_NAME")
        self.search_type = search_type or os.getenv("AZURE_AI_SEARCH_SEARCH_TYPE", "hybrid")

        # OpenAI setup for embeddings
        self.openai_endpoint = openai_endpoint or os.getenv("AZURE_OPENAI_ENDPOINT")
        self.openai_key = openai_key or os.getenv("AZURE_OPENAI_API_KEY")
        self.embedding_deployment = embedding_deployment or os.getenv(
            "AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME"
        )
        self.openai_api_version = openai_api_version or os.getenv(
            "AZURE_OPENAI_API_VERSION"
        )

        self.llm_model = os.getenv("MODEL_DEPLOYMENT_NAME", "gpt-4.1-mini")
        self.client = AzureOpenAI(
            api_key=self.openai_key,
            base_url=f"{self.openai_endpoint}openai/v1/",
            api_version="preview",
        )


        # Initialize clients
        self._init_clients()

        logger.info(f"AISearchExecutor initialized with index: {self.index_name}")

    def generate_research(self, prompt, model):

        kwargs = {
            "model": model,
            "input": prompt,
        }

        response = self.client.responses.create(**kwargs)
        
        return response.output[0].content[-1].text

    def _init_clients(self):
        """Initialize Azure clients."""
        # Search client
        from azure.identity import DefaultAzureCredential

        if self.search_key:
            search_credential = AzureKeyCredential(self.search_key)
        else:
            search_credential = DefaultAzureCredential()

        self.search_client = SearchClient(
            endpoint=self.search_endpoint,
            index_name=self.index_name,
            credential=search_credential,
        )

        # OpenAI client
        self.openai_client = AzureOpenAI(
            api_version=self.openai_api_version,
            azure_endpoint=self.openai_endpoint,
            api_key=self.openai_key,
        )

    def research_query(
        self,
        search_data: Dict[str, Any],
    ) -> None:
        """Search documents in Azure AI Search for each sub-topic."""
        try:
            # Get metadata for verbose and locale
            metadata = search_data.get("metadata", {})
            verbose = metadata.get("verbose", False)

            query = search_data.get("query", "")
            #  Use self.search_type as default (from env or init param)
            search_type = search_data.get("search_type", self.search_type)
            logger.info(f"[AISearchExecutor] Using search_type: {search_type}")
            filters = search_data.get("filters")
            top_k = search_data.get("top_k", 5)
            include_content = search_data.get("include_content", True)
            document_type = search_data.get("document_type")
            industry = search_data.get("industry")
            company = search_data.get("company")
            report_year = search_data.get("report_year")

            try:
                # Generate query vector
                query_vector = self._generate_embedding(query)

                # Build filter expression
                filter_expression = self._build_filters(
                    filters, document_type, industry, company, report_year
                )

                # Execute search
                search_results = self._execute_search(
                    query=query,
                    query_vector=query_vector,
                    search_type=search_type,
                    filter_expression=filter_expression,
                    top_k=top_k,
                    include_content=include_content,
                )

                # Process results
                research_doc = self._process_search_results(
                    query, search_results, include_content
                )

                return research_doc

            except Exception as search_error:
                error_str = str(search_error)
                logger.error(f"[AISearchExecutor] AI Search failed: {error_str}")

                return f"[AISearchExecutor] AI Search failed: {error_str}"
            
        except Exception as e:
            error_msg = f"AI Search fatal error: {str(e)}"
            logger.error(f"[AISearchExecutor] {error_msg}")

            return f"[AISearchExecutor] {error_msg}"


    def _generate_embedding(self, text: str) -> List[float]:
        """Generate embedding for text using Azure OpenAI."""
        try:
            response = self.openai_client.embeddings.create(
                input=text, model=self.embedding_deployment
            )
            return response.data[0].embedding
        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")
            return []

    def _build_filters(
        self,
        filters: Optional[str],
        document_type: Optional[str],
        industry: Optional[str],
        company: Optional[str],
        report_year: Optional[str],
    ) -> Optional[str]:
        """Build OData filter expression."""
        filter_parts = []

        if filters:
            filter_parts.append(filters)
        if document_type:
            filter_parts.append(f"document_type eq '{document_type}'")
        if industry:
            filter_parts.append(f"industry eq '{industry}'")
        if company:
            filter_parts.append(f"company eq '{company}'")
        if report_year:
            filter_parts.append(f"report_year eq '{report_year}'")

        return " and ".join(filter_parts) if filter_parts else None

    def _execute_search(
        self,
        query: str,
        query_vector: List[float],
        search_type: str,
        filter_expression: Optional[str],
        top_k: int,
        include_content: bool,
    ):
        """Execute search based on search type."""
        select_fields = self._get_select_fields(include_content)

        vector_queries = [
            VectorizedQuery(
                vector=query_vector, k_nearest_neighbors=top_k, fields="content_vector"
            ),
            VectorizedQuery(
                vector=query_vector, k_nearest_neighbors=top_k, fields="summary_vector"
            ),
        ]

        if search_type == "hybrid":
            # Hybrid search: text + vector
            return self.search_client.search(
                search_text=query,
                vector_queries=vector_queries,
                filter=filter_expression,
                select=select_fields,
                top=top_k,
                query_type=QueryType.FULL,
                semantic_configuration_name="semantic-config",
            )

        elif search_type == "semantic":
            # Semantic search with captions
            return self.search_client.search(
                search_text=query,
                vector_queries=vector_queries,
                filter=filter_expression,
                select=select_fields,
                top=top_k,
                query_type=QueryType.SEMANTIC,
                semantic_configuration_name="semantic-config",
                query_caption=QueryCaptionType.EXTRACTIVE,
                query_answer=QueryAnswerType.EXTRACTIVE,
            )

        elif search_type == "vector":
            # Pure vector search
            return self.search_client.search(
                search_text=None,
                vector_queries=vector_queries,
                filter=filter_expression,
                select=select_fields,
                top=top_k,
            )

        elif search_type == "text":
            # Traditional text search
            return self.search_client.search(
                search_text=query,
                filter=filter_expression,
                select=select_fields,
                top=top_k,
            )

        else:
            raise ValueError(f"Unknown search type: {search_type}")

    def _get_select_fields(self, include_content: bool) -> str:
        """Get select fields for search query."""
        base_fields = "docId,title,file_name,summary,document_type,industry,company,report_year,page_number,upload_date,keywords"

        if include_content:
            return f"{base_fields},content"
        else:
            return base_fields

    def _process_search_results(
        self, topic_name: str, search_results, include_content: bool
    ) -> List[Dict[str, Any]]:
        """Process search results into a standardized format."""

        research_result = self.generate_research(
            research_instrunction_template.format(
                context="\n--------------------------\n".join([f"File: {doc['file_name']}\nContent: {doc['content']}\n" for doc in search_results]),
                user_query=topic_name
            ), model=self.llm_model)

        return research_result

async def main():
    import json
    from dotenv import load_dotenv
    load_dotenv()

    aisearch_tool = AISearchTool()

    input_data = {
        "query": "Find asset composition and liability breakdown for Crédit Agricole",
        "search_type": "semantic"
    }

    result = await aisearch_tool.research_query(input_data)

    print("AI Search Result:")
    print(result)

if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
