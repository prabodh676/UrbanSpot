import os
from pydantic import BaseModel

class Settings(BaseModel):
    APP_NAME: str = "Smart Parking Modular Monolith"
    VERSION: str = "1.0.0"
    DB_PATH: str = os.getenv("DB_PATH", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "parking.db"))
    PORT: int = int(os.getenv("PORT", "8000"))
    HOST: str = os.getenv("HOST", "0.0.0.0")
    
    # Hyderabad Center coordinates (Hitech City / Madhapur)
    DEFAULT_LAT: float = 17.4474
    DEFAULT_LNG: float = 78.3762
    
    # Currency
    CURRENCY_SYMBOL: str = "₹"
    
    # Hold expiry time (seconds)
    HOLD_TTL_SECONDS: int = 600  # 10 minutes
    # Street report TTL (seconds)
    STREET_REPORT_TTL_SECONDS: int = 240  # 4 minutes

settings = Settings()
