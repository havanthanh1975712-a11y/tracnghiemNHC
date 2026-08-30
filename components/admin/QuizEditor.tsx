
import React, { useState, useMemo, useRef } from 'react';
import { Quiz, Question, Grade, QuestionType, Chapter, QuizType, ClassRoom } from '../../types';
import { 
  Save, FileUp, Database, CheckCircle2, HelpCircle, AlignLeft, Trash2, 
  Target as TargetIcon, Plus, ImageIcon, Loader2, Lightbulb, Eye, ImageMinus, 
  ShieldAlert, ShieldCheck, Sparkles, Zap, Type as TypeIcon, X, Link as LinkIcon, 
  EyeOff, FileCode, GraduationCap, CheckSquare, Square, Users, Copy, Images, Check, Layers, ArrowRight,
  Key, BookOpen, ClipboardPaste, PauseCircle
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import LatexText from '../LatexText';
import LatexEditorModal from './LatexEditorModal';
import { parseQuestionsFromJSON } from '../../services/gemini';
import { STANDARD_SUBJECTS, isSameSubject } from '../../services/subjectUtils';
import { getAcademicYearOptions, getCurrentAcademicYear } from '../../services/academicUtils';

interface QuizEditorProps {
    editingId: string | null;
    title: string;
    setTitle: (val: string) => void;
    grade: Grade;
    setGrade: (val: Grade) => void;
    subject?: string;
    setSubject?: (val: string) => void;
    academicYear?: string;
    setAcademicYear?: (val: string) => void;
    maxAttempts?: number;
    setMaxAttempts?: (val: number) => void;
    quizType: QuizType;
    setQuizType: (val: QuizType) => void;
    isPublished: boolean;
    setIsPublished: (val: boolean) => void;
    isMonitored?: boolean;
    setIsMonitored: (val: boolean) => void;
    showResultAnswers?: boolean;
    setShowResultAnswers?: (val: boolean) => void;
    disablePractice?: boolean;
    setDisablePractice?: (val: boolean) => void;
    isUnlisted?: boolean;
    setIsUnlisted: (val: boolean) => void;
    isSharedWithTeachers?: boolean;
    setIsSharedWithTeachers?: (val: boolean) => void;
    duration: number;
    setDuration: (val: number) => void;
    category: string;
    setCategory: (val: string) => void;
    startTime: string;
    setStartTime: (val: string) => void;
    endTime: string;
    setEndTime: (val: string) => void;
    questions: Question[];
    setQuestions: (val: Question[]) => void;
    chapters: Chapter[];
    classes?: ClassRoom[];
    targetType?: 'all' | 'classes';
    setTargetType?: (val: 'all' | 'classes') => void;
    assignedClassIds?: string[];
    setAssignedClassIds?: (val: string[]) => void;
    onSave: () => void;
    onCleanLabels: () => void;
    onOpenBank: (type: QuestionType) => void;
    orderIndex: number;
    setOrderIndex: (val: number) => void;
    onPdfExtract: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onTextExtract: (text: string) => void;
    onUploadImage: (qId: string, file: File) => void;
    uploadingId: string | null;
    isAiLoading?: boolean;
    isSuperAdmin?: boolean;
    customApiKey?: string;
    onApiKeyChange?: (key: string) => void;
}

const safeParseScore = (val: any): number => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    try {
        const num = parseFloat(String(val).replace(',', '.'));
        return isNaN(num) ? 0 : num;
    } catch { return 0; }
};

interface QuestionSectionProps {
    sectionTitle: string;
    type: QuestionType;
    questions: Question[];
    setQuestions: (qs: Question[]) => void;
    onUploadImage: (qId: string, file: File) => void;
    uploadingId: string | null;
    onOpenBank: (type: QuestionType) => void;
}

