from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional
from database import get_db, auth as firebase_auth
from firebase_admin import auth as fa_auth

router = APIRouter(prefix="/api/auth", tags=["Auth"])

class RegisterRequest(BaseModel):
    email: str
    password: str
    fcm_token: Optional[str] = None
    home_latitude: Optional[float] = None
    home_longitude: Optional[float] = None

security = HTTPBearer()

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        decoded_token = fa_auth.verify_id_token(credentials.credentials)
        return decoded_token
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid or expired token: {str(e)}")


@router.post("/register")
async def register(request: RegisterRequest):
    try:
        user = firebase_auth.create_user(email=request.email, password=request.password)
        db = get_db()
        if db:
            db.collection("users").document(user.uid).set({
                "email": request.email, "fcm_token": request.fcm_token,
                "home_latitude": request.home_latitude, "home_longitude": request.home_longitude
            })
        return {"message": "User registered successfully", "uid": user.uid}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/me")
async def get_me(token: dict = Depends(verify_token)):
    return {"uid": token.get("uid"), "email": token.get("email")}
