"""StorageService — Secure file storage abstraction and PDF validation.

Follows blueprint Section 6.1, 10.1, and 12:
- Files are saved with random UUID names, NEVER the original filename.
- Supports both local filesystem storage (default) and S3-compatible object storage (AWS S3, Cloudflare R2, MinIO).
- Prevents path traversal attacks by validating resolved paths.
- Computes SHA-256 for duplicate detection.
- Validates magic bytes, size limits, and checks PDF integrity via PyMuPDF.
- Does not log medical document contents.
"""

import hashlib
import io
import uuid
import logging
from pathlib import Path
from typing import Tuple, Optional

import fitz  # PyMuPDF
from app.core.config import settings

logger = logging.getLogger(__name__)

# Anchor relative paths to the repo root rather than CWD.
# storage.py lives at: backend/app/services/storage.py
# parents: [0]=services/, [1]=app/, [2]=backend/, [3]=repo root
_REPO_ROOT = Path(__file__).resolve().parents[3]


def _resolve_storage_dir(configured: str) -> Path:
    """Resolve a storage directory path anchored to the repo root when relative."""
    p = Path(configured)
    if p.is_absolute():
        return p
    if p.parts and p.parts[0] == "..":
        backend_dir = _REPO_ROOT / "backend"
        return (backend_dir / p).resolve()
    return (_REPO_ROOT / p).resolve()


