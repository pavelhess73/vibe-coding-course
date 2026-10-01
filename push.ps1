# push.ps1 - PowerShell skript pro automatické uložení a odeslání změn na GitHub
param (
    [string]$CustomMessage = ""
)

$ErrorActionPreference = "Stop"

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

# 5. Odeslání do vzdáleného repozitáře
try {
    git push
    Write-Host "🚀 Změny byly úspěšně odeslány na GitHub!" -ForegroundColor Green
} catch {
    Write-Host "❌ Při odesílání změn na GitHub došlo k chybě: $_" -ForegroundColor Red
    exit 1
}
