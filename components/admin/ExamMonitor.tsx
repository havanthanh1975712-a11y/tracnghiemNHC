
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ExamSession, Quiz, Result, PublishedResult, Grade, QuizType, User, ClassRoom } from '../../types';
import { getExamSessions, getResults, getQuizzes, savePublishedResult, deleteExamSession, getPublishedResults, deletePublishedResult, clearAllSessions, isDatabaseConnected, getUsers, getClasses } from '../../services/storage';
import { ShieldAlert, RefreshCw, Filter, CheckSquare, Square, XCircle, WifiOff, Wifi, Eraser, FileText, Medal, History, Trophy, Search, Trash2, Database, UserCheck, UserX, Users } from 'lucide-react';
import { format, differenceInSeconds } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

interface ExamMonitorProps {
    currentUser?: User;
}

export default function ExamMonitor({ currentUser }: ExamMonitorProps) {
    const [sessions, setSessions] = useState<ExamSession[]>([]);
    const [results, setResults] = useState<Result[]>([]);
    const [quizzes, setQuizzes] = useState<Quiz[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [classes, setClasses] = useState<ClassRoom[]>([]);
    const [publishedHistory, setPublishedHistory] = useState<PublishedResult[]>([]);
    
    const [selectedQuizId, setSelectedQuizId] = useState<string>('all');
    const [filterGrade, setFilterGrade] = useState<Grade | 'all'>('all');
    
    const [searchCode, setSearchCode] = useState('');
    const [selectedResultIds, setSelectedResultIds] = useState<Set<string>>(new Set());
    const [now, setNow] = useState(new Date());
    const [isRefreshing, setIsRefreshing] = useState(false);
    const dbStatus = isDatabaseConnected();

    const isSuperAdmin = currentUser?.role === 'superadmin';

    useEffect(() => {
        refreshData();
        const interval = setInterval(() => {
            refreshData(true);
            setNow(new Date());
        }, 15000); 
        return () => clearInterval(interval);
    }, [selectedQuizId]);

    const refreshData = async (silent = false) => {
        if (!silent) setIsRefreshing(true);
        try {
            const [s, r, q, p, u, cls] = await Promise.all([
                getExamSessions(selectedQuizId), 
                getResults(selectedQuizId), 
                getQuizzes(),
                getPublishedResults(),
                getUsers(),
                getClasses()
            ]);
            setSessions(s);
            setResults(r);
            setQuizzes(q);
            setPublishedHistory(p.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()));
            setUsers(u);
            setClasses(cls);
        } catch (error) {
            console.error("Lỗi giám sát:", error);
        } finally {
            if (!silent) setIsRefreshing(false);
        }
    };

    const handleHardReset = async () => {
        if (!confirm("CẢNH BÁO: Xóa sạch toàn bộ phiên thi ảo để giải cứu database?")) return;
        setIsRefreshing(true);
        await clearAllSessions();
        refreshData();
    };

    // 1. Tập hợp các lớp mà Giáo viên có quyền (Lớp do mình tạo hoặc lớp được chia sẻ)
    const accessibleClassIds = useMemo(() => {
        if (isSuperAdmin) return new Set<string>();
        const myClasses = classes.filter(c => 
            (c.createdBy && c.createdBy === currentUser?.id) || 
            Boolean(c.isSharedWithTeachers)
        );
        return new Set(myClasses.map(c => c.id));
    }, [classes, isSuperAdmin, currentUser?.id]);

    const accessibleClassNames = useMemo(() => {
        if (isSuperAdmin) return new Set<string>();
        const myClasses = classes.filter(c => 
            (c.createdBy && c.createdBy === currentUser?.id) || 
            Boolean(c.isSharedWithTeachers)
        );
        return new Set(myClasses.map(c => c.name.trim().toLowerCase()));
    }, [classes, isSuperAdmin, currentUser?.id]);

    // 2. Tập hợp các học sinh được phép giám sát:
    // SuperAdmin: toàn quyền giám sát tất cả học sinh
    // Giáo viên: chỉ giám sát học sinh thuộc lớp do mình tạo/quản lý, học sinh do mình tạo, hoặc học sinh trong đề thi do mình tạo
    const isStudentAccessible = useMemo(() => {
        if (isSuperAdmin) return () => true;

        // Map danh sách học sinh theo studentId và studentCode
        const studentMapById = new Map<string, User>();
        const studentMapByCode = new Map<string, User>();
        users.filter(u => u.role === 'student').forEach(st => {
            if (st.id) studentMapById.set(st.id, st);
            if (st.studentCode) studentMapByCode.set(st.studentCode.trim().toUpperCase(), st);
        });

        return (studentId: string, studentCode?: string, quizCreatorId?: string) => {
            // 1. Nếu đề thi do chính giáo viên này tạo -> giáo viên được quyền giám sát thí sinh làm đề của mình
            if (quizCreatorId && quizCreatorId === currentUser?.id) return true;

            // 2. Tìm thông tin học sinh
            const student = (studentId && studentMapById.get(studentId)) || 
                            (studentCode && studentMapByCode.get(studentCode.trim().toUpperCase()));
            
            if (!student) {
                // Học sinh tự do / chưa gán hồ sơ nhưng đang thi đề của GV này
                return quizCreatorId === currentUser?.id;
            }

            // Học sinh thuộc lớp của giáo viên này
            if (student.classId && accessibleClassIds.has(student.classId)) return true;
            if (student.className && accessibleClassNames.has(student.className.trim().toLowerCase())) return true;
            // Học sinh do giáo viên này tạo/nhập
            if (student.createdById && student.createdById === currentUser?.id) return true;

            return false;
        };
    }, [isSuperAdmin, users, accessibleClassIds, accessibleClassNames, currentUser?.id]);

    // Sửa logic lọc đề thi
    const filteredQuizzes = useMemo(() => {
        return quizzes.filter(q => {
            if (!q.isPublished) return false;
            if (filterGrade !== 'all' && q.grade !== filterGrade) return false;
            if (!isSuperAdmin) {
                const isMine = !q.createdBy || q.createdBy === currentUser?.id;
                const isShared = Boolean(q.isSharedWithTeachers);
                if (!isMine && !isShared) return false;
            }
            return true;
        });
    }, [quizzes, filterGrade, isSuperAdmin, currentUser?.id]);

    const activeSessions = useMemo(() => {
        const allowedQuizIds = new Set(filteredQuizzes.map(q => q.id));
        return sessions.filter(s => {
            if (!allowedQuizIds.has(s.quizId)) return false;
            const quiz = quizzes.find(q => q.id === s.quizId);
            if (!quiz) return false;
            
            const matchGrade = filterGrade === 'all' || quiz.grade === filterGrade;
            const matchQuiz = selectedQuizId === 'all' || s.quizId === selectedQuizId;
            
            if (!matchGrade || !matchQuiz) return false;

            // PHÂN QUYỀN GIÁM SÁT: Chỉ giám sát học sinh thuộc lớp của mình hoặc đề của mình (SuperAdmin thấy tất cả)
            if (!isSuperAdmin) {
                const canMonitor = isStudentAccessible(s.studentId, s.studentCode, quiz.createdBy);
                if (!canMonitor) return false;
            }

            return true;
        });
    }, [sessions, quizzes, filteredQuizzes, filterGrade, selectedQuizId, isSuperAdmin, isStudentAccessible]);

    // Lấy tất cả MAHS đã được vinh danh trong đề này
    const honoredStudentCodes = useMemo(() => {
        const codes = new Set<string>();
        publishedHistory
            .filter(p => p.quizId === selectedQuizId)
            .forEach(p => p.studentCodes.forEach(c => codes.add(c.toUpperCase())));
        return codes;
    }, [publishedHistory, selectedQuizId]);

    const bestResultsForBoard = useMemo(() => {
        if (selectedQuizId === 'all') return [];
        const currentQuiz = quizzes.find(q => q.id === selectedQuizId);
        const grouped: Record<string, Result> = {};
        
        results.forEach(r => {
            // Phân quyền Bảng vàng: GV chỉ xem/vinh danh HS lớp mình hoặc đề của mình
            if (!isSuperAdmin) {
                const canView = isStudentAccessible(r.studentId, r.studentCode, currentQuiz?.createdBy);
                if (!canView) return;
            }

            const code = r.studentCode?.toUpperCase() || `ID_${r.studentId}`;
            if (!grouped[code] || r.score > grouped[code].score) {
                grouped[code] = r;
            }
        });

        return Object.values(grouped)
            .filter(r => {
                const matchCode = !searchCode || r.studentCode?.toUpperCase().includes(searchCode.toUpperCase());
                const notHonored = !honoredStudentCodes.has(r.studentCode?.toUpperCase() || '');
                return matchCode && notHonored;
            })
            .sort((a, b) => b.score - a.score);
    }, [results, selectedQuizId, searchCode, honoredStudentCodes, isSuperAdmin, isStudentAccessible, quizzes]);

    const handlePublish = async () => {
        if (selectedQuizId === 'all') return;
        const resultsToPublish = bestResultsForBoard.filter(r => selectedResultIds.has(r.id));
        if (resultsToPublish.length === 0) return alert("Vui lòng chọn ít nhất 1 học sinh.");

        const quiz = quizzes.find(q => q.id === selectedQuizId);
        const pub: PublishedResult = {
            id: uuidv4(), 
            quizId: selectedQuizId, 
            quizTitle: quiz?.title || '',
            publishedAt: new Date().toISOString(),
            studentCodes: resultsToPublish.map(r => r.studentCode || ''),
            results: resultsToPublish
        };
        await savePublishedResult(pub);
        setSelectedResultIds(new Set());
        alert("Đã vinh danh thành công!");
        refreshData();
    };

    const handleRevokeHonors = async (pubId: string) => {
        if (confirm("Bạn có chắc chắn muốn thu hồi vinh danh này?")) {
            await deletePublishedResult(pubId);
            refreshData();
        }
    };

    return (
        <div className="space-y-8 pb-32 animate-fade-in">
            <div className="bg-white p-8 rounded-[3rem] border shadow-sm space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-red-600 text-white rounded-2xl shadow-lg"><ShieldAlert size={24}/></div>
                        <div>
                            <h2 className="text-xl font-black uppercase tracking-tight leading-none">Kiểm soát phòng thi</h2>
                            <div className="flex items-center gap-2 mt-2">
                                <div className={`w-2 h-2 rounded-full ${dbStatus ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
                                <span className="text-[10px] font-black uppercase text-slate-400">Trạng thái: {dbStatus ? 'Trực tuyến' : 'Ngoại tuyến'}</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleHardReset} className="px-5 py-3 bg-red-50 text-red-600 rounded-2xl hover:bg-red-600 hover:text-white transition-all text-[10px] font-black uppercase border border-red-100 flex items-center gap-2">
                            <Eraser size={14}/> Giải cứu treo
                        </button>
                        <button onClick={() => refreshData()} className="p-3 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all shadow-sm">
                            <RefreshCw size={20} className={isRefreshing ? 'animate-spin' : ''}/>
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase ml-2">1. Chọn Khối</label>
                        <select 
                            className="w-full bg-slate-50 border rounded-2xl p-4 text-xs font-black outline-none focus:border-blue-400" 
                            value={filterGrade} 
                            onChange={e => {
                                setFilterGrade(e.target.value as any);
                                setSelectedQuizId('all'); // Reset đề khi đổi khối
                            }}
                        >
                            <option value="all">Tất cả Khối</option>
                            <option value="12">Khối 12</option>
                            <option value="11">Khối 11</option>
                            <option value="10">Khối 10</option>
                        </select>
                    </div>
                    <div className="col-span-1 md:col-span-3 space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase ml-2">2. Chọn Đề thi</label>
                        <select 
                            className="w-full bg-slate-50 border rounded-2xl p-4 text-xs font-black outline-none focus:border-blue-400" 
                            value={selectedQuizId} 
                            onChange={e => setSelectedQuizId(e.target.value)}
                        >
                            <option value="all">-- Chọn đề thi để quản lý vinh danh --</option>
                            {filteredQuizzes.map(q => <option key={q.id} value={q.id}>[{q.grade}] {q.title}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-[2.5rem] border shadow-sm overflow-hidden">
                <div className="p-6 border-b bg-slate-50 flex items-center justify-between">
                    <h3 className="text-[11px] font-black uppercase text-slate-500 flex items-center gap-2">
                        <Wifi size={14} className="text-emerald-500"/> Thí sinh đang thi ({activeSessions.length})
                    </h3>
                </div>
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-white border-b text-[10px] font-black uppercase text-slate-400">
                            <th className="p-6">Thí sinh</th>
                            <th className="p-6">Đề thi</th>
                            <th className="p-6 text-center">Vi phạm</th>
                            <th className="p-6 text-center">Kết nối</th>
                            <th className="p-6 text-center">Thao tác</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {activeSessions.map((s) => (
                            <tr key={s.id} className="hover:bg-slate-50 transition-all">
                                <td className="p-6">
                                    <p className="font-black uppercase text-xs text-slate-700">{s.studentName}</p>
                                    <p className="text-[9px] text-slate-400 font-bold">MSHS: {s.studentCode}</p>
                                </td>
                                <td className="p-6">
                                    <p className="font-black uppercase text-[10px] text-blue-600 truncate max-w-[150px]">{s.quizTitle || 'Không rõ'}</p>
                                </td>
                                <td className="p-6 text-center">
                                    <span className={`px-3 py-1 rounded-lg text-[10px] font-black ${s.violationCount > 0 ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-300'}`}>
                                        {s.violationCount}/3
                                    </span>
                                </td>
                                <td className="p-6 text-center">
                                    {differenceInSeconds(now, new Date(s.lastUpdate)) > 60 ? 
                                        <div className="flex flex-col items-center gap-1 text-red-400"><WifiOff size={16}/><span className="text-[8px] font-bold">Mất mạng</span></div> : 
                                        <div className="flex flex-col items-center gap-1 text-emerald-500"><Wifi size={16}/><span className="text-[8px] font-bold">Ổn định</span></div>
                                    }
                                </td>
                                <td className="p-6 text-center">
                                    <button onClick={() => deleteExamSession(s.id).then(() => refreshData())} className="p-2 text-slate-300 hover:text-red-500 transition-colors" title="Buộc dừng thi">
                                        <XCircle size={20}/>
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {activeSessions.length === 0 && (
                    <div className="p-12 text-center text-slate-300 font-black uppercase text-[10px] italic">Hiện không có thí sinh nào đang làm bài</div>
                )}
            </div>

            {selectedQuizId !== 'all' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* CỘT 1: CHỌN VINH DANH MỚI */}
                    <div className="bg-slate-900 p-8 rounded-[3.5rem] shadow-2xl space-y-8 h-fit">
                        <div className="flex justify-between items-center text-white border-b border-white/10 pb-6">
                            <div className="flex items-center gap-4">
                                <Trophy size={28} className="text-yellow-500 drop-shadow-lg"/>
                                <h3 className="text-xl font-black uppercase italic tracking-tight text-white">Bảng Vàng Đề Thi</h3>
                            </div>
                        </div>

                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18}/>
                            <input 
                                className="w-full bg-slate-800 border-none rounded-2xl p-4 pl-12 text-xs font-bold text-white outline-none focus:ring-2 focus:ring-yellow-500 transition-all" 
                                placeholder="Tìm MAHS để vinh danh..." 
                                value={searchCode}
                                onChange={e => setSearchCode(e.target.value)}
                            />
                        </div>

                        <div className="bg-slate-800/40 rounded-[2rem] overflow-hidden max-h-[500px] overflow-y-auto custom-scrollbar border border-white/5">
                            <table className="w-full text-left text-white">
                                <thead>
                                    <tr className="text-[9px] uppercase text-slate-500 border-b border-white/10 bg-black/20">
                                        <th className="p-5">Thí sinh</th>
                                        <th className="p-5 text-center">Điểm số</th>
                                        <th className="p-5 text-center">Chọn</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {bestResultsForBoard.map((r) => {
                                        const isSelected = selectedResultIds.has(r.id);
                                        return (
                                            <tr key={r.id} onClick={() => { const s = new Set(selectedResultIds); isSelected ? s.delete(r.id) : s.add(r.id); setSelectedResultIds(s); }} className="cursor-pointer hover:bg-white/5 transition-colors group">
                                                <td className="p-5">
                                                    <p className="font-black uppercase text-[11px] group-hover:text-yellow-400 transition-colors">{r.studentName}</p>
                                                    <p className="text-[9px] font-bold text-slate-500">MSHS: {r.studentCode}</p>
                                                </td>
                                                <td className="p-5 text-center">
                                                    <span className="text-lg font-black text-yellow-500">{r.score.toFixed(2)}</span>
                                                </td>
                                                <td className="p-5 text-center">
                                                    {isSelected ? <CheckSquare className="mx-auto text-yellow-500 scale-110" /> : <Square className="mx-auto text-slate-700" />}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            {bestResultsForBoard.length === 0 && (
                                <div className="p-10 text-center text-slate-600 font-bold uppercase text-[9px]">Không tìm thấy kết quả phù hợp hoặc tất cả đã được vinh danh</div>
                            )}
                        </div>

                        <button 
                            onClick={handlePublish} 
                            disabled={selectedResultIds.size === 0} 
                            className="w-full py-5 bg-yellow-500 text-slate-900 rounded-[2rem] font-black text-xs uppercase shadow-[0_10px_30px_rgba(234,179,8,0.3)] hover:bg-white transition-all disabled:opacity-20 flex items-center justify-center gap-3"
                        >
                            <Medal size={20}/> CÔNG BỐ VINH DANH ({selectedResultIds.size})
                        </button>
                    </div>

                    {/* CỘT 2: DANH SÁCH ĐÃ VINH DANH */}
                    <div className="bg-white p-8 rounded-[3.5rem] border shadow-sm space-y-8 flex flex-col">
                        <div className="flex items-center gap-4 border-b pb-6">
                            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl shadow-sm"><UserCheck size={24}/></div>
                            <h3 className="text-xl font-black uppercase tracking-tight text-slate-800 leading-none">Lịch sử Vinh danh</h3>
                        </div>

                        <div className="flex-1 space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                            {publishedHistory.filter(p => p.quizId === selectedQuizId).map((pub) => (
                                <div key={pub.id} className="bg-slate-50 rounded-[2rem] p-6 border-2 border-transparent hover:border-emerald-100 transition-all space-y-4 group">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{format(new Date(pub.publishedAt), 'HH:mm • dd/MM/yyyy')}</p>
                                            <h4 className="font-black text-emerald-600 text-[11px] uppercase mt-1">Gói vinh danh {pub.results.length} học sinh</h4>
                                        </div>
                                        <button 
                                            onClick={() => handleRevokeHonors(pub.id)} 
                                            className="p-3 bg-white text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all shadow-sm"
                                            title="Thu hồi vinh danh"
                                        >
                                            <UserX size={16}/>
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {pub.results.map(r => (
                                            <div key={r.id} className="bg-white px-3 py-1.5 rounded-lg border flex items-center gap-2 shadow-sm">
                                                <span className="text-[9px] font-black text-slate-700 uppercase">{r.studentName}</span>
                                                <span className="text-[9px] font-black text-emerald-600">{r.score.toFixed(1)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            {publishedHistory.filter(p => p.quizId === selectedQuizId).length === 0 && (
                                <div className="py-20 text-center space-y-4">
                                    <History size={48} className="mx-auto text-slate-100"/>
                                    <p className="text-slate-300 font-black uppercase text-[10px] italic">Chưa có ai được vinh danh trong đề này</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
