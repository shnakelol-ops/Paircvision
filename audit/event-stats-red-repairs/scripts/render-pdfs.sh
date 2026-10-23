#!/usr/bin/env bash
# Renders every page of every downloaded PDF to PNG with poppler (pdftoppm).
set -euo pipefail
dir="$1"
mkdir -p "$dir/pdf-images"
for f in "$dir"/pdf/*.pdf; do
  base=$(basename "$f" .pdf)
  pdftoppm -r 96 -png "$f" "$dir/pdf-images/$base"
done
pdfinfo "$dir"/pdf/*.pdf 2>/dev/null | grep -E "^Pages|^Page size" | sort | uniq -c || true
