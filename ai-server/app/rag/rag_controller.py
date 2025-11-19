from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, UploadFile, File, Form
from typing import Optional, Dict, Any, List

from app.mongodb.user.user_type import GetUserArgs
from app.shared.logger.logger import console_log
from app.rag.rag_types import (
    IngestRequestArgs,
    FileIngestRequestArgs,
    IngestResponseType,
    QueryModeType,
    QueryRequestArgs,
    QueryResponseType,
    RAGConfigType,
    DataSourceType,
    ExternalQueryRequestArgs,
    ExternalQueryResponseType,
    ExternalVectorDBConfigType,
)
from app.rag.ingestion_service import RAGIngestionService
from app.rag.query_service import RAGQueryService
from app.rag.external_query_service import ExternalVectorDBQueryService
from app.shared.utils.error_util import ThrowErrorArgs, throw_error, is_error
from app.mongodb.user.user_service import UserService

router = APIRouter(prefix="/rag")

# Global service instances (in production, use dependency injection)
_ingestion_service: Optional[RAGIngestionService] = None
_query_service: Optional[RAGQueryService] = None
_external_query_service: Optional[ExternalVectorDBQueryService] = None


def get_ingestion_service() -> RAGIngestionService:
    """Get or create ingestion service instance"""
    global _ingestion_service
    if _ingestion_service is None:
        _ingestion_service = RAGIngestionService()
    return _ingestion_service


def get_query_service() -> RAGQueryService:
    """Get or create query service instance"""
    global _query_service
    if _query_service is None:
        _query_service = RAGQueryService()
    return _query_service


def get_external_query_service() -> ExternalVectorDBQueryService:
    """Get or create external query service instance"""
    global _external_query_service
    if _external_query_service is None:
        _external_query_service = ExternalVectorDBQueryService()
    return _external_query_service


@router.post("/ingest", response_model=IngestResponseType)
async def ingest_document(
    request: IngestRequestArgs,
    ingestion_service: RAGIngestionService = Depends(get_ingestion_service),
):
    """
    Ingest a document into the RAG system.

    - **data**: The content to ingest (text, extracted from PDF/DOCX, etc.)
    - **source_type**: Type of data source (text, pdf, docx, url, json)
    - **source_name**: Unique identifier for this document
    - **metadata**: Additional metadata to store with the document
    - **chunk_size**: Size of text chunks in tokens (default: 400)
    - **chunk_overlap**: Overlap between chunks in tokens (default: 60)
    - **include_links**: Whether to include links in URL content (only applies to URL source type, default: None uses config default)
    """
    try:
        console_log(f"Received ingestion request for source: {request.source_name}")

        # Validate request
        if not request.data.strip():
            return throw_error(ThrowErrorArgs(error="Data cannot be empty!", errorType="BadRequestException"))

        if not request.source_name.strip():
            return throw_error(ThrowErrorArgs(error="Data cannot be empty!", errorType="BadRequestException"))

        # if request.user_email:
        #     user_data = await UserService().get_user(GetUserArgs(email=request.user_email))
        #     if is_error(user_data.error):
        #         return throw_error(ThrowErrorArgs(error="User not found!", errorType=user_data.error.errorType))

        # assert user_data.data is not None

        request.source_name = f"{request.source_name}" if request.user_email else request.source_name

        console_log(f"Request: {request}")
        # Process ingestion
        result = ingestion_service.ingest_document(request)
        if is_error(result.error):
            return throw_error(ThrowErrorArgs(error=result.error.error, errorType=result.error.errorType))

        console_log(f"Result: {result}")
        assert result.data is not None

        console_log(f"Ingestion completed successfully: {result.data.chunks_created} chunks created")
        return result.data

    except HTTPException:
        return throw_error(ThrowErrorArgs(error="Error during ingestion!", errorType="InternalServerErrorException"))
    except Exception:
        return throw_error(
            ThrowErrorArgs(error="Unexpected error during ingestion", errorType="InternalServerErrorException")
        )


