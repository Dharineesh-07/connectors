from typing import Any, Dict

from pydantic import BaseModel


class WebSocketEvent(BaseModel):
    """Base envelope for all WebSocket messages (both inbound and outbound)."""

    type: str
    data: Dict[str, Any]
    ts: str  # ISO-8601 UTC timestamp


class TypingEvent(BaseModel):
    user_id: str
    conversation_id: str
    is_typing: bool


class ReadReceiptEvent(BaseModel):
    message_id: str
    user_id: str
    status: str
    timestamp: str


class PresenceEvent(BaseModel):
    user_id: str
    timestamp: str


class CallSignalEvent(BaseModel):
    call_id: str
    user_id: str
    timestamp: str
