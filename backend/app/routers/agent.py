from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from app.services.agent import execute_agent_chat
from app.config import settings

router = APIRouter(prefix="/api/agent", tags=["agent"])

class AgentChatRequest(BaseModel):
    prompt: str
    user_id: Optional[str] = "usr-rahul-01"
    lat: Optional[float] = settings.DEFAULT_LAT
    lng: Optional[float] = settings.DEFAULT_LNG

@router.post("/chat")
async def chat_with_agent(payload: AgentChatRequest):
    result = await execute_agent_chat(
        prompt=payload.prompt,
        user_id=payload.user_id or "usr-rahul-01",
        user_lat=payload.lat or settings.DEFAULT_LAT,
        user_lng=payload.lng or settings.DEFAULT_LNG
    )
    return result
