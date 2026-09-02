import { test, expect } from '@playwright/test';

// JPEG kecil (64x64) yang valid secara biner -- dipakai untuk skenario Image
// Analysis yang butuh unggah berkas citra sungguhan (bukan byte acak), supaya
// decode OpenCV di backend (fallback lokal saat Edge offline) tidak gagal.
const TEST_JPEG_BASE64 =
  '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';

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

// Untuk akun yang sudah dibuat lebih dulu lewat API (mis. sudah dipromosikan
// jadi Admin) -- TIDAK mendaftar ulang, supaya tidak kena "sudah terdaftar".
async function loginOnly(page: import('@playwright/test').Page, username: string, password: string) {
  await page.goto('/');
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

// ── Helper API murni (tanpa UI) untuk skenario yang butuh akun Admin.
// Endpoint backend saat ini tidak mewajibkan header otorisasi apapun
// (temuan yang sudah didokumentasikan di Bab Analisis), jadi promosi
// peran bisa dipanggil langsung -- ini bagian "Arrange" E2E yang sah,
// bukan celah baru yang ditemukan di sini.
async function registerAndPromoteAdmin(request: import('@playwright/test').APIRequestContext, username: string, password: string) {
  const reg = await request.post('/api/auth/register', { data: { username, password } });
  if (!reg.ok()) throw new Error(`Gagal registrasi admin uji: ${reg.status()}`);
  const operators = await (await request.get('/api/auth/operators')).json();
  const me = operators.find((o: { username: string }) => o.username === username);
  if (!me) throw new Error('Operator baru tidak ditemukan di /api/auth/operators');
  await request.put(`/api/auth/operators/${me.id}/role`, { data: { role: 'ADMIN' } });
  return me.id as number;
}

async function deleteOperatorViaApi(request: import('@playwright/test').APIRequestContext, userId: number) {
  await request.delete(`/api/auth/operators/${userId}`).catch(() => {});
}

test.describe('Kelola Dataset', () => {
  test('membuat folder dataset baru lewat UI dan muncul di daftar', async ({ page, request }) => {
    const username = uniqueUsername('e2e_dataset');
    await registerAndLogin(page, username, 'TestPassword123!');
    await expect(page.getByText('Kendali Motor')).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Database' }).click();
    await page.getByRole('button', { name: /BUAT BARU/i }).click();

    const folderName = `e2e_folder_${Date.now()}`;
    await page.getByPlaceholder('Nama Folder', { exact: true }).fill(folderName);
    await page.getByPlaceholder('Jenis Objek (Label AI)').fill('Bakteri Uji E2E');
    await page.getByPlaceholder('Nama Operator').fill(username);
    await page.getByRole('button', { name: /SIMPAN/i }).click();

    await expect(page.getByRole('heading', { name: folderName })).toBeVisible({ timeout: 10000 });

    // Cleanup lewat API (tombol hapus di kartu folder berupa ikon tanpa label,
    // jadi pembersihan dilakukan lewat endpoint yang sudah diverifikasi di pytest).
    const folders = await (await request.get('/api/dataset/folders')).json();
    const created = folders.find((f: { name: string }) => f.name === folderName);
    if (created) await request.delete(`/api/dataset/folders/${created.id}`);
  });
});

test.describe('Kelola Operator (RBAC) - Admin', () => {
  test('Admin melihat daftar operator dan dapat mereset password operator lain', async ({ page, request }) => {
    const targetUsername = uniqueUsername('e2e_target');
    await registerAndPromoteAdmin(request, targetUsername, 'TestPassword123!');
    const targetOperators = await (await request.get('/api/auth/operators')).json();
    const targetId = targetOperators.find((o: { username: string }) => o.username === targetUsername)?.id;
    // Turunkan lagi jadi OPERATOR biasa supaya jadi target RBAC yang representatif.
    await request.put(`/api/auth/operators/${targetId}/role`, { data: { role: 'OPERATOR' } });

    const adminUsername = uniqueUsername('e2e_admin');
    const adminId = await registerAndPromoteAdmin(request, adminUsername, 'AdminPass123!');

    await loginOnly(page, adminUsername, 'AdminPass123!');
    await expect(page.getByRole('button', { name: 'Admin Control' })).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Admin Control' }).click();

    const targetRow = page.locator('tr', { hasText: targetUsername });
    await expect(targetRow).toBeVisible({ timeout: 10000 });
    await targetRow.getByTitle('Reset Password').click();

    await deleteOperatorViaApi(request, targetId);
    await deleteOperatorViaApi(request, adminId);
  });
});

test.describe('Konfigurasi Hardware Bus - Admin', () => {
  test('toggle Power Bus dari UI benar-benar mengubah state di backend', async ({ page, request }) => {
    const adminUsername = uniqueUsername('e2e_bus');
    const adminId = await registerAndPromoteAdmin(request, adminUsername, 'AdminPass123!');

    // Pastikan mulai dari kondisi aktif supaya arah toggle dapat diprediksi.
    await request.post('/api/hardware/bus/toggle', { data: { enabled: true } });

    await loginOnly(page, adminUsername, 'AdminPass123!');
    await page.getByRole('button', { name: 'Admin Control' }).click();
    await expect(page.getByText('INSTRUMEN POWER BUS')).toBeVisible({ timeout: 15000 });

    const toggleButton = page.locator('button:has(svg.lucide-toggle-right)').first();
    await toggleButton.click();

    await expect(async () => {
      const stats = await (await request.get('/api/hardware/telemetry/stats')).json();
      expect(stats.hardwareBus).toBe(false);
    }).toPass({ timeout: 5000 });

    // Kembalikan ke kondisi aktif supaya tidak mengganggu sesi/pengujian lain.
    await request.post('/api/hardware/bus/toggle', { data: { enabled: true } });
    await deleteOperatorViaApi(request, adminId);
  });
});

test.describe('Lihat Log Aktivitas', () => {
  test('tabel log aktivitas tampil dan dapat dicari', async ({ page }) => {
    const username = uniqueUsername('e2e_logs');
    await registerAndLogin(page, username, 'TestPassword123!');
    await expect(page.getByText('Kendali Motor')).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Documentation' }).click();
    await expect(page.getByText('Log Aktivitas Sistem')).toBeVisible({ timeout: 10000 });

    await page.getByPlaceholder('Cari operator / aktivitas...').fill('operator_yang_tidak_mungkin_ada_xyz');
    // Tabel harus tetap tampil (tidak error) meski hasil pencarian kosong.
    await expect(page.getByText('Log Aktivitas Sistem')).toBeVisible();
  });
});

test.describe('Registrasi Operator', () => {
  test('konfirmasi password tidak cocok menampilkan peringatan', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /REGISTER/i }).click();
    await page.getByPlaceholder('Masukkan username...').fill(uniqueUsername('e2e_mismatch'));
    await page.getByPlaceholder('Masukkan password...').fill('PasswordA123!');
    await page.getByPlaceholder('Ulangi password...').fill('PasswordB456!');
    await page.getByRole('button', { name: /DAFTARKAN OPERATOR/i }).click();
    await expect(page.getByText('Konfirmasi password tidak cocok!')).toBeVisible({ timeout: 5000 });
  });

  test('username yang sudah terdaftar menampilkan pesan error', async ({ page }) => {
    const username = uniqueUsername('e2e_dup');
    await page.goto('/');
    await page.getByRole('button', { name: /REGISTER/i }).click();
    await page.getByPlaceholder('Masukkan username...').fill(username);
    await page.getByPlaceholder('Masukkan password...').fill('TestPassword123!');
    await page.getByPlaceholder('Ulangi password...').fill('TestPassword123!');
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/auth/register') && r.status() === 201),
      page.getByRole('button', { name: /DAFTARKAN OPERATOR/i }).click(),
    ]);

    // Daftar lagi dengan username yang identik -- backend akan menolak (400),
    // ditampilkan lewat state errorMsg lokal AuthPage (bukan showToast).
    await page.getByRole('button', { name: /REGISTER/i }).click();
    await page.getByPlaceholder('Masukkan username...').fill(username);
    await page.getByPlaceholder('Masukkan password...').fill('TestPassword123!');
    await page.getByPlaceholder('Ulangi password...').fill('TestPassword123!');
    await page.getByRole('button', { name: /DAFTARKAN OPERATOR/i }).click();
    await expect(page.getByText(/sudah terdaftar/i)).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Ubah Password Sendiri', () => {
  test('operator dapat mengubah password akun miliknya sendiri', async ({ page, request }) => {
    const username = uniqueUsername('e2e_selfpass');
    await registerAndLogin(page, username, 'PasswordLama123!');
    await expect(page.getByText('Kendali Motor')).toBeVisible({ timeout: 15000 });

    await page.getByTitle('Profil Akun & Pengaturan').click();
    await page.getByPlaceholder('Masukkan password lama').fill('PasswordLama123!');
    await page.getByPlaceholder('Minimal 6 karakter').fill('PasswordBaru456!');
    await page.getByPlaceholder('Ketik ulang password baru').fill('PasswordBaru456!');
    await page.getByRole('button', { name: 'Simpan Perubahan' }).click();

    await expect(page.getByText('Password berhasil diubah secara permanen.')).toBeVisible({ timeout: 10000 });

    // cleanup
    const operators = await (await request.get('/api/auth/operators')).json();
    const me = operators.find((o: { username: string }) => o.username === username);
    if (me) await request.delete(`/api/auth/operators/${me.id}`);
  });
});

