
import React, { useState, useMemo, useEffect } from 'react';
import { Question, QuestionType, Grade, Chapter, QuestionLevel, User } from '../../types';
import { Database, Search, CheckCircle2, CheckSquare, Square, X, BookOpen, Trash2, AlertTriangle, Loader2, Sparkles } from 'lucide-react';
import LatexText from '../LatexText';
import { v4 as uuidv4 } from 'uuid';
import { isSameSubject, STANDARD_SUBJECTS, normalizeSubject, getDisplaySubject } from '../../services/subjectUtils';
import { getQuestionFingerprint } from '../../services/storage';

interface QuestionBankProps {
    questions: Question[];
    chapters: Chapter[];
    bGradeFilter: Grade | 'all';
    setBGradeFilter: (val: Grade | 'all') => void;
    bChapterFilter: string;
    setBChapterFilter: (val: string) => void;
    bTypeFilter: QuestionType | 'all';
    setBTypeFilter: (val: QuestionType | 'all') => void;
    bSearch: string;
    setBSearch: (val: string) => void;
    onAddMultiple: (qs: Question[]) => void;
    currentUser?: User;
    isSuperAdmin?: boolean;
    bSubjectFilter?: string;
    setBSubjectFilter?: (val: string) => void;
    onDeleteQuestion?: (id: string) => Promise<void> | void;
    onDeleteBatchQuestions?: (ids: string[]) => Promise<void> | void;
    onDeduplicate?: () => Promise<void> | void;
    isDeduplicating?: boolean;
}

const PAGE_SIZE = 40;

