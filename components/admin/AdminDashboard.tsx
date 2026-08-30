
import { 
  getQuizzesMetadata, getQuizById, deleteQuiz, saveQuiz, updateQuiz, uploadQuizImage,
  getUsers, saveUser, deleteUser, changePassword, getUsersPage, saveUsersBatch,
  getResultsMetadata, getResultById, deleteResult, getResultsMetadataPage,
  getChapters, saveChapter, deleteChapter, deleteChaptersBatch,
  getBankQuestions, saveBankQuestion, deleteBankQuestion, deleteBatchBankQuestions,
  getClasses, saveClass, deleteClass, saveClassesBatch, assignStudentsToClass,
  getTeachers, saveTeacher, deleteTeacher,
  clearLocalCache,
  isDatabaseConnected,
  syncAllQuizzesMetadata,
  syncQuizzesToBank,
  deduplicateBankQuestions,
  assignQuizToClasses
} from '../../services/storage';
import { generateQuizFromPrompt, parseQuestionsFromPDF, parseQuestionsFromText } from '../../services/gemini';
import { normalizeFullText } from '../../services/vietnameseFixer';
import { isSameSubject, STANDARD_SUBJECTS } from '../../services/subjectUtils';
import { getCurrentAcademicYear, getQuizAcademicYear } from '../../services/academicUtils';
import { Quiz, User, Result, Chapter, Question, QuestionType, Grade, QuizType, Role, ClassRoom } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Papa from 'papaparse';
import { 
  LayoutDashboard, Users, BarChart3, ShieldAlert, Sparkles, FolderTree, 
  Plus, Database, Loader2, X, RefreshCw, AlertTriangle, FileUp, DatabaseZap, GraduationCap,
  ShieldCheck, UserCheck, Key, Eye, EyeOff, Check, BookOpen, Server, HardDrive
} from 'lucide-react';

import QuizList from './QuizList';
import QuizEditor from './QuizEditor';
import StudentManager from './StudentManager';
import ResultsBoard from './ResultsBoard';
import ExamMonitor from './ExamMonitor';
import ChapterManager from './ChapterManager';
import QuestionBank from './QuestionBank';
import AIRenderer from './AIRenderer';
import ClassManager from './ClassManager';
import TeacherManager from './TeacherManager';
import DatabaseMonitor from './DatabaseMonitor';

import StudentModal from './StudentModal';
import StudentDetailModal from './StudentDetailModal';
import ResultHistoryModal from './ResultHistoryModal';
import ResultDetailModal from './ResultDetailModal';
import QuizPreviewModal from './QuizPreviewModal';

type AdminTab = 'quizzes' | 'teachers' | 'classes' | 'students' | 'results' | 'monitor' | 'chapters' | 'bank' | 'ai' | 'database';

interface AdminDashboardProps {
  currentUser?: User;
}