@router.post("/crawl-url", response_model=IngestResponseType)
async def crawl_url(
    url: str,
    source_name: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    include_links: bool = False,
    ingestion_service: RAGIngestionService = Depends(get_ingestion_service),
):
    """
    Crawl a URL and ingest its content into the RAG system.

    - **url**: The URL to crawl
    - **source_name**: Optional name for the source (defaults to URL-based name)
    - **metadata**: Optional additional metadata to store with the document
    - **include_links**: Whether to include links in the scraped content (default: True)
    """
    try:
        console_log(f"Received URL crawl request for: {url}")

        # Validate request
        if not url.strip():
            return throw_error(ThrowErrorArgs(error="URL cannot be empty!", errorType="BadRequestException"))

        # Process URL crawling
        result = ingestion_service.crawl_url(url, source_name, metadata, include_links)
        if is_error(result.error):
            return throw_error(ThrowErrorArgs(error=result.error.error, errorType=result.error.errorType))

        assert result.data is not None

        console_log(f"URL crawl completed successfully: {result.data.chunks_created} chunks created")
        return result.data

    except HTTPException:
        return throw_error(ThrowErrorArgs(error="Error during URL crawling!", errorType="InternalServerErrorException"))
    except Exception:
        return throw_error(
            ThrowErrorArgs(error="Unexpected error during URL crawling", errorType="InternalServerErrorException")
        )


@router.post("/debug-base64")
async def debug_base64(
    data: str = Form(...),
    source_name: str = Form(...),
):
    """
    Debug endpoint to test base64 decoding without full processing.
    """
    try:
        import base64

        console_log(f"Debug base64 for source: {source_name}")
        console_log(f"Data length: {len(data)}")
        console_log(f"Data starts with: {data[:50]}...")

        # Try to decode
        try:
            decoded_data = base64.b64decode(data)
            console_log(f"Successfully decoded {len(decoded_data)} bytes")
            console_log(f"Decoded starts with: {decoded_data[:20]}")

            # Check if it looks like a PDF
            if decoded_data.startswith(b"%PDF-"):
                console_log("✅ Data appears to be a valid PDF")
                return {
                    "success": True,
                    "message": "Base64 decoding successful",
                    "decoded_length": len(decoded_data),
                    "is_pdf": True,
                    "pdf_header": decoded_data[:10].decode("utf-8", errors="ignore"),
                }
            else:
                console_log("❌ Data does not appear to be a PDF")
                return {
                    "success": True,
                    "message": "Base64 decoding successful but not a PDF",
                    "decoded_length": len(decoded_data),
                    "is_pdf": False,
                    "header": decoded_data[:20].decode("utf-8", errors="ignore"),
                }

        except Exception as decode_error:
            console_log(f"Base64 decode failed: {decode_error}")
            return {
                "success": False,
                "message": f"Base64 decode failed: {str(decode_error)}",
                "error": str(decode_error),
            }

    except Exception as e:
        console_log(f"Debug endpoint error: {str(e)}")
        return {"success": False, "message": f"Debug endpoint error: {str(e)}", "error": str(e)}


