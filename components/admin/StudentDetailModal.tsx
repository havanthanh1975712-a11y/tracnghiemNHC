import React from 'react';
import { X, UserCog, BookOpen, Trophy, Clock, Eye } from 'lucide-react';
import { User, Result, Quiz } from '../../types';
// Fix: Removed parseISO from imports
import { format, isAfter } from 'date-fns';

interface StudentDetailModalProps {
    student: User | null;
    results: Result[];
    quizzes: Quiz[];
    onClose: () => void;
    onViewResult: (res: Result) => void;
}

export default function StudentDetailModal({ student, results, quizzes, onClose, onViewResult }: StudentDetailModalProps) {
    if (!student) return null;

    // Fix: Replaced parseISO with standard new Date() for sorting
    const studentResults = results.filter(r => r.studentCode === student.studentCode).sort((a,b)=>isAfter(new Date(b.submittedAt), new Date(a.submittedAt))?1:-1);
    const totalQuizzes = studentResults.length;
    const avgScore = totalQuizzes > 0 ? (studentResults.reduce((acc, r) => acc + r.score, 0) / totalQuizzes) : 0;
    
    const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    return (
        <div className="fixed inset-0 bg-slate-900/90 z-[1000] flex items-center justify-center p-4 backdrop-blur-md animate-fade-in">
            <div className="bg-white rounded-[3.5rem] w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border-8 border-white shadow-2xl">
                <div className="p-8 bg-slate-900 text-white flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-5">
                        <div className="w-16 h-16 bg-blue-600 rounded-[1.5rem] flex items-center justify-center shadow-xl"><UserCog size={32}/></div>
                        <div>
                            <h3 className="text-xl font-black uppercase tracking-tight">{student.fullName}</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">MAHS: {student.studentCode}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-4 bg-slate-800 rounded-2xl hover:bg-red-600 transition-colors"><X/></button>
                </div>
                <div className="flex-1 overflow-y-auto p-10 bg-slate-50 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-white rounded-[2rem] p-6 border shadow-sm flex items-center gap-4">
                            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center"><BookOpen size={24}/></div>
                            <div><p className="text-slate-400 text-[9px] font-black uppercase">Bài làm</p><h4 className="text-xl font-black">{totalQuizzes}</h4></div>
                        </div>
                        <div className="bg-white rounded-[2rem] p-6 border shadow-sm flex items-center gap-4">
                            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center"><Trophy size={24}/></div>
                            <div><p className="text-slate-400 text-[9px] font-black uppercase">ĐTB</p><h4 className="text-xl font-black text-emerald-600">{avgScore.toFixed(2)}</h4></div>
                        </div>
                        <div className="bg-white rounded-[2rem] p-6 border shadow-sm flex items-center gap-4">
                            <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center"><Clock size={24}/></div>
                            <div><p className="text-slate-400 text-[9px] font-black uppercase">Khối</p><h4 className="text-xl font-black text-orange-600">{student.grade}</h4></div>
                        </div>
                    </div>
                    <div className="bg-white rounded-[2.5rem] border shadow-sm overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead><tr className="bg-white border-b text-[8px] font-black uppercase text-slate-300 tracking-[0.2em]"><th className="p-6">Đề thi</th><th className="p-6 text-center">Điểm</th><th className="p-6 text-center">Ngày</th><th className="p-6 text-center">Xem</th></tr></thead>
                            <tbody className="divide-y">
                                {studentResults.map(r => (
                                    <tr key={r.id} className="hover:bg-slate-50">
                                        <td className="p-6 font-bold uppercase">{quizzes.find(q=>q.id===r.quizId)?.title || 'Đề đã xóa'}</td>
                                        <td className="p-6 text-center font-black text-blue-600">{r.score.toFixed(2)}</td>
                                        <td className="p-6 text-center text-slate-400 text-[10px]">{format(new Date(r.submittedAt), 'dd/MM/yy')}</td>
                                        <td className="p-6 text-center">
                                            <button onClick={() => onViewResult(r)} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all"><Eye size={14}/></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}