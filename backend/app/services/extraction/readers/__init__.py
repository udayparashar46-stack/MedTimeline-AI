"""Universal document readers package."""

from app.services.extraction.readers.base import (
    DocumentContent,
    DocumentPage,
    ExtractedTable,
    AbstractDocumentReader,
)
from app.services.extraction.readers.factory import (
    get_document_reader,
    get_document_reader_for_format,
)

__all__ = [
    "DocumentContent",
    "DocumentPage",
    "ExtractedTable",
    "AbstractDocumentReader",
    "get_document_reader",
    "get_document_reader_for_format",
]
