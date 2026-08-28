/// <reference types="vite/client" />

import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  writeBatch,
  getCountFromServer,
  startAfter,
  DocumentSnapshot
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';
import { User, Quiz, Result, Chapter, Question, ExamSession, PublishedResult, Grade, ClassRoom } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { isSameSubject } from './subjectUtils';

import firebaseConfig from '../firebase-applet-config.json';

export const isDatabaseConnected = (): boolean => {
  return !!db;
};

// Deeply clean all undefined values to ensure Firestore writes never fail
export function cleanUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => cleanUndefined(item)) as unknown as T;
  }
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = cleanUndefined(value);
      }
    }
    return cleaned;
  }
  return obj;
}

// Test Firestore Connection
export const testFirebaseConnection = async (): Promise<{ success: boolean; message: string }> => {
  if (!db) return { success: false, message: "Firebase client chưa khởi tạo" };
  try {
    const q = query(collection(db, 'users'), limit(1));
    const snapshot = await getDocs(q);
    return { success: true, message: `Kết nối Firebase Cloud Firestore thành công. (${snapshot.size} bản ghi mẫu)` };
  } catch (e: any) {
    console.error("Lỗi Exception kết nối Firebase:", e);
    return { success: false, message: `Lỗi kết nối Firestore: ${e.message || JSON.stringify(e)}` };
  }
};

// Aliased for backwards compatibility
export const testSupabaseConnection = testFirebaseConnection;

// --- Results ---
export const getResultsMetadataPage = async (
  page: number, 
  pageSize: number = 50, 
  quizId?: string, 
  search?: string
): Promise<{ data: Result[]; total: number }> => {
  if (!db) return { data: [], total: 0 };
  try {
    let qRef = collection(db, 'results');
    let constraints: any[] = [];

    if (quizId && quizId !== 'all') {
      constraints.push(where('quizId', '==', quizId));
    }

    const totalSnapshot = await getDocs(query(qRef, ...constraints));
    let allResults = totalSnapshot.docs.map(d => {
      const row = d.data();
      return (row.data as Result) || ({ ...row, id: d.id } as Result);
    });

    if (search) {
      const s = search.trim().toLowerCase();
      allResults = allResults.filter(r => 
        (r.studentName && r.studentName.toLowerCase().includes(s)) ||
        (r.studentCode && r.studentCode.toLowerCase().includes(s))
      );
    }

    // Sort by submittedAt descending or id
    allResults.sort((a, b) => {
      const tA = new Date(a.submittedAt || 0).getTime();
      const tB = new Date(b.submittedAt || 0).getTime();
      return tB - tA;
    });

    const total = allResults.length;
    const from = (page - 1) * pageSize;
    const paged = allResults.slice(from, from + pageSize);

    return { data: paged, total };
  } catch (e) {
    console.error("Lỗi getResultsMetadataPage Firestore:", e);
    return { data: [], total: 0 };
  }
};

export const getResultsMetadata = async (quizId?: string, maxRecords: number = 10000): Promise<Result[]> => {
  if (!db) return [];
  try {
    let qRef = collection(db, 'results');
    let q = query(qRef, limit(maxRecords));
    if (quizId && quizId !== 'all') {
      q = query(qRef, where('quizId', '==', quizId), limit(maxRecords));
    }

    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => {
      const row = d.data();
      const res = (row.data as Result) || (row as Result);
      return {
        ...res,
        id: d.id,
        quizId: row.quizId || res.quizId,
        studentId: row.studentId || res.studentId
      };
    });
  } catch (e) {
    console.error("Lỗi getResultsMetadata Firestore:", e);
    return [];
  }
};

export const getResultsCount = async (quizId?: string): Promise<number> => {
  if (!db) return 0;
  try {
    let qRef = collection(db, 'results');
    let q = query(qRef);
    if (quizId && quizId !== 'all') {
      q = query(qRef, where('quizId', '==', quizId));
    }
    const snapshot = await getCountFromServer(q);
    return snapshot.data().count;
  } catch (e) {
    return 0;
  }
};

export const getResults = async (quizId?: string, maxRecords: number = 5000): Promise<Result[]> => {
  if (!db) return [];
  try {
    let qRef = collection(db, 'results');
    let q = query(qRef, limit(maxRecords));
    if (quizId && quizId !== 'all') {
      q = query(qRef, where('quizId', '==', quizId), limit(maxRecords));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => {
      const row = d.data();
      return (row.data as Result) || (row as Result);
    });
  } catch (e) {
    return [];
  }
};

export const getResultsForStudent = async (studentId: string, studentCode?: string): Promise<Result[]> => {
  if (!db) return [];
  try {
    const qRef = collection(db, 'results');
    const q = query(qRef, where('studentId', '==', studentId), limit(500));
    const snapshot = await getDocs(q);
    let results = snapshot.docs.map(d => {
      const row = d.data();
      return (row.data as Result) || (row as Result);
    });

    if (studentCode && studentCode !== 'N/A') {
      const code = studentCode.trim().toUpperCase();
      const qCode = query(qRef, where('studentCode', '==', code), limit(500));
      const codeSnapshot = await getDocs(qCode);
      const codeResults = codeSnapshot.docs.map(d => {
        const row = d.data();
        return (row.data as Result) || (row as Result);
      });
      
      // Merge unique by id
      const map = new Map<string, Result>();
      [...results, ...codeResults].forEach(r => map.set(r.id, r));
      results = Array.from(map.values());
    }

    results.sort((a, b) => {
      const tA = new Date(a.submittedAt || 0).getTime();
      const tB = new Date(b.submittedAt || 0).getTime();
      return tB - tA;
    });

    return results;
  } catch (e) {
    console.error("Lỗi getResultsForStudent:", e);
    return [];
  }
};

export const verifyResultExists = async (id: string): Promise<boolean> => {
  if (!db) return false;
  try {
    const docSnap = await getDoc(doc(db, 'results', id));
    return docSnap.exists();
  } catch (e) {
    return false;
  }
};

export const getResultById = async (id: string): Promise<Result | null> => {
  if (!db) return null;
  try {
    const docSnap = await getDoc(doc(db, 'results', id));
    if (!docSnap.exists()) return null;
    const data = docSnap.data();
    return (data.data as Result) || (data as Result);
  } catch (e) {
    console.error("Lỗi getResultById:", e);
    return null;
  }
};

export const saveResult = async (result: Result): Promise<void> => {
  if (!db) throw new Error("Mất kết nối Database Cloud Firestore");
  const payload = {
    id: result.id,
    quizId: result.quizId,
    studentId: result.studentId,
    studentName: result.studentName || '',
    studentCode: (result.studentCode || '').trim().toUpperCase(),
    score: result.score,
    submittedAt: result.submittedAt || new Date().toISOString(),
    data: cleanUndefined(result)
  };
  await setDoc(doc(db, 'results', result.id), cleanUndefined(payload));
};

export const deleteResult = async (id: string): Promise<void> => {
  if (db) {
    await deleteDoc(doc(db, 'results', id));
  }
};

export const updateResultCode = async (id: string, code: string): Promise<void> => {
  if (!db) return;
  const docRef = doc(db, 'results', id);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return;
  const currentData = docSnap.data();
  const resData = { ...((currentData.data as Result) || currentData), studentCode: code.trim().toUpperCase() };
  await updateDoc(docRef, {
    studentCode: code.trim().toUpperCase(),
    data: cleanUndefined(resData)
  });
};

