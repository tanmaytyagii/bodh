"""Polite, cached downloads of source texts.

Every downloaded file is recorded in a per-source `manifest.json` (URL, time of
retrieval, byte size, SHA-256). Raw snapshots are kept in the repository so a
processed corpus can always be rebuilt from, and traced back to, the exact
bytes it came from — even if the upstream page is later edited.
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

import httpx

from app.config import DATA_DIR, get_settings

RAW_DIR = DATA_DIR / "raw"


@dataclass
class RawFile:
    filename: str
    url: str
    retrieved_at: str
    sha256: str
    bytes: int


class SourceCache:
    """Raw-file cache for one source, e.g. `data/raw/wikisource-besant-gita/`."""

    def __init__(self, name: str, *, min_interval: float = 1.0) -> None:
        self.dir = RAW_DIR / name
        self.manifest_path = self.dir / "manifest.json"
        self.min_interval = min_interval
        self._last_request = 0.0
        self._manifest: dict[str, RawFile] = {}
        if self.manifest_path.exists():
            data = json.loads(self.manifest_path.read_text(encoding="utf-8"))
            self._manifest = {k: RawFile(**v) for k, v in data.items()}

    def path(self, filename: str) -> Path:
        return self.dir / filename

    def record(self, filename: str) -> RawFile | None:
        return self._manifest.get(filename)

    def get(self, filename: str, url: str, *, refresh: bool = False) -> bytes:
        """Return cached bytes for `filename`, downloading `url` if needed."""
        target = self.path(filename)
        if target.exists() and not refresh and filename in self._manifest:
            data = target.read_bytes()
            expected = self._manifest[filename].sha256
            if hashlib.sha256(data).hexdigest() != expected:
                raise RuntimeError(
                    f"{target} does not match the checksum in its manifest. "
                    "Re-run the fetch with --refresh, or restore the file."
                )
            return data
        data = self._download(url)
        self.dir.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        self._manifest[filename] = RawFile(
            filename=filename,
            url=url,
            retrieved_at=datetime.now(UTC).replace(microsecond=0).isoformat(),
            sha256=hashlib.sha256(data).hexdigest(),
            bytes=len(data),
        )
        self._save_manifest()
        return data

    def _download(self, url: str) -> bytes:
        wait = self.min_interval - (time.monotonic() - self._last_request)
        if wait > 0:
            time.sleep(wait)
        headers = {"User-Agent": get_settings().ingest_user_agent}
        last_error: str = ""
        for attempt in range(6):
            try:
                # HTTP/2: Wikimedia's bot filtering rejects some HTTP/1.1 clients.
                with httpx.Client(http2=True, timeout=60, follow_redirects=True, headers=headers) as client:
                    response = client.get(url)
            except httpx.TransportError as exc:
                last_error = str(exc)
                time.sleep(5 * 2**attempt)
                continue
            self._last_request = time.monotonic()
            if response.status_code in (429, 500, 502, 503, 504):
                last_error = f"HTTP {response.status_code}"
                time.sleep(_retry_delay(response, attempt))
                continue
            response.raise_for_status()
            return response.content
        raise RuntimeError(f"Could not download {url}: {last_error}")

    def _save_manifest(self) -> None:
        self.dir.mkdir(parents=True, exist_ok=True)
        ordered = {k: asdict(self._manifest[k]) for k in sorted(self._manifest)}
        self.manifest_path.write_text(
            json.dumps(ordered, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )


def _retry_delay(response: httpx.Response, attempt: int) -> float:
    """Honour Retry-After (seconds) when the server sends it; otherwise back off."""
    header = response.headers.get("retry-after", "")
    if header.isdigit():
        return min(float(header), 120.0)
    return min(10.0 * 2**attempt, 120.0)
