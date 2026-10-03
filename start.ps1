Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   🚀 Starting UrbanSpot Platform (Hyderabad Demo)       " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$rootDir = $PSScriptRoot
$backendDir = Join-Path $rootDir "backend"
$frontendDir = Join-Path $rootDir "frontend"

Write-Host "Starting Backend on http://localhost:8000..." -ForegroundColor Green
$backendProc = Start-Process -FilePath "python" -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000" -WorkingDirectory $backendDir -PassThru

Start-Sleep -Seconds 2

Write-Host "Starting Frontend on http://localhost:3000..." -ForegroundColor Green
$frontendProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm", "run", "dev" -WorkingDirectory $frontendDir -PassThru

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " ✅ UrbanSpot is Live!" -ForegroundColor Green
Write-Host " 🌐 Frontend UI:  http://localhost:3000" -ForegroundColor Yellow
Write-Host " 🔌 Backend API:  http://localhost:8000" -ForegroundColor Yellow
Write-Host " 📖 API Docs:     http://localhost:8000/docs" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan
