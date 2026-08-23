import React, { useState, useEffect, useRef } from 'react';
import { X, Copy, Check, Sparkles, Trash2, RotateCcw, CornerDownLeft, Sigma } from 'lucide-react';
import LatexText from '../LatexText';

interface LatexEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (code: string) => void;
  questionIndex?: number;
  initialCode?: string;
}

type TabType = 'algebra' | 'geometry' | 'systems' | 'sets';

interface FormulaTemplate {
  code: string;
  label: string;
  previewLatex: string;
}

const ALGEBRA_TEMPLATES: FormulaTemplate[] = [
  { code: '$\\dfrac{a}{b}$', label: 'PHÂN SỐ LỚN', previewLatex: '$\\dfrac{a}{b}$' },
  { code: '$\\frac{a}{b}$', label: 'PHÂN SỐ NHỎ', previewLatex: '$\\frac{a}{b}$' },
  { code: '$\\sqrt{x}$', label: 'CĂN BẬC HAI', previewLatex: '$\\sqrt{x}$' },
  { code: '$\\sqrt[n]{x}$', label: 'CĂN BẬC N', previewLatex: '$\\sqrt[n]{x}$' },
  { code: '$x^{2}$', label: 'LŨY THỪA', previewLatex: '$x^{2}$' },
  { code: '$x_{1}$', label: 'CHỈ SỐ DƯỚI', previewLatex: '$x_{1}$' },
  { code: '$x_{1}^{2}$', label: 'MŨ & CHỈ SỐ', previewLatex: '$x_{1}^{2}$' },
  { code: '$\\int_{a}^{b} f(x)\\,dx$', label: 'TÍCH PHÂN CẬN TO', previewLatex: '$\\int_{a}^{b} f(x)\\,dx$' },
  { code: '$\\int f(x)\\,dx$', label: 'NGUYÊN HÀM', previewLatex: '$\\int f(x)\\,dx$' },
  { code: '$\\lim_{x \\to x_0} f(x)$', label: 'GIỚI HẠN LIM', previewLatex: '$\\lim_{x \\to x_0} f(x)$' },
  { code: '$\\sum_{i=1}^{n} a_i$', label: 'TỔNG SIGMA', previewLatex: '$\\sum_{i=1}^{n} a_i$' },
  { code: "$y', f'(x)$", label: 'ĐẠO HÀM', previewLatex: "$y', f'(x)$" },
  { code: '$\\log_a(b)$', label: 'LOGARIT', previewLatex: '$\\log_a(b)$' },
  { code: '$\\ln(x)$', label: 'LN TỰ NHIÊN', previewLatex: '$\\ln(x)$' },
  { code: '$|x|$', label: 'TRỊ TUYỆT ĐỐI', previewLatex: '$|x|$' },
  { code: '$\\sin(x), \\cos(x), \\tan(x)$', label: 'LƯỢNG GIÁC', previewLatex: '$\\sin x, \\cos x$' }
];

const GEOMETRY_TEMPLATES: FormulaTemplate[] = [
  { code: '$\\vec{a}$', label: 'VECTOR', previewLatex: '$\\vec{a}$' },
  { code: '$\\overrightarrow{AB}$', label: 'VECTOR DÀI', previewLatex: '$\\overrightarrow{AB}$' },
  { code: '$|\\vec{a}|$', label: 'ĐỘ DÀI VECTOR', previewLatex: '$|\\vec{a}|$' },
  { code: '$\\vec{a} \\cdot \\vec{b}$', label: 'TÍCH VÔ HƯỚNG', previewLatex: '$\\vec{a} \\cdot \\vec{b}$' },
  { code: '$\\widehat{ABC}$', label: 'GÓC HÌNH HỌC', previewLatex: '$\\widehat{ABC}$' },
  { code: '$\\Delta ABC$', label: 'TAM GIÁC', previewLatex: '$\\Delta ABC$' },
  { code: '$AB \\perp CD$', label: 'VUÔNG GÓC', previewLatex: '$AB \\perp CD$' },
  { code: '$AB \\parallel CD$', label: 'SONG SONG', previewLatex: '$AB \\parallel CD$' },
  { code: '$(O; R)$', label: 'ĐƯỜNG TRÒN', previewLatex: '$(O; R)$' },
  { code: '$\\alpha^\\circ$', label: 'ĐỘ GÓC', previewLatex: '$\\alpha^\\circ$' },
  { code: '$\\vec{0}$', label: 'VECTOR 0', previewLatex: '$\\vec{0}$' },
  { code: '$\\vec{u}(x; y; z)$', label: 'TỌA ĐỘ VECTOR', previewLatex: '$\\vec{u}(x; y; z)$' }
];

