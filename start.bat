@echo off
setlocal
echo ==========================================================
echo    🚀 Starting UrbanSpot Platform (Hyderabad Demo)
echo ==========================================================

set "ROOT_DIR=%~dp0"
set "BACKEND_DIR=%ROOT_DIR%backend"
set "FRONTEND_DIR=%ROOT_DIR%frontend"

echo Starting Backend on http://localhost:8000...
start "UrbanSpot Backend" /D "%BACKEND_DIR%" python -m uvicorn app.main:app --host 0.0.0.0 --port 8000

timeout /t 2 /nobreak >nul

echo Starting Frontend on http://localhost:3000...
start "UrbanSpot Frontend" /D "%FRONTEND_DIR%" npm run dev

echo.
echo ==========================================================
echo  ✅ UrbanSpot is Live!
echo  🌐 Frontend UI:  http://localhost:3000
echo  🔌 Backend API:  http://localhost:8000
echo  📖 API Docs:     http://localhost:8000/docs
echo ==========================================================