// --- Users ---
export const getUsersPage = async (
  page: number, 
  pageSize: number = 50, 
  search?: string
): Promise<{ data: User[]; total: number }> => {
  if (!db) return { data: [], total: 0 };
  try {
    const qRef = collection(db, 'users');
    const snapshot = await getDocs(qRef);
    let allUsers = snapshot.docs.map(d => {
      const row = d.data();
      const parsed = (row.data as User) || ({ ...row, id: d.id } as User);
      return {
        ...parsed,
        id: d.id,
        classId: parsed.classId || row.classId || '',
        className: parsed.className || row.className || '',
        academicYear: parsed.academicYear || row.academicYear || '',
        createdById: parsed.createdById || row.createdById || '',
      };
    });

    if (search) {
      const s = search.trim().toLowerCase();
      allUsers = allUsers.filter(u => 
        (u.fullName && u.fullName.toLowerCase().includes(s)) ||
        (u.studentCode && u.studentCode.toLowerCase().includes(s)) ||
        (u.username && u.username.toLowerCase().includes(s))
      );
    }

    allUsers.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));

    const total = allUsers.length;
    const from = (page - 1) * pageSize;
    const paged = allUsers.slice(from, from + pageSize);

    return { data: paged, total };
  } catch (e) {
    console.error("Lỗi getUsersPage Firestore:", e);
    return { data: [], total: 0 };
  }
};

export const getUsers = async (): Promise<User[]> => {
  if (!db) return [];
  try {
    const snapshot = await getDocs(collection(db, 'users'));
    return snapshot.docs.map(d => {
      const row = d.data();
      const parsed = (row.data as User) || ({ ...row, id: d.id } as User);
      return {
        ...parsed,
        id: d.id,
        classId: parsed.classId || row.classId || '',
        className: parsed.className || row.className || '',
        academicYear: parsed.academicYear || row.academicYear || '',
        createdById: parsed.createdById || row.createdById || '',
      };
    });
  } catch (e) {
    console.error("Lỗi getUsers Firestore:", e);
    return [];
  }
};

export const saveUser = async (user: User): Promise<void> => {
  if (!db) throw new Error("Mất kết nối Database Cloud Firestore");
  const payload = {
    id: user.id,
    username: (user.username || '').toLowerCase().trim(),
    role: user.role || 'student',
    fullName: user.fullName || '',
    studentCode: (user.studentCode || '').trim().toUpperCase(),
    grade: user.grade || '12',
    points: user.points || 0,
    classId: user.classId || '',
    className: user.className || '',
    academicYear: user.academicYear || '',
    email: user.email || '',
    phone: user.phone || '',
    subject: user.subject || '',
    createdById: user.createdById || '',
    createdAt: user.createdAt || new Date().toISOString(),
    password: user.password || '123',
    data: cleanUndefined(user)
  };
  await setDoc(doc(db, 'users', user.id), cleanUndefined(payload), { merge: true });
};

export const saveUsersBatch = async (users: User[]): Promise<void> => {
  if (!db) throw new Error("Mất kết nối Database Cloud Firestore");
  if (users.length === 0) return;

  // Firestore allows up to 500 writes per batch
  const chunkSize = 400;
  for (let i = 0; i < users.length; i += chunkSize) {
    const chunk = users.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    for (const user of chunk) {
      const userRef = doc(db, 'users', user.id);
      const payload = {
        id: user.id,
        username: (user.username || '').toLowerCase().trim(),
        role: user.role || 'student',
        fullName: user.fullName || '',
        studentCode: (user.studentCode || '').trim().toUpperCase(),
        grade: user.grade || '12',
        points: user.points || 0,
        classId: user.classId || '',
        className: user.className || '',
        academicYear: user.academicYear || '',
        email: user.email || '',
        phone: user.phone || '',
        subject: user.subject || '',
        createdById: user.createdById || '',
        createdAt: user.createdAt || new Date().toISOString(),
        password: user.password || '123',
        data: cleanUndefined(user)
      };
      batch.set(userRef, cleanUndefined(payload), { merge: true });
    }
    await batch.commit();
  }
};

// --- Teachers Management (SuperAdmin) ---
export const getTeachers = async (): Promise<User[]> => {
  if (!db) return [];
  try {
    const qRef = collection(db, 'users');
    const snapshot = await getDocs(qRef);
    const teachers = snapshot.docs
      .map(d => {
        const row = d.data();
        return (row.data as User) || ({ ...row, id: d.id } as User);
      })
      .filter(u => u.role === 'admin' || u.role === 'superadmin');
    
    teachers.sort((a, b) => {
      if (a.role === 'superadmin') return -1;
      if (b.role === 'superadmin') return 1;
      return (a.fullName || '').localeCompare(b.fullName || '');
    });
    return teachers;
  } catch (e) {
    console.error("Lỗi getTeachers:", e);
    return [];
  }
};

export const saveTeacher = async (teacher: User): Promise<void> => {
  await saveUser(teacher);

  // Tự động đồng bộ tên giáo viên mới vào tất cả Lớp học và Đề thi do GV này phụ trách
  if (db && teacher.id && teacher.fullName) {
    try {
      // 1. Cập nhật các Lớp học do GV tạo (createdBy == teacher.id)
      const classesQuery = query(collection(db, 'classes'), where('createdBy', '==', teacher.id));
      const classesSnap = await getDocs(classesQuery);
      if (!classesSnap.empty) {
        const batch = writeBatch(db);
        classesSnap.forEach(classDoc => {
          batch.update(classDoc.ref, {
            teacherName: teacher.fullName,
            'data.teacherName': teacher.fullName
          });
        });
        await batch.commit();
      }

      // 2. Cập nhật các Đề thi do GV tạo (createdBy == teacher.id)
      const quizMetaQuery = query(collection(db, 'quizzes_metadata'), where('createdBy', '==', teacher.id));
      const quizMetaSnap = await getDocs(quizMetaQuery);
      if (!quizMetaSnap.empty) {
        const batch = writeBatch(db);
        quizMetaSnap.forEach(qDoc => {
          batch.update(qDoc.ref, {
            createdByName: teacher.fullName,
            'data.createdByName': teacher.fullName
          });
        });
        await batch.commit();
      }
    } catch (err) {
      console.warn("Lỗi đồng bộ tên giáo viên sang các lớp/đề thi:", err);
    }
  }

  // Cập nhật local storage cache của lớp học nếu có
  try {
    const local = localStorage.getItem('eduquiz_classes_cache');
    if (local) {
      const parsedClasses: ClassRoom[] = JSON.parse(local);
      const updated = parsedClasses.map(c => c.createdBy === teacher.id ? { ...c, teacherName: teacher.fullName } : c);
      localStorage.setItem('eduquiz_classes_cache', JSON.stringify(updated));
    }
  } catch (e) {}
};

export const deleteTeacher = async (id: string): Promise<void> => {
  return deleteUser(id);
};

export const addPointsToUser = async (userId: string, points: number): Promise<void> => {
  if (!db) return;
  try {
    const docRef = doc(db, 'users', userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const raw = docSnap.data();
      const userData: User = raw.data || raw;
      const updatedUser: User = { ...userData, points: (userData.points || 0) + points };
      await updateDoc(docRef, {
        points: updatedUser.points,
        data: updatedUser
      });
    }
  } catch (e) {
    console.error("Lỗi addPointsToUser:", e);
  }
};

