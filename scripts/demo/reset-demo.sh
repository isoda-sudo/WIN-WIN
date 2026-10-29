#!/bin/bash
# 録画用の複製DB（demo スキーマ）を、元の状態に戻す。本番（public）には触れない。失敗したら最大4回やり直す。
cd /Users/hiromu.umeda/construct-pro-next
set -a; . ./.env; set +a
U="${DATABASE_URL%%\?*}"; U="${U/:6543/:5432}"  # セッション接続（6543のトランザクション接続だと、SET が他の接続に残る）
for i in 1 2 3 4; do
  if PAGER=cat psql "$U" -v ON_ERROR_STOP=1 -q -f /private/tmp/demo-schema2.sql >/tmp/reset.err 2>&1 && PAGER=cat psql "$U" -v ON_ERROR_STOP=1 -q -f /private/tmp/demo-data2.sql >>/tmp/reset.err 2>&1; then
    n=$(PAGER=cat psql "$U" -Atc 'select count(*) from demo.users' 2>/dev/null)
    if [ "${n:-0}" -gt 0 ]; then echo "demo schema reset: $(PAGER=cat psql "$U" -Atc 'select count(*) from demo.projects') projects, $n users"; break; fi
  fi
  echo "reset retry $i"; sleep 3
done
rm -f $(dirname "$0")/mail/*.eml
