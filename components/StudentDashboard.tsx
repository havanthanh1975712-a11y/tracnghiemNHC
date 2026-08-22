
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User, Quiz, Result, PublishedResult, Chapter, Grade } from '../types';
import { getQuizzes, getResultsForStudent, getPublishedResults, getQuizById, getStudentActiveSessions, deleteExamSession, getChapters } from '../services/storage';
import QuizTaker from './QuizTaker';
import QuickPractice from './QuickPractice';
import ResultDetailModal from './admin/ResultDetailModal';
import QuizPreviewModal from './admin/QuizPreviewModal';
import { Clock, Trophy, BookOpen, Eye, Medal, History, ChevronRight, Star, Award, Users, X, Loader2, RefreshCw, Zap, ShieldAlert, Calendar } from 'lucide-react';
import { format, isBefore, isAfter, addMinutes, differenceInMinutes } from 'date-fns';
import LatexText from './LatexText';
import { Lock } from 'lucide-react';

interface StudentDashboardProps {
  user: User;
  targetQuizId?: string | null;
}

export default function StudentDashboard({ user, targetQuizId }: StudentDashboardProps) {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const gradeFilter = user.grade || '12';
  const [chapterFilter, setChapterFilter] = useState('all');
  const [publishedResults, setPublishedResults] = useState<PublishedResult[]>([]);
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [activePracticeQuiz, setActivePracticeQuiz] = useState<Quiz | null>(null);
  const [selectedResult, setSelectedResult] = useState<{ result: Result, quiz: Quiz } | null>(null);
  const [viewingHonorees, setViewingHonorees] = useState<PublishedResult | null>(null);
  const [previewQuiz, setPreviewQuiz] = useState<Quiz | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(false);

  const refreshData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    try {
        const [allQuizzes, userResults, latestPubs, allChapters] = await Promise.all([
            getQuizzes('all'), 
            getResultsForStudent(user.id, user.studentCode), 
            getPublishedResults(20),
            getChapters()
        ]);
        
        setChapters(allChapters);
        // CHỈ HIỆN ĐỀ CÔNG KHAI (KHÔNG PHẢI UNLISTED) TRÊN DASHBOARD
        setQuizzes(allQuizzes.filter(q => q.isPublished && !q.isUnlisted));

        const sortedResults = (userResults as Result[]).sort((a: Result, b: Result) => 
            new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
        );
        setResults(sortedResults);

        const userPubs = latestPubs.filter((p: PublishedResult) => 
            user.studentCode && p.studentCodes.map((c: string) => c.toUpperCase()).includes(user.studentCode.toUpperCase())
        ).sort((a: PublishedResult, b: PublishedResult) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
        setPublishedResults(userPubs);

    } catch (err) {
        console.error("Lỗi đồng bộ dữ liệu StudentDashboard:", err);
    } finally {
        setIsLoading(false);
    }
  }, [user.id, user.studentCode, user.grade]);

  const [sessionWarning, setSessionWarning] = useState<{
    type: 'different_quiz' | 'same_quiz';
    quizTitle: string;
    onConfirm?: () => void;
    onCancel?: () => void;
  } | null>(null);

  const checkActiveSession = async (quizId: string): Promise<boolean> => {
    setIsCheckingSession(true);
    try {
      const sessions = await getStudentActiveSessions(user.id);
      // Lọc các phiên còn "sống" (cập nhật trong 10 phút qua)
      const activeSessions = sessions.filter(s => {
        const lastUpdate = new Date(s.lastUpdate);
        return differenceInMinutes(new Date(), lastUpdate) < 10;
      });

      if (activeSessions.length > 0) {
        // 1. Chặn nếu làm đề KHÁC
        const otherQuizSession = activeSessions.find(s => s.quizId !== quizId);
        if (otherQuizSession) {
          return new Promise((resolve) => {
            setSessionWarning({
              type: 'different_quiz',
              quizTitle: otherQuizSession.quizTitle || 'Không rõ',
              onConfirm: async () => {
                try {
                  await deleteExamSession(otherQuizSession.id);
                  setSessionWarning(null);
                  resolve(true);
                } catch (e) {
                  alert("Không thể kết thúc phiên cũ. Vui lòng thử lại.");
                  resolve(false);
                }
              },
              onCancel: () => {
                setSessionWarning(null);
                resolve(false);
              }
            });
          });
        }

        // 2. Cảnh báo nếu làm CÙNG ĐỀ trên máy khác
        const sameQuizSession = activeSessions.find(s => s.quizId === quizId);
        if (sameQuizSession) {
          return new Promise((resolve) => {
            setSessionWarning({
              type: 'same_quiz',
              quizTitle: sameQuizSession.quizTitle || 'Đề này',
              onConfirm: async () => {
                try {
                  await deleteExamSession(sameQuizSession.id);
                  setSessionWarning(null);
                  resolve(true);
                } catch (e) {
                  alert("Không thể xóa phiên cũ. Vui lòng thử lại.");
                  resolve(false);
                }
              },
              onCancel: () => {
                setSessionWarning(null);
                resolve(false);
              }
            });
          });
        }
      }
      return true;
    } catch (e) {
      console.error("Lỗi kiểm tra phiên làm bài:", e);
      return true; // Cho phép nếu lỗi mạng
    } finally {
      setIsCheckingSession(false);
    }
  };

  const handleStartQuiz = async (quiz: Quiz) => {
    const canStart = await checkActiveSession(quiz.id);
    if (canStart) setActiveQuiz(quiz);
  };

  const handleStartPractice = async (quiz: Quiz) => {
    const canStart = await checkActiveSession(quiz.id);
    if (canStart) setActivePracticeQuiz(quiz);
  };

  // Xử lý tự động mở đề thi từ link ẩn
  useEffect(() => {
    if (targetQuizId) {
        const checkTargetQuiz = async () => {
            setIsLoading(true);
            try {
                const quiz = await getQuizById(targetQuizId);
                if (quiz && quiz.isPublished) {
                    const curNow = new Date();
                    const startX = quiz.startTime ? new Date(quiz.startTime) : null;
                    const endY = quiz.endTime ? new Date(quiz.endTime) : null;
                    const isFlexibleWindow = Boolean(startX && endY && endY.getTime() > startX.getTime());

                    if (quiz.type === 'test' && startX) {
                        if (isFlexibleWindow && endY) {
                            if (isBefore(curNow, startX)) {
                                alert(`Đề thi chưa mở. Khung giờ mở đề: ${format(startX, 'HH:mm dd/MM/yyyy')} đến ${format(endY, 'HH:mm dd/MM/yyyy')}.`);
                                return;
                            }
                            if (isAfter(curNow, endY)) {
                                alert(`Đã hết thời hạn vào làm đề thi này (Hạn chót vào thi: ${format(endY, 'HH:mm dd/MM/yyyy')}).`);
                                return;
                            }
                        } else {
                            const globalDeadline = addMinutes(startX, quiz.durationMinutes);
                            if (isBefore(curNow, startX)) {
                                alert(`Đề thi chưa đến giờ. Giờ thi bắt đầu lúc ${format(startX, 'HH:mm dd/MM/yyyy')}.`);
                                return;
                            }
                            if (isAfter(curNow, globalDeadline)) {
                                alert(`Đề thi đã kết thúc lúc ${format(globalDeadline, 'HH:mm dd/MM/yyyy')}.`);
                                return;
                            }
                        }
                    }

                    // Kiểm tra phiên trước khi tự động mở
                    const canStart = await checkActiveSession(quiz.id);
                    if (canStart) {
                        setActiveQuiz(quiz);
                        // Xóa param trên URL để không bị loop
                        window.history.replaceState({}, document.title, window.location.pathname);
                    }
                } else {
                    alert("Đề thi này không tồn tại hoặc chưa được phát hành.");
                }
            } catch (e) {
                console.error("Lỗi lấy đề thi từ link:", e);
            } finally {
                setIsLoading(false);
            }
        };
        checkTargetQuiz();
    }
  }, [targetQuizId]);

  const stats = useMemo(() => {
    const totalQuizzes = results.length;
    const avgScore = totalQuizzes > 0 ? (results.reduce((acc, r) => acc + r.score, 0) / totalQuizzes) : 0;
    const totalSeconds = results.reduce((acc, r) => acc + (r.durationSeconds || 0), 0);
    const effortPoints = totalSeconds / 2700; 

    const bonusPoints = results.reduce((acc, r) => {
        const bp = (r as any).bonusPoint;
        if (bp !== undefined && bp !== null) {
            return acc + Number(bp);
        }
        if (r.score >= 8) return acc + 1;
        return acc;
    }, 0);

    return {
        totalQuizzes,
        avgScore,
        totalSeconds,
        effortPoints,
        bonusPoints,
        accumulatedPoints: effortPoints + bonusPoints
    };
  }, [results]);

  useEffect(() => {
    refreshData();
    const interval = setInterval(() => refreshData(true), 60000); 
    return () => clearInterval(interval);
  }, [refreshData]);

  const handleExitQuiz = () => {
    setActiveQuiz(null);
    setActivePracticeQuiz(null);
    setTimeout(() => refreshData(), 500);
  };

  const formatStudyTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h} giờ ${m} phút` : `${m} phút`;
  };

  const now = new Date();

  // Logic kiểm tra lộ trình học tập (Prerequisite Path)
  const getQuizStatus = (q: Quiz) => {
    const qOrder = q.orderIndex ?? 1;
    
    // Đề có STT = 0 là đề tự do (không chặn ai và không bị ai chặn)
    if (qOrder === 0) return { isLocked: false };
    
    // Nếu chưa có chương hoặc STT = 1 thì mặc định mở
    if (!q.category || qOrder <= 1) return { isLocked: false };
    
    // Tìm các đề trong cùng chương có thứ tự nhỏ hơn
    // Chỉ xét các đề đang còn hạn (để tránh học sinh bị kẹt bởi đề đã hết hạn)
    // Và bỏ qua các đề có STT = 0
    const prerequisites = quizzes
        .filter(prev => 
            prev.category === q.category && 
            (prev.orderIndex ?? 0) > 0 && 
            (prev.orderIndex ?? 0) < qOrder &&
            (!prev.endTime || isBefore(now, new Date(prev.endTime)))
        )
        .sort((a, b) => (b.orderIndex ?? 0) - (a.orderIndex ?? 0));
    
    if (prerequisites.length === 0) return { isLocked: false };
    
    const prevQuiz = prerequisites[0];
    const bestScore = results
        .filter(r => r.quizId === prevQuiz.id)
        .reduce((max, r) => Math.max(max, r.score), 0);
    
    if (bestScore < 5) {
        return { isLocked: true, reason: `Cần đạt >= 5 điểm ở đề "${prevQuiz.title}"` };
    }
    
    return { isLocked: false };
  };

  const filteredQuizzes = useMemo(() => {
    return quizzes.filter((q: Quiz) => {
        const matchGrade = gradeFilter === 'all' || q.grade === gradeFilter || q.grade === 'all';
        const matchChapter = chapterFilter === 'all' || q.category === chapterFilter;
        
        // Kiểm tra phân quyền giao đề theo Lớp
        let matchClass = true;
        if (q.targetType === 'classes') {
          if (q.assignedClassIds && q.assignedClassIds.length > 0) {
            matchClass = Boolean(user.classId && q.assignedClassIds.includes(user.classId));
          }
        }

        return matchGrade && matchChapter && matchClass;
    });
  }, [quizzes, gradeFilter, chapterFilter, user.classId]);

  if (activeQuiz) {
    return <QuizTaker quiz={activeQuiz} student={user} onExit={handleExitQuiz} />;
  }

  if (activePracticeQuiz) {
    return <QuickPractice quiz={activePracticeQuiz} student={user} onExit={handleExitQuiz} />;
  }

  const testQuizzes = filteredQuizzes.filter(q => q.type === 'test');
  const practiceQuizzes = filteredQuizzes.filter(q => q.type === 'practice' && (!q.endTime || isBefore(now, new Date(q.endTime))));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-10 pb-20">
      {isCheckingSession && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[5000] flex items-center justify-center">
            <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-4">
                <Loader2 className="animate-spin text-blue-600" size={48}/>
                <p className="font-black uppercase text-xs tracking-widest text-slate-800">Đang kiểm tra bảo mật...</p>
            </div>
        </div>
      )}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-400/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
        <div className="relative z-10">
            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight italic">Chào mừng, {user.fullName} 👋</h1>
            <p className="text-slate-500 font-medium uppercase text-[10px] tracking-widest mt-1">
              Khối {user.grade}
              {user.className ? ` • Lớp ${user.className}` : ''}
              {user.academicYear ? ` (${user.academicYear})` : ''}
              {` • Mã số: ${user.studentCode}`}
            </p>
        </div>
        <div className="flex items-center gap-4 relative z-10">
            <button onClick={() => refreshData()} className={`p-3 rounded-2xl bg-slate-50 text-slate-400 hover:text-blue-600 transition-all ${isLoading ? 'animate-spin' : ''}`}>
                <RefreshCw size={20}/>
            </button>
            <div className="flex items-center gap-3 bg-yellow-50 px-6 py-3 rounded-[1.5rem] border border-yellow-100 shadow-sm group">
                <div className="w-10 h-10 bg-yellow-400 text-white rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform"><Medal size={24}/></div>
                <div className="text-right">
                    <p className="text-[9px] font-black text-yellow-600 uppercase leading-none mb-1">Tích lũy</p>
                    <span className="text-xl font-black text-yellow-700">{stats.accumulatedPoints.toFixed(2)}</span>
                </div>
            </div>
        </div>
      </header>

      {/* Filters Section */}
      <section className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-2xl border border-slate-100">
            <ShieldAlert size={16} className="text-blue-600"/>
            <span className="text-[10px] font-black uppercase text-slate-400">Bộ lọc thông minh:</span>
        </div>
        
        <div className="flex flex-wrap gap-3">
          <select 
            className="bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer min-w-[200px]"
            value={chapterFilter}
            onChange={(e) => setChapterFilter(e.target.value)}
          >
            <option value="all">Tất cả chương</option>
            {chapters
              .filter((c: Chapter) => gradeFilter === 'all' || String(c.grade) === String(gradeFilter))
              .map((c: Chapter) => (
                <option key={c.id} value={c.name}>{c.name || (c as any).title || "Chương chưa đặt tên"}</option>
              ))
            }
          </select>

          {chapterFilter !== 'all' && (
            <button 
                onClick={() => { setChapterFilter('all'); }}
                className="px-4 py-2.5 bg-red-50 text-red-600 rounded-2xl text-[10px] font-black uppercase hover:bg-red-600 hover:text-white transition-all shadow-sm"
            >
                Đặt lại
            </button>
          )}
        </div>

        <div className="ml-auto text-[9px] font-black uppercase text-slate-400 italic">
            {user.className ? `Lớp ${user.className} • ` : ''}Học sinh Khối {user.grade || '12'} | Hiển thị: {filteredQuizzes.length} đề thi
        </div>
      </section>

      {isLoading && results.length === 0 && (
          <div className="py-20 text-center space-y-4">
              <Loader2 className="animate-spin text-blue-500 mx-auto" size={40}/>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Đang kết nối Cloud...</p>
          </div>
      )}

      {!isLoading && publishedResults.length > 0 && (
          <section className="animate-fade-in-up">
              <div className="flex items-center gap-3 mb-6 px-4">
                  <Star className="text-yellow-500 fill-yellow-500" size={18}/>
                  <h2 className="text-[11px] font-black text-slate-800 uppercase tracking-widest italic">Bảng Vàng Danh Dự</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {publishedResults.map(pub => {
                      const userResultInPub = pub.results.find(r => r.studentCode?.toUpperCase() === user.studentCode?.toUpperCase());
                      return (
                          <div key={pub.id} className="relative group overflow-hidden bg-slate-900 rounded-[2rem] p-4 shadow-xl border-2 border-yellow-500/20 hover:border-yellow-500 transition-all flex flex-col h-full">
                              <div className="absolute top-0 right-0 w-24 h-24 bg-yellow-500/10 rounded-full blur-2xl -mr-12 -mt-12 group-hover:bg-yellow-500/20 transition-all"></div>
                              <div className="relative z-10 flex flex-col h-full space-y-3">
                                  <div className="flex items-center gap-2">
                                      <div className="w-8 h-8 bg-yellow-500 text-slate-900 rounded-lg flex items-center justify-center shadow-lg shrink-0"><Award size={18} /></div>
                                      <div className="flex-1 overflow-hidden">
                                          <p className="text-[7px] font-black text-yellow-500 uppercase tracking-widest truncate">{pub.quizTitle}</p>
                                          <p className="text-[8px] font-bold text-white/50 uppercase leading-none">{format(new Date(pub.publishedAt), 'dd/MM/yy')}</p>
                                      </div>
                                  </div>
                                  <div className="bg-white/5 rounded-xl p-3 border border-white/10 backdrop-blur-sm flex-1 flex flex-col justify-between items-center text-center">
                                      <div className="flex flex-col items-center">
                                          <p className="text-[7px] font-black text-slate-400 uppercase mb-1">Điểm số</p>
                                          <div className="text-xl font-black text-emerald-400 leading-none mb-1">{userResultInPub?.score.toFixed(1)}</div>
                                      </div>
                                      <button onClick={() => setViewingHonorees(pub)} className="w-full mt-2 py-2 bg-yellow-500 text-slate-900 rounded-lg text-[8px] font-black uppercase hover:bg-white transition-all shadow-md flex items-center justify-center gap-1.5"><Users size={12}/> Xem lớp</button>
                                  </div>
                              </div>
                          </div>
                      );
                  })}
              </div>
          </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-[2rem] p-8 border shadow-sm flex items-center gap-5 transition-transform hover:scale-105">
            <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shrink-0 shadow-inner"><Trophy size={28} /></div>
            <div><p className="text-slate-400 text-[10px] font-black uppercase">ĐTB Chung</p><h3 className="text-2xl font-black text-slate-800">{stats.avgScore.toFixed(2)}</h3></div>
        </div>
        <div className="bg-white rounded-[2rem] p-8 border shadow-sm flex items-center gap-5 transition-transform hover:scale-105">
            <div className="w-14 h-14 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center shrink-0 shadow-inner"><BookOpen size={28} /></div>
            <div><p className="text-slate-400 text-[10px] font-black uppercase">Bài hoàn thành</p><h3 className="text-2xl font-black text-slate-800">{stats.totalQuizzes} bài</h3></div>
        </div>
        <div className="bg-white rounded-[2rem] p-8 border shadow-sm flex items-center gap-5 transition-transform hover:scale-105">
            <div className="w-14 h-14 bg-orange-50 text-orange-600 rounded-2xl flex items-center justify-center shrink-0 shadow-inner"><Clock size={28} /></div>
            <div><p className="text-slate-400 text-[10px] font-black uppercase">TG luyện tập</p><h3 className="text-xl font-black text-slate-800">{formatStudyTime(stats.totalSeconds)}</h3></div>
        </div>
      </div>

      <section className="space-y-12">
          {testQuizzes.length > 0 && (
              <div>
                  <div className="flex items-center gap-4 mb-8 px-2">
                      <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">Bài kiểm tra định kỳ</h2>
                      <div className="h-px flex-1 bg-red-100"></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      {testQuizzes.map(q => {
                          const startX = q.startTime ? new Date(q.startTime) : null;
                          const endY = q.endTime ? new Date(q.endTime) : null;
                          const isFlexibleWindow = Boolean(startX && endY && endY.getTime() > startX.getTime());
                          
                          let isStarted = true;
                          let isEnded = false;
                          
                          if (startX) {
                              if (isFlexibleWindow && endY) {
                                  isStarted = !isBefore(now, startX);
                                  isEnded = isAfter(now, endY);
                              } else {
                                  const globalDeadline = addMinutes(startX, q.durationMinutes);
                                  isStarted = !isBefore(now, startX);
                                  isEnded = isAfter(now, globalDeadline);
                              }
                          }
                          
                          const alreadyDone = results.some(r => r.quizId === q.id);

                          return (
                              <div key={q.id} className={`bg-white rounded-[1.5rem] border p-6 flex flex-col transition-all border-b-4 ${alreadyDone ? 'border-emerald-500' : (isEnded ? 'border-slate-300 opacity-60' : (isStarted ? 'border-blue-600 shadow-xl' : 'border-slate-200 opacity-60 grayscale'))}`}>
                                  <div className="flex justify-between items-start mb-3">
                                      <div className={`px-3 py-1 rounded-xl text-[8px] font-black uppercase ${alreadyDone ? 'bg-emerald-50 text-emerald-600' : (isEnded ? 'bg-slate-100 text-slate-400' : (isStarted ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'))}`}>
                                          {alreadyDone ? 'ĐÃ XONG' : (isEnded ? 'HẾT HẠN' : (isStarted ? (isFlexibleWindow ? 'ĐANG MỞ ĐỀ' : 'ĐANG THI') : 'CHỜ GIỜ'))}
                                      </div>
                                      <span className="text-[9px] font-black text-slate-400 uppercase bg-slate-100 px-2 py-0.5 rounded-md">{q.durationMinutes} phút</span>
                                  </div>
                                  {q.category && <p className="text-[8px] font-black text-blue-500 uppercase tracking-widest mb-1 italic truncate">{q.category}</p>}
                                  <h3 className="font-black text-slate-800 text-[13px] leading-tight mb-3 uppercase line-clamp-2 min-h-[2.5em]">{q.title}</h3>
                                  
                                  {startX && (
                                      <div className="text-[10px] font-bold text-slate-600 mb-4 bg-slate-50 p-2.5 rounded-xl border border-slate-100 space-y-1">
                                          {isFlexibleWindow && endY ? (
                                              <>
                                                  <div className="flex items-center gap-1.5 text-blue-700">
                                                      <Calendar size={13} className="shrink-0" />
                                                      <span>Khung mở: <strong>{format(startX, 'HH:mm dd/MM')}</strong> → <strong>{format(endY, 'HH:mm dd/MM')}</strong></span>
                                                  </div>
                                                  <div className="text-[9px] text-slate-500 font-medium pl-4">
                                                      ⚡ Vào bất kỳ lúc nào cũng được tính đủ {q.durationMinutes} phút làm bài.
                                                  </div>
                                              </>
                                          ) : (
                                              <div className="flex items-center gap-1.5 text-slate-800">
                                                  <Calendar size={13} className="text-blue-600 shrink-0" />
                                                  <span>Giờ thi: <strong>{format(startX, 'HH:mm - dd/MM/yyyy')}</strong> (Đồng loạt)</span>
                                              </div>
                                          )}
                                      </div>
                                  )}

                                  <div className="mt-auto">
                                      {alreadyDone ? (
                                          <button onClick={() => {
                                              const res = results.find(r => r.quizId === q.id);
                                              if (res) setSelectedResult({ result: res, quiz: q });
                                          }} className="w-full py-2.5 rounded-xl border-2 border-slate-100 text-slate-600 font-black uppercase text-[9px] hover:bg-slate-50 flex items-center justify-center gap-2"><Eye size={12}/> Xem lại</button>
                                      ) : (
                                          <button 
                                            disabled={!isStarted || isEnded}
                                            onClick={() => isStarted && !isEnded ? handleStartQuiz(q) : null} 
                                            className={`w-full py-2.5 rounded-xl font-black uppercase text-[9px] transition-all ${isStarted && !isEnded ? 'bg-slate-900 text-white shadow-xl hover:bg-black active:scale-95' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                                          >
                                              {isEnded ? 'Đã hết hạn vào thi' : (isStarted ? (isFlexibleWindow ? `Vào làm bài (${q.durationMinutes} phút)` : 'Vào thi ngay') : `Mở lúc: ${format(startX || now, 'HH:mm - dd/MM')}`)}
                                          </button>
                                      )}
                                  </div>
                              </div>
                          );
                      })}
                  </div>
              </div>
          )}

          <div>
              <div className="flex items-center gap-4 mb-8 px-2">
                  <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">Kho đề luyện tập</h2>
                  <div className="h-px flex-1 bg-slate-100"></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {practiceQuizzes.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0)).map(q => {
                    const status = getQuizStatus(q);
                    const qStats = (qid: string) => {
                      const attempts = results.filter(r => r.quizId === qid);
                      if (attempts.length === 0) return null;
                      return { count: attempts.length, max: Math.max(...attempts.map(r => r.score)) };
                    };
                    const qs = qStats(q.id);
                    return (
                      <div key={q.id} className={`bg-white rounded-[1.5rem] border border-slate-200 p-6 flex flex-col transition-all border-b-4 ${status.isLocked ? 'opacity-75 grayscale' : 'hover:shadow-xl hover:-translate-y-1 group hover:border-b-blue-600'}`}>
                        <div className="flex justify-between items-start mb-3">
                          <div className="px-2 py-1 bg-blue-50 text-blue-600 rounded-lg font-black text-[8px] uppercase">{q.questions.length} câu</div>
                          <span className="text-[9px] font-black text-slate-300 uppercase">{q.grade === 'all' ? 'Chung' : `Khối ${q.grade}`}</span>
                        </div>
                        {q.category && <p className="text-[8px] font-black text-blue-500 uppercase tracking-widest mb-1 italic truncate">{q.category}</p>}
                        <h3 className="font-black text-slate-800 text-[13px] leading-tight mb-4 group-hover:text-blue-600 uppercase flex items-center gap-2 line-clamp-2 min-h-[2.5em]">
                            {status.isLocked && <Lock size={14} className="text-slate-400 shrink-0"/>}
                            {q.title}
                        </h3>
                        
                        {status.isLocked ? (
                            <div className="mt-auto bg-slate-50 p-3 rounded-xl border border-slate-200">
                                <p className="text-[8px] font-black text-slate-400 uppercase mb-0.5">Đang khóa</p>
                                <p className="text-[9px] font-bold text-slate-600 leading-tight">{status.reason}</p>
                            </div>
                        ) : (
                            <>
                                <div className="bg-slate-50/50 rounded-xl p-3 grid grid-cols-2 gap-2 mb-6 text-center">
                                    <div><p className="text-[7px] font-black text-slate-400 uppercase mb-0.5">Đã làm</p><p className="text-xs font-black text-slate-700">{qs?.count || 0}</p></div>
                                    <div><p className="text-[7px] font-black text-blue-500 uppercase mb-0.5">Max</p><p className="text-xs font-black text-blue-600">{qs ? qs.max.toFixed(1) : '-'}</p></div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 mt-auto">
                                  <button onClick={() => handleStartPractice(q)} className="flex items-center justify-center gap-1.5 bg-slate-900 text-white py-2.5 rounded-xl text-[9px] font-black uppercase hover:bg-black transition-all shadow-md"><Zap size={12}/> Luyện</button>
                                  <button onClick={() => handleStartQuiz(q)} className="flex items-center justify-center gap-1.5 bg-blue-600 text-white py-2.5 rounded-xl text-[9px] font-black uppercase shadow-lg hover:bg-blue-700 transition-all">Làm</button>
                                </div>
                            </>
                        )}
                      </div>
                    );
                })}
              </div>
          </div>
      </section>

      <section className="pt-10">
          <div className="flex items-center gap-4 mb-8">
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2"><History size={20} className="text-blue-600"/> Lịch sử nộp bài gần đây</h2>
              <div className="h-px flex-1 bg-slate-100"></div>
          </div>
          <div className="bg-white rounded-[2.5rem] border shadow-sm overflow-hidden overflow-x-auto">
              <table className="w-full text-left">
                  <thead>
                      <tr className="bg-slate-50 border-b text-[9px] font-black uppercase tracking-widest text-slate-400">
                          <th className="p-6">Tên đề thi</th>
                          <th className="p-6 text-center">Thời điểm nộp</th>
                          <th className="p-6 text-center">Kết quả</th>
                          <th className="p-6 text-center">Hành động</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y">
                      {results.slice(0, 10).map((r, idx) => {
                          const quiz = quizzes.find(q => q.id === r.quizId);
                          return (
                              <tr key={r.id} className="hover:bg-slate-50 transition-colors group">
                                  <td className="p-6"><span className="font-black text-slate-800 uppercase text-xs leading-tight">{quiz?.title || 'Đề thi đã bị xóa'}</span></td>
                                  <td className="p-6 text-center text-xs font-bold text-slate-500">{format(new Date(r.submittedAt), 'HH:mm dd/MM/yyyy')}</td>
                                  <td className="p-6 text-center"><span className={`text-sm font-black ${r.score >= 8 ? 'text-emerald-600' : r.score >= 5 ? 'text-blue-600' : 'text-orange-600'}`}>{r.score.toFixed(2)}</span></td>
                                  <td className="p-6 text-center"><button onClick={() => quiz && setSelectedResult({ result: r, quiz: quiz })} className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-50 text-blue-600 rounded-xl text-[9px] font-black uppercase hover:bg-blue-600 hover:text-white transition-all shadow-sm">Xem lại <ChevronRight size={14}/></button></td>
                              </tr>
                          );
                      })}
                  </tbody>
              </table>
              {results.length === 0 && !isLoading && (
                  <div className="p-20 text-center text-slate-300 font-black uppercase text-[10px] italic">Bạn chưa thực hiện bài thi nào</div>
              )}
          </div>
      </section>

      {selectedResult && <ResultDetailModal isOpen={true} result={selectedResult.result} quiz={selectedResult.quiz} onClose={() => setSelectedResult(null)} />}
      {previewQuiz && <QuizPreviewModal quiz={previewQuiz} isAdmin={false} onClose={() => setPreviewQuiz(null)} />}
      {viewingHonorees && (
          <div className="fixed inset-0 bg-slate-900/95 z-[3000] flex items-center justify-center p-4 backdrop-blur-xl animate-fade-in">
              <div className="bg-white rounded-[3.5rem] w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl border-8 border-white">
                  <div className="p-8 bg-slate-900 text-white flex justify-between items-center shrink-0">
                      <div className="flex items-center gap-4">
                          <div className="p-3 bg-yellow-500 text-slate-900 rounded-2xl shadow-lg"><Trophy size={24}/></div>
                          <div><h3 className="text-lg font-black uppercase tracking-tight italic">Vinh Danh Tập Thể</h3><p className="text-[9px] font-bold text-slate-400 uppercase mt-1 leading-none">{viewingHonorees.quizTitle}</p></div>
                      </div>
                      <button onClick={() => setViewingHonorees(null)} className="p-4 bg-slate-800 rounded-2xl hover:bg-red-600 transition-colors"><X/></button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-8 space-y-4 custom-scrollbar bg-slate-50">
                      {viewingHonorees.results.map((r, idx) => (
                          <div key={r.id} className={`flex items-center justify-between p-5 rounded-[2rem] border-2 transition-all shadow-sm ${r.studentCode === user.studentCode ? 'border-yellow-500 bg-yellow-50' : 'border-white bg-white'}`}>
                              <div className="flex items-center gap-5">
                                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg ${idx === 0 ? 'bg-yellow-500 text-slate-900' : 'bg-slate-100 text-slate-400'}`}>{idx + 1}</div>
                                  <div><p className="font-black text-slate-800 uppercase text-sm leading-tight">{r.studentName}</p><p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">MSHS: {r.studentCode}</p></div>
                              </div>
                              <div className="text-right">
                                  <p className="text-[8px] font-black text-slate-300 uppercase leading-none">ĐIỂM SỐ</p>
                                  <p className="text-2xl font-black text-blue-600 leading-none">{r.score.toFixed(2)}</p>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      )}
      {/* Session Warning Modal */}
      {sessionWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className={`p-6 text-white ${sessionWarning.type === 'different_quiz' ? 'bg-red-500' : 'bg-amber-500'}`}>
              <div className="flex items-center gap-3 mb-2">
                <ShieldAlert className="w-8 h-8" />
                <h3 className="text-xl font-black uppercase tracking-tight">
                  {sessionWarning.type === 'different_quiz' ? 'Cảnh báo bảo mật' : 'Thông báo phiên làm bài'}
                </h3>
              </div>
              <p className="text-white/90 text-sm font-bold">
                {sessionWarning.type === 'different_quiz' 
                  ? 'Phát hiện nhiều phiên làm bài đồng thời' 
                  : 'Phát hiện phiên làm bài trên thiết bị khác'}
              </p>
            </div>
            
            <div className="p-8">
              <div className="mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Đề thi đang hoạt động:</p>
                <p className="text-slate-700 font-black text-lg leading-tight">{sessionWarning.quizTitle}</p>
              </div>

              <div className="space-y-4 text-slate-600 text-sm leading-relaxed">
                {sessionWarning.type === 'different_quiz' ? (
                  <p>
                    Hệ đồng nhận thấy bạn đang làm bài thi <span className="font-bold text-slate-900">"{sessionWarning.quizTitle}"</span>. 
                    Để đảm bảo tính công bằng, bạn <span className="font-bold text-red-600 underline">không thể</span> bắt đầu một đề thi mới khi chưa hoàn thành đề thi hiện tại.
                  </p>
                ) : (
                  <p>
                    Bạn đang có một phiên làm bài cho đề này trên thiết bị hoặc trình duyệt khác. 
                    Nếu tiếp tục, dữ liệu chưa nộp ở máy kia <span className="font-bold text-amber-600">sẽ bị mất</span>. Bạn có chắc chắn muốn bắt đầu lại trên máy này?
                  </p>
                )}
              </div>

              <div className="mt-8 flex flex-col gap-3">
                <button
                  onClick={sessionWarning.onConfirm}
                  className={`w-full py-4 text-white rounded-2xl font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 ${
                    sessionWarning.type === 'different_quiz' ? 'bg-red-500 hover:bg-red-600 shadow-red-100' : 'bg-amber-500 hover:bg-amber-600 shadow-amber-100'
                  }`}
                >
                  {sessionWarning.type === 'different_quiz' ? 'Kết thúc đề cũ & Bắt đầu đề mới' : 'Tiếp tục (Bắt đầu mới)'}
                </button>
                <button
                  onClick={sessionWarning.onCancel}
                  className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest hover:bg-slate-200 transition-all active:scale-95"
                >
                  Hủy bỏ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
