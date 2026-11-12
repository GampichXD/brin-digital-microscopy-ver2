// Performance testing (4a/4b/4c) — Lighthouse audit of the login page and the
// authenticated dashboard. Auth is bypassed by injecting the token/role/username
// that AuthPage.tsx stores in localStorage after a real /api/auth/login call,
// so Lighthouse audits the real dashboard instead of only the login screen.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import lighthouse from 'lighthouse';

const APP_URL = process.env.APP_URL || 'http://localhost:4173/';
const API_URL = process.env.API_URL || 'http://127.0.0.1:8000';
const CHROME_PATH =
  process.env.CHROME_PATH ||
  '/home/brin-microscope/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const REPORT_DIR = path.join(import.meta.dirname, 'reports');
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];

function uniqueUsername() {
  return `lh_test_${Date.now()}`;
}

async function registerAndLogin(username, password) {
  const reg = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!reg.ok) throw new Error(`register failed: ${reg.status} ${await reg.text()}`);

  const login = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!login.ok) throw new Error(`login failed: ${login.status} ${await login.text()}`);
  return login.json();
}

async function runAudit(page, url, { flags = {}, label }) {
  const result = await lighthouse(
    url,
    {
      output: ['html', 'json'],
      onlyCategories: CATEGORIES,
      formFactor: 'desktop',
      screenEmulation: { disabled: true },
      logLevel: 'error',
      ...flags,
    },
    undefined,
    page,
  );

  const scores = {};
  for (const key of CATEGORIES) {
    scores[key] = result.lhr.categories[key]
      ? Math.round(result.lhr.categories[key].score * 100)
      : null;
  }

  fs.writeFileSync(path.join(REPORT_DIR, `${label}.html`), result.report[0]);
  fs.writeFileSync(path.join(REPORT_DIR, `${label}.json`), result.report[1]);

  return scores;
}

async function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--remote-debugging-port=0'],
  });
  const page = await browser.newPage();

  const results = {};

  // 4a — public login page, no auth
  console.log('Auditing login page (unauthenticated)...');
  results.loginPage = await runAudit(page, APP_URL, { label: '4a-login-page' });

  // Get a real token the same way AuthPage.tsx does, then seed the SPA's
  // localStorage before Lighthouse's own navigation so App.tsx boots straight
  // into the dashboard instead of AuthPage.
  const username = uniqueUsername();
  const password = 'TestPassword123!';
  const auth = await registerAndLogin(username, password);

  await page.goto(APP_URL, { waitUntil: 'networkidle0' });
  await page.evaluate(
    ({ token, role, username, activeTab }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('role', role);
      localStorage.setItem('username', username);
      localStorage.setItem('activeTab', activeTab);
    },
    {
      token: auth.access_token,
      role: auth.role,
      username: auth.username,
      activeTab: 'Live Stream',
    },
  );

  // 4b — authenticated dashboard (default tab: Live Stream / "Kendali Motor")
  console.log('Auditing dashboard (authenticated, Live Stream tab)...');
  results.dashboard = await runAudit(page, APP_URL, { label: '4b-dashboard-livestream' });

  await browser.close();

  fs.writeFileSync(
    path.join(REPORT_DIR, 'summary.json'),
    JSON.stringify(results, null, 2),
  );

  console.log('\n=== Lighthouse scores (0-100) ===');
  console.table(results);
  console.log(`\nFull reports written to ${REPORT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
