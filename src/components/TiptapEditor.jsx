/*
 * 后台富文本编辑器
 * ------------------------------------------------------------------
 * 长文写作体验的三个支点：
 *   1. 粘性工具栏：滚到文末也在手边（吸附在后台 header 下方，用 --admin-header-h）
 *   2. 选区气泡条：选中即浮出，改格式不用把视线/手挪回顶部
 *   3. 状态栏 + 长文辅助：字数/阅读时长/自动草稿/大纲/专注/预览
 *
 * 存储格式不变：仍然输出 HTML，前台 set:html 直接消费；装饰层（当前段落高亮）
 * 是纯视图装饰，不会写进保存的 HTML。
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useEditor, useEditorState, EditorContent, Extension, Mark, mergeAttributes } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import CodeBlock from '@tiptap/extension-code-block';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Plugin, PluginKey, NodeSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// ══════════════════════════════════════════════════════════════════
// 自定义扩展
// ══════════════════════════════════════════════════════════════════

// 首行缩进
const TextIndent = Extension.create({
  name: 'textIndent',
  addCommands() {
    return {
      increaseIndent: () => ({ chain }) =>
        chain().focus().updateAttributes('paragraph', { textIndent: '2em' }).run(),
      decreaseIndent: () => ({ chain }) =>
        chain().focus().updateAttributes('paragraph', { textIndent: null }).run(),
    };
  },
  addGlobalAttributes() {
    return [{ types: ['paragraph'], attributes: { textIndent: { default: null, parseHTML: el => el.style.textIndent || null, renderHTML: attrs => attrs.textIndent ? { style: `text-indent: ${attrs.textIndent}` } : {} } } }];
  },
});

// TextStyle + 字体/字号
const ExtendedTextStyle = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontFamily: {
        default: null,
        parseHTML: element => element.style.fontFamily?.replace(/['"]/g, '') || null,
        renderHTML: attrs => attrs.fontFamily ? { style: `font-family: ${attrs.fontFamily}` } : {},
      },
      fontSize: {
        default: null,
        parseHTML: element => element.style.fontSize || null,
        renderHTML: attrs => attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
      },
    };
  },
});

// 上下标：自写 mark，避免再引两个包（前台 <sup>/<sub> 原生渲染）
const makeScriptMark = (name, tag) => Mark.create({
  name,
  parseHTML() { return [{ tag }]; },
  renderHTML({ HTMLAttributes }) { return [tag, mergeAttributes(HTMLAttributes), 0]; },
  addCommands() {
    const cmd = `toggle${name.charAt(0).toUpperCase()}${name.slice(1)}`;
    return { [cmd]: () => ({ commands }) => commands.toggleMark(name) };
  },
});
const Superscript = makeScriptMark('superscript', 'sup');
const Subscript = makeScriptMark('subscript', 'sub');

// 当前段落轻微高亮（纯装饰，不进 HTML）
const FocusParagraph = Extension.create({
  name: 'focusParagraph',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey('focusParagraph'),
      props: {
        decorations(state) {
          const { $from } = state.selection;
          if ($from.depth < 1) return DecorationSet.empty;
          let start, end;
          try { start = $from.before(1); end = $from.after(1); } catch { return DecorationSet.empty; }
          if (start >= end) return DecorationSet.empty;
          return DecorationSet.create(state.doc, [Decoration.node(start, end, { class: 'ce-focus-para' })]);
        },
      },
    })];
  },
});

// 可调宽/对齐的图片：属性写进 style，前台无需任何额外 CSS 也能还原
const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: el => el.style?.width || el.getAttribute('width') || null,
        renderHTML: () => ({}),
      },
      align: {
        default: null,
        parseHTML: el => {
          const ml = el.style?.marginLeft;
          const mr = el.style?.marginRight;
          if (ml === 'auto' && mr === 'auto') return 'center';
          if (ml === 'auto' && (mr === '0' || mr === '0px')) return 'right';
          if ((ml === '0' || ml === '0px') && mr === 'auto') return 'left';
          return null;
        },
        renderHTML: () => ({}),
      },
    };
  },
  renderHTML({ node, HTMLAttributes }) {
    const { width, align } = node.attrs;
    const style = [];
    if (width) style.push(`width:${width}`);
    if (align === 'center') style.push('display:block', 'margin-left:auto', 'margin-right:auto');
    if (align === 'right') style.push('display:block', 'margin-left:auto', 'margin-right:0');
    if (align === 'left') style.push('display:block', 'margin-left:0', 'margin-right:auto');
    const attrs = mergeAttributes(this.options.HTMLAttributes, HTMLAttributes);
    if (style.length) attrs.style = style.join(';');
    return ['img', attrs];
  },
});

// ══════════════════════════════════════════════════════════════════
// 图标
// ══════════════════════════════════════════════════════════════════
const ICONS = {
  undo: <><path d="M3 10h10a5 5 0 015 5v0a5 5 0 01-5 5H8" /><path d="M3 10l4-4M3 10l4 4" /></>,
  redo: <><path d="M21 10H11a5 5 0 00-5 5v0a5 5 0 005 5h5" /><path d="M21 10l-4-4M21 10l-4 4" /></>,
  alignLeft: <><path d="M3 6h18M3 12h12M3 18h16" /></>,
  alignCenter: <><path d="M3 6h18M6 12h12M4 18h16" /></>,
  alignRight: <><path d="M3 6h18M9 12h12M5 18h16" /></>,
  alignJustify: <><path d="M3 6h18M3 12h18M3 18h18" /></>,
  indent: <><path d="M3 8h6l4 4-4 4H3V8zm9 0h9M12 16h9" /></>,
  outdent: <><path d="M9 8H3l4 4-4 4h6V8zm3 0h9M12 16h9" /></>,
  ul: <><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></>,
  ol: <><path d="M10 6h11M10 12h11M10 18h11M4 6l2 2M4 12l2 2M4 18l2 2" /></>,
  link: <><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></>,
  table: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></>,
  codeBlock: <><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></>,
  code: <><path d="M9 8l-4 4 4 4M15 8l4 4-4 4" /></>,
  hr: <><path d="M3 12h18" /><path d="M6 7h12M6 17h12" /></>,
  sup: <><path d="M4 18l6-12M10 18L4 6" /><path d="M16 6h3v6" /></>,
  sub: <><path d="M4 6l6 12M10 6L4 18" /><path d="M16 18h3v-6" /></>,
  eraser: <><path d="M4 20h16" /><path d="M8.5 16.5l7-7a2.12 2.12 0 013 3l-4 4H8.5z" /></>,
  more: <><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>,
  outline: <><path d="M4 6h16M4 12h10M4 18h6" /><path d="M18 13v7M15 16.5h6" /></>,
  zen: <><path d="M8 3H5a2 2 0 00-2 2v3M16 3h3a2 2 0 012 2v3M8 21H5a2 2 0 01-2-2v-3M16 21h3a2 2 0 002-2v-3" /></>,
  preview: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>,
  imageLeft: <><rect x="3" y="4" width="18" height="16" rx="2" /><rect x="6" y="7" width="6" height="6" /><path d="M15 8h3M15 11h3M6 17h12" /></>,
  imageCenter: <><rect x="3" y="4" width="18" height="16" rx="2" /><rect x="9" y="7" width="6" height="6" /><path d="M7 17h10" /></>,
  imageRight: <><rect x="3" y="4" width="18" height="16" rx="2" /><rect x="12" y="7" width="6" height="6" /><path d="M6 8h3M6 11h3M6 17h12" /></>,
  trash: <><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></>,
  quote: <path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z" />,
  swatch: <circle cx="12" cy="12" r="7" />,
  replace: <><path d="M4 8h11M11 4l4 4-4 4" /><path d="M20 16H9M13 12l-4 4 4 4" /></>,
};
function Ico({ name, filled = false, className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]}
    </svg>
  );
}

// ══════════════════════════════════════════════════════════════════
// 基础控件
// ══════════════════════════════════════════════════════════════════
function TBtn({ onClick, active, disabled, title, children }) {
  return (
    <button type="button" onMouseDown={e => { e.preventDefault(); if (!disabled) onClick(); }}
      disabled={disabled} title={title} aria-label={title}
      className={`p-1.5 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer border-none shrink-0 ${
        active ? 'bg-[#8B7CB3] text-white shadow-sm' : 'bg-transparent text-ink-2 dark:text-ink-muted hover:bg-[#8B7CB3]/12 hover:text-accent'
      } ${disabled ? 'opacity-35 cursor-not-allowed' : 'active:scale-90'}`}>
      {children}
    </button>
  );
}
function TDiv() { return <div className="w-px h-5 bg-[#E0E0E0] dark:bg-[#333] mx-0.5 shrink-0" />; }

function Dropdown({ label, value, options, onChange, className = '', title }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [open]);
  const current = options.find(o => o.value === value);
  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" title={title} onPointerDown={e => { e.stopPropagation(); setOpen(o => !o); }}
        className={`px-2 py-1 rounded-lg text-xs bg-transparent border border-[#E0E0E0] dark:border-[#333] text-ink-2 dark:text-ink-muted cursor-pointer hover:bg-[#8B7CB3]/10 whitespace-nowrap ${open ? 'ring-2 ring-[#8B7CB3]/25 border-[#8B7CB3]' : ''} ${className}`}>
        {current?.label || label}
        <svg className="w-2.5 h-2.5 inline ml-1 -mt-0.5 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-[#1A1A1A] border border-[#E0E0E0] dark:border-[#333] rounded-lg shadow-lg min-w-[120px] max-h-[260px] overflow-y-auto py-1">
          {options.map(o => (
            <button key={o.value} type="button" onPointerDown={() => { onChange(o.value); setOpen(false); }}
              className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-[#8B7CB3]/10 cursor-pointer border-none bg-transparent ${o.value === value ? 'text-accent font-bold' : 'text-ink-2 dark:text-ink-muted'}`}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// 「更多」菜单：低频但需要存在的命令
function MoreMenu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [open]);
  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" title="更多格式" onPointerDown={e => { e.stopPropagation(); setOpen(o => !o); }}
        className="p-1.5 rounded-lg text-ink-2 dark:text-ink-muted hover:bg-[#8B7CB3]/12 hover:text-accent cursor-pointer border-none bg-transparent shrink-0">
        <Ico name="more" />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 z-50 bg-white dark:bg-[#1A1A1A] border border-[#E0E0E0] dark:border-[#333] rounded-xl shadow-xl min-w-[168px] py-1">
          {items.map((it, i) => it.divider
            ? <div key={`d${i}`} className="h-px bg-[#EAEAEA] dark:bg-[#2A2A2A] my-1" />
            : (
              <button key={it.label} type="button" onPointerDown={() => { it.onClick(); setOpen(false); }}
                className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs hover:bg-[#8B7CB3]/10 cursor-pointer border-none bg-transparent text-ink-2 dark:text-ink-muted">
                {it.icon ? <Ico name={it.icon} className="w-3.5 h-3.5" /> : <span className="w-3.5" />}
                <span className="flex-1 whitespace-nowrap">{it.label}</span>
                {it.hint && <span className="text-[10px] text-[#BBB] dark:text-[#666] font-mono">{it.hint}</span>}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// 选项
// ══════════════════════════════════════════════════════════════════
const HEADING_OPTIONS = [
  { label: '正文', value: 'paragraph' },
  { label: '标题 2', value: '2' },
  { label: '标题 3', value: '3' },
];
const FONT_FAMILIES = [
  { label: '默认', value: '' },
  { label: '宋体', value: 'SimSun, STSong, serif' },
  { label: '微软雅黑', value: 'Microsoft YaHei, PingFang SC, sans-serif' },
  { label: 'MiSans', value: 'MiSans, PingFang SC, Microsoft YaHei, sans-serif' },
  { label: 'Inter', value: 'Inter, sans-serif' },
  { label: '等宽', value: 'SF Mono, Fira Code, monospace' },
];
const FONT_SIZES = [
  { label: '12px', value: '12px' }, { label: '14px', value: '14px' }, { label: '16px', value: '16px' },
  { label: '18px', value: '18px' }, { label: '20px', value: '20px' }, { label: '24px', value: '24px' },
  { label: '28px', value: '28px' },
];
const TEXT_COLORS = ['#1A1A1A', '#8B7CB3', '#FF6B9D', '#E5484D'];
const HL_COLORS = ['#fef08a', '#ffd6e7', '#d9d0f0', '#c7f0dd', 'transparent'];
const PROSE_PREVIEW = 'prose prose-lg dark:prose-invert max-w-none prose-headings:text-ink dark:prose-headings:text-[#EAEAEA] prose-headings:font-bold prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4 prose-p:text-[#444] dark:prose-p:text-[#AAA] prose-p:leading-[1.85] prose-p:mb-5 prose-p:text-[16px] prose-strong:text-ink dark:prose-strong:text-[#EAEAEA] prose-a:text-accent dark:prose-a:text-[#B39DDB] prose-li:text-[#444] dark:prose-li:text-[#AAA] prose-code:text-accent prose-code:bg-[#8B7CB3]/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-blockquote:border-l-[#8B7CB3] prose-blockquote:bg-[#8B7CB3]/5 prose-blockquote:not-italic prose-img:rounded-2xl prose-img:shadow-md prose-hr:border-[#E8E8E8] dark:prose-hr:border-[#2A2A2A]';

const fmtAt = ts => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const agoText = ts => {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.round(h / 24)} 天前`;
};

// ══════════════════════════════════════════════════════════════════
// 主组件
// ══════════════════════════════════════════════════════════════════
const TiptapEditor = forwardRef(function TiptapEditor({ placeholder = '开始写作...' }, ref) {
  const rootRef = useRef(null);
  const editorContainerRef = useRef(null);
  const colorInputRef = useRef(null);
  const hlColorInputRef = useRef(null);
  const editorRef = useRef(null);

  const [zen, setZen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [hint, setHint] = useState('');
  const [uploading, setUploading] = useState(0);
  const [draftCtx, setDraftCtx] = useState(null);
  const [draft, setDraft] = useState(null);          // 待恢复的本地草稿 {html, at}
  const [savedAt, setSavedAt] = useState(0);
  const draftCtxRef = useRef(null);

  const flash = useCallback(msg => {
    setHint(msg);
    setTimeout(() => setHint(''), 2600);
  }, []);

  // ── 图片上传（粘贴 / 拖拽 / 按钮 / 替换共用）──
  const uploadAndInsert = useCallback(async (file, at = null) => {
    const e = editorRef.current;
    if (!e) return null;
    setUploading(n => n + 1);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      if (res.status === 401) { window.location.href = '/admin/login'; return null; }
      const r = await res.json().catch(() => ({}));
      if (r.url) {
        const node = { type: 'image', attrs: { src: r.url } };
        if (at != null) e.chain().focus().insertContentAt(at, node).run();
        else e.chain().focus().insertContent(node).run();
        return r.url;
      }
      flash(r.error || '图片上传失败');
    } catch {
      flash('图片上传失败：网络错误');
    } finally {
      setUploading(n => Math.max(0, n - 1));
    }
    return null;
  }, [flash]);

  const editor = useEditor({
    extensions: [
      // StarterKit v3 已内置 link / underline，配置直接透传，避免重复注册
      StarterKit.configure({
        codeBlock: false,
        link: { openOnClick: false, HTMLAttributes: { class: 'text-accent underline' } },
      }),
      Highlight.configure({ multicolor: true }),
      ResizableImage.configure({ inline: false, allowBase64: true }),
      Placeholder.configure({ placeholder }),
      TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
      ExtendedTextStyle,
      Color,
      Table.configure({ resizable: true }), TableRow, TableCell, TableHeader,
      CodeBlock, TextIndent, Superscript, Subscript, FocusParagraph,
      TaskList, TaskItem.configure({ nested: true }),
    ],
    content: '',
    editorProps: {
      attributes: { class: 'prose prose-sm max-w-none min-h-[400px] px-4 py-3 outline-none focus:outline-none' },
      // 点图片 → 节点选区，气泡条随即浮出图片工具
      handleClickOn(view, pos, node) {
        if (node.type.name === 'image') {
          view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
          return true;
        }
        return false;
      },
      // 粘贴截图直接上传
      handlePaste(view, event) {
        const files = [...(event.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
        if (!files.length) return false;
        event.preventDefault();
        files.forEach(f => uploadAndInsert(f));
        return true;
      },
      // 拖入图片直接上传
      handleDrop(view, event) {
        const files = [...(event.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/'));
        if (!files.length) return false;
        event.preventDefault();
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        files.forEach(f => uploadAndInsert(f, at));
        return true;
      },
    },
  });
  editorRef.current = editor;

  // ── 对外句柄 ──
  useImperativeHandle(ref, () => ({
    getContent: () => editor?.getHTML() || '',
    setContent: html => { if (editor && html !== undefined) editor.commands.setContent(html); },
    getText: () => editor?.getText() || '',
    focus: () => editor?.commands.focus('end'),
  }), [editor]);

  // ── 命名槽注册（同页面多实例：post / work）──
  useEffect(() => {
    if (!editor) return;
    const keyEl = editorContainerRef.current?.closest('[data-tiptap-key]');
    const key = keyEl?.getAttribute('data-tiptap-key') || null;
    const store = (window._tiptapEditors ||= {});
    const slot = {
      getContent: () => editor.getHTML() || '',
      setContent: html => { if (html !== undefined) editor.commands.setContent(html || ''); },
      focus: () => editor.commands.focus('end'),
    };
    if (key) store[key] = slot;
    store.default = slot;
    window._tiptapGetContent = store.default.getContent;
    window._tiptapSetContent = store.default.setContent;

    return () => {
      if (key && store[key] === slot) delete store[key];
    };
  }, [editor]);

  // ── 插入图片按钮 ──
  const pickImage = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/avif,gif';
    input.multiple = true;
    input.onchange = () => [...(input.files || [])].forEach(f => uploadAndInsert(f));
    input.click();
  }, [uploadAndInsert]);

  // ── 链接 ──
  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href || '';
    if (editor.state.selection.empty && !prev) { flash('先选中要加链接的文字'); return; }
    const url = window.prompt('链接 URL（留空 = 取消链接）', prev);
    if (url === null) return;
    if (url === '') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return; }
    const href = /^(https?:|mailto:|tel:|\/|#)/i.test(url) ? url : `https://${url}`;
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
  }, [editor, flash]);

  // ── 键盘：Ctrl+S 存草稿 / Esc 退出专注 ──
  useEffect(() => {
    const onKey = ev => {
      if (ev.key === 'Escape' && zen) { setZen(false); document.body.classList.remove('ce-zen'); }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
        if (!rootRef.current?.contains(ev.target)) return;
        ev.preventDefault();
        document.getElementById('save-draft-btn')?.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zen]);

  useEffect(() => () => document.body.classList.remove('ce-zen'), []);

  const toggleZen = () => {
    const next = !zen;
    setZen(next);
    document.body.classList.toggle('ce-zen', next);
  };

  // ── 本地草稿：上下文由后台在 openEditor 时派发（事件 + window 兜底）──
  useEffect(() => {
    const apply = ctx => {
      draftCtxRef.current = ctx;
      setDraftCtx(ctx);
      setSavedAt(0);
      if (!ctx) { setDraft(null); return; }
      try {
        const raw = localStorage.getItem(`bmlb:draft:${ctx.slot}:${ctx.id}`);
        const d = raw ? JSON.parse(raw) : null;
        setDraft(d?.html ? d : null);
      } catch { setDraft(null); }
    };
    if (window.__tiptapDraftCtx) apply(window.__tiptapDraftCtx);
    const onCtx = e => apply(e.detail);
    const onClear = () => {
      const c = draftCtxRef.current;
      if (c) { try { localStorage.removeItem(`bmlb:draft:${c.slot}:${c.id}`); } catch { /* ignore */ } }
      setDraft(null);
      setSavedAt(0);
    };
    window.addEventListener('bmlb:draft-context', onCtx);
    window.addEventListener('bmlb:draft-clear', onClear);
    return () => {
      window.removeEventListener('bmlb:draft-context', onCtx);
      window.removeEventListener('bmlb:draft-clear', onClear);
    };
  }, []);

  // 输入停止 3s 后落本地草稿（key 带文章 id，绝不串文章）
  useEffect(() => {
    if (!editor || !draftCtx) return;
    let t = null;
    const key = `bmlb:draft:${draftCtx.slot}:${draftCtx.id}`;
    const onUpdate = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const html = editor.getHTML();
        if (!html || html === '<p></p>') return;
        try {
          localStorage.setItem(key, JSON.stringify({ html, at: Date.now() }));
          setSavedAt(Date.now());
        } catch { /* 配额满则静默放弃 */ }
      }, 3000);
    };
    editor.on('update', onUpdate);
    return () => { editor.off('update', onUpdate); clearTimeout(t); };
  }, [editor, draftCtx]);

  const restoreDraft = () => {
    if (!editor || !draft) return;
    editor.commands.setContent(draft.html);
    flash('已恢复本地草稿');
    setDraft(null);
  };
  const discardDraft = () => {
    if (draftCtx) { try { localStorage.removeItem(`bmlb:draft:${draftCtx.slot}:${draftCtx.id}`); } catch { /* ignore */ } }
    setDraft(null);
  };

  // ── 响应式状态（hooks 必须在 null 检查之前）──
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return null;
      const text = e.getText();
      const cjk = (text.match(/[\u3400-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/g) || []).length;
      const latin = (text.match(/[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*/g) || []).length;
      const chars = text.replace(/\s+/g, '').length;
      let pars = 0, heads = 0;
      e.state.doc.descendants(n => {
        if (n.type.name === 'paragraph') pars++;
        if (n.type.name === 'heading') heads++;
      });
      const minutes = Math.max(1, Math.ceil(cjk / 300 + latin / 200));
      return {
        bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'), strike: e.isActive('strike'),
        color: e.getAttributes('textStyle').color || '',
        highlight: e.isActive('highlight'),
        heading: e.isActive('heading', { level: 2 }) ? '2' : e.isActive('heading', { level: 3 }) ? '3' : 'paragraph',
        fontFamily: e.getAttributes('textStyle').fontFamily || '',
        fontSize: e.getAttributes('textStyle').fontSize || '',
        align: ['left', 'center', 'right', 'justify'].find(a => e.isActive({ textAlign: a })) || 'left',
        canUndo: e.can().undo(), canRedo: e.can().redo(),
        link: e.isActive('link'), inTable: e.isActive('table'), codeBlock: e.isActive('codeBlock'),
        bullet: e.isActive('bulletList'), ordered: e.isActive('orderedList'), quote: e.isActive('blockquote'),
        image: e.isActive('image'),
        imgWidth: e.getAttributes('image').width || '',
        imgAlign: e.getAttributes('image').align || '',
        words: cjk + latin, chars, pars, heads, minutes,
      };
    },
  });

  const headings = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return [];
      const out = [];
      e.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading') out.push({ level: node.attrs.level, text: node.textContent || '（空标题）', pos });
      });
      return out;
    },
  });

  if (!editor) return null;

  const st = s || {};
  const chain = () => editor.chain().focus();

  // ══ 工具栏（单行，粘在 header 下方）══
  const toolbar = (
    <div className="ce-toolbar flex flex-nowrap items-center gap-0.5 px-2 py-1.5 border-b border-[#E0E0E0] dark:border-[#333] bg-[#FAFAFA] dark:bg-[#1A1A1A] rounded-t-xl overflow-x-auto hide-scrollbar">
      <TBtn onClick={() => chain().undo().run()} disabled={!st.canUndo} title="撤销 (Ctrl+Z)"><Ico name="undo" /></TBtn>
      <TBtn onClick={() => chain().redo().run()} disabled={!st.canRedo} title="重做 (Ctrl+Shift+Z)"><Ico name="redo" /></TBtn>
      <TDiv />
      <Dropdown label="正文" value={st.heading} options={HEADING_OPTIONS} title="段落样式"
        onChange={v => { v === 'paragraph' ? chain().setParagraph().run() : chain().toggleHeading({ level: parseInt(v, 10) }).run(); }} />
      <Dropdown label="字体" value={st.fontFamily} options={FONT_FAMILIES} title="字体" className="max-w-[76px]"
        onChange={v => setTimeout(() => editor.chain().focus().setMark('textStyle', { fontFamily: v || null }).run(), 0)} />
      <Dropdown label="字号" value={st.fontSize} options={FONT_SIZES} title="字号"
        onChange={v => setTimeout(() => editor.chain().focus().setMark('textStyle', { fontSize: v }).run(), 0)} />
      <TDiv />
      <TBtn onClick={() => chain().toggleBold().run()} active={st.bold} title="粗体 (Ctrl+B)"><b>B</b></TBtn>
      <TBtn onClick={() => chain().toggleItalic().run()} active={st.italic} title="斜体 (Ctrl+I)"><i>I</i></TBtn>
      <TBtn onClick={() => chain().toggleUnderline().run()} active={st.underline} title="下划线 (Ctrl+U)"><u>U</u></TBtn>
      <TBtn onClick={() => chain().toggleStrike().run()} active={st.strike} title="删除线"><s>S</s></TBtn>

      <TBtn onClick={() => colorInputRef.current?.click()} active={!!st.color} title="文字颜色">
        <span className="flex items-center gap-1">
          <span className="font-bold leading-none">A</span>
          <span className="w-3 h-3 rounded-full border border-[#CCC] dark:border-[#555]" style={{ backgroundColor: st.color || '#1A1A1A' }} />
        </span>
      </TBtn>
      <input ref={colorInputRef} type="color" className="hidden" value={st.color || '#1A1A1A'}
        onChange={e => chain().setColor(e.target.value).run()} />

      <TBtn onClick={() => hlColorInputRef.current?.click()} active={st.highlight} title="高亮">
        <span className="flex items-center gap-1">
          <Ico name="swatch" filled />
          <span className="w-3 h-3 rounded-full border border-[#CCC] dark:border-[#555]" style={{ backgroundColor: editor.getAttributes('highlight').color || '#fef08a' }} />
        </span>
      </TBtn>
      <input ref={hlColorInputRef} type="color" className="hidden" value={editor.getAttributes('highlight').color || '#fef08a'}
        onChange={e => chain().setHighlight({ color: e.target.value }).run()} />

      <TDiv />
      <TBtn onClick={() => chain().setTextAlign('left').run()} active={st.align === 'left'} title="左对齐"><Ico name="alignLeft" /></TBtn>
      <TBtn onClick={() => chain().setTextAlign('center').run()} active={st.align === 'center'} title="居中"><Ico name="alignCenter" /></TBtn>
      <TBtn onClick={() => chain().setTextAlign('right').run()} active={st.align === 'right'} title="右对齐"><Ico name="alignRight" /></TBtn>
      <TBtn onClick={() => chain().setTextAlign('justify').run()} active={st.align === 'justify'} title="两端对齐"><Ico name="alignJustify" /></TBtn>

      <TDiv />
      <TBtn onClick={() => chain().toggleBulletList().run()} active={st.bullet} title="无序列表"><Ico name="ul" /></TBtn>
      <TBtn onClick={() => chain().toggleOrderedList().run()} active={st.ordered} title="有序列表"><Ico name="ol" /></TBtn>
      <TBtn onClick={() => chain().toggleBlockquote().run()} active={st.quote} title="引用"><Ico name="quote" filled /></TBtn>

      <TDiv />
      <TBtn onClick={setLink} active={st.link} title={st.link ? '编辑链接' : '插入链接'}><Ico name="link" /></TBtn>
      <TBtn onClick={pickImage} title="插入图片（也可直接粘贴截图）"><Ico name="image" /></TBtn>
      <TBtn onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="插入表格"><Ico name="table" /></TBtn>
      <TBtn onClick={() => chain().toggleCodeBlock().run()} active={st.codeBlock} title="代码块"><Ico name="codeBlock" /></TBtn>

      {st.inTable && (
        <>
          <TDiv />
          <TBtn onClick={() => chain().addRowBefore().run()} title="上方插入行"><span className="text-[10px] font-bold">↑行</span></TBtn>
          <TBtn onClick={() => chain().addRowAfter().run()} title="下方插入行"><span className="text-[10px] font-bold">↓行</span></TBtn>
          <TBtn onClick={() => chain().addColumnBefore().run()} title="左侧插入列"><span className="text-[10px] font-bold">←列</span></TBtn>
          <TBtn onClick={() => chain().addColumnAfter().run()} title="右侧插入列"><span className="text-[10px] font-bold">→列</span></TBtn>
          <TBtn onClick={() => chain().mergeCells().run()} disabled={!editor.can().mergeCells()} title="合并单元格"><span className="text-[10px] font-bold">合并</span></TBtn>
          <TBtn onClick={() => chain().splitCell().run()} disabled={!editor.can().splitCell()} title="拆分单元格"><span className="text-[10px] font-bold">拆分</span></TBtn>
          <TBtn onClick={() => chain().deleteRow().run()} title="删除当前行"><span className="text-[10px] font-bold">删行</span></TBtn>
          <TBtn onClick={() => chain().deleteColumn().run()} title="删除当前列"><span className="text-[10px] font-bold">删列</span></TBtn>
          <TBtn onClick={() => chain().deleteTable().run()} title="删除整表"><Ico name="trash" className="w-3.5 h-3.5" /></TBtn>
        </>
      )}

      <div className="ml-auto pl-1 shrink-0">
        <MoreMenu items={[
          { label: '首行缩进', icon: 'indent', onClick: () => chain().increaseIndent().run() },
          { label: '取消缩进', icon: 'outdent', onClick: () => chain().decreaseIndent().run() },
          { divider: true },
          { label: '分隔线', icon: 'hr', onClick: () => chain().setHorizontalRule().run() },
          { label: '行内代码', icon: 'code', onClick: () => chain().toggleCode().run() },
          { label: '任务列表', icon: 'ul', onClick: () => chain().toggleTaskList().run() },
          { label: '上标', icon: 'sup', onClick: () => chain().toggleSuperscript().run() },
          { label: '下标', icon: 'sub', onClick: () => chain().toggleSubscript().run() },
          { divider: true },
          { label: '清除格式', icon: 'eraser', onClick: () => chain().unsetAllMarks().clearNodes().run() },
        ]} />
      </div>
    </div>
  );

  // ══ 气泡条（选中即浮出；选中图片时切换成图片工具）══
  const bubble = (
    <BubbleMenu
      editor={editor}
      updateDelay={80}
      options={{ placement: 'top', offset: 8 }}
      shouldShow={({ editor: e, state: ss }) => {
        if (!e.isEditable) return false;
        if (e.isActive('codeBlock')) return false;
        return !ss.selection.empty;
      }}
    >
      <div className="flex items-center gap-0.5 p-1 rounded-xl bg-white/95 dark:bg-[#1F1F1F]/95 backdrop-blur-md border border-[#E0E0E0] dark:border-[#3A3A3A] shadow-xl">
        {st.image ? (
          <>
            <span className="px-1 text-[10px] text-[#999]">宽</span>
            {['100%', '75%', '50%', '25%'].map(v => (
              <button key={v} type="button" onMouseDown={e => { e.preventDefault(); chain().updateAttributes('image', { width: v }).run(); }}
                className={`px-2 py-1 rounded-md text-[11px] font-bold border-none cursor-pointer ${st.imgWidth === v ? 'bg-[#8B7CB3] text-white' : 'bg-transparent text-ink-2 dark:text-ink-muted hover:bg-[#8B7CB3]/12'}`}>
                {v.replace('%', '')}
              </button>
            ))}
            <TDiv />
            <TBtn onClick={() => chain().updateAttributes('image', { align: st.imgAlign === 'left' ? null : 'left' }).run()} active={st.imgAlign === 'left'} title="左对齐"><Ico name="imageLeft" /></TBtn>
            <TBtn onClick={() => chain().updateAttributes('image', { align: st.imgAlign === 'center' ? null : 'center' }).run()} active={st.imgAlign === 'center'} title="居中"><Ico name="imageCenter" /></TBtn>
            <TBtn onClick={() => chain().updateAttributes('image', { align: st.imgAlign === 'right' ? null : 'right' }).run()} active={st.imgAlign === 'right'} title="右对齐"><Ico name="imageRight" /></TBtn>
            <TDiv />
            <TBtn title="替换图片" onClick={() => {
              const input = document.createElement('input');
              input.type = 'file'; input.accept = 'image/*';
              input.onchange = async () => {
                const f = input.files?.[0];
                if (!f) return;
                const url = await uploadAndInsert(f, null);
                if (url) chain().updateAttributes('image', { src: url }).run();
              };
              input.click();
            }}><Ico name="replace" /></TBtn>
            <TBtn title="删除图片" onClick={() => chain().deleteSelection().run()}><Ico name="trash" /></TBtn>
          </>
        ) : (
          <>
            <TBtn onClick={() => chain().toggleHeading({ level: 2 }).run()} active={st.heading === '2'} title="标题 2"><span className="text-[10px] font-bold px-0.5">H2</span></TBtn>
            <TBtn onClick={() => chain().toggleHeading({ level: 3 }).run()} active={st.heading === '3'} title="标题 3"><span className="text-[10px] font-bold px-0.5">H3</span></TBtn>
            <TDiv />
            <TBtn onClick={() => chain().toggleBold().run()} active={st.bold} title="粗体"><b>B</b></TBtn>
            <TBtn onClick={() => chain().toggleItalic().run()} active={st.italic} title="斜体"><i>I</i></TBtn>
            <TBtn onClick={() => chain().toggleUnderline().run()} active={st.underline} title="下划线"><u>U</u></TBtn>
            <TBtn onClick={() => chain().toggleStrike().run()} active={st.strike} title="删除线"><s>S</s></TBtn>
            <TDiv />
            {HL_COLORS.map(c => (
              <button key={c} type="button" title={c === 'transparent' ? '清除高亮' : `高亮 ${c}`}
                onMouseDown={e => {
                  e.preventDefault();
                  c === 'transparent' ? chain().unsetHighlight().run() : chain().toggleHighlight({ color: c }).run();
                }}
                className="w-4 h-4 rounded-full border border-[#DDD] dark:border-[#555] cursor-pointer shrink-0 flex items-center justify-center text-[8px] text-[#999]"
                style={{ backgroundColor: c === 'transparent' ? 'transparent' : c }}>
                {c === 'transparent' ? '✕' : ''}
              </button>
            ))}
            <TDiv />
            {TEXT_COLORS.map(c => (
              <button key={c} type="button" title={`文字色 ${c}`}
                onMouseDown={e => { e.preventDefault(); chain().setColor(c).run(); }}
                className="w-4 h-4 rounded-full border border-[#DDD] dark:border-[#555] cursor-pointer shrink-0" style={{ backgroundColor: c }} />
            ))}
            <TDiv />
            <TBtn onClick={setLink} active={st.link} title="链接"><Ico name="link" /></TBtn>
            <TBtn onClick={() => chain().unsetAllMarks().clearNodes().run()} title="清除格式"><Ico name="eraser" /></TBtn>
          </>
        )}
      </div>
    </BubbleMenu>
  );

  // ══ 状态栏 ══
  const statusBar = (
    <div className="flex items-center gap-2 px-3 py-1.5 border-t border-[#EAEAEA] dark:border-[#2A2A2A] bg-[#FAFAFA] dark:bg-[#1A1A1A] rounded-b-xl text-[11px] text-[#999] flex-wrap">
      <span className="whitespace-nowrap">{st.words || 0} 字</span>
      <span className="text-[#CCC] dark:text-[#444]">·</span>
      <span className="whitespace-nowrap">字符 {st.chars || 0}</span>
      <span className="text-[#CCC] dark:text-[#444]">·</span>
      <span className="whitespace-nowrap">{st.pars || 0} 段</span>
      <span className="text-[#CCC] dark:text-[#444]">·</span>
      <span className="whitespace-nowrap">约 {st.minutes || 1} 分钟</span>

      {uploading > 0 && <span className="text-accent font-bold whitespace-nowrap animate-pulse">· 图片上传中 {uploading}</span>}
      {savedAt > 0 && <span className="whitespace-nowrap">· 本地草稿 {fmtAt(savedAt)}</span>}
      {hint && <span className="text-accent font-medium">{hint}</span>}

      <div className="ml-auto flex items-center gap-0.5">
        <TBtn title="大纲（按标题跳转）" onClick={() => setOutlineOpen(o => !o)} active={outlineOpen} disabled={!st.heads || preview}>
          <span className="flex items-center gap-1"><Ico name="outline" /><span className="hidden sm:inline text-[11px]">{st.heads || 0}</span></span>
        </TBtn>
        <TBtn title={zen ? '退出专注模式 (Esc)' : '专注模式'} onClick={toggleZen} active={zen}><Ico name="zen" /></TBtn>
        <TBtn title={preview ? '回到编辑' : '预览（与前台同款样式）'} active={preview}
          onClick={() => { if (!preview) setPreviewHtml(editor.getHTML()); setPreview(p => !p); }}>
          <Ico name="preview" />
        </TBtn>
      </div>
    </div>
  );

  // ══ 大纲面板 ══
  const outlinePanel = outlineOpen && (
    <div className="absolute right-3 top-14 z-40 w-64 max-h-[55vh] overflow-y-auto rounded-xl bg-white/95 dark:bg-[#1F1F1F]/95 backdrop-blur-md border border-[#E0E0E0] dark:border-[#333] shadow-xl p-2">
      <div className="flex items-center justify-between px-1 pb-1.5">
        <span className="text-[11px] font-bold text-[#999] tracking-wide">大纲</span>
        <button type="button" onClick={() => setOutlineOpen(false)} className="text-[#999] hover:text-accent border-none bg-transparent cursor-pointer text-xs">✕</button>
      </div>
      {headings.length === 0 && <p className="px-2 py-1 text-[11px] text-[#999]">还没有标题（用 H2/H3 分段后这里会自动出现）</p>}
      {headings.map((h, i) => (
        <button key={`${h.pos}-${i}`} type="button"
          onClick={() => {
            const dom = editor.view.nodeDOM(h.pos);
            dom?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
            editor.chain().focus().setTextSelection(h.pos + 1).run();
            setOutlineOpen(false);
          }}
          className={`block w-full text-left px-2 py-1 rounded-md text-[12px] border-none bg-transparent cursor-pointer text-ink-2 dark:text-ink-muted hover:bg-[#8B7CB3]/10 hover:text-accent truncate ${h.level === 3 ? 'pl-5 opacity-80' : 'font-semibold'}`}>
          {h.text}
        </button>
      ))}
    </div>
  );

  return (
    <div ref={rootRef} className="ce-root relative border border-[#E0E0E0] dark:border-[#333] rounded-xl bg-white dark:bg-[#252525]">
      {draft && draft.html !== editor.getHTML() && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-t-xl bg-[#8B7CB3]/10 border-b border-[#8B7CB3]/20 text-[11px] text-[#6B5C93] dark:text-[#C9BAE5]">
          <span className="font-bold whitespace-nowrap">发现本地草稿（{agoText(draft.at)}）</span>
          <button type="button" onClick={restoreDraft} className="px-2 py-0.5 rounded-full bg-[#8B7CB3] text-white font-bold border-none cursor-pointer shrink-0">恢复</button>
          <button type="button" onClick={discardDraft} className="px-2 py-0.5 rounded-full border border-[#8B7CB3]/40 text-[#8B7CB3] bg-transparent cursor-pointer shrink-0">丢弃</button>
          <button type="button" onClick={() => setDraft(null)} className="ml-auto text-[#999] bg-transparent border-none cursor-pointer shrink-0">稍后</button>
        </div>
      )}
      {bubble}
      {!preview && toolbar}
      <div ref={editorContainerRef} className={preview ? 'hidden' : ''}><EditorContent editor={editor} /></div>
      {preview && (
        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">
          <div className={PROSE_PREVIEW} dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </div>
      )}
      {statusBar}
      {!preview && outlinePanel}

      <style>{`
        .ce-toolbar{position:sticky;top:var(--admin-header-h,104px);z-index:30}
        body.ce-zen{--admin-header-h:0px}
        body.ce-zen #admin-header{display:none!important}
        body.ce-zen main{padding-top:0!important}

        .tiptap{min-height:400px;color:#1A1A1A}.dark .tiptap{color:#EAEAEA}
        .tiptap:focus{outline:none}
        .tiptap p.is-editor-empty:first-child::before{color:#999;content:attr(data-placeholder);float:left;height:0;pointer-events:none}
        .tiptap h2{font-size:1.25rem;font-weight:700;margin:1rem 0 .5rem}.tiptap h3{font-size:1.125rem;font-weight:600;margin:.75rem 0 .5rem}
        .tiptap p{margin:.25rem 0;line-height:1.75}
        .tiptap ul,.tiptap ol{padding-left:1.5rem;margin:.5rem 0}.tiptap ul{list-style-type:disc}.tiptap ol{list-style-type:decimal}
        .tiptap li{margin:.125rem 0;line-height:1.6}
        .tiptap blockquote{border-left:3px solid #8B7CB3;padding-left:1rem;margin:.75rem 0;color:#666;font-style:italic}.dark .tiptap blockquote{color:#999}
        .tiptap img{max-width:100%;height:auto;border-radius:.75rem;margin:.75rem 0}
        .tiptap img.ProseMirror-selectednode{outline:2px solid #8B7CB3;outline-offset:2px}
        .tiptap a{color:#8B7CB3;text-decoration:underline}
        .tiptap pre{background:#1a1a1a;color:#eaeaea;padding:1rem;border-radius:.75rem;overflow-x:auto;margin:.75rem 0;font-size:.875rem;font-family:'SF Mono','Fira Code',monospace}
        .tiptap code{background:#f0f0f0;padding:.125rem .375rem;border-radius:.25rem;font-size:.875em;font-family:'SF Mono','Fira Code',monospace;color:#8B7CB3}
        .dark .tiptap code{background:#2A2A2A;color:#C9BAE5}
        .tiptap pre code{background:none;padding:0;border-radius:0;color:inherit}
        .tiptap table{border-collapse:collapse;margin:.75rem 0;width:100%}
        .tiptap table td,.tiptap table th{border:1px solid #e0e0e0;padding:.5rem .75rem;position:relative;min-width:80px}
        .dark .tiptap table td,.dark .tiptap table th{border-color:#333}
        .tiptap table th{background:#f5f5f5;font-weight:600}.dark .tiptap table th{background:#252525}
        .tiptap mark{border-radius:.125rem;padding:0 .125rem}
        .tiptap hr{border:none;border-top:1px solid #e0e0e0;margin:1.5rem 0}.dark .tiptap hr{border-color:#333}
        /* 任务列表（前台同款规则同时写在 blog/work 页） */
        .tiptap ul[data-type="taskList"],.prose ul[data-type="taskList"]{list-style:none;padding-left:.25rem}
        .tiptap ul[data-type="taskList"] li,.prose ul[data-type="taskList"] li{display:flex;align-items:flex-start;gap:.5rem}
        .tiptap ul[data-type="taskList"] li>label,.prose ul[data-type="taskList"] li>label{margin-top:.28em;flex-shrink:0}
        .tiptap ul[data-type="taskList"] input[type=checkbox],.prose ul[data-type="taskList"] input[type=checkbox]{width:1rem;height:1rem;accent-color:#8B7CB3;cursor:pointer;margin:0}
        .tiptap ul[data-type="taskList"] li>div,.prose ul[data-type="taskList"] li>div{flex:1;min-width:0}
        .prose ul[data-type="taskList"] li::before{content:none!important}
        .tiptap ul[data-type="taskList"] li[data-checked="true"]>div{opacity:.55;text-decoration:line-through}
        .tiptap .selectedCell::after{background:rgba(139,124,179,.15)}
        .dark .tiptap ::selection{background:rgba(139,124,179,.4)}
        /* 当前段落：淡紫粉底 + 左侧细条（纯装饰，不写入 HTML） */
        .tiptap .ce-focus-para{
          background:linear-gradient(90deg,rgba(139,124,179,.09),rgba(255,107,157,.045) 48%,rgba(255,107,157,0) 92%);
          border-radius:.5rem;box-shadow:inset 2px 0 0 rgba(139,124,179,.55);
          transition:background .18s ease,box-shadow .18s ease;
        }
        .dark .tiptap .ce-focus-para{background:linear-gradient(90deg,rgba(139,124,179,.22),rgba(255,107,157,.08) 50%,transparent 94%)}
        .hide-scrollbar{-ms-overflow-style:none;scrollbar-width:none}
        .hide-scrollbar::-webkit-scrollbar{display:none}
        .ce-toolbar{-webkit-overflow-scrolling:touch}
        .ce-toolbar > *{flex-shrink:0}
      `}</style>
    </div>
  );
});

export default TiptapEditor;
