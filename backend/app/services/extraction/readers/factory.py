"""Factory for instantiating the appropriate DocumentReader."""

from app.services.extraction.readers.base import AbstractDocumentReader
from app.services.extraction.readers.pdf_reader import PDFDocumentReader
from app.services.extraction.readers.image_reader import ImageDocumentReader
from app.services.extraction.readers.docx_reader import DOCXDocumentReader
from app.services.storage import storage_service

_READERS = [
    PDFDocumentReader(),
    ImageDocumentReader(),
    DOCXDocumentReader(),
]


def get_document_reader_for_format(format_key: str) -> AbstractDocumentReader:
    """Return reader corresponding to format key."""
    for r in _READERS:
        if r.can_read(format_key):
            return r
    # Fallback to PDF reader
    return _READERS[0]


def get_document_reader(content: bytes, filename: str) -> tuple[AbstractDocumentReader, str]:
    """Detect format from content bytes and filename, returning the matching reader."""
    fmt, err = storage_service.detect_file_format(content, filename)
    reader = get_document_reader_for_format(fmt)
    return reader, fmt
