#!/usr/bin/env bash
# Jalankan semua pengujian software. Hasil di qa/results/.
#   Playwright jalan kalau E2E_ADMIN_USER diisi (butuh stack hidup, lihat README).
#   Newman, ws_qos, dan lainnya jalan kalau BASE_URL, TEST_USER, TEST_PASS diisi.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RESULTS="$ROOT/qa/results"
mkdir -p "$RESULTS"
PY="${PYTHON:-python3}"

cd "$ROOT/backend"
"$PY" -m pytest -m unit --cov=app --cov-branch --cov-report=term --cov-report="html:$RESULTS/coverage" --junitxml="$RESULTS/unit.xml"
"$PY" -m pytest -m integration --junitxml="$RESULTS/integration.xml"
"$PY" -m pytest -m security --junitxml="$RESULTS/security.xml"
"$PY" -m radon cc app -s -a > "$RESULTS/radon_cc.txt"
"$PY" -m bandit -r app -f txt -o "$RESULTS/bandit.txt" || true

cd "$ROOT/frontend"
npx vitest run --coverage
if [ -n "$E2E_ADMIN_USER" ]; then
  npx playwright test --project=chromium --reporter=html,json
else
  echo "Playwright dilewati: E2E_ADMIN_USER belum diisi."
fi

cd "$ROOT"
POSTMAN=qa/postman/Digital_Microscopy_API_QoS.postman_collection.json
if [ -n "$BASE_URL" ] && [ -f "$POSTMAN" ]; then
  npx newman run "$POSTMAN" \
    --env-var "baseUrl=$BASE_URL" --env-var "adminUser=$TEST_USER" --env-var "adminPass=$TEST_PASS" \
    --delay-request 600 --timeout-request 100000 --working-dir qa/postman \
    -r cli,json --reporter-json-export qa/results/newman.json || true
fi
echo "Hasil: qa/results/"
