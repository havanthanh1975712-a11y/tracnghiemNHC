export const STANDARD_SUBJECTS = [
  'Toán',
  'Vật lí',
  'Hóa học',
  'Sinh học',
  'Ngữ văn',
  'Tiếng Anh',
  'Lịch sử',
  'Địa lí',
  'GDCD',
  'Tin học',
  'Công nghệ',
  'KHTN'
];

/**
 * Subject normalization and matching utility
 * Handles Vietnamese spelling variants (Vật lí / Vật lý, Hoá học / Hóa học, Địa lí / Địa lý, etc.)
 */

export const normalizeSubject = (subj?: string | null): string => {
  if (!subj) return '';
  let s = subj.toString().normalize('NFC').trim().toLowerCase();
  
  // Remove prefixes like "môn ", "bộ môn ", "tổ "
  s = s.replace(/^(môn|bộ môn|tổ môn|tổ)\s+/g, '').trim();

  // Vật lí <-> Vật lý
  s = s.replace(/vật lí/g, 'vật lý');
  s = s.replace(/vat ly|vat li/g, 'vật lý');

  // Hoá học <-> Hóa học
  s = s.replace(/hoá/g, 'hóa');
  s = s.replace(/hoa hoc/g, 'hóa học');

  // Địa lí <-> Địa lý
  s = s.replace(/địa lí/g, 'địa lý');
  s = s.replace(/dia ly|dia li/g, 'địa lý');

  // Toán
  if (s === 'toán học' || s === 'toan' || s === 'toan hoc') s = 'toán';

  // Ngữ văn
  if (s === 'văn' || s === 'van' || s === 'ngu van') s = 'ngữ văn';

  // Tiếng Anh
  if (s === 'anh' || s === 'tieng anh' || s === 'tiếng anh' || s === 'english') s = 'tiếng anh';

  // Sinh học
  if (s === 'sinh' || s === 'sinh hoc') s = 'sinh học';

  // Tin học
  if (s === 'tin' || s === 'tin hoc') s = 'tin học';

  // Lịch sử
  if (s === 'sử' || s === 'lich su') s = 'lịch sử';

  // GDCD / GDKT&PL
  if (s === 'giáo dục công dân' || s === 'gdcd' || s === 'gdkt&pl' || s === 'gdkt và pl') s = 'gdcd';

  // Công nghệ
  if (s === 'cong nghe') s = 'công nghệ';

  return s;
};

export const isSameSubject = (sub1?: string | null, sub2?: string | null): boolean => {
  if (!sub1 || !sub2) return false;
  const n1 = normalizeSubject(sub1);
  const n2 = normalizeSubject(sub2);
  if (!n1 || !n2) return false;
  
  if (n1 === n2) return true;
  if (n1.includes(n2) || n2.includes(n1)) return true;
  return false;
};

export const getDisplaySubject = (subj?: string | null): string => {
  if (!subj) return 'Chung';
  const norm = normalizeSubject(subj);
  if (norm === 'vật lý') return 'Vật lí';
  if (norm === 'hóa học') return 'Hóa học';
  if (norm === 'địa lý') return 'Địa lí';
  if (norm === 'toán') return 'Toán';
  if (norm === 'ngữ văn') return 'Ngữ văn';
  if (norm === 'tiếng anh') return 'Tiếng Anh';
  if (norm === 'sinh học') return 'Sinh học';
  if (norm === 'tin học') return 'Tin học';
  if (norm === 'lịch sử') return 'Lịch sử';
  if (norm === 'gdcd') return 'GDCD';
  if (norm === 'công nghệ') return 'Công nghệ';
  return subj.trim();
};