class StorageService:
    def __init__(self, upload_dir: str | None = None):
        target = upload_dir or settings.UPLOAD_DIR
        self.upload_dir = _resolve_storage_dir(target)
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        self.backend = getattr(settings, "STORAGE_BACKEND", "local").lower()
        self._s3_client = None

        if self.backend == "s3" and getattr(settings, "S3_BUCKET_NAME", None):
            self._init_s3_client()

    def _init_s3_client(self):
        """Initialize S3 client if boto3 is installed and credentials exist."""
        try:
            import boto3
            from botocore.config import Config

            session_kwargs = {}
            if getattr(settings, "S3_ACCESS_KEY_ID", None) and getattr(settings, "S3_SECRET_ACCESS_KEY", None):
                session_kwargs["aws_access_key_id"] = settings.S3_ACCESS_KEY_ID
                session_kwargs["aws_secret_access_key"] = settings.S3_SECRET_ACCESS_KEY
            if getattr(settings, "S3_REGION_NAME", None):
                session_kwargs["region_name"] = settings.S3_REGION_NAME

            client_kwargs = {}
            if getattr(settings, "S3_ENDPOINT_URL", None):
                client_kwargs["endpoint_url"] = settings.S3_ENDPOINT_URL

            self._s3_client = boto3.client("s3", config=Config(signature_version="s3v4"), **session_kwargs, **client_kwargs)
        except Exception as e:
            logger.warning(f"Failed to initialize S3 storage client: {e}. Falling back to local storage.")
            self._s3_client = None

    def compute_sha256(self, content: bytes) -> str:
        """Compute SHA-256 hex digest of file bytes."""
        return hashlib.sha256(content).hexdigest()

    def detect_file_format(self, content: bytes, original_filename: str) -> Tuple[str, str | None]:
        """Detect file format based on magic bytes signature and filename extension.

        Returns:
            (format_key, error_message)
            format_key is one of: "pdf", "image_jpeg", "image_png", "image_tiff", "docx", "doc", "unknown"
        """
        clean_name = (original_filename or "").strip().lower()
        header = content[:4096] if len(content) >= 4096 else content

        # Allowed extensions
        allowed_extensions = {".pdf", ".jpg", ".jpeg", ".png", ".tif", ".tiff", ".docx", ".doc"}
        has_allowed_ext = any(clean_name.endswith(ext) for ext in allowed_extensions)
        if not has_allowed_ext:
            return "unknown", "Invalid file format: Only documents with a .pdf, image (.jpg, .png, .tiff), or .docx extension are accepted."

        # Check for extension vs magic bytes mismatch
        if clean_name.endswith(".docx"):
            if b"%PDF-" in header:
                return "unknown", "Invalid file format: File has .docx extension but contains PDF data. Please upload with a .pdf extension."
            if not (len(content) >= 4 and content[:4] == b"PK\x03\x04"):
                return "unknown", "Corrupted DOCX: File does not have a valid Word archive signature. Please upload a valid .docx or .pdf report."
            return "docx", None

        if clean_name.endswith(".pdf"):
            if b"%PDF-" not in header and content.find(b"%PDF-") == -1:
                return "unknown", "Invalid PDF: Missing %PDF header — not a valid .pdf file."
            return "pdf", None

        if clean_name.endswith((".jpg", ".jpeg")):
            if len(content) >= 3 and content[:3] == b"\xff\xd8\xff":
                return "image_jpeg", None
            return "image_jpeg", None  # Allow PyMuPDF pixmap to validate

        if clean_name.endswith(".png"):
            if len(content) >= 8 and content[:8] == b"\x89PNG\r\n\x1a\n":
                return "image_png", None
            return "image_png", None

        if clean_name.endswith((".tif", ".tiff")):
            return "image_tiff", None

        if clean_name.endswith(".doc"):
            return "doc", None

        return "unknown", "Invalid file format: Only documents with a .pdf, image (.jpg, .png, .tiff), or .docx extension are accepted."

    def validate_file(
        self, content: bytes, original_filename: str
    ) -> Tuple[bool, int, str, Optional[str]]:
        """Validate uploaded laboratory report document defensively across all supported formats.

        Checks:
        1. Non-empty file
        2. Size limit (<= MAX_FILE_SIZE_BYTES)
        3. File signature and extension validation
        4. Decompression bomb protection (image resolution / zip compression ratio)
        5. Page and structure validity
        6. Password protection / encryption handling

        Returns:
            (is_valid, page_count, format_key, error_message)
        """
        clean_filename = (original_filename or "").strip()

        # Check empty file
        if len(content) == 0:
            return False, 0, "unknown", "The uploaded file is empty (0 bytes)."

        # Check size limit
        if len(content) > settings.MAX_FILE_SIZE_BYTES:
            max_mb = settings.MAX_FILE_SIZE_BYTES // (1024 * 1024)
            size_mb = len(content) / (1024 * 1024)
            return False, 0, "unknown", f"File size ({size_mb:.1f} MB) exceeds maximum allowed size of {max_mb} MB."

        # Detect format
        fmt, err = self.detect_file_format(content, clean_filename)
        if fmt == "unknown":
            return False, 0, fmt, err

        # Handle legacy DOC
        if fmt == "doc":
            return (
                False,
                0,
                fmt,
                "Legacy Microsoft Word (.doc) binary format cannot be safely converted in this environment. Please save or export your report as a PDF or .docx file and upload again.",
            )

        # Handle PDF
        if fmt == "pdf":
            # PDF magic bytes check
            if b"%PDF-" not in content[:4096] and content.find(b"%PDF-") == -1:
                return False, 0, fmt, "Invalid PDF: Missing %PDF header — not a valid PDF file."

            try:
                doc = fitz.open(stream=content, filetype="pdf")
            except Exception as e:
                return False, 0, fmt, f"Corrupted PDF: Document structure cannot be parsed ({type(e).__name__})."

            try:
                if doc.is_encrypted:
                    auth_success = doc.authenticate("")
                    if not auth_success:
                        doc.close()
                        return (
                            False,
                            0,
                            fmt,
                            "Password-protected PDF: This document is encrypted with a password and cannot be processed. Please provide an unlocked PDF.",
                        )

                page_count = doc.page_count
                doc.close()

                if page_count <= 0:
                    return False, 0, fmt, "PDF contains no readable pages."
                if page_count > 100:
                    return False, 0, fmt, f"Document exceeds page limit of 100 pages ({page_count} pages detected)."

                return True, page_count, fmt, None
            except Exception as e:
                return False, 0, fmt, f"Corrupted or unsupported PDF structure ({str(e)})."

        # Handle Images (JPEG, PNG, TIFF)
        if fmt in ("image_jpeg", "image_png", "image_tiff"):
            try:
                pix = fitz.Pixmap(content)
            except Exception as e:
                return False, 0, fmt, f"Corrupted image: Unable to decode image data ({type(e).__name__})."

            # Decompression bomb defense: max 50 megapixels or 12000px per dimension
            if pix.width > 12000 or pix.height > 12000 or (pix.width * pix.height) > 50_000_000:
                return (
                    False,
                    0,
                    fmt,
                    f"Image dimensions ({pix.width}x{pix.height}) exceed maximum safe processing limit (potential decompression bomb).",
                )

            return True, 1, fmt, None

        # Handle DOCX
        if fmt == "docx":
            import zipfile
            try:
                with zipfile.ZipFile(io.BytesIO(content)) as zf:
                    # Decompression bomb checks
                    total_uncompressed = sum(info.file_size for info in zf.infolist())
                    if total_uncompressed > 50 * 1024 * 1024:
                        return (
                            False,
                            0,
                            fmt,
                            "DOCX document uncompressed size exceeds safe limit of 50 MB.",
                        )
                    if len(content) > 0 and (total_uncompressed / len(content)) > 100:
                        return (
                            False,
                            0,
                            fmt,
                            "Suspicious compression ratio detected in DOCX (potential zip bomb).",
                        )

                    # Verify word/document.xml exists
                    namelist = zf.namelist()
                    if "word/document.xml" not in namelist:
                        return (
                            False,
                            0,
                            fmt,
                            "Invalid DOCX file: Missing 'word/document.xml' content component.",
                        )

                return True, 1, fmt, None
            except zipfile.BadZipFile:
                return False, 0, fmt, "Corrupted DOCX: Not a valid ZIP/Word archive."
            except Exception as e:
                return False, 0, fmt, f"Unable to read DOCX document ({type(e).__name__})."

        # Handle legacy DOC
        if fmt == "doc":
            return (
                False,
                0,
                "doc",
                "Legacy .doc (Word 97-2003) format cannot be safely converted in this environment. Please save as modern .docx or .pdf before uploading.",
            )

        return False, 0, "unknown", "Unrecognized file format."

    def validate_pdf(
        self, content: bytes, original_filename: str
    ) -> Tuple[bool, int, str | None]:
        """Validate PDF file content (retained for backward compatibility)."""
        is_valid, page_count, fmt, err_msg = self.validate_file(content, original_filename)
        if fmt != "pdf" and is_valid:
            # If a non-pdf file was validated via validate_pdf, let it pass
            return True, page_count, None
        return is_valid, page_count, err_msg

    def convert_image_to_pdf(self, image_bytes: bytes) -> bytes:
        """Convert raw image bytes (JPEG, PNG, TIFF) to a standard PDF document (multi-page if multi-frame TIFF)."""
        # First attempt opening as a multi-frame image document (e.g. multi-page TIFF)
        try:
            img_doc = fitz.open(stream=image_bytes)
            if len(img_doc) > 1:
                pdf_doc = fitz.open()
                page_w, page_h = 595.0, 842.0
                for img_page in img_doc:
                    pix = img_page.get_pixmap()
                    avail_w = page_w - 40
                    avail_h = page_h - 40
                    scale = min(avail_w / max(pix.width, 1), avail_h / max(pix.height, 1), 1.0)
                    img_w = pix.width * scale
                    img_h = pix.height * scale
                    x0 = (page_w - img_w) / 2
                    y0 = (page_h - img_h) / 2
                    p = pdf_doc.new_page(width=page_w, height=page_h)
                    p.insert_image(fitz.Rect(x0, y0, x0 + img_w, y0 + img_h), pixmap=pix)
                pdf_bytes = pdf_doc.tobytes()
                pdf_doc.close()
                img_doc.close()
                return pdf_bytes
            img_doc.close()
        except Exception:
            pass

        try:
            pix = fitz.Pixmap(image_bytes)
            doc = fitz.open()
            # Standard A4 proportions in points (595 x 842)
            page_w = 595.0
            page_h = 842.0

            # Scale image proportionally to fit within page with 20pt margin
            avail_w = page_w - 40
            avail_h = page_h - 40
            scale = min(avail_w / max(pix.width, 1), avail_h / max(pix.height, 1), 1.0)
            img_w = pix.width * scale
            img_h = pix.height * scale

            x0 = (page_w - img_w) / 2
            y0 = (page_h - img_h) / 2
            rect = fitz.Rect(x0, y0, x0 + img_w, y0 + img_h)

            page = doc.new_page(width=page_w, height=page_h)
            page.insert_image(rect, pixmap=pix)
            pdf_bytes = doc.tobytes()
            doc.close()
            return pdf_bytes
        except Exception as e:
            logger.warning(f"Failed to convert image to PDF with Pixmap ({e}); attempting direct insert.")
            doc = fitz.open()
            page = doc.new_page(width=595, height=842)
            page.insert_image(page.rect, stream=image_bytes)
            pdf_bytes = doc.tobytes()
            doc.close()
            return pdf_bytes

    def convert_docx_to_pdf(self, docx_bytes: bytes, filename: str = "report.docx") -> bytes:
        """Convert a DOCX file to a clean, readable PDF for visual review."""
        import zipfile
        import xml.etree.ElementTree as ET

        doc = fitz.open()
        page = doc.new_page(width=595, height=842)
        y = 50.0
        margin_x = 50.0
        max_w = 595.0 - (margin_x * 2)

        # Header
        page.insert_text(fitz.Point(margin_x, y), f"Document: {filename}", fontsize=14, fontname="helv", color=(0.1, 0.2, 0.4))
        y += 24.0

        try:
            with zipfile.ZipFile(io.BytesIO(docx_bytes)) as zf:
                if "word/document.xml" in zf.namelist():
                    tree = ET.fromstring(zf.read("word/document.xml"))
                    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
                    body = tree.find("w:body", ns)

                    if body is not None:
                        for elem in body:
                            tag = elem.tag.split("}")[-1]
                            if tag == "p":
                                p_text = "".join(elem.itertext()).strip()
                                if p_text:
                                    if y > 780:
                                        page = doc.new_page(width=595, height=842)
                                        y = 50.0
                                    rect = fitz.Rect(margin_x, y, margin_x + max_w, y + 30)
                                    page.insert_textbox(rect, p_text, fontsize=10, fontname="helv")
                                    y += 18.0
                            elif tag == "tbl":
                                for tr in elem.findall("w:tr", ns):
                                    row_cells = ["".join(tc.itertext()).strip() for tc in tr.findall("w:tc", ns)]
                                    if any(row_cells):
                                        if y > 780:
                                            page = doc.new_page(width=595, height=842)
                                            y = 50.0
                                        # Render tabular row cleanly
                                        col_w = max_w / max(len(row_cells), 1)
                                        for idx, cell_text in enumerate(row_cells):
                                            c_rect = fitz.Rect(margin_x + (idx * col_w), y, margin_x + ((idx + 1) * col_w) - 5, y + 20)
                                            page.insert_textbox(c_rect, cell_text[:40], fontsize=9, fontname="helv")
                                        y += 18.0
                                y += 10.0
        except Exception as e:
            logger.warning(f"Error parsing DOCX content for visual PDF rendering: {e}")
            page.insert_text(fitz.Point(margin_x, y), "Word Document (.docx) - Review extracted table below.", fontsize=11)

        pdf_bytes = doc.tobytes()
        doc.close()
        return pdf_bytes

    def prepare_renderable_pdf(self, content: bytes, fmt: str, filename: str) -> bytes:
        """Ensure content is represented as a PDF for viewing in the split-screen modal."""
        if fmt == "pdf":
            return content
        if fmt in ("image_jpeg", "image_png", "image_tiff"):
            return self.convert_image_to_pdf(content)
        if fmt == "docx":
            return self.convert_docx_to_pdf(content, filename)
        return content

    def save_file(self, content: bytes) -> str:
        """Save file bytes with a random UUID name to prevent collision and disclosure.

        Returns: storage_key (e.g. "<uuid>.pdf")
        """
        storage_key = f"{uuid.uuid4()}.pdf"

        # If S3 backend is configured and available
        if self._s3_client and getattr(settings, "S3_BUCKET_NAME", None):
            try:
                self._s3_client.put_object(
                    Bucket=settings.S3_BUCKET_NAME,
                    Key=f"reports/{storage_key}",
                    Body=content,
                    ContentType="application/pdf",
                )
                return storage_key
            except Exception as e:
                logger.error(f"S3 put_object failed for {storage_key}: {e}. Falling back to local disk.")

        # Local filesystem fallback
        target_path = (self.upload_dir / storage_key).resolve()

        # Path traversal guard: target must stay strictly within upload_dir
        if not str(target_path).startswith(str(self.upload_dir)):
            raise ValueError("Path traversal attempt detected.")

        with open(target_path, "wb") as f:
            f.write(content)

        return storage_key

    def get_file_bytes(self, storage_key: str) -> bytes | None:
        """Retrieve file bytes securely from S3 or local disk."""
        safe_name = Path(storage_key).name

        # Try S3 first if configured
        if self._s3_client and getattr(settings, "S3_BUCKET_NAME", None):
            try:
                resp = self._s3_client.get_object(
                    Bucket=settings.S3_BUCKET_NAME,
                    Key=f"reports/{safe_name}",
                )
                return resp["Body"].read()
            except Exception as e:
                logger.warning(f"S3 get_object failed for {safe_name}: {e}. Checking local disk.")

        # Fallback to local disk
        target_path = (self.upload_dir / safe_name).resolve()
        if not str(target_path).startswith(str(self.upload_dir)):
            return None
        if target_path.is_file():
            try:
                with open(target_path, "rb") as f:
                    return f.read()
            except OSError:
                return None
        return None

    def get_file_path(self, storage_key: str) -> Path | None:
        """Resolve storage_key to an absolute local Path if on disk, guarding against traversal."""
        safe_name = Path(storage_key).name
        target_path = (self.upload_dir / safe_name).resolve()

        if not str(target_path).startswith(str(self.upload_dir)):
            return None

        if not target_path.is_file():
            # If stored in S3, download to local cache temporarily
            s3_bytes = self.get_file_bytes(storage_key)
            if s3_bytes:
                try:
                    with open(target_path, "wb") as f:
                        f.write(s3_bytes)
                    return target_path
                except OSError:
                    return None
            return None

        return target_path

    def delete_file(self, storage_key: str) -> bool:
        """Delete file from S3 or local disk."""
        safe_name = Path(storage_key).name
        deleted = False

        if self._s3_client and getattr(settings, "S3_BUCKET_NAME", None):
            try:
                self._s3_client.delete_object(
                    Bucket=settings.S3_BUCKET_NAME,
                    Key=f"reports/{safe_name}",
                )
                deleted = True
            except Exception as e:
                logger.error(f"S3 delete_object failed for {safe_name}: {e}")

        target_path = (self.upload_dir / safe_name).resolve()
        if str(target_path).startswith(str(self.upload_dir)) and target_path.is_file():
            try:
                target_path.unlink()
                deleted = True
            except OSError:
                pass

        return deleted


# Singleton instance
storage_service = StorageService()