export default function QuestionBank({ 
    questions, chapters, bGradeFilter, setBGradeFilter, bChapterFilter, setBChapterFilter, bTypeFilter, setBTypeFilter, bSearch, setBSearch, onAddMultiple,
    currentUser, isSuperAdmin, bSubjectFilter = 'all', setBSubjectFilter,
    onDeleteQuestion, onDeleteBatchQuestions, onDeduplicate, isDeduplicating
}: QuestionBankProps) {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const [bLevelFilter, setBLevelFilter] = useState<QuestionLevel | 'all'>('all');
    const [deleteModal, setDeleteModal] = useState<{
        isOpen: boolean;
        ids: string[];
        isBatch: boolean;
        questionPreview?: string;
    } | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Extract available subjects from standard list + questions + chapters
    const availableSubjects = useMemo(() => {
        const subsMap = new Map<string, string>(); // normalized -> display name

        // 1. Luôn thêm danh sách các môn học chuẩn phổ biến
        STANDARD_SUBJECTS.forEach(s => {
            subsMap.set(normalizeSubject(s), s);
        });

        // 2. Thêm bất kỳ môn học nào có trong câu hỏi
        questions.forEach(q => {
            if (q.subject && q.subject.trim()) {
                const norm = normalizeSubject(q.subject);
                if (!subsMap.has(norm)) {
                    subsMap.set(norm, getDisplaySubject(q.subject));
                }
            }
        });

        // 3. Thêm bất kỳ môn học nào có trong danh mục chương
        chapters.forEach(c => {
            if (c.subject && c.subject.trim()) {
                const norm = normalizeSubject(c.subject);
                if (!subsMap.has(norm)) {
                    subsMap.set(norm, getDisplaySubject(c.subject));
                }
            }
        });

        return Array.from(subsMap.values());
    }, [questions, chapters]);

    // Lọc chương thông minh: chỉ hiển thị các chương thuộc Môn học và Khối lớp tương ứng
    const relevantChapters = useMemo(() => {
        return chapters.filter(c => {
            // 1. Lọc theo Khối lớp
            if (bGradeFilter !== 'all' && String(c.grade) !== String(bGradeFilter)) {
                return false;
            }

            // 2. Lọc theo Môn học
            if (isSuperAdmin) {
                if (bSubjectFilter && bSubjectFilter !== 'all') {
                    if (c.subject && c.subject.trim()) {
                        if (!isSameSubject(c.subject, bSubjectFilter)) return false;
                    } else {
                        // Chương chưa gán môn rõ ràng: kiểm tra xem có câu hỏi trong môn này không hoặc fallback Vật lí
                        const hasQuestionInSubject = questions.some(q => 
                            q.quizCategory === c.name && q.subject && isSameSubject(q.subject, bSubjectFilter)
                        );
                        const isPhysics = isSameSubject('Vật lí', bSubjectFilter) || isSameSubject('Vật lý', bSubjectFilter);
                        if (!hasQuestionInSubject && !isPhysics) return false;
                    }
                }
            } else if (currentUser?.subject) {
                if (c.subject && c.subject.trim()) {
                    if (!isSameSubject(c.subject, currentUser.subject)) return false;
                }
            }

            return true;
        });
    }, [chapters, bGradeFilter, bSubjectFilter, isSuperAdmin, currentUser?.subject, questions]);

    // Tự động reset bộ lọc Chương khi chuyển Môn hoặc Khối mà chương hiện tại không còn hợp lệ
    useEffect(() => {
        if (bChapterFilter !== 'all') {
            const isStillValid = relevantChapters.some(c => c.name.toLowerCase() === bChapterFilter.toLowerCase());
            if (!isStillValid) {
                setBChapterFilter('all');
            }
        }
    }, [relevantChapters, bChapterFilter, setBChapterFilter]);

    const canDeleteQuestion = (q: Question) => {
        if (isSuperAdmin) return true;
        if (currentUser?.id && q.createdBy === currentUser.id) return true;
        return false;
    };

    const filteredQuestions = useMemo(() => {
        return questions.filter(q => {
            // Lọc môn học (dành cho SuperAdmin hoặc bộ lọc ngoài)
            if (bSubjectFilter && bSubjectFilter !== 'all') {
                if (!isSameSubject(q.subject, bSubjectFilter)) return false;
            }

            // Lọc khối - Bình thường hóa chuỗi
            const qGradeRaw = (q.quizGrade || 'all').toString().trim();
            const matchGrade = bGradeFilter === 'all' || qGradeRaw === bGradeFilter;

            // Lọc chương
            const qChapter = (q.quizCategory || '').toString().trim().toLowerCase();
            const filterVal = bChapterFilter.trim().toLowerCase();
            const matchChapter = bChapterFilter === 'all' || qChapter === filterVal;
            
            // Lọc dạng - Quan trọng: Xử lý cả 'group_tf' và 'group-tf'
            let qTypeRaw = (q.type || 'mcq').toString().trim().toLowerCase().replace('_', '-');
            const targetType = bTypeFilter.toString().trim().toLowerCase().replace('_', '-');
            const matchType = bTypeFilter === 'all' || qTypeRaw === targetType;
            
            // Lọc mức độ nhận thức (B, H, VD, VDC)
            let matchLevel = true;
            if (bLevelFilter !== 'all') {
                if (q.level) {
                    matchLevel = q.level === bLevelFilter;
                } else if (q.subQuestions && q.subQuestions.length > 0) {
                    matchLevel = q.subQuestions.some(sq => sq.level === bLevelFilter);
                } else {
                    matchLevel = false;
                }
            }

            // Tìm kiếm
            const matchSearch = !bSearch || 
                              q.text.toLowerCase().includes(bSearch.toLowerCase()) ||
                              (q.quizTitle && q.quizTitle.toLowerCase().includes(bSearch.toLowerCase())) ||
                              (q.subject && q.subject.toLowerCase().includes(bSearch.toLowerCase()));
            
            return matchGrade && matchChapter && matchType && matchLevel && matchSearch;
        });
    }, [questions, bGradeFilter, bChapterFilter, bTypeFilter, bLevelFilter, bSearch, bSubjectFilter]);

    useEffect(() => { setVisibleCount(PAGE_SIZE); }, [bGradeFilter, bChapterFilter, bTypeFilter, bLevelFilter, bSearch, bSubjectFilter]);

    const toggleSelect = (id: string) => {
        const newIds = new Set(selectedIds);
        if (newIds.has(id)) newIds.delete(id);
        else newIds.add(id);
        setSelectedIds(newIds);
    };

    const handleSelectAll = () => {
        if (selectedIds.size === filteredQuestions.length && filteredQuestions.length > 0) setSelectedIds(new Set());
        else setSelectedIds(new Set(filteredQuestions.map(q => q.id)));
    };

    const duplicateCount = useMemo(() => {
        const counts = new Map<string, number>();
        questions.forEach(q => {
            const fp = getQuestionFingerprint(q);
            if (fp) counts.set(fp, (counts.get(fp) || 0) + 1);
        });
        let dupes = 0;
        counts.forEach(c => {
            if (c > 1) dupes += (c - 1);
        });
        return dupes;
    }, [questions]);

    const handleAddSelected = () => {
        const selectedQuestions = filteredQuestions
            .filter(q => selectedIds.has(q.id))
            .map(q => ({ 
                ...q, 
                id: uuidv4(),
                bankQuestionId: q.id // Lưu vết ID gốc từ Ngân hàng để chống trùng lặp khi đồng bộ
            }));
        if (selectedQuestions.length === 0) return alert("Vui lòng chọn ít nhất một câu hỏi!");
        onAddMultiple(selectedQuestions);
        setSelectedIds(new Set());
    };

    const handleConfirmDelete = async () => {
        if (!deleteModal || deleteModal.ids.length === 0) return;
        setIsDeleting(true);
        try {
            if (deleteModal.isBatch && onDeleteBatchQuestions) {
                await onDeleteBatchQuestions(deleteModal.ids);
            } else if (!deleteModal.isBatch && onDeleteQuestion) {
                await onDeleteQuestion(deleteModal.ids[0]);
            }
            const newSelected = new Set(selectedIds);
            deleteModal.ids.forEach(id => newSelected.delete(id));
            setSelectedIds(newSelected);
            setDeleteModal(null);
        } catch (err) {
            console.error("Lỗi khi xóa câu hỏi khỏi ngân hàng:", err);
        } finally {
            setIsDeleting(false);
        }
    };

    const visibleQuestions = useMemo(() => filteredQuestions.slice(0, visibleCount), [filteredQuestions, visibleCount]);

    const selectedDeletableCount = useMemo(() => {
        return Array.from(selectedIds).filter(id => {
            const q = questions.find(item => item.id === id);
            return q ? canDeleteQuestion(q) : false;
        }).length;
    }, [selectedIds, questions, isSuperAdmin, currentUser?.id]);

    return (
        <div className="space-y-4 animate-fade-in w-full max-w-full pb-10">
            {/* Status pill for teacher subject */}
            {currentUser?.subject && !isSuperAdmin && (
                <div className="bg-blue-50/80 border border-blue-200 px-4 py-2 rounded-xl flex items-center justify-between text-xs text-blue-900">
                    <span className="font-bold flex items-center gap-1.5">
                        <BookOpen size={14} className="text-blue-600"/> 
                        Ngân hàng câu hỏi bộ môn: <b className="text-blue-700 uppercase font-black">{currentUser.subject}</b>
                    </span>
                    <span className="text-[10px] text-blue-600 font-medium">
                        Dùng chung & tự động đồng bộ giữa các giáo viên dạy cùng môn {currentUser.subject}
                    </span>
                </div>
            )}

            {/* Duplicate detection alert & quick action (chỉ dành cho SuperAdmin) */}
            {isSuperAdmin && duplicateCount > 0 && onDeduplicate && (
                <div className="bg-amber-50 border border-amber-200 px-4 py-2.5 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-amber-900 shadow-sm">
                    <div className="flex items-center gap-2">
                        <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                        <span className="font-bold">
                            Phát hiện <b className="text-amber-700 underline">{duplicateCount}</b> câu hỏi có nội dung trùng lặp trong Ngân hàng {bSubjectFilter !== 'all' ? `(Môn ${bSubjectFilter})` : ''}.
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={onDeduplicate}
                        disabled={isDeduplicating}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[9px] font-black uppercase shadow transition-all disabled:opacity-50"
                    >
                        {isDeduplicating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                        Quét & Gộp {bSubjectFilter !== 'all' ? `Môn ${bSubjectFilter}` : 'Trùng lặp'}
                    </button>
                </div>
            )}

            <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm sticky top-0 z-30 flex flex-col md:flex-row gap-2">
                <div className="flex flex-wrap gap-2 shrink-0">
                    {/* Subject Filter (Chỉ hiển thị cho SuperAdmin, GV thường tự động theo môn đã phân quyền) */}
                    {isSuperAdmin && setBSubjectFilter && (
                        <select 
                            className="bg-amber-50 border border-amber-300 text-amber-900 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase outline-none cursor-pointer shadow-sm"
                            value={bSubjectFilter}
                            onChange={e => {
                                setBSubjectFilter(e.target.value);
                                setBChapterFilter('all');
                            }}
                        >
                            <option value="all">Môn: Tất cả</option>
                            {availableSubjects.map(s => (
                                <option key={s} value={s}>Môn {s}</option>
                            ))}
                        </select>
                    )}

                    <select 
                        className="bg-slate-50 border px-3 py-1.5 rounded-lg text-[9px] font-black uppercase outline-none" 
                        value={bGradeFilter} 
                        onChange={e => { 
                            setBGradeFilter(e.target.value as any); 
                            setBChapterFilter('all'); 
                        }}
                    >
                        <option value="all">Khối: Tất cả</option>
                        <option value="12">Khối 12</option>
                        <option value="11">Khối 11</option>
                        <option value="10">Khối 10</option>
                    </select>
                    <select 
                        className="bg-slate-50 border px-3 py-1.5 rounded-lg text-[9px] font-black uppercase outline-none max-w-[170px]" 
                        value={bChapterFilter} 
                        onChange={e => setBChapterFilter(e.target.value)}
                    >
                        <option value="all">Chương: Tất cả ({relevantChapters.length})</option>
                        {relevantChapters.map(c => (
                            <option key={c.id} value={c.name}>{(c.name || (c as any).title || "Chương chưa đặt tên").toUpperCase()}</option>
                        ))}
                    </select>
                    <select className="bg-slate-50 border px-3 py-1.5 rounded-lg text-[9px] font-black uppercase outline-none" value={bTypeFilter} onChange={e => setBTypeFilter(e.target.value as any)}>
                        <option value="all">Dạng: Tất cả</option>
                        <option value="mcq">P.I (MCQ)</option>
                        <option value="group-tf">P.II (D/S)</option>
                        <option value="short">P.III (Ngắn)</option>
                    </select>
                    <select className="bg-slate-50 border px-3 py-1.5 rounded-lg text-[9px] font-black uppercase outline-none" value={bLevelFilter} onChange={e => setBLevelFilter(e.target.value as any)}>
                        <option value="all">Mức độ: Tất cả</option>
                        <option value="B">🟢 [B] Biết</option>
                        <option value="H">🔵 [H] Hiểu</option>
                        <option value="VD">🟠 [VD] Vận dụng</option>
                        <option value="VDC">🔴 [VDC] Vận dụng cao</option>
                    </select>
                    <button 
                        onClick={() => { 
                            setBGradeFilter('all'); 
                            setBChapterFilter('all'); 
                            setBTypeFilter('all'); 
                            setBLevelFilter('all'); 
                            setBSearch('');
                            if (setBSubjectFilter) setBSubjectFilter('all');
                        }}
                        className="bg-red-50 text-red-500 border border-red-100 px-2 rounded-lg text-[8px] font-black uppercase hover:bg-red-100 transition-colors"
                    >
                        Xóa lọc
                    </button>
                </div>
                <div className="flex-1 flex items-center bg-slate-50 border rounded-lg px-3">
                    <Search size={14} className="text-slate-300"/>
                    <input className="bg-transparent p-1.5 text-[11px] font-medium outline-none w-full" placeholder="Tìm câu hỏi, môn học hoặc tên đề thi..." value={bSearch} onChange={e => setBSearch(e.target.value)} />
                </div>
                <div className="flex items-center gap-2 shrink-0 px-2">
                    <button onClick={handleSelectAll} className="flex items-center gap-1.5 text-[9px] font-black uppercase text-slate-400 hover:text-blue-600">
                        {selectedIds.size === filteredQuestions.length && filteredQuestions.length > 0 ? <CheckSquare size={14}/> : <Square size={14}/>}
                        Chọn {filteredQuestions.length} câu
                    </button>
                    
                    {/* Batch Delete Button */}
                    {(onDeleteBatchQuestions || onDeleteQuestion) && selectedDeletableCount > 0 && (
                        <button 
                            type="button"
                            onClick={() => {
                                const deletableIds = Array.from(selectedIds).filter(id => {
                                    const q = questions.find(item => item.id === id);
                                    return q ? canDeleteQuestion(q) : false;
                                });
                                if (deletableIds.length === 0) return;
                                setDeleteModal({
                                    isOpen: true,
                                    ids: deletableIds,
                                    isBatch: true
                                });
                            }}
                            className="px-3 py-2 rounded-lg text-[9px] font-black uppercase transition-all bg-red-50 text-red-600 border border-red-200 hover:bg-red-600 hover:text-white flex items-center gap-1.5 shadow-sm"
                            title="Xóa các câu hỏi đã chọn khỏi Ngân hàng"
                        >
                            <Trash2 size={13}/>
                            <span>Xóa ({selectedDeletableCount})</span>
                        </button>
                    )}

                    <button onClick={handleAddSelected} disabled={selectedIds.size === 0} className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${selectedIds.size > 0 ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}>
                        + Thêm {selectedIds.size} câu
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-2">
                {visibleQuestions.map((bq, idx) => {
                    const isSelected = selectedIds.has(bq.id);
                    const isDeletable = canDeleteQuestion(bq) && (onDeleteQuestion || onDeleteBatchQuestions);

                    return (
                        <div key={bq.id || idx} onClick={() => toggleSelect(bq.id)} className={`bg-white p-4 rounded-2xl border flex items-start gap-4 cursor-pointer transition-all relative group ${isSelected ? 'border-blue-500 bg-blue-50/20' : 'border-slate-100 hover:border-blue-200'}`}>
                            <div className={`mt-0.5 shrink-0 ${isSelected ? 'text-blue-600' : 'text-slate-200'}`}><CheckCircle2 size={24}/></div>
                            <div className="flex-1 min-w-0 pr-8">
                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                    <span className={`text-[8px] font-black px-2 py-0.5 rounded text-white ${bq.type === 'mcq' ? 'bg-blue-500' : bq.type.includes('tf') ? 'bg-purple-500' : 'bg-orange-500'}`}>
                                        {bq.type.toUpperCase()}
                                    </span>
                                    {bq.subject && (
                                        <span className="text-[8px] font-black px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase">
                                            Môn: {bq.subject}
                                        </span>
                                    )}
                                    {bq.level && (
                                        <span className={`text-[8px] font-black px-2 py-0.5 rounded text-white ${bq.level === 'B' ? 'bg-emerald-600' : bq.level === 'H' ? 'bg-blue-600' : bq.level === 'VD' ? 'bg-amber-600' : 'bg-red-600'}`}>
                                            [{bq.level}] {bq.level === 'B' ? 'Biết' : bq.level === 'H' ? 'Hiểu' : bq.level === 'VD' ? 'V.Dụng' : 'VDC'}
                                        </span>
                                    )}
                                    <span className="text-[8px] text-slate-400 font-bold uppercase">Khối {bq.quizGrade || 'all'}</span>
                                    {bq.quizCategory && <span className="text-[8px] text-purple-400 font-bold uppercase bg-purple-50 px-2 py-0.5 rounded border border-purple-100">{bq.quizCategory}</span>}
                                    {bq.quizTitle && (
                                        <span className="flex items-center gap-1 text-[8px] text-blue-400 font-black uppercase bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                            <BookOpen size={10}/> {bq.quizTitle}
                                        </span>
                                    )}
                                </div>
                                <div className="text-slate-800 text-sm font-bold leading-relaxed overflow-x-auto"><LatexText text={bq.text}/></div>
                                {bq.imageUrl && (
                                    <div className="mt-3">
                                        <img src={bq.imageUrl} alt="Hình minh họa" className="max-h-48 rounded-xl border border-slate-200 shadow-sm object-contain bg-white" />
                                    </div>
                                )}
                                {bq.type === 'group-tf' && bq.subQuestions && bq.subQuestions.some(sq => sq.level) && (
                                    <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-slate-100">
                                        {bq.subQuestions.map((sq, sqi) => (
                                             <span key={sqi} className="text-[9px] font-bold text-slate-600 flex items-center gap-1">
                                                <span>{String.fromCharCode(97+sqi)})</span>
                                                {sq.level && (
                                                    <span className={`text-[8px] font-black px-1.5 py-0.2 rounded text-white ${sq.level === 'B' ? 'bg-emerald-600' : sq.level === 'H' ? 'bg-blue-600' : sq.level === 'VD' ? 'bg-amber-600' : 'bg-red-600'}`}>
                                                        {sq.level}
                                                    </span>
                                                )}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Delete single question button */}
                            {isDeletable && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteModal({
                                            isOpen: true,
                                            ids: [bq.id],
                                            isBatch: false,
                                            questionPreview: bq.text
                                        });
                                    }}
                                    className="absolute top-3 right-3 p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all opacity-80 group-hover:opacity-100"
                                    title="Xóa câu hỏi này khỏi Ngân hàng"
                                >
                                    <Trash2 size={16}/>
                                </button>
                            )}
                        </div>
                    );
                })}

                {visibleQuestions.length === 0 && (
                    <div className="py-20 text-center space-y-4">
                        <X className="mx-auto text-slate-200" size={48}/>
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest italic">Không tìm thấy câu hỏi nào</p>
                    </div>
                )}

                {visibleCount < filteredQuestions.length && (
                    <div className="py-6 text-center">
                        <button onClick={(e) => { e.stopPropagation(); setVisibleCount(prev => prev + PAGE_SIZE); }} className="px-10 py-3 bg-white border-2 border-slate-100 rounded-full text-[10px] font-black uppercase text-slate-500 shadow-sm hover:bg-slate-900 hover:text-white transition-all">Tải thêm câu hỏi</button>
                    </div>
                )}
            </div>

            {/* In-component Delete Confirmation Modal */}
            {deleteModal && deleteModal.isOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[6000] flex items-center justify-center p-4">
                    <div className="bg-white max-w-md w-full rounded-3xl border shadow-2xl p-6 overflow-hidden animate-scale-up space-y-4">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-red-50 text-red-600 rounded-2xl shrink-0">
                                <AlertTriangle size={24}/>
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-base font-black text-slate-900 uppercase">
                                    {deleteModal.isBatch ? "Xác nhận xóa hàng loạt" : "Xác nhận xóa câu hỏi"}
                                </h3>
                                <p className="text-xs text-slate-500 mt-1">
                                    {deleteModal.isBatch 
                                        ? `Bạn có chắc chắn muốn xóa vĩnh viễn ${deleteModal.ids.length} câu hỏi đã chọn khỏi Ngân hàng câu hỏi không?`
                                        : "Bạn có chắc chắn muốn xóa vĩnh viễn câu hỏi này khỏi Ngân hàng câu hỏi không?"}
                                </p>
                                {!deleteModal.isBatch && deleteModal.questionPreview && (
                                    <div className="mt-2 p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-700 font-medium max-h-24 overflow-y-auto line-clamp-3">
                                        <LatexText text={deleteModal.questionPreview} />
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setDeleteModal(null)}
                                disabled={isDeleting}
                                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase transition-all disabled:opacity-50"
                            >
                                Hủy
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmDelete}
                                disabled={isDeleting}
                                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black uppercase transition-all flex items-center gap-2 shadow-lg shadow-red-200 disabled:opacity-50"
                            >
                                {isDeleting ? <Loader2 size={16} className="animate-spin"/> : <Trash2 size={16}/>}
                                <span>{isDeleting ? "Đang xóa..." : "Xác nhận xóa"}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
