
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Quiz, User, Result, Question, ExamSession } from '../types';
import { saveResult, addPointsToUser, saveExamSession, deleteExamSession, verifyResultExists } from '../services/storage';
import { v4 as uuidv4 } from 'uuid';
import { Clock, Send, XCircle, ShieldAlert, Loader2, Trophy, Home, SearchCheck } from 'lucide-react';
import LatexText from './LatexText';
import { addMinutes, differenceInSeconds } from 'date-fns';

interface QuizTakerProps {
    quiz: Quiz;
    student: User;
    onExit: () => void;
}

export default function QuizTaker({ quiz, student, onExit }: QuizTakerProps) {
    const sessionIdRef = useRef(`sess_${student.id}_${quiz.id}_${uuidv4().slice(0, 8)}`);
    const backupKey = `quiz_backup_${student.id}_${quiz.id}`;
    const sessionStartKey = `quiz_session_start_${student.id}_${quiz.id}`;
    const isInternalActionRef = useRef(false);
    
    const orderedQuestions = useMemo(() => {
        const mcq = quiz.questions.filter(q => q.type === 'mcq');
        const tf = quiz.questions.filter(q => q.type === 'group-tf');
        const short = quiz.questions.filter(q => q.type === 'short');
        return [...mcq, ...tf, ...short];
    }, [quiz.questions]);

    const getInitialAnswers = () => {
        const saved = localStorage.getItem(backupKey);
        if (saved) {
            try { return JSON.parse(saved); } catch (e) { return {}; }
        }
        return {};
    };

    // Khởi tạo hoặc khôi phục thời điểm học sinh bấm bắt đầu làm bài
    const studentStartTime = useMemo(() => {
        const saved = localStorage.getItem(sessionStartKey);
        if (saved) {
            try {
                const parsed = new Date(saved);
                if (!isNaN(parsed.getTime())) return parsed;
            } catch (e) {}
        }
        const now = new Date();
        localStorage.setItem(sessionStartKey, now.toISOString());
        return now;
    }, [sessionStartKey]);

    const initialStartTimeRef = useRef(studentStartTime.toISOString());

    const deadline = useMemo(() => {
        if (quiz.type === 'test') {
            const startX = quiz.startTime ? new Date(quiz.startTime) : null;
            const endY = quiz.endTime ? new Date(quiz.endTime) : null;
            
            // TH 1: Khung giờ mở đề linh hoạt từ X đến Y (với Y > X)
            // Trong khung X -> Y, học sinh vào lúc nào được tính TRỌN VẸN durationMinutes kể từ lúc vào
            if (startX && endY && endY.getTime() > startX.getTime()) {
                return addMinutes(studentStartTime, quiz.durationMinutes);
            }
            
            // TH 2: Thi đồng loạt (X = Y hoặc không có Y)
            // Cả lớp kết thúc đồng loạt trước hạn chót chung: startX + durationMinutes
            if (startX) {
                return addMinutes(startX, quiz.durationMinutes);
            }
        }
        
        // Mặc định hoặc Luyện tập: Tính trọn vẹn durationMinutes từ lúc học sinh bắt đầu
        return addMinutes(studentStartTime, quiz.durationMinutes);
    }, [quiz, studentStartTime]);

    const calculateTimeLeft = () => {
        const diff = differenceInSeconds(deadline, new Date());
        return diff > 0 ? diff : 0;
    };

    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());
    const [spent, setSpent] = useState(0); 
    const [currentAnswers, setCurrentAnswers] = useState<Record<string, any>>(getInitialAnswers);
    const [violations, setViolations] = useState(0);
    const [showWarning, setShowWarning] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState<'idle' | 'queuing' | 'saving' | 'verifying' | 'done' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [finalResult, setFinalResult] = useState<Result | null>(null);
    
    const currentAnswersRef = useRef(currentAnswers);
    const spentRef = useRef(spent);
    const violationsRef = useRef(violations);

    useEffect(() => {
        currentAnswersRef.current = currentAnswers;
        spentRef.current = spent;
        violationsRef.current = violations;
        if (submitStatus !== 'done') {
            localStorage.setItem(backupKey, JSON.stringify(currentAnswers));
        }
    }, [currentAnswers, spent, violations, submitStatus]);

    const updateMonitorStatus = async (violationCount: number, isFinished = false) => {
        try {
            const session: ExamSession = {
                id: sessionIdRef.current,
                quizId: quiz.id,
                quizTitle: quiz.title,
                studentId: student.id,
                studentName: student.fullName,
                studentCode: student.studentCode || 'N/A',
                startTime: initialStartTimeRef.current,
                lastUpdate: new Date().toISOString(),
                violationCount: violationCount,
                isFinished: isFinished
            } as ExamSession;
            await saveExamSession(session);
        } catch (e) {}
    };

    useEffect(() => {
        updateMonitorStatus(0);
        const heartbeat = setInterval(() => {
            if (!isSubmitting && submitStatus !== 'done') updateMonitorStatus(violationsRef.current);
        }, 30000);
        return () => clearInterval(heartbeat);
    }, []);

    useEffect(() => {
        if (submitStatus === 'done') return;
        const timer = setInterval(() => {
            const remaining = calculateTimeLeft();
            setTimeLeft(remaining);
            setSpent(s => s + 1);
            if (remaining <= 0 && !isSubmitting) {
                clearInterval(timer);
                handleTimeUp();
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [deadline, submitStatus]);

    useEffect(() => {
        if (!quiz.isMonitored || isSubmitting || submitStatus === 'done') return;
        const handleVisibilityChange = () => {
            if (isInternalActionRef.current) return;
            if (document.hidden) {
                setViolations(v => {
                    const newVal = v + 1;
                    updateMonitorStatus(newVal);
                    if (newVal >= 3) handleAutoSubmit("VI PHẠM QUY CHẾ (CHUYỂN TAB)");
                    else setShowWarning(true);
                    return newVal;
                });
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [quiz.isMonitored, isSubmitting, submitStatus]);

    const handleTimeUp = async () => {
        isInternalActionRef.current = true;
        setSubmitStatus('queuing');
        setTimeout(() => finalizeSubmit(true), Math.random() * 2000);
    };

    const handleAutoSubmit = async (reason: string) => {
        isInternalActionRef.current = true;
        alert(`BẠN ĐÃ ${reason} QUÁ 3 LẦN. HỆ THỐNG SẼ TỰ ĐỘNG NỘP BÀI!`);
        await finalizeSubmit(true);
    };

    const finalizeSubmit = async (isAuto = false) => {
        if (isSubmitting || submitStatus === 'done') return;
        setIsSubmitting(true);
        setSubmitStatus('saving');
        setErrorMessage('');
        
        const finalAnswers = { ...currentAnswersRef.current };
        const finalSpent = spentRef.current;
        const finalViolations = violationsRef.current;
        
        let score = 0;
        quiz.questions.forEach(q => {
            const ans = finalAnswers[q.id];
            const qPoints = parseFloat(String(q.points || 0));
            if (q.type === 'mcq' && ans === q.correctAnswer) score += qPoints;
            else if (q.type === 'short') {
                const normalize = (val: any) => String(val || '').trim().toLowerCase().replace(/\s/g, '').replace(/,/g, '.');
                const nAns = normalize(ans);
                const nCorrect = normalize(q.correctAnswer);
                
                if (nAns === nCorrect) {
                    score += qPoints;
                } else {
                    // Thử so sánh số học (ví dụ: 3.4 và 3.40)
                    const numAns = parseFloat(nAns);
                    const numCorrect = parseFloat(nCorrect);
                    if (nAns !== '' && nCorrect !== '' && !isNaN(numAns) && !isNaN(numCorrect) && Math.abs(numAns - numCorrect) < 0.0001) {
                        score += qPoints;
                    }
                }
            }
            else if (q.type === 'group-tf' && q.subQuestions) {
                let subCorrect = 0;
                q.subQuestions.forEach((sq, i) => { if (ans?.[i] === sq.correctAnswer) subCorrect++; });
                if (subCorrect === 4) score += qPoints;
                else if (subCorrect === 3) score += qPoints * 0.5;
                else if (subCorrect === 2) score += qPoints * 0.25;
                else if (subCorrect === 1) score += qPoints * 0.1;
            }
        });

        // CHỐT ĐIỂM THƯỞNG NGAY TẠI ĐÂY
        // Nếu đạt từ 8 điểm trở lên -> Lưu vết 1 điểm thưởng vĩnh viễn (áp dụng cho cả luyện tập và kiểm tra)
        const bonusPoint = (score >= 8) ? 1 : 0;

        const result: Result = {
            id: uuidv4(),
            quizId: quiz.id,
            studentId: student.id,
            studentName: student.fullName,
            studentCode: student.studentCode || 'N/A',
            score: Number(score.toFixed(2)),
            totalQuestions: quiz.questions.length,
            submittedAt: new Date().toISOString(),
            durationSeconds: finalSpent,
            bonusPoint: bonusPoint, // LƯU VẾT VÀO DATABASE
            pointsAwarded: Number(score.toFixed(2)),
            userAnswers: finalAnswers,
            violationCount: finalViolations
        };

        try {
            await saveResult(result);
            setSubmitStatus('verifying');
            await new Promise(r => setTimeout(r, 1500)); 
            const exists = await verifyResultExists(result.id);
            
            if (!exists) {
                throw new Error("Database báo lưu thành công nhưng không tìm thấy dữ liệu. Vui lòng nộp lại.");
            }

            await addPointsToUser(student.id, score);
            await deleteExamSession(sessionIdRef.current); 
            localStorage.removeItem(backupKey);
            localStorage.removeItem(sessionStartKey);
            
            setFinalResult(result);
            setSubmitStatus('done');
        } catch (error: any) {
            console.error("Lỗi nộp bài:", error);
            setErrorMessage(error.message || "Lỗi không xác định");
            setSubmitStatus('error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmit = async () => {
        isInternalActionRef.current = true;
        if (!confirm('Bạn có chắc chắn muốn nộp bài?')) {
            isInternalActionRef.current = false;
            return;
        }
        await finalizeSubmit(false);
    };

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    if (submitStatus === 'done' && finalResult) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 animate-fade-in">
                <div className="max-w-md w-full bg-white rounded-[3.5rem] p-12 text-center shadow-2xl space-y-8 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-2 bg-emerald-500"></div>
                    <div className="w-24 h-24 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner"><Trophy size={48} className="animate-bounce"/></div>
                    <div className="space-y-2">
                        <h2 className="text-2xl font-black uppercase text-slate-800 tracking-tight">Nộp bài thành công!</h2>
                        <p className="text-slate-400 font-bold text-xs uppercase tracking-widest italic">Dữ liệu đã được lưu trên Cloud</p>
                    </div>
                    <div className="bg-slate-50 rounded-[2rem] p-8 space-y-4 border border-slate-100">
                        <div className="flex justify-between items-center px-4">
                            <span className="text-[10px] font-black text-slate-400 uppercase">Điểm số</span>
                            <span className="text-4xl font-black text-emerald-600 italic">{finalResult.score.toFixed(2)}</span>
                        </div>
                    </div>
                    <button onClick={onExit} className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs flex items-center justify-center gap-3 hover:bg-black transition-all shadow-xl">
                        <Home size={18}/> Về trang chủ
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f8fafc] flex flex-col">
            {(submitStatus !== 'idle' && submitStatus !== 'done') && (
                <div className="fixed inset-0 z-[3000] bg-slate-900/90 backdrop-blur-xl flex items-center justify-center p-6 animate-fade-in">
                    <div className="bg-white rounded-[3rem] p-12 max-sm w-full text-center space-y-8 shadow-2xl">
                        {submitStatus === 'queuing' && (
                            <div className="space-y-4">
                                <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto animate-pulse"><Clock size={40}/></div>
                                <h3 className="text-xl font-black uppercase text-slate-800">Đang xếp hàng...</h3>
                            </div>
                        )}
                        {submitStatus === 'saving' && (
                            <div className="space-y-4">
                                <div className="w-20 h-20 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto animate-spin-slow"><Loader2 size={40}/></div>
                                <h3 className="text-xl font-black uppercase text-slate-800">Đang ghi Database...</h3>
                            </div>
                        )}
                        {submitStatus === 'verifying' && (
                            <div className="space-y-4">
                                <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto animate-bounce"><SearchCheck size={40}/></div>
                                <h3 className="text-xl font-black uppercase text-emerald-600 italic">Đang xác minh...</h3>
                            </div>
                        )}
                        {submitStatus === 'error' && (
                            <div className="space-y-6">
                                <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto"><XCircle size={40}/></div>
                                <div className="space-y-2">
                                    <h3 className="text-xl font-black uppercase text-red-600">Nộp bài thất bại</h3>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase leading-tight bg-red-50 p-3 rounded-xl">{errorMessage}</p>
                                </div>
                                <button onClick={() => finalizeSubmit(false)} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase text-xs hover:bg-black transition-all">THỬ NỘP LẠI NGAY</button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showWarning && (
                <div className="fixed inset-0 z-[2000] bg-red-600/90 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
                    <div className="bg-white rounded-[3rem] p-12 max-w-lg text-center shadow-2xl space-y-6">
                        <div className="w-24 h-24 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto animate-bounce"><ShieldAlert size={48}/></div>
                        <h2 className="text-2xl font-black uppercase text-red-600">CẢNH BÁO VI PHẠM!</h2>
                        <p className="font-bold text-slate-600">Bạn vừa thoát tab thi. Số lần vi phạm: {violations}/3</p>
                        <button onClick={() => { setShowWarning(false); isInternalActionRef.current = false; }} className="w-full bg-red-600 text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-black transition-all">QUAY LẠI LÀM BÀI</button>
                    </div>
                </div>
            )}

            <header className="max-w-7xl w-full mx-auto flex justify-between items-center bg-white/90 backdrop-blur-xl p-4 rounded-[2rem] border shadow-sm sticky top-4 z-50 mb-8 mt-4 px-8">
                <div className="flex-1 overflow-hidden">
                    <h1 className="font-black text-slate-800 uppercase tracking-tight text-base truncate">{quiz.title}</h1>
                    <div className="flex items-center gap-2 mt-0.5">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-md text-[8px] font-black uppercase">KHỐI {quiz.grade}</span>
                        {quiz.isMonitored && <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded-md text-[8px] font-black uppercase flex items-center gap-1 animate-pulse"><ShieldAlert size={8}/> GIÁM SÁT</span>}
                    </div>
                </div>

                <div className="flex-1 flex justify-center">
                    <button 
                        onClick={handleSubmit} 
                        disabled={isSubmitting} 
                        className="flex items-center gap-2 px-10 py-3.5 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] shadow-xl hover:bg-black transition-all active:scale-95 disabled:opacity-50"
                    >
                        <Send size={16}/> {isSubmitting ? 'ĐANG NỘP...' : 'Nộp bài thi ngay'}
                    </button>
                </div>

                <div className="flex-1 flex justify-end">
                    <div className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border shadow-sm transition-all ${timeLeft < 300 ? 'bg-red-50 border-red-100' : 'bg-blue-50 border-blue-100'}`}>
                        <Clock size={18} className={timeLeft < 300 ? 'text-red-600' : 'text-blue-600'}/>
                        <span className={`tabular-nums font-black text-xl ${timeLeft < 300 ? 'text-red-700' : 'text-blue-700'}`}>{formatTime(timeLeft)}</span>
                    </div>
                </div>
            </header>

            <div className="max-w-7xl w-full mx-auto space-y-12 pb-20 px-4">
                {orderedQuestions.map((q, idx) => (
                    <div key={q.id} className="bg-white p-8 rounded-[2.5rem] border shadow-sm transition-all hover:border-blue-100">
                        <div className="flex items-start gap-4 mb-6">
                            <span className="text-blue-600 font-black italic underline uppercase shrink-0">Câu {idx + 1}.</span>
                            <div className="text-slate-800 text-lg font-bold leading-relaxed"><LatexText text={q.text}/></div>
                        </div>
                        {q.imageUrl && <div className="mb-6 flex justify-center"><img src={q.imageUrl} className="max-h-80 rounded-2xl border border-slate-100 shadow-sm" alt="q" /></div>}
                        {q.type === 'mcq' && q.options && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-0 md:pl-10">
                                {q.options.map((opt, oi) => (
                                    <button key={oi} onClick={() => setCurrentAnswers({ ...currentAnswers, [q.id]: opt })} className={`p-5 rounded-2xl border-2 text-left text-sm font-bold transition-all flex items-center gap-3 ${currentAnswers[q.id] === opt ? 'bg-blue-600 text-white border-blue-600 shadow-xl scale-[1.02]' : 'bg-slate-50 hover:bg-slate-100 border-slate-100'}`}>
                                        <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${currentAnswers[q.id] === opt ? 'bg-white/20 border-white/40' : 'bg-white border-slate-200'}`}>{String.fromCharCode(65+oi)}</span>
                                        <LatexText text={opt}/>
                                    </button>
                                ))}
                            </div>
                        )}
                        {q.type === 'group-tf' && q.subQuestions && (
                            <div className="space-y-4 pl-0 md:pl-10">
                                {q.subQuestions.map((sq, si) => (
                                    <div key={si} className="flex flex-col md:flex-row md:items-center gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-100">
                                        <span className="text-xs font-black text-blue-600 w-6">{String.fromCharCode(97+si)})</span>
                                        <div className="flex-1 text-sm font-bold"><LatexText text={sq.text}/></div>
                                        <div className="flex bg-white rounded-xl p-1 border border-slate-200">
                                            {['True', 'False'].map(v => (
                                                <button key={v} onClick={() => { const qAns = currentAnswers[q.id] || {}; setCurrentAnswers({ ...currentAnswers, [q.id]: { ...qAns, [si]: v } }); }} className={`px-6 py-2 text-[10px] font-black rounded-lg transition-all ${currentAnswers[q.id]?.[si] === v ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}>{v === 'True' ? 'ĐÚNG' : 'SAI'}</button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {q.type === 'short' && (
                            <div className="pl-0 md:pl-10">
                                <input type="text" className="w-full max-w-md p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-black text-blue-600 focus:border-blue-500 focus:bg-white transition-all" placeholder="Nhập đáp số..." value={currentAnswers[q.id] || ''} onChange={e => setCurrentAnswers({ ...currentAnswers, [q.id]: e.target.value })} />
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
