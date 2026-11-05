#!/usr/bin/env node
// Audit Lighthouse: tiap tab x desktop/mobile x 5 run, median ke qa/results/lighthouse_summary.csv.
//   cd frontend   (lighthouse dan puppeteer-core terpasang di sini)
//   BASE_URL=http://localhost:5173 TEST_USER=... TEST_PASS=... CHROME_PATH=/path/chrome \
//     node ../qa/lighthouse/run_lighthouse.mjs [--runs 5] [--tabs "Live Stream,Database"] [--modes desktop]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendRequire = createRequire(path.join(here, '..', '..', 'frontend', 'package.json'));
const load = (name) => import(pathToFileURL(frontendRequire.resolve(name)).href);
const lighthouse = (await load('lighthouse')).default;
const puppeteer = (await load('puppeteer-core')).default;

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const CHROME_PATH = process.env.CHROME_PATH;
if (!CHROME_PATH || !process.env.TEST_USER || !process.env.TEST_PASS) {
  console.error('CHROME_PATH, TEST_USER, dan TEST_PASS wajib diisi.');
  process.exit(2);
}
const runsArg = process.argv.indexOf('--runs');
const RUNS = runsArg > 0 ? Number(process.argv[runsArg + 1]) : 5;
const ALL_TABS = ['AUTH', 'Live Stream', 'Database', 'Image Gathering', 'Image Analysis', 'Documentation', 'Admin Control'];
const tabsArg = process.argv.indexOf('--tabs');
const TABS = tabsArg > 0 ? process.argv[tabsArg + 1].split(',') : ALL_TABS;
const modesArg = process.argv.indexOf('--modes');
const MODES = modesArg > 0 ? process.argv[modesArg + 1].split(',') : ['desktop', 'mobile'];
const OUT = path.join(here, '..', 'results');
const RAW = path.join(OUT, 'lighthouse_raw');
fs.mkdirSync(RAW, { recursive: true });

const login = await fetch(`${BASE_URL}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: process.env.TEST_USER, password: process.env.TEST_PASS }),
});
if (!login.ok) throw new Error(`Login gagal: ${login.status}`);
const session = await login.json();

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const rows = [['tab', 'mode', 'performance', 'accessibility', 'best_practices', 'seo', 'fcp_ms', 'lcp_ms', 'tbt_ms', 'cls']];
const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: ['--no-sandbox'] });
const port = Number(new URL(browser.wsEndpoint()).port);

for (const tab of TABS) {
  for (const mode of MODES) {
    const results = [];
    for (let run = 1; run <= RUNS; run += 1) {
      const page = await browser.newPage();
      await page.goto(BASE_URL);
      await page.evaluate((s, name) => {
        localStorage.clear();
        if (name === 'AUTH') return;
        localStorage.setItem('token', s.access_token);
        localStorage.setItem('username', s.username);
        localStorage.setItem('role', s.role);
        localStorage.setItem('activeTab', name);
      }, session, tab);
      const { lhr } = await lighthouse(BASE_URL, {
        port,
        output: 'json',
        logLevel: 'error',
        disableStorageReset: true,
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
        formFactor: mode,
        screenEmulation: mode === 'desktop'
          ? { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }
          : undefined,
      });
      await page.close();
      fs.writeFileSync(path.join(RAW, `${tab.replace(/\s/g, '_')}_${mode}_${run}.json`), JSON.stringify(lhr));
      results.push(lhr);
    }
    const score = (id) => Math.round(median(results.map((r) => r.categories[id].score)) * 100);
    const metric = (id) => median(results.map((r) => r.audits[id].numericValue));
    rows.push([tab, mode, score('performance'), score('accessibility'), score('best-practices'), score('seo'),
      Math.round(metric('first-contentful-paint')), Math.round(metric('largest-contentful-paint')),
      Math.round(metric('total-blocking-time')), metric('cumulative-layout-shift').toFixed(3)]);
    console.log(rows[rows.length - 1].join(','));
  }
}

await browser.close();
fs.writeFileSync(path.join(OUT, 'lighthouse_summary.csv'), `${rows.map((r) => r.join(',')).join('\n')}\n`);
console.log(`Hasil: ${path.join(OUT, 'lighthouse_summary.csv')}`);
