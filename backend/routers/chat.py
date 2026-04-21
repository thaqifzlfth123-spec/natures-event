from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from ai_service import get_chatbot_stream

router = APIRouter(prefix="/api", tags=["Chat"])

class ChatRequest(BaseModel):
    message: str

@router.post("/chat")
async def chat(request: ChatRequest):
    """
    Ask emergency chatbot questions like "What should I do during flood?" (Streamed)
    """
    return StreamingResponse(get_chatbot_stream(request.message), media_type="text/plain")
