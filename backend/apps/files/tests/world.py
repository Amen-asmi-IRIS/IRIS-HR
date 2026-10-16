from django.core.files.uploadedfile import SimpleUploadedFile

PDF_BYTES = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
JPG_BYTES = b"\xff\xd8\xff\xe0" + b"\x00" * 32


def upload(
    name: str = "contract.pdf", content: bytes = PDF_BYTES, content_type: str = "application/pdf"
) -> SimpleUploadedFile:
    return SimpleUploadedFile(name, content, content_type=content_type)