const SYSTEMS_TEMPLATES: FormulaTemplate[] = [
  { code: '$\\begin{cases} x + y = 1 \\\\ x - y = 0 \\end{cases}$', label: 'HỆ 2 PHƯƠNG TRÌNH', previewLatex: '$\\begin{cases} x + y = 1 \\\\ x - y = 0 \\end{cases}$' },
  { code: '$\\begin{cases} a \\\\ b \\\\ c \\end{cases}$', label: 'HỆ 3 PHƯƠNG TRÌNH', previewLatex: '$\\begin{cases} a \\\\ b \\\\ c \\end{cases}$' },
  { code: '$\\left[ \\begin{array}{l} x = a \\\\ x = b \\end{array} \\right.$', label: 'NGOẶC VUÔNG (HOẶC)', previewLatex: '$\\left[ \\begin{array}{l} x = a \\\\ x = b \\end{array} \\right.$' },
  { code: '$\\left( \\dfrac{a}{b} \\right)$', label: 'NGOẶC TRÒN TỰ ĐỘNG', previewLatex: '$\\left( \\dfrac{a}{b} \\right)$' },
  { code: '$\\left[ \\dfrac{a}{b} \\right]$', label: 'NGOẶC VUÔNG TỰ ĐỘNG', previewLatex: '$\\left[ \\dfrac{a}{b} \\right]$' },
  { code: '$\\left\\{ \\dfrac{a}{b} \\right\\}$', label: 'NGOẶC NHỌN TỰ ĐỘNG', previewLatex: '$\\left\\{ \\dfrac{a}{b} \\right\\}$' },
  { code: '$\\left| \\dfrac{a}{b} \\right|$', label: 'GIÁ TRỊ TUYỆT ĐỐI', previewLatex: '$\\left| \\dfrac{a}{b} \\right|$' },
  { code: '$\\left. f(x) \\right|_a^b$', label: 'THAY CẬN TÍCH PHÂN', previewLatex: '$\\left. f(x) \\right|_a^b$' }
];

const SETS_TEMPLATES: FormulaTemplate[] = [
  { code: '$[a; b]$', label: 'ĐOẠN', previewLatex: '$[a; b]$' },
  { code: '$(a; b)$', label: 'KHOẢNG', previewLatex: '$(a; b)$' },
  { code: '$[a; b)$', label: 'NỬA KHOẢNG', previewLatex: '$[a; b)$' },
  { code: '$A \\cup B$', label: 'HỢP HAI TẬP HỢP', previewLatex: '$A \\cup B$' },
  { code: '$A \\cap B$', label: 'GIAO HAI TẬP HỢP', previewLatex: '$A \\cap B$' },
  { code: '$A \\setminus B$', label: 'HIỆU HAI TẬP HỢP', previewLatex: '$A \\setminus B$' },
  { code: '$C_n^k$', label: 'TỔ HỢP', previewLatex: '$C_n^k$' },
  { code: '$A_n^k$', label: 'CHỈNH HỢP', previewLatex: '$A_n^k$' },
  { code: '$P_n = n!$', label: 'HOÁN VỊ / GIAI THỪA', previewLatex: '$P_n = n!$' },
  { code: '$\\mathbb{R}, \\mathbb{N}, \\mathbb{Z}, \\mathbb{Q}$', label: 'TẬP SỐ CHUẨN', previewLatex: '$\\mathbb{R}, \\mathbb{N}, \\mathbb{Z}$' }
];

