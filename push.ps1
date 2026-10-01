# push.ps1 - PowerShell skript pro automatické uložení a odeslání změn na GitHub
param (
    [string]$CustomMessage = ""
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 1. Kontrola stavu změn v Gitu
$status = git status --porcelain
if ([string]::IsNullOrWhiteSpace($status)) {
    Write-Host "Žádné změny k uložení." -ForegroundColor Yellow
    exit 0
}

# 2. Přidání všech změn
git add .

# 3. Určení commit zprávy
if ($CustomMessage -ne "") {
    $commitMsg = $CustomMessage
} elseif ($args.Count -gt 0 -and ![string]::IsNullOrWhiteSpace($args[0])) {
    $commitMsg = $args[0]
} else {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
    $commitMsg = "feat: auto-save $timestamp"
}

# 4. Vytvoření commitu
git commit -m "$commitMsg"

# 5. Kontrola vzdáleného repozitáře
$hasRemote = git remote
if ([string]::IsNullOrWhiteSpace($hasRemote)) {
    Write-Host "Kód byl lokálně uložen. Pro odeslání na GitHub propojte repozitář příkazem:" -ForegroundColor Cyan
    Write-Host "   git remote add origin URL_VASHOS_REPOZITARE" -ForegroundColor Gray
    Write-Host "   git push -u origin main" -ForegroundColor Gray
    exit 0
}

# 6. Odeslání do vzdáleného repozitáře
try {
    git push
    if ($LASTEXITCODE -eq 0) {
        Write-Host "🚀 Změny byly úspěšně odeslány na GitHub!" -ForegroundColor Green
    } else {
        Write-Host "❌ Při odesílání změn na GitHub došlo k chybě." -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Při odesílání změn na GitHub došlo k chybě." -ForegroundColor Red
    exit 1
}
