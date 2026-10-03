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

    # Supabase Integration
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "https://zchqosjmykoacskhbaaz.supabase.co")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjaHFvc2pteWtvYWNza2hiYWF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwMTQ1NDQsImV4cCI6MjEwNjU5MDU0NH0.ed7OKEjEn6MyjspcVFjw1i621mKmW0iH4mGZuT9Jp-8")

settings = Settings()