export const findUserByStudentCode = async (code: string): Promise<User | undefined> => {
  if (!db) return undefined;
  try {
    const targetCode = code.trim().toUpperCase();
    const q = query(collection(db, 'users'), where('studentCode', '==', targetCode), limit(1));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const d = snapshot.docs[0].data();
      return (d.data as User) || ({ ...d, id: snapshot.docs[0].id } as User);
    }

    // Fallback: search all in case studentCode was nested in data
    const allSnapshot = await getDocs(collection(db, 'users'));
    for (const docItem of allSnapshot.docs) {
      const u = (docItem.data().data as User) || (docItem.data() as User);
      if (u.studentCode && u.studentCode.trim().toUpperCase() === targetCode) {
        return u;
      }
    }
    return undefined;
  } catch (e) {
    console.error("Lỗi findUserByStudentCode Firestore:", e);
    return undefined;
  }
};

export const findUser = async (username: string): Promise<User | undefined> => {
  if (!db) return undefined;
  try {
    const targetUser = username.trim().toLowerCase();
    
    // 1. Direct query by lowercase username
    const q = query(collection(db, 'users'), where('username', '==', targetUser), limit(1));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const d = snapshot.docs[0].data();
      return (d.data as User) || ({ ...d, id: snapshot.docs[0].id } as User);
    }

    // 2. Direct query by original username (case as typed)
    const qOriginal = query(collection(db, 'users'), where('username', '==', username.trim()), limit(1));
    const snapOriginal = await getDocs(qOriginal);
    if (!snapOriginal.empty) {
      const d = snapOriginal.docs[0].data();
      return (d.data as User) || ({ ...d, id: snapOriginal.docs[0].id } as User);
    }

    // 3. Fallback: scan all users in collection in case username is stored with mixed casing, in data subfield, or email
    const allSnapshot = await getDocs(collection(db, 'users'));
    for (const docItem of allSnapshot.docs) {
      const row = docItem.data();
      const u = (row.data as User) || (row as User);
      const docUsername = (u.username || row.username || '').trim().toLowerCase();
      const docId = docItem.id.toLowerCase();
      const docEmail = (u.email || row.email || '').trim().toLowerCase();
      
      if (docUsername === targetUser || docId === targetUser || (docEmail && docEmail === targetUser)) {
        return {
          ...u,
          id: docItem.id,
          username: u.username || row.username || docItem.id,
          fullName: u.fullName || row.fullName || 'Giáo viên',
          role: u.role || row.role || 'admin',
          password: u.password || row.password || '123'
        };
      }
    }

    return undefined;
  } catch (e) {
    console.error("Lỗi findUser Firestore:", e);
    return undefined;
  }
};