@router.post("/ingest-file", response_model=IngestResponseType)
async def ingest_file(
    file: UploadFile = File(...),
    source_name: str = Form(...),
    metadata: Optional[str] = Form(None),
    chunk_size: int = Form(400),
    chunk_overlap: int = Form(60),
    user_email: Optional[str] = Form(None),
    ingestion_service: RAGIngestionService = Depends(get_ingestion_service),
):
    """
    Ingest a file into the RAG system.

    - **file**: The file to upload (PDF, DOCX, DOC, PPTX, PPT, JSON)
    - **source_name**: Unique identifier for this document
    - **metadata**: Additional metadata as JSON string (optional)
    - **chunk_size**: Size of text chunks in tokens (default: 400)
    - **chunk_overlap**: Overlap between chunks in tokens (default: 60)
    - **user_email**: User email to get the user id from the DB (optional)
    """
    try:
        console_log(f"Received file upload request for source: {source_name}")

        # Validate file
        if not file.filename:
            return throw_error(ThrowErrorArgs(error="File name cannot be empty!", errorType="BadRequestException"))

        # Determine file type from extension
        file_extension = file.filename.split(".")[-1].lower()
        supported_types = ["pdf", "docx", "doc", "pptx", "ppt", "json"]

        if file_extension not in supported_types:
            return throw_error(
                ThrowErrorArgs(
                    error=f"Unsupported file type: {file_extension}. Supported types: {', '.join(supported_types)}",
                    errorType="BadRequestException",
                )
            )

        # Parse metadata if provided
        parsed_metadata = {}
        if metadata:
            try:
                import json

                parsed_metadata = json.loads(metadata)
            except json.JSONDecodeError:
                return throw_error(
                    ThrowErrorArgs(error="Invalid metadata JSON format!", errorType="BadRequestException")
                )

        # Handle user email if provided
        if user_email:
            user_data = await UserService().get_user(GetUserArgs(email=user_email))
            if is_error(user_data.error):
                return throw_error(ThrowErrorArgs(error="User not found!", errorType=user_data.error.errorType))

            assert user_data.data is not None
            source_name = f"{user_data.data.id}::{source_name}"

        # Read file data
        file_data = await file.read()

        # Create request object
        request = FileIngestRequestArgs(
            source_name=source_name,
            metadata=parsed_metadata,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            user_email=user_email,
        )

        # Process file ingestion
        result = ingestion_service.ingest_file(file_data, file_extension, request)
        if is_error(result.error):
            return throw_error(ThrowErrorArgs(error=result.error.error, errorType=result.error.errorType))

        assert result.data is not None

        console_log(f"File ingestion completed successfully: {result.data.chunks_created} chunks created")
        return result.data

    except Exception as e:
        console_log(f"Error in file ingestion endpoint: {str(e)}")
        return throw_error(
            ThrowErrorArgs(error=f"Internal server error: {str(e)}", errorType="InternalServerErrorException")
        )


@router.post("/query", response_model=QueryResponseType)
async def query_rag(request: QueryRequestArgs, query_service: RAGQueryService = Depends(get_query_service)):
    """
    Query the RAG system for answers.

    - **question**: The question to ask
    - **mode**: Query mode - "docs_only" (only from stored documents) or "open_internet" (can use internet)
    - **max_results**: Maximum number of relevant documents to retrieve (default: 5)
    - **temperature**: LLM temperature for response generation (default: 0.7)
    - **include_sources**: Whether to include source documents in response (default: True)
    - **vector_db_name**: Optional vector database name to query
    - **source_name**: Optional list of source names to filter results by
    """
    try:
        console_log(f"Received query request: {request.question[:100]}...")

        # Validate request
        if not request.question.strip():
            return throw_error(ThrowErrorArgs(error="Question cannot be empty!", errorType="BadRequestException"))

        # Process query
        result = await query_service.query(request)
        if is_error(result.error):
            return throw_error(ThrowErrorArgs(error=result.error.error, errorType=result.error.errorType))

        assert result.data is not None

        console_log(f"Query processed successfully with confidence: {result.data.confidence_score}")
        return result.data

    except HTTPException:
        return throw_error(ThrowErrorArgs(error="Error during query!", errorType="InternalServerErrorException"))
    except Exception as e:
        return throw_error(
            ThrowErrorArgs(error="Unexpected error during query", errorType="InternalServerErrorException")
        )


