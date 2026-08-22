import React, { useState, useMemo } from 'react';
import { Chapter, Grade, User } from '../../types';
import { 
  FolderTree, Trash2, BookOpen, Plus, Filter, ShieldCheck, Users, 
  Lock, Search, AlertTriangle, CheckCircle2, CheckSquare, 
  Square, X, FileText, Sparkles, Layers, BookmarkCheck
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { isSameSubject, getDisplaySubject } from '../../services/subjectUtils';

interface ChapterManagerProps {
    chapters: Chapter[];
    onSave: (ch: Chapter) => void;
    onDelete: (id: string) => void;
    onDeleteBatch?: (ids: string[]) => void;
    currentUser?: User;
    isSuperAdmin?: boolean;
}

const DEFAULT_SUBJECTS = ['Toán', 'Vật lí', 'Hóa học', 'Sinh học', 'Tin học', 'Ngữ văn', 'Tiếng Anh', 'Lịch sử', 'Địa lí', 'GDCD', 'Công nghệ'];

export default function ChapterManager({ 
    chapters, 
    onSave, 
    onDelete, 
    onDeleteBatch, 
    currentUser, 
    isSuperAdmin 
}: ChapterManagerProps) {
    const rawTeacherSubject = currentUser?.subject?.trim() || '';
    const displayTeacherSubject = rawTeacherSubject ? getDisplaySubject(rawTeacherSubject) : '';

    const [name, setName] = useState('');
    const [grade, setGrade] = useState<Grade>('12');
    const [subject, setSubject] = useState<string>(isSuperAdmin ? 'Vật lí' : (displayTeacherSubject || 'Vật lí'));
    const [selectedSubjectTab, setSelectedSubjectTab] = useState<string>(isSuperAdmin ? 'all' : (displayTeacherSubject || 'all'));
    const [selectedGradeFilter, setSelectedGradeFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

    // Multi-select state for SuperAdmin
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    
    // Batch import modal / mode for SuperAdmin
    const [isBulkMode, setIsBulkMode] = useState(false);
    const [bulkText, setBulkText] = useState('');

    // Custom In-App Confirmation Modal (Bypasses iframe window.confirm blockers)
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        confirmLabel?: string;
        onConfirm: () => void;
    } | null>(null);

    // Toast notification
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    const showToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 3500);
    };

    // Extract all unique subjects from existing chapters + default list
    const allSubjects = useMemo(() => {
        const set = new Set<string>(DEFAULT_SUBJECTS);
        chapters.forEach(c => {
            if (c.subject && c.subject.trim()) {
                set.add(getDisplaySubject(c.subject.trim()));
            }
        });
        return Array.from(set);
    }, [chapters]);

    // Subject chapter count map
    const subjectCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        chapters.forEach(c => {
            const s = getDisplaySubject(c.subject || 'Chung');
            counts[s] = (counts[s] || 0) + 1;
        });
        return counts;
    }, [chapters]);

    // When SuperAdmin switches subject tab, auto-sync the creation form subject
    const handleSelectSubjectTab = (subj: string) => {
        setSelectedSubjectTab(subj);
        if (subj !== 'all') {
            setSubject(subj);
        }
        setSelectedIds([]);
    };

    // Filter chapters based on active filters, role, and robust subject matching
    const filteredChapters = useMemo(() => {
        let list = chapters;

        // Role-based subject filtering
        if (!isSuperAdmin) {
            // If teacher has a subject, filter by teacher's subject
            const targetSubj = selectedSubjectTab !== 'all' ? selectedSubjectTab : rawTeacherSubject;
            if (targetSubj) {
                list = list.filter(c => {
                    if (!c.subject) return true; // Common/unassigned chapters
                    return isSameSubject(c.subject, targetSubj);
                });
            }
        } else if (isSuperAdmin && selectedSubjectTab !== 'all') {
            list = list.filter(c => isSameSubject(c.subject, selectedSubjectTab));
        }

        // Grade filtering
        if (selectedGradeFilter !== 'all') {
            list = list.filter(c => String(c.grade) === String(selectedGradeFilter));
        }

        // Search query filter
        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            list = list.filter(c => 
                (c.name || '').toLowerCase().includes(q) || 
                (c.subject || '').toLowerCase().includes(q)
            );
        }

        return list;
    }, [chapters, isSuperAdmin, rawTeacherSubject, selectedSubjectTab, selectedGradeFilter, searchQuery]);

    // Single creation (SuperAdmin only)
    const handleCreateChapter = () => {
        if (!name.trim()) return;
        const targetSubject = subject.trim() || (displayTeacherSubject || 'Vật lí');
        onSave({
            id: uuidv4(),
            name: name.trim(),
            grade,
            order: chapters.length + 1,
            subject: targetSubject,
            createdBy: currentUser?.id,
            createdByName: currentUser?.fullName
        });
        setName('');
        showToast(`Đã thêm chương mới vào môn ${targetSubject}!`);
    };

    // Bulk creation (each line = one chapter) (SuperAdmin only)
    const handleBulkCreate = () => {
        const lines = bulkText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length === 0) return;
        const targetSubject = subject.trim() || (displayTeacherSubject || 'Vật lí');
        
        lines.forEach((lineText, idx) => {
            onSave({
                id: uuidv4(),
                name: lineText,
                grade,
                order: chapters.length + idx + 1,
                subject: targetSubject,
                createdBy: currentUser?.id,
                createdByName: currentUser?.fullName
            });
        });

        setBulkText('');
        setIsBulkMode(false);
        showToast(`Đã thêm thành công ${lines.length} chương cho môn ${targetSubject} (Khối ${grade})!`);
    };

    // Toggle multi-select
    const handleToggleSelectOne = (id: string) => {
        setSelectedIds(prev => 
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    // Toggle select all visible
    const isAllVisibleSelected = filteredChapters.length > 0 && filteredChapters.every(c => selectedIds.includes(c.id));
    
    const handleToggleSelectAll = () => {
        if (isAllVisibleSelected) {
            const visibleIds = new Set(filteredChapters.map(c => c.id));
            setSelectedIds(prev => prev.filter(id => !visibleIds.has(id)));
        } else {
            const visibleIds = filteredChapters.map(c => c.id);
            setSelectedIds(prev => Array.from(new Set([...prev, ...visibleIds])));
        }
    };

    // Request Single Delete
    const requestDeleteSingle = (c: Chapter) => {
        setConfirmModal({
            isOpen: true,
            title: 'Xóa chương học',
            message: `Bạn có chắc chắn muốn xóa chương "${c.name}" (Môn: ${c.subject || 'Chung'}, Khối ${c.grade}) không?`,
            confirmLabel: 'Xác nhận xóa',
            onConfirm: () => {
                onDelete(c.id);
                setSelectedIds(prev => prev.filter(x => x !== c.id));
                setConfirmModal(null);
                showToast(`Đã xóa chương "${c.name}" thành công!`);
            }
        });
    };

    // Request Batch Delete (Selected items)
    const requestDeleteBatchSelected = () => {
        if (selectedIds.length === 0) return;
        setConfirmModal({
            isOpen: true,
            title: `Xóa ${selectedIds.length} chương đã chọn`,
            message: `Bạn có chắc chắn muốn xóa vĩnh viễn ${selectedIds.length} chương học đã tích chọn khỏi hệ thống?`,
            confirmLabel: `Xóa ${selectedIds.length} chương`,
            onConfirm: () => {
                if (onDeleteBatch) {
                    onDeleteBatch(selectedIds);
                } else {
                    selectedIds.forEach(id => onDelete(id));
                }
                const count = selectedIds.length;
                setSelectedIds([]);
                setConfirmModal(null);
                showToast(`Đã xóa ${count} chương học thành công!`);
            }
        });
    };

    // Request Delete ALL in Current View / Subject
    const requestDeleteAllInView = () => {
        if (filteredChapters.length === 0) return;
        const targetDesc = selectedSubjectTab === 'all' ? 'tất cả các môn' : `môn ${selectedSubjectTab}`;
        setConfirmModal({
            isOpen: true,
            title: `XÓA TOÀN BỘ CHƯƠNG (${targetDesc.toUpperCase()})`,
            message: `Hành động này sẽ XÓA SẠCH ${filteredChapters.length} chương học của ${targetDesc} để bạn có thể nạp lại chương trình chuẩn từ đầu. Bạn có chắc chắn không?`,
            confirmLabel: `Xóa sạch ${filteredChapters.length} chương`,
            onConfirm: () => {
                const idsToDelete = filteredChapters.map(c => c.id);
                if (onDeleteBatch) {
                    onDeleteBatch(idsToDelete);
                } else {
                    idsToDelete.forEach(id => onDelete(id));
                }
                setSelectedIds(prev => {
                    const deletedSet = new Set(idsToDelete);
                    return prev.filter(id => !deletedSet.has(id));
                });
                setConfirmModal(null);
                showToast(`Đã xóa sạch ${idsToDelete.length} chương của ${targetDesc}!`);
            }
        });
    };

    // Preset quick import for standard curriculum
    const handleLoadPhysicsSample = () => {
        const physicsChapters12 = [
            'Chương 1: Vật lí nhiệt',
            'Chương 2: Khí lí tưởng',
            'Chương 3: Từ trường',
            'Chương 4: Hạt nhân nguyên tử'
        ];
        const physicsChapters11 = [
            'Chương 1: Dao động',
            'Chương 2: Sóng',
            'Chương 3: Điện trường',
            'Chương 4: Dòng điện không đổi và Mạch điện'
        ];
        const physicsChapters10 = [
            'Chương 1: Mở đầu và Động học',
            'Chương 2: Động lực học',
            'Chương 3: Năng lượng, Công và Công suất',
            'Chương 4: Động lượng và Va chạm'
        ];

        let totalAdded = 0;
        physicsChapters12.forEach((name, idx) => {
            onSave({
                id: uuidv4(),
                name,
                grade: '12',
                order: idx + 1,
                subject: 'Vật lí',
                createdBy: currentUser?.id,
                createdByName: currentUser?.fullName
            });
            totalAdded++;
        });

        physicsChapters11.forEach((name, idx) => {
            onSave({
                id: uuidv4(),
                name,
                grade: '11',
                order: idx + 1,
                subject: 'Vật lí',
                createdBy: currentUser?.id,
                createdByName: currentUser?.fullName
            });
            totalAdded++;
        });

        physicsChapters10.forEach((name, idx) => {
            onSave({
                id: uuidv4(),
                name,
                grade: '10',
                order: idx + 1,
                subject: 'Vật lí',
                createdBy: currentUser?.id,
                createdByName: currentUser?.fullName
            });
            totalAdded++;
        });

        setConfirmModal(null);
        showToast(`Đã nạp chuẩn bộ chương trình môn Vật lí (Khối 10, 11, 12) với ${totalAdded} chương!`);
    };

    return (
        <div className="space-y-6 pb-20">
            {/* TOAST NOTIFICATION */}
            {toastMessage && (
                <div className="fixed top-6 right-6 z-50 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-3 animate-fade-in">
                    <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
                    <span className="text-xs font-bold">{toastMessage}</span>
                </div>
            )}

            {/* CONFIRMATION MODAL (IN-APP) */}
            {confirmModal && confirmModal.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-[2rem] p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-100 space-y-6 animate-scale-up">
                        <div className="flex items-center gap-3 text-red-600">
                            <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center shrink-0">
                                <AlertTriangle size={24} className="text-red-600" />
                            </div>
                            <div>
                                <h3 className="font-black text-slate-900 text-base sm:text-lg uppercase">
                                    {confirmModal.title}
                                </h3>
                                <span className="text-[10px] font-black text-red-500 uppercase tracking-wider">
                                    Quyền SuperAdmin
                                </span>
                            </div>
                        </div>

                        <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
                            {confirmModal.message}
                        </p>

                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setConfirmModal(null)}
                                className="px-5 py-3 rounded-xl text-xs font-black text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
                            >
                                Hủy bỏ
                            </button>
                            <button
                                type="button"
                                onClick={confirmModal.onConfirm}
                                className="px-6 py-3 rounded-xl text-xs font-black text-white bg-red-600 hover:bg-red-700 shadow-lg shadow-red-600/30 transition-all flex items-center gap-2"
                            >
                                <Trash2 size={16}/>
                                <span>{confirmModal.confirmLabel || 'Xác nhận xóa'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* HEADER BANNER */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-8 rounded-[2.5rem] text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border border-slate-800">
                <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        {isSuperAdmin ? (
                            <span className="px-3 py-1 bg-amber-500 text-slate-950 font-black text-[9px] uppercase tracking-wider rounded-lg flex items-center gap-1.5 shadow-sm">
                                <ShieldCheck size={13}/> Ban Quản Trị Hệ Thống (SuperAdmin)
                            </span>
                        ) : (
                            <span className="px-3 py-1 bg-blue-500/30 text-blue-200 font-black text-[9px] uppercase tracking-wider rounded-lg border border-blue-400/30 flex items-center gap-1.5">
                                <BookOpen size={13}/> Môn: {displayTeacherSubject || 'Vật lí'}
                            </span>
                        )}
                        <span className="px-2.5 py-1 bg-white/10 text-slate-300 font-black text-[9px] uppercase tracking-wider rounded-lg">
                            Tổng {chapters.length} chương hệ thống
                        </span>
                        {!isSuperAdmin && (
                            <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 font-black text-[9px] uppercase tracking-wider rounded-lg border border-emerald-500/30 flex items-center gap-1">
                                <BookmarkCheck size={12}/> {filteredChapters.length} chương môn của bạn
                            </span>
                        )}
                    </div>
                    <h1 className="text-2xl font-black uppercase italic tracking-tight">
                        {isSuperAdmin ? 'QUẢN LÝ CHƯƠNG TRÌNH HỌC CÁC BỘ MÔN' : `CHƯƠNG TRÌNH HỌC MÔN ${displayTeacherSubject ? displayTeacherSubject.toUpperCase() : 'VẬT LÍ'}`}
                    </h1>
                    <p className="text-slate-300 text-xs font-medium max-w-2xl leading-relaxed">
                        {isSuperAdmin ? (
                            'Quản lý và thiết lập danh mục chương trình học chuẩn cho từng bộ môn trong trường. Bạn có toàn quyền Thêm mới, Nhập nhanh hàng loạt hoặc Xóa để làm mới chương trình.'
                        ) : (
                            <>
                                Danh mục chương trình học môn <span className="text-blue-400 font-bold font-mono">[{displayTeacherSubject || 'Vật lí'}]</span> do Ban Giám Hiệu / SuperAdmin chuẩn hóa đồng bộ. Giáo viên sử dụng danh mục này để phân loại câu hỏi và tạo đề kiểm tra thống nhất.
                            </>
                        )}
                    </p>
                </div>

                {isSuperAdmin && (
                    <button
                        type="button"
                        onClick={() => {
                            setConfirmModal({
                                isOpen: true,
                                title: 'Nạp nhanh chương trình chuẩn môn Vật lí',
                                message: 'Thêm nhanh trọn bộ chương trình chuẩn môn Vật lí (Khối 10, 11, 12 - Chương trình GDPT 2018) vào hệ thống?',
                                confirmLabel: 'Nạp chương trình Vật lí',
                                onConfirm: handleLoadPhysicsSample
                            });
                        }}
                        className="px-4 py-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shrink-0 shadow-lg active:scale-95"
                    >
                        <Sparkles size={16} className="text-amber-400"/>
                        <span>Nạp mẫu chuẩn Vật lí (10, 11, 12)</span>
                    </button>
                )}
            </div>

            {/* SUPERADMIN SUBJECT FILTER TABS */}
            {isSuperAdmin && (
                <div className="bg-white p-6 rounded-[2rem] border shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                        <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                            <Filter size={15} className="text-amber-500"/> Lọc theo bộ môn (SuperAdmin)
                        </h4>
                        <span className="text-[10px] font-bold text-slate-400">
                            Nhấn chọn môn để xem và quản lý chương trình của môn đó
                        </span>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                        <button
                            type="button"
                            onClick={() => handleSelectSubjectTab('all')}
                            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                                selectedSubjectTab === 'all'
                                    ? 'bg-slate-900 text-white shadow-md shadow-slate-900/20 scale-105'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                        >
                            🌐 Tất cả các môn ({chapters.length})
                        </button>
                        {allSubjects.map(subj => {
                            const count = subjectCounts[subj] || 0;
                            const isSelected = isSameSubject(selectedSubjectTab, subj);
                            return (
                                <button
                                    key={subj}
                                    type="button"
                                    onClick={() => handleSelectSubjectTab(subj)}
                                    className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                                        isSelected
                                            ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20 scale-105'
                                            : 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                                    }`}
                                >
                                    <span>{subj}</span>
                                    <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                                        isSelected ? 'bg-blue-800 text-white' : 'bg-slate-200 text-slate-600'
                                    }`}>
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* SUPERADMIN ONLY: Chapter Creation Form (Completely hidden for regular teachers) */}
            {isSuperAdmin && (
                <div className="bg-white p-8 rounded-[2.5rem] border shadow-sm space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-600 flex items-center gap-2">
                            <FolderTree size={16} className="text-blue-600"/> Thêm chương học chuẩn mới
                        </h4>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setIsBulkMode(!isBulkMode)}
                                className={`px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1.5 border ${
                                    isBulkMode 
                                        ? 'bg-blue-600 text-white border-blue-600' 
                                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                }`}
                            >
                                <FileText size={13}/>
                                {isBulkMode ? 'Chuyển nhập từng câu' : '⚡ Nhập nhanh nhiều chương'}
                            </button>
                            <span className="text-[10px] font-black uppercase px-3 py-1.5 bg-amber-50 text-amber-700 rounded-xl border border-amber-200 flex items-center gap-1">
                                <ShieldCheck size={12}/> SuperAdmin
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Khối lớp áp dụng</label>
                            <select 
                                className="w-full p-4 bg-slate-50 border rounded-2xl text-xs font-black text-slate-800 outline-none focus:border-blue-500 transition-all" 
                                value={grade} 
                                onChange={e => setGrade(e.target.value as Grade)}
                            >
                                <option value="12">Khối 12</option>
                                <option value="11">Khối 11</option>
                                <option value="10">Khối 10</option>
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Bộ môn</label>
                            <input
                                list="subject-suggestions"
                                className="w-full p-4 bg-slate-50 border rounded-2xl text-xs font-black text-slate-800 outline-none focus:border-blue-500 transition-all"
                                placeholder="VD: Toán, Vật lí, Hóa học..."
                                value={subject}
                                onChange={e => setSubject(e.target.value)}
                            />
                            <datalist id="subject-suggestions">
                                {allSubjects.map(s => <option key={s} value={s} />)}
                            </datalist>
                        </div>

                        <div className="space-y-1.5 md:col-span-1">
                            <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Chọn nhanh môn</label>
                            <div className="flex flex-wrap gap-1.5 pt-1">
                                {['Vật lí', 'Toán', 'Hóa học', 'Sinh học', 'Tiếng Anh'].map(s => (
                                    <button
                                        key={s}
                                        type="button"
                                        onClick={() => setSubject(s)}
                                        className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                                            isSameSubject(subject, s)
                                                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                                        }`}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {isBulkMode ? (
                        <div className="space-y-3 pt-2">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-black uppercase text-slate-400 ml-2 flex items-center gap-1.5">
                                    <FileText size={13} className="text-blue-600"/> Danh sách các chương (Mỗi dòng là một chương)
                                </label>
                                <span className="text-[10px] font-bold text-blue-600">
                                    Môn: {subject} | Khối {grade}
                                </span>
                            </div>
                            <textarea
                                rows={6}
                                className="w-full p-4 bg-slate-50 border rounded-2xl text-xs font-mono font-medium text-slate-800 outline-none focus:bg-white focus:border-blue-500 transition-all leading-relaxed"
                                placeholder={`Ví dụ:\nChương 1: Vật lí nhiệt\nChương 2: Khí lí tưởng\nChương 3: Từ trường\nChương 4: Hạt nhân nguyên tử`}
                                value={bulkText}
                                onChange={e => setBulkText(e.target.value)}
                            />
                            <div className="flex items-center justify-end gap-3 pt-1">
                                <button
                                    type="button"
                                    onClick={() => { setIsBulkMode(false); setBulkText(''); }}
                                    className="px-5 py-3 rounded-xl text-xs font-black text-slate-500 bg-slate-100 hover:bg-slate-200 transition-all"
                                >
                                    Đóng
                                </button>
                                <button
                                    type="button"
                                    onClick={handleBulkCreate}
                                    disabled={!bulkText.trim()}
                                    className="px-6 py-3 bg-blue-600 text-white rounded-xl text-xs font-black uppercase hover:bg-blue-700 shadow-md shadow-blue-600/30 transition-all disabled:opacity-50 flex items-center gap-2"
                                >
                                    <Plus size={16}/> Lưu tất cả các chương
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col sm:flex-row gap-3 pt-2">
                            <input 
                                className="flex-1 p-4 bg-slate-50 border rounded-2xl text-xs font-black uppercase placeholder:normal-case outline-none focus:bg-white focus:border-blue-500 transition-all" 
                                placeholder="Nhập tên chương học (VD: Chương 1: Vật lí nhiệt...)" 
                                value={name} 
                                onChange={e => setName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleCreateChapter(); }}
                            />
                            <button 
                                onClick={handleCreateChapter} 
                                disabled={!name.trim()}
                                className="px-8 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs hover:bg-blue-700 shadow-lg shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 shrink-0"
                            >
                                <Plus size={18}/> Thêm chương
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* FILTER & SEARCH BAR */}
            <div className="bg-white p-6 rounded-[2rem] border shadow-sm space-y-4">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                            <button
                                type="button"
                                onClick={() => setSelectedGradeFilter('all')}
                                className={`px-3.5 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${
                                    selectedGradeFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                                }`}
                            >
                                Tất cả khối
                            </button>
                            {['12', '11', '10'].map(g => (
                                <button
                                    key={g}
                                    type="button"
                                    onClick={() => setSelectedGradeFilter(g)}
                                    className={`px-3.5 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${
                                        selectedGradeFilter === g ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'
                                    }`}
                                >
                                    Khối {g}
                                </button>
                            ))}
                        </div>

                        {!isSuperAdmin && (
                            <span className="px-3.5 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-black rounded-xl flex items-center gap-1.5">
                                <BookOpen size={14}/> Môn: {displayTeacherSubject || 'Vật lí'}
                            </span>
                        )}

                        {isSuperAdmin && selectedSubjectTab !== 'all' && (
                            <span className="px-3.5 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-black rounded-xl flex items-center gap-1.5">
                                <Filter size={14}/> Đang lọc môn: {selectedSubjectTab}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center bg-slate-50 border rounded-xl px-3 w-full md:w-80">
                        <Search size={16} className="text-slate-400 shrink-0"/>
                        <input
                            className="bg-transparent p-2.5 text-xs font-bold text-slate-800 outline-none w-full placeholder:text-slate-400"
                            placeholder="Tìm kiếm theo tên chương hoặc khối..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-600">
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>

                {/* SuperAdmin Quick Action Toolbar: Select All / Delete All In View */}
                {isSuperAdmin && filteredChapters.length > 0 && (
                    <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={handleToggleSelectAll}
                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-black transition-all flex items-center gap-1.5"
                            >
                                {isAllVisibleSelected ? <CheckSquare size={14} className="text-blue-600"/> : <Square size={14}/>}
                                <span>{isAllVisibleSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả chương đang hiện'}</span>
                            </button>
                            <span className="text-[11px] font-bold text-slate-400">
                                ({filteredChapters.length} chương)
                            </span>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={requestDeleteAllInView}
                                className="px-3.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                                title="Xóa toàn bộ chương học đang hiển thị trong bộ lọc này"
                            >
                                <Trash2 size={14}/>
                                <span>Xóa sạch chương {selectedSubjectTab === 'all' ? 'đang hiện' : `môn ${selectedSubjectTab}`} để tạo lại</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* LIST OF CHAPTERS GROUPED BY GRADE */}
            <div className="space-y-6">
                {(['12', '11', '10'] as Grade[])
                    .filter(g => selectedGradeFilter === 'all' || selectedGradeFilter === g)
                    .map(g => {
                        const gradeChapters = filteredChapters.filter(c => String(c.grade) === String(g));
                        return (
                            <div key={g} className="space-y-3">
                                <div className="flex items-center justify-between px-4">
                                    <h5 className="text-xs font-black uppercase text-slate-600 flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                                        Khối {g} ({gradeChapters.length} chương)
                                    </h5>
                                    {gradeChapters.length > 0 && (
                                        <span className="text-[11px] font-bold text-slate-400">
                                            Chương trình GDPT 2018
                                        </span>
                                    )}
                                </div>

                                {gradeChapters.length > 0 ? (
                                    <div className="space-y-2">
                                        {gradeChapters.map((c, idx) => {
                                            const isSelected = selectedIds.includes(c.id);
                                            return (
                                                <div 
                                                    key={c.id} 
                                                    className={`bg-white p-4 px-6 rounded-2xl border shadow-sm flex items-center justify-between gap-4 group transition-all ${
                                                        isSelected ? 'border-blue-500 bg-blue-50/30 ring-2 ring-blue-500/20' : 'hover:border-blue-300'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3.5 flex-1 min-w-0">
                                                        {isSuperAdmin && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleToggleSelectOne(c.id)}
                                                                className="text-slate-400 hover:text-blue-600 transition-all shrink-0"
                                                            >
                                                                {isSelected ? (
                                                                    <CheckSquare size={20} className="text-blue-600 fill-blue-50" />
                                                                ) : (
                                                                    <Square size={20} />
                                                                )}
                                                            </button>
                                                        )}

                                                        <span className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center text-xs font-black shrink-0">
                                                            {idx + 1}
                                                        </span>

                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-sm font-black text-slate-800 tracking-tight break-words uppercase">
                                                                {c.name || (c as any).title || "Chương chưa đặt tên"}
                                                            </p>
                                                            <div className="flex flex-wrap items-center gap-2 pt-1 text-[10px] font-bold text-slate-400">
                                                                <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold">
                                                                    Khối {c.grade}
                                                                </span>
                                                                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                                                                    Môn: {getDisplaySubject(c.subject)}
                                                                </span>
                                                                {c.createdByName && (
                                                                    <span className="text-slate-400">
                                                                        Tạo bởi: {c.createdByName}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 shrink-0">
                                                        {isSuperAdmin ? (
                                                            <button 
                                                                type="button"
                                                                onClick={() => requestDeleteSingle(c)}
                                                                className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-600 border border-slate-200 hover:border-red-200 transition-all shadow-sm"
                                                                title="Xóa chương này (Chỉ SuperAdmin)"
                                                            >
                                                                <Trash2 size={16}/>
                                                            </button>
                                                        ) : (
                                                            <span className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-400 text-[10px] font-black uppercase flex items-center gap-1.5" title="Chương trình chuẩn hóa (Chỉ xem)">
                                                                <Lock size={12} className="text-slate-400"/>
                                                                <span>Chuẩn hóa</span>
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="bg-white p-8 rounded-2xl border border-dashed border-slate-200 text-center space-y-2">
                                        <Layers size={24} className="mx-auto text-slate-300"/>
                                        <p className="text-xs font-bold text-slate-400">
                                            Chưa có chương nào cho Khối {g} {selectedSubjectTab !== 'all' ? `(Môn ${selectedSubjectTab})` : (displayTeacherSubject ? `(Môn ${displayTeacherSubject})` : '')}
                                        </p>
                                        {isSuperAdmin && (
                                            <p className="text-[11px] text-blue-600 font-bold">
                                                Nhập tên chương ở khung phía trên để thêm mới cho khối này.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
            </div>

            {/* STICKY BOTTOM ACTIONS BAR FOR SUPERADMIN (WHEN ITEMS SELECTED) */}
            {isSuperAdmin && selectedIds.length > 0 && (
                <div className="fixed bottom-6 inset-x-0 max-w-2xl mx-auto z-40 px-4 animate-slide-up">
                    <div className="bg-slate-900/95 backdrop-blur-md text-white p-4 px-6 rounded-2xl shadow-2xl border border-slate-700 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <span className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center text-xs font-black">
                                {selectedIds.length}
                            </span>
                            <span className="text-xs font-black">
                                Đã chọn {selectedIds.length} chương
                            </span>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setSelectedIds([])}
                                className="px-4 py-2 rounded-xl text-xs font-black text-slate-300 hover:text-white hover:bg-slate-800 transition-all"
                            >
                                Hủy chọn
                            </button>
                            <button
                                type="button"
                                onClick={requestDeleteBatchSelected}
                                className="px-5 py-2.5 rounded-xl text-xs font-black text-white bg-red-600 hover:bg-red-700 shadow-lg shadow-red-600/30 transition-all flex items-center gap-2 active:scale-95"
                            >
                                <Trash2 size={15}/>
                                <span>Xóa {selectedIds.length} chương</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
