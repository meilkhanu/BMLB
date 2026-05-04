// ============================================================
// 文章数据中心（临时方案，Phase 3 将迁移至 D1 数据库）
// 所有页面中的文章数据引用此文件，避免硬编码
// ============================================================

export interface Post {
  slug: string;
  title: string;
  date: string;            // YYYY-MM-DD
  category: string;        // 对应 SITE_CONFIG.categories[].name
  categoryId: string;      // 对应 SITE_CONFIG.categories[].id
  excerpt: string;
  content: string;         // HTML 格式的文章正文
  tags: string[];
  coverImage?: string;     // 可选封面图路径（public/images/ 下）
}

export const posts: Post[] = [
  // --- 首页「WebBuilding」系列 ---
  {
    slug: "wang-zhan-shang-xian",
    title: "网站正式公开上线",
    date: "2026-05-03",
    category: "札记",
    categoryId: "notes",
    excerpt:
      "高投入6天后，精力下降了，也应该回到该做的事上去了。建站是去年3月就想做的事情，随着大三课程和实习的忙碌，又放下了建站的进度。",
    content: `
<p>经过连续六天的高强度施工，贝谟拉比终于在 2026 年 5 月 3 日正式公开上线。</p>

<p>建站这件事最早要追溯到 2025 年 3 月。那时候刚接触前端不久，只懂一点 HTML 和 CSS 的皮毛，试图用 Vercel 部署一个静态站点，结果卡在域名配置上不了了之。后来大三课程和实习接踵而至，建站的进度彻底搁置。</p>

<p>这次能顺利推进，很大程度上得益于 AI 辅助编码工具的成熟。Kimi Code 在 VS Code 中提供了实时代码补全和重构建议，使得一个外行也能在短时间内搭出像样的页面骨架。不过 AI 只负责执行层面的加速，页面的审美判断、交互逻辑、信息架构——这些决策仍然需要人来把握。</p>

<h2>技术选型的考量</h2>

<p>选择 Astro + Cloudflare 这个组合，主要基于几个考量：</p>

<ul>
  <li><strong>轻量化</strong>：Astro 默认零 JS，只在需要交互的地方注入 Vanilla JS，符合「内容优先」的建站理念。</li>
  <li><strong>边缘部署</strong>：Cloudflare Pages 的全球 CDN 让国内访问也不会太慢， Workers 和 D1 提供了完整的全栈能力。</li>
  <li><strong>低维护成本</strong>：没有服务器需要管理，数据库是 SQLite 兼容的 D1，文件存储走 R2，全部在 Cloudflare 生态内。</li>
</ul>

<h2>接下来的计划</h2>

<p>网站上线只是开始。Phase 2 还有 about 页面需要构思，之后会进入 Phase 3 的文章系统建设——让文章从硬编码变为 D1 数据库驱动，同时搭建简易管理后台方便日常更新。</p>

<p>世界正在变快、变碎、变短；而我希望这里走得慢一点。</p>
    `.trim(),
    tags: ["建站", "Astro", "Cloudflare"],
  },
  {
    slug: "kuang-jia-wan-shan",
    title: "框架完善，抽 BaseLayout.astro",
    date: "2026-04-27",
    category: "札记",
    categoryId: "notes",
    excerpt:
      "两天完成整体架构搭建，并设计好首页，优化UI后就抽取了BaseLayout.astro。同时开始上传GitHub开始更新仓库。",
    content: `
<p>建站的第二天，完成了整体架构的搭建和首页初版设计。</p>

<h2>为什么要抽 BaseLayout</h2>

<p>当项目有两个以上页面时，导航栏、页脚、暗色模式切换逻辑、SEO meta 标签这些共性代码就开始四处重复。Astro 的布局组件正好解决这个问题——把外壳抽到 <code>src/layouts/BaseLayout.astro</code>，页面只需要关注自己区域的内容。</p>

<p>抽取过程比预想的顺利。导航栏的响应式逻辑（PC 横向菜单 + 移动端全屏 Hamburger）、暗色模式的 localStorage 持久化、页脚的动态运行时间——这些全部收敛到 BaseLayout 中，子页面通过 <code>&lt;slot /&gt;</code> 插入内容。</p>

<h2>GitHub 仓库初始化</h2>

<p>同一天把项目推到了 GitHub，配置了 Cloudflare Pages 的自动部署：<code>git push</code> 即触发 <code>npm run build</code>，构建产物自动分发到全球边缘节点。这套工作流跑通后，后续迭代只需 commit + push，无需手动部署。</p>

<h2>遇到的小坑</h2>

<ul>
  <li>Tailwind 的 dark mode 需要配合 <code>class</code> 策略而非 <code>media</code> 策略，才能让用户手动切换。</li>
  <li>Astro 的 <code>is:inline</code> 脚本不会被打包，适合暗色模式这种需要在页面加载瞬间执行的逻辑。</li>
  <li>Cloudflare 适配器的 SSR 模式要求 <code>output: 'server'</code>，否则动态路由无法工作。</li>
</ul>
    `.trim(),
    tags: ["架构", "Astro", "GitHub"],
  },
  {
    slug: "kai-shi-jian-zhan",
    title: "开始建站",
    date: "2026-04-26",
    category: "札记",
    categoryId: "notes",
    excerpt:
      "不想投简历了，只想回家。暂时不想写论文了。又不能无所事事地躺着，现在AI很强，试着做网站吧。",
    content: `
<p>2026 年 4 月 26 日，贝谟拉比正式开始施工。</p>

<p>这个决定来得有些突然。连续投了几周简历，回复寥寥；毕业论文的框架搭好了但迟迟不想动笔。不能就这么躺着，得做点什么。既然 AI 现在这么强，不如试着把去年没建成的网站捡起来。</p>

<h2>最初的想法</h2>

<p>我想要的是一个属于自己的空间——不是社交媒体上的时间线，也不是内容工厂式的博客。就是一个朴素的地方，可以放文章、照片、思考碎片。访问者不需要注册，不需要点赞，只需要阅读。</p>

<p>这个想法和「独立网页」运动的理念很接近：在算法推荐和平台围墙之外，保留一片自己掌控的数字土地。</p>

<h2>动手前的准备</h2>

<p>吸取了去年用 Vercel 失败的教训，这次先明确了完整技术栈：</p>

<ul>
  <li><strong>框架</strong>：Astro（而非纯 HTML）</li>
  <li><strong>样式</strong>：Tailwind CSS（不用手写 CSS）</li>
  <li><strong>部署</strong>：Cloudflare Pages（国内访问比 Vercel 快）</li>
  <li><strong>AI 辅助</strong>：Kimi Code in VS Code</li>
</ul>

<p>然后写了两份纲领文件——<em>项目文件结构规范</em>和<em>项目全局规划与开发指南</em>——作为后续 AI 协作的约束文档。这个习惯是从软件工程课上学来的：需求不写清楚，代码一定跑偏。</p>

<p>第一天的成果：项目初始化完成，Tailwind 和 Astro 配置就绪，首页 Hero 区初具雏形。</p>
    `.trim(),
    tags: ["建站", "起点"],
  },

  // --- 归档页「札记」系列 ---
  {
    slug: "chun-ye-du-shu-ji",
    title: "半封闭景观水体碳酸盐系统与碳汇观测日志",
    date: "2026-04-20",
    category: "札记",
    categoryId: "notes",
    excerpt:
      "对校园内一处半封闭景观水体进行了为期两周的碳酸盐系统观测，记录 pH、碱度、溶解无机碳的日变化规律。",
    content: `
<p>四月中旬，我在校园内一处半封闭景观水体设立了临时观测点，进行了为期两周的碳酸盐系统连续监测。</p>

<h2>观测背景</h2>

<p>半封闭景观水体（如人工湖、池塘）在城市生态系统中扮演着微妙的角色。它们既是景观节点，也是区域碳循环的参与者。然而，这类水体的碳酸盐平衡极易受人为干预（补水、曝气、施肥）和生物活动（藻类光合作用、呼吸）的影响，其碳汇功能的稳定性是一个值得关注的问题。</p>

<h2>观测方法</h2>

<ul>
  <li><strong>监测指标</strong>：水温、pH、溶解氧（DO）、碱度（Alkalinity）、溶解无机碳（DIC）</li>
  <li><strong>采样频率</strong>：每日 6:00、12:00、18:00 三次</li>
  <li><strong>计算参数</strong>：pCO₂、方解石饱和指数（SIc）、CO₂ 通量</li>
</ul>

<h2>初步发现</h2>

<p>观测期间，水体 pH 呈现出明显的昼夜波动（7.8–9.2），午间峰值与藻类光合作用消耗 CO₂ 高度吻合。碱度稳定在 2.1–2.4 meq/L 范围内，表明水体缓冲能力较好。</p>

<p>有趣的是，尽管午间 pH 升高导致 pCO₂ 降低、水体表现为大气 CO₂ 的"汇"，但夜间呼吸作用的反弹相当剧烈——凌晨 6:00 的 CO₂ 通量计算结果显示水体转为弱"源"。这个昼夜摇摆的特征在半封闭水体中可能被富营养化状态放大。</p>

<h2>后续方向</h2>

<p>两周的数据只能描绘一个快照。要评估这类水体的年尺度碳汇效应，需要跨季节的连续监测，同时纳入沉积物-水界面的碳通量——这将是下一阶段的工作。</p>
    `.trim(),
    tags: ["碳汇", "水体", "观测"],
  },
  {
    slug: "ka-fei-yu-dai-ma",
    title: "咖啡与代码",
    date: "2026-04-15",
    category: "札记",
    categoryId: "notes",
    excerpt:
      "在咖啡馆写代码的体验笔记：环境噪音、注意力曲线、以及为什么换一个物理空间有时能解开思路的死结。",
    content: `
<p>四月过半，建站之前最后的平静期。在咖啡馆泡了几个下午，写了一些零散的代码片段，也想了些和工作无关的事情。</p>

<h2>为什么是咖啡馆</h2>

<p>宿舍太安静了，安静到注意力反而容易涣散——没有外部刺激，大脑会自行寻找分心的出口。咖啡馆恰到好处的环境噪音（大约 60–70 dB）恰好落在一个「最佳 arousal」区间：不至于干扰思考，但能让大脑保持微弱的警觉状态。</p>

<p>这个现象有研究支持：适度的背景噪声可以提升抽象思维和创造力任务的表现（Mehta et al., 2012）。当然，前提是噪声是持续而均匀的——隔壁桌突然打翻咖啡的冲击不在讨论范围内。</p>

<h2>几个下午的产出</h2>

<ul>
  <li>用 Python 写了一个小脚本，批量处理观测站导出的 pH 数据，自动标记异常值</li>
  <li>读完了 Astro 文档的 Routing 和 Content Collections 章节</li>
  <li>构思了网站的分类体系——札记 / 时评簿 / 车间 / 体感 / 行记 / 底片</li>
</ul>

<p>效率不算高，但思路很清晰。有时候换一个物理空间，就是换一种思维路径。</p>
    `.trim(),
    tags: ["随笔", "效率", "环境"],
  },
  {
    slug: "cheng-shi-man-bu-bi-ji",
    title: "城市漫步笔记",
    date: "2026-03-10",
    category: "札记",
    categoryId: "notes",
    excerpt:
      "三月的城市漫步，从老城区到滨江步道，记录沿途的空间感知变化和偶然发现的城市细节。",
    content: `
<p>三月的一个周末，天气晴好，决定走路穿越半个城市。</p>

<h2>路线</h2>

<p>从老城区的骑楼街区出发，穿过中心商业区，沿江边步道一路向东，终点是新建的滨江公园。全程约 8 公里，步行 2.5 小时。</p>

<h2>空间感知的变化</h2>

<p>老城区的骑楼提供了连续的遮阳步行空间，尺度亲切，街道宽度与建筑高度的比值（D/H）约在 0.8–1.2 之间，是典型的「行人友好」比例。有趣的是，走进中心商业区后，D/H 骤升至 2.0 以上，空间的「包裹感」消失，取而代之的是开阔但冷漠的尺度。</p>

<p>直到接近江边，视野重新打开——这次是水平方向的展开，不再是建筑围合的开阔，而是自然边界的无垠感。三种空间体验在 2.5 小时内连续切换，像是一部无声的空间叙事。</p>

<h2>偶然发现</h2>

<ul>
  <li>骑楼街区有一家开了至少三十年的竹器店，老板在门口手工编织竹篮，和周围的奶茶店形成奇异的并置。</li>
  <li>江边步道的栏杆上嵌着当地中小学生的瓷砖画，内容从海洋生物到科幻飞船应有尽有——公共空间中的匿名创作。</li>
  <li>滨江公园的入口没有任何标识，是从一条不起眼的斜坡自然过渡进去的，这种「非正式入口」反而比气派的大门更让人觉得亲近。</li>
</ul>

<p>走路是很好的思维整理方式。双腿在运动的时候，大脑似乎也获得了某种节奏感。</p>
    `.trim(),
    tags: ["城市", "漫步", "空间"],
  },
];

// ============================================================
// 工具函数
// ============================================================

/** 按 slug 获取单篇文章 */
export function getPostBySlug(slug: string): Post | undefined {
  return posts.find((p) => p.slug === slug);
}

/** 获取相邻文章（用于上一篇/下一篇导航） */
export function getAdjacentPosts(
  slug: string
): { prev: Post | null; next: Post | null } {
  const index = posts.findIndex((p) => p.slug === slug);
  return {
    prev: index > 0 ? posts[index - 1] : null,
    next: index < posts.length - 1 ? posts[index + 1] : null,
  };
}

/** 按分类筛选文章 */
export function getPostsByCategory(categoryId: string): Post[] {
  return posts.filter((p) => p.categoryId === categoryId);
}

/** 获取最近 N 篇文章 */
export function getRecentPosts(n: number = 5): Post[] {
  return [...posts]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, n);
}
