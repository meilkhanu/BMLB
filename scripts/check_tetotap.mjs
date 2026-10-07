// 在 Node 里跑 tetotap 页面核心逻辑：桩掉 PIXI/GSAP/DOM，验证
// 音节清单、音频解码、280 BPM 格点节律与背景旋律调度
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', 'public', 'lab-apps', 'tetotap');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const js = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));

// ── 桩 ──
const loaded = [];
const played = [];
const stopped = [];
const t0 = 1000;

global.window = global;
global.PIXI = {
  autoDetectRenderer: () => ({ view: {}, resize() {} }),
  Container: class { addChild() {} },
  Graphics: class {
    clear() {} lineStyle() {} beginFill() {} drawCircle() {} moveTo() {}
    lineTo() {} drawRect() {} endFill() {}
  },
};
global.gsap = {
  killTweensOf() {}, to() {}, fromTo() {}, delayedCall() {},
};
global.requestAnimationFrame = () => {};
global.document = {
  createElement: () => ({ style: {}, remove() {} }),
  body: { appendChild() {} },
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
  documentElement: {},
};

class FakeSrc {
  constructor() { this.buffer = null; this.onended = null; }
  connect(n) { return n; }
  start(when) { played.push({ idx: this.idx, at: when - t0 }); }
  stop() { stopped.push(this.idx); if (this.onended) this.onended(); }
}
class FakeCtx {
  constructor() { this.currentTime = 0; }
  createBufferSource() { return new FakeSrc(); }
  createGain() { return { gain: { value: 0 }, connect(n) { return n; } }; }
  decodeAudioData(b) { return Promise.resolve({ fake: true, len: b.byteLength }); }
  get destination() { return {}; }
}
global.AudioContext = FakeCtx;

global.fetch = async (url) => {
  const p = path.join(ROOT, url);
  if (!fs.existsSync(p)) throw new Error('404 ' + url);
  const b = fs.readFileSync(p);
  loaded.push({ name: url.replace('audio/', ''), bytes: b.byteLength });
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  return { arrayBuffer: async () => ab };
};

// probe 必须插在 IIFE 内部（const 声明在函数作用域里）
const probe = [
  ';global.__T = {',
  '  SYLS, STEP, MELODY, BASS, LEAD,',
  '  hit, bgTick, enterMain, playSyl, stopSyl,',
  '  get lastStep(){return lastStep}, set lastStep(v){lastStep=v},',
  '  get lastSyl(){return lastSyl}, set lastSyl(v){lastSyl=v},',
  '  get bgStartStep(){return bgStartStep}, set bgStartStep(v){bgStartStep=v},',
  '  get backtrack(){return backtrack}, set backtrack(v){backtrack=v},',
  '  get started(){return started}, set started(v){started=v},',
  '  set ready(v){ready=v}, get ready(){return ready},',
  '  get ctx(){return ctxAudio},',
  '  set audioT0(v){audioT0=v}, get audioT0(){return audioT0},',
  '  loadAudio,',
  '};',
].join('\n');

const tail = 'boot();\r\n})();';
if (!js.includes(tail)) { console.error('FAIL: 页面脚本结尾不符预期'); process.exit(1); }
const patched = js.replace(tail, 'boot();' + probe + '\r\n})();');
new Function(patched)();

const T = global.__T;
let fail = 0;
const check = (name, ok, extra) => {
  if (!ok) fail++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  → ' + extra : ''));
};

check('音节清单 38 个', T.SYLS.length === 38, '实际 ' + T.SYLS.length);
check('格点 = 214.3ms (280BPM)', Math.abs(T.STEP * 1000 - 214.28) < 0.1,
      (T.STEP * 1000).toFixed(1) + 'ms');
check('背景旋律 4 小节 x 8 格', T.MELODY.length === 4 && T.MELODY[0].length === 8);
const badIdx = T.MELODY.flat().filter(v => v !== -1 && (v < 0 || v >= T.SYLS.length)).length;
check('MELODY 下标全部合法', badIdx === 0);
check('贝斯音节存在', T.BASS.length >= 4, T.BASS.map(i => T.SYLS[i].midi).join(','));
check('音高跨度 >= 8 个半音',
      Math.max(...T.SYLS.map(s => s.midi)) - Math.min(...T.SYLS.map(s => s.midi)) >= 8,
      Math.min(...T.SYLS.map(s => s.midi)) + '~' + Math.max(...T.SYLS.map(s => s.midi)));

await T.loadAudio();
check('38 个音频全部加载', loaded.length === 38, loaded.length + ' 个, ' +
      (loaded.reduce((s, l) => s + l.bytes, 0) / 1024).toFixed(1) + 'KB');
const maxBytes = Math.max(...loaded.map(l => l.bytes));
check('单音节都 < 8KB', maxBytes < 8192, '最大 ' + maxBytes + 'B');

// 1) 点击发声（桩环境下 boot() 的点击回调不会跑，手动置 ready）
T.ready = true; T.started = true;
T.audioT0 = t0; T.ctx.currentTime = t0; T.lastStep = -1;
T.hit(100, 100);
check('点击发声 1 次', played.length === 1, 'played=' + played.length);

// 2) 同一格内重复触发：先 stop 再 play
T.hit(100, 100);
check('同格二次触发先 stop', stopped.length > 0, 'stop 调用 ' + stopped.length + ' 次');

// 3) 背景旋律接管：用户停手满 15 格（约 3.2s）后才开始，
//    所以 1..14 格静默、15..20 格按 MELODY 走
played.length = 0; stopped.length = 0; T.lastStep = -1;
T.bgStartStep = 0;
let bgPlayed = 0;
for (let s = 1; s <= 20; s++) {
  const before = played.length;
  T.ctx.currentTime = t0 + s * T.STEP;
  T.bgTick();
  if (played.length > before) bgPlayed++;
}
// 期望值：15..20 这 6 格里，MELODY 对应 slot 非 -1 的个数
let expectBg = 0;
for (let s = 15; s <= 20; s++) {
  if (T.MELODY[Math.floor(s / 8) % T.MELODY.length][s % 8] >= 0) expectBg++;
}
check('背景旋律按节拍走', bgPlayed === expectBg,
      '20 格发声 ' + bgPlayed + ' 次, 预期 ' + expectBg + '（前 14 格静默等用户）');

// 4) 用户操作期间背景静默
played.length = 0; T.lastStep = -1; T.bgStartStep = 0;
for (let s = 1; s <= 10; s++) {
  T.ctx.currentTime = t0 + s * T.STEP;
  T.bgTick();
  T.bgStartStep = s;
}
check('用户操作时背景静默', played.length === 0, '发声 ' + played.length + ' 次');

// 5) 关闭开关后静默
played.length = 0; T.lastStep = -1; T.backtrack = false; T.bgStartStep = -999;
for (let s = 1; s <= 10; s++) { T.ctx.currentTime = t0 + s * T.STEP; T.bgTick(); }
check('关闭背景旋律后静默', played.length === 0, '发声 ' + played.length + ' 次');

console.log('\n' + (fail === 0 ? '全部通过' : fail + ' 项失败'));
process.exit(fail === 0 ? 0 : 1);
