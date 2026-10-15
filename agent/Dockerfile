# Imagen del asistente para Cloud Run (escucha en $PORT, usuario no root).
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8080 \
    REPOSITORY_BACKEND=firestore

WORKDIR /srv

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
 && useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin app

COPY app ./app

USER 10001
EXPOSE 8080

# Sin access log de uvicorn (registraría IPs); los logs propios son JSON sin datos sensibles.
CMD ["sh", "-c", "exec uvicorn app.main:create_app --factory --host 0.0.0.0 --port ${PORT} --no-access-log --no-server-header --timeout-graceful-shutdown 10"]
