"""Test support: every test stores files in its own temporary folder."""

from pathlib import Path

import pytest
from cryptography.fernet import Fernet


@pytest.fixture(autouse=True)
def files_root(settings, tmp_path) -> Path:
    root = tmp_path / "files"
    root.mkdir()
    settings.FILES_ROOT = str(root)
    settings.FILE_ENCRYPTION_KEY = Fernet.generate_key().decode()
    return root
