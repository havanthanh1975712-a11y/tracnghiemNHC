
export type Role = 'superadmin' | 'admin' | 'student';
export type Grade = '10' | '11' | '12' | 'all';
export type QuizType = 'practice' | 'test';
export type QuestionType = 'mcq' | 'group-tf' | 'short';
export type QuestionLevel = 'B' | 'H' | 'VD' | 'VDC';

export interface ClassRoom {
  id: string; // e.g. "class_12a1_2026" or uuid
  name: string; // e.g. "12A1", "11A2", "10A1", "Lớp Nâng Cao"
  academicYear: string; // e.g. "2025-2026", "2026-2027", "2026"
  grade: Grade; // '10' | '11' | '12' | 'all'
  subject?: string; // Môn học (VD: Toán, Vật lí, Hóa học...)
  description?: string; // Ghi chú, giáo viên phụ trách, phân loại trình độ
  createdAt?: string;
  createdBy?: string; // ID giáo viên tạo lớp
  teacherName?: string; // Tên giáo viên tạo lớp
  isSharedWithTeachers?: boolean; // Chia sẻ cho toàn bộ giáo viên khác xem và giao bài
}

export interface User {
  id: string;
  username: string;
  password: string;
  role: Role;
  fullName: string;
  studentCode?: string; 
  grade?: Grade;
  points?: number;
  // Thông tin Lớp học & Niên khóa (có thể thay đổi qua các năm mà không đổi tài khoản)
  classId?: string; 
  className?: string; 
  academicYear?: string;
  // Thông tin bổ sung cho Giáo viên / Admin
  email?: string;
  phone?: string;
  subject?: string;
  createdById?: string;
  createdAt?: string;
}

export interface Chapter {
  id: string;
  grade: Grade;
  name: string;
  order: number;
  subject?: string; // Môn học (VD: Toán, Vật lí, Hóa học...)
  createdBy?: string; // ID giáo viên tạo chương
  createdByName?: string; // Tên giáo viên tạo chương
  isSharedWithTeachers?: boolean;
}

export interface SubQuestion {
  id: string;
  text: string;
  correctAnswer: 'True' | 'False';
  level?: QuestionLevel;
}

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  points: number | string;
  level?: QuestionLevel;
  imageUrl?: string;
  solution?: string; 
  options?: string[]; 
  correctAnswer?: string; 
  subQuestions?: SubQuestion[];
  quizTitle?: string;
  quizGrade?: Grade;
  quizCategory?: string;
  subject?: string; // Môn học (VD: Toán, Vật lí, Hóa học...)
  createdBy?: string;
  createdByName?: string;
  isShared?: boolean;
  bankQuestionId?: string; // ID của câu hỏi gốc trong Ngân hàng câu hỏi (để chống trùng lặp khi đồng bộ)
}

export interface Quiz {
  id: string;
  title: string;
  description: string;
  type: QuizType;
  grade: Grade;
  category?: string; 
  subject?: string; // Môn học (VD: Toán, Vật lí, Hóa học...)
  startTime?: string;
  endTime?: string; 
  durationMinutes: number;
  questions: Question[];
  questionCount?: number; 
  attemptCount?: number;
  createdAt: string;
  isPublished: boolean;
  isMonitored?: boolean;
  disablePractice?: boolean; // Tạm thời đóng băng hoặc tắt nút Luyện tập (Quick Practice)
  isUnlisted?: boolean; 
  orderIndex?: number; // Thứ tự trong chương
  // Phân quyền tạo đề & chia sẻ giáo viên
  createdBy?: string; // ID của Giáo viên / Admin tạo đề
  createdByName?: string; // Họ tên Giáo viên tạo đề
  isSharedWithTeachers?: boolean; // Cho phép các giáo viên khác xem và khai thác đề thi này
  // Phân quyền giao đề theo Lớp học & Niên khóa
  academicYear?: string; // Niên học áp dụng (VD: "2025-2026", "2026-2027")
  targetType?: 'all' | 'classes'; // 'all' (tất cả hs cùng khối) | 'classes' (chỉ giao cho các lớp chỉ định)
  assignedClassIds?: string[]; // IDs của các lớp được giao đề
  assignedClasses?: { id: string; name: string; academicYear?: string }[]; // Thông tin chi tiết lớp để hiển thị nhanh
}

export interface Result {
  id: string;
  quizId: string;
  studentId: string;
  studentName: string;
  studentCode?: string; 
  score: number;
  totalQuestions: number;
  submittedAt: string;
  durationSeconds: number;
  detailScores?: number[];
  pointsAwarded?: number;
  bonusPoint?: number; 
  userAnswers?: Record<string, any>; 
  violationCount?: number;
}

export interface ExamSession {
  id: string;
  quizId: string;
  quizTitle: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  startTime: string;
  lastUpdate: string;
  violationCount: number;
  isFinished: boolean;
}

export interface PublishedResult {
  id: string;
  quizId: string;
  quizTitle: string;
  publishedAt: string;
  studentCodes: string[];
  results: Result[];
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
}