@router.get("/search")
async def search_documents(
    query: str,
    max_results: int = 5,
    vector_db_name: Optional[str] = None,
    source_name: Optional[List[str]] = None,
    query_service: RAGQueryService = Depends(get_query_service),
):
    """
    Search for similar documents without generating a response.

    - **query**: Search query
    - **max_results**: Maximum number of results to return (default: 5)
    - **vector_db_name**: Optional vector database name to search in
    - **source_name**: Optional list of source names to filter results by
    """
    try:
        if not query.strip():
            return throw_error(ThrowErrorArgs(error="Query cannot be empty!", errorType="BadRequestException"))

        if max_results < 1 or max_results > 20:
            return throw_error(
                ThrowErrorArgs(error="max_results must be between 1 and 20!", errorType="BadRequestException")
            )

        results = await query_service.get_similar_documents(query, max_results, vector_db_name, source_name)
        if is_error(results.error):
            return throw_error(ThrowErrorArgs(error=results.error.error, errorType=results.error.errorType))

        assert results.data is not None

        return {
            "query": query,
            "vector_db_used": vector_db_name or "default",
            "source_filter": source_name,
            "results": [
                {
                    "content": result.content,
                    "score": result.score,
                    "source": result.source,
                    "metadata": result.metadata,
                }
                for result in results.data
            ],
            "total_results": len(results.data),
        }

    except HTTPException:
        return throw_error(
            ThrowErrorArgs(error="Error during document search!", errorType="InternalServerErrorException")
        )
    except Exception:
        return throw_error(
            ThrowErrorArgs(error="Unexpected error during document search", errorType="InternalServerErrorException")
        )


@router.post("/documents/{source_name}/re-ingest")
async def re_ingest_document_with_cleaning(
    source_name: str, ingestion_service: RAGIngestionService = Depends(get_ingestion_service)
):
    """
    Re-ingest a document with text cleaning applied to existing content.

    - **source_name**: Name of the source to re-ingest with cleaning
    """
    try:
        if not source_name.strip():
            return throw_error(ThrowErrorArgs(error="Source name cannot be empty!", errorType="BadRequestException"))

        result = ingestion_service.re_ingest_document_with_cleaning(source_name)
        if is_error(result.error):
            return throw_error(ThrowErrorArgs(error=result.error.error, errorType=result.error.errorType))

        assert result.data is not None
        return result.data

    except HTTPException:
        return throw_error(
            ThrowErrorArgs(error="Error during document re-ingestion!", errorType="InternalServerErrorException")
        )
    except Exception:
        return throw_error(
            ThrowErrorArgs(
                error="Unexpected error during document re-ingestion", errorType="InternalServerErrorException"
            )
        )


@router.delete("/documents/{source_name}")
async def delete_document(source_name: str, ingestion_service: RAGIngestionService = Depends(get_ingestion_service)):
    """
    Delete all chunks for a specific document source.

    - **source_name**: Name of the source to delete
    """
    try:
        if not source_name.strip():
            return throw_error(ThrowErrorArgs(error="Source name cannot be empty!", errorType="BadRequestException"))

        success = ingestion_service.delete_document(source_name)
        if is_error(success.error):
            return throw_error(ThrowErrorArgs(error=success.error.error, errorType=success.error.errorType))

        assert success.data is not None

        if success.data:
            return {"message": f"Successfully deleted document: {source_name}"}
        else:
            return throw_error(
                ThrowErrorArgs(
                    error=f"Failed to delete document: {source_name}", errorType="InternalServerErrorException"
                )
            )

    except HTTPException:
        return throw_error(
            ThrowErrorArgs(error="Error during document deletion!", errorType="InternalServerErrorException")
        )
    except Exception:
        return throw_error(
            ThrowErrorArgs(error="Unexpected error during document deletion", errorType="InternalServerErrorException")
        )