const MATH_SYMBOLS = [
  { char: '≤', code: '\\le ' },
  { char: '≥', code: '\\ge ' },
  { char: '≠', code: '\\ne ' },
  { char: '≈', code: '\\approx ' },
  { char: '±', code: '\\pm ' },
  { char: '∓', code: '\\mp ' },
  { char: '∈', code: '\\in ' },
  { char: '∉', code: '\\notin ' },
  { char: '⊂', code: '\\subset ' },
  { char: '∪', code: '\\cup ' },
  { char: '∩', code: '\\cap ' },
  { char: '∅', code: '\\emptyset ' },
  { char: '∀', code: '\\forall ' },
  { char: '∃', code: '\\exists ' },
  { char: '⇒', code: '\\Rightarrow ' },
  { char: '⇔', code: '\\Leftrightarrow ' },
  { char: '→', code: '\\to ' },
  { char: '∞', code: '\\infty ' },
  { char: '-∞', code: '-\\infty ' },
  { char: '°', code: '^\\circ ' },
  { char: '∥', code: '\\parallel ' },
  { char: '⊥', code: '\\perp ' },
  { char: 'Δ', code: '\\Delta ' },
  { char: 'π', code: '\\pi ' },
  { char: 'α', code: '\\alpha ' },
  { char: 'β', code: '\\beta ' },
  { char: 'γ', code: '\\gamma ' },
  { char: 'θ', code: '\\theta ' },
  { char: 'λ', code: '\\lambda ' },
  { char: 'ω', code: '\\omega ' },
  { char: 'Ω', code: '\\Omega ' },
  { char: 'μ', code: '\\mu ' },
  { char: '…', code: '\\dots ' }
];

const COLORS = [
  { name: 'Red', hex: '#ef4444', code: 'red' },
  { name: 'Blue', hex: '#2563eb', code: 'blue' },
  { name: 'Green', hex: '#16a34a', code: 'green' },
  { name: 'Orange', hex: '#ea580c', code: 'orange' },
  { name: 'Purple', hex: '#9333ea', code: 'purple' },
  { name: 'Pink', hex: '#db2777', code: 'magenta' },
  { name: 'Dark', hex: '#0f172a', code: 'black' }
];

