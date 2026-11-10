# Koleksi Postman / Newman

- `Digital_Microscopy_API_QoS.postman_collection.json`: 132 request dalam 9 kelompok. Dibangun ulang dengan `python3 qa/postman/build_collection.py`.
- `sample_tile.jpg`: gambar untuk uji unggah.
- `DAFTAR_ENDPOINT.md` dan `daftar_endpoint.tsv`: tabel seluruh endpoint (TSV bisa ditempel ke Word/Excel).

Aman untuk situs live: endpoint yang menggerakkan CNC, memulai scan/stitching, mengubah konfigurasi, me-restart Edge, atau menghapus data massal hanya diuji penolakan aksesnya. Akun operator dan folder dataset yang dibuat selama uji dihapus lagi di akhir.

Menjalankan:

```bash
npx newman run qa/postman/Digital_Microscopy_API_QoS.postman_collection.json \
  --env-var baseUrl=https://e-eye.cloud --env-var adminUser=... --env-var adminPass=... \
  --delay-request 600 --working-dir qa/postman \
  -r cli,json --reporter-json-export qa/results/newman.json
python3 qa/postman/summarize_newman.py   # -> qa/results/newman_ringkas.md
```

Di aplikasi Postman: Import berkas koleksi, isi variabel koleksi `adminUser` dan `adminPass`, lalu Run collection. Variabel lain diisi otomatis.
