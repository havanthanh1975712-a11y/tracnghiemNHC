
import React, { useState } from 'react';
import { Grade } from '../../types';
import { Sparkles, Database, LayoutTemplate, Loader2, AlertTriangle, PlusCircle, FileUp, Key, Eye, EyeOff, Check } from 'lucide-react';

interface AIRendererProps {
    grade: Grade;
    setGrade: (val: Grade) => void;
    onGenerate: (config: {
        topic: string;
        p1: number;
        p2: number;
        p3: number;
        target: 'editor' | 'bank';
        matrix?: { easy: number; medium: number; hard: number; vhard: number };
        pdfBase64?: string;
    }) => Promise<void>;
    isLoading: boolean;
    hasQuestionsInEditor?: boolean;
    customApiKey?: string;
    onApiKeyChange?: (key: string) => void;
    isSuperAdmin?: boolean;
}

export default function AIRenderer({ grade, setGrade, onGenerate, isLoading, hasQuestionsInEditor, customApiKey = '', onApiKeyChange, isSuperAdmin }: AIRendererProps) {
    const [prompt, setPrompt] = useState('');
    const [p1, setP1] = useState(5);
    const [p2, setP2] = useState(2);
    const [p3, setP3] = useState(2);
    const [matrix, setMatrix] = useState({ easy: 40, medium: 30, hard: 20, vhard: 10 });
    const [target, setTarget] = useState<'editor' | 'bank'>('editor');
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [pdfBase64, setPdfBase64] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [showKey, setShowKey] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.type !== 'application/pdf') {
                setErrorMsg("Chỉ hỗ trợ tệp PDF.");
                return;
            }
            setPdfFile(file);
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = (reader.result as string).split(',')[1];
                setPdfBase64(base64);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleGenerate = async () => {
        setErrorMsg(null);
        try {
            await onGenerate({
                topic: prompt || (pdfFile ? `Dựa theo tài liệu: ${pdfFile.name}` : "Đề thi tổng hợp"),
                p1, p2, p3,
                target,
                matrix,
                pdfBase64: pdfBase64 || undefined
            });
        } catch (err: any) {
            setErrorMsg(err.message || "Đã xảy ra lỗi không xác định.");
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-20">
            <div className="bg-white p-10 rounded-[3rem] border shadow-sm text-center space-y-10">
                <Sparkles size={64} className="mx-auto text-blue-600 drop-shadow-lg"/>
                <div className="space-y-2">
                    <h3 className="text-2xl font-black uppercase text-slate-800 tracking-tight">Soạn đề thông minh</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sử dụng công nghệ AI mạnh mẽ để tạo đề thi chất lượng</p>
                    {hasQuestionsInEditor && target === 'editor' && (
                        <div className="flex items-center justify-center gap-2 text-emerald-600 bg-emerald-50 w-fit mx-auto px-4 py-1.5 rounded-full border border-emerald-100 mt-2">
                            <PlusCircle size={14}/>
                            <span className="text-[10px] font-black uppercase tracking-wider">Đang ở chế độ chèn thêm vào đề hiện có</span>
                        </div>
                    )}
                </div>
                
                {errorMsg && (
                    <div className="bg-red-50 border border-red-200 p-4 rounded-2xl flex items-center gap-3 text-red-700 text-sm font-bold text-left animate-shake">
                        <AlertTriangle className="shrink-0" />
                        <p>{errorMsg}</p>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
                    <div className="space-y-6">
                        <div>
                            <label className="text-[10px] font-black uppercase ml-2 text-slate-400 tracking-widest">1. Khối lớp & Đích đến</label>
                            <div className="grid grid-cols-2 gap-2 mt-2">
                                <select className="bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-black outline-none text-xs" value={grade} onChange={e => setGrade(e.target.value as Grade)}>
                                    <option value="12">Khối 12</option>
                                    <option value="11">Khối 11</option>
                                    <option value="10">Khối 10</option>
                                </select>
                                <div className="flex bg-slate-100 p-1 rounded-2xl border-2 border-slate-100">
                                    <button onClick={() => setTarget('editor')} className={`flex-1 flex items-center justify-center gap-2 rounded-xl text-[9px] font-black uppercase transition-all ${target === 'editor' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}>
                                        <LayoutTemplate size={14}/> Editor
                                    </button>
                                    <button onClick={() => setTarget('bank')} className={`flex-1 flex items-center justify-center gap-2 rounded-xl text-[9px] font-black uppercase transition-all ${target === 'bank' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-400'}`}>
                                        <Database size={14}/> Bank
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase ml-2 text-slate-400 tracking-widest">2. Ma trận kiến thức (%)</label>
                            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100">
                                <div className="space-y-1">
                                    <label className="text-[8px] font-black text-emerald-600 uppercase">Nhận biết</label>
                                    <input type="number" className="w-full bg-white border border-slate-200 p-3 rounded-xl font-bold text-xs" value={matrix.easy} onChange={e => setMatrix({...matrix, easy: parseInt(e.target.value) || 0})} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[8px] font-black text-blue-600 uppercase">Thông hiểu</label>
                                    <input type="number" className="w-full bg-white border border-slate-200 p-3 rounded-xl font-bold text-xs" value={matrix.medium} onChange={e => setMatrix({...matrix, medium: parseInt(e.target.value) || 0})} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[8px] font-black text-orange-600 uppercase">Vận dụng</label>
                                    <input type="number" className="w-full bg-white border border-slate-200 p-3 rounded-xl font-bold text-xs" value={matrix.hard} onChange={e => setMatrix({...matrix, hard: parseInt(e.target.value) || 0})} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[8px] font-black text-red-600 uppercase">Vận dụng cao</label>
                                    <input type="number" className="w-full bg-white border border-slate-200 p-3 rounded-xl font-bold text-xs" value={matrix.vhard} onChange={e => setMatrix({...matrix, vhard: parseInt(e.target.value) || 0})} />
                                </div>
                            </div>
                            <p className="text-[8px] text-slate-400 italic px-2">Lưu ý: Tổng các phần trăm nên là 100% để đề thi cân đối.</p>
                        </div>
                    </div>
                    
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase ml-2 text-slate-400 tracking-widest">3. Cấu trúc đề (Số câu)</label>
                            <div className="flex gap-4 bg-white p-6 rounded-[2rem] border-2 border-slate-100 shadow-inner">
                                <div className="flex-1 text-center border-r border-slate-100">
                                    <label className="text-[8px] font-black uppercase text-blue-500">P.I (TN)</label>
                                    <input type="number" className="w-full text-center bg-transparent font-black text-lg outline-none" value={p1} onChange={e => setP1(parseInt(e.target.value))} />
                                </div>
                                <div className="flex-1 text-center border-r border-slate-100">
                                    <label className="text-[8px] font-black uppercase text-purple-500">P.II (D/S)</label>
                                    <input type="number" className="w-full text-center bg-transparent font-black text-lg outline-none" value={p2} onChange={e => setP2(parseInt(e.target.value))} />
                                </div>
                                <div className="flex-1 text-center">
                                    <label className="text-[8px] font-black uppercase text-orange-500">P.III (NGẮN)</label>
                                    <input type="number" className="w-full text-center bg-transparent font-black text-lg outline-none" value={p3} onChange={e => setP3(parseInt(e.target.value))} />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase ml-2 text-slate-400 tracking-widest">4. Tài liệu nguồn (Tùy chọn PDF)</label>
                            <div className={`relative border-2 border-dashed rounded-[2rem] p-6 transition-all ${pdfFile ? 'border-blue-500 bg-blue-50/30' : 'border-slate-200 hover:border-blue-400'}`}>
                                <input type="file" accept="application/pdf" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFileChange} />
                                <div className="flex flex-col items-center gap-2">
                                    <FileUp className={pdfFile ? 'text-blue-600' : 'text-slate-300'} size={32}/>
                                    <p className="text-[10px] font-black uppercase text-slate-600">
                                        {pdfFile ? pdfFile.name : 'Nhấn hoặc kéo PDF vào đây'}
                                    </p>
                                    {pdfFile && <button onClick={(e) => { e.preventDefault(); setPdfFile(null); setPdfBase64(null); }} className="text-[8px] font-black text-red-500 uppercase mt-1">Xóa file</button>}
                                </div>
                            </div>
                            <p className="text-[8px] text-slate-400 italic px-2">Nếu có file, AI sẽ chỉ trích xuất các ý tưởng, kiến thức từ file này.</p>
                        </div>
                    </div>
                </div>

                <div className="text-left space-y-1">
                    <label className="text-[10px] font-black uppercase ml-2 text-slate-400 tracking-widest">5. Chủ đề & Ghi chú thêm</label>
                    <textarea 
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] p-8 font-bold min-h-[120px] text-sm outline-none focus:border-blue-400 transition-all focus:bg-white" 
                        value={prompt} 
                        onChange={e => setPrompt(e.target.value)} 
                        placeholder="Ví dụ: Đạo hàm và các bài toán cực trị..." 
                    />
                </div>

                {/* API KEY CONFIGURATION BOX */}
                {onApiKeyChange && (
                    <div className="bg-slate-50/80 p-5 rounded-[2rem] border-2 border-slate-100 text-left space-y-2.5">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                                <Key size={14} className={customApiKey ? 'text-emerald-600' : 'text-blue-600'}/>
                                <span>Gemini API Key riêng {isSuperAdmin ? '(Mặc định dùng Key hệ thống, nhập để ghi đè)' : '(Khuyến nghị nhập để đảm bảo không gián đoạn)'}</span>
                            </label>
                            {customApiKey && (
                                <span className="text-[9px] font-black uppercase text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                                    <Check size={10}/> Đang dùng Key riêng
                                </span>
                            )}
                        </div>
                        <div className="relative flex items-center">
                            <input 
                                type={showKey ? "text" : "password"} 
                                className="w-full bg-white border-2 border-slate-200 rounded-xl px-4 py-2.5 pr-20 text-xs font-mono font-medium outline-none focus:border-blue-500 transition-all" 
                                placeholder={isSuperAdmin ? "Mặc định sử dụng API Key hệ thống (nhập key để dùng key riêng)..." : "Nhập Gemini API Key của bạn (AI Studio Key)..."} 
                                value={customApiKey} 
                                onChange={e => onApiKeyChange(e.target.value)} 
                            />
                            <div className="absolute right-2 flex items-center gap-1">
                                {customApiKey && (
                                    <button 
                                        type="button" 
                                        onClick={() => onApiKeyChange('')} 
                                        className="text-[9px] font-bold text-red-500 hover:bg-red-50 px-1.5 py-1 rounded transition-colors"
                                        title="Xóa Key"
                                    >
                                        Xóa
                                    </button>
                                )}
                                <button 
                                    type="button" 
                                    onClick={() => setShowKey(!showKey)} 
                                    className="p-1.5 text-slate-400 hover:text-slate-700 transition-colors"
                                    title={showKey ? "Ẩn Key" : "Hiện Key"}
                                >
                                    {showKey ? <EyeOff size={14}/> : <Eye size={14}/>}
                                </button>
                            </div>
                        </div>
                        <p className="text-[9px] font-bold text-slate-400">
                            Key được lưu trực tiếp trên trình duyệt của bạn và không bị ghi đè lẫn nhau giữa các tài khoản giáo viên.
                        </p>
                    </div>
                )}

                <button 
                    onClick={handleGenerate} 
                    disabled={isLoading || (!prompt && !pdfFile)} 
                    className={`w-full py-6 rounded-[2.5rem] font-black shadow-2xl flex items-center justify-center gap-4 disabled:opacity-50 transition-all active:scale-[0.98] ${target === 'bank' ? 'bg-purple-600 hover:bg-black' : 'bg-blue-600 hover:bg-black'} text-white text-sm uppercase tracking-widest`}
                >
                    {isLoading ? <Loader2 className="animate-spin" size={28}/> : <Sparkles size={28}/>} 
                    {isLoading ? 'Hệ thống đang xử lý...' : (
                        target === 'bank' ? 'Soạn & Lưu vào ngân hàng' : 
                        (hasQuestionsInEditor ? 'Soạn & Chèn thêm vào đề' : 'Bắt đầu soạn đề thông minh')
                    )}
                </button>
            </div>
        </div>
    );
}
