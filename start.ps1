Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "   ONE TOUCH ELECTRICAL - STARTING SYSTEM" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Step 1 - Start PM2
Write-Host "[1/5] Starting backend and tunnel..." -ForegroundColor Yellow
pm2 start ecosystem.config.js --update-env 2>&1 | Out-Null
Write-Host "      Done." -ForegroundColor Green
Write-Host ""

# Step 2 - Wait for tunnel to register
Write-Host "[2/5] Waiting for tunnel URL (10 seconds)..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Step 3 - Get the tunnel URL
Write-Host "[3/5] Getting tunnel URL..." -ForegroundColor Yellow
$logs = pm2 logs one-touch-tunnel --lines 100 --nostream 2>&1
$urlLine = $logs | Select-String "https://\S+\.trycloudflare\.com" | Select-Object -Last 1
$tunnelUrl = $urlLine -match "(https://\S+\.trycloudflare\.com)" | Out-Null
$tunnelUrl = $Matches[1]

if (-not $tunnelUrl) {
    Write-Host "      ERROR: Could not find tunnel URL. Check PM2 is running." -ForegroundColor Red
    Write-Host "      Run: pm2 logs one-touch-tunnel --lines 50 --nostream" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "      Found: $tunnelUrl" -ForegroundColor Green
Write-Host ""

# Step 4 - Update .env.production
Write-Host "[4/5] Updating frontend config..." -ForegroundColor Yellow
Set-Content "C:\Users\Tale\Desktop\One Touch Electrical Service\frontend\.env.production" "VITE_API_URL=$tunnelUrl"
Write-Host "      Done." -ForegroundColor Green
Write-Host ""

# Step 5 - Build and deploy
Write-Host "[5/5] Building and deploying frontend..." -ForegroundColor Yellow
Set-Location "C:\Users\Tale\Desktop\One Touch Electrical Service\frontend"

npm run build 2>&1 | Out-Null
Write-Host "      Build complete." -ForegroundColor Green

Copy-Item "vercel.json" "dist\vercel.json" -Force

Write-Host "      Deploying to Vercel..." -ForegroundColor Yellow
$deployOut = npx vercel deploy dist --prod --yes --force 2>&1
$deployUrl = ($deployOut | Select-String "dist-\S+-talentbanda16-makers-projects\.vercel\.app" | Select-Object -First 1).Matches[0].Value

if (-not $deployUrl) {
    Write-Host "      ERROR: Deploy failed. Check your internet connection." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "      Setting production alias..." -ForegroundColor Yellow
npx vercel alias set $deployUrl one-touch-electrical-six.vercel.app 2>&1 | Out-Null

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "   SYSTEM IS READY!" -ForegroundColor Green
Write-Host "   https://one-touch-electrical-six.vercel.app" -ForegroundColor White
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Read-Host "Press Enter to close"
