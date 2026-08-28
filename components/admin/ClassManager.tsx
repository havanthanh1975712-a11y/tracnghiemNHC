import React, { useState, useMemo } from 'react';
import { ClassRoom, User, Grade, Quiz, Result, Chapter } from '../../types';
import { 
  GraduationCap, Plus, Search, Edit3, Trash2, Users, Calendar, 
  ArrowRight, CheckSquare, Square, UserPlus, UserMinus,
  Check, ChevronRight, X, ArrowUpRight, BarChart3, Award,
  Clock, TrendingUp, AlertCircle, Copy, CheckCheck, BookOpen, 
  Star, Filter, ArrowLeft, Lightbulb, CheckCircle2, XCircle
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';
import { STANDARD_SUBJECTS, isSameSubject, getDisplaySubject, normalizeSubject } from '../../services/subjectUtils';

interface ClassManagerProps {
  classes: ClassRoom[];
  students: User[];
  quizzes?: Quiz[];
  results?: Result[];
  chapters?: Chapter[];
  currentUser?: User;
  teachers?: User[];
  onSaveClass: (c: ClassRoom) => Promise<void>;
  onDeleteClass: (id: string, name: string) => Promise<void>;
  onAssignStudents: (studentIds: string[], classInfo: { classId?: string; className?: string; academicYear?: string; grade?: Grade } | null) => Promise<void>;
  onRefresh?: () => void;
}

type ClassDetailTab = 'students' | 'stats' | 'progress';

export default function ClassManager({
  classes,
  students,
  quizzes = [],
  results = [],
  chapters = [],
  currentUser,
  teachers = [],
  onSaveClass,
  onDeleteClass,
  onAssignStudents
}: ClassManagerProps) {
  const isSuperAdmin = currentUser?.role === 'superadmin';

  // Main view state
  const [selectedClass, setSelectedClass] = useState<ClassRoom | null>(null);
  const [activeTab, setActiveTab] = useState<ClassDetailTab>('students');

  // Filters for Class Cards
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedGrade, setSelectedGrade] = useState<Grade | 'all'>('all');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [selectedTeacher, setSelectedTeacher] = useState<string>('all');

  // Class Modals (Create / Edit)
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassRoom | null>(null);
  const [classForm, setClassForm] = useState<{
    name: string;
    academicYear: string;
    grade: Grade;
    subject: string;
    description: string;
    isSharedWithTeachers: boolean;
  }>({
    name: '',
    academicYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
    grade: '12',
    subject: currentUser?.subject || '',
    description: '',
    isSharedWithTeachers: false
  });
  const [isSaving, setIsSaving] = useState(false);

  // Tab 1: Member state & Modals
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [isAddStudentModalOpen, setIsAddStudentModalOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudentIdsToAdd, setSelectedStudentIdsToAdd] = useState<string[]>([]);
  const [isAssigning, setIsAssigning] = useState(false);

  // Batch Promote / Transfer Modal
  const [isPromoteModalOpen, setIsPromoteModalOpen] = useState(false);
  const [promoteTargetClassId, setPromoteTargetClassId] = useState<string>('');
  const [selectedStudentIdsToPromote, setSelectedStudentIdsToPromote] = useState<string[]>([]);

  // Tab 2: Quiz Stats state
  const [statsChapterFilter, setStatsChapterFilter] = useState<string>('all');
  const [statsQuizSearch, setStatsQuizSearch] = useState<string>('');
  const [selectedQuizId, setSelectedQuizId] = useState<string>('');
  const [participationView, setParticipationView] = useState<'submitted' | 'unsubmitted'>('submitted');
  const [copiedUnsubmitted, setCopiedUnsubmitted] = useState(false);

  // Tab 3: Progress & Evaluation state
  const [progressSearch, setProgressSearch] = useState<string>('');
  const [inspectingStudent, setInspectingStudent] = useState<User | null>(null);

  // Map nhanh danh sách giáo viên
  const teacherMap = useMemo(() => {
    const map = new Map<string, User>();
    teachers.forEach(t => {
      if (t.id) map.set(t.id, t);
    });
    return map;
  }, [teachers]);

  // Unique academic years
  const academicYears = useMemo(() => {
    const years = new Set<string>();
    classes.forEach(c => {
      if (c.academicYear) years.add(c.academicYear.trim());
    });
    const currentYear = new Date().getFullYear();
    years.add(`${currentYear}-${currentYear + 1}`);
    years.add(`${currentYear + 1}-${currentYear + 2}`);
    return Array.from(years).sort().reverse();
  }, [classes]);

  // Available subjects from standard list + existing classes + teacher subjects
  const availableSubjects = useMemo(() => {
    const subsMap = new Map<string, string>();
    STANDARD_SUBJECTS.forEach(s => {
      subsMap.set(normalizeSubject(s), s);
    });
    classes.forEach(c => {
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
  }, [classes, teachers]);

  // Lọc giáo viên thông minh theo môn học (cho SuperAdmin)
  const filteredTeachers = useMemo(() => {
    if (!isSuperAdmin) return teachers;
    if (selectedSubject === 'all') return teachers;
    return teachers.filter(t => t.subject && isSameSubject(t.subject, selectedSubject));
  }, [teachers, isSuperAdmin, selectedSubject]);

  // Tự động reset giáo viên khi không còn thuộc môn được chọn
  React.useEffect(() => {
    if (isSuperAdmin && selectedTeacher !== 'all') {
      const isValid = filteredTeachers.some(t => t.id === selectedTeacher || t.fullName === selectedTeacher);
      if (!isValid) {
        setSelectedTeacher('all');
      }
    }
  }, [filteredTeachers, selectedTeacher, isSuperAdmin]);

  // Filtered classes for cards view
  const filteredClasses = useMemo(() => {
    return classes.filter(c => {
      const matchSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (c.description && c.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
                          (c.teacherName && c.teacherName.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchYear = selectedYear === 'all' || c.academicYear === selectedYear;
      const matchGrade = selectedGrade === 'all' || c.grade === selectedGrade;

      // Xác định môn học thực tế của lớp:
      // 1. Lấy từ c.subject
      // 2. Tra cứu môn của Giáo viên tạo lớp (c.createdBy / c.teacherName)
      const creatorTeacher = c.createdBy ? teacherMap.get(c.createdBy) : teachers.find(t => t.fullName === c.teacherName);
      const effectiveSubject = c.subject?.trim() || creatorTeacher?.subject?.trim();

      // Lọc theo Môn học
      let matchSubject = true;
      if (selectedSubject !== 'all') {
        if (!effectiveSubject || !isSameSubject(effectiveSubject, selectedSubject)) {
          matchSubject = false;
        }
      }

      // Lọc theo Giáo viên (cho SuperAdmin)
      let matchTeacher = true;
      if (isSuperAdmin && selectedTeacher !== 'all') {
        const matchById = c.createdBy === selectedTeacher;
        const matchByName = c.teacherName === selectedTeacher;
        const teacherObj = teachers.find(t => t.id === selectedTeacher);
        const matchByTeacherObjName = teacherObj && c.teacherName === teacherObj.fullName;
        matchTeacher = Boolean(matchById || matchByName || matchByTeacherObjName);
      }

      return matchSearch && matchYear && matchGrade && matchSubject && matchTeacher;
    }).sort((a, b) => {
      if (b.academicYear !== a.academicYear) return b.academicYear.localeCompare(a.academicYear);
      if (b.grade !== a.grade) return b.grade.localeCompare(a.grade);
      return a.name.localeCompare(b.name);
    });
  }, [classes, searchQuery, selectedYear, selectedGrade, selectedSubject, selectedTeacher, teacherMap, teachers, isSuperAdmin]);

  // Count unassigned students
  const unassignedStudentsCount = useMemo(() => {
    return students.filter(s => !s.classId && !s.className).length;
  }, [students]);

  // Students belonging to the currently selected class
  const classStudents = useMemo(() => {
    if (!selectedClass) return [];
    return students.filter(s => 
      s.classId === selectedClass.id || 
      (s.className === selectedClass.name && s.academicYear === selectedClass.academicYear)
    );
  }, [students, selectedClass]);

  // Filtered students for Tab 1
  const filteredClassStudents = useMemo(() => {
    return classStudents.filter(s => {
      if (!memberSearch.trim()) return true;
      const q = memberSearch.toLowerCase();
      return s.fullName.toLowerCase().includes(q) || 
             (s.studentCode && s.studentCode.toLowerCase().includes(q)) ||
             s.username.toLowerCase().includes(q);
    });
  }, [classStudents, memberSearch]);

  // Quizzes assigned to the selected class (Explicitly assigned OR grade-wide assigned)
  const classAssignedQuizzes = useMemo(() => {
    if (!selectedClass) return [];
    return quizzes.filter(q => {
      const matchGrade = q.grade === selectedClass.grade || q.grade === 'all';
      if (!matchGrade) return false;
      
      // Class targeting rule:
      if (q.targetType === 'classes') {
        return q.assignedClassIds && q.assignedClassIds.includes(selectedClass.id);
      }
      return true; // Default target 'all' for this grade
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [quizzes, selectedClass]);

  // Quizzes filtered for Tab 2 dropdown
  const filteredClassQuizzes = useMemo(() => {
    return classAssignedQuizzes.filter(q => {
      const matchChapter = statsChapterFilter === 'all' || q.category === statsChapterFilter;
      const matchSearch = !statsQuizSearch.trim() || q.title.toLowerCase().includes(statsQuizSearch.toLowerCase());
      return matchChapter && matchSearch;
    });
  }, [classAssignedQuizzes, statsChapterFilter, statsQuizSearch]);

  // Set default selected quiz when entering Tab 2 or changing class
  const currentQuiz = useMemo(() => {
    if (filteredClassQuizzes.length === 0) return null;
    if (selectedQuizId) {
      const found = filteredClassQuizzes.find(q => q.id === selectedQuizId);
      if (found) return found;
    }
    return filteredClassQuizzes[0];
  }, [filteredClassQuizzes, selectedQuizId]);

  // Tab 2: Detailed Quiz Performance based on FIRST ATTEMPT (Lần 1)
  const quizAttemptStats = useMemo(() => {
    if (!currentQuiz || !selectedClass) {
      return {
        submittedStudents: [],
        unsubmittedStudents: [],
        scoreTiers: { gio: 0, kha: 0, dat: 0, chuaDat: 0 },
        tierPercentages: { gio: 0, kha: 0, dat: 0, chuaDat: 0 },
        top5: [],
        avgFirstScore: 0,
        highestFirstScore: 0,
        lowestFirstScore: 0
      };
    }

    const quizResults = results.filter(r => r.quizId === currentQuiz.id);
    const submittedList: Array<{
      student: User;
      firstAttempt: Result;
      bestScore: number;
      totalAttempts: number;
    }> = [];
    const unsubmittedList: User[] = [];

    classStudents.forEach(student => {
      const studentResults = quizResults.filter(r => 
        r.studentId === student.id || 
        (student.studentCode && r.studentCode && r.studentCode.trim().toUpperCase() === student.studentCode.trim().toUpperCase())
      );

      if (studentResults.length > 0) {
        // Sort by date ascending to get FIRST attempt
        const sorted = [...studentResults].sort((a, b) => 
          new Date(a.submittedAt || 0).getTime() - new Date(b.submittedAt || 0).getTime()
        );
        const firstAttempt = sorted[0];
        const bestScore = studentResults.reduce((max, r) => Math.max(max, r.score), 0);

        submittedList.push({
          student,
          firstAttempt,
          bestScore,
          totalAttempts: studentResults.length
        });
      } else {
        unsubmittedList.push(student);
      }
    });

    // Calculate score tiers on FIRST attempt
    let gio = 0, kha = 0, dat = 0, chuaDat = 0;
    let totalScore = 0;
    let highest = 0;
    let lowest = submittedList.length > 0 ? 10 : 0;

    submittedList.forEach(item => {
      const score = item.firstAttempt.score;
      totalScore += score;
      if (score > highest) highest = score;
      if (score < lowest) lowest = score;

      if (score >= 8.0) gio++;
      else if (score >= 7.0) kha++;
      else if (score >= 5.0) dat++;
      else chuaDat++;
    });

    const totalSub = submittedList.length;
    const tierPercentages = {
      gio: totalSub > 0 ? (gio / totalSub) * 100 : 0,
      kha: totalSub > 0 ? (kha / totalSub) * 100 : 0,
      dat: totalSub > 0 ? (dat / totalSub) * 100 : 0,
      chuaDat: totalSub > 0 ? (chuaDat / totalSub) * 100 : 0
    };

    // Sort submittedList by first attempt score desc, then duration asc to get TOP 5
    const sortedForTop5 = [...submittedList].sort((a, b) => {
      if (b.firstAttempt.score !== a.firstAttempt.score) {
        return b.firstAttempt.score - a.firstAttempt.score;
      }
      return (a.firstAttempt.durationSeconds || 0) - (b.firstAttempt.durationSeconds || 0);
    });

    return {
      submittedStudents: submittedList,
      unsubmittedStudents: unsubmittedList,
      scoreTiers: { gio, kha, dat, chuaDat },
      tierPercentages,
      top5: sortedForTop5.slice(0, 5),
      avgFirstScore: totalSub > 0 ? totalScore / totalSub : 0,
      highestFirstScore: highest,
      lowestFirstScore: totalSub > 0 ? lowest : 0
    };
  }, [currentQuiz, selectedClass, classStudents, results]);

  // Tab 3: Helper to calculate student progress statistics & automated feedback
  const getStudentTrainingData = (student: User) => {
    const studentResults = results.filter(r => 
      r.studentId === student.id || 
      (student.studentCode && r.studentCode && r.studentCode.trim().toUpperCase() === student.studentCode.trim().toUpperCase())
    );

    const totalSeconds = studentResults.reduce((acc, r) => acc + (r.durationSeconds || 0), 0);
    const effortPoints = totalSeconds / 2700; // 45 mins = 1 effort point

    const bonusPoints = studentResults.reduce((acc, r) => {
      const bp = (r as any).bonusPoint;
      if (bp !== undefined && bp !== null) return acc + Number(bp);
      if (r.score >= 8) return acc + 1;
      return acc;
    }, 0);

    const accumulatedPoints = effortPoints + bonusPoints;

    // Completed quizzes vs Assigned quizzes
    const completedQuizIds = new Set(studentResults.map(r => r.quizId));
    const completedQuizzesCount = classAssignedQuizzes.filter(q => completedQuizIds.has(q.id)).length;
    const totalAssignedCount = classAssignedQuizzes.length;
    const completionRate = totalAssignedCount > 0 ? (completedQuizzesCount / totalAssignedCount) * 100 : 0;

    // Average score across quizzes
    const avgScore = studentResults.length > 0 
      ? studentResults.reduce((acc, r) => acc + r.score, 0) / studentResults.length 
      : 0;

    // Progression analysis (compare older results with recent results)
    const sortedChronological = [...studentResults].sort((a, b) => 
      new Date(a.submittedAt || 0).getTime() - new Date(b.submittedAt || 0).getTime()
    );

    let progressStatus: 'excellent' | 'steady' | 'needs_effort' | 'new' = 'new';
    let progressFeedback = '';
    const recommendedChapters: string[] = [];

    if (sortedChronological.length >= 3) {
      const firstHalf = sortedChronological.slice(0, Math.floor(sortedChronological.length / 2));
      const secondHalf = sortedChronological.slice(Math.floor(sortedChronological.length / 2));

      const firstAvg = firstHalf.reduce((acc, r) => acc + r.score, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((acc, r) => acc + r.score, 0) / secondHalf.length;

      // Identify low scoring chapters
      sortedChronological.filter(r => r.score < 6.5).forEach(r => {
        const foundQ = quizzes.find(q => q.id === r.quizId);
        if (foundQ && foundQ.category && !recommendedChapters.includes(foundQ.category)) {
          recommendedChapters.push(foundQ.category);
        }
      });

      if (secondAvg - firstAvg >= 1.0 || (secondAvg >= 8.5 && totalSeconds > 7200)) {
        progressStatus = 'excellent';
        progressFeedback = `Học sinh có tiến bộ vượt bậc! Điểm trung bình các bài gần đây đạt ${secondAvg.toFixed(1)}đ (tăng ${(secondAvg - firstAvg).toFixed(1)}đ so với giai đoạn đầu). Ý thức tự học và rèn luyện rất tích cực.`;
      } else if (secondAvg >= firstAvg || secondAvg >= 7.0) {
        progressStatus = 'steady';
        progressFeedback = `Học sinh duy trì phong độ học tập ổn định (Điểm trung bình ${secondAvg.toFixed(1)}đ). Cần tiếp tục phát huy và luyện tập thêm các câu hỏi phân hóa.`;
      } else {
        progressStatus = 'needs_effort';
        progressFeedback = `Chưa có sự tiến bộ rõ rệt (Điểm trung bình ${secondAvg.toFixed(1)}đ). Học sinh cần tăng thời lượng rèn luyện và chú ý làm lại các bài thi chưa đạt.`;
      }
    } else if (sortedChronological.length > 0) {
      if (avgScore >= 8.0) {
        progressStatus = 'excellent';
        progressFeedback = `Kết quả ban đầu rất khả quan (Điểm TB ${avgScore.toFixed(1)}đ). Cần duy trì giải đều các đề mới được giao.`;
      } else {
        progressStatus = 'needs_effort';
        progressFeedback = `Mới hoàn thành ${studentResults.length} bài thi. Cần rèn luyện thêm nhiều đề để hệ thống có đủ dữ liệu đánh giá tiến bộ.`;
      }
    } else {
      progressFeedback = 'Chưa tham gia làm bài thi nào. Cần đôn đốc học sinh đăng nhập và làm các đề thi được giao.';
    }

    return {
      totalSeconds,
      accumulatedPoints,
      effortPoints,
      bonusPoints,
      completedQuizzesCount,
      totalAssignedCount,
      completionRate,
      avgScore,
      progressStatus,
      progressFeedback,
      recommendedChapters,
      studentResults,
      uncompletedQuizzes: classAssignedQuizzes.filter(q => !completedQuizIds.has(q.id))
    };
  };

  // Helper time formatter
  const formatStudyTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  // Helper date formatter
  const formatDateStr = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    try {
      return format(new Date(dateStr), 'HH:mm dd/MM/yyyy');
    } catch {
      return dateStr;
    }
  };

  // Open Create Class Modal
  const handleOpenCreate = () => {
    setEditingClass(null);
    const currentYear = new Date().getFullYear();
    const defaultSubject = !isSuperAdmin
      ? (currentUser?.subject || '')
      : (selectedSubject !== 'all' ? selectedSubject : '');

    setClassForm({
      name: '',
      academicYear: selectedYear !== 'all' ? selectedYear : `${currentYear}-${currentYear + 1}`,
      grade: selectedGrade !== 'all' ? selectedGrade : '12',
      subject: defaultSubject,
      description: '',
      isSharedWithTeachers: false
    });
    setIsClassModalOpen(true);
  };

  // Open Edit Class Modal
  const handleOpenEdit = (c: ClassRoom, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingClass(c);
    const creatorTeacher = c.createdBy ? teacherMap.get(c.createdBy) : teachers.find(t => t.fullName === c.teacherName);
    const initialSubject = c.subject || (!isSuperAdmin ? currentUser?.subject : creatorTeacher?.subject) || '';

    setClassForm({
      name: c.name,
      academicYear: c.academicYear,
      grade: c.grade,
      subject: initialSubject,
      description: c.description || '',
      isSharedWithTeachers: Boolean(c.isSharedWithTeachers)
    });
    setIsClassModalOpen(true);
  };

  // Save Class
  const handleSaveClass = async () => {
    if (!classForm.name.trim()) {
      alert("Vui lòng nhập tên lớp (Ví dụ: 12A1, 11A2, 10A1...)");
      return;
    }
    if (!classForm.academicYear.trim()) {
      alert("Vui lòng nhập niên khóa (Ví dụ: 2025-2026)");
      return;
    }

    setIsSaving(true);
    try {
      const classId = editingClass ? editingClass.id : `class_${classForm.name.trim().replace(/\s+/g, '')}_${classForm.academicYear.trim().replace(/[^a-zA-Z0-9]/g, '')}_${uuidv4().slice(0, 6)}`;
      
      const subjectToSave = !isSuperAdmin 
        ? (currentUser?.subject?.trim() || classForm.subject.trim() || undefined)
        : (classForm.subject.trim() || undefined);

      const saved: ClassRoom = {
        id: classId,
        name: classForm.name.trim().toUpperCase(),
        academicYear: classForm.academicYear.trim(),
        grade: classForm.grade,
        subject: subjectToSave,
        description: classForm.description.trim(),
        createdAt: editingClass?.createdAt || new Date().toISOString(),
        createdBy: editingClass?.createdBy || currentUser?.id || '',
        teacherName: editingClass?.teacherName || currentUser?.fullName || '',
        isSharedWithTeachers: classForm.isSharedWithTeachers
      };
      await onSaveClass(saved);
      setIsClassModalOpen(false);
      if (selectedClass && selectedClass.id === saved.id) {
        setSelectedClass(saved);
      }
    } catch (e) {
      alert("Lỗi lưu lớp học. Vui lòng thử lại.");
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Class
  const handleDeleteClass = async (c: ClassRoom, e: React.MouseEvent) => {
    e.stopPropagation();
    const count = students.filter(s => s.classId === c.id || (s.className === c.name && s.academicYear === c.academicYear)).length;
    const msg = count > 0 
      ? `Lớp "${c.name} (${c.academicYear})" hiện có ${count} học sinh.\nNếu xóa lớp, các học sinh sẽ trở về trạng thái "Chưa phân lớp" (tài khoản và điểm rèn luyện vẫn giữ nguyên).\nBạn có chắc chắn muốn xóa?`
      : `Bạn có chắc chắn muốn xóa lớp "${c.name} (${c.academicYear})"?`;
    
    if (confirm(msg)) {
      await onDeleteClass(c.id, `${c.name} (${c.academicYear})`);
      if (selectedClass?.id === c.id) {
        setSelectedClass(null);
      }
    }
  };

  // Assign students into current class
  const handleConfirmAddStudents = async () => {
    if (!selectedClass || selectedStudentIdsToAdd.length === 0) return;
    setIsAssigning(true);
    try {
      await onAssignStudents(selectedStudentIdsToAdd, {
        classId: selectedClass.id,
        className: selectedClass.name,
        academicYear: selectedClass.academicYear,
        grade: selectedClass.grade
      });
      setIsAddStudentModalOpen(false);
      setSelectedStudentIdsToAdd([]);
    } catch (e) {
      alert("Lỗi gán học sinh vào lớp.");
    } finally {
      setIsAssigning(false);
    }
  };

  // Remove single student from class
  const handleRemoveStudentFromClass = async (studentId: string, studentName: string) => {
    if (confirm(`Gỡ học sinh "${studentName}" khỏi lớp ${selectedClass?.name}? (Tài khoản và điểm số không bị mất)`)) {
      await onAssignStudents([studentId], null);
    }
  };

  // Remove multiple selected students from class
  const handleBatchRemoveStudents = async () => {
    if (selectedMemberIds.length === 0) return;
    if (confirm(`Bạn có chắc chắn muốn gỡ ${selectedMemberIds.length} học sinh đã chọn khỏi lớp ${selectedClass?.name}?`)) {
      setIsAssigning(true);
      try {
        await onAssignStudents(selectedMemberIds, null);
        setSelectedMemberIds([]);
      } catch (e) {
        alert("Lỗi gỡ học sinh khỏi lớp.");
      } finally {
        setIsAssigning(false);
      }
    }
  };

  // Promote / Transfer students across academic years / classes
  const handleConfirmPromote = async () => {
    if (!promoteTargetClassId) {
      alert("Vui lòng chọn lớp đích để chuyển tới!");
      return;
    }
    const target = classes.find(c => c.id === promoteTargetClassId);
    if (!target) return;

    if (selectedStudentIdsToPromote.length === 0) {
      alert("Vui lòng chọn ít nhất 1 học sinh để chuyển lớp!");
      return;
    }

    setIsAssigning(true);
    try {
      await onAssignStudents(selectedStudentIdsToPromote, {
        classId: target.id,
        className: target.name,
        academicYear: target.academicYear,
        grade: target.grade
      });
      alert(`Đã chuyển thành công ${selectedStudentIdsToPromote.length} học sinh sang lớp ${target.name} (${target.academicYear})!`);
      setIsPromoteModalOpen(false);
      setSelectedStudentIdsToPromote([]);
    } catch (e) {
      alert("Lỗi khi chuyển lớp.");
    } finally {
      setIsAssigning(false);
    }
  };

  // Copy unsubmitted student names to clipboard for teacher announcement
  const handleCopyUnsubmitted = () => {
    if (quizAttemptStats.unsubmittedStudents.length === 0) return;
    const text = `DANH SÁCH HỌC SINH LỚP ${selectedClass?.name} CHƯA LÀM ĐỀ "${currentQuiz?.title}":\n` + 
      quizAttemptStats.unsubmittedStudents.map((s, idx) => `${idx + 1}. ${s.fullName} (${s.studentCode || 'N/A'})`).join('\n') +
      `\n\nNhắc nhở: Các em vui lòng đăng nhập vào hệ thống để hoàn thành bài thi trước hạn chót!`;
    navigator.clipboard.writeText(text);
    setCopiedUnsubmitted(true);
    setTimeout(() => setCopiedUnsubmitted(false), 3000);
  };

  // Available students to add into this class
  const availableStudentsToAdd = useMemo(() => {
    if (!selectedClass) return [];
    return students.filter(s => {
      const isAlreadyInThisClass = s.classId === selectedClass.id || 
        (s.className === selectedClass.name && s.academicYear === selectedClass.academicYear);
      if (isAlreadyInThisClass) return false;

      if (!studentSearch.trim()) return true;
      const q = studentSearch.toLowerCase();
      return s.fullName.toLowerCase().includes(q) || 
             (s.studentCode && s.studentCode.toLowerCase().includes(q)) ||
             (s.className && s.className.toLowerCase().includes(q));
    });
  }, [students, selectedClass, studentSearch]);

  return (
    <div className="space-y-6 animate-fade-in">
      {!selectedClass ? (
        // ==========================================
        // VIEW 1: COMPACT CLASS CARDS LIST
        // ==========================================
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-3xl shadow-lg relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-3 relative z-10">
              <div className="p-3 bg-indigo-600/40 border border-indigo-400/30 rounded-2xl">
                <GraduationCap size={24} className="text-indigo-300" />
              </div>
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight">Danh Sách Lớp Học & Niên Khóa</h2>
                <p className="text-slate-400 text-xs font-medium">
                  Quản lý học viên, giao đề thi phân hóa & theo dõi kết quả rèn luyện từng lớp
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap relative z-10">
              <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 text-center">
                <span className="text-[9px] font-black text-indigo-300 uppercase block">Tổng số lớp</span>
                <span className="text-base font-black text-white">{classes.length}</span>
              </div>
              <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 text-center">
                <span className="text-[9px] font-black text-emerald-300 uppercase block">Đã vào lớp</span>
                <span className="text-base font-black text-emerald-400">{students.length - unassignedStudentsCount} HS</span>
              </div>
              <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 text-center">
                <span className="text-[9px] font-black text-amber-300 uppercase block">Chưa phân lớp</span>
                <span className="text-base font-black text-amber-400">{unassignedStudentsCount} HS</span>
              </div>
              <button
                onClick={handleOpenCreate}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase hover:bg-indigo-500 shadow-md transition-all active:scale-95"
              >
                <Plus size={16} /> THÊM LỚP MỚI
              </button>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-col md:flex-row gap-3 items-center bg-white p-4 rounded-2xl border shadow-sm">
            <div className="flex-1 w-full relative">
              <input
                className="w-full py-2.5 px-4 bg-slate-50 border rounded-xl outline-none text-xs font-bold pl-10"
                placeholder="Tìm tên lớp hoặc ghi chú..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            </div>

            <div className="flex gap-2 w-full md:w-auto flex-wrap">
              <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1 rounded-xl border">
                <Calendar size={13} className="text-slate-400" />
                <select
                  className="bg-transparent py-1.5 text-[10px] font-black uppercase outline-none"
                  value={selectedYear}
                  onChange={e => setSelectedYear(e.target.value)}
                >
                  <option value="all">TẤT CẢ NIÊN KHÓA</option>
                  {academicYears.map(yr => (
                    <option key={yr} value={yr}>NIÊN KHÓA {yr}</option>
                  ))}
                </select>
              </div>

              <select
                className="px-3 py-2 bg-white border rounded-xl text-[10px] font-black uppercase outline-none"
                value={selectedGrade}
                onChange={e => setSelectedGrade(e.target.value as any)}
              >
                <option value="all">TẤT CẢ KHỐI</option>
                <option value="12">KHỐI 12</option>
                <option value="11">KHỐI 11</option>
                <option value="10">KHỐI 10</option>
              </select>

              {/* Lọc theo Môn học (Dành riêng cho SuperAdmin) */}
              {isSuperAdmin && (
                <div className="flex items-center gap-1.5 bg-purple-50 px-3 py-1 rounded-xl border border-purple-200 shadow-xs">
                  <BookOpen size={13} className="text-purple-600 shrink-0" />
                  <select
                    className="bg-transparent py-1.5 text-[10px] font-black text-purple-900 uppercase outline-none cursor-pointer"
                    value={selectedSubject}
                    onChange={e => setSelectedSubject(e.target.value)}
                  >
                    <option value="all">TẤT CẢ MÔN (SUPERADMIN)</option>
                    {availableSubjects.map(sub => (
                      <option key={sub} value={sub}>MÔN {sub.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Lọc theo Giáo viên (Dành riêng cho SuperAdmin, tự động lọc theo Môn học) */}
              {isSuperAdmin && filteredTeachers.length > 0 && (
                <div className="flex items-center gap-1.5 bg-amber-50 px-3 py-1 rounded-xl border border-amber-200 shadow-xs">
                  <select
                    className="bg-transparent py-1.5 text-[10px] font-black text-amber-900 uppercase outline-none cursor-pointer"
                    value={selectedTeacher}
                    onChange={e => setSelectedTeacher(e.target.value)}
                  >
                    <option value="all">👤 TẤT CẢ GIÁO VIÊN ({filteredTeachers.length})</option>
                    {filteredTeachers.map(t => (
                      <option key={t.id} value={t.id}>
                        GV: {t.fullName} {t.subject ? `(${t.subject})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Compact Class Cards Grid */}
          {filteredClasses.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
              {filteredClasses.map(c => {
                const count = students.filter(s => 
                  s.classId === c.id || 
                  (s.className === c.name && s.academicYear === c.academicYear)
                ).length;

                const creatorTeacher = c.createdBy ? teacherMap.get(c.createdBy) : teachers.find(t => t.fullName === c.teacherName);
                const effSubject = c.subject || creatorTeacher?.subject;

                return (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedClass(c);
                      setActiveTab('students');
                    }}
                    className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs hover:shadow-md hover:border-indigo-400 transition-all flex flex-col justify-between group cursor-pointer relative overflow-hidden"
                  >
                    <div>
                      {/* Top Badges & Actions */}
                      <div className="flex justify-between items-center mb-2.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 font-black rounded-md text-[8px] uppercase border border-indigo-100">
                            Khối {c.grade}
                          </span>
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 font-bold rounded-md text-[8px]">
                            {c.academicYear}
                          </span>
                          {effSubject && (
                            <span className="px-2 py-0.5 bg-purple-50 text-purple-700 font-black rounded-md text-[8px] uppercase border border-purple-100 flex items-center gap-0.5">
                              <BookOpen size={9} className="text-purple-600" />
                              {getDisplaySubject(effSubject)}
                            </span>
                          )}
                          {c.isSharedWithTeachers && (
                            <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 font-black rounded-md text-[8px] uppercase border border-emerald-100">
                              Dùng chung
                            </span>
                          )}
                          {(creatorTeacher?.fullName || c.teacherName) && (isSuperAdmin || c.createdBy !== currentUser?.id) && (
                            <span className="px-1.5 py-0.5 bg-amber-50 text-amber-800 font-bold rounded-md text-[8px] border border-amber-200 truncate max-w-[120px]" title={`GV: ${creatorTeacher?.fullName || c.teacherName}`}>
                              GV: {creatorTeacher?.fullName || c.teacherName}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => handleOpenEdit(c, e)}
                            className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                            title="Sửa lớp"
                          >
                            <Edit3 size={13} />
                          </button>
                          <button
                            onClick={(e) => handleDeleteClass(c, e)}
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                            title="Xóa lớp"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Class Title */}
                      <h3 className="font-black text-base text-slate-900 uppercase tracking-tight group-hover:text-indigo-600 transition-colors">
                        {c.name}
                      </h3>

                      {/* Short Description */}
                      <p className="text-[11px] text-slate-500 font-medium line-clamp-1 mt-0.5 mb-3">
                        {c.description || "Chưa có ghi chú phân loại"}
                      </p>
                    </div>

                    {/* Footer Info */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-1 text-slate-600">
                        <Users size={13} className="text-indigo-500" />
                        <span className="text-[11px] font-black text-slate-700">{count} HS</span>
                      </div>
                      <span className="text-[10px] font-black text-indigo-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                        Xem lớp <ChevronRight size={12} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-16 text-center bg-white rounded-2xl border border-dashed p-8 space-y-3">
              <GraduationCap size={32} className="text-indigo-400 mx-auto" />
              <h3 className="text-sm font-black text-slate-800 uppercase">Chưa tìm thấy lớp học nào</h3>
              <p className="text-xs text-slate-400 font-medium max-w-sm mx-auto">
                Bấm nút &quot;Thêm lớp mới&quot; để tạo lớp học theo khối và niên khóa.
              </p>
              <button
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase hover:bg-indigo-700 shadow-md"
              >
                <Plus size={14} /> TẠO LỚP ĐẦU TIÊN
              </button>
            </div>
          )}
        </div>
      ) : (
        // ==========================================
        // VIEW 2: MULTI-TAB CLASS DETAIL SCREEN
        // ==========================================
        <div className="space-y-6">
          {/* Header of Selected Class */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-5">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectedClass(null)}
                  className="p-2.5 bg-slate-100 hover:bg-slate-900 hover:text-white text-slate-600 rounded-xl transition-all"
                  title="Quay lại danh sách thẻ lớp"
                >
                  <ArrowLeft size={18} />
                </button>
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                      Lớp {selectedClass.name}
                    </h2>
                    <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 font-black rounded-lg text-[10px] uppercase border border-indigo-100">
                      Khối {selectedClass.grade}
                    </span>
                    <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 font-bold rounded-lg text-[10px]">
                      Niên khóa: {selectedClass.academicYear}
                    </span>
                    {selectedClass.subject && (
                      <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 font-black rounded-lg text-[10px] uppercase border border-blue-100">
                        Môn {getDisplaySubject(selectedClass.subject)}
                      </span>
                    )}
                    <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 font-black rounded-lg text-[10px] flex items-center gap-1">
                      <Users size={11} /> {classStudents.length} học sinh
                    </span>
                  </div>
                  {selectedClass.description && (
                    <p className="text-xs text-slate-500 font-medium mt-1">
                      {selectedClass.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl w-full md:w-auto">
                <button
                  onClick={() => setActiveTab('students')}
                  className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${activeTab === 'students' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                >
                  <Users size={14} /> Danh sách HS
                </button>
                <button
                  onClick={() => setActiveTab('stats')}
                  className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${activeTab === 'stats' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                >
                  <BarChart3 size={14} /> Thống kê đề thi
                </button>
                <button
                  onClick={() => setActiveTab('progress')}
                  className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${activeTab === 'progress' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                >
                  <Award size={14} /> Kết quả rèn luyện
                </button>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* TAB 1: DANH SÁCH & GÁN HỌC SINH (Members & Batch Promotion/Progression)    */}
          {/* ========================================================================= */}
          {activeTab === 'students' && (
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-5 animate-fade-in">
              {/* Action Toolbar */}
              <div className="flex flex-col md:flex-row justify-between items-center gap-3">
                <div className="w-full md:w-80 relative">
                  <input
                    className="w-full py-2.5 px-4 bg-slate-50 border rounded-xl outline-none text-xs font-bold pl-9"
                    placeholder="Tìm học sinh theo tên hoặc MAHS..."
                    value={memberSearch}
                    onChange={e => setMemberSearch(e.target.value)}
                  />
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
                  {selectedMemberIds.length > 0 && (
                    <button
                      onClick={handleBatchRemoveStudents}
                      className="flex items-center gap-1.5 px-4 py-2.5 bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-black uppercase hover:bg-red-600 hover:text-white transition-all shadow-sm"
                    >
                      <UserMinus size={14} /> Gỡ {selectedMemberIds.length} HS đã chọn
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setSelectedStudentIdsToPromote(classStudents.map(s => s.id));
                      setIsPromoteModalOpen(true);
                    }}
                    disabled={classStudents.length === 0}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-amber-500 text-white rounded-xl text-xs font-black uppercase hover:bg-amber-600 shadow-md disabled:opacity-50 transition-all"
                  >
                    <ArrowUpRight size={15} /> Chuyển Niên Khóa / Lên Lớp
                  </button>

                  <button
                    onClick={() => {
                      setSelectedStudentIdsToAdd([]);
                      setIsAddStudentModalOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase hover:bg-indigo-700 shadow-md transition-all"
                  >
                    <UserPlus size={15} /> Thêm học sinh vào lớp
                  </button>
                </div>
              </div>

              {/* Members Table */}
              {filteredClassStudents.length > 0 ? (
                <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b text-[10px] font-black uppercase tracking-wider text-slate-400">
                        <th className="p-3.5 w-10 text-center">
                          <input
                            type="checkbox"
                            className="w-3.5 h-3.5 rounded text-indigo-600"
                            checked={selectedMemberIds.length > 0 && selectedMemberIds.length === filteredClassStudents.length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedMemberIds(filteredClassStudents.map(s => s.id));
                              } else {
                                setSelectedMemberIds([]);
                              }
                            }}
                          />
                        </th>
                        <th className="p-3.5 w-12 text-center">STT</th>
                        <th className="p-3.5">Họ và tên</th>
                        <th className="p-3.5 text-center">Mã số (MAHS)</th>
                        <th className="p-3.5 text-center">Khối</th>
                        <th className="p-3.5 text-center">Tài khoản</th>
                        <th className="p-3.5 text-center">Điểm tích lũy</th>
                        <th className="p-3.5 text-center">Tổng TG rèn</th>
                        <th className="p-3.5 text-center">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredClassStudents.map((s, idx) => {
                        const training = getStudentTrainingData(s);
                        const isSelected = selectedMemberIds.includes(s.id);

                        return (
                          <tr key={s.id} className={`hover:bg-slate-50 transition-colors ${isSelected ? 'bg-indigo-50/40' : ''}`}>
                            <td className="p-3.5 text-center">
                              <input
                                type="checkbox"
                                className="w-3.5 h-3.5 rounded text-indigo-600"
                                checked={isSelected}
                                onChange={() => {
                                  setSelectedMemberIds(prev => 
                                    prev.includes(s.id) ? prev.filter(id => id !== s.id) : [...prev, s.id]
                                  );
                                }}
                              />
                            </td>
                            <td className="p-3.5 text-center font-bold text-slate-400">
                              {idx + 1}
                            </td>
                            <td className="p-3.5 font-black text-slate-800 uppercase">
                              {s.fullName}
                            </td>
                            <td className="p-3.5 text-center">
                              <span className="font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md text-[11px]">
                                {s.studentCode || 'N/A'}
                              </span>
                            </td>
                            <td className="p-3.5 text-center text-slate-500 font-bold">
                              Khối {s.grade || selectedClass.grade}
                            </td>
                            <td className="p-3.5 text-center font-mono text-slate-500 text-[11px]">
                              {s.username}
                            </td>
                            <td className="p-3.5 text-center">
                              <span className="font-black text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-md text-[11px]">
                                ⭐ {training.accumulatedPoints.toFixed(2)}
                              </span>
                            </td>
                            <td className="p-3.5 text-center font-bold text-slate-600 text-[11px]">
                              {formatStudyTime(training.totalSeconds)}
                            </td>
                            <td className="p-3.5 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => setInspectingStudent(s)}
                                  className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                  title="Xem kết quả rèn luyện cá nhân"
                                >
                                  <Award size={15} />
                                </button>
                                <button
                                  onClick={() => handleRemoveStudentFromClass(s.id, s.fullName)}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Gỡ khỏi lớp"
                                >
                                  <UserMinus size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-12 text-center bg-slate-50 rounded-2xl border border-dashed space-y-3">
                  <Users size={28} className="text-slate-300 mx-auto" />
                  <p className="text-xs font-black text-slate-500 uppercase">
                    {memberSearch ? "Không tìm thấy học sinh phù hợp" : "Lớp chưa có học sinh nào"}
                  </p>
                  <button
                    onClick={() => {
                      setSelectedStudentIdsToAdd([]);
                      setIsAddStudentModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase hover:bg-indigo-700"
                  >
                    <UserPlus size={14} /> Thêm học sinh ngay
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: THỐNG KÊ (3 PHẦN: Lọc -> Biểu đồ Điểm Lần 1 -> Đã/Chưa làm)       */}
          {/* ========================================================================= */}
          {activeTab === 'stats' && (
            <div className="space-y-6 animate-fade-in">
              {/* PHẦN 1: BỘ LỌC ĐỀ THI ĐƯỢC PHÂN CHO LỚP */}
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <Filter size={15} className="text-indigo-600" />
                    1. Chọn Đề Thi Cần Thống Kê ({classAssignedQuizzes.length} đề được phân cho lớp)
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {/* Filter Chapter */}
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                      Lọc theo chương:
                    </label>
                    <select
                      className="w-full py-2 px-3 bg-slate-50 border rounded-xl text-xs font-black uppercase outline-none"
                      value={statsChapterFilter}
                      onChange={e => setStatsChapterFilter(e.target.value)}
                    >
                      <option value="all">TẤT CẢ CHƯƠNG</option>
                      {chapters
                        .filter(c => {
                          const matchGrade = String(c.grade) === String(selectedClass.grade) || c.grade === 'all';
                          if (!matchGrade) return false;
                          if (selectedClass.subject && c.subject && !isSameSubject(c.subject, selectedClass.subject)) return false;
                          if (!isSuperAdmin && currentUser?.subject && c.subject && !isSameSubject(c.subject, currentUser.subject)) return false;
                          return true;
                        })
                        .map(c => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                    </select>
                  </div>

                  {/* Search Quiz Title */}
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                      Tìm kiếm tên đề:
                    </label>
                    <input
                      className="w-full py-2 px-3 bg-slate-50 border rounded-xl text-xs font-bold outline-none"
                      placeholder="Gõ tên đề..."
                      value={statsQuizSearch}
                      onChange={e => setStatsQuizSearch(e.target.value)}
                    />
                  </div>

                  {/* Select Target Quiz */}
                  <div>
                    <label className="text-[10px] font-black uppercase text-indigo-600 block mb-1">
                      Chọn đề thi:
                    </label>
                    <select
                      className="w-full py-2 px-3 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-xl text-xs font-black uppercase outline-none"
                      value={currentQuiz?.id || ''}
                      onChange={e => setSelectedQuizId(e.target.value)}
                    >
                      {filteredClassQuizzes.map(q => (
                        <option key={q.id} value={q.id}>
                          {q.title} ({q.type === 'test' ? 'Đề thi' : 'Luyện tập'} - {q.questions?.length || 0} câu)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {currentQuiz ? (
                <>
                  {/* PHẦN 2: THỐNG KÊ BIỂU ĐỒ ĐIỂM LẦN 1 & TOP 5 */}
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 border-b pb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                            <BarChart3 size={16} />
                          </span>
                          <h3 className="text-sm font-black uppercase text-slate-900">
                            2. Thống Kê Phổ Điểm (Căn Cứ Trên Điểm Lần 1 - First Attempt)
                          </h3>
                        </div>
                        <p className="text-xs text-slate-400 font-bold mt-1">
                          Đề thi: <span className="text-indigo-600 font-black">{currentQuiz.title}</span> • Thời lượng: {currentQuiz.durationMinutes} phút
                        </p>
                      </div>

                      {/* Summary Metrics */}
                      <div className="flex items-center gap-2 text-xs">
                        <div className="bg-slate-50 border px-3 py-1.5 rounded-xl text-center">
                          <span className="text-[9px] font-black text-slate-400 uppercase block">Điểm TB Lần 1</span>
                          <span className="font-black text-slate-900">{quizAttemptStats.avgFirstScore.toFixed(1)}đ</span>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-xl text-center">
                          <span className="text-[9px] font-black text-emerald-600 uppercase block">Cao nhất</span>
                          <span className="font-black text-emerald-700">{quizAttemptStats.highestFirstScore.toFixed(1)}đ</span>
                        </div>
                        <div className="bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl text-center">
                          <span className="text-[9px] font-black text-rose-600 uppercase block">Thấp nhất</span>
                          <span className="font-black text-rose-700">{quizAttemptStats.lowestFirstScore.toFixed(1)}đ</span>
                        </div>
                      </div>
                    </div>

                    {/* Chart & Distribution */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Visual Bar Distribution */}
                      <div className="space-y-3.5 bg-slate-50 p-5 rounded-2xl border">
                        <h4 className="text-[11px] font-black uppercase text-slate-600 tracking-wide">
                          Phân loại kết quả Lần 1 ({quizAttemptStats.submittedStudents.length} học sinh đã nộp bài)
                        </h4>

                        {/* GIỎI >= 8.0 */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs font-bold">
                            <span className="text-emerald-700 font-black flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                              Giỏi (Điểm &gt;= 8.0)
                            </span>
                            <span className="text-slate-700 font-black">
                              {quizAttemptStats.scoreTiers.gio} HS ({quizAttemptStats.tierPercentages.gio.toFixed(1)}%)
                            </span>
                          </div>
                          <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden">
                            <div 
                              className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
                              style={{ width: `${quizAttemptStats.tierPercentages.gio}%` }}
                            />
                          </div>
                        </div>

                        {/* KHÁ >= 7.0 & < 8.0 */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs font-bold">
                            <span className="text-blue-700 font-black flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span>
                              Khá (Điểm &gt;= 7.0)
                            </span>
                            <span className="text-slate-700 font-black">
                              {quizAttemptStats.scoreTiers.kha} HS ({quizAttemptStats.tierPercentages.kha.toFixed(1)}%)
                            </span>
                          </div>
                          <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden">
                            <div 
                              className="bg-blue-500 h-full rounded-full transition-all duration-500" 
                              style={{ width: `${quizAttemptStats.tierPercentages.kha}%` }}
                            />
                          </div>
                        </div>

                        {/* ĐẠT >= 5.0 & < 7.0 */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs font-bold">
                            <span className="text-amber-700 font-black flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
                              Đạt (Điểm &gt;= 5.0)
                            </span>
                            <span className="text-slate-700 font-black">
                              {quizAttemptStats.scoreTiers.dat} HS ({quizAttemptStats.tierPercentages.dat.toFixed(1)}%)
                            </span>
                          </div>
                          <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden">
                            <div 
                              className="bg-amber-500 h-full rounded-full transition-all duration-500" 
                              style={{ width: `${quizAttemptStats.tierPercentages.dat}%` }}
                            />
                          </div>
                        </div>

                        {/* CHƯA ĐẠT < 5.0 */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs font-bold">
                            <span className="text-rose-700 font-black flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
                              Chưa Đạt (Điểm &lt; 5.0)
                            </span>
                            <span className="text-slate-700 font-black">
                              {quizAttemptStats.scoreTiers.chuaDat} HS ({quizAttemptStats.tierPercentages.chuaDat.toFixed(1)}%)
                            </span>
                          </div>
                          <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden">
                            <div 
                              className="bg-rose-500 h-full rounded-full transition-all duration-500" 
                              style={{ width: `${quizAttemptStats.tierPercentages.chuaDat}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Top 5 First-Attempt Leaderboard */}
                      <div className="bg-slate-50 p-5 rounded-2xl border space-y-3">
                        <div className="flex items-center gap-2 text-yellow-600">
                          <Star size={16} className="fill-yellow-500 text-yellow-500" />
                          <h4 className="text-[11px] font-black uppercase tracking-wide text-slate-800">
                            Top 5 Học Sinh Điểm Lần 1 Cao Nhất
                          </h4>
                        </div>

                        {quizAttemptStats.top5.length > 0 ? (
                          <div className="space-y-2">
                            {quizAttemptStats.top5.map((item, rank) => {
                              const rankColors = [
                                'bg-yellow-100 text-yellow-800 border-yellow-300 font-black',
                                'bg-slate-200 text-slate-700 border-slate-300 font-black',
                                'bg-amber-100 text-amber-800 border-amber-300 font-black',
                                'bg-slate-100 text-slate-600 border-slate-200',
                                'bg-slate-100 text-slate-600 border-slate-200'
                              ];

                              return (
                                <div
                                  key={item.student.id}
                                  className="bg-white p-2.5 rounded-xl border flex items-center justify-between text-xs"
                                >
                                  <div className="flex items-center gap-2.5">
                                    <span className={`w-6 h-6 rounded-lg border flex items-center justify-center text-[11px] ${rankColors[rank]}`}>
                                      #{rank + 1}
                                    </span>
                                    <div>
                                      <p className="font-black text-slate-800 uppercase text-xs leading-tight">
                                        {item.student.fullName}
                                      </p>
                                      <p className="text-[10px] text-slate-400 font-medium">
                                        Mã: <span className="font-mono text-blue-600">{item.student.studentCode || 'N/A'}</span> • Làm trong {formatStudyTime(item.firstAttempt.durationSeconds || 0)}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="text-right">
                                    <span className="text-sm font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                                      {item.firstAttempt.score.toFixed(1)}đ
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="py-8 text-center text-slate-400 text-xs font-medium">
                            Chưa có học sinh nào nộp bài đề thi này
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* PHẦN 3: THỐNG KÊ SỐ NGƯỜI THAM GIA LÀM & CHƯA LÀM */}
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-5">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div>
                        <h3 className="text-sm font-black uppercase text-slate-900 flex items-center gap-2">
                          <Users size={16} className="text-indigo-600" />
                          3. Thống Kê Tham Gia Làm Bài ({classStudents.length} học sinh)
                        </h3>
                        <p className="text-xs text-slate-400 font-medium mt-0.5">
                          Nhấn vào từng tab bên dưới để xem danh sách chi tiết
                        </p>
                      </div>

                      {/* Toggle Cards for Submitted vs Unsubmitted */}
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <button
                          onClick={() => setParticipationView('submitted')}
                          className={`flex-1 sm:flex-initial flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${participationView === 'submitted' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                        >
                          <CheckCircle2 size={15} /> Đã làm ({quizAttemptStats.submittedStudents.length})
                        </button>
                        <button
                          onClick={() => setParticipationView('unsubmitted')}
                          className={`flex-1 sm:flex-initial flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${participationView === 'unsubmitted' ? 'bg-rose-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                        >
                          <XCircle size={15} /> Chưa làm ({quizAttemptStats.unsubmittedStudents.length})
                        </button>
                      </div>
                    </div>

                    {/* SUBMITTED LIST */}
                    {participationView === 'submitted' && (
                      <div className="space-y-3 animate-fade-in">
                        {quizAttemptStats.submittedStudents.length > 0 ? (
                          <div className="overflow-x-auto border rounded-2xl">
                            <table className="w-full text-left text-xs">
                              <thead>
                                <tr className="bg-slate-50 border-b text-[10px] font-black uppercase tracking-wider text-slate-400">
                                  <th className="p-3 w-10 text-center">STT</th>
                                  <th className="p-3">Họ và tên</th>
                                  <th className="p-3 text-center">Mã số</th>
                                  <th className="p-3 text-center">Điểm Lần 1</th>
                                  <th className="p-3 text-center">Điểm Cao Nhất</th>
                                  <th className="p-3 text-center">Số lần làm</th>
                                  <th className="p-3 text-center">TG làm Lần 1</th>
                                  <th className="p-3 text-center">Ngày nộp Lần 1</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {quizAttemptStats.submittedStudents.map((item, idx) => (
                                  <tr key={item.student.id} className="hover:bg-slate-50">
                                    <td className="p-3 text-center text-slate-400 font-bold">{idx + 1}</td>
                                    <td className="p-3 font-black text-slate-800 uppercase">{item.student.fullName}</td>
                                    <td className="p-3 text-center font-mono text-blue-600 font-bold">{item.student.studentCode || 'N/A'}</td>
                                    <td className="p-3 text-center">
                                      <span className="font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md text-[11px]">
                                        {item.firstAttempt.score.toFixed(1)}đ
                                      </span>
                                    </td>
                                    <td className="p-3 text-center">
                                      <span className="font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md text-[11px]">
                                        {item.bestScore.toFixed(1)}đ
                                      </span>
                                    </td>
                                    <td className="p-3 text-center font-bold text-slate-600">{item.totalAttempts} lần</td>
                                    <td className="p-3 text-center text-slate-600 font-medium">{formatStudyTime(item.firstAttempt.durationSeconds || 0)}</td>
                                    <td className="p-3 text-center text-slate-400 text-[10px]">{formatDateStr(item.firstAttempt.submittedAt)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="py-8 text-center text-slate-400 text-xs font-medium bg-slate-50 rounded-2xl border border-dashed">
                            Chưa có học sinh nào nộp bài
                          </div>
                        )}
                      </div>
                    )}

                    {/* UNSUBMITTED LIST */}
                    {participationView === 'unsubmitted' && (
                      <div className="space-y-3 animate-fade-in">
                        <div className="flex justify-between items-center bg-rose-50 p-3.5 rounded-2xl border border-rose-100">
                          <span className="text-xs font-black text-rose-800">
                            Có {quizAttemptStats.unsubmittedStudents.length} học sinh chưa nộp bài
                          </span>
                          <button
                            onClick={handleCopyUnsubmitted}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-rose-700 transition-all shadow-xs"
                          >
                            {copiedUnsubmitted ? <CheckCheck size={13} /> : <Copy size={13} />}
                            {copiedUnsubmitted ? "ĐÃ SAO CHÉP TÊN HS" : "SAO CHÉP DANH SÁCH NHẮC NHỞ"}
                          </button>
                        </div>

                        {quizAttemptStats.unsubmittedStudents.length > 0 ? (
                          <div className="overflow-x-auto border rounded-2xl">
                            <table className="w-full text-left text-xs">
                              <thead>
                                <tr className="bg-slate-50 border-b text-[10px] font-black uppercase tracking-wider text-slate-400">
                                  <th className="p-3 w-10 text-center">STT</th>
                                  <th className="p-3">Họ và tên</th>
                                  <th className="p-3 text-center">Mã số (MAHS)</th>
                                  <th className="p-3 text-center">Tài khoản</th>
                                  <th className="p-3 text-center">Trạng thái</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {quizAttemptStats.unsubmittedStudents.map((s, idx) => (
                                  <tr key={s.id} className="hover:bg-slate-50">
                                    <td className="p-3 text-center text-slate-400 font-bold">{idx + 1}</td>
                                    <td className="p-3 font-black text-slate-800 uppercase">{s.fullName}</td>
                                    <td className="p-3 text-center font-mono text-blue-600 font-bold">{s.studentCode || 'N/A'}</td>
                                    <td className="p-3 text-center font-mono text-slate-500">{s.username}</td>
                                    <td className="p-3 text-center">
                                      <span className="font-black text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md text-[10px] uppercase">
                                        Chưa làm bài
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="py-8 text-center text-emerald-600 font-black text-xs bg-emerald-50 rounded-2xl border border-emerald-100">
                            🎉 Tuyệt vời! 100% học sinh trong lớp đã hoàn thành bài thi này!
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="py-16 text-center bg-white rounded-3xl border border-dashed p-8 space-y-3">
                  <AlertCircle size={32} className="text-slate-300 mx-auto" />
                  <p className="text-xs font-black text-slate-500 uppercase">
                    Không có đề thi nào phù hợp với bộ lọc chương
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: KẾT QUẢ RÈN LUYỆN (Student History, Points & Smart Feedback)       */}
          {/* ========================================================================= */}
          {activeTab === 'progress' && (
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6 animate-fade-in">
              {/* Toolbar & Filter */}
              <div className="flex flex-col md:flex-row justify-between items-center gap-3 border-b pb-4">
                <div>
                  <h3 className="text-sm font-black uppercase text-slate-900 flex items-center gap-2">
                    <TrendingUp size={16} className="text-indigo-600" />
                    Theo Dõi Tiến Bộ & Kết Quả Rèn Luyện Học Viên
                  </h3>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">
                    Bấm vào từng học sinh để xem lịch sử làm bài, nhận xét tiến bộ và gợi ý học tập
                  </p>
                </div>

                <div className="w-full md:w-80 relative">
                  <input
                    className="w-full py-2 px-4 bg-slate-50 border rounded-xl outline-none text-xs font-bold pl-9"
                    placeholder="Lọc theo tên hoặc MAHS..."
                    value={progressSearch}
                    onChange={e => setProgressSearch(e.target.value)}
                  />
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                </div>
              </div>

              {/* Students Progress Table */}
              {classStudents.length > 0 ? (
                <div className="overflow-x-auto border rounded-2xl">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b text-[10px] font-black uppercase tracking-wider text-slate-400">
                        <th className="p-3.5 w-12 text-center">STT</th>
                        <th className="p-3.5">Học sinh</th>
                        <th className="p-3.5 text-center">Mã số (MAHS)</th>
                        <th className="p-3.5 text-center">Đề đã làm / Được giao</th>
                        <th className="p-3.5 text-center">Tổng TG rèn luyện</th>
                        <th className="p-3.5 text-center">Điểm tích lũy</th>
                        <th className="p-3.5 text-center">Đánh giá tiến bộ</th>
                        <th className="p-3.5 text-center">Hành động</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {classStudents
                        .filter(s => {
                          if (!progressSearch.trim()) return true;
                          const q = progressSearch.toLowerCase();
                          return s.fullName.toLowerCase().includes(q) || (s.studentCode && s.studentCode.toLowerCase().includes(q));
                        })
                        .map((s, idx) => {
                          const training = getStudentTrainingData(s);

                          return (
                            <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                              <td className="p-3.5 text-center font-bold text-slate-400">{idx + 1}</td>
                              <td className="p-3.5 font-black text-slate-800 uppercase">{s.fullName}</td>
                              <td className="p-3.5 text-center font-mono text-blue-600 font-bold">{s.studentCode || 'N/A'}</td>
                              <td className="p-3.5 text-center">
                                <span className="font-bold text-slate-700">
                                  {training.completedQuizzesCount}/{training.totalAssignedCount} đề ({training.completionRate.toFixed(0)}%)
                                </span>
                              </td>
                              <td className="p-3.5 text-center font-bold text-slate-700">
                                <Clock size={12} className="inline mr-1 text-slate-400" />
                                {formatStudyTime(training.totalSeconds)}
                              </td>
                              <td className="p-3.5 text-center">
                                <span className="font-black text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded-md text-[11px]">
                                  ⭐ {training.accumulatedPoints.toFixed(2)}
                                </span>
                              </td>
                              <td className="p-3.5 text-center">
                                {training.progressStatus === 'excellent' && (
                                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md font-black text-[10px] uppercase">
                                    Tiến bộ vượt bậc
                                  </span>
                                )}
                                {training.progressStatus === 'steady' && (
                                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-md font-black text-[10px] uppercase">
                                    Duy trì tốt
                                  </span>
                                )}
                                {training.progressStatus === 'needs_effort' && (
                                  <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-md font-black text-[10px] uppercase">
                                    Cần rèn luyện thêm
                                  </span>
                                )}
                                {training.progressStatus === 'new' && (
                                  <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md font-bold text-[10px] uppercase">
                                    Chưa tham gia
                                  </span>
                                )}
                              </td>
                              <td className="p-3.5 text-center">
                                <button
                                  onClick={() => setInspectingStudent(s)}
                                  className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white rounded-lg text-xs font-black uppercase transition-all shadow-xs"
                                >
                                  Chi tiết
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-12 text-center text-slate-400 text-xs font-medium">
                  Chưa có học sinh trong lớp
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CHI TIẾT RÈN LUYỆN & NHẬN XÉT CÁ NHÂN (Smart Evaluation Panel)     */}
      {/* ========================================================================= */}
      {inspectingStudent && selectedClass && (() => {
        const training = getStudentTrainingData(inspectingStudent);

        return (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[5000] flex items-center justify-center p-4">
            <div className="bg-white rounded-[2.5rem] w-full max-w-3xl overflow-hidden border shadow-2xl animate-scale-up flex flex-col max-h-[90vh]">
              {/* Modal Header */}
              <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-600 rounded-xl">
                    <Award size={22} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-tight">
                      Kết Quả Rèn Luyện: {inspectingStudent.fullName}
                    </h3>
                    <p className="text-[10px] text-slate-400 font-bold">
                      Mã số: {inspectingStudent.studentCode || 'N/A'} • Lớp: {selectedClass.name} ({selectedClass.academicYear})
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setInspectingStudent(null)}
                  className="p-2 hover:bg-slate-800 rounded-xl transition-colors text-slate-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
                {/* 4 Stat Boxes */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-50 border p-3 rounded-2xl text-center">
                    <span className="text-[9px] font-black text-slate-400 uppercase block">Tổng thời gian</span>
                    <span className="text-base font-black text-slate-900">{formatStudyTime(training.totalSeconds)}</span>
                  </div>
                  <div className="bg-yellow-50 border border-yellow-100 p-3 rounded-2xl text-center">
                    <span className="text-[9px] font-black text-yellow-600 uppercase block">Điểm tích lũy</span>
                    <span className="text-base font-black text-yellow-700">{training.accumulatedPoints.toFixed(2)}</span>
                  </div>
                  <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-2xl text-center">
                    <span className="text-[9px] font-black text-indigo-600 uppercase block">Đã hoàn thành</span>
                    <span className="text-base font-black text-indigo-700">{training.completedQuizzesCount}/{training.totalAssignedCount} đề</span>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-2xl text-center">
                    <span className="text-[9px] font-black text-emerald-600 uppercase block">Điểm TB các đề</span>
                    <span className="text-base font-black text-emerald-700">{training.avgScore.toFixed(1)}đ</span>
                  </div>
                </div>

                {/* Smart AI / Teacher Feedback Box */}
                <div className="bg-gradient-to-r from-indigo-50 via-slate-50 to-indigo-50 border border-indigo-200 p-4 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 text-indigo-900 font-black uppercase text-[11px]">
                    <Lightbulb size={16} className="text-amber-500" />
                    Đánh Giá Tiến Bộ & Gợi Ý Học Tập
                  </div>
                  <p className="text-slate-700 font-medium leading-relaxed">
                    {training.progressFeedback}
                  </p>

                  {training.recommendedChapters.length > 0 && (
                    <div className="pt-2 border-t border-indigo-100 flex items-center gap-2 flex-wrap text-[11px]">
                      <span className="font-black text-indigo-900">Chương cần ôn tập thêm:</span>
                      {training.recommendedChapters.map(ch => (
                        <span key={ch} className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-md font-bold">
                          {ch}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Quizzes Completed vs Uncompleted */}
                <div className="space-y-3">
                  <h4 className="font-black uppercase text-slate-700 text-xs flex items-center gap-2">
                    <BookOpen size={14} className="text-indigo-600" />
                    Lịch Sử Đề Thi Đã Làm ({training.studentResults.length} lần nộp)
                  </h4>

                  {training.studentResults.length > 0 ? (
                    <div className="overflow-x-auto border rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400">
                            <th className="p-2.5">Tên đề thi</th>
                            <th className="p-2.5 text-center">Điểm số</th>
                            <th className="p-2.5 text-center">Thời gian làm</th>
                            <th className="p-2.5 text-center">Ngày nộp bài</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {training.studentResults.map((r, i) => {
                            const q = quizzes.find(item => item.id === r.quizId);
                            return (
                              <tr key={r.id || i} className="hover:bg-slate-50">
                                <td className="p-2.5 font-black text-slate-800">
                                  {q?.title || `Đề ${r.quizId.slice(0, 8)}`}
                                  {q?.category && <span className="block text-[10px] font-medium text-slate-400">{q.category}</span>}
                                </td>
                                <td className="p-2.5 text-center">
                                  <span className={`font-black px-2 py-0.5 rounded-md text-[11px] ${r.score >= 8 ? 'bg-emerald-50 text-emerald-700' : r.score >= 5 ? 'bg-blue-50 text-blue-700' : 'bg-rose-50 text-rose-700'}`}>
                                    {r.score.toFixed(1)}đ
                                  </span>
                                </td>
                                <td className="p-2.5 text-center font-medium text-slate-600">
                                  {formatStudyTime(r.durationSeconds || 0)}
                                </td>
                                <td className="p-2.5 text-center text-slate-400 text-[10px]">
                                  {formatDateStr(r.submittedAt)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="py-6 text-center text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed">
                      Học sinh chưa nộp bài thi nào
                    </div>
                  )}

                  {/* List of remaining assigned quizzes */}
                  {training.uncompletedQuizzes.length > 0 && (
                    <div className="pt-3">
                      <h4 className="font-black uppercase text-amber-800 text-xs mb-2 flex items-center gap-1.5">
                        <AlertCircle size={14} /> Các Đề Được Giao Chưa Làm ({training.uncompletedQuizzes.length} đề):
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {training.uncompletedQuizzes.map(q => (
                          <div key={q.id} className="p-2.5 bg-amber-50/60 border border-amber-200 rounded-xl flex items-center justify-between text-xs">
                            <span className="font-bold text-amber-900">{q.title}</span>
                            <span className="text-[10px] font-black text-amber-600 uppercase bg-white px-2 py-0.5 rounded-md border border-amber-200">
                              Chưa làm
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-slate-50 border-t shrink-0 flex justify-end">
                <button
                  onClick={() => setInspectingStudent(null)}
                  className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-black uppercase hover:bg-black"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* MODAL 1: CREATE / EDIT CLASS                                             */}
      {/* ========================================================================= */}
      {isClassModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[5000] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-md overflow-hidden border shadow-2xl animate-scale-up">
            <div className="p-5 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-600 rounded-xl">
                  <GraduationCap size={18} />
                </div>
                <h3 className="text-xs font-black uppercase tracking-tight">
                  {editingClass ? 'Sửa thông tin Lớp học' : 'Tạo Lớp học mới'}
                </h3>
              </div>
              <button
                onClick={() => setIsClassModalOpen(false)}
                className="p-1.5 hover:bg-slate-800 rounded-xl transition-colors text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-indigo-600 uppercase ml-1">
                  1. Tên Lớp (Ví dụ: 12A1, 11A2, 10A1...)
                </label>
                <input
                  className="w-full p-3 bg-slate-50 border rounded-xl font-black uppercase text-xs outline-none focus:border-indigo-500 transition-all"
                  value={classForm.name}
                  onChange={e => setClassForm({ ...classForm, name: e.target.value })}
                  placeholder="VÍ DỤ: 12A1"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">
                    2. Niên khóa
                  </label>
                  <input
                    className="w-full p-3 bg-slate-50 border rounded-xl font-bold text-xs outline-none focus:border-indigo-500"
                    value={classForm.academicYear}
                    onChange={e => setClassForm({ ...classForm, academicYear: e.target.value })}
                    placeholder="2025-2026"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">
                    3. Khối
                  </label>
                  <select
                    className="w-full p-3 bg-slate-50 border rounded-xl font-black text-xs outline-none focus:border-indigo-500"
                    value={classForm.grade}
                    onChange={e => setClassForm({ ...classForm, grade: e.target.value as Grade })}
                  >
                    <option value="12">Khối 12</option>
                    <option value="11">Khối 11</option>
                    <option value="10">Khối 10</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">
                    4. Môn học {isSuperAdmin ? '(SuperAdmin)' : ''}
                  </label>
                  {isSuperAdmin ? (
                    <select
                      className="w-full p-3 bg-slate-50 border rounded-xl font-bold text-xs outline-none focus:border-indigo-500"
                      value={classForm.subject}
                      onChange={e => setClassForm({ ...classForm, subject: e.target.value })}
                    >
                      <option value="">-- Dùng chung --</option>
                      {STANDARD_SUBJECTS.map(s => (
                        <option key={s} value={s}>Môn {s}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="w-full p-3 bg-slate-100 border border-slate-200 rounded-xl text-xs font-black text-slate-700 flex items-center justify-between">
                      <span>Môn {currentUser?.subject || classForm.subject || 'Chung'}</span>
                      <span className="text-[9px] font-bold text-slate-400 bg-white px-2 py-0.5 rounded-md border">Môn của bạn</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-1">
                  5. Ghi chú / Trình độ phân loại (Tùy chọn)
                </label>
                <input
                  className="w-full p-3 bg-slate-50 border rounded-xl font-medium text-xs outline-none focus:border-indigo-500"
                  value={classForm.description}
                  onChange={e => setClassForm({ ...classForm, description: e.target.value })}
                  placeholder="Ví dụ: Trình độ Nâng cao, GVCN Thầy Tuấn..."
                />
              </div>

              <div className="pt-1">
                <label className="flex items-start gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100/80 transition-colors">
                  <input
                    type="checkbox"
                    checked={classForm.isSharedWithTeachers}
                    onChange={e => setClassForm({ ...classForm, isSharedWithTeachers: e.target.checked })}
                    className="mt-0.5 w-4 h-4 text-indigo-600 rounded cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-black text-slate-800 uppercase block">Chia sẻ lớp này cho giáo viên khác</span>
                    <span className="text-[10px] text-slate-500 font-medium leading-tight block mt-0.5">
                      Nếu bật, các giáo viên khác trong trường cũng có thể nhìn thấy lớp này để giao đề và xem kết quả học sinh
                    </span>
                  </div>
                </label>
              </div>

              <button
                onClick={handleSaveClass}
                disabled={isSaving}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all mt-2 disabled:opacity-50"
              >
                <Check size={16} /> {isSaving ? 'ĐANG LƯU...' : 'LƯU THÔNG TIN LỚP'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: ADD STUDENTS TO CLASS                                           */}
      {/* ========================================================================= */}
      {isAddStudentModalOpen && selectedClass && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[5000] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-2xl overflow-hidden border shadow-2xl animate-scale-up flex flex-col max-h-[90vh]">
            <div className="p-5 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-600 rounded-xl">
                  <UserPlus size={18} />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-tight">
                    Thêm học sinh vào Lớp {selectedClass.name}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold">
                    Niên khóa {selectedClass.academicYear} • Khối {selectedClass.grade}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddStudentModalOpen(false)}
                className="p-1.5 hover:bg-slate-800 rounded-xl transition-colors text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 border-b shrink-0 flex gap-3 items-center bg-slate-50">
              <div className="flex-1 relative">
                <input
                  className="w-full p-2.5 bg-white border rounded-xl outline-none text-xs font-bold pl-8"
                  placeholder="Tìm học sinh theo tên hoặc MAHS..."
                  value={studentSearch}
                  onChange={e => setStudentSearch(e.target.value)}
                />
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
              </div>
              <button
                onClick={() => {
                  if (selectedStudentIdsToAdd.length === availableStudentsToAdd.length) {
                    setSelectedStudentIdsToAdd([]);
                  } else {
                    setSelectedStudentIdsToAdd(availableStudentsToAdd.map(s => s.id));
                  }
                }}
                className="px-3 py-2 bg-white border rounded-xl text-[10px] font-black uppercase hover:bg-slate-100"
              >
                {selectedStudentIdsToAdd.length === availableStudentsToAdd.length ? 'Bỏ chọn' : 'Chọn tất cả'}
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-1.5">
              {availableStudentsToAdd.length > 0 ? (
                availableStudentsToAdd.map(s => {
                  const isChecked = selectedStudentIdsToAdd.includes(s.id);
                  return (
                    <div
                      key={s.id}
                      onClick={() => {
                        setSelectedStudentIdsToAdd(prev => 
                          prev.includes(s.id) ? prev.filter(i => i !== s.id) : [...prev, s.id]
                        );
                      }}
                      className={`p-3 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${isChecked ? 'bg-indigo-50/80 border-indigo-300 shadow-xs' : 'bg-white hover:bg-slate-50'}`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`p-1 rounded-md ${isChecked ? 'text-indigo-600' : 'text-slate-300'}`}>
                          {isChecked ? <CheckSquare size={16} /> : <Square size={16} />}
                        </div>
                        <div>
                          <p className="font-black text-slate-800 uppercase text-xs">
                            {s.fullName}
                          </p>
                          <p className="text-[10px] text-slate-400 font-medium">
                            Mã: <span className="font-mono text-blue-600 font-bold">{s.studentCode || 'N/A'}</span> • Khối {s.grade || '12'}
                            {s.className ? (
                              <span className="text-amber-600 ml-1">
                                (Hiện đang ở lớp: {s.className} - {s.academicYear || ''})
                              </span>
                            ) : (
                              <span className="text-slate-400 ml-1">(Chưa vào lớp nào)</span>
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-8 text-center text-slate-400 text-xs font-bold">
                  Không tìm thấy học sinh nào
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t shrink-0 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-600">
                Đã chọn: <strong className="text-indigo-600">{selectedStudentIdsToAdd.length}</strong> học sinh
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsAddStudentModalOpen(false)}
                  className="px-4 py-2 bg-white border text-slate-600 rounded-xl text-xs font-black uppercase hover:bg-slate-100"
                >
                  Hủy
                </button>
                <button
                  onClick={handleConfirmAddStudents}
                  disabled={selectedStudentIdsToAdd.length === 0 || isAssigning}
                  className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase hover:bg-indigo-700 disabled:opacity-50 shadow-md flex items-center gap-1.5"
                >
                  <UserPlus size={14} /> {isAssigning ? 'Đang gán...' : 'Gán vào lớp'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: BATCH PROMOTE / TRANSFER (Chuyển Niên Khóa / Thăng Lớp)          */}
      {/* ========================================================================= */}
      {isPromoteModalOpen && selectedClass && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[5000] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-lg overflow-hidden border shadow-2xl animate-scale-up flex flex-col max-h-[90vh]">
            <div className="p-5 bg-amber-600 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/20 rounded-xl">
                  <ArrowUpRight size={18} />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-tight">
                    Chuyển Niên Khóa / Thăng Lớp
                  </h3>
                  <p className="text-[10px] text-amber-100 font-bold">
                    Từ Lớp: <strong>{selectedClass.name} ({selectedClass.academicYear})</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPromoteModalOpen(false)}
                className="p-1.5 hover:bg-amber-700 rounded-xl transition-colors text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-2xl text-xs text-amber-900 leading-relaxed space-y-1">
                <p className="font-black uppercase text-[10px] text-amber-800">
                  💡 Giữ nguyên tài khoản & Lịch sử học tập
                </p>
                <p className="text-[11px]">
                  Khi chuyển sang niên khóa mới (Ví dụ từ <strong>11A1 (2025-2026)</strong> lên <strong>12A1 (2026-2027)</strong>), tài khoản đăng nhập, mật khẩu và toàn bộ điểm rèn luyện của học sinh sẽ <strong>được giữ nguyên</strong>.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-1">
                  1. Chọn Lớp đích để chuyển tới:
                </label>
                <select
                  className="w-full p-3 bg-slate-50 border-2 border-slate-200 rounded-xl font-black text-xs outline-none focus:border-amber-500"
                  value={promoteTargetClassId}
                  onChange={e => setPromoteTargetClassId(e.target.value)}
                >
                  <option value="">-- CHỌN LỚP ĐÍCH --</option>
                  {classes
                    .filter(c => c.id !== selectedClass.id)
                    .map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} • Niên khóa {c.academicYear} (Khối {c.grade})
                      </option>
                    ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">
                    2. Chọn học sinh cần chuyển ({selectedStudentIdsToPromote.length}/{classStudents.length}):
                  </label>
                  <button
                    onClick={() => {
                      if (selectedStudentIdsToPromote.length === classStudents.length) {
                        setSelectedStudentIdsToPromote([]);
                      } else {
                        setSelectedStudentIdsToPromote(classStudents.map(s => s.id));
                      }
                    }}
                    className="text-[10px] font-black text-amber-600 uppercase hover:underline"
                  >
                    {selectedStudentIdsToPromote.length === classStudents.length ? 'Bỏ chọn' : 'Chọn tất cả'}
                  </button>
                </div>

                <div className="max-h-40 overflow-y-auto border rounded-xl divide-y bg-slate-50">
                  {classStudents.map(s => {
                    const isChecked = selectedStudentIdsToPromote.includes(s.id);
                    return (
                      <div
                        key={s.id}
                        onClick={() => {
                          setSelectedStudentIdsToPromote(prev => 
                            prev.includes(s.id) ? prev.filter(i => i !== s.id) : [...prev, s.id]
                          );
                        }}
                        className={`p-2.5 text-xs flex items-center justify-between cursor-pointer ${isChecked ? 'bg-amber-100/60 font-black text-slate-900' : 'text-slate-600'}`}
                      >
                        <div className="flex items-center gap-2">
                          {isChecked ? <CheckSquare size={15} className="text-amber-600" /> : <Square size={15} className="text-slate-300" />}
                          <span>{s.fullName}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">{s.studentCode}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t shrink-0 flex justify-end gap-2">
              <button
                onClick={() => setIsPromoteModalOpen(false)}
                className="px-4 py-2 bg-white border text-slate-600 rounded-xl text-xs font-black uppercase hover:bg-slate-100"
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmPromote}
                disabled={!promoteTargetClassId || selectedStudentIdsToPromote.length === 0 || isAssigning}
                className="px-5 py-2 bg-amber-600 text-white rounded-xl text-xs font-black uppercase hover:bg-amber-700 disabled:opacity-50 shadow-md flex items-center gap-1.5"
              >
                <ArrowRight size={14} /> {isAssigning ? 'Đang chuyển...' : `Chuyển ${selectedStudentIdsToPromote.length} HS`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
