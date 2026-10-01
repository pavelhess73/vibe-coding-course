#!/usr/bin/env bg

# push.sh - Bash skript pro automatické uložení a odeslání změn na GitHub

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# 5. Odeslání do vzdáleného repozitáře
if git push; then
  echo -e "${GREEN}🚀 Změny byly úspěšně odeslány na GitHub!${NC}"
else
  echo -e "\033[0;31m❌ Při odesílání změn na GitHub došlo k chybě.${NC}"
  exit 1
fi
