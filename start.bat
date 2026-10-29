@echo off
title One Touch Electrical - Startup
color 0A

echo ================================================
echo   ONE TOUCH ELECTRICAL - STARTING SYSTEM
echo ================================================
echo.

:: Step 1 - Start PM2
echo [1/5] Starting backend and tunnel...
call pm2 start ecosystem.config.js >nul 2>&1
call pm2 start ecosystem.config.js --update-env >nul 2>&1
echo       Done.
echo.

:: Step 2 - Wait for tunnel to get a URL
echo [2/5] Waiting for tunnel URL...
timeout /t 8 /nobreak >nul

:: Step 3 - Get the tunnel URL
echo [3/5] Getting tunnel URL...
set TUNNEL_URL=
for /f "tokens=*" %%a in ('pm2 logs one-touch-tunnel --lines 80 --nostream 2^>^&1 ^| findstr "trycloudflare.com" ^| findstr "https://"') do (
    set "LINE=%%a"
)

:: Extract just the https URL from the line
for /f "tokens=* delims=" %%a in ('pm2 logs one-touch-tunnel --lines 80 --nostream 2^>^&1 ^| findstr /r "https://[a-z].*trycloudflare.com"') do (
    for /f "tokens=2 delims=|" %%b in ("%%a") do (
        set "TUNNEL_URL=%%b"
    )
)

:: Clean up whitespace
if defined TUNNEL_URL (
    for /f "tokens=* delims= " %%a in ("%TUNNEL_URL%") do set TUNNEL_URL=%%a
)

if not defined TUNNEL_URL (
    echo       ERROR: Could not find tunnel URL. Try running again.
    pause
    exit /b 1
)

echo       Found: %TUNNEL_URL%
echo.

:: Step 4 - Update .env.production
echo [4/5] Updating frontend config...
echo VITE_API_URL=%TUNNEL_URL%> "C:\Users\Tale\Desktop\One Touch Electrical Service\frontend\.env.production"
echo       Done.
echo.

:: Step 5 - Build and deploy
echo [5/5] Building and deploying frontend...
cd /d "C:\Users\Tale\Desktop\One Touch Electrical Service\frontend"
call npm run build >nul 2>&1
echo       Build complete.

copy /y "vercel.json" "dist\vercel.json" >nul 2>&1

echo       Deploying to Vercel...
for /f "tokens=*" %%a in ('npx vercel deploy dist --prod --yes --force 2^>^&1 ^| findstr "dist-"') do set DEPLOY_LINE=%%a

:: Extract deployment URL
for /f "tokens=*" %%a in ('npx vercel deploy dist --prod --yes --force 2^>^&1 ^| findstr /r "dist-[a-z0-9]*-talentbanda16"') do (
    for /f "tokens=1" %%b in ("%%a") do set DEPLOY_URL=%%b
)

echo       Setting production alias...
call npx vercel alias set %DEPLOY_URL% one-touch-electrical-six.vercel.app >nul 2>&1

echo.
echo ================================================
echo   SYSTEM IS READY!
echo   Open: https://one-touch-electrical-six.vercel.app
echo ================================================
echo.
pause
