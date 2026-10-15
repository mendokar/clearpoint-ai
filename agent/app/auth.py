"""Verificación del Firebase ID token.

- Sin cabecera Authorization -> modo anónimo (uid = None).
- Token inválido, caducado o revocado -> 401.
- Token válido -> uid verificado. Es la ÚNICA fuente del uid en todo el servicio.
"""

from __future__ import annotations

import logging
import threading

import firebase_admin
from fastapi import HTTPException, Request, status
from firebase_admin import auth as fb_auth

from app.config import get_settings

logger = logging.getLogger(__name__)

_APP_NAME = "contoso-agent"
_lock = threading.Lock()


class AuthUnavailableError(RuntimeError):
    """El backend de autenticación no está disponible o no está configurado."""


def get_firebase_app() -> firebase_admin.App:
    """Inicializa firebase-admin de forma perezosa con Application Default Credentials.

    En Cloud Run las credenciales son las de la cuenta de servicio del servicio (sin fichero de clave).
    """
    with _lock:
        try:
            return firebase_admin.get_app(_APP_NAME)
        except ValueError:
            project_id = get_settings().firebase_project_id
            options = {"projectId": project_id} if project_id else None
            return firebase_admin.initialize_app(options=options, name=_APP_NAME)


def verify_token(token: str) -> str:
    """Devuelve el uid si el token es válido. Lanza HTTPException(401) si no lo es."""
    try:
        decoded = fb_auth.verify_id_token(token, app=get_firebase_app())
    except (
        fb_auth.InvalidIdTokenError,
        fb_auth.ExpiredIdTokenError,
        fb_auth.RevokedIdTokenError,
        fb_auth.UserDisabledError,
        ValueError,
    ) as exc:
        logger.info("auth_rejected", extra={"reason": type(exc).__name__})
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No autorizado.") from None
    except fb_auth.CertificateFetchError:
        logger.exception("auth_certificate_fetch_failed")
        raise AuthUnavailableError() from None
    except Exception:  # p. ej. credenciales / proyecto no configurados
        logger.exception("auth_backend_error")
        raise AuthUnavailableError() from None

    uid = decoded.get("uid")
    if not isinstance(uid, str) or not uid:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No autorizado.")
    return uid


def get_optional_uid(request: Request) -> str | None:
    """Dependencia de FastAPI: uid verificado o None si la petición es anónima."""
    header = request.headers.get("authorization")
    if header is None:
        return None
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No autorizado.")
    return verify_token(token)
