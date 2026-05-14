from datetime import datetime, timedelta
from typing import Optional

import redis.asyncio as aioredis
from fastapi import HTTPException, status
from jose import JWTError, jwt

from app.config import settings

_redis_client: Optional[aioredis.Redis] = None


async def init_redis() -> None:
    global _redis_client
    _redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)


def get_redis_client() -> aioredis.Redis:
    if _redis_client is None:
        raise RuntimeError("Redis not initialised — call init_redis() at startup")
    return _redis_client


def create_access_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload["type"] = "access"
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    payload["type"] = "refresh"
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def store_refresh_token(user_id: str, token: str) -> None:
    r = get_redis_client()
    expire_seconds = settings.REFRESH_TOKEN_EXPIRE_DAYS * 86_400
    await r.setex(f"refresh:{user_id}", expire_seconds, token)


async def validate_refresh_token(user_id: str, token: str) -> bool:
    r = get_redis_client()
    stored = await r.get(f"refresh:{user_id}")
    return stored == token


async def revoke_refresh_token(user_id: str) -> None:
    r = get_redis_client()
    await r.delete(f"refresh:{user_id}")