export const deleteUser = async (id: string): Promise<void> => {
  if (!db) return;
  try {
    // 1. Delete associated results
    const resultsQuery = query(collection(db, 'results'), where('studentId', '==', id));
    const resultsSnap = await getDocs(resultsQuery);
    if (!resultsSnap.empty) {
      const batch = writeBatch(db);
      resultsSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    // 2. Delete user
    await deleteDoc(doc(db, 'users', id));
  } catch (e) {
    console.error("Lỗi deleteUser:", e);
    throw e;
  }
};

export const changePassword = async (userId: string, newPassword: string): Promise<boolean> => {
  if (!db) return false;
  try {
    let userRef = doc(db, 'users', userId);
    let docSnap = await getDoc(userRef);
    
    if (!docSnap.exists()) {
      // Find document by id or username if doc ID didn't match directly
      const allSnapshot = await getDocs(collection(db, 'users'));
      const found = allSnapshot.docs.find(d => {
        const row = d.data();
        const u = (row.data as User) || (row as User);
        return d.id === userId || u.id === userId || (u.username && u.username.toLowerCase() === userId.toLowerCase());
      });
      
      if (found) {
        userRef = found.ref;
        docSnap = found;
      } else {
        console.warn("changePassword: user not found with ID", userId);
        return false;
      }
    }

    const raw = docSnap.data() || {};
    const user: User = (raw.data as User) || (raw as User);
    const updatedUser: User = { ...user, password: newPassword };
    
    await setDoc(userRef, cleanUndefined({
      ...raw,
      password: newPassword,
      data: updatedUser
    }), { merge: true });

    return true;
  } catch (e) {
    console.error("Lỗi changePassword:", e);
    return false;
  }
};

// --- Quizzes ---
export const getQuizzesMetadataPage = async (
  page: number, 
  pageSize: number = 20, 
  grade?: Grade
): Promise<{ data: Quiz[]; total: number }> => {
  if (!db) return { data: [], total: 0 };
  try {
    const qRef = collection(db, 'quizzes');
    let q = query(qRef);
    if (grade && grade !== 'all') {
      q = query(qRef, where('grade', 'in', [grade, 'all']));
    }
    const snapshot = await getDocs(q);
    let allQuizzes = snapshot.docs.map(d => {
      const row = d.data();
      const quiz = (row.data as Quiz) || (row as Quiz);
      return {
        ...quiz,
        id: d.id,
        grade: row.grade || quiz.grade,
        attemptCount: quiz.attemptCount || 0,
        questionCount: quiz.questionCount || (quiz.questions ? quiz.questions.length : 0),
        questions: [] // do not load full questions in metadata list
      };
    });

    allQuizzes.sort((a, b) => {
      const tA = new Date(a.createdAt || 0).getTime();
      const tB = new Date(b.createdAt || 0).getTime();
      return tB - tA;
    });

    const total = allQuizzes.length;
    const from = (page - 1) * pageSize;
    const paged = allQuizzes.slice(from, from + pageSize);

    return { data: paged, total };
  } catch (e) {
    console.error("Lỗi getQuizzesMetadataPage:", e);
    return { data: [], total: 0 };
  }
};

export const getQuizzesMetadata = async (grade?: Grade): Promise<Quiz[]> => {
  if (!db) return [];
  try {
    const qRef = collection(db, 'quizzes');
    let q = query(qRef);
    if (grade && grade !== 'all') {
      q = query(qRef, where('grade', 'in', [grade, 'all']));
    }
    const snapshot = await getDocs(q);
    const quizzes = snapshot.docs.map(d => {
      const row = d.data();
      const quiz = (row.data as Quiz) || (row as Quiz);
      return {
        ...quiz,
        id: d.id,
        grade: row.grade || quiz.grade,
        attemptCount: quiz.attemptCount || 0,
        questionCount: quiz.questionCount || (quiz.questions ? quiz.questions.length : 0),
        questions: []
      };
    });

    quizzes.sort((a, b) => {
      const tA = new Date(a.createdAt || 0).getTime();
      const tB = new Date(b.createdAt || 0).getTime();
      return tB - tA;
    });

    return quizzes;
  } catch (e) {
    console.error("Lỗi getQuizzesMetadata:", e);
    return [];
  }
};

export const getQuizzes = async (grade?: Grade): Promise<Quiz[]> => {
  if (!db) return [];
  try {
    const qRef = collection(db, 'quizzes');
    let q = query(qRef);
    if (grade && grade !== 'all') {
      q = query(qRef, where('grade', 'in', [grade, 'all']));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => {
      const row = d.data();
      return (row.data as Quiz) || (row as Quiz);
    });
  } catch (e) {
    return [];
  }
};

export const getQuizById = async (id: string): Promise<Quiz | null> => {
  if (!db) return null;
  try {
    const docSnap = await getDoc(doc(db, 'quizzes', id));
    if (!docSnap.exists()) return null;
    const data = docSnap.data();
    return (data.data as Quiz) || (data as Quiz);
  } catch (e) {
    console.error("Lỗi getQuizById:", e);
    return null;
  }
};

export const saveQuiz = async (quiz: Quiz): Promise<void> => {
  if (!db) throw new Error("Mất kết nối Database Cloud Firestore");
  const enrichedQuiz = { 
    ...quiz, 
    questionCount: quiz.questions ? quiz.questions.length : 0 
  };
  const payload = {
    id: quiz.id,
    title: quiz.title,
    grade: quiz.grade,
    type: quiz.type,
    category: quiz.category || '',
    subject: quiz.subject || '',
    isPublished: quiz.isPublished,
    isMonitored: quiz.isMonitored || false,
    isUnlisted: quiz.isUnlisted || false,
    createdBy: quiz.createdBy || '',
    createdByName: quiz.createdByName || '',
    isSharedWithTeachers: quiz.isSharedWithTeachers ?? false,
    targetType: quiz.targetType || 'all',
    assignedClassIds: quiz.assignedClassIds || [],
    questionCount: enrichedQuiz.questionCount,
    attemptCount: quiz.attemptCount || 0,
    createdAt: quiz.createdAt || new Date().toISOString(),
    data: cleanUndefined(enrichedQuiz)
  };
  await setDoc(doc(db, 'quizzes', quiz.id), cleanUndefined(payload));
};

export const updateQuiz = async (enrichedQuiz: Quiz): Promise<void> => {
  if (!db) throw new Error("Mất kết nối Database Cloud Firestore");
  const quiz = { ...enrichedQuiz, questionCount: enrichedQuiz.questions ? enrichedQuiz.questions.length : 0 };
  const payload = {
    id: quiz.id,
    title: quiz.title,
    grade: quiz.grade,
    type: quiz.type,
    category: quiz.category || '',
    subject: quiz.subject || '',
    isPublished: quiz.isPublished,
    isMonitored: quiz.isMonitored || false,
    isUnlisted: quiz.isUnlisted || false,
    createdBy: quiz.createdBy || '',
    createdByName: quiz.createdByName || '',
    isSharedWithTeachers: quiz.isSharedWithTeachers ?? false,
    targetType: quiz.targetType || 'all',
    assignedClassIds: quiz.assignedClassIds || [],
    questionCount: quiz.questionCount,
    attemptCount: quiz.attemptCount || 0,
    data: cleanUndefined(quiz)
  };
  await setDoc(doc(db, 'quizzes', quiz.id), cleanUndefined(payload), { merge: true });
};

export const assignQuizToClasses = async (
  quizId: string, 
  assignedClassIds: string[], 
  teacherManagedClassIds?: string[]
): Promise<void> => {
  if (!db) throw new Error("Mất kết nối Database Cloud Firestore");
  const quizRef = doc(db, 'quizzes', quizId);
  const docSnap = await getDoc(quizRef);
  if (!docSnap.exists()) throw new Error("Không tìm thấy đề thi trên Cloud");
  
  const raw = docSnap.data();
  const quiz = (raw.data as Quiz) || (raw as Quiz);
  
  let finalClassIds: string[] = [];
  if (teacherManagedClassIds && teacherManagedClassIds.length > 0) {
    // Giữ nguyên các lớp do các giáo viên khác đã giao trước đó
    const otherTeacherClassIds = (quiz.assignedClassIds || []).filter(id => !teacherManagedClassIds.includes(id));
    finalClassIds = Array.from(new Set([...otherTeacherClassIds, ...assignedClassIds]));
  } else {
    finalClassIds = assignedClassIds;
  }
  
  const targetType = finalClassIds.length > 0 ? 'classes' : (quiz.targetType || 'classes');
  
  const updatedQuiz = {
    ...quiz,
    targetType,
    assignedClassIds: finalClassIds
  };
  
  await setDoc(quizRef, {
    targetType,
    assignedClassIds: finalClassIds,
    data: cleanUndefined(updatedQuiz)
  }, { merge: true });
};

export const deleteQuiz = async (id: string): Promise<void> => {
  if (db) {
    await deleteDoc(doc(db, 'quizzes', id));
  }
};

export const syncAllQuizzesMetadata = async (): Promise<number> => {
  if (!db) return 0;
  try {
    const snapshot = await getDocs(collection(db, 'quizzes'));
    let count = 0;
    const batch = writeBatch(db);
    for (const docItem of snapshot.docs) {
      const row = docItem.data();
      const quiz = (row.data as Quiz) || (row as Quiz);
      const questionCount = quiz.questions ? quiz.questions.length : 0;
      const updatedQuiz = { ...quiz, questionCount };
      batch.update(docItem.ref, {
        questionCount,
        data: cleanUndefined(updatedQuiz)
      });
      count++;
    }
    await batch.commit();
    return count;
  } catch (e) {
    console.error("Lỗi đồng bộ Metadata Firestore:", e);
    return 0;
  }
};

// --- Chapters ---
export const getChapters = async (): Promise<Chapter[]> => {
  if (!db) return [];
  try {
    const snapshot = await getDocs(collection(db, 'chapters'));
    const chapters = snapshot.docs.map(d => {
      const row = d.data();
      const rawData = (row.data as Partial<Chapter>) || {};
      return {
        ...rawData,
        ...row,
        id: d.id,
        name: rawData.name || row.name || (row as any).title || '',
        grade: (rawData.grade || row.grade || '12') as Grade,
        subject: rawData.subject || row.subject || '',
        order: rawData.order ?? row.order ?? 0,
        createdBy: rawData.createdBy || row.createdBy || '',
        createdByName: rawData.createdByName || row.createdByName || ''
      } as Chapter;
    });
    return chapters.sort((a, b) => (a.order || 0) - (b.order || 0));
  } catch (e) {
    console.error("Lỗi getChapters:", e);
    return [];
  }
};

export const saveChapter = async (c: Chapter): Promise<void> => {
  if (db) {
    await setDoc(doc(db, 'chapters', c.id), cleanUndefined({
      id: c.id,
      grade: c.grade,
      name: c.name,
      order: c.order,
      subject: c.subject || '',
      createdBy: c.createdBy || '',
      createdByName: c.createdByName || '',
      data: cleanUndefined(c)
    }));
  }
};

export const deleteChapter = async (id: string): Promise<void> => {
  if (db) {
    await deleteDoc(doc(db, 'chapters', id));
  }
};

export const deleteChaptersBatch = async (ids: string[]): Promise<void> => {
  if (!db || ids.length === 0) return;
  const batch = writeBatch(db);
  for (const id of ids) {
    batch.delete(doc(db, 'chapters', id));
  }
  await batch.commit();
};

// --- Classroom & Academic Year Management ---
export const getClasses = async (): Promise<ClassRoom[]> => {
  if (db) {
    try {
      const snapshot = await getDocs(collection(db, 'classes'));
      if (!snapshot.empty) {
        const classes = snapshot.docs.map(d => {
          const row = d.data();
          const parsed = (row.data as ClassRoom) || ({
            id: d.id,
            name: row.name || '',
            academicYear: row.academicYear || row.academic_year || '',
            grade: row.grade || '12',
            description: row.description || '',
            createdBy: row.createdBy || '',
            teacherName: row.teacherName || '',
            isSharedWithTeachers: row.isSharedWithTeachers || false
          } as ClassRoom);
          return {
            ...parsed,
            id: d.id,
            createdBy: parsed.createdBy || row.createdBy || '',
            teacherName: parsed.teacherName || row.teacherName || '',
            isSharedWithTeachers: parsed.isSharedWithTeachers ?? row.isSharedWithTeachers ?? false
          };
        });

        try {
          localStorage.setItem('eduquiz_classes_cache', JSON.stringify(classes));
        } catch (e) {}

        return classes;
      }
    } catch (e) {
      console.warn("Lỗi đọc classes từ Firestore, fallback sang cache:", e);
    }
  }

  // Fallback to localStorage
  try {
    const local = localStorage.getItem('eduquiz_classes_cache');
    if (local) return JSON.parse(local);
  } catch (e) {}
  return [];
};

export const saveClass = async (c: ClassRoom): Promise<void> => {
  try {
    const list = await getClasses();
    const idx = list.findIndex(item => item.id === c.id);
    if (idx >= 0) list[idx] = c;
    else list.push(c);
    localStorage.setItem('eduquiz_classes_cache', JSON.stringify(list));
  } catch (e) {}

  if (db) {
    await setDoc(doc(db, 'classes', c.id), cleanUndefined({
      id: c.id,
      name: c.name,
      academicYear: c.academicYear,
      grade: c.grade,
      description: c.description || '',
      createdBy: c.createdBy || '',
      teacherName: c.teacherName || '',
      isSharedWithTeachers: Boolean(c.isSharedWithTeachers),
      data: cleanUndefined(c)
    }));
  }
};

export const saveClassesBatch = async (classesList: ClassRoom[]): Promise<void> => {
  if (classesList.length === 0) return;
  try {
    localStorage.setItem('eduquiz_classes_cache', JSON.stringify(classesList));
  } catch (e) {}

  if (db) {
    const batch = writeBatch(db);
    for (const c of classesList) {
      batch.set(doc(db, 'classes', c.id), cleanUndefined({
        id: c.id,
        name: c.name,
        academicYear: c.academicYear,
        grade: c.grade,
        description: c.description || '',
        createdBy: c.createdBy || '',
        teacherName: c.teacherName || '',
        isSharedWithTeachers: Boolean(c.isSharedWithTeachers),
        data: cleanUndefined(c)
      }));
    }
    await batch.commit();
  }
};

export const deleteClass = async (id: string): Promise<void> => {
  try {
    const list = await getClasses();
    const updated = list.filter(item => item.id !== id);
    localStorage.setItem('eduquiz_classes_cache', JSON.stringify(updated));
  } catch (e) {}

  if (db) {
    await deleteDoc(doc(db, 'classes', id));
  }
};

export const assignStudentsToClass = async (
  studentIds: string[], 
  classInfo: { classId?: string; className?: string; academicYear?: string; grade?: Grade; subject?: string } | null
): Promise<number> => {
  if (!db || studentIds.length === 0) return 0;
  try {
    const allUsers = await getUsers();
    const targetUsers = allUsers.filter(u => studentIds.includes(u.id));

    const updatedUsers: User[] = targetUsers.map(u => ({
      ...u,
      classId: classInfo?.classId || '',
      className: classInfo?.className || '',
      academicYear: classInfo?.academicYear || '',
      grade: classInfo?.grade || u.grade,
      subject: classInfo?.subject || u.subject || ''
    }));

    await saveUsersBatch(updatedUsers);
    return updatedUsers.length;
  } catch (e) {
    console.error("Lỗi gán học sinh vào lớp:", e);
    throw e;
  }
};

// --- Question Bank & Smart Deduplication ---

/**
 * Tạo chữ ký định danh duy nhất (Fingerprint) của câu hỏi dựa trên nội dung, dạng câu, đáp án, môn học & khối lớp.
 * Giúp phát hiện và ngăn chặn câu hỏi trùng lặp 100%.
 */
export const getQuestionFingerprint = (q: Partial<Question>): string => {
  if (!q) return '';
  // Chuẩn hóa văn bản: xóa khoảng trắng thừa, chuyển chữ thường, bỏ dấu nhãn đầu câu
  let normText = (q.text || '')
    .trim()
    .toLowerCase()
    .replace(/^(\*?[a-z0-9][\.\)\/\-:\s]\s*)/gi, '')
    .replace(/\s+/g, ' ');

  const type = (q.type || 'mcq').toLowerCase().replace('_', '-');
  const normSubject = (q.subject || '').trim().toLowerCase();
  const normGrade = (q.quizGrade || '').toString().trim().toLowerCase();

  let optionsSig = '';
  if (type === 'mcq' && q.options && q.options.length > 0) {
    optionsSig = q.options
      .map(opt => (opt || '').trim().toLowerCase().replace(/^(\*?[a-z0-9][\.\)\/\-:\s]\s*)/gi, '').replace(/\s+/g, ' '))
      .sort()
      .join('###');
  } else if (type === 'group-tf' && q.subQuestions && q.subQuestions.length > 0) {
    optionsSig = q.subQuestions
      .map(sq => (sq.text || '').trim().toLowerCase().replace(/^(\*?[a-z0-9][\.\)\/\-:\s]\s*)/gi, '').replace(/\s+/g, ' ') + `:${sq.correctAnswer}`)
      .join('###');
  } else if (type === 'short') {
    optionsSig = (q.correctAnswer || '').trim().toLowerCase();
  }

  return `${normSubject}__${normGrade}__${type}__${normText}__${optionsSig}`;
};

