#!/bin/bash
# 録画用アプリ（demo スキーマ＋ローカルSMTP）を起動。本番スキーマには触れない。
cd /Users/hiromu.umeda/construct-pro-next
set -a; . ./.env; set +a
export DATABASE_URL="${DATABASE_URL%%\?*}?options=-c%20search_path%3Ddemo" SMTP_HOST=127.0.0.1 SMTP_PORT=2525 SMTP_USER=demo@example.invalid SMTP_PASS=demo MAIL_FROM="物件管理システム <noreply@example.invalid>" MFA_ENCRYPTION_KEY=$(openssl rand -hex 32) NODE_ENV=development
unset CRON_SECRET
nohup bun run dev -- --port 3030 > /private/tmp/demo-dev.log 2>&1 &
