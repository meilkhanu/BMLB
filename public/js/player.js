		(function () {
			// ============================================================
			// 第一层：全局状态（只初始化一次）
			// ============================================================
			if (!window.playerState) {
				window.playerState = {
					currentIndex: 0,
					songs: [],
					isPlaying: false,
					playMode: 'loop',
					initialized: false,
				};
			}
			const state = window.playerState;

			if (!state.initialized) {
				const el = document.getElementById('global-songs-data');
				if (el) {
					try {
						const songs = JSON.parse(el.dataset.songs || '[]');
						if (songs.length > 0) { state.songs = songs; state.initialized = true; }
					} catch {}
				}
			}

			// ============================================================
			// 第二层：每次页面加载重新同步 DOM
			// ============================================================
			function bindPlayerDom() {
				const audio = document.getElementById('global-audio');
				const player = document.getElementById('draggable-player');
				if (!audio || !player) return;

				const collapsed = document.getElementById('player-collapsed');
				const expanded = document.getElementById('player-expanded');
				const floatTitle = document.getElementById('float-title');
				const floatPlayBtn = document.getElementById('float-play');
				const floatIconPlay = document.getElementById('float-icon-play');
				const floatIconPause = document.getElementById('float-icon-pause');
				const floatModeBtn = document.getElementById('float-mode');
				const floatListBtn = document.getElementById('float-list');
				const floatPlaylist = document.getElementById('float-playlist');
				const floatPlaylistItems = document.getElementById('float-playlist-items');
				const floatPlaylistClose = document.getElementById('float-playlist-close');

				// ---- UI 函数（每次调用都重建，引用当前 DOM 节点） ----
				function setExpanded(exp) {
					player.dataset.expanded = exp ? 'true' : 'false';
				}

				function updateFloatPlaylistUI() {
					if (!floatPlaylistItems) return;
					floatPlaylistItems.innerHTML = state.songs.map((s, i) =>
						'<div class="flex items-center gap-2 p-2 rounded-xl cursor-pointer transition-colors ' + (i === state.currentIndex ? 'bg-[#8B7CB3]/10' : 'hover:bg-black/5 dark:hover:bg-white/5') + '" data-play-index="' + i + '">' +
							'<div class="w-7 h-7 rounded-lg bg-gradient-to-tr from-[#8B7CB3] to-[#C9BAE5] dark:to-[#4A3B73] flex items-center justify-center text-white shrink-0 text-[10px] font-bold">' + (i + 1) + '</div>' +
							'<div class="flex-1 min-w-0">' +
								'<div class="text-xs font-bold text-[#1A1A1A] dark:text-[#EAEAEA] truncate">' + s.title + '</div>' +
								'<div class="text-[10px] text-[#999] truncate">' + (s.artist || '') + '</div>' +
							'</div>' +
							(i === state.currentIndex && state.isPlaying ? '<div class="flex items-end gap-[1px] h-3"><div class="w-[2px] bg-[#8B7CB3] rounded-full h-[60%] animate-pulse"></div><div class="w-[2px] bg-[#8B7CB3] rounded-full h-[100%] animate-pulse" style="animation-delay:0.1s"></div></div>' : '') +
						'</div>'
					).join('');
					floatPlaylistItems.querySelectorAll('[data-play-index]').forEach(el => {
						el.addEventListener('click', () => {
							window.playerPlayIndex(parseInt(el.dataset.playIndex));
						});
					});
				}

				function updateFloatUI() {
					if (!state.songs || state.songs.length === 0) {
						floatTitle.textContent = '暂无音乐';
						player.classList.remove('is-playing');
						return;
					}
					const song = state.songs[state.currentIndex];
					if (song) floatTitle.textContent = song.title || '未知歌曲';
					if (state.isPlaying) {
						floatIconPlay.classList.add('hidden');
						floatIconPause.classList.remove('hidden');
						player.classList.add('is-playing');
					} else {
						floatIconPlay.classList.remove('hidden');
						floatIconPause.classList.add('hidden');
						player.classList.remove('is-playing');
					}
					// 模式图标（SVG）
					const mLoop = document.getElementById('float-mode-loop');
					const mSingle = document.getElementById('float-mode-single');
					const mShuffle = document.getElementById('float-mode-shuffle');
					if (mLoop && mSingle && mShuffle) {
						mLoop.classList.add('hidden');
						mSingle.classList.add('hidden');
						mShuffle.classList.add('hidden');
						const titleMap = { loop: '列表循环', single: '单曲循环', shuffle: '随机播放' };
						if (state.playMode === 'single') { mSingle.classList.remove('hidden'); floatModeBtn.title = titleMap.single; }
						else if (state.playMode === 'shuffle') { mShuffle.classList.remove('hidden'); floatModeBtn.title = titleMap.shuffle; }
						else { mLoop.classList.remove('hidden'); floatModeBtn.title = titleMap.loop; }
					}
				}

				window.__floatUpdateUI = updateFloatUI;

				function loadCurrentSong() {
					const song = state.songs[state.currentIndex];
					if (!song) return;
					audio.src = song.audio_url;
					updateFloatUI();
					updateFloatPlaylistUI();
					window.dispatchEvent(new CustomEvent('player-song-change', { detail: song }));
				}

				function playNext() {
					if (!state.songs.length) return;
					const wasPlaying = !audio.paused;
					if (state.playMode === 'shuffle') {
						state.currentIndex = Math.floor(Math.random() * state.songs.length);
					} else {
						state.currentIndex = (state.currentIndex + 1) % state.songs.length;
					}
					loadCurrentSong();
					if (wasPlaying) audio.play().catch(() => {});
				}

				function playPrev() {
					if (!state.songs.length) return;
					const wasPlaying = !audio.paused;
					if (state.playMode === 'shuffle') {
						state.currentIndex = Math.floor(Math.random() * state.songs.length);
					} else {
						state.currentIndex = (state.currentIndex - 1 + state.songs.length) % state.songs.length;
					}
					loadCurrentSong();
					if (wasPlaying) audio.play().catch(() => {});
				}

				function ensureSongLoaded() {
					if (!audio.src && state.songs.length > 0) {
						const song = state.songs[state.currentIndex];
						if (song) audio.src = song.audio_url;
					}
				}

				function switchMode() {
					const modes = ['loop', 'single', 'shuffle'];
					const idx = modes.indexOf(state.playMode);
					state.playMode = modes[(idx + 1) % 3];
					updateFloatUI();
					window.dispatchEvent(new CustomEvent('player-mode-change', { detail: state.playMode }));
				}

				// ---- 全局 API ----
				window.playerToggle = function () {
					if (!state.songs.length) return;
					ensureSongLoaded();
					if (audio.paused) audio.play().catch(() => {});
					else audio.pause();
				};

				window.playerPlayIndex = function (index) {
					state.currentIndex = index;
					const song = state.songs[index];
					if (song) {
						audio.src = song.audio_url;
						audio.play().catch(() => {});
						updateFloatUI();
						updateFloatPlaylistUI();
						window.dispatchEvent(new CustomEvent('player-song-change', { detail: song }));
						window.dispatchEvent(new CustomEvent('player-state-sync', {
							detail: { currentIndex: state.currentIndex, isPlaying: true, playMode: state.playMode, songs: state.songs }
						}));
					}
				};

				window.playerNext = function () {
					playNext();
					updateFloatUI();
					updateFloatPlaylistUI();
					window.dispatchEvent(new CustomEvent('player-state-sync', {
						detail: { currentIndex: state.currentIndex, isPlaying: !audio.paused, playMode: state.playMode, songs: state.songs }
					}));
				};
				window.playerPrev = function () {
					playPrev();
					updateFloatUI();
					updateFloatPlaylistUI();
					window.dispatchEvent(new CustomEvent('player-state-sync', {
						detail: { currentIndex: state.currentIndex, isPlaying: !audio.paused, playMode: state.playMode, songs: state.songs }
					}));
				};

				// ── 事件绑定只做一次（audio/player 通过 transition:persist 保留） ──
				if (!bindPlayerDom._eventsBound) {
					bindPlayerDom._eventsBound = true;

					floatPlayBtn.addEventListener('click', () => window.playerToggle());
					document.getElementById('float-prev').addEventListener('click', playPrev);
					document.getElementById('float-next').addEventListener('click', playNext);
					if (floatModeBtn) floatModeBtn.addEventListener('click', switchMode);
					if (floatListBtn) {
						floatListBtn.addEventListener('click', (e) => {
							e.stopPropagation();
							floatPlaylist.classList.toggle('hidden');
							if (!floatPlaylist.classList.contains('hidden')) updateFloatPlaylistUI();
						});
					}
					if (floatPlaylistClose) {
						floatPlaylistClose.addEventListener('click', (e) => {
							e.stopPropagation();
							floatPlaylist.classList.add('hidden');
						});
					}
					const floatCollapseBtn = document.getElementById('float-collapse');
					if (floatCollapseBtn) {
						floatCollapseBtn.addEventListener('click', (e) => {
							e.stopPropagation();
							setExpanded(false);
						});
					}
					// 胶囊进度线实时同步
					audio.addEventListener('timeupdate', () => {
						const fp = document.getElementById('float-progress');
						if (fp && audio.duration) fp.style.width = (audio.currentTime / audio.duration * 100) + '%';
					});
					if (collapsed) {
						collapsed.addEventListener('pointerdown', (e) => {
							e.stopPropagation();
							e.preventDefault();
							setExpanded(true);
						});
					}
					if (expanded) {
						expanded.addEventListener('click', (e) => {
							if (e.target.hasAttribute('data-no-drag') || e.target.closest('[data-no-drag]')) return;
							if (e.target === expanded) setExpanded(false);
						});
					}

					// 拖拽
					let dragging = false;
					let dragStartX, dragStartY, playerStartX, playerStartY;
					function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
					function getSavedPos() {
						try {
							const p = JSON.parse(localStorage.getItem('player-pos') || 'null');
							if (p && typeof p.x === 'number' && typeof p.y === 'number') return p;
						} catch {}
						return null;
					}
					const saved = getSavedPos();
					if (saved) {
						player.style.left = saved.x + 'px';
						player.style.top = saved.y + 'px';
						player.style.bottom = 'auto';
						player.style.right = 'auto';
					}
					player.addEventListener('pointerdown', (e) => {
						if (e.target.hasAttribute('data-no-drag') || e.target.closest('[data-no-drag]')) return;
						dragging = true;
						dragStartX = e.clientX; dragStartY = e.clientY;
						const r = player.getBoundingClientRect();
						playerStartX = r.left; playerStartY = r.top;
						player.setPointerCapture(e.pointerId);
						player.style.transition = 'none';
					});
					player.addEventListener('pointermove', (e) => {
						if (!dragging) return;
						const x = clamp(playerStartX + e.clientX - dragStartX, 0, window.innerWidth - player.offsetWidth);
						const y = clamp(playerStartY + e.clientY - dragStartY, 0, window.innerHeight - player.offsetHeight);
						player.style.left = x + 'px';
						player.style.top = y + 'px';
						player.style.bottom = 'auto';
						player.style.right = 'auto';
					});
					player.addEventListener('pointerup', () => {
						if (!dragging) return;
						dragging = false;
						player.style.transition = '';
						const r = player.getBoundingClientRect();
						localStorage.setItem('player-pos', JSON.stringify({ x: r.left, y: r.top }));
					});
				}

				// ── UI 同步每次都跑（状态可能变了） ──
				updateFloatUI();
				if (state.isPlaying) setExpanded(true);
				window.dispatchEvent(new CustomEvent('player-state-sync', {
					detail: {
						currentIndex: state.currentIndex,
						isPlaying: state.isPlaying,
						playMode: state.playMode,
						songs: state.songs,
					}
				}));
			}

			// ---- 音频事件（全局唯一，audio 节点通过 transition:persist 保留） ----
			function bindAudioListeners() {
				const audio = document.getElementById('global-audio');
				if (!audio || window.__audioListenersBound) return;
				window.__audioListenersBound = true;
				audio.addEventListener('play', () => {
					state.isPlaying = true;
					if (window.__floatUpdateUI) window.__floatUpdateUI();
					window.dispatchEvent(new CustomEvent('player-state-sync', {
						detail: { currentIndex: state.currentIndex, isPlaying: true, playMode: state.playMode, songs: state.songs }
					}));
				});
				audio.addEventListener('pause', () => {
					state.isPlaying = false;
					if (window.__floatUpdateUI) window.__floatUpdateUI();
					window.dispatchEvent(new CustomEvent('player-state-sync', {
						detail: { currentIndex: state.currentIndex, isPlaying: false, playMode: state.playMode, songs: state.songs }
					}));
				});
				audio.addEventListener('ended', () => {
					if (state.playMode === 'single') {
						audio.currentTime = 0;
						audio.play().catch(() => {});
					} else {
						const wasPlaying = true;
						if (state.playMode === 'shuffle') {
							state.currentIndex = Math.floor(Math.random() * state.songs.length);
						} else {
							state.currentIndex = (state.currentIndex + 1) % state.songs.length;
						}
						const song = state.songs[state.currentIndex];
						if (song) {
							audio.src = song.audio_url;
							window.dispatchEvent(new CustomEvent('player-song-change', { detail: song }));
						}
						if (wasPlaying) audio.play().catch(() => {});
					}
				});
			}

			bindAudioListeners();
			bindPlayerDom();
			document.addEventListener('astro:page-load', bindPlayerDom);
			document.addEventListener('DOMContentLoaded', bindPlayerDom);
		})();

		// ============================================================
		// 全站访问埋点 — 记录 PV/UV（每次页面加载仅上报一次）
		// ============================================================
		(function () {
			let sent = false;
			function trackVisit() {
				if (sent) return;
				sent = true;
				try {
					fetch('/api/stats', { method: 'POST', keepalive: true }).catch(() => {
						// fetch 被取消（如立刻关页）时用 sendBeacon 兜底
						try { if (navigator.sendBeacon) navigator.sendBeacon('/api/stats', ''); } catch (e) {}
					});
				} catch (e) { /* 统计失败静默 */ }
			}
			trackVisit();
		})();

					// ============================================================
					// 全局滚动淡入动画（IntersectionObserver，播一次即定格）
					(function () {
						if (window.__scrollFadeAnimator) {
							window.__scrollFadeAnimator.scan();
							return;
						}

						const observedElements = new WeakSet();

						const observer = new IntersectionObserver((entries) => {
							entries.forEach(entry => {
								if (entry.isIntersecting) {
									entry.target.classList.add('animate-fade-in-up');
									observer.unobserve(entry.target); // 播一次，不再监听
								}
							});
						}, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });

						function isInitiallyVisible(el) {
							const rect = el.getBoundingClientRect();
							const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
							return rect.top < viewportHeight && rect.bottom > 0;
						}

						function scan() {
							document.querySelectorAll('[data-animate]').forEach(el => {
								if (observedElements.has(el) || isInitiallyVisible(el)) return;
								observedElements.add(el);
								observer.observe(el);
							});
						}

						document.addEventListener('astro:page-load', scan);
						document.addEventListener('DOMContentLoaded', scan);
						window.__scrollFadeAnimator = { scan };
						scan();
						})();

						// ============================================================
						// 文章详情页"智能返回"来源记录
						// 点击文章卡片时，按当前所在页写入 sessionStorage.blogBackTarget：
						// 首页 → home（详情页显示"返回首页"），归档页 → archive（显示"返回归档"）
						// document 级委托，ClientRouter SPA 导航后依然有效
						(function () {
						document.addEventListener('click', function (e) {
						var a = e.target && e.target.closest ? e.target.closest('a[href^="/blog/"]') : null;
						if (!a) return;
						var path = window.location.pathname.replace(/\/+$/, '') || '/';
						var target = '';
						if (path === '/') target = 'home';
						else if (path === '/archive') target = 'archive';
						try {
							if (target) sessionStorage.setItem('blogBackTarget', target);
							else sessionStorage.removeItem('blogBackTarget');
						} catch (err) {}
						}, true);
						})();
