# API image: FastAPI + retrieval + generation.
#
#   docker build -t bodh-api backend/
#
# The processed corpus (data/processed) ships in the image. The embedding model
# is downloaded at build time so the container starts offline-ready; pass
# --build-arg PRELOAD_MODEL=0 to download it on first start instead.

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY pyproject.toml constraints.txt ./
COPY app ./app
RUN pip install -c constraints.txt .

COPY migrations ./migrations
COPY data ./data
COPY docker-entrypoint.sh ./

ARG PRELOAD_MODEL=1
RUN if [ "$PRELOAD_MODEL" = "1" ]; then \
      python -c "from app.retrieval.embeddings import get_embedder; get_embedder()"; \
    fi

RUN useradd --create-home --uid 10001 app && chown -R app /app
USER app

EXPOSE 8000
ENTRYPOINT ["./docker-entrypoint.sh"]
# No access log: URLs such as /search?q=... contain what people typed. The
# service logs one content-free line per answer instead (see docs/SAFETY.md).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--no-access-log"]
