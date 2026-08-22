import React, { useState } from 'react';
import { X, Download, FileType, AlignLeft, Rows } from 'lucide-react';
import { Quiz, Question } from '../../types';
import LatexText from '../LatexText';
import { normalizeFullText, repairVietnameseText } from '../../services/vietnameseFixer';

interface QuizPreviewModalProps {
    quiz: Quiz;
    onClose: () => void;
    isAdmin?: boolean;
}

export default function QuizPreviewModal({ quiz, onClose, isAdmin = true }: QuizPreviewModalProps) {
    const [layoutMode, setLayoutMode] = useState<'single' | 'auto'>('single');

    // Render các phương án dạng văn bản sạch - HOÀN TOÀN KHÔNG DÙNG TABLE
    const renderOptionsNoTable = (q: Question) => {
        if (!q.options || q.options.length === 0) return null;

        const options = q.options;

        if (layoutMode === 'single') {
            // Chế độ 1: Mỗi phương án 1 dòng - Không bao giờ lệch dòng, không cần canh tab
            return (
                <div className="options-container" style={{ marginTop: '2pt', marginBottom: '4pt' }}>
                    {options.map((opt, idx) => (
                        <p 
                            key={idx} 
                            className="option-item" 
                            style={{ 
                                margin: '2pt 0 2pt 18pt', 
                                lineHeight: '1.3', 
                                textAlign: 'justify' 
                            }}
                        >
                            <b style={{ marginRight: '6px' }}>{String.fromCharCode(65 + idx)}.</b>
                            <LatexText text={opt} />
                        </p>
                    ))}
                </div>
            );
        }

        // Chế độ 2: Tự động phân dòng gọn gàng không dùng bảng
        const maxLen = Math.max(...options.map(o => (o || '').length));
        const totalLen = options.reduce((sum, o) => sum + (o || '').length, 0);

        if (options.length === 4 && maxLen <= 20 && totalLen <= 75) {
            // 4 phương án trên 1 dòng dàn đều dạng cột (tương đương canh Tab Word)
            return (
                <div className="options-container" style={{ marginTop: '2pt', marginBottom: '4pt' }}>
                    <p 
                        className="option-item" 
                        style={{ 
                            margin: '2pt 0 2pt 18pt', 
                            lineHeight: '1.35', 
                            textAlign: 'justify' 
                        }}
                    >
                        {options.map((opt, idx) => (
                            <span 
                                key={idx} 
                                style={{ 
                                    width: '24.5%', 
                                    display: 'inline-block', 
                                    verticalAlign: 'top' 
                                }}
                            >
                                <b style={{ marginRight: '4px' }}>{String.fromCharCode(65 + idx)}.</b>
                                <LatexText text={opt} />
                            </span>
                        ))}
                    </p>
                </div>
            );
        }

        if (options.length === 4 && maxLen <= 45) {
            // 2 dòng chia đều 2 cột (A - B và C - D) như canh Tab Word
            return (
                <div className="options-container" style={{ marginTop: '2pt', marginBottom: '4pt' }}>
                    <p 
                        className="option-item" 
                        style={{ 
                            margin: '2pt 0 1.5pt 18pt', 
                            lineHeight: '1.35', 
                            textAlign: 'justify' 
                        }}
                    >
                        <span style={{ width: '49%', display: 'inline-block', verticalAlign: 'top' }}>
                            <b style={{ marginRight: '4px' }}>A.</b>
                            <LatexText text={options[0]} />
                        </span>
                        <span style={{ width: '49%', display: 'inline-block', verticalAlign: 'top' }}>
                            <b style={{ marginRight: '4px' }}>B.</b>
                            <LatexText text={options[1]} />
                        </span>
                    </p>
                    <p 
                        className="option-item" 
                        style={{ 
                            margin: '1.5pt 0 2pt 18pt', 
                            lineHeight: '1.35', 
                            textAlign: 'justify' 
                        }}
                    >
                        <span style={{ width: '49%', display: 'inline-block', verticalAlign: 'top' }}>
                            <b style={{ marginRight: '4px' }}>C.</b>
                            <LatexText text={options[2]} />
                        </span>
                        <span style={{ width: '49%', display: 'inline-block', verticalAlign: 'top' }}>
                            <b style={{ marginRight: '4px' }}>D.</b>
                            <LatexText text={options[3]} />
                        </span>
                    </p>
                </div>
            );
        }

        // Mặc định: Mỗi phương án 1 dòng
        return (
            <div className="options-container" style={{ marginTop: '2pt', marginBottom: '4pt' }}>
                {options.map((opt, idx) => (
                    <p 
                        key={idx} 
                        className="option-item" 
                        style={{ 
                            margin: '2pt 0 2pt 18pt', 
                            lineHeight: '1.35', 
                            textAlign: 'justify' 
                        }}
                    >
                        <b style={{ marginRight: '6px' }}>{String.fromCharCode(65 + idx)}.</b>
                        <LatexText text={opt} />
                    </p>
                ))}
            </div>
        );
    };

    // Tạo nội dung bảng đáp án tổng hợp (Chỉ hiện cho Admin / Bảng đáp án ở cuối)
    const renderAnswerKey = () => {
        if (!isAdmin) return null;
        
        const mcqQs = quiz.questions.filter(q => q.type === 'mcq');
        const groupTfQs = quiz.questions.filter(q => q.type === 'group-tf');
        const shortQs = quiz.questions.filter(q => q.type === 'short');

        const sectionStyle = { 
            fontWeight: 'bold', 
            textTransform: 'uppercase' as const, 
            marginTop: '12pt', 
            marginBottom: '6pt', 
            fontSize: '11pt' 
        };
        
        return (
            <div id="answer-key-section" style={{ marginTop: '30pt', borderTop: '1.5pt solid #000', paddingTop: '15pt', pageBreakBefore: 'always' }}>
                <h3 style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '13pt', textTransform: 'uppercase', marginBottom: '15pt' }}>BẢNG ĐÁP ÁN</h3>
                
                {mcqQs.length > 0 && (
                    <div style={{ marginBottom: '18pt' }}>
                        <p style={sectionStyle}>PHẦN I. CÂU HỎI TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN LỰA CHỌN</p>
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '6pt' }}>
                            <tbody>
                                {Array.from({ length: Math.ceil(mcqQs.length / 10) }).map((_, rowIndex) => {
                                    const chunk = mcqQs.slice(rowIndex * 10, (rowIndex + 1) * 10);
                                    return (
                                        <React.Fragment key={rowIndex}>
                                            <tr>
                                                {chunk.map((_, colIndex) => (
                                                    <td key={colIndex} style={{ border: '1pt solid black', padding: '4pt 2pt', textAlign: 'center', fontWeight: 'bold', backgroundColor: '#f8fafc', width: '10%', fontSize: '10pt' }}>
                                                        Câu {rowIndex * 10 + colIndex + 1}
                                                    </td>
                                                ))}
                                                {Array.from({ length: 10 - chunk.length }).map((_, i) => (
                                                    <td key={`empty-h-${i}`} style={{ border: '1pt solid black', width: '10%' }}></td>
                                                ))}
                                            </tr>
                                            <tr>
                                                {chunk.map((q, colIndex) => {
                                                    const correctIdx = q.options?.indexOf(q.correctAnswer || '') ?? -1;
                                                    const label = correctIdx !== -1 ? String.fromCharCode(65 + correctIdx) : (q.correctAnswer || '?');
                                                    return (
                                                        <td key={colIndex} style={{ border: '1pt solid black', padding: '5pt 2pt', textAlign: 'center', fontWeight: 'bold', color: '#166534', width: '10%', fontSize: '10pt' }}>
                                                            {label}
                                                        </td>
                                                    );
                                                })}
                                                {Array.from({ length: 10 - chunk.length }).map((_, i) => (
                                                    <td key={`empty-b-${i}`} style={{ border: '1pt solid black', width: '10%' }}></td>
                                                ))}
                                            </tr>
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {groupTfQs.length > 0 && (
                    <div style={{ marginBottom: '18pt' }}>
                        <p style={sectionStyle}>PHẦN II. CÂU HỎI TRẮC NGHIỆM ĐÚNG SAI</p>
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '6pt' }}>
                            <thead>
                                <tr>
                                    <th style={{ border: '1pt solid black', padding: '4pt', textAlign: 'center', backgroundColor: '#f8fafc', width: '16%', fontSize: '10pt' }}>Câu</th>
                                    <th style={{ border: '1pt solid black', padding: '4pt', textAlign: 'center', backgroundColor: '#f8fafc', width: '21%', fontSize: '10pt' }}>a</th>
                                    <th style={{ border: '1pt solid black', padding: '4pt', textAlign: 'center', backgroundColor: '#f8fafc', width: '21%', fontSize: '10pt' }}>b</th>
                                    <th style={{ border: '1pt solid black', padding: '4pt', textAlign: 'center', backgroundColor: '#f8fafc', width: '21%', fontSize: '10pt' }}>c</th>
                                    <th style={{ border: '1pt solid black', padding: '4pt', textAlign: 'center', backgroundColor: '#f8fafc', width: '21%', fontSize: '10pt' }}>d</th>
                                </tr>
                            </thead>
                            <tbody>
                                {groupTfQs.map((q, i) => {
                                    const subAns = q.subQuestions || [];
                                    return (
                                        <tr key={q.id}>
                                            <td style={{ border: '1pt solid black', padding: '4pt', textAlign: 'center', fontWeight: 'bold', fontSize: '10pt' }}>Câu {i + 1}</td>
                                            {[0, 1, 2, 3].map(subIndex => {
                                                const sq = subAns[subIndex];
                                                const val = sq ? (String(sq.correctAnswer).toLowerCase() === 'true' || String(sq.correctAnswer).toLowerCase() === 'đúng' ? 'Đ' : 'S') : '-';
                                                return (
                                                    <td key={subIndex} style={{ border: '1pt solid black', padding: '4pt', textAlign: 'center', fontWeight: 'bold', fontSize: '10pt' }}>
                                                        {val}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {shortQs.length > 0 && (
                    <div style={{ marginBottom: '18pt' }}>
                        <p style={sectionStyle}>PHẦN III. CÂU HỎI TRẮC NGHIỆM TRẢ LỜI NGẮN</p>
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '6pt' }}>
                            <thead>
                                <tr>
                                    <th style={{ border: '1pt solid black', padding: '4pt', textAlign: 'center', backgroundColor: '#f8fafc', width: '25%', fontSize: '10pt' }}>Câu</th>
                                    <th style={{ border: '1pt solid black', padding: '4pt', textAlign: 'center', backgroundColor: '#f8fafc', width: '75%', fontSize: '10pt' }}>Đáp án</th>
                                </tr>
                            </thead>
                            <tbody>
                                {shortQs.map((q, i) => (
                                    <tr key={q.id}>
                                        <td style={{ border: '1pt solid black', padding: '4pt', textAlign: 'center', fontWeight: 'bold', fontSize: '10pt' }}>Câu {i + 1}</td>
                                        <td style={{ border: '1pt solid black', padding: '4pt 8pt', textAlign: 'center', fontWeight: 'bold', color: '#1d4ed8', fontSize: '10pt' }}>{q.correctAnswer || 'N/A'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    };

    const handleExportWord = () => {
        if (!isAdmin) return;
        const originalContent = document.getElementById('quiz-export-content');
        if (!originalContent) return alert("Không tìm thấy nội dung!");

        const clone = originalContent.cloneNode(true) as HTMLElement;
        const latexItems = clone.querySelectorAll('[data-latex]');
        latexItems.forEach(item => {
            const rawLatex = item.getAttribute('data-latex');
            if (rawLatex) {
                const textNode = document.createTextNode(`$${rawLatex}$`);
                item.parentNode?.replaceChild(textNode, item);
            }
        });

        // Chuẩn hóa toàn bộ nội dung HTML xuất ra để đảm bảo không bị lỗi font hay vỡ chữ
        const cleanedHtml = repairVietnameseText(clone.innerHTML);
        const content = cleanedHtml;
        const header = `
            <html xmlns:o='urn:schemas-microsoft-com:office:office' 
                  xmlns:w='urn:schemas-microsoft-com:office:word' 
                  xmlns='http://www.w3.org/TR/REC-html40'>
            <head>
                <meta charset='utf-8'>
                <title>${normalizeFullText(quiz.title)}</title>
                <!--[if gte mso 9]>
                <xml>
                <w:WordDocument>
                <w:View>Print</w:View>
                <w:Zoom>100</w:Zoom>
                <w:DoNotOptimizeForBrowser/>
                </w:WordDocument>
                </xml>
                <![endif]-->
                <style>
                    @page { 
                        size: 21cm 29.7cm; 
                        margin: 1.5cm 1.8cm 1.5cm 1.8cm; 
                        mso-header-margin: 36pt; 
                        mso-footer-margin: 36pt; 
                        mso-paper-source: 0; 
                    }
                    body { 
                        font-family: 'Times New Roman', Times, serif; 
                        font-size: 12pt; 
                        line-height: 1.25; 
                        color: #000000; 
                        text-align: justify; 
                        margin: 0; 
                        padding: 0; 
                    }
                    p, div { 
                        margin-top: 2pt; 
                        margin-bottom: 2pt; 
                        line-height: 1.25; 
                    }
                    .section-title { 
                        font-family: 'Times New Roman', Times, serif;
                        font-weight: bold; 
                        margin-top: 14pt; 
                        margin-bottom: 6pt; 
                        font-size: 11pt; 
                        text-transform: uppercase; 
                        border-bottom: 1.5pt solid black; 
                        padding-bottom: 2pt; 
                        text-align: left; 
                    }
                    .question-block { 
                        margin-top: 6pt; 
                        margin-bottom: 6pt; 
                        page-break-inside: avoid; 
                    }
                    .question-title { 
                        margin-top: 4pt; 
                        margin-bottom: 2pt; 
                        text-align: justify; 
                        line-height: 1.25; 
                    }
                    .q-label { 
                        font-weight: bold; 
                        font-style: italic; 
                        text-decoration: underline; 
                        margin-right: 4pt; 
                    }
                    .option-item { 
                        margin-top: 1.5pt; 
                        margin-bottom: 1.5pt; 
                        margin-left: 18pt; 
                        text-align: justify; 
                        line-height: 1.25; 
                    }
                    .subq-item { 
                        margin-top: 1.5pt; 
                        margin-bottom: 1.5pt; 
                        margin-left: 18pt; 
                        text-align: justify; 
                        line-height: 1.25; 
                    }
                    .footer { 
                        text-align: center; 
                        margin-top: 30pt; 
                        border-top: 1pt solid black; 
                        padding-top: 10pt; 
                        font-weight: bold; 
                    }
                    table { 
                        border-collapse: collapse; 
                        width: 100%; 
                    }
                    td, th { 
                        vertical-align: top; 
                    }
                </style>
            </head>
            <body>
        `;
        const footer = "</body></html>";
        const sourceHTML = header + content + footer;
        
        const blob = new Blob(['\ufeff', sourceHTML], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${quiz.title.replace(/[/\\?%*:|"<>]/g, '_')}.doc`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="fixed inset-0 bg-slate-900/95 z-[2000] flex items-center justify-center p-0 md:p-4 backdrop-blur-xl animate-fade-in">
            <div className="bg-white rounded-[0] md:rounded-[3.5rem] w-full max-w-5xl h-full md:h-[95vh] flex flex-col overflow-hidden shadow-2xl">
                
                <div className="p-6 bg-slate-900 text-white flex flex-wrap justify-between items-center gap-4 shrink-0 border-b border-slate-800">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-600 rounded-2xl shadow-lg">
                            <FileType size={24}/>
                        </div>
                        <div>
                            <h3 className="text-base md:text-lg font-black uppercase tracking-tight leading-tight line-clamp-1">{quiz.title}</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                                {isAdmin ? 'CHẾ ĐỘ GIÁO VIÊN: ĐÃ HIỆN ĐÁP ÁN' : 'CHẾ ĐỘ HỌC SINH: XEM ĐỀ THI'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Bộ chuyển đổi chế độ dàn hàng phương án */}
                        <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700">
                            <button
                                onClick={() => setLayoutMode('single')}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all flex items-center gap-1.5 ${
                                    layoutMode === 'single'
                                        ? 'bg-blue-600 text-white shadow-md'
                                        : 'text-slate-400 hover:text-white'
                                }`}
                                title="Mỗi đáp án 1 dòng thẳng hàng (Không dùng Table, chuẩn in ấn Word)"
                            >
                                <Rows size={12}/> Mỗi ý 1 dòng
                            </button>
                            <button
                                onClick={() => setLayoutMode('auto')}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all flex items-center gap-1.5 ${
                                    layoutMode === 'auto'
                                        ? 'bg-blue-600 text-white shadow-md'
                                        : 'text-slate-400 hover:text-white'
                                }`}
                                title="Tự động dàn hàng ngang/dọc gọn trang (Không dùng Table)"
                            >
                                <AlignLeft size={12}/> Tự động gọn trang
                            </button>
                        </div>

                        {isAdmin && (
                            <button 
                                onClick={handleExportWord}
                                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-[11px] font-black uppercase hover:bg-emerald-700 transition-all shadow-xl active:scale-95"
                                title="Xuất file Microsoft Word chuẩn định dạng (.doc)"
                            >
                                <Download size={15}/> Xuất Word (.doc)
                            </button>
                        )}
                        <button 
                            onClick={onClose} 
                            className="p-2.5 bg-slate-800 rounded-xl hover:bg-red-600 transition-colors"
                        >
                            <X size={20}/>
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 md:p-12 bg-white custom-scrollbar">
                    <div 
                        id="quiz-export-content" 
                        className="max-w-4xl mx-auto space-y-8 pb-20 bg-white p-4 md:p-8 rounded-lg shadow-sm border border-slate-100" 
                        style={{ 
                            fontFamily: "'Times New Roman', Times, 'Liberation Serif', serif",
                            fontSize: '12pt',
                            textAlign: 'justify', 
                            color: '#000000', 
                            lineHeight: '1.35',
                            letterSpacing: 'normal',
                            wordSpacing: 'normal'
                        }}
                    >
                        {/* Header đề thi */}
                        <div className="mb-6" style={{ textAlign: 'left' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', border: 'none' }}>
                                <tbody>
                                    <tr>
                                        <td style={{ width: '50%', textAlign: 'center', verticalAlign: 'top', padding: '2pt 4pt' }}>
                                            <p style={{ fontWeight: 'bold', margin: '1pt 0', fontSize: '11pt' }}>SỞ GDĐT TP. HỒ CHÍ MINH</p>
                                            <p style={{ fontWeight: 'bold', margin: '1pt 0', fontSize: '11pt' }}>TRƯỜNG THPT NGUYỄN HỮU CẦU</p>
                                        </td>
                                        <td style={{ width: '50%', textAlign: 'center', verticalAlign: 'top', padding: '2pt 4pt' }}>
                                            <p style={{ fontWeight: 'bold', fontSize: '11.5pt', margin: '1pt 0' }}>ĐỀ THI CHÍNH THỨC</p>
                                            <p style={{ fontWeight: 'bold', margin: '1pt 0', fontSize: '11pt' }}>Môn: {quiz.category || 'Vật lý'} - Khối {quiz.grade}</p>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                            <div style={{ border: '1pt solid black', padding: '6pt 10pt', marginTop: '8pt', textAlign: 'left' }}>
                                <p style={{ fontWeight: 'bold', margin: 0, fontSize: '10.5pt' }}>Họ và tên: .......................................................................... SBD: .....................................</p>
                            </div>
                            <h2 style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '14pt', marginTop: '16pt', marginBottom: '8pt', textTransform: 'uppercase' }}>
                                <LatexText text={quiz.title} />
                            </h2>
                        </div>

                        {/* Các phần thi */}
                        {['mcq', 'group-tf', 'short'].map((type) => {
                            const typeQs = quiz.questions.filter(q => q.type === type);
                            if (typeQs.length === 0) return null;
                            
                            return (
                                <div key={type} className="section-block" style={{ marginBottom: '24pt', textAlign: 'justify' }}>
                                    <div 
                                        className="section-title" 
                                        style={{ 
                                            fontWeight: 'bold', 
                                            textTransform: 'uppercase', 
                                            borderBottom: '1.5pt solid black', 
                                            marginBottom: '12pt', 
                                            paddingBottom: '3pt', 
                                            textAlign: 'left', 
                                            fontSize: '11pt' 
                                        }}
                                    >
                                        {type === 'mcq' ? 'PHẦN I. CÂU HỎI TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN LỰA CHỌN' : 
                                         type === 'group-tf' ? 'PHẦN II. CÂU HỎI TRẮC NGHIỆM ĐÚNG SAI' : 
                                         'PHẦN III. CÂU HỎI TRẮC NGHIỆM TRẢ LỜI NGẮN'}
                                    </div>
                                    
                                    <div className="space-y-6">
                                        {typeQs.map((q, idx) => (
                                            <div 
                                                key={q.id} 
                                                className="question-block" 
                                                style={{ 
                                                    marginBottom: '14pt', 
                                                    textAlign: 'justify', 
                                                    pageBreakInside: 'avoid' 
                                                }}
                                            >
                                                {/* Tiêu đề câu và nội dung trên cùng 1 đoạn văn (KHÔNG dùng flex/nested block) */}
                                                <p 
                                                    className="question-title" 
                                                    style={{ 
                                                        margin: '3pt 0 2pt 0', 
                                                        lineHeight: '1.3', 
                                                        textAlign: 'justify' 
                                                    }}
                                                >
                                                    <span 
                                                        className="q-label" 
                                                        style={{ 
                                                            fontWeight: 'bold', 
                                                            fontStyle: 'italic', 
                                                            textDecoration: 'underline', 
                                                            textUnderlineOffset: '3px',
                                                            marginRight: '6px' 
                                                        }}
                                                    >
                                                        Câu {idx + 1}:
                                                    </span>
                                                    <LatexText text={q.text}/>
                                                </p>

                                                {/* Ảnh đính kèm nếu có */}
                                                {q.imageUrl && (
                                                    <div 
                                                        className="q-image-container" 
                                                        style={{ 
                                                            textAlign: 'center', 
                                                            margin: '10pt auto', 
                                                            display: 'block' 
                                                        }}
                                                    >
                                                        <img 
                                                            src={q.imageUrl} 
                                                            alt={`Hình ${idx + 1}`} 
                                                            style={{ 
                                                                maxWidth: '85%', 
                                                                maxHeight: '350px', 
                                                                display: 'block', 
                                                                margin: '0 auto' 
                                                            }} 
                                                        />
                                                    </div>
                                                )}

                                                {/* Phần I - Các phương án trắc nghiệm (Không dùng Table) */}
                                                {q.type === 'mcq' && renderOptionsNoTable(q)}

                                                {/* Phần II - Đúng/Sai 4 ý (Không dùng flex, cùng nằm trong thẻ p có lề thụt đầu dòng) */}
                                                {q.type === 'group-tf' && q.subQuestions && (
                                                    <div className="subq-container" style={{ marginTop: '2pt', marginBottom: '4pt' }}>
                                                        {q.subQuestions.map((sq, si) => (
                                                            <p 
                                                                key={si} 
                                                                className="subq-item" 
                                                                style={{ 
                                                                    margin: '2pt 0 2pt 18pt', 
                                                                    lineHeight: '1.3', 
                                                                    textAlign: 'justify' 
                                                                }}
                                                            >
                                                                <b style={{ marginRight: '6px' }}>{String.fromCharCode(97 + si)})</b>
                                                                <LatexText text={sq.text}/>
                                                            </p>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Phần III - Trả lời ngắn */}
                                                {q.type === 'short' && (
                                                    <p 
                                                        style={{ 
                                                            margin: '3pt 0 4pt 18pt', 
                                                            fontStyle: 'italic', 
                                                            color: '#444', 
                                                            lineHeight: '1.3' 
                                                        }}
                                                    >
                                                        Đáp số: ........................................................................
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}

                        {/* Bảng đáp án cuối đề */}
                        {renderAnswerKey()}

                        <div className="footer" style={{ textAlign: 'center', marginTop: '40pt', borderTop: '1pt solid #ccc', paddingTop: '15pt', fontWeight: 'bold' }}>
                            <p style={{ fontSize: '11pt', margin: '5pt 0' }}>--- HẾT ---</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