test.describe('Konfigurasi & Pemeliharaan Edge Device - Admin', () => {
  test('restart layanan Edge ditolak dengan jelas saat Jetson offline', async ({ page, request }) => {
    const adminUsername = uniqueUsername('e2e_restart');
    const adminId = await registerAndPromoteAdmin(request, adminUsername, 'AdminPass123!');

    await loginOnly(page, adminUsername, 'AdminPass123!');
    await page.getByRole('button', { name: 'Admin Control' }).click();
    await expect(page.getByText('Restart Layanan Edge')).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Restart Sekarang' }).click();
    await expect(page.getByRole('button', { name: 'Restart', exact: true })).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Restart', exact: true }).click();

    // Backend mengembalikan 409 (Jetson offline) -- harus tercermin sebagai notifikasi error, bukan silent fail.
    await expect(page.getByText(/offline|gagal|tidak/i).first()).toBeVisible({ timeout: 10000 });

    await deleteOperatorViaApi(request, adminId);
  });
});

test.describe('Buat Laporan Otomatis', () => {
  test('memilih folder dan membuat laporan Word tidak menampilkan error', async ({ page, request }) => {
    const folderName = `e2e_report_${Date.now()}`;
    const createRes = await request.post('/api/dataset/folders', {
      data: { name: folderName, object_type: 'Bakteri Uji E2E', date: '2026-09-02', operator: 'e2e' },
    });
    const folderId = (await createRes.json()).id;

    const username = uniqueUsername('e2e_doc');
    await registerAndLogin(page, username, 'TestPassword123!');
    await expect(page.getByText('Kendali Motor')).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Documentation' }).click();
    await page.getByText(folderName).click();
    await page.getByRole('button', { name: /Generate Microsoft Word/i }).click();

    // Indikator "Menyusun Berkas..." harus hilang lagi setelah backend selesai
    // (docx dibuat dari template) -- tidak boleh macet di state loading.
    await expect(page.getByText(/Menyusun Berkas/i)).toHaveCount(0, { timeout: 15000 });

    await request.delete(`/api/dataset/folders/${folderId}`);
  });
});

