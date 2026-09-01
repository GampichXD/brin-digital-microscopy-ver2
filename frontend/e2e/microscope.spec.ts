import { test, expect } from '@playwright/test';

function uniqueUsername(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

async function registerAndLogin(page: import('@playwright/test').Page, username: string, password: string) {
  await page.goto('/');
  await page.getByRole('button', { name: /REGISTER/i }).click();
  await page.getByPlaceholder('Masukkan username...').fill(username);
  await page.getByPlaceholder('Masukkan password...').fill(password);
  await page.getByPlaceholder('Ulangi password...').fill(password);

  // Tunggu response API registrasi selesai (bukan cuma klik) sebelum lanjut,
  // karena AuthPage mereset field password secara async setelah sukses --
  // mengisi form login terlalu cepat akan tertimpa reset tsb (race condition).
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/auth/register') && r.status() === 201),
    page.getByRole('button', { name: /DAFTARKAN OPERATOR/i }).click(),
  ]);

  // AuthPage otomatis kembali ke mode LOGIN setelah registrasi sukses
  await expect(page.getByPlaceholder('Ulangi password...')).toHaveCount(0);
  await page.getByPlaceholder('Masukkan username...').fill(username);
  await page.getByPlaceholder('Masukkan password...').fill(password);
  await page.getByRole('button', { name: /MASUK KE INSTRUMEN/i }).click();
}

test.describe('Autentikasi', () => {
  test('login gagal dengan kredensial salah menampilkan pesan error', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('Masukkan username...').fill('operator_tidak_ada_' + Date.now());
    await page.getByPlaceholder('Masukkan password...').fill('password_salah_123');
    await page.getByRole('button', { name: /MASUK KE INSTRUMEN/i }).click();
    await expect(
      page.getByText(/ID Operator atau Password salah|Gagal tersambung/i)
    ).toBeVisible({ timeout: 10000 });
  });

  test('registrasi operator baru lalu login berhasil masuk ke dashboard', async ({ page }) => {
    const username = uniqueUsername('e2e_op');
    await registerAndLogin(page, username, 'TestPassword123!');
    await expect(page.getByText('Kendali Motor')).toBeVisible({ timeout: 15000 });
  });

  test('logout mengembalikan pengguna ke halaman autentikasi', async ({ page }) => {
    const username = uniqueUsername('e2e_logout');
    await registerAndLogin(page, username, 'TestPassword123!');
    await expect(page.getByText('Kendali Motor')).toBeVisible({ timeout: 15000 });

    await page.getByTitle('Keluar dari Instrumen').click();
    await expect(page.getByPlaceholder('Masukkan username...')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Notifikasi', () => {
  // Menguji kontrak fungsional showToast() pada AuthPage.tsx: memanggil
  // showToast() seharusnya menampilkan notifikasi visual ke pengguna.
  test('submit form kosong menampilkan toast peringatan', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /MASUK KE INSTRUMEN/i }).click();
    await expect(
      page.getByText('Username dan password tidak boleh kosong!')
    ).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Konfigurasi Sistem (RBAC)', () => {
  test('operator biasa tidak melihat tab Admin Control', async ({ page }) => {
    const username = uniqueUsername('e2e_rbac');
    await registerAndLogin(page, username, 'TestPassword123!');
    await expect(page.getByText('Kendali Motor')).toBeVisible({ timeout: 15000 });

    await expect(page.getByRole('button', { name: 'Database' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Admin Control' })).toHaveCount(0);
  });
});

test.describe('Kontrol Aktuator', () => {
  test('panel Kendali Motor menampilkan kontrol D-pad dan tombol unlock', async ({ page }) => {
    const username = uniqueUsername('e2e_ctrl');
    await registerAndLogin(page, username, 'TestPassword123!');

    await expect(page.getByText('Kendali Motor')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('MEJA (X/Y)')).toBeVisible();
    await expect(page.getByText('FOKUS (Z)')).toBeVisible();
    await expect(page.getByTitle('Unlock GRBL')).toBeVisible();
  });
});
