
/**
 * Tiện ích quản lý Niên học (Academic Year)
 * Quy tắc:
 * - Từ tháng 9 năm X đến tháng 8 năm X+1 => Niên học là "X-(X+1)" (VD: 9/2025 - 8/2026 là "2025-2026")
 * - Từ tháng 9 năm 2026 đến tháng 8 năm 2027 => Niên học là "2026-2027"
 */

export const getCurrentAcademicYear = (date: Date = new Date()): string => {
  const month = date.getMonth(); // 0-indexed: 0 (Tháng 1) -> 11 (Tháng 12)
  const year = date.getFullYear();

  // Tháng 9 (index 8) đến tháng 12 (index 11) => năm bắt đầu là year
  if (month >= 8) {
    return `${year}-${year + 1}`;
  } else {
    // Tháng 1 (index 0) đến tháng 8 (index 7) => năm bắt đầu là year - 1
    return `${year - 1}-${year}`;
  }
};

/**
 * Lấy danh sách các niên học chuẩn để hiển thị trong bộ lọc và form chọn
 */
export const getAcademicYearOptions = (customYears: (string | undefined | null)[] = []): string[] => {
  const currentYear = new Date().getFullYear();
  const baseYears: string[] = [];

  // Tạo dải năm từ 3 năm trước đến 3 năm sau
  for (let y = currentYear - 3; y <= currentYear + 3; y++) {
    baseYears.push(`${y}-${y + 1}`);
  }

  const set = new Set<string>(baseYears);
  customYears.forEach(cy => {
    if (cy && cy.trim() && cy.includes('-')) {
      set.add(cy.trim());
    }
  });

  // Sắp xếp giảm dần (mới nhất lên đầu)
  return Array.from(set).sort((a, b) => {
    const startA = parseInt(a.split('-')[0]) || 0;
    const startB = parseInt(b.split('-')[0]) || 0;
    return startB - startA;
  });
};

/**
 * Trích xuất Niên học của 1 đề thi (nếu đề chưa có trường academicYear, suy ra từ ngày tạo)
 */
export const getQuizAcademicYear = (quiz: { academicYear?: string; createdAt?: string }): string => {
  if (quiz.academicYear && quiz.academicYear.trim()) {
    return quiz.academicYear.trim();
  }
  if (quiz.createdAt) {
    try {
      const d = new Date(quiz.createdAt);
      if (!isNaN(d.getTime())) {
        return getCurrentAcademicYear(d);
      }
    } catch {}
  }
  return getCurrentAcademicYear();
};
