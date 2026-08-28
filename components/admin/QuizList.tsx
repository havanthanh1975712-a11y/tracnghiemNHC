
import React, { useState, useEffect, useMemo } from 'react';
import { Quiz, Result, Grade, Chapter, ClassRoom, User } from '../../types';
import { 
  Edit, Trash2, Eye, Users, Filter, FileText, ChevronDown, Link as LinkIcon, 
  EyeOff, ShieldCheck, GraduationCap, Share2, User as UserIcon, Lock, BookOpen,
  Check, X, CheckSquare, Square, Info, Sparkles, Send, Layers, AlertCircle
} from 'lucide-react';
import { isSameSubject, STANDARD_SUBJECTS, normalizeSubject, getDisplaySubject } from '../../services/subjectUtils';

interface QuizListProps {
    quizzes: Quiz[];
    results: Result[];
    chapters: Chapter[];
    classes?: ClassRoom[];
    currentUser?: User;
    teachers?: User[];
    onEdit: (quiz: Quiz) => void;
    onDelete: (id: string) => void;
    onPreview: (quiz: Quiz) => void;
    onAssignClasses?: (quiz: Quiz, selectedClassIds: string[]) => Promise<void>;
    qSearch: string;
    setQSearch: (val: string) => void;
    qGradeFilter: Grade | 'all';
    setQGradeFilter: (val: Grade | 'all') => void;
    qChapterFilter: string;
    setQChapterFilter: (val: string) => void;
    qSubjectFilter?: string;
    setQSubjectFilter?: (val: string) => void;
}

const PAGE_SIZE = 12;

type QuickFilterType = 'all' | 'open' | 'draft' | 'expired' | 'class' | 'grade';

export const getQuizStatus = (q: Quiz) => {
    const now = new Date();
    const startX = q.startTime ? new Date(q.startTime) : null;
    const endY = q.endTime ? new Date(q.endTime) : null;
    const isFlexibleWindow = Boolean(startX && endY && endY.getTime() > startX.getTime());

    let isStarted = true;
    let isExpired = false;

    if (q.type === 'test') {
        if (startX) {
            if (isFlexibleWindow && endY) {
                isStarted = now.getTime() >= startX.getTime();
                isExpired = now.getTime() > endY.getTime();
            } else {
                const globalEnd = new Date(startX.getTime() + (q.durationMinutes || 0) * 60000);
                isStarted = now.getTime() >= startX.getTime();
                isExpired = now.getTime() > globalEnd.getTime();
            }
        }
    } else {
        isStarted = true;
        isExpired = Boolean(endY && now.getTime() > endY.getTime());
    }

    const isDraft = !q.isPublished;
    const isOpen = q.isPublished && isStarted && !isExpired;
    const isExpiredState = q.isPublished && isExpired;
    const isClassTargeted = q.targetType === 'classes' && Boolean(q.assignedClassIds && q.assignedClassIds.length > 0);
    const isGradeTargeted = !isClassTargeted;

    return {
        isDraft,
        isOpen,
        isExpired: isExpiredState,
        isClassTargeted,
        isGradeTargeted,
        isActive: isStarted && !isExpired
    };
};

