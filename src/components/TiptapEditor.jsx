import React, { useEffect, useRef, useCallback, forwardRef, useImperativeHandle, useState } from 'react';
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
    return [{ types: ['paragraph'], attributes: { textIndent: { default: null, parseHTML: el => el.style.textIndent || null, renderHTML: attrs => attrs.textIndent ? { style: `text-indent: ${attrs.textIndent}` } : {} } } }];
  },
});

// ── TextStyle 扩展：直接注册 fontFamily + fontSize 属性 ──
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

function ToolbarButton({ onClick, active, disabled, children, title }) {
  return (
    <button type="button" onMouseDown={e => { e.preventDefault(); onClick(); }} disabled={disabled} title={title}
      className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border-none ${active ? 'bg-[#8B7CB3] text-white' : 'bg-transparent text-[#666] dark:text-[#999] hover:bg-[#8B7CB3]/10 hover:text-[#8B7CB3]'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-[#E0E0E0] dark:bg-[#333] mx-0.5" />;
}

// ── 下拉组件 ──
function Dropdown({ label, value, options, onChange, className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, []);

  const current = options.find(o => o.value === value);
  return (
    <div ref={ref} className="relative">
      <button type="button" onPointerDown={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className={`px-2 py-1 rounded-lg text-xs bg-transparent border border-[#E0E0E0] dark:border-[#333] text-[#666] dark:text-[#999] cursor-pointer hover:bg-[#8B7CB3]/10 ${className}`}>
        {current?.label || label}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-[#1A1A1A] border border-[#E0E0E0] dark:border-[#333] rounded-lg shadow-lg min-w-[120px] max-h-[240px] overflow-y-auto">
          {options.map(o => (
            <button key={o.value} type="button" onPointerDown={() => { onChange(o.value); setOpen(false); }}
              className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-[#8B7CB3]/10 cursor-pointer border-none bg-transparent ${o.value === value ? 'text-[#8B7CB3] font-bold' : 'text-[#666] dark:text-[#999]'}`}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 选项数据 ──
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
  { label: '12px', value: '12px' },
  { label: '14px', value: '14px' },
  { label: '16px', value: '16px' },
  { label: '18px', value: '18px' },
  { label: '20px', value: '20px' },
  { label: '24px', value: '24px' },
  { label: '28px', value: '28px' },
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
      ExtendedTextStyle,
      Color,
      Table.configure({ resizable: true }), TableRow, TableCell, TableHeader,
      CodeBlock, TextIndent,
    ], content: '',
    editorProps: { attributes: { class: 'prose prose-sm max-w-none min-h-[400px] px-4 py-3 outline-none focus:outline-none' } },
  });

  useImperativeHandle(ref, () => ({
    getContent: () => editor?.getHTML() || '',
    setContent: html => { if (editor && html !== undefined) editor.commands.setContent(html); },
  }), [editor]);

  useEffect(() => {
    if (!editor) return;

    // 支持同页面多个 TiptapEditor：按最近祖先的 data-tiptap-key 做命名注册，
    // 没有则落到无 key 的兜底槽（单实例 / 未声明 key 的旧用法仍可用）。
    const keyEl = editorContainerRef.current?.closest('[data-tiptap-key]');
    const key = keyEl?.getAttribute('data-tiptap-key') || null;
    const store = (window._tiptapEditors ||= {});
    const slot = {
      getContent: () => editor.getHTML() || '',
      setContent: html => { if (html !== undefined) editor.commands.setContent(html); },
    };
    if (key) store[key] = slot;
    // 兜底槽：后注册者覆盖，避免「先 hydrate 的空实例」永久霸占全局槽。
    store.default = slot;
    window._tiptapGetContent = store.default.getContent;
    window._tiptapSetContent = store.default.setContent;

    return () => {
      // 仅清理本实例占用的命名槽；兜底槽交给仍在的实例/下一次注册处理。
      if (key && store[key] === slot) delete store[key];
    };
  }, [editor]);

  useEffect(() => {
    if (!editorContainerRef.current) return;
    const container = editorContainerRef.current;
    const obs = new MutationObserver(() => { const pm = container.querySelector('.tiptap'); if (pm) pm.style.minHeight = '400px'; });
    obs.observe(container, { childList: true, subtree: true });
    return () => obs.disconnect();
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
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp,image/avif';
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file || !editor) return;
      const fd = new FormData(); fd.append('file', file);
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        if (res.status === 401) { window.location.href = '/admin/login'; return; }
        const r = await res.json();
        if (r.url) editor.chain().focus().setImage({ src: r.url }).run(); else alert(r.error || '上传失败');
      } catch { alert('网络错误'); }
    }; input.click();
  }, [editor]);

  const insertTable = useCallback(() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), [editor]);

  const handleColorChange = useCallback(e => editor?.chain().focus().setColor(e.target.value).run(), [editor]);
  const handleHlColorChange = useCallback(e => editor?.chain().focus().setHighlight({ color: e.target.value }).run(), [editor]);

  const getFontSize = () => editor?.getAttributes('textStyle').fontSize || '';
  const getFontFamily = () => editor?.getAttributes('textStyle').fontFamily || '';
  const getHeadingVal = () => editor?.isActive('heading', { level: 2 }) ? '2' : editor?.isActive('heading', { level: 3 }) ? '3' : 'paragraph';

  if (!editor) return null;

  return (
    <div className="border border-[#E0E0E0] dark:border-[#333] rounded-xl overflow-hidden bg-white dark:bg-[#252525]">
      <div className="flex flex-wrap items-center gap-0.5 p-2 border-b border-[#E0E0E0] dark:border-[#333] bg-[#FAFAFA] dark:bg-[#1A1A1A]">
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="撤销">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 10h10a5 5 0 015 5v0a5 5 0 01-5 5H8" /><path d="M3 10l4-4M3 10l4 4" /></svg>
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="重做">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10H11a5 5 0 00-5 5v0a5 5 0 005 5h5" /><path d="M21 10l-4-4M21 10l-4 4" /></svg>
        </ToolbarButton>
        <ToolbarDivider />

        <Dropdown label="正文" value={getHeadingVal()} options={HEADING_OPTIONS}
          onChange={v => { v === 'paragraph' ? editor.chain().focus().setParagraph().run() : editor.chain().focus().toggleHeading({ level: parseInt(v) }).run(); }} />
        <Dropdown label="字体" value={getFontFamily()} options={FONT_FAMILIES}
          onChange={v => {
    setTimeout(() => {
      editor.chain().focus().setMark('textStyle', v ? { fontFamily: v } : { fontFamily: null }).run();
    }, 0);
  }} className="max-w-[80px] truncate" />
        <ToolbarDivider />
        <Dropdown label="字号" value={getFontSize()} options={FONT_SIZES}
          onChange={v => {
    setTimeout(() => {
      editor.chain().focus().setMark('textStyle', { fontSize: v }).run();
    }, 0);
  }} />

        <ToolbarDivider />
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="粗体"><b>B</b></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="斜体"><i>I</i></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="下划线"><u>U</u></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="删除线"><s>S</s></ToolbarButton>

        <ToolbarButton onClick={() => colorInputRef.current?.click()} active={!!editor.getAttributes('textStyle').color} title="文字颜色">
          <span className="flex items-center gap-1"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-2 14l-3-8h1.5l2.25 6h.5l2.25-6H15l-3 8h-2z"/></svg><span className="w-3 h-3 rounded-full border border-[#CCC]" style={{backgroundColor:editor.getAttributes('textStyle').color||'#1A1A1A'}}/></span>
        </ToolbarButton>
        <input ref={colorInputRef} type="color" className="hidden" value={editor.getAttributes('textStyle').color||'#1A1A1A'} onChange={handleColorChange} />

        <ToolbarButton onClick={() => hlColorInputRef.current?.click()} active={editor.isActive('highlight')} title="高亮颜色">
          <span className="flex items-center gap-1"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M15.24 2.69l.03-.03c.55-.55.55-1.44 0-1.99l-1.99-1.99a1.41 1.41 0 00-1.99 0l-.03.03L2.82 14.12c-.39.39-.82.73-1.3 1.01l3.35 3.35c.28-.48.62-.91 1.01-1.3L15.24 2.69zm-3.03 9.19l-1.42-1.42 6.36-6.36 1.42 1.42-6.36 6.36zM3.64 19.48l-1.06 3.18 3.18-1.06-2.12-2.12z"/></svg><span className="w-3 h-3 rounded-full border border-[#CCC]" style={{backgroundColor:editor.getAttributes('highlight').color||'#fef08a'}}/></span>
        </ToolbarButton>
        <input ref={hlColorInputRef} type="color" className="hidden" value={editor.getAttributes('highlight').color||'#fef08a'} onChange={handleHlColorChange} />

        <ToolbarDivider />
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({textAlign:'left'})} title="左对齐">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h12M3 18h16"/></svg></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({textAlign:'center'})} title="居中">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M6 12h12M4 18h16"/></svg></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({textAlign:'right'})} title="右对齐">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M9 12h12M5 18h16"/></svg></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('justify').run()} active={editor.isActive({textAlign:'justify'})} title="两端对齐">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg></ToolbarButton>

        <ToolbarButton onClick={() => editor.chain().focus().increaseIndent().run()} title="首行缩进">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 8h6l4 4-4 4H3V8zm9 0h9M12 16h9"/></svg></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().decreaseIndent().run()} title="取消缩进">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 8H3l4 4-4 4h6V8zm3 0h9M12 16h9"/></svg></ToolbarButton>

        <ToolbarDivider />
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="无序列表">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="有序列表">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 6h11M10 12h11M10 18h11M4 6l2 2M4 12l2 2M4 18l2 2"/></svg></ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton onClick={setLink} active={editor.isActive('link')} title="链接">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg></ToolbarButton>
        <ToolbarButton onClick={handleImageUpload} title="图片">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="引用">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"/></svg></ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton onClick={insertTable} title="插入表格">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="代码块">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg></ToolbarButton>
        {editor.isActive('table') && (<>
          <ToolbarDivider />
          <ToolbarButton onClick={() => editor.chain().focus().addColumnAfter().run()} title="右侧插入列">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18M17 8h-2M17 12h-2"/></svg></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().addRowAfter().run()} title="下方插入行">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18M8 7v2M16 7v2"/></svg></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().deleteColumn().run()} title="删除列">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/><path d="M7 7l10 10M17 7L7 17"/></svg></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().deleteRow().run()} title="删除行">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18"/><path d="M7 7l10 10M17 7L7 17"/></svg></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().deleteTable().run()} title="删除表格">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 7l10 10M17 7L7 17"/></svg></ToolbarButton>
        </>)}
      </div>
      <div ref={editorContainerRef}><EditorContent editor={editor} /></div>
      <style>{`
        .tiptap{min-height:400px}.tiptap:focus{outline:none}.tiptap p.is-editor-empty:first-child::before{color:#999;content:attr(data-placeholder);float:left;height:0;pointer-events:none}
        .tiptap h2{font-size:1.25rem;font-weight:700;margin:1rem 0 .5rem}.tiptap h3{font-size:1.125rem;font-weight:600;margin:.75rem 0 .5rem}.tiptap p{margin:.25rem 0;line-height:1.75}
        .tiptap ul,.tiptap ol{padding-left:1.5rem;margin:.5rem 0}.tiptap ul{list-style-type:disc}.tiptap ol{list-style-type:decimal}.tiptap li{margin:.125rem 0;line-height:1.6}
        .tiptap blockquote{border-left:3px solid #8B7CB3;padding-left:1rem;margin:.75rem 0;color:#666;font-style:italic}
        .tiptap img{max-width:100%;height:auto;border-radius:.75rem;margin:.75rem 0}.tiptap a{color:#8B7CB3;text-decoration:underline}
        .tiptap pre{background:#1a1a1a;color:#eaeaea;padding:1rem;border-radius:.75rem;overflow-x:auto;margin:.75rem 0;font-size:.875rem;font-family:'SF Mono','Fira Code',monospace}
        .tiptap code{background:#f0f0f0;padding:.125rem .375rem;border-radius:.25rem;font-size:.875em;font-family:'SF Mono','Fira Code',monospace}.tiptap pre code{background:none;padding:0;border-radius:0}
        .tiptap table{border-collapse:collapse;margin:.75rem 0;width:100%}.tiptap table td,.tiptap table th{border:1px solid #e0e0e0;padding:.5rem .75rem;position:relative;min-width:80px}.tiptap table th{background:#f5f5f5;font-weight:600}
        .tiptap mark{border-radius:.125rem;padding:0 .125rem}.tiptap hr{border:none;border-top:1px solid #e0e0e0;margin:1.5rem 0}
      `}</style>
    </div>
  );
});

export default TiptapEditor;
