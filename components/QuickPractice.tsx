
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Quiz, Question, User, ExamSession } from '../types';
import { ChevronRight, ChevronLeft, CheckCircle2, XCircle, HelpCircle, Lightbulb, Home, Brain, Zap, ArrowRight, BookOpen } from 'lucide-react';
import LatexText from './LatexText';
import { saveExamSession, deleteExamSession } from '../services/storage';
import { v4 as uuidv4 } from 'uuid';

interface QuickPracticeProps {
  quiz: Quiz;
  student: User;
  onExit: () => void;
}

export default function QuickPractice({ quiz, student, onExit }: QuickPracticeProps) {
  const sessionIdRef = useRef(`sess_prac_${student.id}_${quiz.id}_${uuidv4().slice(0, 8)}`);
  const initialStartTimeRef = useRef(new Date().toISOString());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<any>(null); // Lưu đáp án chọn (string cho mcq/short, object cho tf)
  const [isAnswered, setIsAnswered] = useState(false);
  const [showContent, setShowContent] = useState(true);
  const [memoryTimer, setMemoryTimer] = useState(10); 

  const updateMonitorStatus = async (isFinished = false) => {
    try {
        const session: ExamSession = {
            id: sessionIdRef.current,
            quizId: quiz.id,
            quizTitle: `[LUYỆN TẬP] ${quiz.title}`,
            studentId: student.id,
            studentName: student.fullName,
            studentCode: student.studentCode || 'N/A',
            startTime: initialStartTimeRef.current,
            lastUpdate: new Date().toISOString(),
            violationCount: 0,
            isFinished: isFinished
        } as ExamSession;
        await saveExamSession(session);
    } catch (e) {}
  };

  useEffect(() => {
    updateMonitorStatus();
    const heartbeat = setInterval(() => updateMonitorStatus(), 30000);
    return () => {
        clearInterval(heartbeat);
        deleteExamSession(sessionIdRef.current);
    };
  }, []);

  const currentQuestion = quiz.questions[currentIndex];

  // Tính toán đúng/sai
  const checkIsCorrect = () => {
    if (currentQuestion.type === 'mcq') {
      return selectedOption === currentQuestion.correctAnswer;
    } else if (currentQuestion.type === 'short') {
      const normalize = (val: any) => String(val || '').trim().toLowerCase().replace(/\s/g, '').replace(/,/g, '.');
      const nAns = normalize(selectedOption);
      const nCorrect = normalize(currentQuestion.correctAnswer);
      
      if (nAns === nCorrect) return true;
      
      // Thử so sánh số học (ví dụ: 3.4 và 3.40)
      const numAns = parseFloat(nAns);
      const numCorrect = parseFloat(nCorrect);
      if (nAns !== '' && nCorrect !== '' && !isNaN(numAns) && !isNaN(numCorrect) && Math.abs(numAns - numCorrect) < 0.0001) {
          return true;
      }
      return false;
    } else if (currentQuestion.type === 'group-tf') {
      if (!selectedOption || !currentQuestion.subQuestions) return false;
      const subResults = currentQuestion.subQuestions.map((sq, i) => selectedOption[i] === sq.correctAnswer);
      const subCorrectCount = subResults.filter(r => r === true).length;
      return subCorrectCount === currentQuestion.subQuestions.length;
    }
    return false;
  };

  const isCorrect = checkIsCorrect();

  const isPartial = useMemo(() => {
    if (currentQuestion.type === 'group-tf' && selectedOption && currentQuestion.subQuestions) {
      const subResults = currentQuestion.subQuestions.map((sq, i) => selectedOption[i] === sq.correctAnswer);
      const subCorrectCount = subResults.filter(r => r === true).length;
      return subCorrectCount > 0 && subCorrectCount < currentQuestion.subQuestions.length;
    }
    return false;
  }, [currentQuestion, selectedOption]);

  useEffect(() => {
    if (!isAnswered && showContent) {
      const timer = setInterval(() => {
        setMemoryTimer((prev) => {
          if (prev <= 1) {
            setShowContent(false);
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [currentIndex, isAnswered, showContent]);

  const handleConfirm = () => {
    if (selectedOption !== null) {
      setIsAnswered(true);
      setShowContent(true);
    }
  };

  const handleNext = () => {
    if (currentIndex < quiz.questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setSelectedOption(null);
      setIsAnswered(false);
      setShowContent(true);
      setMemoryTimer(10);
    } else {
      onExit();
    }
  };

  // Kiểm tra nút xác nhận có được bấm hay không
  const canConfirm = useMemo(() => {
    if (!selectedOption) return false;
    if (currentQuestion.type === 'group-tf') {
      return Object.keys(selectedOption).length === (currentQuestion.subQuestions?.length || 0);
    }
    return true;
  }, [selectedOption, currentQuestion]);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col p-4 md:p-6 animate-fade-in">
      <div className="max-w-7xl mx-auto w-full mb-4">
        <div className="bg-white rounded-full h-8 p-1 flex items-center shadow-sm relative overflow-hidden border">
           <div 
             className="h-full bg-blue-500 rounded-full transition-all duration-1000 flex items-center justify-end px-3"
             style={{ width: `${((currentIndex + 1) / quiz.questions.length) * 100}%` }}
           >
             <span className="text-[10px] text-white font-black">{currentIndex + 1}/{quiz.questions.length}</span>
           </div>
           {!isAnswered && showContent && (
             <div className="absolute top-0 right-4 h-full flex items-center gap-2">
                <Brain size={14} className="text-blue-500 animate-pulse"/>
                <span className="text-[10px] font-black text-blue-600 uppercase italic">Ghi nhớ: {memoryTimer}s</span>
             </div>
           )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col lg:flex-row gap-4 overflow-hidden">
        {/* Vế Trái: Nội dung */}
        <div className="flex-[1.2] bg-white rounded-[2rem] shadow-xl border-4 border-white flex flex-col overflow-hidden relative">
          <div className="p-5 border-b bg-slate-50 flex justify-between items-center">
             <div className="flex items-center gap-3">
                <div className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[9px] font-black uppercase">
                  {currentQuestion.type === 'mcq' ? 'PHẦN I' : currentQuestion.type === 'group-tf' ? 'PHẦN II' : 'PHẦN III'}
                </div>
             </div>
             <h2 className="text-lg font-black italic uppercase text-slate-800 tracking-tight">{quiz.category || 'LUYỆN TẬP'}</h2>
             <button onClick={() => setShowContent(!showContent)} className="p-2 bg-white rounded-lg border shadow-sm text-blue-500">
                <Zap size={16}/>
             </button>
          </div>

          <div className="flex-1 p-6 flex flex-col items-center justify-start text-center pt-10 overflow-y-auto custom-scrollbar">
            {showContent ? (
              <div className="space-y-6 animate-fade-in w-full">
                <div className="text-lg font-medium text-slate-700 leading-snug px-2">
                  <LatexText text={currentQuestion.text} />
                </div>
                {currentQuestion.imageUrl && (
                  <img src={currentQuestion.imageUrl} className="max-h-48 mx-auto rounded-xl shadow-sm border" alt="q" />
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-6 animate-pulse pt-20">
                 <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center text-red-500">
                    <Brain size={40} />
                 </div>
                 <div className="space-y-1">
                    <h4 className="text-lg font-black uppercase text-slate-400">Nội dung đã bị ẩn!</h4>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-300 italic">Dùng trí nhớ để chọn đáp án.</p>
                 </div>
              </div>
            )}
          </div>
        </div>

        {/* Vế Phải: Phản ứng */}
        <div className="flex-1 bg-white rounded-[2rem] shadow-xl border-4 border-white flex flex-col p-6 relative overflow-hidden">
          {!isAnswered ? (
            <>
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">Khu vực phản ứng:</h3>
                <button className="flex items-center gap-2 px-3 py-1.5 bg-yellow-50 text-yellow-700 rounded-xl text-[9px] font-black uppercase">
                  Trợ giúp <Lightbulb size={12}/>
                </button>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto custom-scrollbar pr-1">
                <p className="text-[9px] font-black text-slate-300 uppercase italic mb-1">Thực hiện trả lời:</p>
                
                {/* Dạng Trắc nghiệm (MCQ) */}
                {currentQuestion.type === 'mcq' && currentQuestion.options?.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedOption(opt)}
                    className={`w-full p-2.5 rounded-xl border-2 text-left flex items-center gap-3 transition-all ${
                      selectedOption === opt 
                      ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                      : 'bg-white border-slate-100 hover:border-blue-100 text-slate-600'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-sm shrink-0 ${
                      selectedOption === opt ? 'bg-white/20' : 'bg-slate-50 text-slate-400 border'
                    }`}>
                      {String.fromCharCode(65+i)}
                    </div>
                    <div className="font-bold text-xs"><LatexText text={opt}/></div>
                  </button>
                ))}

                {/* Dạng Đúng/Sai (Group-TF) */}
                {currentQuestion.type === 'group-tf' && currentQuestion.subQuestions?.map((sq, i) => (
                  <div key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                    <div className="flex gap-2">
                      <span className="text-[10px] font-black text-blue-500 uppercase">{String.fromCharCode(97+i)})</span>
                      <p className="text-xs font-bold text-slate-600"><LatexText text={sq.text}/></p>
                    </div>
                    <div className="flex gap-2">
                      {['True', 'False'].map(v => (
                        <button 
                          key={v}
                          onClick={() => setSelectedOption({...selectedOption, [i]: v})}
                          className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase border-2 transition-all ${
                            selectedOption?.[i] === v 
                            ? (v === 'True' ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-red-600 border-red-600 text-white')
                            : 'bg-white text-slate-400 border-slate-100'
                          }`}
                        >
                          {v === 'True' ? 'Đúng' : 'Sai'}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Dạng Trả lời ngắn (Short) */}
                {currentQuestion.type === 'short' && (
                  <div className="space-y-2">
                    <input 
                      type="text" 
                      className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl outline-none font-black text-blue-600 text-center text-lg focus:border-blue-400 transition-all"
                      placeholder="Nhập đáp số..."
                      value={selectedOption || ''}
                      onChange={e => setSelectedOption(e.target.value)}
                    />
                    <p className="text-[9px] text-center font-bold text-slate-400 uppercase italic">Điền số hoặc từ khóa ngắn gọn</p>
                  </div>
                )}
              </div>

              <button
                disabled={!canConfirm}
                onClick={handleConfirm}
                className={`mt-4 w-full py-4 rounded-2xl font-black uppercase text-xs italic flex items-center justify-center gap-3 transition-all ${
                  canConfirm 
                  ? 'bg-slate-900 text-white shadow-xl active:scale-95' 
                  : 'bg-slate-50 text-slate-200 cursor-not-allowed'
                }`}
              >
                Xác nhận đáp án <CheckCircle2 size={20} className={canConfirm ? 'text-emerald-400' : ''}/>
              </button>
            </>
          ) : (
            <div className="flex-1 flex flex-col animate-fade-in-up overflow-y-auto custom-scrollbar">
               <div className="flex items-center gap-3 mb-4">
                  {isCorrect ? (
                    <CheckCircle2 size={32} className="text-emerald-500" />
                  ) : isPartial ? (
                    <HelpCircle size={32} className="text-amber-500" />
                  ) : (
                    <XCircle size={32} className="text-red-500" />
                  )}
                  <h3 className={`text-2xl font-black italic uppercase ${isCorrect ? 'text-emerald-600' : isPartial ? 'text-amber-600' : 'text-red-600'}`}>
                    {isCorrect ? 'CHÍNH XÁC!' : isPartial ? 'ĐÚNG MỘT PHẦN!' : 'RẤT TIẾC!'}
                  </h3>
               </div>

               <div className={`p-4 rounded-xl border-2 mb-4 text-center ${isCorrect ? 'bg-slate-50 border-slate-100' : isPartial ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-100'}`}>
                  <p className="font-black text-slate-700 text-xs">
                    {isCorrect ? 'Tuyệt vời! Bạn đã làm rất tốt.' : isPartial ? 'Khá tốt! Bạn đã trả lời đúng một số ý.' : 'Đừng nản chí, hãy xem lại lời giải nhé!'}
                  </p>
                  <p className="text-[10px] font-bold text-blue-600 uppercase mt-1">Đáp án đúng: {currentQuestion.correctAnswer || '(Xem phía dưới)'}</p>
               </div>

               <div className="flex-1 bg-emerald-50/50 p-5 rounded-xl border-2 border-emerald-100 relative overflow-hidden">
                  <div className="absolute top-4 right-4 text-emerald-100 opacity-50"><BookOpen size={32}/></div>
                  <h4 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-3 italic">Phân tích chuyên sâu:</h4>
                  <div className="text-slate-600 text-xs italic font-medium leading-relaxed max-h-[180px] overflow-y-auto custom-scrollbar">
                    <LatexText text={currentQuestion.solution || 'Hệ thống đang cập nhật lời giải cho câu hỏi này...'} />
                  </div>
               </div>

               <div className="mt-5 flex gap-2">
                  <button onClick={onExit} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-black uppercase text-[9px] flex items-center justify-center gap-2 hover:bg-slate-200 transition-all">
                     <Home size={14}/> Thoát
                  </button>
                  <button onClick={handleNext} className="flex-[2] py-3 bg-blue-600 text-white rounded-xl font-black uppercase text-[9px] flex items-center justify-center gap-2 shadow-lg hover:bg-blue-700 transition-all group">
                     Tiếp tục <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform"/>
                  </button>
               </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto w-full mt-4 text-center">
         <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest italic">Luyện tập thông minh cùng EduQuiz System</p>
      </div>
    </div>
  );
}
