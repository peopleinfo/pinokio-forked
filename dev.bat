@echo off
REM dev.bat — Quick start for pinokiod development on Windows
REM Usage: dev.bat

echo.
echo  Pinokiod Dev Server
echo.

REM Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  Node.js not found. Install Node.js 20+ first.
    exit /b 1
)

REM Show version
for /f "tokens=*" %%i in ('node -v') do echo  Node.js: %%i

REM Install deps if needed
if not exist node_modules (
    echo  Installing dependencies...
    call npm install
    echo.
)

REM Kill any existing process on port 42000
echo  Checking port 42000...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":42000 " ^| findstr "LISTENING"') do (
    echo  Port 42000 in use by PID %%p — killing...
    taskkill /F /PID %%p >nul 2>&1
    timeout /t 1 /nobreak >nul
)
echo  Port 42000 is clear.
echo.

REM Check for upstream updates (non-blocking)
echo  Checking for upstream updates...
node scripts/check-update.js 2>nul
echo.

REM Start
echo  Starting server on http://localhost:42000
echo  Press Ctrl+C to stop
echo.
call npm start
