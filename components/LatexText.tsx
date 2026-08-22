import React, { useMemo } from 'react';
import { normalizeFullText } from '../services/vietnameseFixer';

declare const katex: any;

interface LatexTextProps {
  text: string;
}

export default function LatexText({ text }: LatexTextProps) {
  if (!text) return null;

  // Chuẩn hóa tiếng Việt (sửa vỡ dấu), giữ nguyên 100% công thức trong $...$
  const cleanText = useMemo(() => normalizeFullText(text), [text]);

  // Tách text theo cú pháp LaTeX $...$
  const parts = useMemo(() => cleanText.split(/(\$.*?\$)/g), [cleanText]);
  
  // Lấy đối tượng KaTeX an toàn
  const getKatexInstance = () => {
    if (typeof katex !== 'undefined') return katex;
    if (typeof window !== 'undefined' && (window as any).katex) return (window as any).katex;
    return null;
  };

  const k = getKatexInstance();

  return (
    <span>
      {parts.map((part, i) => {
        if (!part) return null;

        if (part.startsWith('$') && part.endsWith('$')) {
          const latex = part.slice(1, -1);
          try {
            if (k) {
              const html = k.renderToString(latex, { 
                throwOnError: false,
                output: 'html',
                displayMode: false
              });
              return (
                <span 
                  key={i} 
                  dangerouslySetInnerHTML={{ __html: html }} 
                  data-latex={latex} 
                  className="latex-item inline-block mx-0.5 align-baseline" 
                />
              );
            }
            return <code key={i} className="bg-gray-100 px-1 py-0.5 rounded text-blue-600 font-mono text-sm">{latex}</code>;
          } catch (e) {
            return <span key={i} className="text-red-400">{part}</span>;
          }
        }

        // Cho phép render HTML (như thẻ <br/>, <b>, ...) trong phần văn bản thường
        return <span key={i} dangerouslySetInnerHTML={{ __html: part }} />;
      })}
    </span>
  );
}
