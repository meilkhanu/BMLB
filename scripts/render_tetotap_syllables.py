#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 tetotap 的「整词」音频切成「单音节」音频。

背景
----
tetotap 原先播放的是 15 个拼词（teto / kawaii / arigato ...），每个 0.9~2.6s。
点击时多个词重叠会互相盖住，节奏也糊。原仓库 mikutap 的做法是 32 个
「单音节」样本 + 280BPM 量化网格，本脚本按同一思路重建音频层。

输入：tools/tetotap-src/<word>.mp3  （早前用重音テト音源渲染的成品词，
      已在仓库中，仅作再加工源，不再部署到 public/）
输出：public/lab-apps/tetotap/audio/syl-<key>.mp3

Teto 官方规约禁止未经许可分布音源全部或一部分，因此仓库里只放
「再加工后的成品 mp3」，不放原始 wav；页面关于弹窗保留音源出处与
非商用声明。

依赖：ffmpeg、numpy
"""
import json
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SRC_DIR = os.path.join(REPO, "tools", "tetotap-src")
OUT_DIR = os.path.join(REPO, "public", "lab-apps", "tetotap", "audio")

SR = 44100
# 词 -> [(文件基名, 假名, 音高备注)]；音高由脚本实测后写进 manifest
WORDS = [
    ("teto", ["て", "と"]),
    ("tapa", ["た", "ぱ"]),
    ("kawaii", ["か", "わ", "い", "い"]),
    ("haiyo", ["は", "い", "よ"]),
    ("arigato", ["あ", "り", "が", "と"]),
    ("ohayo", ["お", "は", "よ"]),
    ("konnichi", ["こ", "ん", "に", "ち"]),
    ("pin", ["ぴ", "ん"]),
    ("doki", ["ど", "き"]),
    ("miao", ["みゃ", "お"]),
    ("pyon", ["ぴょ", "ん"]),
    ("niu", ["に", "う"]),
    ("bubu", ["ぶ", "ぶ"]),
    ("munya", ["む", "にゃ"]),
    ("uso", ["う", "そ"]),
]

MAX_MS = 620.0      # 单音节最长时长，超出则截断（点击乐器怕拖尾）
FADE_IN_MS = 12.0
FADE_OUT_MS = 90.0  # 自然结束的释放；截断时用 TRUNC_FADE_MS
TRUNC_FADE_MS = 200.0
PEAK = 0.75         # 归一化到 -2.5 dBFS，避免各音节响度差太远


def decode(path):
    r = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR),
         "-f", "f32le", "-"],
        capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype=np.float32).astype(np.float64).copy()


def encode(path, x):
    x = np.clip(x, -1.0, 1.0).astype(np.float32)
    r = subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR),
         "-ac", "1", "-i", "-", "-codec:a", "libmp3lame", "-b:a", "80k",
         "-write_xing", "1", path],
        input=x.tobytes(), capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.decode("utf-8", "replace"))


def rms_db(x, win):
    n = len(x) // win
    if n == 0:
        return np.array([-120.0])
    seg = x[: n * win].reshape(n, win)
    r = np.sqrt((seg ** 2).mean(1))
    return 20 * np.log10(r + 1e-9)


def split_syllables(x):
    """按能量谷把一段音频切成音节。返回 [(start, end), ...]（采样点）。"""
    win = int(0.005 * SR)
    n = len(x) // win
    if n == 0:
        return [(0, len(x))]
    db = rms_db(x, win)
    thr = db.max() - 15.0
    on = db > thr
    if not on.any():
        return [(0, len(x))]
    onset = int(np.argmax(on))
    rev = on[::-1]
    offset = n - int(np.argmax(rev))
    # 找 onset..offset 之间 >=3 帧（15ms）的静音间隙，取中点作边界
    bounds = [onset]
    i = onset
    while i < offset:
        if not on[i]:
            j = i
            while j < offset and not on[j]:
                j += 1
            if j - i >= 3:
                bounds.append((i + j) // 2)
            i = j
        else:
            i += 1
    bounds.append(offset)
    segs = []
    for k in range(len(bounds) - 1):
        a, b = bounds[k], bounds[k + 1]
        if b - a < 6:                   # 少于 6 帧（30ms）的碎片丢掉
            continue
        segs.append((a * win, min(b * win, len(x))))
    return segs


def f0(x):
    """自相关法估基频，返回 Hz（无声返回 0）。"""
    if len(x) < int(0.05 * SR):
        return 0.0
    xc = x - x.mean()
    win = int(0.045 * SR)
    hop = int(0.01 * SR)
    vals = []
    for i in range(0, max(1, len(xc) - win), hop):
        seg = xc[i:i + win]
        if np.sqrt((seg ** 2).mean()) < 0.02:
            continue
        ac = np.correlate(seg, seg, "full")[win - 1:]
        ac = ac / (ac[0] + 1e-9)
        lo, hi = int(SR / 500), min(int(SR / 70), len(ac) - 1)
        if hi <= lo:
            continue
        k = lo + int(np.argmax(ac[lo:hi]))
        if ac[k] > 0.45:
            vals.append(SR / k)
    return float(np.median(vals)) if vals else 0.0


def midi_of(hz):
    return 69 + 12 * np.log2(hz / 440.0) if hz > 0 else 0.0


def process(seg, truncated):
    """加淡入淡出 + 限长 + 归一化。"""
    a = int(FADE_IN_MS / 1000 * SR)
    seg = seg.copy()
    if a > 0 and len(seg) > a:
        seg[:a] *= np.linspace(0, 1, a)
    tail = int((TRUNC_FADE_MS if truncated else FADE_OUT_MS) / 1000 * SR)
    tail = min(tail, len(seg) // 2)
    if tail > 0:
        seg[-tail:] *= np.linspace(1, 0, tail)
    peak = np.abs(seg).max()
    if peak > 1e-6:
        seg *= PEAK / peak
    return seg


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    manifest = {}
    idx = 0
    for word, kanas in WORDS:
        src = os.path.join(SRC_DIR, word + ".mp3")
        if not os.path.exists(src):
            sys.exit("缺少源文件: " + src)
        x = decode(src)
        segs = split_syllables(x)
        if len(segs) != len(kanas):
            sys.exit("切片数与假名不符: %s -> %d 段, 期望 %d"
                     % (word, len(segs), len(kanas)))
        for (a, b), kana in zip(segs, kanas):
            key = "%s_%d" % (word, idx)
            raw = x[a:b]
            truncated = len(raw) > MAX_MS / 1000 * SR
            if truncated:
                raw = raw[: int(MAX_MS / 1000 * SR)]
            out = process(raw, truncated)
            dst = os.path.join(OUT_DIR, "syl-%s.mp3" % key)
            encode(dst, out)
            hz = f0(out)
            manifest[key] = {
                "text": kana,
                "word": word,
                "midi": round(midi_of(hz), 2),
                "hz": round(hz, 1),
                "dur": round(len(out) / SR, 3),
                "bytes": os.path.getsize(dst),
            }
            print("%-12s %s  midi=%6.2f  %.0fms  %6dB"
                  % (key, kana, manifest[key]["midi"],
                     manifest[key]["dur"] * 1000, manifest[key]["bytes"]))
            idx += 1

    # 按音高排序后的索引表，方便页面挑低音做贝斯线
    order = sorted(manifest, key=lambda k: manifest[k]["midi"])
    with open(os.path.join(OUT_DIR, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump({"count": idx, "by_pitch": order, "syllables": manifest},
                  f, ensure_ascii=False, indent=1)
    print("\n共 %d 个音节, 总大小 %.1f KB"
          % (idx, sum(v["bytes"] for v in manifest.values()) / 1024))


if __name__ == "__main__":
    main()
