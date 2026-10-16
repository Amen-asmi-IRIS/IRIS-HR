import logging
import time
import uuid

from django.conf import settings
from django.db import Error as DatabaseFailure
from django.utils import translation

from apps.core import context
from apps.core.i18n import LANGUAGES

request_logger = logging.getLogger("iris.request")


class RequestContextMiddleware:
    """Gives every request an identifier, exposes it to the rest of the code, and logs one line per request."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = uuid.uuid4().hex
        request.id = request_id
        started = time.perf_counter()
        tokens = context.bind_request(request, request_id)
        try:
            response = self.get_response(request)
            response["X-Request-ID"] = request_id
            request_logger.info(
                "request",
                extra={
                    "data": {
                        "method": request.method,
                        "path": request.path,  # never the query string: it can carry search terms
                        "status": response.status_code,
                        "duration_ms": round((time.perf_counter() - started) * 1000),
                    }
                },
            )
            return response
        finally:
            context.unbind(tokens)


class LanguageMiddleware:
    """Activates the signed-in user's language, else the Accept-Language header, else the default (master 6.3)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        language = self._pick(request)
        translation.activate(language)
        request.LANGUAGE_CODE = language
        try:
            response = self.get_response(request)
        finally:
            translation.deactivate()
        response.headers.setdefault("Content-Language", language)
        return response

    @staticmethod
    def _pick(request) -> str:
        user = getattr(request, "user", None)
        try:
            signed_in = user is not None and user.is_authenticated
        except DatabaseFailure:  # the session cannot be read: the header decides, and the view answers
            signed_in = False
        if signed_in and getattr(user, "language", None) in LANGUAGES:
            return user.language
        for part in request.META.get("HTTP_ACCEPT_LANGUAGE", "").split(","):
            tag = part.split(";")[0].strip().lower().split("-")[0]
            if tag in LANGUAGES:
                return tag
        return settings.DEFAULT_LANGUAGE
