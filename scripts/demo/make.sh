#!/bin/bash
# 1本の動画を作る: 複製DBを戻す → 確認だけの実行（NGがあれば止める）→ 複製DBを戻す → 本番の録画。所要時間を出す。
cd "$(dirname "$0")"
script="$1"; name="${script%.mjs}"
t0=$(date +%s)
bash reset-demo.sh >/dev/null
DEMO_DRY=1 node "$script" > /tmp/$name-dry.log 2>&1
ng=$(grep -c "  NG " /tmp/$name-dry.log); ok=$(grep -c "  OK " /tmp/$name-dry.log)
t1=$(date +%s)
echo "[$name] dry: OK=$ok NG=$ng ($((t1-t0))s)"
if [ "$ng" -gt 0 ]; then grep -E "NG|!!" /tmp/$name-dry.log | head -8 | cut -c1-160; echo "[$name] ABORT (NG)"; exit 1; fi
for try in 1 2 3; do
  bash reset-demo.sh >/dev/null
  node "$script" > /tmp/$name-real.log 2>&1
  rng=$(grep -c "  NG " /tmp/$name-real.log)
  [ "$rng" -eq 0 ] && break
  echo "[$name] real run had NG=$rng (try $try) -> retry"
done
t2=$(date +%s)
echo "[$name] real: NG=$rng $(grep '=>' /tmp/$name-real.log | cut -c1-120) total $((t2-t0))s"