export default function LatexEditorModal({
  isOpen,
  onClose,
  onInsert,
  questionIndex,
  initialCode = '$\\dfrac{a}{b}$'
}: LatexEditorModalProps) {
  const [latexCode, setLatexCode] = useState(initialCode);
  const [activeTab, setActiveTab] = useState<TabType>('algebra');
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setLatexCode(initialCode || '$\\dfrac{a}{b}$');
      setCopied(false);
    }
  }, [isOpen, initialCode]);

  if (!isOpen) return null;

  const insertTextAtCursor = (textToInsert: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setLatexCode(prev => prev + textToInsert);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentVal = textarea.value;
    const newVal = currentVal.substring(0, start) + textToInsert + currentVal.substring(end);
    setLatexCode(newVal);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + textToInsert.length, start + textToInsert.length);
    }, 10);
  };

  const wrapSelectionWith = (prefix: string, suffix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setLatexCode(prev => `${prefix}${prev}${suffix}`);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentVal = textarea.value;
    const selectedText = currentVal.substring(start, end);
    const newVal = currentVal.substring(0, start) + prefix + selectedText + suffix + currentVal.substring(end);
    setLatexCode(newVal);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 10);
  };

  const handleCopy = () => {
    if (!latexCode) return;
    navigator.clipboard.writeText(latexCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInsert = () => {
    if (latexCode.trim()) {
      onInsert(latexCode.trim());
    }
    onClose();
  };

  const handleResetDefault = () => {
    setLatexCode('$\\dfrac{a}{b}$');
  };

  const handleClear = () => {
    setLatexCode('');
  };

  const getActiveTabTemplates = (): FormulaTemplate[] => {
    switch (activeTab) {
      case 'algebra': return ALGEBRA_TEMPLATES;
      case 'geometry': return GEOMETRY_TEMPLATES;
      case 'systems': return SYSTEMS_TEMPLATES;
      case 'sets': return SETS_TEMPLATES;
      default: return ALGEBRA_TEMPLATES;
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[3000] flex items-center justify-center p-2 sm:p-4 animate-fade-in">
      <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl flex flex-col max-h-[95vh] overflow-hidden border-4 border-slate-100 animate-scale-up">
        
        {/* HEADER */}
        <div className="bg-[#111827] text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-base shadow-md">
              <Sigma size={18} />
            </div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-black uppercase tracking-tight text-white">
                EQUATION EDITOR - SOẠN THẢO CÔNG THỨC & LATEX
              </h2>
              {questionIndex !== undefined && (
                <span className="px-2.5 py-0.5 bg-slate-800 border border-slate-700 text-blue-400 rounded-lg text-[10px] font-black uppercase tracking-wider">
                  Câu {questionIndex}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold transition-all border border-slate-700 active:scale-95"
              title="Sao chép mã LaTeX"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              <span>{copied ? 'Đã copy' : 'Copy'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition-all shadow-md active:scale-95 ml-1"
              title="Đóng cửa sổ"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* SCROLLABLE BODY */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 custom-scrollbar">
          
          {/* TOOLBAR FORMATTING & COLORS */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200">
            {/* ĐỊNH DẠNG */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-black uppercase text-slate-400 mr-1 flex items-center gap-1">
                <span className="text-blue-600 font-serif font-black">T</span> ĐỊNH DẠNG:
              </span>
              <button
                type="button"
                onClick={() => wrapSelectionWith('**', '**')}
                className="w-8 h-8 bg-white border border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-slate-800 rounded-xl font-black text-xs transition-all shadow-sm active:scale-95"
                title="In đậm (Bold)"
              >
                B
              </button>
              <button
                type="button"
                onClick={() => wrapSelectionWith('*', '*')}
                className="w-8 h-8 bg-white border border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-slate-800 rounded-xl font-black italic text-xs transition-all shadow-sm active:scale-95"
                title="In nghiêng (Italic)"
              >
                I
              </button>
              <button
                type="button"
                onClick={() => wrapSelectionWith('\\underline{', '}')}
                className="w-8 h-8 bg-white border border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-slate-800 rounded-xl font-black underline text-xs transition-all shadow-sm active:scale-95"
                title="Gạch chân (Underline)"
              >
                U
              </button>
              <button
                type="button"
                onClick={() => insertTextAtCursor('<br/>\n')}
                className="px-2.5 h-8 bg-white border border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-slate-700 rounded-xl font-bold text-[11px] font-mono transition-all shadow-sm active:scale-95"
                title="Xuống dòng (<br/>)"
              >
                &lt;br&gt;
              </button>
              <button
                type="button"
                onClick={() => wrapSelectionWith('$', '$')}
                className="px-2.5 h-8 bg-white border border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-blue-700 rounded-xl font-black text-xs font-mono transition-all shadow-sm active:scale-95"
                title="Bao quanh bằng dấu công thức inline $...$"
              >
                $$\$$
              </button>
              <button
                type="button"
                onClick={() => wrapSelectionWith('\\text{', '}')}
                className="px-2.5 h-8 bg-white border border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-slate-700 rounded-xl font-black text-[10px] uppercase transition-all shadow-sm active:scale-95"
                title="Văn bản trong công thức (\text{chữ})"
              >
                \TEXT{'{CHỮ}'}
              </button>
            </div>

            {/* MÀU SẮC */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-1">
                🎨 MÀU:
              </span>
              <div className="flex items-center gap-1.5">
                {COLORS.map(c => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => wrapSelectionWith(`\\color{${c.code}}{`, '}')}
                    className="w-5 h-5 rounded-full border-2 border-white shadow-sm hover:scale-125 transition-transform"
                    style={{ backgroundColor: c.hex }}
                    title={`Màu ${c.name} (\\color{${c.code}}{...})`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* KÝ HIỆU TOÁN HỌC (SYMBOLS BAR) */}
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                KÝ HIỆU:
              </span>
              <span className="text-[9px] font-bold text-slate-400">
                Nhấn vào ký hiệu để chèn ngay
              </span>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
              {MATH_SYMBOLS.map((sym, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => insertTextAtCursor(sym.code)}
                  className="px-2.5 py-1.5 bg-white border border-slate-200 hover:border-blue-500 hover:bg-blue-50 text-slate-800 hover:text-blue-600 rounded-xl text-xs font-bold shrink-0 transition-all shadow-sm active:scale-90"
                  title={sym.code}
                >
                  {sym.char}
                </button>
              ))}
            </div>
          </div>

          {/* FORMULA CATEGORY TABS */}
          <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
            {[
              { id: 'algebra' as TabType, label: 'ĐẠI SỐ & GIẢI TÍCH' },
              { id: 'geometry' as TabType, label: 'HÌNH HỌC & VECTOR' },
              { id: 'systems' as TabType, label: 'HỆ PT & DẤU NGOẶC' },
              { id: 'sets' as TabType, label: 'TẬP HỢP & TỔ HỢP' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-xl font-black text-xs uppercase tracking-tight transition-all ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* TEMPLATE CARDS GRID */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {getActiveTabTemplates().map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setLatexCode(item.code)}
                className="group bg-white p-3 rounded-2xl border-2 border-slate-100 hover:border-blue-500 hover:shadow-md transition-all flex flex-col items-center justify-between min-h-[90px] text-center active:scale-95"
                title={`Chọn mẫu: ${item.label}`}
              >
                <div className="flex-1 flex items-center justify-center py-2 text-slate-800 group-hover:text-blue-600 text-sm overflow-hidden">
                  <LatexText text={item.previewLatex} />
                </div>
                <span className="text-[9px] font-black text-slate-400 group-hover:text-blue-600 uppercase tracking-tight mt-1 truncate w-full">
                  {item.label}
                </span>
              </button>
            ))}
          </div>

          {/* INPUT CODE & REAL-TIME PREVIEW */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {/* LEFT: TEXTAREA INPUT */}
            <div className="space-y-2 flex flex-col">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                  MÃ LATEX / HTML CÔNG THỨC:
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleClear}
                    className="flex items-center gap-1 text-[10px] font-bold text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-0.5 rounded-lg transition-colors"
                  >
                    <Trash2 size={11} /> Xóa
                  </button>
                  <button
                    type="button"
                    onClick={handleResetDefault}
                    className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-0.5 rounded-lg transition-colors"
                  >
                    <RotateCcw size={11} /> Mẫu
                  </button>
                </div>
              </div>
              <textarea
                ref={textareaRef}
                value={latexCode}
                onChange={e => setLatexCode(e.target.value)}
                placeholder="Nhập mã LaTeX (VD: $\dfrac{a}{b}$, $\sqrt{x}$, $x^2$...)"
                className="w-full h-32 p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-mono text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-blue-500 transition-all resize-none shadow-inner"
              />
            </div>

            {/* RIGHT: REAL-TIME PREVIEW */}
            <div className="space-y-2 flex flex-col">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black uppercase text-blue-600 tracking-wider flex items-center gap-1">
                  <Sparkles size={12} /> KẾT QUẢ HIỂN THỊ (PREVIEW):
                </label>
                <span className="text-[9px] font-black uppercase text-slate-400">
                  THỜI GIAN THỰC
                </span>
              </div>
              <div className="w-full h-32 p-4 bg-blue-50/30 border-2 border-blue-100 rounded-2xl flex items-center justify-center text-center overflow-auto shadow-inner text-base">
                {latexCode.trim() ? (
                  <LatexText text={latexCode.includes('$') ? latexCode : `$${latexCode}$`} />
                ) : (
                  <span className="text-xs font-bold text-slate-400 italic">
                    Chưa có công thức để hiển thị...
                  </span>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* FOOTER ACTIONS */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-2 px-5 py-3 bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-700 rounded-2xl text-xs font-black uppercase transition-all active:scale-95 shadow-sm"
          >
            {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
            <span>{copied ? 'ĐÃ SAO CHÉP MÃ' : 'COPY MÃ'}</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-2xl text-xs font-black uppercase transition-all"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={handleInsert}
              className="flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-black uppercase transition-all shadow-lg active:scale-95 border border-blue-500"
            >
              <CornerDownLeft size={16} /> CHÈN VÀO CÂU (INSERT)
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
