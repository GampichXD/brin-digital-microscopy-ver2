"""Rumus grid scan (persamaan 1-4 laporan). Fungsi murni supaya bisa diuji, dan dipakai
ulang oleh skrip uji ETA Hardware/Testing/t05_eta_scan.py."""
import math

DEFAULT_FEED_RATE_MM_MIN = 250.0
MIN_MOVE_DELAY_S = 0.5

# Jeda tambahan saat pindah baris. Saat pindah baris, meja bergerak di sumbu Y dan arah X
# berbalik (serpentine), sehingga getaran mekanis lebih besar. Tanpa jeda ini, citra
# pertama di baris baru berisiko goyang atau buram.
ROW_CHANGE_SETTLE_S = 1.0


def plan_serpentine(rows, cols, x0, y0, dx, dy):
    """Urutan tile serpentine, persamaan (1)-(2). Label grid dibalik: tile di posisi AWAL
    motor = r(rows-1)_c(cols-1), tile di sudut TERJAUH = r0_c0 (orientasi stage & stitching)."""
    tiles = []
    for r in range(rows):
        for c in range(cols):
            actual_c = c if r % 2 == 0 else (cols - 1 - c)
            tiles.append({
                "x": x0 + actual_c * dx,
                "y": y0 + r * dy,
                "grid_row": rows - 1 - r,
                "grid_col": cols - 1 - actual_c,
                "row_change": c == 0 and r > 0,
            })
    return tiles


def compute_delay(distance_mm, feed_mm_per_s, delay_ms, row_change=False, row_settle_s=ROW_CHANGE_SETTLE_S):
    """t_jeda = max(0,5; t_tempuh) + t_stab + t_baris*delta_baris, persamaan (3)-(4)."""
    travel = distance_mm / feed_mm_per_s if distance_mm > 0 else 0.0
    return max(MIN_MOVE_DELAY_S, travel) + delay_ms / 1000.0 + (row_settle_s if row_change else 0.0)


def estimate_scan_seconds(rows, cols, dx, dy, feed_mm_min, delay_ms, row_settle_s=ROW_CHANGE_SETTLE_S):
    """Total waktu tunggu gerak di sepanjang scan (tanpa waktu capture dan kirim citra)."""
    feed = feed_mm_min / 60.0
    total, last_x, last_y = 0.0, 0.0, 0.0
    for tile in plan_serpentine(rows, cols, 0.0, 0.0, dx, dy):
        distance = math.hypot(tile["x"] - last_x, tile["y"] - last_y)
        total += compute_delay(distance, feed, delay_ms, tile["row_change"], row_settle_s)
        last_x, last_y = tile["x"], tile["y"]
    return total