export default function AdminDashboard({ currentUser }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('quizzes');
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSavingInProgress, setIsSavingInProgress] = useState(false);

  // Data states
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [students, setStudents] = useState<User[]>([]);
  const [studentsTotal, setStudentsTotal] = useState(0);
  const [studentsPage, setStudentsPage] = useState(1);
  const [results, setResults] = useState<Result[]>([]);
  const [resultsTotal, setResultsTotal] = useState(0);
  const [resultsPage, setResultsPage] = useState(1);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [bankQuestions, setBankQuestions] = useState<Question[]>([]);

  // Lazy loading data with memory caching to protect Firebase Quota
  const loadTabData = useCallback(async (tab: AdminTab) => {
    if (!isDatabaseConnected()) return;
    setIsDataLoading(true);
    try {
      if (tab === 'quizzes') {
        const [q, c, cls, t] = await Promise.all([
          getQuizzesMetadata(), 
          getChapters(),
          getClasses(),
          getTeachers()
        ]);
        setQuizzes(q);
        setChapters(c);
        setClasses(cls);
        setTeachers(t);
      } else if (tab === 'teachers') {
        const [t, q, cls] = await Promise.all([
          getTeachers(),
          getQuizzesMetadata(),
          getClasses()
        ]);
        setTeachers(t);
        setQuizzes(q);
        setClasses(cls);
      } else if (tab === 'classes') {
        const [cls, q, c, t] = await Promise.all([
          getClasses(),
          getQuizzesMetadata(),
          getChapters(),
          getTeachers()
        ]);
        setClasses(cls);
        setQuizzes(q);
        setChapters(c);
        setTeachers(t);
      } else if (tab === 'students') {
        const [pagedUsers, cls, t] = await Promise.all([
          getUsersPage(1, 100),
          getClasses(),
          getTeachers()
        ]);
        
        const studentList = pagedUsers.data.filter(user => user.role === 'student');
        setStudents(studentList);
        setStudentsTotal(pagedUsers.total || studentList.length);
        setStudentsPage(1);
        setClasses(cls);
        setTeachers(t);
      } else if (tab === 'results') {
        const [paged, q, cls, t, c] = await Promise.all([
          getResultsMetadataPage(1, 50),
          getQuizzesMetadata(),
          getClasses(),
          getTeachers(),
          getChapters()
        ]);
        setResults(paged.data);
        setResultsTotal(paged.total);
        setResultsPage(1);
        setQuizzes(q);
        setClasses(cls);
        setTeachers(t);
        setChapters(c);
      } else if (tab === 'bank') {
        const [b, c] = await Promise.all([
          getBankQuestions(),
          getChapters()
        ]);
        setBankQuestions(b);
        setChapters(c);
      } else if (tab === 'chapters') {
        const c = await getChapters();
        setChapters(c);
      }
    } catch (e) {
      console.error("Lỗi tải dữ liệu tab:", tab, e);
    } finally {
      setIsDataLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTabData(activeTab);
  }, [activeTab]);

  // Quiz Editing
  const [isEditingQuiz, setIsEditingQuiz] = useState(false);
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);
  const [quizTitle, setQuizTitle] = useState('');
  const [quizGrade, setQuizGrade] = useState<Grade>('12');
  const [quizAcademicYear, setQuizAcademicYear] = useState<string>(getCurrentAcademicYear());
  const [quizType, setQuizType] = useState<QuizType>('test');
  const [quizMaxAttempts, setQuizMaxAttempts] = useState<number>(1);
  const [quizSubject, setQuizSubject] = useState<string>(() => currentUser?.subject || 'Toán');
  const [mySubject, setMySubject] = useState<string>(() => currentUser?.subject || 'Toán');
  const [isPublished, setIsPublished] = useState(false);
  const [isMonitored, setIsMonitored] = useState(false);
  const [showResultAnswers, setShowResultAnswers] = useState(true);
  const [isUnlisted, setIsUnlisted] = useState(false);
  const [isSharedWithTeachers, setIsSharedWithTeachers] = useState(false);
  const [targetType, setTargetType] = useState<'all' | 'classes'>('all');
  const [assignedClassIds, setAssignedClassIds] = useState<string[]>([]);
  const [duration, setDuration] = useState(45);
  const [orderIndex, setOrderIndex] = useState(1);
  const [category, setCategory] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  useEffect(() => {
    if (currentUser?.subject) {
      setMySubject(currentUser.subject);
    }
  }, [currentUser?.subject]);

  const handleUpdateMySubject = async (newSubject: string) => {
    setMySubject(newSubject);
    setQuizSubject(newSubject);
    if (currentUser) {
      const updated = { ...currentUser, subject: newSubject };
      try {
        await saveUser(updated);
        localStorage.setItem('eduquiz_current_user', JSON.stringify(updated));
        showAlert("Cập nhật môn dạy", `Đã thiết lập môn giảng dạy thành "${newSubject}"!`, "success");
      } catch (err: any) {
        console.error("Lỗi cập nhật môn:", err);
      }
    }
  };

  const [customApiKey, setCustomApiKey] = useState<string>(() => {
    try {
      return localStorage.getItem('eduquiz_gemini_api_key') || '';
    } catch {
      return '';
    }
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);

  const handleApiKeyChange = (newKey: string) => {
    setCustomApiKey(newKey);
    try {
      if (newKey.trim()) {
        localStorage.setItem('eduquiz_gemini_api_key', newKey.trim());
      } else {
        localStorage.removeItem('eduquiz_gemini_api_key');
      }
    } catch (e) {
      console.error("Lỗi lưu API Key vào LocalStorage:", e);
    }
  };

  // Filters
  const [qSearch, setQSearch] = useState('');
  const [qAcademicYearFilter, setQAcademicYearFilter] = useState<string>(getCurrentAcademicYear());
  const [qSubjectFilter, setQSubjectFilter] = useState<string>('all');
  const [qGradeFilter, setQGradeFilter] = useState<Grade | 'all'>('all');
  const [qChapterFilter, setQChapterFilter] = useState('all');
  const [sSearch, setSSearch] = useState('');
  const [rSearch, setRSearch] = useState('');
  const [sGradeFilter, setSGradeFilter] = useState<Grade | 'all'>('all');
  const [rGradeFilter, setRGradeFilter] = useState<Grade | 'all'>('all');
  const [rChapterFilter, setRChapterFilter] = useState('all');
  const [rQuizFilter, setRQuizFilter] = useState('all');

  // Server-side filtering for results
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (activeTab === 'results' && isDatabaseConnected()) {
        setIsDataLoading(true);
        try {
          const paged = await getResultsMetadataPage(1, 50, rQuizFilter, rSearch);
          setResults(paged.data);
          setResultsTotal(paged.total);
          setResultsPage(1);
        } catch (e) {
          console.error("Lỗi lọc kết quả:", e);
        } finally {
          setIsDataLoading(false);
        }
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [rQuizFilter, rSearch, activeTab]);

  // Client/Server search for students
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (activeTab === 'students' && isDatabaseConnected()) {
        setIsDataLoading(true);
        try {
          if (!sSearch) {
            const allUsers = await getUsers();
            const stus = allUsers.filter(u => u.role === 'student');
            setStudents(stus);
            setStudentsTotal(stus.length);
          } else {
            const paged = await getUsersPage(1, 200, sSearch);
            setStudents(paged.data.filter(u => u.role === 'student'));
            setStudentsTotal(paged.total);
          }
          setStudentsPage(1);
        } catch (e) {
          console.error("Lỗi lọc học sinh:", e);
        } finally {
          setIsDataLoading(false);
        }
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [sSearch, activeTab]);

  const [bGradeFilter, setBGradeFilter] = useState<Grade | 'all'>('all');
  const [bChapterFilter, setBChapterFilter] = useState('all');
  const [bTypeFilter, setBTypeFilter] = useState<QuestionType | 'all'>('all');
  const [bSearch, setBSearch] = useState('');
  const [bSubjectFilter, setBSubjectFilter] = useState<string>('all');

  const isSuperAdmin = currentUser?.role === 'superadmin';

  // Chuyển tab giáo viên về quizzes nếu người dùng không phải superadmin
  useEffect(() => {
    if (activeTab === 'teachers' && !isSuperAdmin) {
      setActiveTab('quizzes');
    }
  }, [activeTab, isSuperAdmin]);

  // Quản lý dữ liệu phân quyền theo giáo viên
  const accessibleQuizzes = useMemo(() => {
    if (isSuperAdmin) return quizzes;
    return quizzes.filter(q => {
      // Đề do mình tạo hoặc được chia sẻ với giáo viên
      if (q.createdBy === currentUser?.id) return true;
      if (q.isSharedWithTeachers) return true;
      // Nếu cùng môn học và không có creator cụ thể
      if (q.subject && currentUser?.subject && isSameSubject(q.subject, currentUser.subject)) return true;
      if (!q.createdBy) return true;
      return false;
    });
  }, [quizzes, isSuperAdmin, currentUser?.id, currentUser?.subject]);

  const accessibleQuizIds = useMemo(() => new Set(accessibleQuizzes.map(q => q.id)), [accessibleQuizzes]);

  // Quản lý phân quyền lớp học: Giáo viên chỉ thấy lớp do mình tạo hoặc lớp được chia sẻ (SuperAdmin thấy tất cả)
  const accessibleClasses = useMemo(() => {
    if (isSuperAdmin) return classes;
    return classes.filter(c => {
      if (c.createdBy && c.createdBy === currentUser?.id) return true;
      if (c.isSharedWithTeachers) return true;
      return false;
    });
  }, [classes, isSuperAdmin, currentUser?.id]);

  const accessibleClassIds = useMemo(() => new Set(accessibleClasses.map(c => c.id)), [accessibleClasses]);
  const accessibleClassNames = useMemo(() => new Set(accessibleClasses.map(c => c.name.trim().toLowerCase())), [accessibleClasses]);

  // Bản đồ tra cứu học sinh toàn hệ thống (để đối soát thông tin lớp học và người tạo)
  const studentMapById = useMemo(() => {
    const map = new Map<string, User>();
    students.forEach(s => {
      if (s.id) map.set(s.id, s);
    });
    return map;
  }, [students]);

  const studentMapByCode = useMemo(() => {
    const map = new Map<string, User>();
    students.forEach(s => {
      if (s.studentCode) map.set(s.studentCode.trim().toUpperCase(), s);
    });
    return map;
  }, [students]);

  const quizMapById = useMemo(() => {
    const map = new Map<string, Quiz>();
    quizzes.forEach(q => {
      if (q.id) map.set(q.id, q);
    });
    return map;
  }, [quizzes]);

  // Quản lý phân quyền kết quả thi:
  // - SuperAdmin: toàn quyền thấy mọi kết quả
  // - Giáo viên: chỉ thấy kết quả của học sinh thuộc các lớp do mình quản lý/tạo, học sinh do mình tạo, hoặc bài làm đề thi do mình tạo (nếu học sinh chưa phân lớp)
  const accessibleResults = useMemo(() => {
    if (isSuperAdmin) return results;
    return results.filter(r => {
      // 1. Phải thuộc danh sách đề thi giáo viên có quyền truy cập
      if (!accessibleQuizIds.has(r.quizId)) return false;

      // 2. Tìm thông tin học sinh qua ID hoặc Mã học sinh (MAHS)
      const student = (r.studentId ? studentMapById.get(r.studentId) : null) || 
                      (r.studentCode && r.studentCode !== 'N/A' ? studentMapByCode.get(r.studentCode.trim().toUpperCase()) : null);

      if (student) {
        // Học sinh thuộc lớp của giáo viên này hoặc lớp được chia sẻ
        if (student.classId && accessibleClassIds.has(student.classId)) return true;
        if (student.className && accessibleClassNames.has(student.className.trim().toLowerCase())) return true;
        // Học sinh do chính giáo viên này tạo/nhập danh sách
        if (student.createdById && student.createdById === currentUser?.id) return true;

        // Nếu học sinh đã có lớp hoặc do GV khác tạo -> Tuyệt đối không hiển thị cho GV này
        if (student.classId || student.className || (student.createdById && student.createdById !== currentUser?.id)) {
          return false;
        }

        // Học sinh chưa phân lớp: chỉ hiển thị nếu làm đề do GV này trực tiếp tạo
        const quiz = quizMapById.get(r.quizId);
        return quiz?.createdBy === currentUser?.id;
      }

      // Thí sinh tự do / chưa gán hồ sơ: chỉ hiển thị nếu làm đề do chính giáo viên này tạo
      const quiz = quizMapById.get(r.quizId);
      return quiz?.createdBy === currentUser?.id;
    });
  }, [results, isSuperAdmin, accessibleQuizIds, studentMapById, studentMapByCode, accessibleClassIds, accessibleClassNames, currentUser?.id, quizMapById]);

  // Quản lý phân quyền học sinh: Giáo viên thấy học sinh thuộc các lớp do mình quản lý, học sinh do mình tạo/nhập, và học sinh chưa phân lớp để có thể chọn gán vào lớp
  const accessibleStudents = useMemo(() => {
    if (isSuperAdmin) return students;
    return students.filter(s => {
      // 1. Học sinh thuộc lớp của giáo viên này (hoặc lớp được chia sẻ)
      if (s.classId && accessibleClassIds.has(s.classId)) return true;
      if (s.className && accessibleClassNames.has(s.className.trim().toLowerCase())) return true;
      // 2. Học sinh do chính giáo viên này tạo / nhập CSV
      if (s.createdById && s.createdById === currentUser?.id) return true;
      // 3. Học sinh chưa phân lớp và chưa có GV quản lý riêng
      if (!s.classId && !s.className && (!s.createdById || s.createdById === currentUser?.id)) return true;
      return false;
    });
  }, [students, isSuperAdmin, accessibleClassIds, accessibleClassNames, currentUser?.id]);

  // Quản lý chương trình học theo môn: Giáo viên cùng môn sẽ nhìn thấy và dùng chung, khác môn thì không thấy
  const accessibleChapters = useMemo(() => {
    if (isSuperAdmin) return chapters;
    const teacherSubject = currentUser?.subject?.trim();
    if (!teacherSubject) return chapters; // Nếu giáo viên chưa khai báo môn, hiển thị các chương
    return chapters.filter(c => {
      // 1. Cùng môn học -> Thấy và dùng chung
      if (c.subject && isSameSubject(c.subject, teacherSubject)) return true;
      // 2. Do chính giáo viên này tạo
      if (c.createdBy && c.createdBy === currentUser?.id) return true;
      // 3. Chương chưa gán môn
      if (!c.subject) return true;
      return false;
    });
  }, [chapters, isSuperAdmin, currentUser?.subject, currentUser?.id]);

  // Quản lý ngân hàng câu hỏi theo môn: Giáo viên cùng môn sẽ nhìn thấy và dùng chung, khác môn thì không thấy
  const accessibleBankQuestions = useMemo(() => {
    if (isSuperAdmin) return bankQuestions;
    const teacherSubject = currentUser?.subject?.trim();
    if (!teacherSubject) return bankQuestions;
    return bankQuestions.filter(q => {
      // 1. Cùng môn học -> Thấy và dùng chung
      if (q.subject && isSameSubject(q.subject, teacherSubject)) return true;
      // 2. Do chính giáo viên này tạo
      if (q.createdBy && q.createdBy === currentUser?.id) return true;
      // 3. Câu hỏi chưa gán môn
      if (!q.subject) return true;
      return false;
    });
  }, [bankQuestions, isSuperAdmin, currentUser?.subject, currentUser?.id]);

  // Alert and Confirmation Modal State
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'warning' | 'error' | 'info';
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
  } | null>(null);

  const showAlert = useCallback((title: string, message: string, type: 'success' | 'warning' | 'error' | 'info' = 'info', onConfirm?: () => void) => {
    setAlertModal({
      isOpen: true,
      title,
      message,
      type,
      confirmText: 'Đóng',
      onConfirm: () => {
        setAlertModal(null);
        if (onConfirm) onConfirm();
      }
    });
  }, []);

  const showConfirm = useCallback((
    title: string, 
    message: string, 
    onConfirm: () => void, 
    onCancel?: () => void,
    confirmText: string = 'Xác nhận',
    cancelText: string = 'Hủy'
  ) => {
    setAlertModal({
      isOpen: true,
      title,
      message,
      type: 'warning',
      confirmText,
      cancelText,
      onConfirm: () => {
        setAlertModal(null);
        onConfirm();
      },
      onCancel: () => {
        setAlertModal(null);
        if (onCancel) onCancel();
      }
    });
  }, []);

  // Modals
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<User | null>(null);
  const [studentForm, setStudentForm] = useState<{
    fullName: string;
    studentCode: string;
    grade: Grade;
    password: string;
    classId?: string;
    className?: string;
    academicYear?: string;
    subject?: string;
  }>({ fullName: '', studentCode: '', grade: '12' as Grade, password: '123' });
  const [isSavingStudent, setIsSavingStudent] = useState(false);
  const [viewingStudent, setViewingStudent] = useState<User | null>(null);
  const [historyData, setHistoryData] = useState<{ studentName: string, studentCode: string, quizTitle: string, history: Result[] } | null>(null);
  const [selectedResultDetail, setSelectedResultDetail] = useState<{ result: Result, quiz: Quiz } | null>(null);
  const [previewQuiz, setPreviewQuiz] = useState<Quiz | null>(null);
  const [isBankOpen, setIsBankOpen] = useState(false);
  const [isBankLoading, setIsBankLoading] = useState(false);

  const loadBankDataIfNeeded = useCallback(async () => {
    if (!isDatabaseConnected()) return;
    if (bankQuestions.length === 0) {
      setIsBankLoading(true);
      try {
        const [b, c] = await Promise.all([
          getBankQuestions(),
          getChapters()
        ]);
        setBankQuestions(b);
        if (c && c.length > 0) setChapters(c);
      } catch (e) {
        console.error("Lỗi tải ngân hàng câu hỏi:", e);
      } finally {
        setIsBankLoading(false);
      }
    }
  }, [bankQuestions.length]);

  const allAvailableQuestions = useMemo(() => {
    return bankQuestions;
  }, [bankQuestions]);

  // Quiz Handlers
  const handleCreateQuiz = () => {
    setEditingQuizId(null); setQuizTitle(''); setQuizGrade('12'); setQuizType('test');
    setQuizMaxAttempts(1);
    setQuizAcademicYear(getCurrentAcademicYear());
    setQuizSubject(mySubject || currentUser?.subject || 'Toán');
    setIsPublished(false); setIsMonitored(false); setShowResultAnswers(true); setIsUnlisted(false);
    setIsSharedWithTeachers(false);
    setTargetType(isSuperAdmin ? 'all' : 'classes'); setAssignedClassIds([]);
    setDuration(45); setOrderIndex(1); setCategory('');
    setStartTime(''); setEndTime(''); setQuestions([]); setIsEditingQuiz(true);
    setActiveTab('quizzes');
  };

  const handleEditQuiz = async (quiz: Quiz) => {
    // Kiểm tra quyền sửa đề: Chỉ tác giả tạo đề hoặc SuperAdmin mới được sửa
    const isMine = Boolean(currentUser?.id && quiz.createdBy === currentUser.id);
    if (!isSuperAdmin && !isMine) {
      showAlert(
        "Không có quyền chỉnh sửa", 
        "Bạn chỉ có quyền chỉnh sửa đề thi do chính mình tạo ra. Đối với đề thi của giáo viên khác chia sẻ, bạn có thể xem chi tiết hoặc dùng tính năng 'Giao Lớp' để giao cho học sinh.", 
        "warning"
      );
      return;
    }

    setIsDataLoading(true);
    try {
        let fullQuiz: Quiz | null = null;
        try {
            fullQuiz = await getQuizById(quiz.id);
        } catch (e) {
            console.warn("getQuizById exception, fallback to provided quiz object:", e);
        }

        const qData: Quiz = (fullQuiz && fullQuiz.questions && fullQuiz.questions.length > 0)
            ? fullQuiz
            : { ...quiz, ...(fullQuiz || {}) };

        setEditingQuizId(qData.id); 
        setQuizTitle(qData.title || ''); 
        setQuizGrade(qData.grade || '12');
        setQuizAcademicYear(qData.academicYear || getQuizAcademicYear(qData));
        setQuizSubject(qData.subject || mySubject || currentUser?.subject || 'Toán');
        setQuizType(qData.type || 'test'); 
        setQuizMaxAttempts(qData.maxAttempts !== undefined ? qData.maxAttempts : (qData.type === 'test' ? 1 : 0));
        setIsPublished(Boolean(qData.isPublished)); 
        setIsMonitored(Boolean(qData.isMonitored));
        setShowResultAnswers(qData.showResultAnswers !== false);
        setIsUnlisted(Boolean(qData.isUnlisted));
        setIsSharedWithTeachers(Boolean(qData.isSharedWithTeachers));
        setTargetType(isSuperAdmin ? (qData.targetType || 'all') : 'classes');
        setAssignedClassIds(qData.assignedClassIds || []);
        setDuration(qData.durationMinutes || 45); 
        setOrderIndex(qData.orderIndex || 1); 
        setCategory(qData.category || ''); 
        setStartTime(qData.startTime || '');
        setEndTime(qData.endTime || ''); 
        setQuestions(qData.questions || []); 
        setIsEditingQuiz(true);
        setActiveTab('quizzes');
    } catch (err) {
        console.error("Lỗi khi mở sửa đề:", err);
        setEditingQuizId(quiz.id);
        setQuizTitle(quiz.title || '');
        setQuizGrade(quiz.grade || '12');
        setQuizAcademicYear(quiz.academicYear || getQuizAcademicYear(quiz));
        setQuizSubject(quiz.subject || mySubject || currentUser?.subject || 'Toán');
        setQuizMaxAttempts(quiz.maxAttempts !== undefined ? quiz.maxAttempts : (quiz.type === 'test' ? 1 : 0));
        setShowResultAnswers(quiz.showResultAnswers !== false);
        setQuestions(quiz.questions || []);
        setIsEditingQuiz(true);
        setActiveTab('quizzes');
    } finally {
        setIsDataLoading(false);
    }
  };

  const handlePreviewQuiz = async (quiz: Quiz) => {
    setIsDataLoading(true);
    try {
        const fullQuiz = await getQuizById(quiz.id);
        if (fullQuiz) setPreviewQuiz(fullQuiz);
    } finally {
        setIsDataLoading(false);
    }
  };

  const handleAssignClasses = async (quiz: Quiz, selectedClassIds: string[]) => {
    setIsDataLoading(true);
    try {
        const myClassIds = isSuperAdmin ? undefined : accessibleClasses.map(c => c.id);
        await assignQuizToClasses(quiz.id, selectedClassIds, myClassIds);
        await loadTabData('quizzes');
        showAlert(
            "Giao đề thành công", 
            `Đã cập nhật phân công đề thi "${quiz.title}" cho ${selectedClassIds.length} lớp học. Học sinh trong các lớp này có thể truy cập làm bài.`,
            "success"
        );
    } catch (e: any) {
        console.error("Lỗi phân công giao đề:", e);
        showAlert("Lỗi giao đề", e.message || "Không thể lưu phân công đề thi cho lớp học.", "error");
    } finally {
        setIsDataLoading(false);
    }
  };

  const handleViewResultDetail = async (res: Result) => {
    setIsDataLoading(true);
    try {
        const [fullResult, fullQuiz] = await Promise.all([
            getResultById(res.id),
            getQuizById(res.quizId)
        ]);
        if (fullResult && fullQuiz) {
            setSelectedResultDetail({ result: fullResult, quiz: fullQuiz });
        } else {
            alert("Không tìm thấy dữ liệu chi tiết cho kết quả này.");
        }
    } catch (e) {
        console.error("Error loading result detail:", e);
        alert("Lỗi khi tải chi tiết bài làm.");
    } finally {
        setIsDataLoading(false);
    }
  };

  const handleSyncAllQuizzes = async () => {
    if (!confirm("Hệ thống sẽ quét lại toàn bộ đề thi để cập nhật chính xác số câu hỏi. Tiếp tục?")) return;
    setIsSyncing(true);
    try {
      const count = await syncAllQuizzesMetadata();
      alert(`Đã đồng bộ thành công ${count} đề thi!`);
      loadTabData('quizzes');
    } catch (e) {
      alert("Lỗi khi đồng bộ dữ liệu.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncBank = async () => {
    if (!isSuperAdmin) {
      showAlert("Không có quyền", "Chức năng đồng bộ Ngân hàng câu hỏi chỉ dành riêng cho Quản trị viên cấp cao (Super Admin).", "warning");
      return;
    }
    const targetSubject = bSubjectFilter;
    const isSubjectSpecific = targetSubject && targetSubject !== 'all';
    const subjectLabel = isSubjectSpecific ? `Môn ${targetSubject}` : 'Tất cả các môn';

    showConfirm(
      `Cập nhật từ Đề thi vào Ngân hàng (${subjectLabel})`,
      `Hệ thống sẽ quét các câu hỏi thuộc ${subjectLabel} trong tất cả đề thi và đồng bộ vào Ngân hàng. Thuật toán thông minh sẽ tự động cập nhật thông tin và ngăn chặn 100% việc tạo câu trùng lặp. Bạn có muốn thực hiện?`,
      async () => {
        setIsSyncing(true);
        try {
          const stats = await syncQuizzesToBank(targetSubject);
          showAlert(
            "Đồng bộ thành công",
            `Đã quét ${stats.totalScanned} lượt câu hỏi (${subjectLabel}):\n• Thêm mới vào Ngân hàng: ${stats.added} câu\n• Cập nhật thông tin: ${stats.updated} câu\n• Đã loại bỏ trùng lặp: ${stats.skippedDuplicates} lượt`,
            "success"
          );
          await loadTabData('bank');
        } catch (e: any) {
          showAlert("Lỗi đồng bộ", "Lỗi khi đồng bộ Ngân hàng: " + (e.message || "Lỗi không xác định"), "error");
        } finally {
          setIsSyncing(false);
        }
      }
    );
  };

  const handleDeduplicateBank = async () => {
    if (!isSuperAdmin) {
      showAlert("Không có quyền", "Chức năng quét và gộp trùng lặp chỉ dành riêng cho Quản trị viên cấp cao (Super Admin).", "warning");
      return;
    }
    const targetSubject = bSubjectFilter;
    const isSubjectSpecific = targetSubject && targetSubject !== 'all';
    const subjectLabel = isSubjectSpecific ? `Môn ${targetSubject}` : 'Tất cả các môn';

    showConfirm(
      `Quét & Gộp câu trùng lặp (${subjectLabel})`,
      `Hệ thống sẽ phân tích câu hỏi thuộc ${subjectLabel} trong Ngân hàng, nhận diện các câu có nội dung và đáp án giống hệt nhau để tự động gộp lại giữ 1 bản chuẩn nhất (đầy đủ hình ảnh/lời giải) và loại bỏ bản thừa. Bạn có muốn tiếp tục?`,
      async () => {
        setIsSyncing(true);
        try {
          const res = await deduplicateBankQuestions(targetSubject);
          if (res.duplicatesRemoved > 0) {
            showAlert(
              "Đã dọn dẹp thành công",
              `Quét tổng cộng ${res.totalScanned} câu hỏi (${subjectLabel}). Đã loại bỏ ${res.duplicatesRemoved} bản sao trùng lặp, giữ lại ${res.uniqueRemaining} câu hỏi chuẩn nhất trong Ngân hàng!`,
              "success"
            );
          } else {
            showAlert(
              "Ngân hàng hoàn hảo",
              `Quét ${res.totalScanned} câu hỏi (${subjectLabel}). Không có câu hỏi nào bị trùng lặp!`,
              "info"
            );
          }
          await loadTabData('bank');
        } catch (e: any) {
          showAlert("Lỗi dọn dẹp", "Lỗi khi quét trùng lặp: " + (e.message || "Lỗi không xác định"), "error");
        } finally {
          setIsSyncing(false);
        }
      }
    );
  };

  const handleDeleteBankQuestion = async (id: string) => {
    try {
      await deleteBankQuestion(id);
      setBankQuestions(prev => prev.filter(q => q.id !== id));
      showAlert("Thành công", "Đã xóa câu hỏi khỏi Ngân hàng câu hỏi!", "success");
    } catch (err: any) {
      showAlert("Lỗi", "Không thể xóa câu hỏi: " + (err.message || "Lỗi không xác định"), "error");
    }
  };

  const handleDeleteBatchBankQuestions = async (ids: string[]) => {
    try {
      await deleteBatchBankQuestions(ids);
      setBankQuestions(prev => prev.filter(q => !ids.includes(q.id)));
      showAlert("Thành công", `Đã xóa thành công ${ids.length} câu hỏi khỏi Ngân hàng!`, "success");
    } catch (err: any) {
      showAlert("Lỗi", "Không thể xóa các câu hỏi đã chọn: " + (err.message || "Lỗi không xác định"), "error");
    }
  };

  const handleAiGenerate = async (config: {
    topic: string;
    p1: number;
    p2: number;
    p3: number;
    target: 'editor' | 'bank';
    matrix?: { easy: number; medium: number; hard: number; vhard: number };
    pdfBase64?: string;
  }) => {
    setIsAiLoading(true);
    try {
      const newQs = await generateQuizFromPrompt({
        topic: config.topic,
        grade: quizGrade,
        part1Count: config.p1,
        part2Count: config.p2,
        part3Count: config.p3,
        matrix: config.matrix,
        pdfBase64: config.pdfBase64
      }, customApiKey);
      
      if (config.target === 'editor') {
        const enriched = newQs.map(q => ({
          ...q,
          subject: currentUser?.subject || '',
          createdBy: currentUser?.id,
          createdByName: currentUser?.fullName
        }));
        setQuestions([...questions, ...enriched]);
        setActiveTab('quizzes');
        setIsEditingQuiz(true);
        if (!quizTitle) setQuizTitle(config.topic.slice(0, 50).toUpperCase());
      } else {
        for (const q of newQs) {
          await saveBankQuestion({
            ...q,
            subject: currentUser?.subject || '',
            createdBy: currentUser?.id,
            createdByName: currentUser?.fullName
          });
        }
        showAlert("Thành công", `Đã lưu ${newQs.length} câu hỏi mới vào Ngân hàng!`, "success");
        loadTabData('bank');
      }
    } catch (error: any) {
      showAlert("Lỗi AI Soạn đề", error.message || "Không thể tạo câu hỏi", "error");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSaveQuiz = async () => {
    if (!quizTitle.trim()) return showAlert("Thiếu thông tin", "Vui lòng nhập tiêu đề đề thi!", "warning");
    if (questions.length === 0) return showAlert("Thiếu câu hỏi", "Đề thi chưa có câu hỏi nào!", "warning");
    
    setIsSavingInProgress(true);
    const existingQuiz = editingQuizId ? quizzes.find(q => q.id === editingQuizId) : null;
    const finalQuizSubject = quizSubject || existingQuiz?.subject || mySubject || currentUser?.subject || 'Toán';

    const finalTargetType = isSuperAdmin ? (targetType || 'all') : 'classes';

    const quiz: Quiz = {
      id: editingQuizId || uuidv4(), 
      title: quizTitle, 
      grade: quizGrade, 
      type: quizType,
      maxAttempts: quizType === 'test' ? (quizMaxAttempts ?? 1) : (quizMaxAttempts || 0),
      academicYear: quizAcademicYear || existingQuiz?.academicYear || getCurrentAcademicYear(),
      subject: finalQuizSubject,
      isPublished, 
      isMonitored, 
      showResultAnswers: quizType === 'test' ? (showResultAnswers !== false) : true,
      isUnlisted, 
      isSharedWithTeachers,
      createdBy: existingQuiz ? (existingQuiz.createdBy || currentUser?.id) : currentUser?.id,
      createdByName: existingQuiz ? (existingQuiz.createdByName || currentUser?.fullName) : currentUser?.fullName,
      durationMinutes: duration, 
      orderIndex, 
      category, 
      startTime, 
      endTime,
      targetType: finalTargetType, 
      assignedClassIds: finalTargetType === 'all' ? [] : (assignedClassIds || []),
      questions: questions.map(q => ({
        ...q,
        subject: q.subject || finalQuizSubject,
        createdBy: q.createdBy || currentUser?.id,
        createdByName: q.createdByName || currentUser?.fullName
      })), 
      createdAt: existingQuiz ? existingQuiz.createdAt : new Date().toISOString(), 
      description: ''
    };
    
    try {
      if (editingQuizId) {
          await updateQuiz(quiz);
      } else {
          await saveQuiz(quiz);
      }
      setIsEditingQuiz(false);
      await loadTabData('quizzes');
      showAlert("Thành công", "Đã lưu đề thi thành công vào Database Cloud!", "success");
    } catch (e: any) { 
      showAlert("Lỗi lưu đề thi", e.message || "Không xác định", "error");
    } finally {
      setIsSavingInProgress(false);
    }
  };

  const handleDeleteQuiz = (id: string) => {
    const targetQuiz = quizzes.find(q => q.id === id);
    const isMine = Boolean(currentUser?.id && targetQuiz?.createdBy === currentUser.id);
    if (!isSuperAdmin && !isMine) {
      showAlert(
        "Không có quyền xóa", 
        "Bạn chỉ có quyền xóa đề thi do chính mình tạo ra.", 
        "warning"
      );
      return;
    }

    showConfirm(
      "Xác nhận xóa đề thi",
      "Bạn có chắc chắn muốn xóa vĩnh viễn đề thi này không? Dữ liệu bảng điểm liên quan sẽ không thể phục hồi.",
      async () => {
        setIsDataLoading(true);
        try {
          await deleteQuiz(id); 
          await loadTabData('quizzes');
          showAlert("Thành công", "Đã xóa đề thi thành công.", "success");
        } catch (e: any) {
          showAlert("Lỗi khi xóa đề thi", e.message || "Không xác định", "error");
        } finally {
          setIsDataLoading(false);
        }
      }
    );
  };

  const handlePdfExtract = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsAiLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = (reader.result as string).split(',')[1];
          const newQs = await parseQuestionsFromPDF(base64, customApiKey);
          setQuestions([...questions, ...newQs]);
          showAlert("Thành công", `Đã trích xuất thành công ${newQs.length} câu hỏi từ file PDF!`, "success");
        } catch (err: any) {
          showAlert("Lỗi trích xuất PDF", err.message || "Không thể đọc nội dung PDF", "error");
        } finally {
          setIsAiLoading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (error: any) { 
      showAlert("Lỗi đọc file", error.message, "error"); 
      setIsAiLoading(false); 
    }
  };

  const handleTextExtract = async (text: string) => {
      if (!text.trim()) return;
      setIsAiLoading(true);
      try {
          const newQs = await parseQuestionsFromText(text, customApiKey);
          setQuestions([...questions, ...newQs]);
          showAlert("Thành công", `Đã trích xuất ${newQs.length} câu hỏi từ văn bản!`, "success");
      } catch (error: any) {
          showAlert("Lỗi trích xuất văn bản", error.message, "error");
      } finally {
          setIsAiLoading(false);
      }
  };

  const handleUploadImage = async (id: string, f: File) => {
    if (!f) return;
    setUploadingId(id);
    try {
      const url = await uploadQuizImage(f);
      if (url) {
        setQuestions(prev => prev.map(q => q.id === id ? { ...q, imageUrl: url } : q));
      }
    } catch (err: any) {
      console.error("Lỗi khi tải ảnh:", err);
      showAlert("Lỗi tải ảnh", "Không thể xử lý ảnh: " + (err.message || "Lỗi không xác định"), "error");
    } finally {
      setUploadingId(null);
    }
  };

  const handleCleanLabels = () => {
    const stripLabel = (text: string): string => {
        if (!text) return "";
        let cleaned = normalizeFullText(text.trim());
        const labelRegex = /^(\*?[A-Za-z0-9][\.\)\/\-:\s]\s*)/g;
        while (labelRegex.test(cleaned)) {
            cleaned = cleaned.replace(labelRegex, "").trim();
        }
        return cleaned;
    };

    const cleanedQuestions = questions.map(q => {
        const newQ = { ...q };
        newQ.text = stripLabel(q.text);
        if (q.solution) newQ.solution = normalizeFullText(q.solution);
        
        if (q.options) {
            newQ.options = q.options.map(opt => stripLabel(opt));
        }

        if (q.type === 'mcq' && q.correctAnswer && q.options) {
            const currentAns = q.correctAnswer.trim();
            const cleanAns = stripLabel(currentAns);
            
            // Nếu đáp án hiện tại là một nhãn đơn lẻ (A, B, C, D)
            const matchLabel = currentAns.match(/^[A-D][\.\)\s]*$/i);
            if (matchLabel) {
                const label = matchLabel[0].charAt(0).toUpperCase();
                const index = label.charCodeAt(0) - 65;
                if (q.options[index]) {
                    newQ.correctAnswer = stripLabel(q.options[index]);
                }
            } else {
                newQ.correctAnswer = cleanAns;
            }
        }

        if (q.subQuestions) {
            newQ.subQuestions = q.subQuestions.map(sq => ({
                ...sq,
                text: stripLabel(sq.text)
            }));
        }
        return newQ;
    });

    setQuestions(cleanedQuestions);
    showAlert("Thành công", "Đã chuẩn hóa dấu tiếng Việt, sửa lỗi vỡ chữ và dọn dẹp nhãn cho toàn bộ câu hỏi!", "success");
  };

  const handleImportCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsDataLoading(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (resultsObj: any) => {
        setIsDataLoading(false);
        const data = resultsObj.data as any[];
        if (!data || data.length === 0) {
          showAlert("Không có dữ liệu", "File CSV rỗng hoặc không đúng định dạng.", "error");
          e.target.value = '';
          return;
        }

        const firstRow = data[0];
        const headers = Object.keys(firstRow).map(h => h.toLowerCase().trim());
        
        // Cụ thể hóa kiểm tra file học sinh
        const isUserFile = headers.includes('role') || 
                           headers.includes('student_code') || 
                           headers.includes('studentcode') || 
                           headers.includes('mahs') || 
                           headers.includes('hoten');
                           
        const isResultFile = headers.includes('score') || headers.includes('quiz_id') || headers.includes('quizid');

        if (isUserFile) {
          const parsedUsers: User[] = data.map(row => {
            const getVal = (keys: string[]) => {
              for (const k of keys) {
                const foundKey = Object.keys(row).find(x => x.toLowerCase().trim() === k.toLowerCase().trim());
                if (foundKey && row[foundKey] !== undefined) {
                  return String(row[foundKey]).trim();
                }
              }
              return '';
            };

            const rawMahs = getVal(['mahs', 'studentCode', 'student_code', 'studentcode']);
            const fullName = getVal(['hoten', 'fullName', 'full_name', 'fullname']) || 'Học sinh';
            const grade = (getVal(['khoi', 'grade']) || '12') as Grade;
            const password = getVal(['pass', 'password']) || '123';
            const role = (getVal(['role']) || 'student') as Role;
            const rawClassName = getVal(['lop', 'class', 'className', 'classname']);
            const rawAcademicYear = getVal(['nienkhoa', 'academicYear', 'academic_year', 'namhoc']);
            const rawSubject = getVal(['mon', 'subject', 'monhoc', 'mon_hoc']);

            const studentCode = rawMahs.toUpperCase();
            const username = studentCode.toLowerCase();

            // Tìm class tương ứng nếu có
            let matchedClass = classes.find(c => 
              c.name.trim().toLowerCase() === rawClassName.trim().toLowerCase() &&
              (!rawAcademicYear || c.academicYear.trim() === rawAcademicYear.trim())
            );

            return {
              id: String(row.id || uuidv4()),
              username,
              password,
              role,
              fullName,
              studentCode,
              grade: (matchedClass ? matchedClass.grade : grade) as Grade,
              classId: matchedClass?.id || row.classId || row.class_id || '',
              className: matchedClass?.name || rawClassName || '',
              academicYear: matchedClass?.academicYear || rawAcademicYear || '',
              subject: matchedClass?.subject || rawSubject || currentUser?.subject || '',
              createdById: currentUser?.id || '',
              teacherName: currentUser?.fullName || '',
              createdAt: new Date().toISOString(),
              points: Number(row.points || 0)
            };
          }).filter(u => u.role === 'student' && u.studentCode);

          if (parsedUsers.length === 0) {
            showAlert(
              "Định dạng không khớp", 
              "Không tìm thấy học sinh hợp lệ. Yêu cầu file CSV chứa các cột thông tin: Mahs (hoặc studentCode), Hoten (hoặc fullName), khoi (hoặc grade), pass (hoặc password).", 
              "error"
            );
            e.target.value = '';
            return;
          }

          if (isDatabaseConnected()) {
            showConfirm(
              "Nạp học sinh từ CSV",
              `Bạn đang kết nối Cloud. Bạn có chắc chắn muốn nạp và lưu trữ vĩnh viễn ${parsedUsers.length} học sinh này vào Database Cloud? Các học sinh có mã số trùng lặp sẽ tự động cập nhật thông tin mới.`,
              async () => {
                setIsDataLoading(true);
                try {
                  await saveUsersBatch(parsedUsers);
                  await loadTabData('students');
                  showAlert(
                    "Thành công", 
                    `Đã nạp và lưu thành công ${parsedUsers.length} học sinh lên Database Cloud!`, 
                    "success"
                  );
                } catch (err: any) {
                  showAlert("Lỗi", "Không thể lưu học sinh lên Database: " + err.message, "error");
                } finally {
                  setIsDataLoading(false);
                }
              },
              undefined,
              "Đồng ý lưu Cloud",
              "Hủy"
            );
          } else {
            setStudents(parsedUsers);
            setStudentsTotal(parsedUsers.length);
            showAlert(
              "Đã tải tạm thời", 
              `Đã tải tạm thời ${parsedUsers.length} học sinh vào bộ nhớ (Chưa lưu trữ Cloud vì mất kết nối Database).`, 
              "success"
            );
          }
        } else if (isResultFile) {
          // File kết quả thi
          const parsedResults = data.map(row => {
            const sId = row.studentId || row.student_id;
            const scStr = String(row.studentCode || row.student_code || "").trim();
            return {
              ...row,
              id: row.id || uuidv4(),
              quizId: row.quizId || row.quiz_id,
              studentId: sId,
              studentCode: scStr || 'N/A',
              studentName: row.studentName || row.student_name || row.full_name || 'Học sinh',
              score: Number(row.score || 0),
              submittedAt: row.submittedAt || row.submitted_at || new Date().toISOString()
            };
          });

          setResults(parsedResults);
          setResultsTotal(parsedResults.length);
          showAlert("Thành công", `Đã tải ${parsedResults.length} kết quả thi từ file CSV.`, "success");
        } else {
          showAlert(
            "Không thể nhận diện", 
            "Định dạng file CSV không được hỗ trợ. Hãy sử dụng các cột tiêu đề sau: Mahs, Hoten, khoi, pass.", 
            "error"
          );
        }
        e.target.value = '';
      },
      error: (err: any) => {
        setIsDataLoading(false);
        showAlert("Lỗi đọc file", "Không thể parse file CSV: " + err.message, "error");
        e.target.value = '';
      }
    });
  };

  const handleSaveStudent = async () => {
    if (!studentForm.fullName || !studentForm.studentCode) {
      return showAlert("Thiếu thông tin", "Vui lòng điền đủ thông tin học sinh!", "warning");
    }
    
    const code = studentForm.studentCode.trim().toUpperCase();
    
    // Kiểm tra trùng mã học sinh (MAHS)
    const isDuplicate = students.some(s => s.studentCode === code && s.id !== selectedStudent?.id);
    if (isDuplicate) {
      return showAlert("Trùng mã số học sinh", `Mã học sinh "${code}" đã tồn tại trong hệ thống. Vui lòng kiểm tra lại!`, "error");
    }

    setIsSavingStudent(true);
    try {
      const newUser: User = {
        id: selectedStudent?.id || uuidv4(), 
        username: code.toLowerCase(),
        password: studentForm.password, 
        role: 'student', 
        fullName: studentForm.fullName,
        studentCode: code, 
        grade: studentForm.grade,
        classId: studentForm.classId,
        className: studentForm.className,
        academicYear: studentForm.academicYear,
        subject: studentForm.subject || selectedStudent?.subject || currentUser?.subject || '',
        createdById: selectedStudent?.createdById || currentUser?.id || '',
        createdAt: selectedStudent?.createdAt || new Date().toISOString(),
        points: selectedStudent?.points || 0
      };
      await saveUser(newUser); setIsStudentModalOpen(false); loadTabData('students');
      showAlert("Thành công", `Đã lưu học sinh ${studentForm.fullName} thành công!`, "success");
    } catch (e: any) { 
      showAlert("Lỗi", "Lỗi lưu học sinh trên Cloud", "error"); 
    } finally { 
      setIsSavingStudent(false); 
    }
  };

  const handleBulkAssignClass = async (studentIds: string[], classInfo: any) => {
    setIsDataLoading(true);
    try {
      if (classInfo) {
        await assignStudentsToClass(studentIds, {
          classId: classInfo.classId,
          className: classInfo.className,
          academicYear: classInfo.academicYear,
          grade: classInfo.grade,
          subject: classInfo.subject
        });
      } else {
        await assignStudentsToClass(studentIds, null);
      }
      await loadTabData('students');
      showAlert("Thành công", `Đã cập nhật phân lớp cho ${studentIds.length} học sinh!`, "success");
    } catch (e: any) {
      showAlert("Lỗi", "Không thể phân lớp: " + (e.message || "Lỗi không xác định"), "error");
    } finally {
      setIsDataLoading(false);
    }
  };

  const handleDeleteStudent = async (id: string, name: string) => {
    showConfirm(
      "Xác nhận xóa học sinh",
      `CẢNH BÁO: Xóa học sinh "${name}" sẽ xóa vĩnh viễn toàn bộ lịch sử bài làm của học sinh này trên Database. Bạn có chắc chắn muốn tiếp tục?`,
      async () => {
        await handleDeleteStudentsBatch([id]);
      }
    );
  };

  const handleDeleteResultBatch = async (resultsToDelete: Result[]) => {
    setIsDataLoading(true);
    try {
        await Promise.all(resultsToDelete.map(r => deleteResult(r.id)));
        await loadTabData('results');
        showAlert("Thành công", `Đã xóa thành công ${resultsToDelete.length} bản ghi kết quả thi.`, "success");
    } catch (e: any) {
        showAlert("Lỗi", "Lỗi khi xóa kết quả: " + e.message, "error");
    } finally {
        setIsDataLoading(false);
    }
  };

  const handleDeleteStudentsBatch = async (studentIds: string[]) => {
    setIsDataLoading(true);
    try {
        await Promise.all(studentIds.map(id => deleteUser(id)));
        await loadTabData('students');
        showAlert("Thành công", `Đã xóa thành công ${studentIds.length} học sinh.`, "success");
    } catch (e: any) {
        showAlert("Lỗi", "Lỗi khi xóa học sinh: " + e.message, "error");
    } finally {
        setIsDataLoading(false);
    }
  };

  const handleResetPassword = async (student: User) => {
    const defaultPass = '123';
    showConfirm(
      "Đặt lại mật khẩu",
      `Đặt lại mật khẩu cho học sinh "${student.fullName}" về mặc định "${defaultPass}"?`,
      async () => {
        setIsDataLoading(true);
        try {
          const success = await changePassword(student.id, defaultPass);
          if (success) {
            showAlert("Thành công", `Đã đặt lại mật khẩu cho ${student.fullName} thành công về "123"!`, "success");
            loadTabData('students');
          } else {
            showAlert("Thất bại", "Có lỗi xảy ra khi đặt lại mật khẩu trên Cloud.", "error");
          }
        } catch (e: any) {
          showAlert("Lỗi", "Lỗi: " + e.message, "error");
        } finally {
          setIsDataLoading(false);
        }
      }
    );
  };

  const handleLoadMoreStudents = async () => {
    setIsDataLoading(true);
    try {
      const nextPage = studentsPage + 1;
      const paged = await getUsersPage(nextPage, 50, sSearch);
      setStudents(prev => [...prev, ...paged.data.filter(u => u.role === 'student')]);
      setStudentsPage(nextPage);
      setStudentsTotal(paged.total);
    } catch (e) {
      console.error("Lỗi tải thêm học sinh:", e);
    } finally {
      setIsDataLoading(false);
    }
  };

  const handleLoadMoreResults = async () => {
    setIsDataLoading(true);
    try {
      const nextPage = resultsPage + 1;
      const paged = await getResultsMetadataPage(nextPage, 50, rQuizFilter, rSearch);
      setResults(prev => [...prev, ...paged.data]);
      setResultsPage(nextPage);
      setResultsTotal(paged.total);
    } catch (e) {
      console.error("Lỗi tải thêm kết quả:", e);
    } finally {
      setIsDataLoading(false);
    }
  };

  const dbConnected = isDatabaseConnected();

  return (
    <div className="min-h-screen bg-white flex">
      <aside className="w-16 lg:w-64 bg-slate-900 text-white flex flex-col shrink-0 transition-all">
        <div className="p-4 lg:p-8 border-b border-white/10 text-center lg:text-left">
          <h2 className="text-xl font-black uppercase tracking-tighter italic">
            <span className="hidden lg:inline">EDU_QUIZ<span className="text-blue-500">List</span></span>
            <span className="lg:hidden text-blue-500">EQ</span>
          </h2>
        </div>
        <nav className="flex-1 p-2 lg:p-4 space-y-1 mt-4">
          {[
            { id: 'quizzes', icon: LayoutDashboard, label: 'Đề thi' },
            { id: 'teachers', icon: ShieldCheck, label: 'Giáo viên', locked: !isSuperAdmin },
            { id: 'classes', icon: GraduationCap, label: 'Lớp học' },
            { id: 'ai', icon: Sparkles, label: 'AI Soạn đề' },
            { id: 'students', icon: Users, label: 'Học sinh' },
            { id: 'results', icon: BarChart3, label: 'Bảng điểm' },
            { id: 'monitor', icon: ShieldAlert, label: 'Giám sát' },
            { id: 'chapters', icon: FolderTree, label: 'Chương' },
            { id: 'bank', icon: Database, label: 'Ngân hàng' },
            { id: 'database', icon: Server, label: 'CSDL & Băng thông', locked: !isSuperAdmin },
          ].map(tab => {
            const isLocked = Boolean(tab.locked);
            return (
              <button
                key={tab.id}
                onClick={() => {
                  if (isLocked) {
                    showAlert("Quyền hạn", `Chức năng "${tab.label}" chỉ dành riêng cho Tổng Quản Trị (SuperAdmin).`, "warning");
                    return;
                  }
                  setActiveTab(tab.id as AdminTab);
                  setIsEditingQuiz(false);
                }}
                className={`w-full flex items-center justify-between lg:justify-start gap-3 px-4 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${
                  isLocked
                    ? 'opacity-35 cursor-not-allowed text-slate-500 hover:bg-transparent'
                    : activeTab === tab.id
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:bg-white/5'
                }`}
                title={isLocked ? "Chức năng chỉ dành cho SuperAdmin" : undefined}
              >
                <div className="flex items-center gap-3">
                  <tab.icon size={18}/> 
                  <span className="hidden lg:inline">{tab.label}</span>
                </div>
                {isLocked && (
                  <span className="hidden lg:inline-flex px-1.5 py-0.5 bg-slate-800 border border-slate-700 text-[8px] font-bold text-slate-400 rounded">
                    Khóa
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        
        {/* User Info & Teaching Subject Selector */}
        <div className="p-3 lg:p-4 border-t border-white/10 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center font-black text-xs shrink-0 shadow-sm">
              {currentUser?.fullName ? currentUser.fullName.charAt(0).toUpperCase() : 'A'}
            </div>
            <div className="hidden lg:block overflow-hidden">
              <p className="text-xs font-black truncate">{currentUser?.fullName || 'Super Admin'}</p>
              <p className="text-[9px] font-bold text-blue-400 uppercase tracking-wider">{isSuperAdmin ? 'Tổng Quản Trị' : 'Giáo Viên'}</p>
            </div>
          </div>
          
          <div className="hidden lg:block bg-white/5 p-2.5 rounded-xl border border-white/10 space-y-1.5">
            <label className="text-[9px] font-black uppercase text-slate-400 flex items-center gap-1.5">
              <BookOpen size={11} className="text-blue-400"/> Môn giảng dạy:
            </label>
            {isSuperAdmin ? (
              <select
                value={mySubject}
                onChange={(e) => handleUpdateMySubject(e.target.value)}
                className="w-full bg-slate-800 text-white text-[11px] font-bold rounded-lg px-2.5 py-1.5 border border-white/15 outline-none focus:border-blue-500 transition-colors cursor-pointer"
                title="Super Admin: Chọn môn giảng dạy để lọc và gán đề"
              >
                {STANDARD_SUBJECTS.map(subj => (
                  <option key={subj} value={subj}>Môn {subj}</option>
                ))}
              </select>
            ) : (
              <div className="bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-white/10 flex items-center justify-between">
                <span className="text-white text-xs font-black uppercase tracking-wider">
                  Môn {mySubject || currentUser?.subject || 'Toán'}
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Môn đã liên kết với tài khoản" />
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="flex-1 h-screen overflow-y-auto custom-scrollbar bg-slate-50">
        <div className="p-4 lg:p-8 max-w-[1600px] mx-auto">
          {!dbConnected && (
            <div className="mb-8 bg-red-50 border-2 border-red-100 p-8 rounded-[3rem] shadow-sm flex flex-col md:flex-row items-center justify-between gap-6 animate-pulse">
                <div className="flex items-center gap-5">
                    <div className="p-4 bg-red-600 text-white rounded-[1.5rem] shadow-lg"><AlertTriangle size={28}/></div>
                    <div>
                        <h4 className="text-red-900 font-black uppercase text-sm">Hệ thống đang mất kết nối Database</h4>
                        <p className="text-red-700 text-[10px] font-bold uppercase tracking-tight mt-1 leading-tight">Bạn không thể tải dữ liệu từ Cloud. Vui lòng sử dụng file CSV để xem hoặc nạp dữ liệu tạm thời.</p>
                    </div>
                </div>
                <div className="flex gap-3">
                    <label className="flex items-center gap-2 px-8 py-4 bg-white text-red-600 border border-red-200 rounded-2xl hover:bg-red-600 hover:text-white transition-all text-[10px] font-black uppercase shadow-sm cursor-pointer">
                        <FileUp size={16}/> Chọn file CSV
                        <input type="file" accept=".csv" className="hidden" onChange={handleImportCsv}/>
                    </label>
                </div>
            </div>
          )}

          {activeTab === 'quizzes' && (
            isEditingQuiz ? (
              <>
                {isSavingInProgress && (
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[3000] flex items-center justify-center">
                        <div className="bg-white p-10 rounded-[2rem] shadow-2xl flex flex-col items-center gap-4">
                            <Loader2 className="animate-spin text-blue-600" size={48}/>
                            <p className="font-black uppercase text-xs tracking-widest text-slate-800">Đang ghi dữ liệu vào Cloud...</p>
                        </div>
                    </div>
                )}
                <QuizEditor
                    editingId={editingQuizId} title={quizTitle} setTitle={setQuizTitle}
                    grade={quizGrade} setGrade={setQuizGrade} quizType={quizType} setQuizType={setQuizType}
                    maxAttempts={quizMaxAttempts} setMaxAttempts={setQuizMaxAttempts}
                    academicYear={quizAcademicYear} setAcademicYear={setQuizAcademicYear}
                    subject={quizSubject} setSubject={setQuizSubject}
                    isPublished={isPublished} setIsPublished={setIsPublished} isMonitored={isMonitored} setIsMonitored={setIsMonitored}
                    showResultAnswers={showResultAnswers} setShowResultAnswers={setShowResultAnswers}
                    isUnlisted={isUnlisted} setIsUnlisted={setIsUnlisted}
                    isSharedWithTeachers={isSharedWithTeachers} setIsSharedWithTeachers={setIsSharedWithTeachers}
                    targetType={targetType} setTargetType={setTargetType}
                    assignedClassIds={assignedClassIds} setAssignedClassIds={setAssignedClassIds}
                    classes={accessibleClasses}
                    duration={duration} setDuration={setDuration} category={category} setCategory={setCategory}
                    orderIndex={orderIndex} setOrderIndex={setOrderIndex}
                    startTime={startTime} setStartTime={setStartTime} endTime={endTime} setEndTime={setEndTime}
                    questions={questions} setQuestions={setQuestions} chapters={accessibleChapters} onSave={handleSaveQuiz}
                    onCleanLabels={handleCleanLabels}
                    onOpenBank={(type) => { 
                        setBTypeFilter(type); 
                        setBGradeFilter(quizGrade); 
                        loadBankDataIfNeeded();
                        setIsBankOpen(true); 
                    }}
                    onPdfExtract={handlePdfExtract} onTextExtract={handleTextExtract} onUploadImage={handleUploadImage} uploadingId={uploadingId} isAiLoading={isAiLoading}
                    isSuperAdmin={isSuperAdmin}
                    customApiKey={customApiKey}
                    onApiKeyChange={handleApiKeyChange}
                />
              </>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                   <h1 className="text-xl font-black text-slate-800 uppercase italic">QUẢN LÝ ĐỀ THI</h1>
                   <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => setIsApiKeyModalOpen(true)}
                        className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-black uppercase text-[10px] border transition-all shadow-sm active:scale-95 ${
                          customApiKey 
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100' 
                            : 'bg-white border-2 border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                        }`}
                        title="Cấu hình Gemini API Key cho AI soạn đề"
                      >
                        <Key size={14} className={customApiKey ? "text-emerald-600" : "text-slate-400"} />
                        <span>{customApiKey ? "Key riêng: Đang bật" : "Gemini API Key"}</span>
                        {customApiKey && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-0.5"></span>}
                      </button>

                      <button 
                        onClick={handleSyncAllQuizzes} 
                        disabled={isSyncing}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white border-2 border-slate-200 text-slate-500 rounded-xl font-black uppercase text-[10px] shadow-sm hover:bg-slate-50 transition-all disabled:opacity-50"
                        title="Đồng bộ lại số lượng câu hỏi trong mỗi đề"
                      >
                         {isSyncing ? <Loader2 className="animate-spin" size={15}/> : <RefreshCw size={15}/>}
                         CẬP NHẬT SỐ CÂU
                      </button>
                      <button onClick={handleCreateQuiz} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-black uppercase text-[10px] shadow-lg hover:bg-black transition-all">
                          <Plus size={16}/> TẠO ĐỀ MỚI
                      </button>
                   </div>
                </div>
                {isDataLoading ? (
                    <div className="py-20 text-center"><Loader2 className="animate-spin mx-auto text-blue-500" size={40}/><p className="mt-4 text-[10px] font-black uppercase text-slate-400">Đang tải Cloud...</p></div>
                ) : (
                    <QuizList 
                        quizzes={accessibleQuizzes} results={accessibleResults} chapters={accessibleChapters} classes={accessibleClasses}
                        currentUser={currentUser} teachers={teachers}
                        onEdit={handleEditQuiz} onDelete={handleDeleteQuiz} onPreview={handlePreviewQuiz}
                        onAssignClasses={handleAssignClasses}
                        qSearch={qSearch} setQSearch={setQSearch} qGradeFilter={qGradeFilter} setQGradeFilter={setQGradeFilter}
                        qChapterFilter={qChapterFilter} setQChapterFilter={setQChapterFilter}
                        qSubjectFilter={qSubjectFilter} setQSubjectFilter={setQSubjectFilter}
                        qAcademicYearFilter={qAcademicYearFilter} setQAcademicYearFilter={setQAcademicYearFilter}
                    />
                )}
              </div>
            )
          )}

          {activeTab === 'teachers' && (
            <TeacherManager
              teachers={teachers}
              quizzes={quizzes}
              classes={classes}
              currentUser={currentUser}
              onSaveTeacher={async (t) => {
                await saveTeacher(t);
                showAlert("Thành công", `Đã lưu tài khoản giáo viên ${t.fullName}! Tên giáo viên trên các lớp học và đề thi liên quan đã được đồng bộ tự động.`, "success");
                await Promise.all([
                  loadTabData('teachers'),
                  loadTabData('classes')
                ]);
              }}
              onDeleteTeacher={async (id, name) => {
                showConfirm(
                  "Xác nhận xóa tài khoản giáo viên",
                  `Bạn có chắc chắn muốn xóa tài khoản giáo viên "${name}" không? Thao tác này không thể hoàn tác.`,
                  async () => {
                    await deleteTeacher(id);
                    showAlert("Thành công", `Đã xóa tài khoản giáo viên "${name}"!`, "success");
                    await loadTabData('teachers');
                  }
                );
              }}
              onResetPassword={async (t) => {
                const success = await changePassword(t.id, '123');
                if (success) {
                  showAlert("Thành công", `Đã đặt lại mật khẩu cho giáo viên ${t.fullName} về mặc định "123"!`, "success");
                  await loadTabData('teachers');
                } else {
                  showAlert("Lỗi", "Không thể đặt lại mật khẩu giáo viên", "error");
                }
              }}
              onRefresh={() => loadTabData('teachers')}
            />
          )}

          {activeTab === 'classes' && (
            <ClassManager 
              classes={accessibleClasses}
              students={accessibleStudents}
              quizzes={accessibleQuizzes}
              results={accessibleResults}
              chapters={accessibleChapters}
              currentUser={currentUser}
              teachers={teachers}
              onSaveClass={async (c) => {
                const classToSave: ClassRoom = {
                  ...c,
                  createdBy: c.createdBy || currentUser?.id || '',
                  teacherName: c.teacherName || currentUser?.fullName || ''
                };
                await saveClass(classToSave);
                await loadTabData('classes');
              }}
              onDeleteClass={async (id, name) => {
                showConfirm(
                  "Xác nhận xóa lớp học",
                  `Bạn có chắc chắn muốn xóa lớp "${name}" không? Học sinh thuộc lớp này sẽ không bị xóa khỏi hệ thống mà chỉ gỡ liên kết lớp.`,
                  async () => {
                    await deleteClass(id);
                    await loadTabData('classes');
                  }
                );
              }}
              onAssignStudents={async (studentIds, classInfo) => {
                await assignStudentsToClass(studentIds, classInfo);
                await loadTabData('classes');
                await loadTabData('students');
              }}
              onRefresh={() => {
                loadTabData('classes');
                loadTabData('students');
              }}
            />
          )}

          {activeTab === 'ai' && (
            <div className="space-y-6">
                <h1 className="text-xl font-black text-slate-800 uppercase italic">SOẠN ĐỀ THÔNG MINH</h1>
                <AIRenderer 
                    grade={quizGrade} 
                    setGrade={setQuizGrade} 
                    onGenerate={handleAiGenerate}
                    isLoading={isAiLoading}
                    hasQuestionsInEditor={questions.length > 0}
                    customApiKey={customApiKey}
                    onApiKeyChange={handleApiKeyChange}
                    isSuperAdmin={isSuperAdmin}
                />
            </div>
          )}

          {activeTab === 'students' && (
            <div className="space-y-6">
                <h1 className="text-xl font-black text-slate-800 uppercase italic">DANH SÁCH HỌC SINH</h1>
                {isDataLoading && accessibleStudents.length === 0 ? (
                    <div className="py-20 text-center"><Loader2 className="animate-spin mx-auto text-blue-500" size={40}/><p className="mt-4 text-[10px] font-black uppercase text-slate-400">Đang tải...</p></div>
                ) : (
                    <StudentManager 
                        students={accessibleStudents} results={accessibleResults} quizzes={accessibleQuizzes} classes={accessibleClasses}
                        teachers={teachers}
                        currentUser={currentUser}
                        sSearch={sSearch} setSSearch={setSSearch} sGradeFilter={sGradeFilter} setSGradeFilter={setSGradeFilter}
                        onRefresh={() => loadTabData('students')}
                        onAdd={() => { setSelectedStudent(null); setStudentForm({fullName: '', studentCode: '', grade: '12', password: '123', classId: '', className: '', academicYear: '', subject: currentUser?.subject || ''}); setIsStudentModalOpen(true); }}
                        onImportCsv={handleImportCsv} onViewDetail={setViewingStudent}
                        onEdit={(u) => { setSelectedStudent(u); setStudentForm({fullName: u.fullName, studentCode: u.studentCode || '', grade: u.grade || '12', password: u.password, classId: u.classId || '', className: u.className || '', academicYear: u.academicYear || '', subject: u.subject || ''}); setIsStudentModalOpen(true); }}
                        onDelete={handleDeleteStudent} 
                        onBulkDelete={handleDeleteStudentsBatch}
                        onResetPassword={handleResetPassword}
                        onBulkAssignClass={handleBulkAssignClass}
                        totalCount={accessibleStudents.length}
                        onLoadMore={handleLoadMoreStudents}
                        isMoreLoading={isDataLoading}
                    />
                )}
            </div>
          )}

          {activeTab === 'results' && (
             <div className="space-y-6">
                <h1 className="text-xl font-black text-slate-800 uppercase italic">KẾT QUẢ HỌC TẬP</h1>
                {isDataLoading && results.length === 0 ? (
                    <div className="py-20 text-center"><Loader2 className="animate-spin mx-auto text-blue-500" size={40}/><p className="mt-4 text-[10px] font-black uppercase text-slate-400">Đang tải...</p></div>
                ) : (
                    <ResultsBoard 
                        results={accessibleResults} quizzes={accessibleQuizzes} users={accessibleStudents} chapters={accessibleChapters}
                        classes={accessibleClasses} teachers={teachers} currentUser={currentUser}
                        rGradeFilter={rGradeFilter} setRGradeFilter={setRGradeFilter}
                        rChapterFilter={rChapterFilter} setRChapterFilter={setRChapterFilter}
                        rQuizFilter={rQuizFilter} setRQuizFilter={setRQuizFilter}
                        rSearch={rSearch} setRSearch={setRSearch}
                        onRefresh={() => loadTabData('results')}
                        onClearCache={clearLocalCache}
                        onViewHistory={(name, code, title, history) => setHistoryData({ studentName: name, studentCode: code, quizTitle: title, history })}
                        onDeleteResult={handleDeleteResultBatch}
                        onImportCsv={handleImportCsv}
                        totalCount={resultsTotal}
                        onLoadMore={handleLoadMoreResults}
                        isMoreLoading={isDataLoading}
                    />
                )}
             </div>
          )}

          {activeTab === 'monitor' && <ExamMonitor currentUser={currentUser} />}
          {activeTab === 'chapters' && (
            <ChapterManager 
              chapters={chapters} 
              currentUser={currentUser}
              isSuperAdmin={isSuperAdmin}
              onSave={async (c) => { 
                setChapters(prev => {
                  const idx = prev.findIndex(item => item.id === c.id);
                  if (idx >= 0) {
                    const copy = [...prev];
                    copy[idx] = c;
                    return copy;
                  }
                  return [...prev, c];
                });
                await saveChapter(c); 
                loadTabData('chapters'); 
              }} 
              onDelete={async (id) => { 
                setChapters(prev => prev.filter(c => c.id !== id));
                await deleteChapter(id); 
                loadTabData('chapters'); 
              }} 
              onDeleteBatch={async (ids) => {
                const idSet = new Set(ids);
                setChapters(prev => prev.filter(c => !idSet.has(c.id)));
                await deleteChaptersBatch(ids);
                loadTabData('chapters');
              }}
            />
          )}
          {activeTab === 'bank' && (
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                   <div>
                     <h1 className="text-xl font-black text-slate-800 uppercase italic">NGÂN HÀNG CÂU HỎI</h1>
                     <p className="text-xs text-slate-400 font-medium">Kho dữ liệu câu hỏi dùng chung & đồng bộ chống trùng lặp thông minh</p>
                   </div>
                   {isSuperAdmin && (
                     <div className="flex flex-wrap items-center gap-2">
                       <button 
                          onClick={handleDeduplicateBank} 
                          disabled={isSyncing}
                          className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl font-black uppercase text-[10px] shadow-sm hover:bg-amber-100 transition-all disabled:opacity-50"
                          title="Quét và gộp các câu hỏi bị trùng lặp trong Ngân hàng"
                       >
                          {isSyncing ? <Loader2 className="animate-spin" size={14}/> : <Sparkles size={14} className="text-amber-600"/>}
                          QUÉT & GỘP TRÙNG LẶP {bSubjectFilter !== 'all' ? `(${bSubjectFilter})` : ''}
                       </button>
                       <button 
                          onClick={handleSyncBank} 
                          disabled={isSyncing}
                          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-black uppercase text-[10px] shadow-sm hover:bg-blue-700 transition-all disabled:opacity-50"
                          title="Đồng bộ câu hỏi từ các đề thi vào Ngân hàng (chống trùng lặp)"
                       >
                          {isSyncing ? <Loader2 className="animate-spin" size={14}/> : <RefreshCw size={14}/>}
                          CẬP NHẬT TỪ ĐỀ THI {bSubjectFilter !== 'all' ? `(${bSubjectFilter})` : ''}
                       </button>
                     </div>
                   )}
                </div>
                {isDataLoading ? (
                    <div className="py-20 text-center"><Loader2 className="animate-spin mx-auto text-blue-500" size={40}/><p className="mt-4 text-[10px] font-black uppercase text-slate-400">Đang tải...</p></div>
                ) : (
                    <QuestionBank 
                        questions={accessibleBankQuestions} 
                        chapters={accessibleChapters} 
                        bGradeFilter={bGradeFilter} setBGradeFilter={setBGradeFilter}
                        bChapterFilter={bChapterFilter} setBChapterFilter={setBChapterFilter}
                        bTypeFilter={bTypeFilter} setBTypeFilter={setBTypeFilter} 
                        bSearch={bSearch} setBSearch={setBSearch}
                        currentUser={currentUser}
                        isSuperAdmin={isSuperAdmin}
                        bSubjectFilter={bSubjectFilter}
                        setBSubjectFilter={setBSubjectFilter}
                        onAddMultiple={(qs) => { setQuestions([...questions, ...qs]); setActiveTab('quizzes'); setIsEditingQuiz(true); }}
                        onDeleteQuestion={handleDeleteBankQuestion}
                        onDeleteBatchQuestions={handleDeleteBatchBankQuestions}
                        onDeduplicate={handleDeduplicateBank}
                        isDeduplicating={isSyncing}
                    />
                )}
            </div>
          )}

          {activeTab === 'database' && (
            <DatabaseMonitor
              isSuperAdmin={isSuperAdmin}
              onShowAlert={showAlert}
              onShowConfirm={showConfirm}
            />
          )}
        </div>
      </main>

      {/* Modals */}
      {isStudentModalOpen && (
        <StudentModal 
          isOpen={isStudentModalOpen} 
          student={selectedStudent} 
          form={studentForm} 
          setForm={setStudentForm} 
          classes={accessibleClasses}
          currentUser={currentUser}
          onClose={() => setIsStudentModalOpen(false)} 
          onSave={handleSaveStudent} 
          isSaving={isSavingStudent} 
          isDuplicate={students.some(s => s.studentCode === studentForm.studentCode.trim().toUpperCase() && s.id !== selectedStudent?.id)}
        />
      )}
      {viewingStudent && <StudentDetailModal student={viewingStudent} results={accessibleResults} quizzes={accessibleQuizzes} onClose={() => setViewingStudent(null)} onViewResult={handleViewResultDetail} />}
      {historyData && <ResultHistoryModal isOpen={true} {...historyData} onClose={() => setHistoryData(null)} onViewDetail={handleViewResultDetail} onDeleteOne={(r) => deleteResult(r.id).then(() => loadTabData('results'))} />}
      {selectedResultDetail && <ResultDetailModal isOpen={true} result={selectedResultDetail.result} quiz={selectedResultDetail.quiz} onClose={() => setSelectedResultDetail(null)} />}
      {previewQuiz && <QuizPreviewModal quiz={previewQuiz} onClose={() => setPreviewQuiz(null)} />}
      
      {isBankOpen && (
        <div className="fixed inset-0 bg-slate-900/40 z-[2000] flex items-stretch justify-end">
             <div className="bg-white w-full h-full flex flex-col overflow-hidden shadow-2xl">
                <div className="px-4 py-2 bg-slate-900 text-white flex justify-between items-center border-b border-white/5">
                    <div className="flex items-center gap-2">
                        <Database size={16} className="text-blue-500"/>
                        <h3 className="text-[11px] font-black uppercase italic">Chọn từ Ngân hàng</h3>
                    </div>
                    <button onClick={() => setIsBankOpen(false)} className="px-3 py-1.5 bg-slate-800 rounded-lg hover:bg-red-600 text-[10px] font-black uppercase flex items-center gap-1">
                        <span>Đóng</span> <X size={14}/>
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 bg-slate-50 custom-scrollbar">
                    {isBankLoading ? (
                        <div className="py-20 text-center">
                            <Loader2 className="animate-spin mx-auto text-blue-500" size={40}/>
                            <p className="mt-4 text-[10px] font-black uppercase text-slate-400">Đang tải Ngân hàng câu hỏi từ Cloud...</p>
                        </div>
                    ) : (
                        <QuestionBank 
                            questions={accessibleBankQuestions} 
                            chapters={accessibleChapters}
                            bGradeFilter={bGradeFilter} setBGradeFilter={setBGradeFilter}
                            bChapterFilter={bChapterFilter} setBChapterFilter={setBChapterFilter}
                            bTypeFilter={bTypeFilter} setBTypeFilter={setBTypeFilter}
                            bSearch={bSearch} setBSearch={setBSearch}
                            currentUser={currentUser}
                            isSuperAdmin={isSuperAdmin}
                            bSubjectFilter={bSubjectFilter}
                            setBSubjectFilter={setBSubjectFilter}
                            onAddMultiple={(qs) => { setQuestions([...questions, ...qs]); setIsBankOpen(false); }}
                            onDeleteQuestion={handleDeleteBankQuestion}
                            onDeleteBatchQuestions={handleDeleteBatchBankQuestions}
                            onDeduplicate={handleDeduplicateBank}
                            isDeduplicating={isSyncing}
                        />
                    )}
                </div>
             </div>
        </div>
      )}

      {/* Gemini API Key Configuration Modal */}
      {isApiKeyModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[5000] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white max-w-lg w-full rounded-[2.5rem] border-4 border-white shadow-2xl p-8 overflow-hidden animate-scale-up space-y-6">
            <div className="flex items-center justify-between border-b pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                  <Key size={22} />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 uppercase tracking-tight text-base">Cấu hình Gemini API Key</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Dùng cho AI soạn đề & bóc tách PDF / Văn bản</p>
                </div>
              </div>
              <button 
                onClick={() => setIsApiKeyModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                  Mã API Key (AI Studio)
                </label>
                {customApiKey ? (
                  <span className="text-[9px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 flex items-center gap-1">
                    <Check size={10} /> Đang dùng Key riêng
                  </span>
                ) : (
                  <span className="text-[9px] font-bold uppercase text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                    {isSuperAdmin ? 'Đang dùng Key mặc định' : 'Chưa cài Key'}
                  </span>
                )}
              </div>

              <div className="relative flex items-center">
                <input
                  type={showApiKey ? "text" : "password"}
                  placeholder={isSuperAdmin ? "Mặc định dùng Key hệ thống (nhập để đổi)..." : "Dán mã AI Studio API Key vào đây..."}
                  value={customApiKey}
                  onChange={(e) => handleApiKeyChange(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3.5 pr-20 text-xs font-mono font-medium outline-none focus:border-blue-500 focus:bg-white transition-all text-slate-800"
                />
                <div className="absolute right-2 flex items-center gap-1">
                  {customApiKey && (
                    <button
                      type="button"
                      onClick={() => handleApiKeyChange('')}
                      className="text-[9px] font-bold text-red-500 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                      title="Xóa Key"
                    >
                      Xóa
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 transition-colors"
                    title={showApiKey ? "Ẩn Key" : "Hiện Key"}
                  >
                    {showApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] pt-1">
                <a 
                  href="https://aistudio.google.com/app/apikey" 
                  target="_blank" 
                  rel="noreferrer"
                  className="text-blue-600 hover:underline font-bold flex items-center gap-1"
                >
                  <Sparkles size={12} /> Lấy API Key miễn phí tại Google AI Studio
                </a>
              </div>
            </div>

            <div className="p-4 bg-blue-50/60 rounded-2xl border border-blue-100 text-[11px] text-slate-600 space-y-1">
              <p className="font-bold text-blue-900">💡 Lưu ý quan trọng:</p>
              <p>Key được lưu an toàn trên trình duyệt cá nhân của bạn. Không ảnh hưởng và không can thiệp đến tài khoản của các giáo viên khác.</p>
            </div>

            <button
              type="button"
              onClick={() => setIsApiKeyModalOpen(false)}
              className="w-full py-3.5 bg-slate-900 hover:bg-black text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-lg active:scale-95"
            >
              Lưu & Đóng
            </button>
          </div>
        </div>
      )}

      {/* Alert and Confirmation Modal Overlay */}
      {alertModal && alertModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[5000] flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-3xl border shadow-2xl p-6 overflow-hidden animate-scale-up">
            <div className="flex items-start gap-4 mb-4">
              <div className={`p-3 rounded-2xl shrink-0 ${
                alertModal.type === 'success' ? 'bg-emerald-50 text-emerald-600' :
                alertModal.type === 'error' ? 'bg-red-50 text-red-600' :
                alertModal.type === 'warning' ? 'bg-amber-50 text-amber-600' :
                'bg-blue-50 text-blue-600'
              }`}>
                {alertModal.type === 'success' && <DatabaseZap size={24} className="text-emerald-600" />}
                {alertModal.type === 'error' && <AlertTriangle size={24} className="text-red-600" />}
                {alertModal.type === 'warning' && <AlertTriangle size={24} />}
                {alertModal.type === 'info' && <DatabaseZap size={24} />}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight mb-1 leading-tight">{alertModal.title}</h3>
                <p className="text-xs text-slate-500 font-bold leading-relaxed break-words">{alertModal.message}</p>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              {alertModal.cancelText && (
                <button 
                  onClick={() => {
                    if (alertModal.onCancel) alertModal.onCancel();
                    setAlertModal(null);
                  }}
                  className="px-5 py-2.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl text-[10px] font-black uppercase transition-all"
                >
                  {alertModal.cancelText}
                </button>
              )}
              <button 
                onClick={() => {
                  if (alertModal.onConfirm) alertModal.onConfirm();
                  else setAlertModal(null);
                }}
                className={`px-5 py-2.5 text-white rounded-xl text-[10px] font-black uppercase transition-all shadow-md ${
                  alertModal.type === 'success' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100' :
                  alertModal.type === 'error' ? 'bg-red-600 hover:bg-red-700 shadow-red-100' :
                  alertModal.type === 'warning' ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-100' :
                  'bg-blue-600 hover:bg-blue-700 shadow-blue-100'
                }`}
              >
                {alertModal.confirmText || 'Đồng ý'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