@router.get("/stats")
async def get_stats(
    source_name: Optional[str] = None, ingestion_service: RAGIngestionService = Depends(get_ingestion_service)
):
    """
    Get statistics about stored documents.

    - **source_name**: Optional specific source name to get stats for
    """
    try:
        stats = ingestion_service.get_document_stats(source_name)
        if is_error(stats.error):
            return throw_error(ThrowErrorArgs(error=stats.error.error, errorType=stats.error.errorType))

        assert stats.data is not None
        return stats.data

    except Exception:
        return throw_error(
            ThrowErrorArgs(error="Unexpected error during document stats", errorType="InternalServerErrorException")
        )


@router.get("/health")
async def health_check(query_service: RAGQueryService = Depends(get_query_service)):
    """Check the health of the RAG system"""
    try:
        health_status = await query_service.health_check()
        if is_error(health_status.error):
            return throw_error(ThrowErrorArgs(error=health_status.error.error, errorType=health_status.error.errorType))

        assert health_status.data is not None
        return health_status.data

    except Exception:
        return throw_error(
            ThrowErrorArgs(error="Unexpected error during health check", errorType="InternalServerErrorException")
        )


@router.get("/config")
async def get_config():
    """Get current RAG configuration"""
    return {
        "embedding_model": "text-embedding-3-small",
        "llm_model": "gpt-4o-mini",
        "chunk_size": 400,  # Now in tokens
        "chunk_overlap": 60,  # Now in tokens
        "max_results": 5,
        "temperature": 0.7,
        "include_links_in_url_content": False,
        "use_mmr": True,
        "mmr_lambda": 0.5,
        "supported_source_types": DataSourceType,
        "supported_query_modes": QueryModeType,
    }


@router.post("/config")
async def update_config(config: RAGConfigType, background_tasks: BackgroundTasks):
    """
    Update RAG configuration.
    Note: This will reinitialize services with new configuration.
    """
    try:
        # In a production system, you'd want to persist this configuration
        # and reinitialize services. For now, we'll just return success.
        console_log(f"Configuration update requested: {config}")

        # Add background task to reinitialize services
        background_tasks.add_task(_reinitialize_services, config)

        return {"message": "Configuration updated successfully", "config": config}

    except Exception:
        return throw_error(
            ThrowErrorArgs(error="Error updating configuration", errorType="InternalServerErrorException")
        )


@router.post("/reinitialize")
async def reinitialize_services(background_tasks: BackgroundTasks):
    """
    Force reinitialize all services with current configuration.
    Useful for applying configuration changes without restarting the server.
    """
    try:
        console_log("Forcing service reinitialization...")

        # Reinitialize with default config (which now uses text-embedding-ada-002)
        background_tasks.add_task(_reinitialize_services, RAGConfigType())

        return {"message": "Services reinitialization initiated successfully"}

    except Exception:
        return throw_error(
            ThrowErrorArgs(error="Error reinitializing services", errorType="InternalServerErrorException")
        )


async def _reinitialize_services(config: RAGConfigType):
    """Background task to reinitialize services with new configuration"""
    global _ingestion_service, _query_service, _external_query_service

    try:
        console_log("Reinitializing services with new configuration...")

        _ingestion_service = RAGIngestionService(config)
        _query_service = RAGQueryService(config)
        _external_query_service = ExternalVectorDBQueryService(config)

        console_log("Services reinitialized successfully")
    except Exception:
        return throw_error(
            ThrowErrorArgs(error="Error reinitializing services", errorType="InternalServerErrorException")
        )


