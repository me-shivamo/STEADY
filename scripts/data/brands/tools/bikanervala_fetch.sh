#!/bin/bash
# Polite fetch of a few Bikanervala pages once the 429 rate limit clears.
B=/tmp/claude-1000/-home-shivam-STEADY/7ffc6d5c-cce2-4f02-be37-170c43cc84e5/scratchpad/brands
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
OUT=$B/dl/bikanervala/pages
for i in $(seq 1 12); do
  code=$(curl -s -A "$UA" --max-time 60 -o $OUT/p_rasogolla.html -w "%{http_code}" "https://bikanervala.com/products/rasogolla")
  echo "try $i rasogolla $code"
  [ "$code" = "200" ] && break
  sleep 75
done
[ "$code" = "200" ] || exit 1
for h in soan-papdi soan-cake; do
  sleep 8
  curl -s -A "$UA" --max-time 60 -o $OUT/p_$h.html -w "$h %{http_code}\n" "https://bikanervala.com/products/$h"
done
for c in sweets laddu burfi kaju-sweets; do
  sleep 8
  curl -s -A "$UA" --max-time 60 -o $OUT/col_$c.html -w "col $c %{http_code}\n" "https://bikanervala.com/collections/$c"
done
echo done