const QuestionSection: React.FC<QuestionSectionProps> = ({ sectionTitle, type, questions, setQuestions, onUploadImage, uploadingId, onOpenBank }) => {
    const [quickPoints, setQuickPoints] = useState(type === 'mcq' ? "0.25" : "1.0");
    const [galleryTargetQId, setGalleryTargetQId] = useState<string | null>(null);
    const [batchImageSrc, setBatchImageSrc] = useState<string | null>(null);
    const [batchSelectedQIds, setBatchSelectedQIds] = useState<string[]>([]);
    const [batchFilterType, setBatchFilterType] = useState<QuestionType | 'all'>('all');

    // Quản lý Modal soạn thảo công thức LaTeX
    const [latexModalConfig, setLatexModalConfig] = useState<{
        isOpen: boolean;
        questionId: string;
        field: 'text' | 'solution';
        questionNumber: number;
        initialCode: string;
        cursorStart: number;
        cursorEnd: number;
    }>({
        isOpen: false,
        questionId: '',
        field: 'text',
        questionNumber: 1,
        initialCode: '$\\dfrac{a}{b}$',
        cursorStart: 0,
        cursorEnd: 0
    });

    const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

    const handleOpenLatexModal = (qId: string, field: 'text' | 'solution', qNum: number) => {
        const key = `${qId}-${field}`;
        const textarea = textareaRefs.current[key];
        let start = 0;
        let end = 0;
        let selectedText = '';
        if (textarea) {
            start = textarea.selectionStart || 0;
            end = textarea.selectionEnd || 0;
            selectedText = textarea.value.substring(start, end);
        }
        const initialCode = selectedText.trim() 
            ? (selectedText.includes('$') ? selectedText : `$${selectedText}$`)
            : '$\\dfrac{a}{b}$';
        
        setLatexModalConfig({
            isOpen: true,
            questionId: qId,
            field,
            questionNumber: qNum,
            initialCode,
            cursorStart: start,
            cursorEnd: end
        });
    };

    const handleInsertLatex = (code: string) => {
        const { questionId, field, cursorStart, cursorEnd } = latexModalConfig;
        const qIndex = questions.findIndex(q => q.id === questionId);
        if (qIndex === -1) return;
        
        const nl = [...questions];
        const q = { ...nl[qIndex] };
        const currentVal = (field === 'text' ? q.text : q.solution) || '';
        const newVal = currentVal.substring(0, cursorStart) + code + currentVal.substring(cursorEnd);
        
        if (field === 'text') {
            q.text = newVal;
        } else {
            q.solution = newVal;
        }
        nl[qIndex] = q;
        setQuestions(nl);

        // Đặt lại tiêu điểm và vị trí con trỏ sau khi chèn
        setTimeout(() => {
            const key = `${questionId}-${field}`;
            const textarea = textareaRefs.current[key];
            if (textarea) {
                textarea.focus();
                const newPos = cursorStart + code.length;
                textarea.setSelectionRange(newPos, newPos);
            }
        }, 50);
    };

    const sectionQuestions = questions.filter(q => q.type === type);
    const Icon = type === 'mcq' ? CheckCircle2 : type === 'group-tf' ? HelpCircle : AlignLeft;

    // Danh sách tất cả ảnh độc nhất đã có trong toàn bộ đề thi này
    const uniqueQuizImages = useMemo(() => {
        const set = new Set<string>();
        questions.forEach(q => {
            if (q.imageUrl && q.imageUrl.trim()) {
                set.add(q.imageUrl.trim());
            }
        });
        return Array.from(set);
    }, [questions]);

    const handleSetAllPoints = () => {
        const val = quickPoints.replace(',', '.');
        const newList = questions.map(q => q.type === type ? { ...q, points: val } : q);
        setQuestions(newList);
        alert(`Đã cập nhật ${val} điểm cho tất cả câu ở ${sectionTitle}`);
    };

    const addManual = () => {
        const newQ: Question = {
            id: uuidv4(), type, text: '', points: quickPoints,
            options: type === 'mcq' ? ['', '', '', ''] : undefined,
            correctAnswer: '', solution: '',
            subQuestions: type === 'group-tf' ? [
                { id: uuidv4(), text: '', correctAnswer: 'True' },
                { id: uuidv4(), text: '', correctAnswer: 'True' },
                { id: uuidv4(), text: '', correctAnswer: 'True' },
                { id: uuidv4(), text: '', correctAnswer: 'True' }
            ] : undefined
        };
        setQuestions([...questions, newQ]);
    };

    const handleRemoveImage = (qId: string) => {
        const nl = questions.map(x => x.id === qId ? { ...x, imageUrl: undefined } : x);
        setQuestions(nl);
    };

    const handlePasteImageFromClipboard = async (qId: string) => {
        try {
            if (navigator.clipboard && navigator.clipboard.read) {
                const items = await navigator.clipboard.read();
                let foundImage = false;
                for (const item of items) {
                    const imageType = item.types.find(t => t.startsWith('image/'));
                    if (imageType) {
                        const blob = await item.getType(imageType);
                        const ext = imageType.split('/')[1] || 'png';
                        const file = new File([blob], `screenshot-${Date.now()}.${ext}`, { type: imageType });
                        onUploadImage(qId, file);
                        foundImage = true;
                        break;
                    }
                }
                if (!foundImage) {
                    alert("⚠️ Không tìm thấy hình ảnh nào trong Clipboard!\n\n💡 Cách dùng: Bạn hãy dùng phím tắt Win + Shift + S (Windows) hoặc Cmd + Shift + 4 (Mac) để cắt ảnh đề bài, sau đó quay lại đây bấm 'Dán ảnh (Ctrl+V)' hoặc bấm Ctrl+V!");
                }
            } else {
                alert("💡 Trình duyệt của bạn yêu cầu nhấn trực tiếp phím Ctrl + V (hoặc Cmd + V) trên bàn phím khi đang ở câu hỏi này để dán ảnh tức thì!");
            }
        } catch (err: any) {
            console.warn("Clipboard read error:", err);
            alert("💡 Để dán ảnh trực tiếp từ bộ nhớ tạm:\nBạn hãy nhấp chuột vào khung câu hỏi này và bấm tổ hợp phím Ctrl + V (hoặc Cmd + V trên Mac)!");
        }
    };

    const handleQuestionCardPaste = (e: React.ClipboardEvent, qId: string) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.indexOf('image') !== -1 || item.kind === 'file') {
                const file = item.getAsFile();
                if (file) {
                    e.preventDefault();
                    onUploadImage(qId, file);
                    break;
                }
            }
        }
    };

    const handleApplyImageToQuestion = (targetQId: string, imageSrc: string) => {
        const nl = questions.map(x => x.id === targetQId ? { ...x, imageUrl: imageSrc } : x);
        setQuestions(nl);
        setGalleryTargetQId(null);
    };

    const handleOpenBatchModal = (imageSrc: string) => {
        setBatchImageSrc(imageSrc);
        // Mặc định chọn các câu chưa có ảnh hoặc chọn câu hiện tại
        setBatchSelectedQIds([]);
    };

    const handleExecuteBatchApply = () => {
        if (!batchImageSrc || batchSelectedQIds.length === 0) return;
        const selectedSet = new Set(batchSelectedQIds);
        const nl = questions.map(x => selectedSet.has(x.id) ? { ...x, imageUrl: batchImageSrc } : x);
        setQuestions(nl);
        const count = batchSelectedQIds.length;
        setBatchImageSrc(null);
        setBatchSelectedQIds([]);
        alert(`🎉 Đã áp dụng hình ảnh thành công cho ${count} câu hỏi đã chọn!`);
    };

    const stripLabel = (text: string): string => {
        if (!text) return "";
        let cleaned = text.trim();
        const labelRegex = /^(\*?[A-Za-z0-9][\.\)\/\-:\s]\s*)/g;
        while (labelRegex.test(cleaned)) {
            cleaned = cleaned.replace(labelRegex, "").trim();
        }
        return cleaned;
    };

    const isCorrectMCQ = (q: Question, opt: string) => {
        if (!q.correctAnswer || !opt) return false;
        return stripLabel(q.correctAnswer) === stripLabel(opt);
    };

    // Helper: Tìm các câu đang dùng 1 ảnh cụ thể
    const getQuestionsUsingImage = (imgSrc: string) => {
        return questions
            .map((q, i) => ({ q, index: i + 1 }))
            .filter(item => item.q.imageUrl === imgSrc);
    };

    return (
        <div className="space-y-6 mt-10">
            {/* MODAL KHO ẢNH CỦA ĐỀ THI */}
            {galleryTargetQId && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[2500] flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white w-full max-w-4xl rounded-[3rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border-4 border-slate-100">
                        <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-blue-600 rounded-xl text-white">
                                    <Images size={20}/>
                                </div>
                                <div>
                                    <h3 className="text-base font-black uppercase tracking-tight">Kho ảnh đã tải trong đề thi</h3>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                        Chọn 1 ảnh để gán cho câu hỏi đang chọn (Không cần tải lại từ máy tính)
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => setGalleryTargetQId(null)} className="p-2.5 hover:bg-red-600 rounded-xl transition-colors">
                                <X size={20}/>
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-6">
                            {uniqueQuizImages.length === 0 ? (
                                <div className="py-16 text-center text-slate-400 space-y-3">
                                    <ImageIcon size={48} className="mx-auto text-slate-300"/>
                                    <p className="text-sm font-bold">Chưa có hình ảnh nào được tải lên trong đề thi này.</p>
                                    <p className="text-xs text-slate-400">Hãy tải ảnh ở bất kỳ câu nào, ảnh sẽ tự động lưu vào kho để dùng lại nhiều lần.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                                    {uniqueQuizImages.map((imgSrc, imgIdx) => {
                                        const usingQs = getQuestionsUsingImage(imgSrc);
                                        const isCurrentQUsing = questions.find(q => q.id === galleryTargetQId)?.imageUrl === imgSrc;

                                        return (
                                            <div 
                                                key={imgIdx} 
                                                className={`bg-slate-50 rounded-[2rem] border-2 p-4 flex flex-col justify-between gap-4 transition-all hover:shadow-md ${isCurrentQUsing ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200'}`}
                                            >
                                                <div className="bg-white rounded-2xl p-2 border border-slate-100 flex items-center justify-center min-h-[140px] max-h-[180px] overflow-hidden">
                                                    <img src={imgSrc} alt={`Ảnh ${imgIdx + 1}`} className="max-h-[160px] object-contain rounded-xl" />
                                                </div>

                                                <div className="space-y-2">
                                                    <div className="text-[10px] text-slate-500 font-bold">
                                                        <span className="text-slate-400 uppercase font-black block">Đang dùng ở:</span>
                                                        <div className="flex flex-wrap gap-1 mt-1 max-h-12 overflow-y-auto">
                                                            {usingQs.map(item => (
                                                                <span key={item.q.id} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md font-black text-[9px]">
                                                                    Câu {item.index}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div className="flex gap-2 pt-2 border-t border-slate-200">
                                                        <button 
                                                            onClick={() => handleApplyImageToQuestion(galleryTargetQId, imgSrc)}
                                                            className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-1.5 transition-all shadow-sm ${isCurrentQUsing ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white hover:bg-black'}`}
                                                        >
                                                            {isCurrentQUsing ? <Check size={14}/> : <ArrowRight size={14}/>}
                                                            {isCurrentQUsing ? 'ĐANG DÙNG' : 'CHỌN ẢNH NÀY'}
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setGalleryTargetQId(null);
                                                                handleOpenBatchModal(imgSrc);
                                                            }}
                                                            title="Sao chép ảnh này cho nhiều câu khác"
                                                            className="p-2.5 bg-slate-200 text-slate-700 hover:bg-slate-300 rounded-xl transition-all"
                                                        >
                                                            <Layers size={14}/>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
                            <button 
                                onClick={() => setGalleryTargetQId(null)}
                                className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase hover:bg-black transition-all"
                            >
                                Đóng lại
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL ÁP DỤNG 1 ẢNH CHO NHIỀU CÂU HỎI (BATCH APPLY) */}
            {batchImageSrc && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[2600] flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white w-full max-w-4xl rounded-[3rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border-4 border-slate-100">
                        <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-purple-600 rounded-xl text-white">
                                    <Layers size={20}/>
                                </div>
                                <div>
                                    <h3 className="text-base font-black uppercase tracking-tight">Sao chép ảnh cho nhiều câu hỏi</h3>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                        Chọn các câu hỏi cần dùng chung hình ảnh này
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => setBatchImageSrc(null)} className="p-2.5 hover:bg-red-600 rounded-xl transition-colors">
                                <X size={20}/>
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-6">
                            {/* Xem trước ảnh đang chọn */}
                            <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-200 flex items-center gap-4">
                                <img src={batchImageSrc} alt="Preview" className="w-24 h-24 object-contain bg-white rounded-xl border border-slate-200 p-1" />
                                <div className="space-y-1">
                                    <h4 className="text-xs font-black text-slate-800 uppercase">Hình ảnh đang áp dụng</h4>
                                    <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                                        Ảnh này sẽ được gán làm hình minh họa cho tất cả các câu hỏi được tích chọn bên dưới.
                                    </p>
                                    <p className="text-[10px] font-black text-purple-600 uppercase">
                                        Đã chọn {batchSelectedQIds.length} / {questions.length} câu hỏi
                                    </p>
                                </div>
                            </div>

                            {/* Bộ lọc phần & nút chọn nhanh */}
                            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-100/70 p-3 rounded-2xl border border-slate-200">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-black text-slate-500 uppercase mr-1">Lọc:</span>
                                    {[
                                        { id: 'all', label: 'Tất cả' },
                                        { id: 'mcq', label: 'Phần I (TN)' },
                                        { id: 'group-tf', label: 'Phần II (Đ/S)' },
                                        { id: 'short', label: 'Phần III (Ngắn)' }
                                    ].map(f => (
                                        <button
                                            key={f.id}
                                            type="button"
                                            onClick={() => setBatchFilterType(f.id as any)}
                                            className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase transition-all ${batchFilterType === f.id ? 'bg-slate-900 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-200'}`}
                                        >
                                            {f.label}
                                        </button>
                                    ))}
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const filtered = questions.filter(q => batchFilterType === 'all' || q.type === batchFilterType);
                                            setBatchSelectedQIds(filtered.map(q => q.id));
                                        }}
                                        className="px-3 py-1.5 bg-white text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-xl text-[10px] font-black uppercase transition-all"
                                    >
                                        Chọn tất cả ({batchFilterType === 'all' ? questions.length : questions.filter(q => q.type === batchFilterType).length})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const noImg = questions.filter(q => !q.imageUrl && (batchFilterType === 'all' || q.type === batchFilterType));
                                            setBatchSelectedQIds(noImg.map(q => q.id));
                                        }}
                                        className="px-3 py-1.5 bg-white text-purple-600 hover:bg-purple-50 border border-purple-200 rounded-xl text-[10px] font-black uppercase transition-all"
                                    >
                                        Chỉ câu chưa có ảnh
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setBatchSelectedQIds([])}
                                        className="px-3 py-1.5 bg-white text-slate-500 hover:bg-slate-200 border border-slate-200 rounded-xl text-[10px] font-black uppercase transition-all"
                                    >
                                        Bỏ chọn
                                    </button>
                                </div>
                            </div>

                            {/* Danh sách câu hỏi có checkbox */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[360px] overflow-y-auto pr-1">
                                {questions
                                    .filter(q => batchFilterType === 'all' || q.type === batchFilterType)
                                    .map((q) => {
                                        const globalIndex = questions.findIndex(item => item.id === q.id) + 1;
                                        const isChecked = batchSelectedQIds.includes(q.id);
                                        const hasSameImg = q.imageUrl === batchImageSrc;
                                        const typeBadge = q.type === 'mcq' ? 'Phần I' : q.type === 'group-tf' ? 'Phần II' : 'Phần III';

                                        return (
                                            <div
                                                key={q.id}
                                                onClick={() => {
                                                    if (isChecked) {
                                                        setBatchSelectedQIds(batchSelectedQIds.filter(id => id !== q.id));
                                                    } else {
                                                        setBatchSelectedQIds([...batchSelectedQIds, q.id]);
                                                    }
                                                }}
                                                className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all flex items-start gap-3 select-none ${isChecked ? 'bg-purple-50/70 border-purple-500 shadow-sm' : 'bg-slate-50 border-slate-200 hover:border-slate-300'}`}
                                            >
                                                <div className="mt-0.5 shrink-0 text-purple-600">
                                                    {isChecked ? <CheckSquare size={18} /> : <Square size={18} className="text-slate-400" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-[10px] font-black px-2 py-0.5 rounded-md uppercase bg-slate-900 text-white">
                                                            Câu {globalIndex}
                                                        </span>
                                                        <span className="text-[9px] font-bold text-slate-500 uppercase">
                                                            {typeBadge}
                                                        </span>
                                                        {hasSameImg && (
                                                            <span className="text-[8px] font-black uppercase text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded ml-auto">
                                                                Đang dùng ảnh này
                                                            </span>
                                                        )}
                                                        {q.imageUrl && !hasSameImg && (
                                                            <span className="text-[8px] font-black uppercase text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded ml-auto">
                                                                Đang dùng ảnh khác
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs font-bold text-slate-700 line-clamp-2 leading-relaxed">
                                                        {q.text || <i className="text-slate-400 font-normal">Nội dung câu hỏi trống...</i>}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>

                        <div className="p-5 bg-slate-50 border-t border-slate-200 flex justify-between items-center shrink-0">
                            <span className="text-xs font-black text-slate-600">
                                Đã chọn: <b className="text-purple-600">{batchSelectedQIds.length}</b> câu hỏi
                            </span>
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setBatchImageSrc(null)}
                                    className="px-5 py-3 bg-slate-200 text-slate-600 rounded-2xl text-xs font-black uppercase hover:bg-slate-300 transition-all"
                                >
                                    Hủy bỏ
                                </button>
                                <button
                                    type="button"
                                    onClick={handleExecuteBatchApply}
                                    disabled={batchSelectedQIds.length === 0}
                                    className="px-8 py-3 bg-purple-600 text-white rounded-2xl text-xs font-black uppercase hover:bg-purple-700 transition-all shadow-lg active:scale-95 disabled:opacity-40"
                                >
                                    Gán ảnh cho {batchSelectedQIds.length} câu đã chọn
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col md:flex-row md:items-center justify-between bg-white p-6 rounded-[2rem] border-2 border-slate-100 shadow-sm gap-4">
                <div className="flex items-center gap-4">
                    <div className={`p-4 rounded-2xl ${type === 'mcq' ? 'bg-blue-600 text-white' : type === 'group-tf' ? 'bg-purple-600 text-white' : 'bg-orange-600 text-white shadow-lg'}`}>
                        <Icon size={24}/>
                    </div>
                    <div>
                        <h3 className="font-black text-slate-800 uppercase tracking-tight text-lg">{sectionTitle}</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{sectionQuestions.length} câu đã soạn</p>
                    </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 bg-slate-50 border-2 border-slate-200 px-4 py-2 rounded-2xl">
                        <span className="text-[10px] font-black text-slate-400 uppercase">Sét điểm nhanh:</span>
                        <input 
                            type="text" 
                            className="w-12 bg-white border border-slate-200 rounded-lg text-center font-black text-blue-600 outline-none text-xs p-1" 
                            value={quickPoints} 
                            onChange={e => setQuickPoints(e.target.value)} 
                        />
                        <button onClick={handleSetAllPoints} className="p-2 bg-blue-600 text-white rounded-xl hover:bg-black transition-all shadow-md active:scale-90" title="Gán điểm cho toàn bộ phần này">
                            <Zap size={14}/>
                        </button>
                    </div>
                    <button onClick={() => onOpenBank(type)} className="flex items-center gap-2 px-4 py-2.5 bg-white border-2 border-slate-200 text-slate-600 rounded-2xl text-[10px] font-black uppercase hover:bg-slate-50 transition-colors"><Database size={14}/> Ngân hàng</button>
                    <button onClick={addManual} className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-black transition-all shadow-xl active:scale-95"><Plus size={14}/> Thêm câu mới</button>
                </div>
            </div>

            {sectionQuestions.map((q, idx) => {
                // Vị trí toàn cục trong toàn bộ đề
                const globalIndex = questions.findIndex(item => item.id === q.id);
                // Tìm câu hỏi trước đó có ảnh gần nhất
                const prevQuestionWithImg = globalIndex > 0 
                    ? questions.slice(0, globalIndex).reverse().find(item => !!item.imageUrl && item.imageUrl.trim() !== '')
                    : null;
                const prevImgIndex = prevQuestionWithImg 
                    ? questions.findIndex(item => item.id === prevQuestionWithImg.id) + 1 
                    : null;

                return (
                <div 
                    key={q.id} 
                    onPaste={(e) => handleQuestionCardPaste(e, q.id)}
                    className="bg-white p-8 rounded-[3rem] border-2 border-slate-50 shadow-sm relative group animate-fade-in-up transition-all hover:border-blue-100"
                >
                    <button onClick={() => setQuestions(questions.filter(qu => qu.id !== q.id))} className="absolute top-8 right-8 text-slate-200 hover:text-red-500 transition-colors p-2 hover:bg-red-50 rounded-xl"><Trash2 size={24}/></button>
                    
                    <div className="flex flex-wrap items-center gap-4 mb-6">
                        <span className="text-[11px] font-black px-5 py-2 rounded-xl uppercase bg-slate-900 text-white">Câu {idx + 1} (Toàn đề: Câu {globalIndex + 1})</span>
                        
                        {/* MỨC ĐỘ NHẬN THỨC CÂU HỎI */}
                        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl border border-slate-200">
                            <span className="text-[9px] font-black text-slate-400 uppercase px-2">Mức độ:</span>
                            {(['B', 'H', 'VD', 'VDC'] as const).map(lvl => {
                                const isSelected = q.level === lvl;
                                const colors = {
                                    B: isSelected ? 'bg-emerald-600 text-white shadow-md' : 'text-emerald-700 hover:bg-emerald-50',
                                    H: isSelected ? 'bg-blue-600 text-white shadow-md' : 'text-blue-700 hover:bg-blue-50',
                                    VD: isSelected ? 'bg-amber-600 text-white shadow-md' : 'text-amber-700 hover:bg-amber-50',
                                    VDC: isSelected ? 'bg-red-600 text-white shadow-md' : 'text-red-700 hover:bg-red-50'
                                };
                                const labels = { B: 'Biết', H: 'Hiểu', VD: 'V.Dụng', VDC: 'VDC' };
                                return (
                                    <button
                                        key={lvl}
                                        type="button"
                                        onClick={() => {
                                            const nl = [...questions];
                                            const i = nl.findIndex(x => x.id === q.id);
                                            nl[i].level = isSelected ? undefined : lvl;
                                            setQuestions(nl);
                                        }}
                                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all ${colors[lvl]}`}
                                    >
                                        [{lvl}] {labels[lvl]}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="flex items-center gap-2 bg-blue-50 px-4 py-2 rounded-2xl border-2 border-blue-100 ml-auto">
                            <TargetIcon size={14} className="text-blue-500" />
                            <input type="text" className="bg-transparent text-sm font-black text-blue-700 outline-none w-14 text-center" value={q.points} onChange={e => { const nl = [...questions]; const i = nl.findIndex(x => x.id === q.id); nl[i].points = e.target.value; setQuestions(nl); }} />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between ml-2 mr-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase">NỘI DUNG ĐỀ (LATEX: $...$)</label>
                                <button
                                    type="button"
                                    onClick={() => handleOpenLatexModal(q.id, 'text', globalIndex + 1)}
                                    className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-xl text-[10px] font-black uppercase transition-all shadow-sm border border-blue-200 active:scale-95"
                                    title="Mở bảng hỗ trợ soạn thảo công thức LaTeX trực quan"
                                >
                                    <Sparkles size={13} className="text-amber-500 animate-pulse"/> HỖ TRỢ LATEX
                                </button>
                            </div>
                            <textarea 
                                ref={el => { textareaRefs.current[`${q.id}-text`] = el; }}
                                className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-[2rem] text-sm font-bold outline-none min-h-[120px] focus:border-blue-300 transition-colors" 
                                value={q.text} 
                                onChange={e => { const nl = [...questions]; const i = nl.findIndex(x => x.id === q.id); nl[i].text = e.target.value; setQuestions(nl); }} 
                                placeholder="VD: Tìm $x$ biết $x^2 = 4$..." 
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-blue-500 uppercase ml-2">XEM TRƯỚC HIỂN THỊ</label>
                            <div className="w-full p-6 bg-blue-50/20 rounded-[2rem] border-2 border-blue-100/50 min-h-[120px] text-sm overflow-auto"><LatexText text={q.text || '*Đề trống*'} /></div>
                        </div>
                    </div>

                    {/* KHUNG QUẢN LÝ HÌNH ẢNH MINH HỌA VỚI TÍNH NĂNG TÁI SỬ DỤNG & DÁN TRỰC TIẾP CLIPBOARD */}
                    <div 
                        onDragOver={(e) => { e.preventDefault(); }}
                        onDrop={(e) => {
                            e.preventDefault();
                            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                                onUploadImage(q.id, e.dataTransfer.files[0]);
                            }
                        }}
                        className="mb-8 p-6 bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200 hover:border-blue-300 transition-colors flex flex-col md:flex-row items-center gap-8"
                    >
                        <div 
                            className="shrink-0 relative cursor-pointer group/img"
                            title="Kéo thả ảnh hoặc dán ảnh vào đây"
                            onClick={() => {
                                const fileInput = document.getElementById(`img-${q.id}`);
                                if (fileInput) fileInput.click();
                            }}
                        >
                            {q.imageUrl ? (
                                <div className="relative">
                                    <img src={q.imageUrl} className="w-32 h-32 object-cover rounded-[1.5rem] border-4 border-white shadow-lg bg-white group-hover/img:opacity-90 transition-opacity" alt="q" />
                                    <div className="absolute inset-0 rounded-[1.5rem] bg-black/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center text-white text-[10px] font-black uppercase transition-opacity">
                                        Đổi ảnh
                                    </div>
                                </div>
                            ) : (
                                <div className="w-32 h-32 bg-white border-2 border-dashed border-slate-200 hover:border-blue-400 group-hover/img:bg-blue-50/40 rounded-[1.5rem] flex flex-col items-center justify-center text-slate-400 transition-all">
                                    {uploadingId === q.id ? <Loader2 className="animate-spin text-blue-500" size={32}/> : <ImageIcon size={32} className="text-slate-300 group-hover/img:text-blue-500 transition-colors"/>}
                                    <span className="text-[9px] font-black uppercase mt-2 text-center px-2">
                                        {uploadingId === q.id ? 'Đang tải...' : 'Chưa có ảnh'}
                                    </span>
                                    <span className="text-[8px] font-bold text-slate-400 mt-0.5">Kéo thả / Click</span>
                                </div>
                            )}
                        </div>
                        <div className="flex flex-col gap-3 flex-1">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <h4 className="font-black text-slate-800 text-xs uppercase tracking-tight flex items-center gap-2">
                                    <span>Đính kèm hình ảnh minh họa</span>
                                    {type === 'group-tf' && (
                                        <span className="text-[9px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-md font-bold lowercase">
                                            (ảnh dùng chung cho cả 4 ý a, b, c, d)
                                        </span>
                                    )}
                                </h4>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                {/* NÚT DÁN TRỰC TIẾP TỪ CLIPBOARD (CTRL+V) */}
                                <button
                                    type="button"
                                    onClick={() => handlePasteImageFromClipboard(q.id)}
                                    disabled={uploadingId === q.id}
                                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1.5 shadow-md shadow-emerald-200 active:scale-95 disabled:opacity-50"
                                    title="Dán nhanh hình ảnh vừa cắt từ bộ nhớ tạm (phím tắt: Ctrl + V)"
                                >
                                    <ClipboardPaste size={14}/> Dán ảnh (Ctrl+V)
                                </button>

                                {/* NÚT TẢI ẢNH TỪ MÁY TÍNH */}
                                <input type="file" accept="image/*" className="hidden" id={`img-${q.id}`} onChange={(e) => e.target.files && onUploadImage(q.id, e.target.files[0])} />
                                <label htmlFor={`img-${q.id}`} className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase cursor-pointer flex items-center gap-1.5 transition-all ${uploadingId === q.id ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-black shadow-md shadow-blue-200 active:scale-95'}`}>
                                    {uploadingId === q.id ? <Loader2 className="animate-spin" size={14}/> : <ImageIcon size={14}/>} 
                                    {uploadingId === q.id ? 'ĐANG XỬ LÝ...' : (q.imageUrl ? 'CHỌN FILE MỚI' : 'TẢI TỪ MÁY')}
                                </label>

                                {/* NÚT LẤY ẢNH TỪ CÂU TRƯỚC (NẾU CÓ) */}
                                {prevQuestionWithImg && q.imageUrl !== prevQuestionWithImg.imageUrl && (
                                    <button
                                        type="button"
                                        onClick={() => handleApplyImageToQuestion(q.id, prevQuestionWithImg.imageUrl!)}
                                        className="px-4 py-2.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl text-[10px] font-black uppercase hover:bg-amber-600 hover:text-white transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                                        title={`Dùng lại hình ảnh của Câu ${prevImgIndex}`}
                                    >
                                        <Copy size={13}/> Lấy ảnh Câu {prevImgIndex}
                                    </button>
                                )}

                                {/* NÚT CHỌN TỪ KHO ẢNH CỦA ĐỀ THI */}
                                {uniqueQuizImages.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setGalleryTargetQId(q.id)}
                                        className="px-4 py-2.5 bg-white text-slate-700 border border-slate-200 rounded-xl text-[10px] font-black uppercase hover:bg-slate-100 transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                                        title="Chọn từ danh sách các hình ảnh đã tải trong đề thi này"
                                    >
                                        <Images size={13} className="text-blue-600"/> Kho ảnh đề ({uniqueQuizImages.length})
                                    </button>
                                )}

                                {/* NÚT SAO CHÉP ẢNH NÀY CHO NHIỀU CÂU HỎI KHÁC */}
                                {q.imageUrl && (
                                    <button
                                        type="button"
                                        onClick={() => handleOpenBatchModal(q.imageUrl!)}
                                        className="px-4 py-2.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-xl text-[10px] font-black uppercase hover:bg-purple-600 hover:text-white transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                                        title="Gán hình ảnh của câu này cho các câu hỏi khác trong đề"
                                    >
                                        <Layers size={13}/> Dùng cho câu khác...
                                    </button>
                                )}

                                {/* NÚT GỠ ẢNH */}
                                {q.imageUrl && (
                                    <button 
                                        type="button"
                                        onClick={() => handleRemoveImage(q.id)}
                                        className="px-4 py-2.5 bg-red-50 text-red-600 border border-red-200 rounded-xl text-[10px] font-black uppercase hover:bg-red-600 hover:text-white transition-all flex items-center gap-1.5 active:scale-95"
                                    >
                                        <ImageMinus size={13}/> Gỡ ảnh
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
                                <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-black text-[9px]">💡 MẸO NHANH</span>
                                <span>Cắt ảnh (<b>Win + Shift + S</b> hoặc <b>Cmd + Shift + 4</b>) ➔ Bấm <b>[Dán ảnh (Ctrl+V)]</b> hoặc nhấn <b>Ctrl + V</b> để chèn ngay!</span>
                            </div>
                        </div>
                    </div>

                    {type === 'mcq' && q.options && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                            {q.options.map((opt, oi) => (
                                <div key={oi} className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${isCorrectMCQ(q, opt) && opt !== '' ? 'bg-emerald-50 border-emerald-500' : 'bg-slate-50 border-slate-100'}`}>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <input type="radio" name={`ans-${q.id}`} className="w-5 h-5 accent-emerald-600" checked={isCorrectMCQ(q, opt) && opt !== ''} onChange={() => { const nl = [...questions]; const i = nl.findIndex(x => x.id === q.id); nl[i].correctAnswer = opt; setQuestions(nl); }} />
                                        <span className="text-xs font-black text-slate-400">{String.fromCharCode(65+oi)}.</span>
                                    </div>
                                    <input type="text" className="bg-transparent text-sm font-bold outline-none flex-1" value={opt} onChange={e => { const nl = [...questions]; const i = nl.findIndex(x => x.id === q.id); nl[i].options![oi] = e.target.value; setQuestions(nl); }} placeholder={`Nhập phương án ${String.fromCharCode(65+oi)}...`} />
                                </div>
                            ))}
                        </div>
                    )}

                    {type === 'group-tf' && q.subQuestions && (
                        <div className="space-y-3 mb-8">
                            {q.subQuestions.map((sq, si) => (
                                <div key={si} className="flex flex-col md:flex-row md:items-center gap-4 bg-slate-50 p-5 rounded-2xl border-2 border-slate-100">
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-xs font-black text-blue-600">{String.fromCharCode(97+si)})</span>
                                        <div className="flex items-center bg-white rounded-lg p-0.5 border border-slate-200">
                                            {(['B', 'H', 'VD', 'VDC'] as const).map(lvl => (
                                                <button
                                                    key={lvl}
                                                    type="button"
                                                    onClick={() => {
                                                        const nl = [...questions];
                                                        const i = nl.findIndex(x => x.id === q.id);
                                                        nl[i].subQuestions![si].level = sq.level === lvl ? undefined : lvl;
                                                        setQuestions(nl);
                                                    }}
                                                    className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase transition-all ${sq.level === lvl ? (lvl === 'B' ? 'bg-emerald-600 text-white' : lvl === 'H' ? 'bg-blue-600 text-white' : lvl === 'VD' ? 'bg-amber-600 text-white' : 'bg-red-600 text-white') : 'text-slate-400 hover:text-slate-700'}`}
                                                >
                                                    {lvl}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <input type="text" className="flex-1 bg-transparent text-sm font-bold outline-none" value={sq.text} onChange={e => { const nl = [...questions]; const i = nl.findIndex(x => x.id === q.id); nl[i].subQuestions![si].text = e.target.value; setQuestions(nl); }} placeholder="Nội dung ý trắc nghiệm..." />
                                    <div className="flex bg-white rounded-xl p-1 border-2 border-slate-200 shrink-0">
                                        {['True', 'False'].map(v => (
                                            <button key={v} onClick={() => { const nl = [...questions]; const i = nl.findIndex(x => x.id === q.id); nl[i].subQuestions![si].correctAnswer = v as any; setQuestions(nl); }} className={`px-5 py-1.5 text-[10px] font-black rounded-lg transition-all ${sq.correctAnswer === v ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}>{v === 'True' ? 'ĐÚNG' : 'SAI'}</button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {type === 'short' && (
                        <div className="mb-8 flex items-center gap-4 bg-blue-50/50 p-6 rounded-[2rem] border-2 border-blue-100">
                            <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-white px-4 py-2 rounded-xl shadow-sm">Đáp số đúng:</span>
                            <input type="text" className="flex-1 bg-transparent text-lg font-black text-blue-700 outline-none border-b-2 border-blue-200 focus:border-blue-600 transition-colors" value={q.correctAnswer} onChange={e => { const nl = [...questions]; const i = nl.findIndex(x => x.id === q.id); nl[i].correctAnswer = e.target.value; setQuestions(nl); }} placeholder="Nhập kết quả con số..." />
                        </div>
                    )}

                    <div className="pt-8 border-t-2 border-slate-100 grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="space-y-3">
                            <div className="flex items-center justify-between ml-2 mr-2">
                                <div className="flex items-center gap-2">
                                    <Lightbulb size={16} className="text-orange-500"/>
                                    <label className="text-[10px] font-black text-slate-400 uppercase">Hướng dẫn giải (LaTeX: $...$)</label>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleOpenLatexModal(q.id, 'solution', globalIndex + 1)}
                                    className="flex items-center gap-1.5 px-3 py-1 bg-orange-50 text-orange-600 hover:bg-orange-600 hover:text-white rounded-xl text-[10px] font-black uppercase transition-all shadow-sm border border-orange-200 active:scale-95"
                                    title="Mở bảng hỗ trợ soạn thảo công thức LaTeX cho lời giải"
                                >
                                    <Sparkles size={12}/> Hỗ trợ LaTeX
                                </button>
                            </div>
                            <textarea 
                                ref={el => { textareaRefs.current[`${q.id}-solution`] = el; }}
                                className="w-full p-5 bg-orange-50/20 border-2 border-orange-100 rounded-[2rem] text-sm font-medium outline-none min-h-[100px] focus:border-orange-300" 
                                value={q.solution} 
                                onChange={e => { const nl = [...questions]; const i = nl.findIndex(x => x.id === q.id); nl[i].solution = e.target.value; setQuestions(nl); }} 
                                placeholder="Viết lời giải chi tiết tại đây để hỗ trợ học sinh..." 
                            />
                        </div>
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 ml-2">
                                <Eye size={16} className="text-blue-500"/>
                                <label className="text-[10px] font-black text-blue-400 uppercase">Xem trước lời giải</label>
                            </div>
                            <div className="w-full p-5 bg-white rounded-[2rem] border-2 border-slate-100 min-h-[100px] text-sm italic text-slate-500 overflow-auto shadow-inner"><LatexText text={q.solution || '*Chưa có lời giải*'} /></div>
                        </div>
                    </div>
                </div>
                );
            })}

            {/* Modal Soạn thảo Công thức LaTeX Trực quan */}
            <LatexEditorModal
                isOpen={latexModalConfig.isOpen}
                onClose={() => setLatexModalConfig(prev => ({ ...prev, isOpen: false }))}
                onInsert={handleInsertLatex}
                questionIndex={latexModalConfig.questionNumber}
                initialCode={latexModalConfig.initialCode}
            />
        </div>
    );
};

export default function QuizEditor(props: QuizEditorProps) {
    const [isTextInputOpen, setIsTextInputOpen] = useState(false);
    const [pastedText, setPastedText] = useState('');

    const totalPoints = props.questions.reduce((acc, q) => acc + safeParseScore(q.points), 0);
    const relevantChapters = useMemo(() => {
        return props.chapters.filter(c => {
            if (String(c.grade) !== String(props.grade)) return false;
            if (props.subject && c.subject && !isSameSubject(c.subject, props.subject)) return false;
            return true;
        });
    }, [props.chapters, props.grade, props.subject]);
    const [showKeyInput, setShowKeyInput] = useState(false);

    const handleConfirmTextExtract = () => {
        if (!pastedText.trim()) return;
        const trimmed = pastedText.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            try {
                const result = parseQuestionsFromJSON(trimmed);
                props.setQuestions([...props.questions, ...result.questions]);
                if (result.quizTitle && !props.title) props.setTitle(result.quizTitle);
                if (result.grade) props.setGrade(result.grade);
                if (result.category) props.setCategory(result.category);
                if (result.durationMinutes) props.setDuration(result.durationMinutes);
                setPastedText('');
                setIsTextInputOpen(false);
                alert(`🎉 Phát hiện chuỗi JSON! Đã nhập thành công ${result.questions.length} câu hỏi (0% AI, đầy đủ đáp án & lời giải).`);
                return;
            } catch (jsonErr: any) {
                console.warn("Thử parse JSON thất bại, tiếp tục bóc tách qua AI:", jsonErr);
            }
        }
        props.onTextExtract(pastedText);
        setPastedText('');
        setIsTextInputOpen(false);
    };

    const handleJsonFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const content = reader.result as string;
                    const result = parseQuestionsFromJSON(content);
                    props.setQuestions([...props.questions, ...result.questions]);
                    if (result.quizTitle && !props.title) props.setTitle(result.quizTitle);
                    if (result.grade) props.setGrade(result.grade);
                    if (result.category) props.setCategory(result.category);
                    if (result.durationMinutes) props.setDuration(result.durationMinutes);
                    alert(`🎉 Đã bóc tách thành công ${result.questions.length} câu hỏi từ file JSON mà KHÔNG tốn lượt AI nào! (Bao gồm đầy đủ đáp án & lời giải chi tiết)`);
                } catch (err: any) {
                    alert("❌ Lỗi cấu trúc JSON: " + err.message);
                }
            };
            reader.readAsText(file, "UTF-8");
        } catch (err: any) {
            alert("Lỗi đọc file JSON: " + err.message);
        }
        e.target.value = '';
    };

    return (
        <div className="max-w-5xl mx-auto space-y-12 pb-32 animate-fade-in relative">
            {props.isAiLoading && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[2100] flex items-center justify-center p-6 animate-fade-in">
                    <div className="bg-white p-12 rounded-[3.5rem] shadow-2xl text-center space-y-8 max-w-sm w-full border-8 border-blue-100">
                        <div className="relative w-24 h-24 mx-auto">
                            <div className="absolute inset-0 border-8 border-blue-50 rounded-full"></div>
                            <div className="absolute inset-0 border-8 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Sparkles className="text-blue-600 animate-pulse" size={32}/>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <h3 className="text-xl font-black uppercase text-slate-800 tracking-tight leading-none">AI Đang bóc tách...</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed px-4">Đang trích xuất câu hỏi, đáp án và lời giải bằng Gemini 3 Flash.</p>
                        </div>
                    </div>
                </div>
            )}

            {isTextInputOpen && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[2000] flex items-center justify-center p-6 animate-fade-in">
                    <div className="bg-white w-full max-w-3xl rounded-[3rem] shadow-2xl flex flex-col overflow-hidden border-8 border-white">
                        <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <TypeIcon size={24} className="text-blue-500"/>
                                <h3 className="text-lg font-black uppercase tracking-tight">Dán văn bản đề thi</h3>
                            </div>
                            <button onClick={() => setIsTextInputOpen(false)} className="p-3 hover:bg-red-600 rounded-xl transition-colors"><X/></button>
                        </div>
                        <div className="p-8 space-y-6">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
                                Copy nội dung đề từ Word/Web dán vào đây (Nếu dán chuỗi JSON hệ thống sẽ tự động tách câu hỏi 0% AI, nếu dán văn bản thường AI sẽ bóc tách).
                            </p>
                            <textarea 
                                className="w-full h-80 p-6 bg-slate-50 border-2 border-slate-100 rounded-[2rem] outline-none font-medium text-sm focus:border-blue-400 transition-all"
                                placeholder="Dán nội dung văn bản hoặc chuỗi JSON tại đây..."
                                value={pastedText}
                                onChange={e => setPastedText(e.target.value)}
                            />
                            <div className="flex gap-4">
                                <button onClick={() => setIsTextInputOpen(false)} className="flex-1 py-4 bg-slate-100 text-slate-400 rounded-2xl font-black uppercase text-xs hover:bg-slate-200 transition-all">Hủy bỏ</button>
                                <button onClick={handleConfirmTextExtract} className="flex-[2] py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs shadow-xl shadow-blue-200 hover:bg-black transition-all">Bắt đầu bóc tách</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal cấu hình Gemini API Key */}
            {showKeyInput && props.onApiKeyChange && (
                <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[2200] flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl p-8 border-4 border-white space-y-6 animate-scale-up">
                        <div className="flex items-center justify-between border-b pb-4">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                                    <Key size={22}/>
                                </div>
                                <div>
                                    <h3 className="font-black text-slate-800 uppercase tracking-tight text-base">Cấu hình Gemini API Key</h3>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Dùng cho AI soạn đề & bóc tách PDF / Văn bản</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setShowKeyInput(false)}
                                className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-700 transition-colors"
                            >
                                <X size={20}/>
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                                    Mã API Key (AI Studio)
                                </label>
                                {props.customApiKey ? (
                                    <span className="text-[9px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 flex items-center gap-1">
                                        <Check size={10}/> Đang kích hoạt
                                    </span>
                                ) : (
                                    <span className="text-[9px] font-bold uppercase text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                                        {props.isSuperAdmin ? 'Đang dùng Key mặc định' : 'Chưa nhập Key'}
                                    </span>
                                )}
                            </div>

                            <div className="relative flex items-center">
                                <input
                                    type="text"
                                    placeholder={props.isSuperAdmin ? "Mặc định dùng Key hệ thống (nhập để đổi)..." : "Dán mã AI Studio API Key vào đây..."}
                                    value={props.customApiKey || ''}
                                    onChange={e => props.onApiKeyChange?.(e.target.value)}
                                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3.5 text-xs font-mono font-medium outline-none focus:border-blue-500 focus:bg-white transition-all text-slate-800"
                                />
                            </div>

                            <div className="flex items-center justify-between text-[11px] pt-1">
                                <a 
                                    href="https://aistudio.google.com/app/apikey" 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="text-blue-600 hover:underline font-bold flex items-center gap-1"
                                >
                                    <Sparkles size={12}/> Lấy API Key miễn phí tại Google AI Studio
                                </a>
                                {props.customApiKey && (
                                    <button
                                        type="button"
                                        onClick={() => props.onApiKeyChange?.('')}
                                        className="text-red-500 hover:text-red-700 font-bold hover:underline"
                                    >
                                        Xóa Key đã lưu
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="p-4 bg-blue-50/60 rounded-2xl border border-blue-100 text-[11px] text-slate-600 space-y-1">
                            <p className="font-bold text-blue-900">💡 Lưu ý bảo mật:</p>
                            <p>Key được lưu trực tiếp trên trình duyệt của riêng bạn. Mỗi giáo viên có thể dùng Key riêng mà không ảnh hưởng lẫn nhau.</p>
                        </div>

                        <button
                            type="button"
                            onClick={() => setShowKeyInput(false)}
                            className="w-full py-3.5 bg-slate-900 hover:bg-black text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-lg active:scale-95"
                        >
                            Xác nhận & Đóng
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-white p-5 sm:p-7 rounded-3xl border-2 border-slate-100 shadow-sm space-y-5 relative overflow-hidden">
                <div className={`absolute top-0 right-8 sm:right-12 px-5 py-2 rounded-b-2xl font-black text-[11px] uppercase shadow-md z-10 transition-colors ${totalPoints === 10 ? 'bg-emerald-600' : 'bg-orange-500'} text-white`}>
                    Tổng điểm đề: {totalPoints.toFixed(2)}đ
                </div>
                
                {/* Khu vực Nhập Tiêu đề đề thi độc lập, gọn gàng */}
                <div className="space-y-3 border-b border-slate-100 pb-4 pt-1">
                    <div className="space-y-1.5 bg-slate-50/90 p-3.5 sm:p-4 rounded-2xl border-2 border-slate-200/80 focus-within:border-blue-500 focus-within:bg-white focus-within:shadow-sm transition-all">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-2">
                            <FileCode size={14} className="text-blue-600"/>
                            <span>TÊN ĐỀ THI / TIÊU ĐỀ BÀI KIỂM TRA</span>
                        </label>
                        <input 
                            type="text" 
                            className="text-base sm:text-lg font-black outline-none bg-transparent w-full uppercase placeholder:text-slate-300 text-slate-900 transition-colors tracking-tight" 
                            placeholder="NHẬP TÊN ĐỀ THI (VD: KIỂM TRA CHƯƠNG I ĐẠO HÀM...)" 
                            value={props.title} 
                            onChange={e => props.setTitle(e.target.value)} 
                            autoFocus={!props.editingId && !props.title}
                        />
                    </div>

                    {/* Thanh công cụ nhập câu hỏi & AI gọn gàng */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <label className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 text-white rounded-xl text-[10px] font-black uppercase cursor-pointer hover:bg-amber-600 transition-all shadow-sm active:scale-95" title="Nhập trực tiếp file .json (Không tốn lượt AI)">
                                <FileCode size={13}/> NHẬP JSON (0% AI)
                                <input type="file" accept=".json,application/json" className="hidden" onChange={handleJsonFileSelect}/>
                            </label>
                            <button 
                                onClick={() => setIsTextInputOpen(true)}
                                className={`flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-black transition-all shadow-sm active:scale-95 ${props.isAiLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                <TypeIcon size={13}/> NHẬP TEXT (AI)
                            </button>
                            <label className={`flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase cursor-pointer hover:bg-black transition-all shadow-sm active:scale-95 ${props.isAiLoading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                <FileUp size={13}/> NHẬP PDF (AI)
                                <input type="file" accept="application/pdf" className="hidden" disabled={props.isAiLoading} onChange={props.onPdfExtract}/>
                            </label>
                            <button 
                                onClick={props.onCleanLabels}
                                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-[10px] font-black uppercase hover:bg-emerald-600 hover:text-white transition-all shadow-sm active:scale-95"
                                title="Xóa bỏ các nhãn A., B., a), b) dư thừa trong nội dung câu hỏi"
                            >
                                <Zap size={13}/> DỌN NHÃN
                            </button>
                        </div>

                        {props.onApiKeyChange && (
                            <button
                                type="button"
                                onClick={() => setShowKeyInput(true)}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase border transition-all shadow-sm active:scale-95 ${
                                    props.customApiKey 
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100' 
                                        : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                                }`}
                                title="Cấu hình Gemini API Key riêng"
                            >
                                <Key size={13} className={props.customApiKey ? "text-emerald-600" : "text-slate-500"}/>
                                <span>{props.customApiKey ? "Key riêng: Đã bật" : "Gemini API Key"}</span>
                            </button>
                        )}
                    </div>
                </div>
                
                {/* Lưới thông số đề thi: Gọn gàng, rõ chữ */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-1">
                            <BookOpen size={11} className="text-blue-500"/> Môn học
                        </label>
                        {props.isSuperAdmin ? (
                            <select 
                                className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-xs font-black uppercase bg-slate-50 focus:border-blue-400 outline-none cursor-pointer" 
                                value={props.subject || 'Toán'} 
                                onChange={e => { 
                                    if (props.setSubject) props.setSubject(e.target.value); 
                                    props.setCategory(''); 
                                }}
                            >
                                {STANDARD_SUBJECTS.map(subj => (
                                    <option key={subj} value={subj}>{subj.toUpperCase()}</option>
                                ))}
                            </select>
                        ) : (
                            <div className="w-full border-2 border-blue-200 bg-blue-50/70 rounded-xl p-2.5 flex items-center justify-between">
                                <span className="text-xs font-black uppercase text-blue-800 tracking-wide truncate">
                                    {props.subject || 'TOÁN'}
                                </span>
                                <span className="px-1.5 py-0.5 bg-blue-600 text-white rounded text-[8px] font-black uppercase">
                                    MÔN
                                </span>
                            </div>
                        )}
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Khối lớp</label>
                        <select className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-xs font-black bg-slate-50 focus:border-blue-400 outline-none cursor-pointer" value={props.grade} onChange={e => { props.setGrade(e.target.value as Grade); props.setCategory(''); }}>
                            <option value="12">Khối 12</option>
                            <option value="11">Khối 11</option>
                            <option value="10">Khối 10</option>
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Niên học</label>
                        <select 
                            className="w-full border-2 border-blue-200 bg-blue-50/50 rounded-xl p-2.5 text-xs font-black text-blue-800 focus:border-blue-400 outline-none cursor-pointer" 
                            value={props.academicYear || getCurrentAcademicYear()} 
                            onChange={e => props.setAcademicYear && props.setAcademicYear(e.target.value)}
                        >
                            {getAcademicYearOptions([props.academicYear]).map(yr => (
                                <option key={yr} value={yr}>NH {yr} {yr === getCurrentAcademicYear() ? '(Hiện hành)' : ''}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Chương học</label>
                        <select className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-xs font-black uppercase bg-slate-50 focus:border-blue-400 outline-none cursor-pointer" value={props.category} onChange={e => props.setCategory(e.target.value)}>
                            <option value="">Chọn chương...</option>
                            {relevantChapters.map(c => <option key={c.id} value={c.name}>{(c.name || (c as any).title || "Chương chưa đặt tên").toUpperCase()}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Hình thức</label>
                        <select className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-xs font-black bg-slate-50 focus:border-blue-400 outline-none cursor-pointer" value={props.quizType} onChange={e => {
                            const val = e.target.value as any;
                            props.setQuizType(val);
                            if (val === 'practice') {
                                props.setIsMonitored(false);
                                if (props.setMaxAttempts) props.setMaxAttempts(0);
                            } else {
                                if (props.setMaxAttempts && (props.maxAttempts === undefined || props.maxAttempts === 0)) {
                                    props.setMaxAttempts(1);
                                }
                            }
                        }}>
                            <option value="practice">📖 Luyện tập (Xem ngay đáp án)</option>
                            <option value="test">✍️ Làm bài / Test (Chấm điểm)</option>
                        </select>
                    </div>
                    {props.quizType === 'test' && (
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-indigo-700 uppercase ml-1 flex items-center gap-1">
                                <span>🎯 Số lần làm</span>
                            </label>
                            <select 
                                className="w-full border-2 border-indigo-200 bg-indigo-50/60 rounded-xl p-2.5 text-xs font-black text-indigo-950 focus:border-indigo-400 outline-none cursor-pointer"
                                value={props.maxAttempts ?? 1}
                                onChange={e => {
                                    if (props.setMaxAttempts) {
                                        props.setMaxAttempts(parseInt(e.target.value));
                                    }
                                }}
                            >
                                <option value="1">1 lần (Nộp xong ĐÓNG BĂNG)</option>
                                <option value="2">2 lần làm bài</option>
                                <option value="3">3 lần làm bài</option>
                                <option value="5">5 lần làm bài</option>
                                <option value="0">Không giới hạn số lần</option>
                            </select>
                        </div>
                    )}
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Thứ tự luyện</label>
                        <input 
                            type="number" 
                            min="0"
                            className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-xs font-black bg-slate-50 focus:border-blue-400 outline-none" 
                            value={props.orderIndex} 
                            onChange={e => {
                                const val = parseInt(e.target.value);
                                props.setOrderIndex(isNaN(val) ? 0 : val);
                            }} 
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Thời lượng (phút)</label>
                        <input type="number" className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-xs font-black bg-slate-50 focus:border-blue-400 outline-none" value={props.duration} onChange={e => props.setDuration(parseInt(e.target.value))} />
                    </div>
                </div>

                {/* Khung thời gian và cài đặt kỳ thi */}
                <div className="bg-slate-50/70 p-6 rounded-[2.5rem] border-2 border-slate-100 space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <Zap size={18} className="text-blue-600" />
                            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                                {props.quizType === 'test' ? 'Khung thời gian mở phòng thi & Quy chế làm bài' : 'Thời hạn Luyện tập & Xem đáp án'}
                            </h4>
                        </div>
                        {props.quizType === 'test' && props.startTime && (
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => props.setEndTime(props.startTime)}
                                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all ${props.endTime === props.startTime ? 'bg-blue-600 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                                    title="Tất cả học sinh vào làm cùng lúc và hết giờ cùng lúc"
                                >
                                    🎯 Đặt X = Y (Thi đồng loạt)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const d = new Date(props.startTime);
                                        d.setMinutes(d.getMinutes() + 30);
                                        const tzOffset = d.getTimezoneOffset() * 60000;
                                        props.setEndTime(new Date(d.getTime() - tzOffset).toISOString().slice(0, 16));
                                    }}
                                    className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl text-[10px] font-black uppercase transition-all"
                                >
                                    +30 phút mở
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const d = new Date(props.startTime);
                                        d.setHours(d.getHours() + 1);
                                        const tzOffset = d.getTimezoneOffset() * 60000;
                                        props.setEndTime(new Date(d.getTime() - tzOffset).toISOString().slice(0, 16));
                                    }}
                                    className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl text-[10px] font-black uppercase transition-all"
                                >
                                    +1 giờ mở
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const d = new Date(props.startTime);
                                        d.setHours(d.getHours() + 2);
                                        const tzOffset = d.getTimezoneOffset() * 60000;
                                        props.setEndTime(new Date(d.getTime() - tzOffset).toISOString().slice(0, 16));
                                    }}
                                    className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl text-[10px] font-black uppercase transition-all"
                                >
                                    +2 giờ mở
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const d = new Date(props.startTime);
                                        d.setHours(23, 59, 0, 0);
                                        const tzOffset = d.getTimezoneOffset() * 60000;
                                        props.setEndTime(new Date(d.getTime() - tzOffset).toISOString().slice(0, 16));
                                    }}
                                    className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl text-[10px] font-black uppercase transition-all"
                                >
                                    Hết ngày (23:59)
                                </button>
                            </div>
                        )}
                    </div>

                    {props.quizType === 'test' ? (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-blue-600 uppercase ml-2 flex items-center gap-1.5">
                                        <span>📅 Giờ mở phòng thi (Mốc X - Bắt đầu cho vào thi)</span>
                                    </label>
                                    <input 
                                        type="datetime-local" 
                                        className="w-full border-2 border-blue-200 rounded-[1.5rem] p-4 text-xs font-black bg-white focus:border-blue-500 outline-none shadow-sm" 
                                        value={props.startTime} 
                                        onChange={e => {
                                            props.setStartTime(e.target.value);
                                            // Nếu chưa có endTime thì gán tạm endTime = startTime
                                            if (!props.endTime) props.setEndTime(e.target.value);
                                        }} 
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-indigo-600 uppercase ml-2 flex items-center gap-1.5">
                                        <span>⏳ Giờ đóng phòng thi (Mốc Y - Hết hạn vào làm bài)</span>
                                    </label>
                                    <input 
                                        type="datetime-local" 
                                        className="w-full border-2 border-indigo-200 rounded-[1.5rem] p-4 text-xs font-black bg-white focus:border-indigo-500 outline-none shadow-sm" 
                                        value={props.endTime} 
                                        onChange={e => props.setEndTime(e.target.value)} 
                                    />
                                </div>
                            </div>

                            {/* Banner hướng dẫn về số lần làm bài & cơ chế đóng băng */}
                            <div className="p-4 rounded-2xl border bg-indigo-50/70 border-indigo-200 space-y-1.5">
                                <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase">
                                        Quy định số lượt làm: {(props.maxAttempts === 1 || props.maxAttempts === undefined) ? '1 LẦN DUY NHẤT' : props.maxAttempts > 1 ? `${props.maxAttempts} LẦN LÀM BÀI` : 'TỰ DO LƯỢT'}
                                    </span>
                                </div>
                                <p className="text-xs text-indigo-950 leading-relaxed font-medium">
                                    {(props.maxAttempts === 1 || props.maxAttempts === undefined) 
                                        ? '🔒 Học sinh làm xong và bấm Nộp bài sẽ được báo ĐÃ LÀM XONG và ĐÓNG BĂNG đề thi ngay lập tức (không được làm lại).'
                                        : props.maxAttempts > 1
                                        ? `🔄 Học sinh được làm tối đa ${props.maxAttempts} lần trong khoảng thời gian mở phòng thi. Khi làm đủ ${props.maxAttempts} lần hoặc khi hết giờ mở phòng thi, đề thi sẽ tự động đóng băng.`
                                        : '♾️ Học sinh có thể làm lại bài không giới hạn số lần cho đến khi kết thúc thời gian mở phòng thi.'
                                    }
                                </p>
                            </div>

                            {/* Banner giải thích quy tắc thời gian làm bài */}
                            {props.startTime ? (
                                props.endTime && props.startTime !== props.endTime && new Date(props.endTime) > new Date(props.startTime) ? (
                                    <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex items-start gap-3">
                                        <div className="p-2 bg-emerald-600 text-white rounded-xl shrink-0 mt-0.5 shadow-sm">
                                            <Zap size={14} />
                                        </div>
                                        <div className="text-xs text-emerald-900 leading-relaxed">
                                            <p className="font-black uppercase text-[11px] text-emerald-800 mb-0.5">
                                                Chế độ Khung giờ mở phòng thi linh hoạt (Mở từ X đến Y)
                                            </p>
                                            <p className="font-medium text-emerald-700">
                                                Học sinh vào làm bài tại bất kỳ thời điểm nào trong khung giờ 
                                                từ <b>{new Date(props.startTime).toLocaleString('vi-VN')}</b> đến <b>{new Date(props.endTime).toLocaleString('vi-VN')}</b> đều 
                                                được <b>tính trọn vẹn {props.duration} phút làm bài</b> cho mỗi lượt làm bài.
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-start gap-3">
                                        <div className="p-2 bg-amber-600 text-white rounded-xl shrink-0 mt-0.5 shadow-sm">
                                            <ShieldAlert size={14} />
                                        </div>
                                        <div className="text-xs text-amber-900 leading-relaxed">
                                            <p className="font-black uppercase text-[11px] text-amber-800 mb-0.5">
                                                Chế độ Thi đồng loạt (X = Y)
                                            </p>
                                            <p className="font-medium text-amber-700">
                                                Phòng thi mở vào lúc <b>{new Date(props.startTime).toLocaleString('vi-VN')}</b>. Tất cả học sinh 
                                                phải <b>nộp bài đồng thời trước hạn chót</b> (sau {props.duration} phút). Nếu học sinh vào trễ sau giờ mở đề, thời gian làm bài sẽ bị rút ngắn tương ứng.
                                            </p>
                                        </div>
                                    </div>
                                )
                            ) : (
                                <p className="text-[11px] font-bold text-slate-400 italic">
                                    💡 Để trống giờ mở/đóng nếu muốn mở phòng tự do bất kỳ lúc nào sau khi công khai.
                                </p>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="p-4 rounded-2xl border bg-amber-50/70 border-amber-200">
                                <p className="text-xs text-amber-950 leading-relaxed font-medium">
                                    💡 <b>Chế độ Luyện tập:</b> Học sinh có thể nhấn vào từng câu hỏi để <b>xem ngay đáp án đúng và lời giải chi tiết</b> từng bước để ôn tập hiệu quả. Bạn có thể đặt Hạn chót luyện tập bên dưới để quản lý tiến độ.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-blue-600 uppercase ml-2">
                                    📅 Hạn chót luyện tập (Để trống nếu mở vĩnh viễn)
                                </label>
                                <input 
                                    type="datetime-local" 
                                    className="w-full border-2 border-slate-200 rounded-[1.5rem] p-4 text-xs font-black bg-white focus:border-blue-300 outline-none" 
                                    value={props.endTime} 
                                    onChange={e => props.setEndTime(e.target.value)} 
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* GIAO ĐỀ CHO LỚP VÀ PHÂN HÓA ĐỐI TƯỢNG HỌC SINH */}
                <div className="bg-indigo-50/40 border-2 border-indigo-100 p-6 rounded-[2.5rem] space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                            <div className="p-2.5 bg-indigo-600 text-white rounded-2xl shadow-sm">
                                <GraduationCap size={18} />
                            </div>
                            <div>
                                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                                    Đối tượng giao đề & Phân hóa lớp học
                                </h4>
                                <p className="text-[10px] text-slate-500 font-bold">
                                    Chỉ định lớp nào được quyền nhìn thấy và làm đề thi này
                                </p>
                            </div>
                        </div>

                        {/* Switch giữa Toàn khối và Giao cho Lớp chỉ định (Chỉ SuperAdmin mới có nút Giao Toàn Khối) */}
                        {props.isSuperAdmin ? (
                            <div className="flex bg-white p-1 rounded-2xl border shadow-sm shrink-0">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (props.setTargetType) props.setTargetType('all');
                                        if (props.setAssignedClassIds) props.setAssignedClassIds([]);
                                    }}
                                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1.5 ${(!props.targetType || props.targetType === 'all') ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                                >
                                    🌐 Toàn khối {props.grade}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (props.setTargetType) props.setTargetType('classes');
                                    }}
                                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1.5 ${props.targetType === 'classes' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                                >
                                    🎯 Giao lớp chỉ định
                                </button>
                            </div>
                        ) : (
                            <div className="px-3.5 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5 shadow-sm shrink-0">
                                🎯 Giao lớp giảng dạy
                            </div>
                        )}
                    </div>

                    {(!props.isSuperAdmin || props.targetType === 'classes') ? (
                        <div className="space-y-4 pt-2">
                            <div className="flex flex-wrap justify-between items-center gap-2 bg-white/80 p-3 rounded-2xl border border-indigo-100">
                                <span className="text-[11px] font-black text-indigo-900">
                                    Danh sách Lớp học ({props.assignedClassIds?.length || 0} lớp được chọn):
                                </span>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (props.classes && props.setAssignedClassIds) {
                                                const relevantIds = props.classes
                                                    .filter(c => props.grade === 'all' || String(c.grade) === String(props.grade))
                                                    .map(c => c.id);
                                                props.setAssignedClassIds(relevantIds);
                                            }
                                        }}
                                        className="text-[9px] font-black text-indigo-600 uppercase bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors"
                                    >
                                        Chọn tất cả
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (props.setAssignedClassIds) props.setAssignedClassIds([]);
                                        }}
                                        className="text-[9px] font-black text-slate-500 uppercase bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
                                    >
                                        Bỏ chọn
                                    </button>
                                </div>
                            </div>

                            {props.classes && props.classes.length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                    {props.classes
                                        .filter(c => props.grade === 'all' || String(c.grade) === String(props.grade))
                                        .map(c => {
                                            const isChecked = Boolean(props.assignedClassIds?.includes(c.id));
                                            return (
                                                <div
                                                    key={c.id}
                                                    onClick={() => {
                                                        if (!props.setAssignedClassIds) return;
                                                        const current = props.assignedClassIds || [];
                                                        if (isChecked) {
                                                            props.setAssignedClassIds(current.filter(id => id !== c.id));
                                                        } else {
                                                            props.setAssignedClassIds([...current, c.id]);
                                                        }
                                                    }}
                                                    className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between ${isChecked ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200' : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'}`}
                                                >
                                                    <div className="flex items-center gap-2.5">
                                                        {isChecked ? <CheckSquare size={16} className="text-white" /> : <Square size={16} className="text-slate-300" />}
                                                        <div>
                                                            <p className="font-black text-xs uppercase leading-tight">
                                                                {c.name}
                                                            </p>
                                                            <p className={`text-[9px] font-bold ${isChecked ? 'text-indigo-200' : 'text-slate-400'}`}>
                                                                Niên khóa {c.academicYear} • Khối {c.grade}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>
                            ) : (
                                <div className="p-4 bg-white rounded-2xl border border-dashed text-center text-xs text-slate-400 font-bold">
                                    Chưa có lớp nào được tạo cho Khối {props.grade}. Hãy vào tab <strong>"LỚP & NIÊN KHÓA"</strong> để tạo lớp trước.
                                </div>
                            )}

                            {(props.assignedClassIds?.length || 0) === 0 && (
                                <p className="text-[10px] text-amber-600 font-bold italic">
                                    ⚠️ Chú ý: Bạn chưa chọn lớp nào! Nếu lưu bây giờ, chưa học sinh nào có thể thấy đề này.
                                </p>
                            )}
                        </div>
                    ) : (
                        <p className="text-[11px] text-slate-500 font-medium">
                            Đề thi này sẽ hiển thị công khai cho <strong>tất cả học sinh thuộc Khối {props.grade}</strong>.
                        </p>
                    )}
                </div>

                {/* BẢNG NÚT CÀI ĐẶT 2 DÒNG NHỎ GỌN, RÕ CHỮ, HIGH CONTRAST */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-2">
                    {/* Nút Xem/Ẩn đáp án (Thay thế nút Tắt luyện) */}
                    {props.quizType === 'test' ? (
                        <button 
                            type="button"
                            onClick={() => {
                                if (props.setShowResultAnswers) {
                                    props.setShowResultAnswers(props.showResultAnswers === false ? true : false);
                                }
                            }} 
                            className={`p-3 rounded-2xl border-2 transition-all flex flex-col items-center justify-center text-center gap-1 shadow-sm active:scale-95 ${
                                props.showResultAnswers !== false 
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100' 
                                    : 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100'
                            }`}
                            title="Bật/Tắt quyền xem đáp án đúng và lời giải chi tiết sau khi học sinh nộp bài hoặc sau khi hết giờ"
                        >
                            <div className="flex items-center gap-1 text-[10px] font-black uppercase">
                                {props.showResultAnswers !== false ? <Eye size={14} className="text-emerald-700"/> : <EyeOff size={14} className="text-rose-700"/>}
                                <span>ĐÁP ÁN BÀI THI</span>
                            </div>
                            <span className="text-[10px] font-black uppercase leading-tight">
                                {props.showResultAnswers !== false ? 'CHO XEM ĐÁP ÁN' : 'ẨN ĐÁP ÁN (CHỈ ĐIỂM)'}
                            </span>
                        </button>
                    ) : (
                        <div className="p-3 rounded-2xl border-2 border-amber-200 bg-amber-50 text-amber-900 flex flex-col items-center justify-center text-center gap-1 shadow-sm">
                            <div className="flex items-center gap-1 text-[10px] font-black uppercase text-amber-700">
                                <Zap size={14}/>
                                <span>CHẾ ĐỘ LUYỆN</span>
                            </div>
                            <span className="text-[10px] font-black uppercase leading-tight">
                                XEM NGAY ĐÁP ÁN
                            </span>
                        </div>
                    )}

                    {/* Nút Chống gian lận */}
                    <button 
                        type="button"
                        onClick={() => props.setIsMonitored(!props.isMonitored)} 
                        className={`p-3 rounded-2xl border-2 transition-all flex flex-col items-center justify-center text-center gap-1 shadow-sm active:scale-95 ${
                            props.isMonitored 
                                ? 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100' 
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                        title="Bật tính năng giám sát chuyển tab và chống gian lận trong lúc làm bài"
                    >
                        <div className="flex items-center gap-1 text-[10px] font-black uppercase">
                            {props.isMonitored ? <ShieldCheck size={14} className="text-red-600"/> : <ShieldAlert size={14} className="text-slate-400"/>}
                            <span>GIÁM SÁT THI</span>
                        </div>
                        <span className="text-[10px] font-black uppercase leading-tight">
                            {props.isMonitored ? 'BẬT CHỐNG GIAN LẬN' : 'KHÔNG GIÁM SÁT'}
                        </span>
                    </button>

                    {/* Nút Riêng tư */}
                    <button 
                        type="button"
                        onClick={() => props.setIsUnlisted(!props.isUnlisted)} 
                        className={`p-3 rounded-2xl border-2 transition-all flex flex-col items-center justify-center text-center gap-1 shadow-sm active:scale-95 ${
                            props.isUnlisted 
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-300 hover:bg-indigo-100' 
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                        title="Chế độ chỉ làm qua link hoặc hiện công khai cho học sinh"
                    >
                        <div className="flex items-center gap-1 text-[10px] font-black uppercase">
                            {props.isUnlisted ? <LinkIcon size={14} className="text-indigo-600"/> : <Eye size={14} className="text-slate-400"/>}
                            <span>QUYỀN TRUY CẬP</span>
                        </div>
                        <span className="text-[10px] font-black uppercase leading-tight">
                            {props.isUnlisted ? 'CHỈ LÀM QUA LINK' : 'HIỆN CÔNG KHAI'}
                        </span>
                    </button>

                    {/* Nút Chia sẻ cùng môn */}
                    <button 
                        type="button"
                        onClick={() => {
                            if (props.setIsSharedWithTeachers) {
                                props.setIsSharedWithTeachers(!props.isSharedWithTeachers);
                            }
                        }} 
                        className={`p-3 rounded-2xl border-2 transition-all flex flex-col items-center justify-center text-center gap-1 shadow-sm active:scale-95 ${
                            props.isSharedWithTeachers 
                                ? 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100' 
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                        title="Chia sẻ đề thi này cho các giáo viên cùng tổ bộ môn tham khảo và giao lớp"
                    >
                        <div className="flex items-center gap-1 text-[10px] font-black uppercase">
                            <Users size={14} className={props.isSharedWithTeachers ? "text-blue-600" : "text-slate-400"}/>
                            <span>CHIA SẺ GV</span>
                        </div>
                        <span className="text-[10px] font-black uppercase leading-tight">
                            {props.isSharedWithTeachers ? 'CHIA SẺ CÙNG MÔN' : 'ĐỀ RIÊNG CỦA TÔI'}
                        </span>
                    </button>

                    {/* Nút Trạng thái phát hành */}
                    <button 
                        type="button"
                        onClick={() => props.setIsPublished(!props.isPublished)} 
                        className={`col-span-2 sm:col-span-1 p-3 rounded-2xl border-2 transition-all flex flex-col items-center justify-center text-center gap-1 shadow-sm active:scale-95 ${
                            props.isPublished 
                                ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700' 
                                : 'bg-slate-200 text-slate-600 border-slate-300 hover:bg-slate-300'
                        }`}
                        title="Chuyển giữa chế độ Công khai (cho học sinh thấy) hoặc Bản nháp ẩn"
                    >
                        <div className="flex items-center gap-1 text-[10px] font-black uppercase">
                            <CheckCircle2 size={14} className={props.isPublished ? "text-white" : "text-slate-400"}/>
                            <span>TRẠNG THÁI</span>
                        </div>
                        <span className="text-[10px] font-black uppercase leading-tight">
                            {props.isPublished ? 'ĐÃ CÔNG KHAI' : 'BẢN NHÁP (ẨN)'}
                        </span>
                    </button>
                </div>

                <button onClick={props.onSave} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase text-xs sm:text-sm flex items-center justify-center gap-3 hover:bg-black transition-all shadow-xl active:scale-[0.98] mt-4">
                    <Save size={18}/> LƯU TOÀN BỘ ĐỀ THI VÀO DATABASE
                </button>
            </div>

            <QuestionSection sectionTitle="PHẦN I. TRẮC NGHIỆM NHIỀU LỰA CHỌN" type="mcq" questions={props.questions} setQuestions={props.setQuestions} onUploadImage={props.onUploadImage} uploadingId={props.uploadingId} onOpenBank={props.onOpenBank} />
            <QuestionSection sectionTitle="PHẦN II. TRẮC NGHIỆM ĐÚNG SAI" type="group-tf" questions={props.questions} setQuestions={props.setQuestions} onUploadImage={props.onUploadImage} uploadingId={props.uploadingId} onOpenBank={props.onOpenBank} />
            <QuestionSection sectionTitle="PHẦN III. TRẢ LỜI NGẮN" type="short" questions={props.questions} setQuestions={props.setQuestions} onUploadImage={props.onUploadImage} uploadingId={props.uploadingId} onOpenBank={props.onOpenBank} />
        </div>
    );
}
