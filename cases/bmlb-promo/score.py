#!/usr/bin/env python3
# BMLB 15s promo — score.py
# 事件全部取自 comp.html 的真实时间点；一个材料组、一个混响空间（references/sound.md 的规矩）。
import sys, os
sys.path.insert(0, os.path.join(os.environ['LOCALAPPDATA'], 'hermes', 'skills', 'creative', 'onetake', 'scripts'))
from sfx_palette import *   # noqa

DUR = 15.0

# ── comp.html 的真实时间点 ────────────────────────────────────────────────
W1        = [0.05, 0.42, 0.79, 1.16]     # 一个人 的 网站 。
DOT_IN    = 1.16                        # 句号聚成圆点（#glass 第一态）
G_IN      = 1.62                        # 圆点撑开成主卡
INFO0     = 2.35                        # 基础信息三行
SKILL0    = 3.20                        # 技能胶囊 6 枚
POST_IN   = 4.30                        # 文章卡流开始（居中单卡）
POST_DT   = [1.10, 0.90, 0.80, 0.80, 0.70, 0.60]   # 前疏后密
NAV_IN    = 9.25                        # 文章卡 → 胶囊条
WORK_IN   = 10.32                       # 胶囊条 → 作品卡
ZT_IN     = 11.34                       # 作品卡 → 状态卡
SEAL_IN   = 13.55                       # seal 收拢

s = Score(dur=DUR)

# 1 · 四个字落地：木，音高逐级上行（一个材料，音高变化）
for i, t in enumerate(W1):
    s.place(wood(150 + i * 26, 0.13), t=t + 0.03, gain=0.28 - i * 0.02, pan=(i - 1.5) * 0.12, send=0.30)

# 2 · 句号砸下、聚成圆点：sub 一下
s.place(sub(96, 0.34), t=W1[3] + 0.05, gain=0.32, send=0.42)
s.place(bubble(880, 0.20), t=DOT_IN + 0.02, gain=0.12, pan=0.05, send=0.55)

# 3 · 圆点撑开成主卡：air 张开（全片最响的一次）
s.place(air(0.44, 180, 1500, 1.3, 0.42), t=G_IN - 0.04, gain=0.40, send=0.50)
s.place(glass(523, 0.55, 0.7), t=G_IN + 0.44, gain=0.15, send=0.55)

# 4 · 基础信息三行：木，轻
for i in range(3):
    s.place(wood(210 + i * 18, 0.09), t=INFO0 + i * 0.26 + 0.05, gain=0.19, pan=-0.2 + i * 0.2, send=0.30)

# 5 · 六枚技能胶囊：bubble 逐个（同一材料，音高上行）
for i in range(6):
    s.place(bubble(620 + i * 90, 0.16), t=SKILL0 + i * 0.11 + 0.04, gain=0.14,
            pan=-0.5 + i * 0.2, send=0.38)

# 6 · 文章卡流：每张卡一声 air，前疏后密（间隔同步 comp 的 POST_DT）
off = 0.0
for i, d in enumerate(POST_DT):
    s.place(air(0.32, 320, 1900, 1.2, 0.45), t=POST_IN + off + 0.08, gain=0.24,
            pan=0.5 - i * 0.16, send=0.48)
    off += d

# 7 · 文章卡 → 胶囊条：glass 一击
s.place(glass(784, 0.7, 0.9), t=NAV_IN - 0.02, gain=0.18, pan=0.15, send=0.55)

# 8 · 胶囊条 → 作品卡：air 张开
s.place(air(0.40, 200, 1700, 1.3, 0.42), t=WORK_IN - 0.03, gain=0.34, send=0.50)
s.place(glass(659, 0.6, 0.8), t=WORK_IN + 0.42, gain=0.15, send=0.55)

# 9 · 作品卡 → 状态卡：长 air 推近，sub 定位
s.place(air(0.80, 240, 1200, 1.1, 0.35), t=ZT_IN - 0.08, gain=0.32, send=0.52)
s.place(sub(64, 0.6), t=ZT_IN + 0.45, gain=0.24, send=0.48)

# 10 · seal 收拢：glass 转 + sub 收尾
s.place(glass(880, 0.9, 1.0), t=SEAL_IN - 0.28, gain=0.17, send=0.58)
s.place(sub(58, 0.7), t=SEAL_IN + 0.02, gain=0.28, send=0.50)

# 11 · 片尾字标：bmlb.online 落定
s.place(glass(1046, 0.8, 0.9), t=SEAL_IN + 0.72, gain=0.14, send=0.58)

s.write('sfx.wav')
print('wrote sfx.wav')
