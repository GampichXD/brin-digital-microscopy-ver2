#!/usr/bin/env python3
"""Ringkas qa/results/newman.json menjadi tabel Markdown (qa/results/newman_ringkas.md)."""
import json
import os
import statistics
import sys

RES = os.path.join(os.path.dirname(__file__), "..", "results")
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(RES, "newman.json")
run = json.load(open(src))["run"]

# Peta id item -> nama folder
folder_of = {}
def walk(items, folder=None):
    for it in items:
        if "item" in it:
            walk(it["item"], it["name"])
        else:
            folder_of[it["id"]] = folder
walk(json.load(open(src))["collection"]["item"])

rows, by_folder = [], {}
for ex in run["executions"]:
    item = ex["item"]
    t = ex["response"]["responseTime"]
    code = ex["response"]["code"]
    asserts = ex.get("assertions", [])
    ok = all(not a.get("error") for a in asserts)
    f = folder_of.get(item["id"], "")
    rows.append((f, item["name"], ex["request"]["method"], code, t, ok, len(asserts)))
    by_folder.setdefault(f, []).append((t, ok))

times = [r[4] for r in rows]
out = ["# Hasil Newman", "",
       f"{len(rows)} request, {sum(r[6] for r in rows)} pemeriksaan, "
       f"{sum(1 for r in rows if not r[5])} request gagal. "
       f"Waktu respons rata-rata {statistics.mean(times):.0f} ms, median {statistics.median(times):.0f} ms, "
       f"maks {max(times)} ms.", "",
       "| Kelompok | Request | Lolos | Rata-rata (ms) | Maks (ms) |", "|---|---|---|---|---|"]
for f, v in by_folder.items():
    out.append(f"| {f} | {len(v)} | {sum(ok for _, ok in v)}/{len(v)} | "
               f"{statistics.mean(t for t, _ in v):.0f} | {max(t for t, _ in v)} |")
out += ["", "## Per request", "", "| Kelompok | Request | Metode | Status | Waktu (ms) | Lolos |",
        "|---|---|---|---|---|---|"]
for f, n, m, c, t, ok, _ in rows:
    out.append(f"| {f} | {n} | {m} | {c} | {t} | {'ya' if ok else '**tidak**'} |")
dst = os.path.join(RES, "newman_ringkas.md")
open(dst, "w").write("\n".join(out) + "\n")
print("\n".join(out[:16]))
print("->", dst)
