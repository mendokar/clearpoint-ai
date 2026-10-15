"""Rate limit en memoria con ventana deslizante (por uid o, si es anónimo, por IP).

Limitación conocida: no se comparte entre instancias de Cloud Run (max-instances bajo).
"""

from __future__ import annotations

import threading
import time
from collections import deque
from collections.abc import Callable


class RateLimiter:
    def __init__(
        self, max_requests: int, window_seconds: float, clock: Callable[[], float] = time.monotonic
    ) -> None:
        self.max_requests = max_requests
        self.window = window_seconds
        self._clock = clock
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = self._clock()
        with self._lock:
            hits = self._hits.setdefault(key, deque())
            while hits and now - hits[0] >= self.window:
                hits.popleft()
            if len(hits) >= self.max_requests:
                return False
            hits.append(now)
            self._prune(now)
            return True

    def _prune(self, now: float) -> None:
        # Evita crecimiento ilimitado de claves inactivas.
        if len(self._hits) < 10_000:
            return
        for key in [k for k, v in self._hits.items() if not v or now - v[-1] >= self.window]:
            del self._hits[key]

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()
