		// ============================================================
		// 三态主题：auto（跟随系统）→ light → dark → auto …
		// localStorage.theme ∈ { 'auto', 'light', 'dark' }，默认 'auto'
		// ============================================================
		const THEME_MQ = window.matchMedia('(prefers-color-scheme: dark)');

		function getThemePref() {
			const stored = localStorage.getItem('theme');
			return (stored === 'light' || stored === 'dark') ? stored : 'auto';
		}

		function resolveIsDark(pref) {
			return pref === 'dark' || (pref === 'auto' && THEME_MQ.matches);
		}

		function applyTheme() {
			const pref = getThemePref();
			document.documentElement.classList.toggle('dark', resolveIsDark(pref));
			updateThemeIcon(pref);
		}

		function cycleTheme() {
			// 循环顺序：auto → light → dark → auto
			const next = { auto: 'light', light: 'dark', dark: 'auto' }[getThemePref()];
			localStorage.setItem('theme', next);
			applyTheme();
		}

		function updateThemeIcon(pref) {
			const sun = document.getElementById('theme-sun');
			const moon = document.getElementById('theme-moon');
			const auto = document.getElementById('theme-auto');
			if (!sun || !moon || !auto) return;
			sun.classList.toggle('hidden', pref !== 'light');
			moon.classList.toggle('hidden', pref !== 'dark');
			auto.classList.toggle('hidden', pref !== 'auto');
		}

		// 系统主题变化时：auto 模式实时跟随切换（light/dark 强制模式不受影响）
		THEME_MQ.addEventListener('change', applyTheme);

		// 初始加载时执行
		applyTheme();

		// View Transitions 交换前：确保 dark class 已应用于新文档，消除切换闪烁
		document.addEventListener('astro:before-swap', (ev) => {
			if (resolveIsDark(getThemePref())) {
				ev.newDocument.documentElement.classList.add('dark');
			}
		});

		// View Transitions 页面切换后重新同步主题图标
		document.addEventListener('astro:page-load', applyTheme);

		// 导航栏滚动效果（简化版：只控制阴影深浅）
		const nav = document.getElementById('site-nav');
		function handleScroll() {
			if (window.scrollY > 100) {
				nav.classList.add('scrolled');
			} else {
				nav.classList.remove('scrolled');
			}
		}
		window.addEventListener('scroll', handleScroll);
		handleScroll();

			// 页脚 Canvas 星月粒子背景
			let footerCanvasAnimId = null;
			let footerCanvasResizeHandler = null;
			let footerCanvasVisHandler = null;
			let footerCanvasViewObserver = null;
			let footerCanvasDpr = 1;
			let footerCanvasResizeFrameId = null;

		function initFooterCanvas() {
			const canvas = document.getElementById('footer-canvas');
			const footer = document.getElementById('site-footer');
			if (!canvas || !footer) return;

			// 清理旧动画和监听器
			if (footerCanvasAnimId) {
				cancelAnimationFrame(footerCanvasAnimId);
				footerCanvasAnimId = null;
			}
			if (footerCanvasResizeHandler) {
				window.removeEventListener('resize', footerCanvasResizeHandler);
			}
				if (footerCanvasVisHandler) {
					document.removeEventListener('visibilitychange', footerCanvasVisHandler);
				}
				if (footerCanvasViewObserver) {
					footerCanvasViewObserver.disconnect();
					footerCanvasViewObserver = null;
				}
				if (footerCanvasResizeFrameId) {
					cancelAnimationFrame(footerCanvasResizeFrameId);
					footerCanvasResizeFrameId = null;
				}

				const ctx = canvas.getContext('2d');
				let width, height;
				let particles = [];
				let isFooterVisible = false;
				let isAnimating = false;

				function resize() {
					const rect = footer.getBoundingClientRect();
					width = rect.width;
					height = rect.height;
					footerCanvasDpr = window.devicePixelRatio || 1;
					canvas.width = width * footerCanvasDpr;
					canvas.height = height * footerCanvasDpr;
					canvas.style.width = width + 'px';
					canvas.style.height = height + 'px';
					ctx.setTransform(footerCanvasDpr, 0, 0, footerCanvasDpr, 0, 0);
				}

				function createSprite(p) {
					const radius = Math.ceil(p.size + p.glow + 6);
					const spriteSize = radius * 2;
					const sprite = document.createElement('canvas');
					sprite.width = spriteSize * footerCanvasDpr;
					sprite.height = spriteSize * footerCanvasDpr;

					const spriteCtx = sprite.getContext('2d');
					spriteCtx.scale(footerCanvasDpr, footerCanvasDpr);
					spriteCtx.translate(radius, radius);
					spriteCtx.globalAlpha = p.opacity;
					spriteCtx.shadowBlur = p.glow;
					spriteCtx.shadowColor = p.color;
					spriteCtx.fillStyle = p.color;

					switch (p.type) {
						case 'star':
							drawStar(spriteCtx, 0, 0, p.size, 0);
							break;
						case 'moon':
							drawMoon(spriteCtx, 0, 0, p.size, 0);
							break;
						case 'cross':
							drawCross(spriteCtx, 0, 0, p.size, 0);
							break;
					}

					p.sprite = sprite;
					p.spriteOffset = radius;
					p.spriteSize = spriteSize;
				}

			function createParticles() {
				particles = [];
				const layers = [
					{ count: 18, sizeMin: 18, sizeMax: 28, speedMin: 0.15, speedMax: 0.35, opacityMin: 0.08, opacityMax: 0.14, glow: 20, colors: ['#FF6B9D'], types: ['moon', 'star'] },
					{ count: 32, sizeMin: 10, sizeMax: 18, speedMin: 0.35, speedMax: 0.6, opacityMin: 0.15, opacityMax: 0.22, glow: 14, colors: ['#f90275'], types: ['star', 'moon', 'cross'] },
					{ count: 28, sizeMin: 6, sizeMax: 12, speedMin: 0.5, speedMax: 0.9, opacityMin: 0.22, opacityMax: 0.32, glow: 10, colors: ['#FF6B9D', '#f90275'], types: ['cross', 'star'] }
				];

				layers.forEach(layer => {
					for (let i = 0; i < layer.count; i++) {
							const particle = {
								x: Math.random() * width,
								y: Math.random() * height,
								size: layer.sizeMin + Math.random() * (layer.sizeMax - layer.sizeMin),
								type: layer.types[Math.floor(Math.random() * layer.types.length)],
								color: layer.colors[Math.floor(Math.random() * layer.colors.length)],
							speed: layer.speedMin + Math.random() * (layer.speedMax - layer.speedMin),
							rotation: Math.random() * Math.PI * 2,
								rotationSpeed: (Math.random() - 0.5) * 0.015,
								opacity: layer.opacityMin + Math.random() * (layer.opacityMax - layer.opacityMin),
								glow: layer.glow + Math.random() * 4
							};
							createSprite(particle);
							particles.push(particle);
						}
					});
				}

			function drawStar(ctx, x, y, size, rotation) {
				ctx.save();
				ctx.translate(x, y);
				ctx.rotate(rotation);
				ctx.beginPath();
				const outer = size;
				const inner = size * 0.35;
				for (let i = 0; i < 8; i++) {
					const r = i % 2 === 0 ? outer : inner;
					const angle = (i * Math.PI) / 4 - Math.PI / 2;
					const px = Math.cos(angle) * r;
					const py = Math.sin(angle) * r;
					if (i === 0) ctx.moveTo(px, py);
					else ctx.lineTo(px, py);
				}
				ctx.closePath();
				ctx.fill();
				ctx.restore();
			}

			function drawMoon(ctx, x, y, size, rotation) {
				ctx.save();
				ctx.translate(x, y);
				ctx.rotate(rotation);
				ctx.beginPath();
				ctx.arc(0, 0, size, -Math.PI * 0.6, Math.PI * 0.6);
				ctx.bezierCurveTo(
					size * 0.15, size * 0.5,
					size * 0.15, -size * 0.5,
					size * Math.cos(-Math.PI * 0.6), size * Math.sin(-Math.PI * 0.6)
				);
				ctx.closePath();
				ctx.fill();
				ctx.restore();
			}

			function drawCross(ctx, x, y, size, rotation) {
				ctx.save();
				ctx.translate(x, y);
				ctx.rotate(rotation);
				const s = size * 0.22;
				const l = size;

				// top
				ctx.beginPath();
				ctx.moveTo(0, -l);
				ctx.lineTo(s, -l + s * 2.5);
				ctx.lineTo(0, -l + s * 4);
				ctx.lineTo(-s, -l + s * 2.5);
				ctx.closePath();
				ctx.fill();

				// bottom
				ctx.beginPath();
				ctx.moveTo(0, l);
				ctx.lineTo(s, l - s * 2.5);
				ctx.lineTo(0, l - s * 4);
				ctx.lineTo(-s, l - s * 2.5);
				ctx.closePath();
				ctx.fill();

				// left
				ctx.beginPath();
				ctx.moveTo(-l, 0);
				ctx.lineTo(-l + s * 2.5, s);
				ctx.lineTo(-l + s * 4, 0);
				ctx.lineTo(-l + s * 2.5, -s);
				ctx.closePath();
				ctx.fill();

				// right
				ctx.beginPath();
				ctx.moveTo(l, 0);
				ctx.lineTo(l - s * 2.5, s);
				ctx.lineTo(l - s * 4, 0);
				ctx.lineTo(l - s * 2.5, -s);
				ctx.closePath();
				ctx.fill();

				ctx.restore();
			}

				function draw() {
					ctx.clearRect(0, 0, width, height);

					particles.forEach(p => {
						ctx.save();
						ctx.translate(p.x, p.y);
						ctx.rotate(p.rotation);
						ctx.drawImage(p.sprite, -p.spriteOffset, -p.spriteOffset, p.spriteSize, p.spriteSize);
						ctx.restore();
					});
				}

			function update() {
				particles.forEach(p => {
					const angle = -Math.PI / 4;
					p.x += Math.cos(angle) * p.speed;
					p.y += Math.sin(angle) * p.speed;
					p.rotation += p.rotationSpeed;

					const margin = 60;
					if (p.x > width + margin) p.x = -margin;
					if (p.y < -margin) p.y = height + margin;
				});
			}

				function animate() {
					if (!isAnimating) return;
					update();
					draw();
					footerCanvasAnimId = requestAnimationFrame(animate);
				}

				function start() {
					if (isAnimating || document.hidden || !isFooterVisible) return;
					isAnimating = true;
					animate();
				}

				function stop() {
					isAnimating = false;
					if (footerCanvasAnimId) {
						cancelAnimationFrame(footerCanvasAnimId);
						footerCanvasAnimId = null;
					}
				}

				resize();
				createParticles();

				footerCanvasResizeHandler = () => {
					if (footerCanvasResizeFrameId) return;
					footerCanvasResizeFrameId = requestAnimationFrame(() => {
						footerCanvasResizeFrameId = null;
						resize();
						createParticles();
						draw();
					});
				};
				window.addEventListener('resize', footerCanvasResizeHandler);

				footerCanvasVisHandler = () => {
					if (document.hidden) {
						stop();
					} else {
						start();
					}
				};
				document.addEventListener('visibilitychange', footerCanvasVisHandler);

				footerCanvasViewObserver = new IntersectionObserver((entries) => {
					isFooterVisible = entries.some(entry => entry.isIntersecting);
					if (isFooterVisible) {
						start();
					} else {
						stop();
					}
				}, { rootMargin: '160px 0px' });
				footerCanvasViewObserver.observe(footer);
			}

		initFooterCanvas();
		document.addEventListener('astro:page-load', initFooterCanvas);

		// 移动端全屏菜单控制逻辑
		let isMobileMenuOpen = false;
		function toggleMobileMenu() {
			const menu = document.getElementById('mobile-menu');
			const links = document.querySelectorAll('.mobile-nav-link');
			const footer = document.getElementById('mobile-menu-footer');
			
			isMobileMenuOpen = !isMobileMenuOpen;

			if (isMobileMenuOpen) {
				menu.classList.remove('opacity-0', 'pointer-events-none');
				document.body.style.overflow = 'hidden';
				
				setTimeout(() => {
					links.forEach(link => {
						link.classList.remove('translate-x-12', 'opacity-0');
					});
					footer.classList.remove('translate-x-12', 'opacity-0');
				}, 50);
			} else {
				menu.classList.add('opacity-0', 'pointer-events-none');
				document.body.style.overflow = '';
				
				links.forEach(link => {
					link.classList.add('translate-x-12', 'opacity-0');
				});
				footer.classList.add('translate-x-12', 'opacity-0');
			}
		}

		function updateRuntime() {
			const start = new Date('2026-04-26T00:00:00');
			const now = new Date();
			const diff = now - start;
			const months = Math.floor(diff / (1000 * 60 * 60 * 24 * 30));
			const days = Math.floor((diff % (1000 * 60 * 60 * 24 * 30)) / (1000 * 60 * 60 * 24));
			const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
			let parts = [];
			if (months > 0) parts.push(months + '个月');
			if (days > 0) parts.push(days + '天');
			if (hours > 0 || (months === 0 && days === 0)) parts.push(hours + '小时');
			const el = document.getElementById('site-runtime');
			if (el) el.textContent = '本站已运行 ' + parts.join('');
		}
	// —— 导航栏搜索框：Enter 跳转到 /search?q= ——
	(function () {
		const navSearch = document.getElementById('search-input');
		if (navSearch) {
			navSearch.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					const q = navSearch.value.trim();
					if (q) {
						window.location.href = '/search?q=' + encodeURIComponent(q);
					}
				}
			});
		}
	})();

	// —— 视图切换逻辑见 src/views/switcher.ts（独立 module script，SPA 导航后 Astro 会重放）——

	updateRuntime();
	setInterval(updateRuntime, 1000);