# External Vector Database Query Endpoints
@router.post("/external/query", response_model=ExternalQueryResponseType)
async def query_external_vector_db(
    request: ExternalQueryRequestArgs,
    external_query_service: ExternalVectorDBQueryService = Depends(get_external_query_service),
):
    """
    Query an external vector database for answers.

    - **question**: The question to ask
    - **vector_db_config**: Configuration for the external vector database
    - **mode**: Query mode - "docs_only" (only from stored documents) or "open_internet" (can use internet)
    - **max_results**: Maximum number of relevant documents to retrieve (default: 5)
    - **temperature**: LLM temperature for response generation (default: 0.7)
    - **include_sources**: Whether to include source documents in response (default: True)
    """
    try:
        console_log(f"Received external query request: {request.question[:100]}...")
        console_log(f"Target database: {request.vector_db_config.index_name}")

        # Validate request
        if not request.question.strip():
            return throw_error(ThrowErrorArgs(error="Question cannot be empty!", errorType="BadRequestException"))

        # Process external query
        result = await external_query_service.query_external_db(request)
        if is_error(result.error):
            return throw_error(ThrowErrorArgs(error=result.error.error, errorType=result.error.errorType))

        assert result.data is not None
        console_log(f"External query processed successfully with confidence: {result.data.confidence_score}")
        return result

    except HTTPException:
        return throw_error(
            ThrowErrorArgs(error="Error during external query!", errorType="InternalServerErrorException")
        )
    except Exception:
        return throw_error(
            ThrowErrorArgs(error="Unexpected error during external query", errorType="InternalServerErrorException")
        )


@router.get("/external/search")
async def search_external_documents(
    query: str,
    api_key: str,
    region: str,
    index_name: str,
    max_results: int = 5,
    external_query_service: ExternalVectorDBQueryService = Depends(get_external_query_service),
):
    """
    Search for similar documents in an external vector database without generating a response.

    - **query**: Search query
    - **api_key**: Pinecone API key for the external database
    - **region**: Pinecone region for the external database
    - **index_name**: Name of the index in the external database
    - **max_results**: Maximum number of results to return (default: 5)
    """
    try:
        if not query.strip():
            return throw_error(ThrowErrorArgs(error="Query cannot be empty!", errorType="BadRequestException"))

        if max_results < 1 or max_results > 20:
            return throw_error(
                ThrowErrorArgs(error="max_results must be between 1 and 20!", errorType="BadRequestException")
            )

        # Create vector DB config
        vector_db_config = ExternalVectorDBConfigType(api_key=api_key, region=region, index_name=index_name)

        results = await external_query_service.search_external_documents(query, max_results, vector_db_config)
        if is_error(results.error):
            return throw_error(ThrowErrorArgs(error=results.error.error, errorType=results.error.errorType))

        assert results.data is not None
        return {
            "query": query,
            "vector_db_used": index_name,
            "results": [
                {"content": result.content, "score": result.score, "source": result.source, "metadata": result.metadata}
                for result in results.data
            ],
            "total_results": len(results.data),
        }

    except HTTPException:
        return throw_error(
            ThrowErrorArgs(error="Error during external document search!", errorType="InternalServerErrorException")
        )
    except Exception:
        return throw_error(
            ThrowErrorArgs(
                error="Unexpected error during external document search", errorType="InternalServerErrorException"
            )
        )


@router.post("/external/test-connection")
async def test_external_connection(
    vector_db_config: ExternalVectorDBConfigType,
    external_query_service: ExternalVectorDBQueryService = Depends(get_external_query_service),
):
    """
    Test connection to an external vector database.

    - **api_key**: Pinecone API key for the external database
    - **region**: Pinecone region for the external database
    - **index_name**: Name of the index in the external database
    - **dimension**: Vector dimension (default: 1024)
    - **metric**: Distance metric (default: cosine)
    """
    try:
        console_log(f"Testing connection to external database: {vector_db_config.index_name}")

        result = await external_query_service.test_external_connection(vector_db_config)
        if is_error(result.error):
            return throw_error(ThrowErrorArgs(error=result.error.error, errorType=result.error.errorType))

        assert result.data is not None
        if result.data["status"] == "connected":
            return result.data
        else:
            return throw_error(ThrowErrorArgs(error=result.data["message"], errorType="BadRequestException"))

    except HTTPException:
        return throw_error(
            ThrowErrorArgs(error="Error during external connection test!", errorType="InternalServerErrorException")
        )
    except Exception:
        return throw_error(ThrowErrorArgs(error="Internal server error", errorType="InternalServerErrorException"))
