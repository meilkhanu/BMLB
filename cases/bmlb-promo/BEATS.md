# BMLB 15s promo — beat sheet (concept B: glass card is the only material)

概念：全片唯一素材是 BMLB 的签名玻璃卡片（bg-white/60 + backdrop-blur + 2rem 圆角 + 细边框）。
每个 beat 由上一张卡片 morph / zoomThrough / gather 出来，文章卡重复韵律段为主干，最后收拢成字标。

Look: 站点自有配色（不用 looks/ 预设）
  --bg #FAFAFA / --ink #1A1A1A / --grey #999 / --purple #8B7CB3 / --pink #FF6B9D
  --blue #7BA3D9 / --green #7CB38B / --amber #E8913A / --card #FFFFFF / --line #E8E8E4
  dark: bg #0F0F0F / ink #EAEAEA / card #1A1A1A
字体：小赖体（display，站标/标题）+ 系统黑体（正文）

## 节奏（镜头长度差 ≥ 4×：0.35s 词 ↔ 2.5s hold）

| t | beat | what moves | what is still | what carries into next |
|---|---|---|---|---|
| 0.0–0.35 | 「一个人的」三字逐个弹入 | wordRise ×3 | 空 ground + lattice | 字 |
| 0.35–0.7 | 「网站。」落地砸扁 | impact squash | — | 字→点 |
| 0.7–1.15 | 三字收拢成一点，点呼吸 | gather → dot | 点 | 点 |
| 1.15–1.9 | 点撑开成第一张玻璃卡（空卡） | morphRect(点→卡) | ground | 卡片 |
| 1.9–2.5 | 卡内标题三件套落下：英文小标 / 小赖标题 / 渐变细线 | wordRise×3 | 卡片 | 卡 |
| 2.5–3.4 | 基础信息两行（MEilk Fans · CAD / China Hunan）逐行 maskRise | maskRise×2 | 卡 | 卡 |
| 3.4–4.6 | 技能胶囊 6 个依次 popIn（Revit/PS/LR/MS Office/AI Agent/CAD） | popIn ×6 | 卡 | 胶囊们 |
| 4.6–6.4 | 镜头推穿卡片表面 → 文章卡流（一镜 6 张真实文章卡飞过，magnet 曲线牵引） | flyThrough ×6 + camera zoom | lattice | 最后一张文章卡 |
| 6.4–7.2 | 最后一张文章卡 hold（三Z-STUDIO 音乐卡） | drift 微推 | — | 卡 |
| 7.2–8.0 | 文章卡折成导航胶囊条（主页/归档/关于/now/colophon 五枚） | ribbon 切换 | 胶囊条 | 胶囊们 |
| 8.0–9.0 | 五枚胶囊 gather 收拢成一束 | gather | 束 | 束 |
| 9.0–10.2 | 束展开成作品卡（BIM 建模 featured） | morphRect | ground | 作品卡 |
| 10.2–11.0 | 作品卡 hold，图渐显 | drift | — | 卡 |
| 11.0–12.4 | 作品卡 zoomThrough 推穿 → /now 状态卡「韬光养晦，蛰龙待起」 | zoomThrough | 字 | 状态字 |
| 12.4–13.6 | 状态卡停 1.2s（最长的静止段） | — | 卡+字 | 卡 |
| 13.6–14.4 | 状态卡 seal 旋转收拢成字标「贝谟拉比」+ bmlb.online | seal | 黑底 | — |
| 14.4–15.0 | 字标 hold 落定 | — | 黑底 | — |

交接处清点（probe 会逐条验）：
  0.7 三字→点 gather；1.15 点→卡 morphRect；3.4 卡→文章卡流 zoomThrough(卡→第1张文卡)；
  6.4 文章卡→文卡 flyThrough 自身携带；7.2 文章卡→胶囊条 ribbon；8.0 胶囊 gather；
  9.0 胶囊束→作品卡 morphRect；11.0 作品卡→状态卡 zoomThrough；13.6 状态卡→字标 seal。
  全部有主体存活，无裸切。

## 内容（全部来自线上真实数据 app.db，无手编）

- 技能：Revit / PS / LR / MS Office / AI Agent / CAD
- 基础信息：Name MEilk Fans · Focus CAD / Forward Design · Location China Hunan
- 文章卡（6 张，封面全部真实 cover_image）：
  1. 欧布！留言板是坏的没发现QAQ · 札记 · 2026-08-08 · 已修复
  2. 酒，与情绪摇滚 · 体感 · 2026-08-07 · 我见过一个人，很有才华……
  3. Qwen 3.8 Max Preview实测体验，超强 · 车间 · 2026-07-28
  4. 网站主题个性化 · 车间 · 2026-07-27
  5. WorkBuddy 体验ing · 车间 · 2026-07-24
  6. 担心被AI取代？调转矛头！ · 时评簿 · 2026-07-25
- 导航：主页 / 归档 / 关于 / /now / /colophon
- 作品：厦门市规划数字技术研究中心实习 | BIM建模（featured）
- 状态：韬光养晦，蛰龙待起。
- 字标：贝谟拉比 · bmlb.online

## 声音（sfx_palette 合成，one room）

事件：字落(wood) ×3 · 点呼吸(sub) · 卡开(air) · 胶囊 pop(bubble)×6 · 文章卡飞过(air)×6 ·
胶囊切换(wood) · gather(glass) · 作品卡开(air) · zoomThrough(air) · 状态字(word) · seal(glass) · 字标(sub)。
音乐：免版权（Pixabay/NCS 一类）， duck 在打点下。
