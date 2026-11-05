#!/usr/bin/env bash
# Pemindaian pasif OWASP ZAP. Pemakaian: qa/security/zap_baseline.sh https://e-eye.cloud
# Jalankan hanya ke sistem milik sendiri.
set -e
TARGET="${1:?URL target wajib diisi}"
RESULTS="$(cd "$(dirname "$0")/.." && pwd)/results"
mkdir -p "$RESULTS"
docker run --rm -v "$RESULTS:/zap/wrk:rw" ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py -t "$TARGET" -r zap.html || echo "ZAP melaporkan temuan. Lihat qa/results/zap.html"
