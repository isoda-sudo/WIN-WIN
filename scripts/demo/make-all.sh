#!/bin/bash
cd "$(dirname "$0")"
for s in "$@"; do ./make.sh "$s" | tee -a /tmp/make-all.log; done
echo "ALL DONE" >> /tmp/make-all.log