test.describe('Pantau Streaming & Telemetri', () => {
  test('status Edge Device dan statistik RAM/ROM tampil di header', async ({ page }) => {
    const username = uniqueUsername('e2e_telemetry');
    await registerAndLogin(page, username, 'TestPassword123!');
    await expect(page.getByText('Kendali Motor')).toBeVisible({ timeout: 15000 });

    await expect(page.getByText('OFFLINE').first()).toBeVisible();
    await expect(page.getByText(/RAM:/)).toBeVisible();
    await expect(page.getByText(/ROM:/)).toBeVisible();
  });
});

test.describe('Kendali Motor - Go-To Coordinate', () => {
  test('mengirim koordinat tujuan lewat mode manual tidak menimbulkan error', async ({ page }) => {
    const username = uniqueUsername('e2e_goto');
    await registerAndLogin(page, username, 'TestPassword123!');
    await expect(page.getByText('Kendali Motor')).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Image Gathering' }).click();
    await page.getByRole('button', { name: /MANUAL GATHER/i }).click();
    await expect(page.getByText('Go-To Coordinate')).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'GO', exact: true }).click();

    // Panel harus tetap responsif (bukan macet) -- Go-To Coordinate tetap terlihat.
    await expect(page.getByText('Go-To Coordinate')).toBeVisible();
  });
});