export default function QuizList({ 
    quizzes, results, chapters, classes = [], currentUser, teachers = [],
    onEdit, onDelete, onPreview, onAssignClasses,
    qSearch, setQSearch, qGradeFilter, setQGradeFilter,
    qChapterFilter, setQChapterFilter,
    qSubjectFilter: propSubjectFilter,
    setQSubjectFilter: propSetSubjectFilter
}: QuizListProps) {
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const [authorFilter, setAuthorFilter] = useState<string>('all'); // 'all' | 'mine' | 'shared' | specific_teacher_id
    const [quickFilter, setQuickFilter] = useState<QuickFilterType>('all');
    const [localSubjectFilter, setLocalSubjectFilter] = useState<string>('all');

    const isSuperAdmin = currentUser?.role === 'superadmin';

    // Subject filter state (sync between prop and local state)
    const qSubjectFilter = propSubjectFilter !== undefined ? propSubjectFilter : localSubjectFilter;
    const setQSubjectFilter = propSetSubjectFilter !== undefined ? propSetSubjectFilter : setLocalSubjectFilter;

    // Danh sách tất cả môn học có sẵn trong hệ thống (đã chuẩn hóa và khử trùng lặp)
    const availableSubjects = useMemo(() => {
        const subsMap = new Map<string, string>();
        STANDARD_SUBJECTS.forEach(s => {
            subsMap.set(normalizeSubject(s), s);
        });
        quizzes.forEach(q => {
            if (q.subject && q.subject.trim()) {
                const norm = normalizeSubject(q.subject);
                if (!subsMap.has(norm)) {
                    subsMap.set(norm, getDisplaySubject(q.subject));
                }
            }
        });
        chapters.forEach(c => {
            if (c.subject && c.subject.trim()) {
                const norm = normalizeSubject(c.subject);
                if (!subsMap.has(norm)) {
                    subsMap.set(norm, getDisplaySubject(c.subject));
                }
            }
        });
        teachers.forEach(t => {
            if (t.subject && t.subject.trim()) {
                const norm = normalizeSubject(t.subject);
                if (!subsMap.has(norm)) {
                    subsMap.set(norm, getDisplaySubject(t.subject));
                }
            }
        });
        return Array.from(subsMap.values());
    }, [quizzes, chapters, teachers]);

    // Lọc giáo viên thông minh theo môn học được chọn (cho SuperAdmin)
    const filteredTeachers = useMemo(() => {
        if (!isSuperAdmin) return teachers;
        if (qSubjectFilter === 'all') return teachers;
        return teachers.filter(t => t.subject && isSameSubject(t.subject, qSubjectFilter));
    }, [teachers, isSuperAdmin, qSubjectFilter]);

    // Lọc chương thông minh: phù hợp với CẢ Khối và Môn học được chọn
    const relevantChapters = useMemo(() => {
        return chapters.filter(c => {
            // Lọc theo Khối
            if (qGradeFilter !== 'all' && String(c.grade) !== String(qGradeFilter)) return false;
            
            // Lọc theo Môn học
            if (isSuperAdmin) {
                if (qSubjectFilter !== 'all') {
                    if (c.subject && c.subject.trim()) {
                        if (!isSameSubject(c.subject, qSubjectFilter)) return false;
                    } else {
                        // Chương chưa gán môn: kiểm tra đề thi thuộc chương hoặc fallback môn Vật lí
                        const hasQuizWithSubj = quizzes.some(q => 
                            q.category === c.name && (
                                (q.subject && isSameSubject(q.subject, qSubjectFilter)) ||
                                (!q.subject && (isSameSubject('Vật lí', qSubjectFilter) || isSameSubject('Vật lý', qSubjectFilter)))
                            )
                        );
                        const isPhysics = isSameSubject('Vật lí', qSubjectFilter) || isSameSubject('Vật lý', qSubjectFilter);
                        if (!hasQuizWithSubj && !isPhysics) return false;
                    }
                }
            } else if (currentUser?.subject) {
                if (c.subject && c.subject.trim()) {
                    if (!isSameSubject(c.subject, currentUser.subject)) return false;
                }
            }
            return true;
        });
    }, [chapters, qGradeFilter, qSubjectFilter, isSuperAdmin, currentUser?.subject, quizzes]);

    // Tự động reset bộ lọc Chương khi chương đang chọn không còn nằm trong danh sách chương phù hợp
    useEffect(() => {
        if (qChapterFilter !== 'all') {
            const isStillValid = relevantChapters.some(c => c.name === qChapterFilter);
            if (!isStillValid) {
                setQChapterFilter('all');
            }
        }
    }, [relevantChapters, qChapterFilter, setQChapterFilter]);

    // Tự động reset bộ lọc Giáo viên khi giáo viên đang chọn không còn thuộc môn học mới
    useEffect(() => {
        if (isSuperAdmin && authorFilter !== 'all') {
            const isStillValid = filteredTeachers.some(t => t.id === authorFilter);
            if (!isStillValid) {
                setAuthorFilter('all');
            }
        }
    }, [filteredTeachers, authorFilter, isSuperAdmin]);

    const baseFiltered = useMemo(() => {
        return quizzes.filter(q => {
            const creator = teachers.find(t => t.id === q.createdBy);
            const effectiveSubject = q.subject || creator?.subject;

            // 1. Lọc theo Môn học (cho SuperAdmin)
            if (isSuperAdmin) {
                if (qSubjectFilter !== 'all') {
                    if (!effectiveSubject || !isSameSubject(effectiveSubject, qSubjectFilter)) {
                        return false;
                    }
                }
            }

            // 2. Lọc theo Khối
            if (qGradeFilter !== 'all' && q.grade !== qGradeFilter) return false;
            
            // 3. Lọc theo Chương
            if (qChapterFilter !== 'all' && q.category !== qChapterFilter) return false;
            
            // 4. Tìm kiếm từ khóa
            if (qSearch.trim() && !q.title.toLowerCase().includes(qSearch.toLowerCase())) return false;

            // 5. Role & Author Filter
            if (isSuperAdmin) {
                if (authorFilter !== 'all' && q.createdBy !== authorFilter) {
                    return false;
                }
            } else {
                // Teacher (Admin)
                const isMine = !q.createdBy || q.createdBy === currentUser?.id;
                const isShared = Boolean(q.isSharedWithTeachers);

                // By default, teacher can only see their own quizzes OR shared quizzes
                if (!isMine && !isShared) return false;

                // Nếu là đề của giáo viên khác chia sẻ: chỉ hiển thị cho GV cùng tổ bộ môn
                if (isShared && !isMine && currentUser?.subject) {
                    if (effectiveSubject && !isSameSubject(effectiveSubject, currentUser.subject)) {
                        return false;
                    }
                }

                if (authorFilter === 'mine' && !isMine) return false;
                if (authorFilter === 'shared' && isMine) return false;
            }

            return true;
        });
    }, [quizzes, qSubjectFilter, qGradeFilter, qChapterFilter, qSearch, isSuperAdmin, authorFilter, currentUser, teachers]);

    const counts = useMemo(() => {
        let all = 0;
        let open = 0;
        let draft = 0;
        let expired = 0;
        let byClass = 0;
        let byGrade = 0;

        baseFiltered.forEach(q => {
            all++;
            const status = getQuizStatus(q);
            if (status.isOpen) open++;
            if (status.isDraft) draft++;
            if (status.isExpired) expired++;
            if (status.isClassTargeted) byClass++;
            if (status.isGradeTargeted) byGrade++;
        });

        return { all, open, draft, expired, byClass, byGrade };
    }, [baseFiltered]);

    const filtered = useMemo(() => {
        return baseFiltered.filter(q => {
            if (quickFilter === 'all') return true;
            const status = getQuizStatus(q);
            if (quickFilter === 'open') return status.isOpen;
            if (quickFilter === 'draft') return status.isDraft;
            if (quickFilter === 'expired') return status.isExpired;
            if (quickFilter === 'class') return status.isClassTargeted;
            if (quickFilter === 'grade') return status.isGradeTargeted;
            return true;
        }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [baseFiltered, quickFilter]);

    useEffect(() => {
        setVisibleCount(PAGE_SIZE);
    }, [qSearch, qSubjectFilter, qGradeFilter, qChapterFilter, authorFilter, quickFilter]);

    const visibleQuizzes = filtered.slice(0, visibleCount);

    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [assigningQuiz, setAssigningQuiz] = useState<Quiz | null>(null);
    const [selectedClassIdsForAssign, setSelectedClassIdsForAssign] = useState<string[]>([]);
    const [isSavingAssign, setIsSavingAssign] = useState<boolean>(false);
    const [assignGradeFilter, setAssignGradeFilter] = useState<'matching' | 'all'>('matching');
    const [assignSearchClass, setAssignSearchClass] = useState<string>('');

    const openAssignModal = (q: Quiz) => {
        setAssigningQuiz(q);
        setSelectedClassIdsForAssign(q.assignedClassIds || []);
        setAssignGradeFilter('matching');
        setAssignSearchClass('');
    };

    const handleSaveAssignment = async () => {
        if (!assigningQuiz) return;
        setIsSavingAssign(true);
        try {
            if (onAssignClasses) {
                await onAssignClasses(assigningQuiz, selectedClassIdsForAssign);
            }
            setAssigningQuiz(null);
        } catch (err) {
            console.error("Lỗi giao đề:", err);
        } finally {
            setIsSavingAssign(false);
        }
    };

    // Lọc danh sách lớp có thể phân công
    const classesForAssignment = useMemo(() => {
        if (!assigningQuiz) return [];
        let list = classes || [];
        // Nếu là GV thường: ưu tiên lớp do GV tạo hoặc lớp được chia sẻ
        if (!isSuperAdmin) {
            list = list.filter(c => (c.createdBy && c.createdBy === currentUser?.id) || c.isSharedWithTeachers);
        }
        // Lọc theo khối tương ứng nếu đang chọn 'matching'
        if (assignGradeFilter === 'matching' && assigningQuiz.grade !== 'all') {
            list = list.filter(c => String(c.grade) === String(assigningQuiz.grade) || c.grade === 'all');
        }
        // Tìm kiếm lớp
        if (assignSearchClass.trim()) {
            const query = assignSearchClass.trim().toLowerCase();
            list = list.filter(c => c.name.toLowerCase().includes(query) || (c.academicYear && c.academicYear.toLowerCase().includes(query)));
        }
        return list;
    }, [classes, assigningQuiz, isSuperAdmin, currentUser?.id, assignGradeFilter, assignSearchClass]);

    const copyQuizLink = (quizId: string) => {
        const url = `${window.location.origin}/?quiz=${quizId}`;
        navigator.clipboard.writeText(url).then(() => {
            setCopiedId(quizId);
            setTimeout(() => setCopiedId(null), 3000);
        });
    };

    return (
        <div className="space-y-8 animate-fade-in relative">
            {copiedId && (
                <div className="fixed bottom-6 right-6 z-[6000] bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 border border-white/20 animate-bounce text-xs font-bold">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"/>
                    Đã sao chép link đề thi ẩn vào bộ nhớ tạm!
                </div>
            )}
            {/* Filter Bar */}
            <div className="flex flex-col gap-4 bg-white p-5 lg:p-6 rounded-[2rem] border shadow-sm">
                <div className="flex flex-col lg:flex-row gap-4 items-center">
                    <div className="flex-1 w-full relative">
                        <input 
                            className="w-full p-4 bg-slate-50 border rounded-2xl outline-none text-xs font-bold pl-10 text-slate-800" 
                            placeholder="Tìm tên đề thi..." 
                            value={qSearch} 
                            onChange={e => setQSearch(e.target.value)} 
                        />
                        <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={14}/>
                    </div>
                    <div className="flex flex-wrap gap-3 w-full lg:w-auto">
                        {/* Dropdown Môn học (Dành riêng cho SuperAdmin hoặc hiển thị cho toàn trường) */}
                        {isSuperAdmin ? (
                            <div className="flex items-center gap-1.5 bg-purple-50 px-3 py-1 rounded-xl border border-purple-200 shadow-sm">
                                <BookOpen size={14} className="text-purple-600 shrink-0" />
                                <select 
                                    className="bg-transparent py-2 text-[10px] font-black text-purple-900 uppercase outline-none cursor-pointer" 
                                    value={qSubjectFilter} 
                                    onChange={e => setQSubjectFilter(e.target.value)}
                                >
                                    <option value="all">TẤT CẢ MÔN (SUPERADMIN)</option>
                                    {availableSubjects.map(s => (
                                        <option key={s} value={s}>MÔN {s.toUpperCase()}</option>
                                    ))}
                                </select>
                            </div>
                        ) : (
                            currentUser?.subject && (
                                <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
                                    <BookOpen size={13} className="text-indigo-500 shrink-0" />
                                    <span className="text-[10px] font-black uppercase text-slate-700">
                                        MÔN {currentUser.subject.toUpperCase()}
                                    </span>
                                </div>
                            )
                        )}

                        {/* Dropdown Khối */}
                        <select 
                            className="flex-1 lg:w-36 px-4 py-3 bg-white border rounded-xl text-[10px] font-black uppercase outline-none cursor-pointer" 
                            value={qGradeFilter} 
                            onChange={e => { setQGradeFilter(e.target.value as any); }}
                        >
                            <option value="all">TẤT CẢ KHỐI</option>
                            <option value="12">KHỐI 12</option>
                            <option value="11">KHỐI 11</option>
                            <option value="10">KHỐI 10</option>
                        </select>

                        {/* Dropdown Chương (Tự động lọc theo Khối & Môn học) */}
                        <select 
                            className="flex-1 lg:w-48 px-4 py-3 bg-white border rounded-xl text-[10px] font-black uppercase outline-none cursor-pointer" 
                            value={qChapterFilter} 
                            onChange={e => setQChapterFilter(e.target.value)}
                        >
                            <option value="all">TẤT CẢ CHƯƠNG ({relevantChapters.length})</option>
                            {relevantChapters.map(c => (
                                <option key={c.id} value={c.name}>{c.name || (c as any).title || "Chương chưa đặt tên"}</option>
                            ))}
                        </select>

                        {/* Dropdown Giáo viên (Tự động lọc theo Môn học) */}
                        {isSuperAdmin ? (
                            <select 
                                className="flex-1 lg:w-48 px-4 py-3 bg-amber-50/50 border border-amber-200 text-amber-900 rounded-xl text-[10px] font-black uppercase outline-none cursor-pointer"
                                value={authorFilter}
                                onChange={e => setAuthorFilter(e.target.value)}
                            >
                                <option value="all">👤 TẤT CẢ GIÁO VIÊN ({filteredTeachers.length})</option>
                                {filteredTeachers.map(t => (
                                    <option key={t.id} value={t.id}>
                                        GV: {t.fullName} {t.subject ? `(${t.subject})` : ''}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <select 
                                className="flex-1 lg:w-48 px-4 py-3 bg-blue-50/50 border border-blue-200 text-blue-900 rounded-xl text-[10px] font-black uppercase outline-none cursor-pointer"
                                value={authorFilter}
                                onChange={e => setAuthorFilter(e.target.value)}
                            >
                                <option value="all">📚 TẤT CẢ ĐỀ TRUY CẬP</option>
                                <option value="mine">✏️ ĐỀ CỦA TÔI</option>
                                <option value="shared">🤝 ĐỀ GV CÙNG BỘ MÔN CHIA SẺ</option>
                            </select>
                        )}
                    </div>
                </div>

                {/* Quick Filter Pill Sub-bar */}
                <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 shrink-0 select-none mr-1">
                        LỌC NHANH:
                    </span>
                    
                    <button
                        onClick={() => setQuickFilter('all')}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black uppercase transition-all shadow-sm ${
                            quickFilter === 'all'
                                ? 'bg-slate-900 text-white shadow-md'
                                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                        TẤT CẢ ({counts.all})
                    </button>

                    <button
                        onClick={() => setQuickFilter('open')}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black uppercase transition-all shadow-sm ${
                            quickFilter === 'open'
                                ? 'bg-slate-900 text-white shadow-md'
                                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-emerald-300'
                        }`}
                    >
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 inline-block"/>
                        ĐANG MỞ ({counts.open})
                    </button>

                    <button
                        onClick={() => setQuickFilter('draft')}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black uppercase transition-all shadow-sm ${
                            quickFilter === 'draft'
                                ? 'bg-slate-900 text-white shadow-md'
                                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                        }`}
                    >
                        <span className="w-2.5 h-2.5 rounded-full border-2 border-slate-400 bg-white shrink-0 inline-block"/>
                        BẢN NHÁP ({counts.draft})
                    </button>

                    <button
                        onClick={() => setQuickFilter('expired')}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black uppercase transition-all shadow-sm ${
                            quickFilter === 'expired'
                                ? 'bg-slate-900 text-white shadow-md'
                                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-amber-300'
                        }`}
                    >
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0 inline-block"/>
                        HẾT HẠN ({counts.expired})
                    </button>

                    <button
                        onClick={() => setQuickFilter('class')}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black uppercase transition-all shadow-sm ${
                            quickFilter === 'class'
                                ? 'bg-slate-900 text-white shadow-md'
                                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-indigo-300'
                        }`}
                    >
                        <span className="text-sm leading-none">🏫</span>
                        THEO LỚP ({counts.byClass})
                    </button>

                    <button
                        onClick={() => setQuickFilter('grade')}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black uppercase transition-all shadow-sm ${
                            quickFilter === 'grade'
                                ? 'bg-slate-900 text-white shadow-md'
                                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-sky-300'
                        }`}
                    >
                        <span className="text-sm leading-none">🌐</span>
                        TOÀN KHỐI ({counts.byGrade})
                    </button>
                </div>
            </div>

            {/* Quizzes Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {visibleQuizzes.map(q => {
                    const isMine = !q.createdBy || q.createdBy === currentUser?.id;
                    const canManage = isSuperAdmin || isMine;

                    const count = (q as any).questionCount || 0;
                    const attempts = (q as any).attemptCount || 0;
                    
                    const now = new Date();
                    const startX = q.startTime ? new Date(q.startTime) : null;
                    const endY = q.endTime ? new Date(q.endTime) : null;
                    const isFlexibleWindow = Boolean(startX && endY && endY.getTime() > startX.getTime());

                    let isStarted = true;
                    let isExpired = false;

                    if (q.type === 'test') {
                        if (startX) {
                            if (isFlexibleWindow && endY) {
                                isStarted = now.getTime() >= startX.getTime();
                                isExpired = now.getTime() > endY.getTime();
                            } else {
                                const globalEnd = new Date(startX.getTime() + q.durationMinutes * 60000);
                                isStarted = now.getTime() >= startX.getTime();
                                isExpired = now.getTime() > globalEnd.getTime();
                            }
                        }
                    } else {
                        isStarted = true;
                        isExpired = Boolean(endY && now.getTime() > endY.getTime());
                    }
                    const isActive = isStarted && !isExpired;
                    
                    let cardStyle = "";
                    if (!q.isPublished) {
                        cardStyle = "bg-slate-50 border-dashed border-slate-300 opacity-75";
                    } else if (isExpired) {
                        cardStyle = "bg-amber-50/50 border-b-amber-500 border-amber-200 shadow-sm";
                    } else if (q.isUnlisted) {
                        cardStyle = "bg-indigo-50/30 border-b-indigo-500 border-indigo-100 shadow-sm";
                    } else {
                        cardStyle = "bg-white shadow-sm border-b-blue-600 border-slate-100";
                    }

                    return (
                        <div 
                            key={q.id} 
                            className={`rounded-[2.5rem] p-6 border transition-all flex flex-col group relative overflow-hidden border-b-8 ${cardStyle}`}
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex flex-col gap-1.5 flex-1 pr-2">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-tight w-fit ${q.isPublished ? (isExpired ? 'bg-amber-600 text-white' : (q.isUnlisted ? 'bg-indigo-600 text-white' : 'bg-blue-50 text-blue-600')) : 'bg-slate-200 text-slate-500'}`}>
                                            KHỐI {q.grade}
                                        </span>
                                        {((q.subject) || (teachers.find(t => t.id === q.createdBy)?.subject)) && (
                                            <span className="px-2 py-1 bg-purple-50 border border-purple-200 text-purple-700 rounded-lg text-[8px] font-black uppercase flex items-center gap-1 shadow-sm">
                                                <BookOpen size={10} className="text-purple-600"/>
                                                {q.subject || teachers.find(t => t.id === q.createdBy)?.subject}
                                            </span>
                                        )}
                                        {q.targetType === 'classes' && q.assignedClassIds && q.assignedClassIds.length > 0 && (
                                            <span className="px-2 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-[8px] font-black uppercase flex items-center gap-1 shadow-sm">
                                                <GraduationCap size={11}/>
                                                {(() => {
                                                    const assignedNames = q.assignedClassIds.map(id => {
                                                        const found = classes?.find(c => c.id === id);
                                                        return found ? `${found.name} (${found.academicYear})` : id;
                                                    });
                                                    if (assignedNames.length === 1) return `Lớp ${assignedNames[0]}`;
                                                    return `Giao ${assignedNames.length} lớp`;
                                                })()}
                                            </span>
                                        )}
                                        {q.isPublished && (
                                            isExpired ? (
                                                <span className="px-2 py-1 bg-white border border-amber-200 text-amber-600 rounded-lg text-[8px] font-black uppercase flex items-center gap-1 shadow-sm">
                                                    HẾT HẠN
                                                </span>
                                            ) : (
                                                <span className={`px-2 py-1 bg-white border ${isActive ? 'border-emerald-200 text-emerald-600' : 'border-amber-200 text-amber-600'} rounded-lg text-[8px] font-black uppercase flex items-center gap-1 shadow-sm`}>
                                                    {isActive ? 'ĐANG MỞ' : 'CHƯA ĐẾN GIỜ'}
                                                </span>
                                            )
                                        )}
                                        {q.isPublished && q.isUnlisted && (
                                            <span className="px-2 py-1 bg-white border border-indigo-200 text-indigo-600 rounded-lg text-[8px] font-black uppercase flex items-center gap-1 shadow-sm">
                                                <EyeOff size={10}/> RIÊNG TƯ
                                            </span>
                                        )}
                                        {q.isMonitored && (
                                            <span className="p-1 bg-red-50 text-red-500 rounded-md" title="Có giám sát">
                                                <ShieldCheck size={10}/>
                                            </span>
                                        )}
                                    </div>

                                    {/* Author & Share badge */}
                                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                                        {q.createdByName ? (
                                            <span className="text-[9px] font-bold text-slate-500 flex items-center gap-1">
                                                <UserIcon size={10} className="text-slate-400"/>
                                                {isMine ? 'Bạn (Tác giả)' : `GV: ${q.createdByName}`}
                                            </span>
                                        ) : (
                                            <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1">
                                                <UserIcon size={10}/> Hệ thống
                                            </span>
                                        )}

                                        {q.isSharedWithTeachers && (
                                            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-200 rounded text-[8px] font-black uppercase flex items-center gap-1" title="Đã chia sẻ cho các giáo viên cùng tổ bộ môn">
                                                <Share2 size={9}/> Chia sẻ cùng môn
                                            </span>
                                        )}
                                    </div>

                                    {q.category && <span className="text-[8px] font-bold uppercase truncate max-w-[150px] text-slate-400">{q.category}</span>}
                                </div>

                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all z-10">
                                    {q.isUnlisted && (
                                        <button onClick={() => copyQuizLink(q.id)} className="p-2 bg-indigo-600 text-white border border-indigo-700 rounded-lg hover:bg-black shadow-lg transition-colors" title="Copy Link Riêng Tư">
                                            <LinkIcon size={14}/>
                                        </button>
                                    )}
                                    {canManage ? (
                                        <>
                                            <button onClick={() => onEdit(q)} className="p-2 bg-white border rounded-lg hover:bg-slate-900 hover:text-white shadow-sm transition-colors" title="Sửa đề"><Edit size={14}/></button>
                                            <button onClick={() => onDelete(q.id)} className="p-2 bg-red-50 border border-red-100 rounded-lg hover:bg-red-500 hover:text-white shadow-sm transition-colors" title="Xóa đề"><Trash2 size={14}/></button>
                                        </>
                                    ) : (
                                        <span className="p-2 text-slate-300" title="Đề thi của giáo viên khác (Chỉ xem)">
                                            <Lock size={14}/>
                                        </span>
                                    )}
                                </div>
                            </div>
                            
                            <h3 className={`font-black text-sm mb-4 line-clamp-2 min-h-[40px] leading-tight uppercase transition-colors ${q.isPublished ? 'text-slate-800' : 'text-slate-500'}`}>
                                {q.title}
                            </h3>
                            
                            <div className="grid grid-cols-2 gap-3 mb-6">
                                <div className={`${q.isPublished ? 'bg-white border-slate-100' : 'bg-slate-200/50 border-slate-200'} rounded-xl p-2 flex flex-col items-center justify-center border shadow-sm`}>
                                    <FileText size={12} className={q.isUnlisted ? "text-indigo-500" : "text-blue-500"}/>
                                    <span className={`text-[9px] font-black ${q.isPublished ? 'text-slate-700' : 'text-slate-500'}`}>{q.questionCount || 0} CÂU</span>
                                </div>
                                <div className="bg-white rounded-xl p-2 flex flex-col items-center justify-center border border-slate-100 shadow-sm">
                                    <Users size={12} className="text-slate-400"/>
                                    <span className="text-[9px] font-black text-slate-700">
                                        {results.filter(r => r.quizId === q.id).length} LƯỢT
                                    </span>
                                </div>
                            </div>

                            <div className="mt-auto flex gap-2 pt-2">
                                <button 
                                    onClick={() => onPreview(q)} 
                                    className="flex-1 py-2.5 px-2 rounded-xl text-[9px] font-black uppercase flex items-center justify-center gap-1.5 transition-all bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 shadow-sm active:scale-95"
                                    title="Xem chi tiết & Xuất file Word (.doc) / JSON (.json)"
                                >
                                    <Eye size={13}/> Xem & In
                                </button>
                                <button 
                                    onClick={() => openAssignModal(q)} 
                                    className={`flex-1 py-2.5 px-2 rounded-xl text-[9px] font-black uppercase flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 text-white ${
                                        !isMine 
                                            ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200' 
                                            : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
                                    }`}
                                    title={!isMine ? "Giao đề chia sẻ này cho lớp bạn phụ trách" : "Giao đề cho các lớp học"}
                                >
                                    <GraduationCap size={14}/> Giao Lớp
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {visibleCount < filtered.length && (
                <div className="py-10 text-center">
                    <button 
                        onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
                        className="inline-flex items-center gap-2 px-10 py-4 bg-white border-2 border-slate-200 rounded-full text-[10px] font-black uppercase text-slate-500 hover:bg-slate-900 hover:text-white transition-all shadow-xl"
                    >
                        <ChevronDown size={16}/> Tải thêm đề thi (Còn {filtered.length - visibleCount})
                    </button>
                </div>
            )}
            
            {filtered.length === 0 && (
                <div className="py-20 text-center text-slate-300 font-black uppercase text-[10px] italic tracking-widest">Không tìm thấy đề thi nào</div>
            )}

            {/* Modal Giao đề cho Lớp học */}
            {assigningQuiz && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[5000] flex items-center justify-center p-3 md:p-6 animate-fade-in">
                    <div className="bg-white rounded-[2.5rem] max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border-4 border-white animate-scale-up">
                        
                        {/* Header Modal */}
                        <div className="p-6 bg-slate-900 text-white flex justify-between items-center gap-4 shrink-0 border-b border-slate-800">
                            <div className="flex items-center gap-3">
                                <div className={`p-3 rounded-2xl ${
                                    (!assigningQuiz.createdBy || assigningQuiz.createdBy === currentUser?.id)
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-emerald-600 text-white'
                                } shadow-lg`}>
                                    <GraduationCap size={24}/>
                                </div>
                                <div>
                                    <h3 className="text-base font-black uppercase tracking-tight leading-tight">
                                        GIAO ĐỀ CHO LỚP HỌC
                                    </h3>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                                        Khối {assigningQuiz.grade} {assigningQuiz.subject ? `• Môn ${assigningQuiz.subject}` : ''}
                                    </p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setAssigningQuiz(null)}
                                className="p-2.5 bg-slate-800 hover:bg-red-600 rounded-xl text-slate-400 hover:text-white transition-colors"
                            >
                                <X size={20}/>
                            </button>
                        </div>

                        {/* Body Modal */}
                        <div className="p-6 overflow-y-auto space-y-5 custom-scrollbar">
                            
                            {/* Quiz info banner */}
                            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <span className="text-xs font-black uppercase text-slate-800 line-clamp-1">
                                        {assigningQuiz.title}
                                    </span>
                                    <span className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[9px] font-black uppercase text-slate-600 shadow-sm">
                                        {assigningQuiz.questionCount || (assigningQuiz.questions ? assigningQuiz.questions.length : 0)} CÂU
                                    </span>
                                </div>

                                {assigningQuiz.createdByName && (
                                    <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold">
                                        <UserIcon size={12} className="text-slate-400"/>
                                        <span>Tác giả: <strong className="text-slate-700">{assigningQuiz.createdByName}</strong></span>
                                        {assigningQuiz.isSharedWithTeachers && (
                                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md text-[8px] font-black uppercase">
                                                Chia sẻ cùng môn
                                            </span>
                                        )}
                                    </div>
                                )}

                                {(!isSuperAdmin && assigningQuiz.createdBy && assigningQuiz.createdBy !== currentUser?.id) && (
                                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-[11px] text-emerald-800 font-bold mt-2">
                                        <Info size={16} className="text-emerald-600 shrink-0 mt-0.5"/>
                                        <p className="leading-relaxed">
                                            Đây là đề thi được chia sẻ bởi đồng nghiệp. Thầy/cô có thể chọn các lớp mình phụ trách bên dưới để giao bài cho học sinh. Thầy/cô không có quyền sửa hoặc xoá nội dung đề gốc.
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Filters & Tools */}
                            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setAssignGradeFilter('matching')}
                                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all ${
                                            assignGradeFilter === 'matching'
                                                ? 'bg-slate-900 text-white shadow-sm'
                                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                        }`}
                                    >
                                        Lớp Khối {assigningQuiz.grade}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setAssignGradeFilter('all')}
                                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all ${
                                            assignGradeFilter === 'all'
                                                ? 'bg-slate-900 text-white shadow-sm'
                                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                        }`}
                                    >
                                        Tất cả lớp
                                    </button>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const allIds = classesForAssignment.map(c => c.id);
                                            const combined = Array.from(new Set([...selectedClassIdsForAssign, ...allIds]));
                                            setSelectedClassIdsForAssign(combined);
                                        }}
                                        className="text-[10px] font-black uppercase text-blue-600 hover:text-blue-800 px-2 py-1 hover:bg-blue-50 rounded-lg transition-colors"
                                    >
                                        Chọn tất cả
                                    </button>
                                    <span className="text-slate-300">|</span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const currentIds = classesForAssignment.map(c => c.id);
                                            setSelectedClassIdsForAssign(selectedClassIdsForAssign.filter(id => !currentIds.includes(id)));
                                        }}
                                        className="text-[10px] font-black uppercase text-slate-500 hover:text-slate-700 px-2 py-1 hover:bg-slate-100 rounded-lg transition-colors"
                                    >
                                        Bỏ chọn
                                    </button>
                                    <span className="px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl text-[10px] font-black uppercase">
                                        Đã chọn: {selectedClassIdsForAssign.length}
                                    </span>
                                </div>
                            </div>

                            {/* Search box for classes */}
                            <input
                                type="text"
                                placeholder="Tìm kiếm tên lớp học, niên khóa..."
                                value={assignSearchClass}
                                onChange={(e) => setAssignSearchClass(e.target.value)}
                                className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold outline-none focus:border-blue-500 focus:bg-white transition-all text-slate-800"
                            />

                            {/* Classes Grid */}
                            {classesForAssignment.length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {classesForAssignment.map(c => {
                                        const isSelected = selectedClassIdsForAssign.includes(c.id);
                                        const isMyClass = c.createdBy === currentUser?.id;
                                        return (
                                            <div
                                                key={c.id}
                                                onClick={() => {
                                                    if (isSelected) {
                                                        setSelectedClassIdsForAssign(selectedClassIdsForAssign.filter(id => id !== c.id));
                                                    } else {
                                                        setSelectedClassIdsForAssign([...selectedClassIdsForAssign, c.id]);
                                                    }
                                                }}
                                                className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between gap-3 ${
                                                    isSelected
                                                        ? 'bg-blue-50/70 border-blue-500 shadow-sm'
                                                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className={`p-2 rounded-xl shrink-0 ${
                                                        isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'
                                                    }`}>
                                                        {isSelected ? <Check size={16}/> : <Square size={16}/>}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <span className="font-black text-sm text-slate-800 uppercase tracking-tight">
                                                                {c.name}
                                                            </span>
                                                            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[8px] font-black uppercase">
                                                                Khối {c.grade}
                                                            </span>
                                                        </div>
                                                        <p className="text-[10px] font-bold text-slate-400 truncate mt-0.5">
                                                            NK: {c.academicYear || 'Chung'} {c.teacherName ? `• GV: ${c.teacherName}` : (isMyClass ? '• Lớp của bạn' : '')}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="py-12 text-center text-slate-400 font-bold text-xs space-y-2">
                                    <p>Không tìm thấy lớp học nào phù hợp.</p>
                                    <p className="text-[10px] text-slate-400">Thầy/cô có thể tạo thêm lớp trong mục "Quản lý Lớp học".</p>
                                </div>
                            )}
                        </div>

                        {/* Footer Modal */}
                        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end items-center gap-3 shrink-0">
                            <button
                                type="button"
                                onClick={() => setAssigningQuiz(null)}
                                className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-black uppercase transition-all"
                            >
                                Hủy bỏ
                            </button>
                            <button
                                type="button"
                                disabled={isSavingAssign}
                                onClick={handleSaveAssignment}
                                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase transition-all shadow-lg active:scale-95 disabled:opacity-50 flex items-center gap-2"
                            >
                                {isSavingAssign ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                                        <span>Đang lưu...</span>
                                    </>
                                ) : (
                                    <>
                                        <Check size={16}/>
                                        <span>Lưu Phân Công Giao Đề</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

