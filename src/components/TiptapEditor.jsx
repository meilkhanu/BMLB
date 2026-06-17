import React, { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useEditor, EditorContent, Extension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import CodeBlock from '@tiptap/extension-code-block';

// ── 首行缩进自定义扩展 ──
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
    return [
      {
        types: ['paragraph'],
        attributes: {
          textIndent: { default: null, parseHTML: el => el.style.textIndent || null, renderHTML: attrs => attrs.textIndent ? { style: `text-indent: ${attrs.textIndent}` } : {} },
        },
      },
    ];
  },
});

function ToolbarButton({ onClick, active, disabled, children, title }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border-none ${
        active
          ? 'bg-[#8B7CB3] text-white'
          : 'bg-transparent text-[#666] dark:text-[#999] hover:bg-[#8B7CB3]/10 hover:text-[#8B7CB3]'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-[#E0E0E0] dark:bg-[#333] mx-0.5" />;
}

// ── 字号选项 ──
const FONT_SIZES = [
  { label: '12px', value: '12px' },
  { label: '14px', value: '14px' },
  { label: '16px', value: '16px' },
  { label: '18px', value: '18px' },
  { label: '20px', value: '20px' },
  { label: '24px', value: '24px' },
  { label: '28px', value: '28px' },
];

// ── 字体选项 ──
const FONT_FAMILIES = [
  { label: '默认', value: '' },
  { label: '宋体', value: 'SimSun, STSong, serif' },
  { label: '微软雅黑', value: 'Microsoft YaHei, PingFang SC, sans-serif' },
  { label: 'MiSans', value: 'MiSans, PingFang SC, Microsoft YaHei, sans-serif' },
  { label: 'Inter', value: 'Inter, sans-serif' },
  { label: '等宽', value: 'SF Mono, Fira Code, monospace' },
];

const TiptapEditor = forwardRef(function TiptapEditor({ placeholder = '开始写作...' }, ref) {
  const editorContainerRef = useRef(null);
  const colorInputRef = useRef(null);
  const hlColorInputRef = useRef(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Underline,
      Highlight.configure({ multicolor: true }),
      Image.configure({ inline: false, allowBase64: true }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-[#8B7CB3] underline' } }),
      Placeholder.configure({ placeholder }),
      TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
      TextStyle,
      Color,
      Table.configure({ resizable: true }),
      TableRow, TableCell, TableHeader,
      CodeBlock,
      TextIndent,
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[400px] px-4 py-3 outline-none focus:outline-none',
      },
    },
  });

  useImperativeHandle(ref, () => ({
    getContent: () => editor?.getHTML() || '',
    setContent: (html) => {
      if (editor && html !== undefined) editor.commands.setContent(html);
    },
  }), [editor]);

  useEffect(() => {
    if (!editor) return;
    window._tiptapGetContent = () => editor.getHTML() || '';
    window._tiptapSetContent = (html) => {
      if (html !== undefined) editor.commands.setContent(html);
    };
    return () => { delete window._tiptapGetContent; delete window._tiptapSetContent; };
  }, [editor]);

  useEffect(() => {
    if (!editorContainerRef.current) return;
    const container = editorContainerRef.current;
    const observer = new MutationObserver(() => {
      const prosemirror = container.querySelector('.tiptap');
      if (prosemirror) prosemirror.style.minHeight = '400px';
    });
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [editor]);

  // ── Helpers ──
  const addImage = useCallback(() => {
    const url = window.prompt('图片 URL:');
    if (url && editor) editor.chain().focus().setImage({ src: url }).run();
  }, [editor]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href;
    const url = window.prompt('链接 URL:', prev);
    if (url === null) return;
    if (url === '') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return; }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  const handleImageUpload = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp,image/avif';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || !editor) return;
      const fd = new FormData(); fd.append('file', file);
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        if (res.status === 401) { window.location.href = '/admin/login'; return; }
        const r = await res.json();
        if (r.url) editor.chain().focus().setImage({ src: r.url }).run();
        else alert(r.error || '上传失败');
      } catch { alert('网络错误'); }
    };
    input.click();
  }, [editor]);

  const insertTable = useCallback(() => {
    editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }, [editor]);

  // ── 颜色弹窗 ──
  const openColorPicker = useCallback(() => {
    colorInputRef.current?.click();
  }, []);

  const handleColorChange = useCallback((e) => {
    editor?.chain().focus().setColor(e.target.value).run();
  }, [editor]);

  const openHlColorPicker = useCallback(() => {
    hlColorInputRef.current?.click();
  }, []);

  const handleHlColorChange = useCallback((e) => {
    editor?.chain().focus().setHighlight({ color: e.target.value }).run();
  }, [editor]);

  // ── 字号 / 字体 ──
  const getFontSize = () => {
    if (!editor) return '';
    const attrs = editor.getAttributes('textStyle');
    return attrs.fontSize || '';
  };

  const getFontFamily = () => {
    if (!editor) return '';
    const attrs = editor.getAttributes('textStyle');
    return attrs.fontFamily || '';
  };

  if (!editor) return null;

  return (
    <div className="border border-[#E0E0E0] dark:border-[#333] rounded-xl overflow-hidden bg-white dark:bg-[#252525]">
      {/* ═══════ Toolbar ═══════ */}
      <div className="flex flex-wrap items-center gap-0.5 p-2 border-b border-[#E0E0E0] dark:border-[#333] bg-[#FAFAFA] dark:bg-[#1A1A1A]">
        {/* 撤销/重做 */}
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="撤销">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 10h10a5 5 0 015 5v0a5 5 0 01-5 5H8" /><path d="M3 10l4-4M3 10l4 4" /></svg>
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="重做">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10H11a5 5 0 00-5 5v0a5 5 0 005 5h5" /><path d="M21 10l-4-4M21 10l-4 4" /></svg>
        </ToolbarButton>
        <ToolbarDivider />

        {/* 标题 */}
        <select
          onMouseDown={e => e.preventDefault()}
          onChange={e => {
            const v = e.target.value;
            v === 'paragraph' ? editor.chain().focus().setParagraph().run() : editor.chain().focus().toggleHeading({ level: parseInt(v) }).run();
          }}
          value={editor.isActive('heading', { level: 2 }) ? '2' : editor.isActive('heading', { level: 3 }) ? '3' : 'paragraph'}
          className="px-2 py-1 rounded-lg text-xs bg-transparent border border-[#E0E0E0] dark:border-[#333] text-[#666] dark:text-[#999] outline-none cursor-pointer"
        >
          <option value="paragraph">正文</option>
          <option value="2">标题 2</option>
          <option value="3">标题 3</option>
        </select>

        {/* 字体 */}
        <select
          onMouseDown={e => e.preventDefault()}
          onChange={e => { const v = e.target.value; editor.chain().focus().setTextStyle(v ? { fontFamily: v } : { fontFamily: null }).run(); }}
          value={getFontFamily()}
          className="px-2 py-1 rounded-lg text-xs bg-transparent border border-[#E0E0E0] dark:border-[#333] text-[#666] dark:text-[#999] outline-none cursor-pointer max-w-[80px] truncate"
        >
          {FONT_FAMILIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>

        <ToolbarDivider />

        {/* 字号 */}
        <select
          onMouseDown={e => e.preventDefault()}
          onChange={e => editor.chain().focus().setTextStyle({ fontSize: e.target.value }).run()}
          value={getFontSize()}
          className="px-2 py-1 rounded-lg text-xs bg-transparent border border-[#E0E0E0] dark:border-[#333] text-[#666] dark:text-[#999] outline-none cursor-pointer"
        >
          <option value="">字号</option>
          {FONT_SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>

        <ToolbarDivider />

        {/* 文字样式 */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="粗体"><b>B</b></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="斜体"><i>I</i></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="下划线"><u>U</u></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="删除线"><s>S</s></ToolbarButton>

        {/* 文字颜色 */}
        <ToolbarButton onClick={openColorPicker} active={!!editor.getAttributes('textStyle').color} title="文字颜色">
          <span className="flex items-center gap-1">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-2 14l-3-8h1.5l2.25 6h.5l2.25-6H15l-3 8h-2z"/></svg>
            <span className="w-3 h-3 rounded-full inline-block border border-[#CCC]" style={{ backgroundColor: editor.getAttributes('textStyle').color || '#1A1A1A' }} />
          </span>
        </ToolbarButton>
        <input ref={colorInputRef} type="color" className="hidden" value={editor.getAttributes('textStyle').color || '#1A1A1A'} onChange={handleColorChange} />

        {/* 高亮颜色 */}
        <ToolbarButton onClick={openHlColorPicker} active={editor.isActive('highlight')} title="高亮颜色">
          <span className="flex items-center gap-1">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M15.24 2.69l.03-.03c.55-.55.55-1.44 0-1.99l-1.99-1.99a1.41 1.41 0 00-1.99 0l-.03.03L2.82 14.12c-.39.39-.82.73-1.3 1.01l3.35 3.35c.28-.48.62-.91 1.01-1.3L15.24 2.69zm-3.03 9.19l-1.42-1.42 6.36-6.36 1.42 1.42-6.36 6.36zM3.64 19.48l-1.06 3.18 3.18-1.06-2.12-2.12z"/></svg>
            <span className="w-3 h-3 rounded-full inline-block border border-[#CCC]" style={{ backgroundColor: editor.getAttributes('highlight').color || '#fef08a' }} />
          </span>
        </ToolbarButton>
        <input ref={hlColorInputRef} type="color" className="hidden" value={editor.getAttributes('highlight').color || '#fef08a'} onChange={handleHlColorChange} />

        <ToolbarDivider />

        {/* 对齐 */}
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="左对齐">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h12M3 18h16"/></svg>
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="居中">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M6 12h12M4 18h16"/></svg>
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="右对齐">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M9 12h12M5 18h16"/></svg>
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('justify').run()} active={editor.isActive({ textAlign: 'justify' })} title="两端对齐">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
        </ToolbarButton>

        {/* 首行缩进 */}
        <ToolbarButton onClick={() => editor.chain().focus().increaseIndent().run()} title="首行缩进">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 8h6l4 4-4 4H3V8zm9 0h9M12 16h9"/></svg>
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().decreaseIndent().run()} title="取消缩进">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 8H3l4 4-4 4h6V8zm3 0h9M12 16h9"/></svg>
        </ToolbarButton>

        <ToolbarDivider />

        {/* 列表 */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="无序列表">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="有序列表">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 6h11M10 12h11M10 18h11M4 6l2 2M4 12l2 2M4 18l2 2"/></svg>
        </ToolbarButton>

        <ToolbarDivider />

        {/* 链接 / 图片 / 引用 */}
        <ToolbarButton onClick={setLink} active={editor.isActive('link')} title="链接">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
        </ToolbarButton>
        <ToolbarButton onClick={handleImageUpload} title="图片">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="引用">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"/></svg>
        </ToolbarButton>

        <ToolbarDivider />

        {/* 表格 / 代码块 */}
        <ToolbarButton onClick={insertTable} title="插入表格">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="代码块">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        </ToolbarButton>

        {/* 表格操作 */}
        {editor.isActive('table') && (
          <>
            <ToolbarDivider />
            <ToolbarButton onClick={() => editor.chain().focus().addColumnAfter().run()} title="右侧插入列">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18M17 8h-2M17 12h-2"/></svg>
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().addRowAfter().run()} title="下方插入行">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18M8 7v2M16 7v2"/></svg>
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().deleteColumn().run()} title="删除列">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/><path d="M7 7l10 10M17 7L7 17"/></svg>
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().deleteRow().run()} title="删除行">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18"/><path d="M7 7l10 10M17 7L7 17"/></svg>
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().deleteTable().run()} title="删除表格">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 7l10 10M17 7L7 17"/></svg>
            </ToolbarButton>
          </>
        )}
      </div>

      {/* Editor content */}
      <div ref={editorContainerRef}>
        <EditorContent editor={editor} />
      </div>

      {/* ═══════ Styles ═══════ */}
      <style>{`
        .tiptap { min-height: 400px; }
        .tiptap:focus { outline: none; }
        .tiptap p.is-editor-empty:first-child::before {
          color: #999; content: attr(data-placeholder); float: left; height: 0; pointer-events: none;
        }
        .tiptap h2 { font-size: 1.25rem; font-weight: 700; margin: 1rem 0 0.5rem; }
        .tiptap h3 { font-size: 1.125rem; font-weight: 600; margin: 0.75rem 0 0.5rem; }
        .tiptap p { margin: 0.25rem 0; line-height: 1.75; }
        .tiptap ul, .tiptap ol { padding-left: 1.5rem; margin: 0.5rem 0; }
        .tiptap ul { list-style-type: disc; }
        .tiptap ol { list-style-type: decimal; }
        .tiptap li { margin: 0.125rem 0; line-height: 1.6; }
        .tiptap blockquote { border-left: 3px solid #8B7CB3; padding-left: 1rem; margin: 0.75rem 0; color: #666; font-style: italic; }
        .tiptap img { max-width: 100%; height: auto; border-radius: 0.75rem; margin: 0.75rem 0; }
        .tiptap a { color: #8B7CB3; text-decoration: underline; }
        .tiptap pre { background: #1a1a1a; color: #eaeaea; padding: 1rem; border-radius: 0.75rem; overflow-x: auto; margin: 0.75rem 0; font-size: 0.875rem; font-family: 'SF Mono', 'Fira Code', monospace; }
        .tiptap code { background: #f0f0f0; padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-size: 0.875em; font-family: 'SF Mono', 'Fira Code', monospace; }
        .tiptap pre code { background: none; padding: 0; border-radius: 0; }
        .tiptap table { border-collapse: collapse; margin: 0.75rem 0; width: 100%; }
        .tiptap table td, .tiptap table th { border: 1px solid #e0e0e0; padding: 0.5rem 0.75rem; position: relative; min-width: 80px; }
        .tiptap table th { background: #f5f5f5; font-weight: 600; }
        .tiptap mark { border-radius: 0.125rem; padding: 0 0.125rem; }
        .tiptap hr { border: none; border-top: 1px solid #e0e0e0; margin: 1.5rem 0; }
      `}</style>
    </div>
  );
});

export default TiptapEditor;