export const getBankQuestions = async (): Promise<Question[]> => {
  if (!db) return [];
  try {
    const snapshot = await getDocs(collection(db, 'bank_questions'));
    return snapshot.docs.map(d => {
      const row = d.data();
      return (row.data as Question) || (row as Question);
    });
  } catch (e) {
    console.error("Lỗi lấy ngân hàng câu hỏi:", e);
    return [];
  }
};

export interface SyncBankResult {
  totalScanned: number;
  added: number;
  updated: number;
  skippedDuplicates: number;
}

/**
 * Đồng bộ câu hỏi từ các đề thi vào Ngân hàng câu hỏi (có cơ chế Chống trùng lặp thông minh)
 */
export const syncQuizzesToBank = async (targetSubject?: string): Promise<SyncBankResult> => {
  if (!db) return { totalScanned: 0, added: 0, updated: 0, skippedDuplicates: 0 };
  try {
    const isFiltered = targetSubject && targetSubject !== 'all';
    // 1. Tải toàn bộ câu hỏi hiện có trong Ngân hàng
    const existingBankSnap = await getDocs(collection(db, 'bank_questions'));
    const existingBankMapById = new Map<string, Question>();
    const existingBankMapByFingerprint = new Map<string, string>(); // fingerprint -> docId

    existingBankSnap.docs.forEach(d => {
      const row = d.data();
      const bq = (row.data as Question) || (row as Question);
      const bqId = d.id;
      existingBankMapById.set(bqId, bq);
      const fp = getQuestionFingerprint(bq);
      if (fp) {
        existingBankMapByFingerprint.set(fp, bqId);
      }
    });

    // 2. Quét toàn bộ đề thi (lọc theo môn nếu có targetSubject)
    const quizSnap = await getDocs(collection(db, 'quizzes'));
    let totalScanned = 0;
    let addedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    const questionsToUpsert: { docId: string; question: Question; isNew: boolean }[] = [];

    quizSnap.docs.forEach(d => {
      const row = d.data();
      const quiz = (row.data as Quiz) || (row as Quiz);
      if (quiz.questions && Array.isArray(quiz.questions)) {
        quiz.questions.forEach(q => {
          const qSubject = q.subject || quiz.subject || (row.subject as string) || '';
          if (isFiltered && !isSameSubject(qSubject, targetSubject)) {
            return; // Bỏ qua câu hỏi thuộc môn khác
          }

          totalScanned++;
          const enrichedQ: Question = {
            ...q,
            quizTitle: quiz.title,
            quizGrade: quiz.grade,
            quizCategory: quiz.category || '',
            subject: qSubject,
            createdBy: q.createdBy || quiz.createdBy || '',
            createdByName: q.createdByName || quiz.createdByName || ''
          };

          const fp = getQuestionFingerprint(enrichedQ);

          // Kiểm tra theo ID gốc từ ngân hàng hoặc theo Fingerprint
          let targetDocId: string | null = null;
          if (q.bankQuestionId && existingBankMapById.has(q.bankQuestionId)) {
            targetDocId = q.bankQuestionId;
          } else if (fp && existingBankMapByFingerprint.has(fp)) {
            targetDocId = existingBankMapByFingerprint.get(fp)!;
          }

          if (targetDocId) {
            // Câu hỏi đã có trong ngân hàng -> Cập nhật thông tin nếu có thêm ảnh / lời giải / mức độ
            const currentBq = existingBankMapById.get(targetDocId);
            const mergedQ: Question = {
              ...(currentBq || enrichedQ),
              ...enrichedQ,
              id: targetDocId,
              imageUrl: enrichedQ.imageUrl || currentBq?.imageUrl,
              solution: enrichedQ.solution || currentBq?.solution,
              level: enrichedQ.level || currentBq?.level,
            };
            questionsToUpsert.push({ docId: targetDocId, question: mergedQ, isNew: false });
            updatedCount++;
            skippedCount++; // Tránh tạo trùng lặp
          } else {
            // Câu hỏi mới hoàn toàn
            const newDocId = q.bankQuestionId || q.id || uuidv4();
            enrichedQ.id = newDocId;
            questionsToUpsert.push({ docId: newDocId, question: enrichedQ, isNew: true });
            existingBankMapById.set(newDocId, enrichedQ);
            if (fp) existingBankMapByFingerprint.set(fp, newDocId);
            addedCount++;
          }
        });
      }
    });

    if (questionsToUpsert.length === 0) {
      return { totalScanned, added: 0, updated: 0, skippedDuplicates: skippedCount };
    }

    // 3. Thực thi lưu theo Batch vào Firestore
    const chunkSize = 350;
    for (let i = 0; i < questionsToUpsert.length; i += chunkSize) {
      const chunk = questionsToUpsert.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      for (const item of chunk) {
        batch.set(doc(db, 'bank_questions', item.docId), cleanUndefined({
          id: item.docId,
          subject: item.question.subject || '',
          grade: item.question.quizGrade || '',
          createdBy: item.question.createdBy || '',
          data: cleanUndefined(item.question)
        }), { merge: true });
      }
      await batch.commit();
    }

    return {
      totalScanned,
      added: addedCount,
      updated: updatedCount,
      skippedDuplicates: totalScanned - addedCount
    };
  } catch (e) {
    console.error("Lỗi đồng bộ về Ngân hàng:", e);
    throw e;
  }
};

