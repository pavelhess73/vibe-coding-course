#!/usr/bin/env bash

# push.sh - Bash skript pro automatické uložení a odeslání změn na GitHub

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. Kontrola stavu změn v Gitu
if [ -z "$(git status --porcelain)" ]; then
  echo -e "${YELLOW}Žádné změny k uložení.${NC}"
  exit 0
fi

# 2. Přidání všech změn
git add .

# 3. Určení commit zprávy (argument nebo automatické datum a čas)
if [ -n "$1" ]; then
  COMMIT_MSG="$1"
else
  TIMESTAMP=$(date +"%Y-%m-%d %H:%M")
  COMMIT_MSG="feat: auto-save ${TIMESTAMP}"
fi

# 4. Vytvoření commitu
git commit -m "$COMMIT_MSG"

# 5. Kontrola vzdáleného repozitáře
if [ -z "$(git remote)" ]; then
  echo -e "${CYAN}ℹ️ Kód byl lokálně uložen. Pro odeslání na GitHub propojte repozitář příkazem:${NC}"
  echo -e "   git remote add origin <URL_VÁŠHO_REPOZITÁŘE>"
  echo -e "   git push -u origin main"
  exit 0
fi

# 6. Odeslání do vzdáleného repozitáře
if git push; then
  echo -e "${GREEN}🚀 Změny byly úspěšně odeslány na GitHub!${NC}"
else
  echo -e "${RED}❌ Při odesílání změn na GitHub došlo k chybě.${NC}"
  exit 1
fi
