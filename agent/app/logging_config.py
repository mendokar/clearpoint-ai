"""Logs estructurados en JSON (formato que Cloud Logging entiende).

Regla: nunca se registran tokens, claves, contenido de mensajes ni datos personales.
Solo metadatos (evento, duración, proveedor, nombre de tool, tipo de error...).
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone

_RESERVED = set(vars(logging.makeLogRecord({})).keys()) | {"message", "asctime"}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "severity": record.levelname,
            "time": datetime.now(timezone.utc).isoformat(),
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key, value in vars(record).items():
            if key not in _RESERVED and not key.startswith("_"):
                payload[key] = value
        if record.exc_info and record.exc_info[0] is not None:
            # Solo el tipo de excepción: los mensajes de librerías externas pueden incluir datos.
            payload["exc_type"] = record.exc_info[0].__name__
        return json.dumps(payload, ensure_ascii=False, default=str)


def configure_logging(level: str = "INFO") -> None:
    root = logging.getLogger()
    # Sustituye solo nuestro handler (idempotente); respeta otros handlers (p. ej. pytest caplog).
    root.handlers = [h for h in root.handlers if not getattr(h, "_contoso_json", False)]
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    handler._contoso_json = True  # type: ignore[attr-defined]
    root.addHandler(handler)
    root.setLevel(level.upper())
    # Librerías ruidosas o que podrían registrar cabeceras/cuerpos de peticiones.
    for noisy in ("httpx", "httpx2", "httpcore", "anthropic", "openai", "urllib3", "google"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