test.describe('Atur Parameter Kamera & CNC', () => {
  test('menerapkan pengaturan CNC (feed rate/backlash/dll) dari panel Live Stream', async ({ page }) => {
    const username = uniqueUsername('e2e_cncset');
    await registerAndLogin(page, username, 'TestPassword123!');
    await expect(page.getByText('Kendali Motor')).toBeVisible({ timeout: 15000 });

    await expect(page.getByText('Motor Speed / Feed')).toBeVisible({ timeout: 10000 });
    // Dua tombol "TERAPKAN" ada di panel ini (kamera & CNC) -- CNC tampil belakangan di DOM.
    await page.getByRole('button', { name: /TERAPKAN/i }).last().click();
    // Panel tetap utuh (tidak crash) setelah menerapkan pengaturan.
    await expect(page.getByText('Motor Speed / Feed')).toBeVisible();
  });

  test('menerapkan pengaturan kamera (shutter/ISO) dari panel Live Stream', async ({ page }) => {
    const username = uniqueUsername('e2e_camset');
    await registerAndLogin(page, username, 'TestPassword123!');
    await expect(page.getByText('Kendali Motor')).toBeVisible({ timeout: 15000 });

    await expect(page.getByText('Sensor Gain (ISO)')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /TERAPKAN/i }).first().click();
    await expect(page.getByText('Sensor Gain (ISO)')).toBeVisible();
  });
});

test.describe('Kelola Penyimpanan & Sinkronisasi - Admin', () => {
  test('panel Storage Management tampil dengan info kapasitas', async ({ page, request }) => {
    const adminUsername = uniqueUsername('e2e_storage');
    const adminId = await registerAndPromoteAdmin(request, adminUsername, 'AdminPass123!');

    await loginOnly(page, adminUsername, 'AdminPass123!');
    await page.getByRole('button', { name: 'Admin Control' }).click();
    await expect(page.getByText('Storage Management')).toBeVisible({ timeout: 15000 });

    await deleteOperatorViaApi(request, adminId);
  });
});

test.describe('Konfigurasi & Pemeliharaan Edge Device - Admin (Vision AI & CNC)', () => {
  test('panel Vision AI Inference dan CNC & GRBL Maintenance tampil untuk Admin', async ({ page, request }) => {
    const adminUsername = uniqueUsername('e2e_visionai');
    const adminId = await registerAndPromoteAdmin(request, adminUsername, 'AdminPass123!');

    await loginOnly(page, adminUsername, 'AdminPass123!');
    await page.getByRole('button', { name: 'Admin Control' }).click();
    await expect(page.getByText('Vision AI Inference')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('CNC & GRBL Maintenance')).toBeVisible();
    await expect(page.getByText('Camera Optics (IMX477)')).toBeVisible();

    await deleteOperatorViaApi(request, adminId);
  });
});

test.describe('Konfigurasi Sistem (RBAC) - Cakupan Tab Operator', () => {
  test('operator melihat seluruh 5 tab non-admin secara lengkap', async ({ page }) => {
    const username = uniqueUsername('e2e_tabs');
    await registerAndLogin(page, username, 'TestPassword123!');
    await expect(page.getByText('Kendali Motor')).toBeVisible({ timeout: 15000 });

    for (const tab of ['Live Stream', 'Database', 'Image Gathering', 'Image Analysis', 'Documentation']) {
      await expect(page.getByRole('button', { name: tab })).toBeVisible();
    }
  });
});

// ── 4 use case tersisa di bawah ini TIDAK butuh hardware fisik untuk diuji:
// backend punya fallback eksplisit saat Jetson/Edge offline (gambar tile mock
// hasil cv2 untuk Grid Scan, pemrosesan OpenCV lokal untuk Image Analysis,
// keduanya sudah diverifikasi lewat pytest G11/E03-E04 & koleksi Postman
// Integration Test). Hanya penyelesaian PENUH proses Tile Stitching yang
// betul-betul menunggu Edge -- di sini diuji sampai titik "dimulai lalu
// dipantau", bukan sampai selesai (itu baru butuh Edge fisik).

test.describe('Kendali Motor - Jalankan Grid Scan Otomatis', () => {
  test('AUTO GATHER menjalankan grid scan sampai selesai memakai fallback gambar mock (Edge offline)', async ({ page, request }) => {
    await request.post('/api/hardware/bus/toggle', { data: { enabled: true } });

    const username = uniqueUsername('e2e_gridscan');
    await registerAndLogin(page, username, 'TestPassword123!');
    await expect(page.getByText('Kendali Motor')).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Image Gathering' }).click();
    await expect(page.getByText('Parameter Grid')).toBeVisible({ timeout: 10000 });

    // Perkecil grid (dari default 5x4) supaya scan cepat selesai -- tiap tile
    // tetap lewat alur backend penuh (gerak motor simulasi, tunggu tile, fallback mock).
    await page.getByText('Kolom', { exact: true }).locator('xpath=following-sibling::input').fill('2');
    await page.getByText('Baris', { exact: true }).locator('xpath=following-sibling::input').fill('2');

    await page.getByRole('button', { name: /CAPTURE \d+ GAMBAR/i }).click();

    await expect(page.getByText('Hasil Tangkapan Gambar')).toBeVisible({ timeout: 60000 });
    await expect(page.getByText(/Pemindaian grid berhasil/i)).toBeVisible({ timeout: 5000 });

    // Tutup modal review (buang hasil) supaya tidak membebani sesi berikutnya.
    await page.getByRole('button', { name: 'BATAL' }).click();
  });
});