export interface DeduplicateBankResult {
  totalScanned: number;
  duplicatesRemoved: number;
  uniqueRemaining: number;
}

/**
 * Quét toàn bộ Ngân hàng câu hỏi (hoặc lọc theo môn), phát hiện các câu hỏi trùng lặp nội dung và tự động gộp/xóa bản thừa
 */
export const deduplicateBankQuestions = async (targetSubject?: string): Promise<DeduplicateBankResult> => {
  if (!db) return { totalScanned: 0, duplicatesRemoved: 0, uniqueRemaining: 0 };
  try {
    const isFiltered = targetSubject && targetSubject !== 'all';
    const snapshot = await getDocs(collection(db, 'bank_questions'));
    let allBankQuestions = snapshot.docs.map(d => {
      const row = d.data();
      const q = (row.data as Question) || (row as Question);
      return { ...q, id: d.id };
    });

    if (isFiltered) {
      allBankQuestions = allBankQuestions.filter(q => isSameSubject(q.subject || '', targetSubject));
    }

    const totalScanned = allBankQuestions.length;
    if (totalScanned <= 1) {
      return { totalScanned, duplicatesRemoved: 0, uniqueRemaining: totalScanned };
    }

    // Nhóm theo Fingerprint
    const groups = new Map<string, Question[]>();
    for (const q of allBankQuestions) {
      const fp = getQuestionFingerprint(q);
      if (!groups.has(fp)) {
        groups.set(fp, []);
      }
      groups.get(fp)!.push(q);
    }

    const idsToDelete: string[] = [];
    const questionsToKeepAndMerge: Question[] = [];

    groups.forEach((items) => {
      if (items.length === 1) {
        questionsToKeepAndMerge.push(items[0]);
      } else {
        // Có từ 2 câu trở lên trùng lặp nội dung
        // Chọn câu tốt nhất làm câu chính (có ảnh, có lời giải, có phân loại mức độ)
        const primary = items.reduce((best, cur) => {
          let scoreBest = 0;
          let scoreCur = 0;
          if (best.imageUrl) scoreBest += 3;
          if (best.solution) scoreBest += 2;
          if (best.level) scoreBest += 1;
          if (best.createdByName) scoreBest += 1;

          if (cur.imageUrl) scoreCur += 3;
          if (cur.solution) scoreCur += 2;
          if (cur.level) scoreCur += 1;
          if (cur.createdByName) scoreCur += 1;

          return scoreCur > scoreBest ? cur : best;
        }, items[0]);

        // Gộp những thông tin còn thiếu từ các bản sao vào bản chính
        const merged: Question = { ...primary };
        for (const item of items) {
          if (!merged.imageUrl && item.imageUrl) merged.imageUrl = item.imageUrl;
          if (!merged.solution && item.solution) merged.solution = item.solution;
          if (!merged.level && item.level) merged.level = item.level;
          if (!merged.subject && item.subject) merged.subject = item.subject;
        }

        questionsToKeepAndMerge.push(merged);

        // Các bản sao còn lại đánh dấu để xóa khỏi Firestore
        items.forEach(item => {
          if (item.id !== primary.id) {
            idsToDelete.push(item.id);
          }
        });
      }
    });

    // Thực thi xóa các bản sao trùng lặp theo Batch
    if (idsToDelete.length > 0) {
      const chunkSize = 350;
      for (let i = 0; i < idsToDelete.length; i += chunkSize) {
        const chunk = idsToDelete.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        for (const id of chunk) {
          batch.delete(doc(db, 'bank_questions', id));
        }
        await batch.commit();
      }
    }

    return {
      totalScanned,
      duplicatesRemoved: idsToDelete.length,
      uniqueRemaining: questionsToKeepAndMerge.length
    };
  } catch (e) {
    console.error("Lỗi khi dọn dẹp câu hỏi trùng lặp:", e);
    throw e;
  }
};

