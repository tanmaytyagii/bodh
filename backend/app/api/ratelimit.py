"""A small in-process rate limiter for the endpoints that call the LLM.

Per-client sliding window keyed by IP address. Adequate for a single API
process; behind several replicas, enforce limits at the proxy or gateway.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request


class RateLimiter:
    def __init__(self, per_minute: int) -> None:
        self.per_minute = per_minute
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> None:
        if self.per_minute <= 0:
            return
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] > 60:
                hits.popleft()
            if len(hits) >= self.per_minute:
                retry = int(60 - (now - hits[0])) + 1
                raise HTTPException(
                    status_code=429,
                    detail="Too many questions in a short time. Please wait a minute and try again.",
                    headers={"Retry-After": str(retry)},
                )
            hits.append(now)


def client_key(request: Request, *, trust_forwarded_for: bool = False) -> str:
    if trust_forwarded_for:
        forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        if forwarded:
            return forwarded
    return request.client.host if request.client else "unknown"
