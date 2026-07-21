#!/usr/bin/env bash
# Clinic Rooms — אשף התקנה (Mac / Linux)
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "[!] Node.js אינו מותקן."
  echo "    התקינו את גרסת ה-LTS מ: https://nodejs.org והריצו שוב."
  exit 1
fi

MAJOR=$(node -v | sed 's/^v//' | cut -d. -f1)
if [ "$MAJOR" -lt 20 ]; then
  echo "[!] נדרשת גרסת Node.js 20 ומעלה (נמצאה $(node -v))."
  exit 1
fi

node --no-deprecation setup/wizard.mjs
