import logging
from typing import Callable, Optional

import redis.asyncio as aioredis
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)


class RateLimiterMiddleware(BaseHTTPMiddleware):
    """Redis-backed rate limiter: 5 POST /api/auth/login requests per IP per minute."""

    def __init__(self, app, redis_url: str) -> None:
        super().__init__(app)
        self._redis_url = redis_url
        self._redis: Optional[aioredis.Redis] = None

    async def _get_redis(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = aioredis.from_url(self._redis_url, decode_responses=True)
        return self._redis

    async def dispatch(self, request: Request, call_next: Callable):
        if request.method == "POST" and request.url.path in (
            "/api/auth/login",
            "/api/auth/login/",
        ):
            client_ip = request.client.host if request.client else "unknown"
            try:
                r = await self._get_redis()
                key = f"rate_limit:login:{client_ip}"
                current = await r.get(key)

                if current is None:
                    await r.setex(key, 60, 1)
                elif int(current) >= 5:
                    retry_after = await r.ttl(key)
                    logger.warning("Rate limit exceeded: ip=%s attempts=%s", client_ip, current)
                    return JSONResponse(
                        status_code=429,
                        content={
                            "detail": "Too many login attempts. Please try again later."
                        },
                        headers={"Retry-After": str(max(retry_after, 1))},
                    )
                else:
                    await r.incr(key)
            except Exception:
                logger.warning("Rate limiter Redis unavailable, failing open", exc_info=True)

        return await call_next(request)
