"""Shared utility functions for the worker pipeline."""


def detect_mime_type(image_bytes: bytes) -> str:
    """Detect actual MIME type from magic bytes. Do not trust file extensions or stored content_type."""
    if image_bytes[:8] == b'\x89PNG\r\n\x1a\n':
        return "image/png"
    if image_bytes[:3] == b'\xff\xd8\xff':
        return "image/jpeg"
    if image_bytes[:4] == b'%PDF':
        return "application/pdf"
    if image_bytes[:4] == b'RIFF' and image_bytes[8:12] == b'WEBP':
        return "image/webp"
    return "image/jpeg"