export const saveBankQuestion = async (q: Question): Promise<void> => {
  if (db) {
    await setDoc(doc(db, 'bank_questions', q.id), cleanUndefined({
      id: q.id,
      subject: q.subject || '',
      grade: q.quizGrade || '',
      createdBy: q.createdBy || '',
      data: cleanUndefined(q)
    }));
  }
};

export const deleteBankQuestion = async (id: string): Promise<void> => {
  if (!id) return;
  if (db) {
    await deleteDoc(doc(db, 'bank_questions', id));
  }
};

export const deleteBatchBankQuestions = async (ids: string[]): Promise<number> => {
  if (!ids || ids.length === 0) return 0;
  if (!db) return ids.length;

  const chunkSize = 400;
  let deletedCount = 0;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    for (const id of chunk) {
      batch.delete(doc(db, 'bank_questions', id));
    }
    await batch.commit();
    deletedCount += chunk.length;
  }
  return deletedCount;
};

// Helper to compress and convert image file to an optimized Base64 / Blob
export const compressImageFile = async (
  file: File, 
  maxWidth: number = 1000, 
  maxHeight: number = 1000, 
  quality: number = 0.85
): Promise<{ dataUrl: string; blob: Blob }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve({
            dataUrl: (e.target?.result as string) || '',
            blob: file
          });
        }

        ctx.drawImage(img, 0, 0, width, height);

        const format = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(format, quality);

        canvas.toBlob(
          (blob) => {
            resolve({
              dataUrl,
              blob: blob || file
            });
          },
          format,
          quality
        );
      };
      img.onerror = () => {
        resolve({
          dataUrl: (e.target?.result as string) || '',
          blob: file
        });
      };
      img.src = (e.target?.result as string) || '';
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
};

// Upload Quiz Image (via Firebase Storage with quick timeout, or compressed Base64 fallback)
export const uploadQuizImage = async (file: File): Promise<string> => {
  try {
    // 1. Compress image client-side first for instant speed & lightweight footprint
    const { dataUrl, blob } = await compressImageFile(file);

    // 2. Try Firebase Storage with a strict 2500ms timeout
    if (storage) {
      const storageUploadPromise = (async () => {
        const fileExt = file.type === 'image/png' ? 'png' : 'jpg';
        const fileName = `quiz-images/${uuidv4()}.${fileExt}`;
        const imageRef = ref(storage, fileName);
        const snapshot = await uploadBytes(imageRef, blob);
        return await getDownloadURL(snapshot.ref);
      })();

      const timeoutPromise = new Promise<string>((_, reject) => 
        setTimeout(() => reject(new Error("Firebase Storage timeout")), 2500)
      );

      try {
        const cloudUrl = await Promise.race([storageUploadPromise, timeoutPromise]);
        if (cloudUrl) return cloudUrl;
      } catch (err) {
        console.warn("Storage upload skipped/timed out, using optimized base64 storage:", err);
      }
    }

    // 3. Seamlessly return optimized Base64
    return dataUrl;
  } catch (error) {
    console.error("Lỗi xử lý ảnh:", error);
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string) || '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  }
};

// --- Published Results ---
export const getPublishedResults = async (limitCount: number = 20): Promise<PublishedResult[]> => {
  if (!db) return [];
  try {
    const q = query(collection(db, 'published_results'), limit(limitCount));
    const snapshot = await getDocs(q);
    const list = snapshot.docs.map(d => {
      const row = d.data();
      return (row.data as PublishedResult) || (row as PublishedResult);
    });
    list.sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime());
    return list;
  } catch (e) {
    return [];
  }
};

export const savePublishedResult = async (pub: PublishedResult): Promise<void> => {
  if (db) {
    await setDoc(doc(db, 'published_results', pub.id), cleanUndefined({
      id: pub.id,
      quizId: pub.quizId,
      quizTitle: pub.quizTitle,
      publishedAt: pub.publishedAt,
      data: cleanUndefined(pub)
    }));
  }
};

export const deletePublishedResult = async (id: string): Promise<void> => {
  if (db) {
    await deleteDoc(doc(db, 'published_results', id));
  }
};

// --- Exam Sessions ---
export const saveExamSession = async (session: ExamSession): Promise<void> => {
  if (db) {
    await setDoc(doc(db, 'exam_sessions', session.id), cleanUndefined({
      id: session.id,
      quizId: session.quizId,
      studentId: session.studentId,
      data: cleanUndefined(session)
    }));
  }
};

export const deleteExamSession = async (id: string): Promise<void> => {
  if (db) {
    await deleteDoc(doc(db, 'exam_sessions', id));
  }
};

export const getExamSessions = async (quizId?: string): Promise<ExamSession[]> => {
  if (!db) return [];
  try {
    let q = query(collection(db, 'exam_sessions'));
    if (quizId && quizId !== 'all') {
      q = query(collection(db, 'exam_sessions'), where('quizId', '==', quizId));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => {
      const row = d.data();
      return (row.data as ExamSession) || (row as ExamSession);
    });
  } catch (e) {
    return [];
  }
};