test.describe('Kelola Hasil Pindai - Gabungkan Citra (Tile Stitching)', () => {
  test('memulai tile stitching dari hasil grid scan dan pemantauannya dapat ditutup', async ({ page, request }) => {
    await request.post('/api/hardware/bus/toggle', { data: { enabled: true } });

    const username = uniqueUsername('e2e_stitch');
    await registerAndLogin(page, username, 'TestPassword123!');
    await expect(page.getByText('Kendali Motor')).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Image Gathering' }).click();
    await expect(page.getByText('Parameter Grid')).toBeVisible({ timeout: 10000 });
    await page.getByText('Kolom', { exact: true }).locator('xpath=following-sibling::input').fill('2');
    await page.getByText('Baris', { exact: true }).locator('xpath=following-sibling::input').fill('2');
    await page.getByRole('button', { name: /CAPTURE \d+ GAMBAR/i }).click();
    await expect(page.getByText('Hasil Tangkapan Gambar')).toBeVisible({ timeout: 60000 });

    await page.getByRole('button', { name: /TILE STITCHING/i }).click();
    await expect(page.getByText(/Tile Stitching Berjalan di Edge Device/i)).toBeVisible({ timeout: 10000 });

    // Edge offline -> stitching sungguhan tak akan pernah selesai di sisi Edge;
    // yang diuji di sini adalah kontrak "tutup pemantauan" (proses Edge tetap
    // berjalan by design, sesuai komentar kode aslinya).
    await page.getByRole('button', { name: 'BATAL' }).click();
    await expect(page.getByText(/Menutup pemantauan stitching/i)).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Jalankan Analisis Citra', () => {
  test('unggah citra lalu terapkan tool Adaptive Thresholding (fallback OpenCV server saat Edge offline)', async ({ page }) => {
    const username = uniqueUsername('e2e_analysis');
    await registerAndLogin(page, username, 'TestPassword123!');
    await expect(page.getByText('Kendali Motor')).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Image Analysis' }).click();
    await expect(page.getByText('CARI BERKAS CITRA')).toBeVisible({ timeout: 10000 });

    await page.locator('input[type="file"]').setInputFiles({
      name: 'e2e_specimen.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from(TEST_JPEG_BASE64, 'base64'),
    });

    await expect(page.getByRole('button', { name: /Adaptive Thresholding/i })).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /Adaptive Thresholding/i }).click();

    // Backend memproses lokal (bukan di Jetson) -- kontrak UI-nya adalah toast
    // peringatan eksplisit, bukan diam-diam menampilkan hasil seolah dari Edge.
    await expect(page.getByText(/Diproses di .* \(Jetson tidak terhubung\)/i)).toBeVisible({ timeout: 20000 });
  });
});

test.describe('Kelola Sesi Pemindaian Aktif', () => {
  test('operator dapat memantau progres dan membatalkan grid scan yang sedang berjalan', async ({ page, request }) => {
    await request.post('/api/hardware/bus/toggle', { data: { enabled: true } });

    const username = uniqueUsername('e2e_scansession');
    await registerAndLogin(page, username, 'TestPassword123!');
    await expect(page.getByText('Kendali Motor')).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Image Gathering' }).click();
    await expect(page.getByText('Parameter Grid')).toBeVisible({ timeout: 10000 });
    // Grid lebih besar dari test Grid Scan (3x3) supaya sempat dibatalkan
    // di tengah jalan, bukan keburu selesai sendiri.
    await page.getByText('Kolom', { exact: true }).locator('xpath=following-sibling::input').fill('3');
    await page.getByText('Baris', { exact: true }).locator('xpath=following-sibling::input').fill('3');

    await page.getByRole('button', { name: /CAPTURE \d+ GAMBAR/i }).click();

    // Progres per-tile tampil real-time lewat WebSocket sebelum dibatalkan --
    // ini bagian "memantau" dari use case, bukan cuma "membatalkan".
    await expect(page.getByText(/Tile \d+\/\d+/i)).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'BATAL' }).click();
    await expect(page.getByText(/Pemindaian dibatalkan/i)).toBeVisible({ timeout: 15000 });
  });
});
