
import React from 'react';
import { X, UserPlus, Save, Loader2, GraduationCap, BookOpen, Calendar } from 'lucide-react';
import { User, Grade, ClassRoom } from '../../types';
import { STANDARD_SUBJECTS } from '../../services/subjectUtils';

interface StudentModalProps {
    isOpen: boolean;
    student: User | null;
    form: { 
        fullName: string; 
        studentCode: string; 
        grade: Grade; 
        password: string;
        classId?: string;
        className?: string;
        academicYear?: string;
        subject?: string;
    };
    setForm: (form: any) => void;
    classes?: ClassRoom[];
    currentUser?: User;
    onClose: () => void;
    onSave: () => void;
    isSaving?: boolean;
    isDuplicate?: boolean;
}

export default function StudentModal({ 
    isOpen, 
    student, 
    form, 
    setForm, 
    classes = [], 
    currentUser,
    onClose, 
    onSave, 
    isSaving, 
    isDuplicate 
}: StudentModalProps) {
    if (!isOpen) return null;

    const isSuperAdmin = currentUser?.role === 'superadmin';

    const handleClassChange = (selectedClassId: string) => {
        if (!selectedClassId) {
            setForm({
                ...form,
                classId: '',
                className: '',
                academicYear: form.academicYear || '',
                subject: form.subject || ''
            });
            return;
        }
        const found = classes.find(c => c.id === selectedClassId);
        if (found) {
            setForm({
                ...form,
                classId: found.id,
                className: found.name,
                academicYear: found.academicYear || form.academicYear,
                grade: found.grade || form.grade,
                subject: found.subject || form.subject
            });
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/90 z-[1000] flex items-center justify-center p-4 backdrop-blur-md animate-fade-in">
            <div className="bg-white rounded-[3rem] w-full max-w-md flex flex-col overflow-hidden border-8 border-white shadow-2xl">
                <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-600 rounded-2xl"><UserPlus size={24}/></div>
                        <h3 className="text-lg font-black uppercase tracking-tight">{student ? 'SỬA HỌC SINH' : 'THÊM HỌC SINH'}</h3>
                    </div>
                    <button onClick={onClose} disabled={isSaving} className="p-3 hover:bg-red-600 rounded-xl transition-colors disabled:opacity-30"><X/></button>
                </div>
                <div className="p-8 space-y-4 max-h-[85vh] overflow-y-auto">
                    <div className="space-y-1">
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] font-black text-blue-500 uppercase">1. Mã học sinh (MAHS)</label>
                            {isDuplicate && <span className="text-[9px] font-black text-red-500 uppercase animate-pulse">Mã đã tồn tại!</span>}
                        </div>
                        <input 
                            disabled={isSaving} 
                            className={`w-full p-3.5 bg-slate-50 border-2 ${isDuplicate ? 'border-red-500 bg-red-50' : 'border-slate-100 focus:border-blue-500'} rounded-2xl font-black uppercase outline-none disabled:opacity-50 transition-all`} 
                            value={form.studentCode} 
                            onChange={e => setForm({...form, studentCode: e.target.value})} 
                            placeholder="VÍ DỤ: HS001" 
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase">2. Họ và tên</label>
                        <input disabled={isSaving} className="w-full p-3.5 bg-slate-50 border rounded-2xl font-bold outline-none disabled:opacity-50" value={form.fullName} onChange={e => setForm({...form, fullName: e.target.value})} placeholder="Nhập tên..." />
                    </div>

                    {/* Lớp học */}
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-indigo-600 uppercase flex items-center gap-1">
                            <GraduationCap size={13} /> 3. Chọn Lớp học (Tùy chọn)
                        </label>
                        <select 
                            disabled={isSaving}
                            className="w-full p-3.5 bg-slate-50 border rounded-2xl text-xs font-black disabled:opacity-50 outline-none focus:border-indigo-500"
                            value={form.classId || ''}
                            onChange={e => handleClassChange(e.target.value)}
                        >
                            <option value="">-- Chưa phân lớp --</option>
                            {classes.map(c => (
                                <option key={c.id} value={c.id}>
                                    {c.name} • Niên khóa {c.academicYear} {c.subject ? `(Môn ${c.subject})` : ''} (Khối {c.grade})
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Niên khóa & Môn học */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-1">
                                <Calendar size={12} /> 4. Niên khóa
                            </label>
                            <input 
                                disabled={isSaving} 
                                className="w-full p-3.5 bg-slate-50 border rounded-2xl font-bold text-xs outline-none disabled:opacity-50 focus:border-indigo-500" 
                                value={form.academicYear || ''} 
                                onChange={e => setForm({...form, academicYear: e.target.value})} 
                                placeholder="2025-2026" 
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-1">
                                <BookOpen size={12} /> 5. Môn học {isSuperAdmin ? '(SuperAdmin)' : ''}
                            </label>
                            {isSuperAdmin ? (
                                <select 
                                    disabled={isSaving} 
                                    className="w-full p-3.5 bg-slate-50 border rounded-2xl text-xs font-bold disabled:opacity-50 outline-none focus:border-indigo-500" 
                                    value={form.subject || ''} 
                                    onChange={e => setForm({...form, subject: e.target.value})}
                                >
                                    <option value="">-- Dùng chung / Tự do --</option>
                                    {STANDARD_SUBJECTS.map(s => (
                                        <option key={s} value={s}>Môn {s}</option>
                                    ))}
                                </select>
                            ) : (
                                <div className="w-full p-3.5 bg-slate-100 border border-slate-200 rounded-2xl text-xs font-black text-slate-700 flex items-center justify-between">
                                    <span>Môn {currentUser?.subject || form.subject || 'Chung'}</span>
                                    <span className="text-[9px] font-bold text-slate-400 bg-white px-2 py-0.5 rounded-md border">Cố định theo GV</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase">6. Khối</label>
                            <select disabled={isSaving} className="w-full p-3.5 bg-slate-50 border rounded-2xl text-xs font-black disabled:opacity-50" value={form.grade} onChange={e => setForm({...form, grade: e.target.value as Grade})}>
                                <option value="12">Khối 12</option>
                                <option value="11">Khối 11</option>
                                <option value="10">Khối 10</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase">7. Mật khẩu</label>
                            <input disabled={isSaving} type="password" title="password" className="w-full p-3.5 bg-slate-50 border rounded-2xl font-bold disabled:opacity-50" value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
                        </div>
                    </div>

                    <button 
                        onClick={onSave} 
                        disabled={isSaving}
                        className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase text-xs flex items-center justify-center gap-3 hover:bg-black transition-all shadow-xl mt-3 disabled:opacity-50"
                    >
                        {isSaving ? <Loader2 size={18} className="animate-spin"/> : <Save size={18}/>}
                        {isSaving ? 'ĐANG LƯU VÀO CLOUD...' : 'LƯU THÔNG TIN'}
                    </button>
                    {isSaving && (
                        <p className="text-[10px] text-center font-black text-blue-600 uppercase animate-pulse">Vui lòng không tắt trình duyệt...</p>
                    )}
                </div>
            </div>
        </div>
    );
}