export const getStudentActiveSessions = async (studentId: string): Promise<ExamSession[]> => {
  if (!db) return [];
  try {
    const q = query(collection(db, 'exam_sessions'), where('studentId', '==', studentId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => {
      const row = d.data();
      return (row.data as ExamSession) || (row as ExamSession);
    });
  } catch (e) {
    return [];
  }
};

export const clearAllSessions = async (): Promise<void> => {
  if (!db) return;
  try {
    const snapshot = await getDocs(collection(db, 'exam_sessions'));
    const batch = writeBatch(db);
    snapshot.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  } catch (e) {
    console.error("Lỗi clearAllSessions:", e);
  }
};

// Default seed superadmin and admin if needed
export const initStorage = async () => {
  if (!db) return;
  try {
    const superAdminUser = await findUser('superadmin');
    if (!superAdminUser) {
      const defaultSuperAdmin: User = {
        id: 'superadmin-root-account',
        username: 'superadmin',
        password: '123',
        role: 'superadmin',
        fullName: 'Tổng Quản Trị Hệ Thống (SuperAdmin)',
        createdAt: new Date().toISOString()
      };
      await saveUser(defaultSuperAdmin);
    } else if (superAdminUser.role !== 'superadmin') {
      await saveUser({ ...superAdminUser, role: 'superadmin' });
    }

    const adminUser = await findUser('admin');
    if (!adminUser) {
      const defaultAdmin: User = {
        id: 'admin-system-account',
        username: 'admin',
        password: '123',
        role: 'superadmin',
        fullName: 'Tổng Quản Trị Hệ Thống (Admin)',
        createdAt: new Date().toISOString()
      };
      await saveUser(defaultAdmin);
    } else if (adminUser.role !== 'superadmin') {
      await saveUser({ ...adminUser, role: 'superadmin', fullName: adminUser.fullName || 'Tổng Quản Trị Hệ Thống (Admin)' });
    }
  } catch (e) {
    console.warn("InitStorage check:", e);
  }
};

export const clearLocalCache = () => {
  localStorage.clear();
  window.location.reload();
};

export interface CollectionStat {
  name: string;
  label: string;
  count: number;
  estimatedSizeBytes: number;
  description: string;
}

export interface DatabaseMetrics {
  connected: boolean;
  projectId: string;
  databaseId: string;
  storageBucket: string;
  authDomain: string;
  latencyMs: number;
  status: 'optimal' | 'warning' | 'error' | 'disconnected';
  collections: CollectionStat[];
  totalDocuments: number;
  totalEstimatedSizeBytes: number;
  localCacheSizeBytes: number;
  quotas: {
    readsDailyLimit: number;
    writesDailyLimit: number;
    deletesDailyLimit: number;
    storageLimitBytes: number;
    bandwidthMonthlyLimitBytes: number;
    estimatedStorageUsedPercent: number;
  };
  lastChecked: string;
}

export const pingDatabase = async (): Promise<number> => {
  if (!db) return -1;
  const start = performance.now();
  try {
    const q = query(collection(db, 'users'), limit(1));
    await getDocs(q);
    const duration = Math.round(performance.now() - start);
    return duration;
  } catch (e) {
    return -1;
  }
};

export const getDatabaseMetrics = async (): Promise<DatabaseMetrics> => {
  const isConn = isDatabaseConnected();
  const projectId = firebaseConfig?.projectId || 'N/A';
  const databaseId = firebaseConfig?.firestoreDatabaseId || '(default)';
  const storageBucket = firebaseConfig?.storageBucket || 'N/A';
  const authDomain = firebaseConfig?.authDomain || 'N/A';

  // Calculate local storage size
  let localCacheBytes = 0;
  try {
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        localCacheBytes += (localStorage[key].length + key.length) * 2;
      }
    }
  } catch {
    localCacheBytes = 0;
  }

  if (!isConn || !db) {
    return {
      connected: false,
      projectId,
      databaseId,
      storageBucket,
      authDomain,
      latencyMs: -1,
      status: 'disconnected',
      collections: [],
      totalDocuments: 0,
      totalEstimatedSizeBytes: 0,
      localCacheSizeBytes: localCacheBytes,
      quotas: {
        readsDailyLimit: 50000,
        writesDailyLimit: 20000,
        deletesDailyLimit: 20000,
        storageLimitBytes: 1073741824, // 1 GiB
        bandwidthMonthlyLimitBytes: 10737418240, // 10 GiB
        estimatedStorageUsedPercent: 0
      },
      lastChecked: new Date().toISOString()
    };
  }

  const startPing = performance.now();
  let latencyMs = 0;
  let status: 'optimal' | 'warning' | 'error' = 'optimal';

  // Average size estimation per document (in bytes) based on data model complexity
  const collectionConfigs = [
    { name: 'quizzes', label: 'Đề thi chi tiết', avgBytes: 18000, desc: 'Chứa đề thi, danh sách câu hỏi, hình ảnh và đáp án' },
    { name: 'quizzes_metadata', label: 'Chỉ mục đề thi (Metadata)', avgBytes: 600, desc: 'Lưu thông tin tóm tắt đề phục vụ tải trang siêu tốc' },
    { name: 'users', label: 'Tài khoản người dùng', avgBytes: 800, desc: 'Học sinh, giáo viên, quản trị viên' },
    { name: 'results', label: 'Kết quả & Bài nộp', avgBytes: 4500, desc: 'Chi tiết bài thi của học sinh, đáp án chọn, thời gian làm' },
    { name: 'classes', label: 'Lớp học', avgBytes: 1200, desc: 'Danh sách lớp và danh sách mã học sinh được gán' },
    { name: 'chapters', label: 'Chương mục kiến thức', avgBytes: 400, desc: 'Phân loại bài học theo từng khối và môn' },
    { name: 'bank_questions', label: 'Ngân hàng câu hỏi', avgBytes: 2200, desc: 'Kho câu hỏi mẫu phân theo môn học và mức độ' },
    { name: 'exam_sessions', label: 'Phiên giám sát thi', avgBytes: 1000, desc: 'Trạng thái học sinh đang làm bài thi trực tiếp' },
    { name: 'published_results', label: 'Kết quả công bố', avgBytes: 800, desc: 'Dữ liệu công bố điểm của các đề thi' }
  ];

  const collectionsStats: CollectionStat[] = [];
  let totalDocs = 0;
  let totalEstimatedBytes = 0;

  try {
    const counts = await Promise.allSettled(
      collectionConfigs.map(async (c) => {
        try {
          const snapshot = await getCountFromServer(collection(db, c.name));
          return snapshot.data().count;
        } catch {
          // Fallback if collection doesn't exist yet
          return 0;
        }
      })
    );

    latencyMs = Math.round(performance.now() - startPing);
    if (latencyMs > 800) status = 'warning';

    collectionConfigs.forEach((c, idx) => {
      const res = counts[idx];
      const count = res.status === 'fulfilled' ? res.value : 0;
      const estimatedSize = count * c.avgBytes;
      totalDocs += count;
      totalEstimatedBytes += estimatedSize;

      collectionsStats.push({
        name: c.name,
        label: c.label,
        count,
        estimatedSizeBytes: estimatedSize,
        description: c.desc
      });
    });
  } catch (err) {
    status = 'error';
  }

  const storageLimitBytes = 1073741824; // 1 GiB free tier
  const usedPercent = Math.min(100, Number(((totalEstimatedBytes / storageLimitBytes) * 100).toFixed(2)));

  return {
    connected: true,
    projectId,
    databaseId,
    storageBucket,
    authDomain,
    latencyMs,
    status,
    collections: collectionsStats,
    totalDocuments: totalDocs,
    totalEstimatedSizeBytes: totalEstimatedBytes,
    localCacheSizeBytes: localCacheBytes,
    quotas: {
      readsDailyLimit: 50000,
      writesDailyLimit: 20000,
      deletesDailyLimit: 20000,
      storageLimitBytes,
      bandwidthMonthlyLimitBytes: 10737418240, // 10 GiB
      estimatedStorageUsedPercent: usedPercent
    },
    lastChecked: new Date().toISOString()
  };
};

export const exportFullDatabaseBackup = async (): Promise<string> => {
  if (!db) throw new Error("Mất kết nối Database Cloud Firestore");

  const [quizzesSnap, usersSnap, resultsSnap, classesSnap, chaptersSnap, bankSnap] = await Promise.all([
    getDocs(collection(db, 'quizzes')),
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'results')),
    getDocs(collection(db, 'classes')),
    getDocs(collection(db, 'chapters')),
    getDocs(collection(db, 'bank_questions'))
  ]);

  const backupData = {
    version: "1.0",
    appName: "EduQuiz VN",
    exportedAt: new Date().toISOString(),
    projectId: firebaseConfig?.projectId,
    databaseId: firebaseConfig?.firestoreDatabaseId,
    stats: {
      quizzes: quizzesSnap.size,
      users: usersSnap.size,
      results: resultsSnap.size,
      classes: classesSnap.size,
      chapters: chaptersSnap.size,
      bankQuestions: bankSnap.size
    },
    data: {
      quizzes: quizzesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      users: usersSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      results: resultsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      classes: classesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      chapters: chaptersSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      bankQuestions: bankSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    }
  };

  return JSON.stringify(backupData, null, 2);
};
