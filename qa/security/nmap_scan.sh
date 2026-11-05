#!/usr/bin/env bash
# Pemindaian port VPS. Pemakaian: qa/security/nmap_scan.sh 202.10.44.52
# Jalankan hanya ke sistem milik sendiri. Yang diharapkan: 8000 tertutup dari luar.
set -e
TARGET="${1:?Host target wajib diisi}"
RESULTS="$(cd "$(dirname "$0")/.." && pwd)/results"
mkdir -p "$RESULTS"
nmap -Pn -sV -p 22,80,443,4040,5433,6380,8000 -oN "$RESULTS/nmap.txt" "$TARGET"
