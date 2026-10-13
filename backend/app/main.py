"""FastAPI application.

uvicorn app.main:app --reload            (from backend/)
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.container import build_container
from app.api.ratelimit import RateLimiter
from app.api.routes import router
from app.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    logging.basicConfig(
        level=settings.log_level.upper(), format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.container = build_container(settings)
        app.state.ask_limiter = RateLimiter(settings.ask_rate_limit_per_minute)
        try:
            yield
        finally:
            app.state.container.close()

    app = FastAPI(
        title="BODH API",
        version=__version__,
        description=(
            "Grounded guidance from the Bhagavad Gita and the Upanishads: hybrid retrieval over a "
            "verified corpus, structured answers with verified citations, and a scripture explorer."
        ),
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )
    app.include_router(router)
    return app


app = create_app()
