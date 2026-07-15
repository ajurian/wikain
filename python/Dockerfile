# The Wikain language service (spaCy + the DeepSeek judge). Dev: docker compose. Prod: Cloud Run.
FROM python:3.13-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1

# Dependencies first, so a source edit does not re-resolve or re-download the ~50MB spaCy model.
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-install-project --no-dev

COPY src ./src
RUN uv sync --locked --no-dev

# The content pipeline ships in the image too — it imports the same `wikain.nlp`, and that shared
# import is what guarantees Stage C and the runtime can never grade a sentence differently.

ENV PATH="/app/.venv/bin:$PATH"

# Cloud Run injects PORT; default to 8000 for `docker compose` and local runs.
ENV PORT=8000
EXPOSE 8000

# One worker: spaCy's model is loaded per process, so extra workers multiply memory for no gain —
# scale with Cloud Run instances instead.
CMD exec uvicorn wikain.service.main:app --host 0.0.0.0 --port ${PORT} --workers 1
