# push.ps1 - PowerShell skript pro automaticke ulozeni a odeslani zmen na GitHub
param (
    [string]$CustomMessage = ""
)

# 1. Kontrola stavu zmen v Gitu
$status = git status --porcelain
if ([string]::IsNullOrWhiteSpace($status)) {
    Write-Host "Zadne zmeny k ulozeni." -ForegroundColor Yellow
    exit 0
}

# 2. Pridani vsech zmen
git add .

# 3. Urceni commit zpravy
if ($CustomMessage -ne "") {
    $commitMsg = $CustomMessage
} elseif ($args.Count -gt 0 -and ![string]::IsNullOrWhiteSpace($args[0])) {
    $commitMsg = $args[0]
} else {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
    $commitMsg = "feat: auto-save $timestamp"
}

# 4. Vytvoreni commitu
git commit -m "$commitMsg"

# 5. Kontrola vzdaleneho repozitare
$hasRemote = git remote
if ([string]::IsNullOrWhiteSpace($hasRemote)) {
    Write-Host "Kod byl lokalne ulozen. Pro odeslani na GitHub propojte repozitar prikazem:" -ForegroundColor Cyan
    Write-Host "   git remote add origin <URL_VASHO_REPOZITARE>" -ForegroundColor Gray
    Write-Host "   git push -u origin main" -ForegroundColor Gray
    exit 0
}

# 6. Odeslani do vzdaleneho repozitare
try {
    git push
    if ($LASTEXITCODE -eq 0) {
        Write-Host "🚀 Zmeny byly uspesne odeslany na GitHub!" -ForegroundColor Green
    } else {
        Write-Host "❌ Pri odesilani zmen na GitHub doslo ke chybe." -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Pri odesilani zmen na GitHub doslo ke chybe." -ForegroundColor Red
    exit 1
}
