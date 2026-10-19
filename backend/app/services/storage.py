"""StorageService — Local secure file storage and PDF validation.

Follows blueprint Section 6.1, 10.1, and 12:
- Files are saved with random UUID names, NEVER the original filename.
- Files reside outside the public frontend in data/uploads/ (git-ignored).
- Prevents path traversal attacks by validating resolved paths.
- Computes SHA-256 for duplicate detection.
- Validates magic bytes, size limits, and checks PDF integrity via PyMuPDF.
- Does not log medical document contents.
"""

import hashlib
import uuid
from pathlib import Path
from typing import Tuple

import fitz  # PyMuPDF
from app.core.config import settings


class StorageService:
    def __init__(self, upload_dir: str | None = None):
        target = upload_dir or settings.UPLOAD_DIR
        self.upload_dir = Path(target).resolve()
        self.upload_dir.mkdir(parents=True, exist_ok=True)

    def compute_sha256(self, content: bytes) -> str:
        """Compute SHA-256 hex digest of file bytes."""
        return hashlib.sha256(content).hexdigest()

    def validate_pdf(
        self, content: bytes, original_filename: str
    ) -> Tuple[bool, int, str | None]:
        """Validate PDF file content.

        Checks:
        1. Non-empty file
        2. Size limit (<= MAX_FILE_SIZE_BYTES)
        3. Extension ends with .pdf
        4. PDF magic bytes (%PDF)
        5. Valid structure and readable pages via PyMuPDF

        Returns: (is_valid, page_count, error_message)
        """
        # Check extension
        if not original_filename.lower().endswith(".pdf"):
            return False, 0, "File must have a .pdf extension."

        # Check empty file
        if len(content) == 0:
            return False, 0, "The uploaded file is empty."

        # Check size limit
        if len(content) > settings.MAX_FILE_SIZE_BYTES:
            max_mb = settings.MAX_FILE_SIZE_BYTES // (1024 * 1024)
            return False, 0, f"File exceeds maximum allowed size of {max_mb} MB."

        # Check magic bytes: standard PDFs start with %PDF- (or within the first 1024 bytes)
        header = content[:1024]
        if b"%PDF-" not in header:
            return False, 0, "Invalid PDF file: Missing %PDF header signature."

        # Inspect structure and page count using PyMuPDF defensively
        try:
            doc = fitz.open(stream=content, filetype="pdf")
            if doc.is_encrypted:
                doc.close()
                return False, 0, "Password-protected or encrypted PDFs are not supported."

            page_count = doc.page_count
            doc.close()

            if page_count <= 0:
                return False, 0, "PDF contains no readable pages."

            return True, page_count, None
        except Exception:
            return False, 0, "Corrupt or invalid PDF file structure."

    def save_file(self, content: bytes) -> str:
        """Save file bytes with a random UUID name to prevent collision and disclosure.

        Returns: storage_key (e.g. "<uuid>.pdf")
        """
        storage_key = f"{uuid.uuid4()}.pdf"
        target_path = (self.upload_dir / storage_key).resolve()

        # Path traversal guard: target must stay strictly within upload_dir
        if not str(target_path).startswith(str(self.upload_dir)):
            raise ValueError("Path traversal attempt detected.")

        with open(target_path, "wb") as f:
            f.write(content)

        return storage_key

    def get_file_path(self, storage_key: str) -> Path | None:
        """Resolve storage_key to an absolute Path, guarding against traversal."""
        # Sanitize storage_key to basename only
        safe_name = Path(storage_key).name
        target_path = (self.upload_dir / safe_name).resolve()

        if not str(target_path).startswith(str(self.upload_dir)):
            return None

        if not target_path.is_file():
            return None

        return target_path

    def delete_file(self, storage_key: str) -> bool:
        """Delete file from disk if it exists."""
        safe_name = Path(storage_key).name
        target_path = (self.upload_dir / safe_name).resolve()

        if not str(target_path).startswith(str(self.upload_dir)):
            return False

        if target_path.is_file():
            try:
                target_path.unlink()
                return True
            except OSError:
                return False
        return False


# Singleton instance
storage_service = StorageService()
