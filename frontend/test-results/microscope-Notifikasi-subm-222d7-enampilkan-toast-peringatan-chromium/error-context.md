# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: microscope.spec.ts >> Notifikasi >> submit form kosong menampilkan toast peringatan
- Location: e2e\microscope.spec.ts:59:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Username dan password tidak boleh kosong!')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('Username dan password tidak boleh kosong!')

```

```yaml
- heading "AUTOMATED MICROSCOPE" [level=1]
- paragraph: Lab Instrument Control Panel
- text: Gunakan Virtual Keyboard Matikan jika ada USB Keyboard fisik tersambung
- button
- button "LOGIN"
- button "REGISTER"
- text: Username / ID Operator
- textbox "Masukkan username..."
- text: Password
- textbox "Masukkan password..."
- button
- button "MASUK KE INSTRUMEN"
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | function uniqueUsername(prefix: string) {
  4  |   return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  5  | }
  6  | 
  7  | async function registerAndLogin(page: import('@playwright/test').Page, username: string, password: string) {
  8  |   await page.goto('/');
  9  |   await page.getByRole('button', { name: /REGISTER/i }).click();
  10 |   await page.getByPlaceholder('Masukkan username...').fill(username);
  11 |   await page.getByPlaceholder('Masukkan password...').fill(password);
  12 |   await page.getByPlaceholder('Ulangi password...').fill(password);
  13 | 
  14 |   // Tunggu response API registrasi selesai (bukan cuma klik) sebelum lanjut,
  15 |   // karena AuthPage mereset field password secara async setelah sukses --
  16 |   // mengisi form login terlalu cepat akan tertimpa reset tsb (race condition).
  17 |   await Promise.all([
  18 |     page.waitForResponse((r) => r.url().includes('/api/auth/register') && r.status() === 201),
  19 |     page.getByRole('button', { name: /DAFTARKAN OPERATOR/i }).click(),
  20 |   ]);
  21 | 
  22 |   // AuthPage otomatis kembali ke mode LOGIN setelah registrasi sukses
  23 |   await expect(page.getByPlaceholder('Ulangi password...')).toHaveCount(0);
  24 |   await page.getByPlaceholder('Masukkan username...').fill(username);
  25 |   await page.getByPlaceholder('Masukkan password...').fill(password);
  26 |   await page.getByRole('button', { name: /MASUK KE INSTRUMEN/i }).click();
  27 | }
  28 | 
  29 | test.describe('Autentikasi', () => {
  30 |   test('login gagal dengan kredensial salah menampilkan pesan error', async ({ page }) => {
  31 |     await page.goto('/');
  32 |     await page.getByPlaceholder('Masukkan username...').fill('operator_tidak_ada_' + Date.now());
  33 |     await page.getByPlaceholder('Masukkan password...').fill('password_salah_123');
  34 |     await page.getByRole('button', { name: /MASUK KE INSTRUMEN/i }).click();
  35 |     await expect(
  36 |       page.getByText(/ID Operator atau Password salah|Gagal tersambung/i)
  37 |     ).toBeVisible({ timeout: 10000 });
  38 |   });
  39 | 
  40 |   test('registrasi operator baru lalu login berhasil masuk ke dashboard', async ({ page }) => {
  41 |     const username = uniqueUsername('e2e_op');
  42 |     await registerAndLogin(page, username, 'TestPassword123!');
  43 |     await expect(page.getByText('Kendali Motor')).toBeVisible({ timeout: 15000 });
  44 |   });
  45 | 
  46 |   test('logout mengembalikan pengguna ke halaman autentikasi', async ({ page }) => {
  47 |     const username = uniqueUsername('e2e_logout');
  48 |     await registerAndLogin(page, username, 'TestPassword123!');
  49 |     await expect(page.getByText('Kendali Motor')).toBeVisible({ timeout: 15000 });
  50 | 
  51 |     await page.getByTitle('Keluar dari Instrumen').click();
  52 |     await expect(page.getByPlaceholder('Masukkan username...')).toBeVisible({ timeout: 10000 });
  53 |   });
  54 | });
  55 | 
  56 | test.describe('Notifikasi', () => {
  57 |   // Menguji kontrak fungsional showToast() pada AuthPage.tsx: memanggil
  58 |   // showToast() seharusnya menampilkan notifikasi visual ke pengguna.
  59 |   test('submit form kosong menampilkan toast peringatan', async ({ page }) => {
  60 |     await page.goto('/');
  61 |     await page.getByRole('button', { name: /MASUK KE INSTRUMEN/i }).click();
  62 |     await expect(
  63 |       page.getByText('Username dan password tidak boleh kosong!')
> 64 |     ).toBeVisible({ timeout: 5000 });
     |       ^ Error: expect(locator).toBeVisible() failed
  65 |   });
  66 | });
  67 | 
  68 | test.describe('Konfigurasi Sistem (RBAC)', () => {
  69 |   test('operator biasa tidak melihat tab Admin Control', async ({ page }) => {
  70 |     const username = uniqueUsername('e2e_rbac');
  71 |     await registerAndLogin(page, username, 'TestPassword123!');
  72 |     await expect(page.getByText('Kendali Motor')).toBeVisible({ timeout: 15000 });
  73 | 
  74 |     await expect(page.getByRole('button', { name: 'Database' })).toBeVisible();
  75 |     await expect(page.getByRole('button', { name: 'Admin Control' })).toHaveCount(0);
  76 |   });
  77 | });
  78 | 
  79 | test.describe('Kontrol Aktuator', () => {
  80 |   test('panel Kendali Motor menampilkan kontrol D-pad dan tombol unlock', async ({ page }) => {
  81 |     const username = uniqueUsername('e2e_ctrl');
  82 |     await registerAndLogin(page, username, 'TestPassword123!');
  83 | 
  84 |     await expect(page.getByText('Kendali Motor')).toBeVisible({ timeout: 15000 });
  85 |     await expect(page.getByText('MEJA (X/Y)')).toBeVisible();
  86 |     await expect(page.getByText('FOKUS (Z)')).toBeVisible();
  87 |     await expect(page.getByTitle('Unlock GRBL')).toBeVisible();
  88 |   });
  89 | });
  90 | 
```