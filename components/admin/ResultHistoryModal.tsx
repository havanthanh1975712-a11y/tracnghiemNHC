
import React from 'react';
import { X, Clock, Trophy, Eye, Calendar, Trash2 } from 'lucide-react';
import { Result } from '../../types';
import { format } from 'date-fns';

interface ResultHistoryModalProps {
    isOpen: boolean;
    studentName: string;
    studentCode: string;
    quizTitle: string;
    history: Result[];
    onClose: () => void;
    onViewDetail: (res: Result) => void;
    onDeleteOne: (res: Result) => void;
}

export default function ResultHistoryModal({ 
    isOpen, studentName, studentCode, quizTitle, history, onClose, onViewDetail, onDeleteOne 
}: ResultHistoryModalProps) {
    if (!isOpen) return null;

    const sortedHistory = [...history].sort((a, b) => 
        new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    );

    const formatDuration = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m}p ${s}s`;
    };

    return (
        <div className="fixed inset-0 bg-slate-900/90 z-[1100] flex items-center justify-center p-4 backdrop-blur-md animate-fade-in">
            <div className="bg-white rounded-[3rem] w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden border-8 border-white shadow-2xl">
                <div className="p-8 bg-slate-900 text-white flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-5">
                        <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg"><Clock size={28}/></div>
                        <div>
                            <h3 className="text-lg font-black uppercase tracking-tight">{studentName} - {quizTitle}</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Lịch sử {history.length} lần làm bài • MAHS: {studentCode}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-4 bg-slate-800 rounded-2xl hover:bg-red-600 transition-colors"><X/></button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-8 bg-slate-50">
                    <div className="bg-white rounded-[2rem] border shadow-sm overflow-hidden">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50 border-b text-[9px] font-black uppercase tracking-widest text-slate-400">
                                    <th className="p-5">Lần nộp</th>
                                    <th className="p-5 text-center">Thời điểm nộp</th>
                                    <th className="p-5 text-center">Thời gian làm</th>
                                    <th className="p-5 text-center">Điểm số</th>
                                    <th className="p-5 text-center">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {sortedHistory.map((res, idx) => (
                                    <tr key={res.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-5">
                                            <span className="font-black text-slate-400">#{sortedHistory.length - idx}</span>
                                        </td>
                                        <td className="p-5 text-center">
                                            <div className="flex flex-col items-center">
                                                <span className="text-sm font-bold text-slate-700">{format(new Date(res.submittedAt), 'HH:mm:ss')}</span>
                                                <span className="text-[10px] font-medium text-slate-400">{format(new Date(res.submittedAt), 'dd/MM/yyyy')}</span>
                                            </div>
                                        </td>
                                        <td className="p-5 text-center">
                                            <span className="text-xs font-bold text-slate-600 uppercase">{formatDuration(res.durationSeconds || 0)}</span>
                                        </td>
                                        <td className="p-5 text-center">
                                            <span className={`text-lg font-black ${res.score >= 8 ? 'text-emerald-600' : res.score >= 5 ? 'text-blue-600' : 'text-orange-500'}`}>
                                                {res.score.toFixed(2)}
                                            </span>
                                        </td>
                                        <td className="p-5">
                                            <div className="flex items-center justify-center gap-2">
                                                <button 
                                                    onClick={() => onViewDetail(res)}
                                                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-black transition-all text-[10px] font-black uppercase shadow-md"
                                                >
                                                    <Eye size={14}/> Xem bài làm
                                                </button>
                                                <button 
                                                    onClick={() => onDeleteOne(res)}
                                                    className="p-2.5 text-slate-300 hover:text-red-500 transition-colors"
                                                >
                                                    <Trash2 size={16}/>
                                                </button>
                                            </div>
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
