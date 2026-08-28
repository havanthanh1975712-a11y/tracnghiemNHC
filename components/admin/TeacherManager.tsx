import React, { useState } from 'react';
import { User, Quiz, ClassRoom } from '../../types';
import { 
  Search, UserPlus, Key, Edit3, Trash2, ShieldCheck, ShieldAlert, 
  Mail, Phone, BookOpen, Layers, CheckCircle2, XCircle, RefreshCw, UserCheck, X
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface TeacherManagerProps {
  teachers: User[];
  quizzes: Quiz[];
  currentUser?: User;
  classes?: ClassRoom[];
  onSaveTeacher: (teacher: User) => Promise<void>;
  onDeleteTeacher: (id: string, name: string) => Promise<void>;
  onResetPassword: (teacher: User) => Promise<void>;
  onRefresh: () => void;
  isLoading?: boolean;
}

export default function TeacherManager({
  teachers,
  quizzes,
  currentUser,
  onSaveTeacher,
  onDeleteTeacher,
  onResetPassword,
  onRefresh,
  isLoading = false
}: TeacherManagerProps) {
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    fullName: '',
    username: '',
    password: '123',
    subject: '',
    email: '',
    phone: '',
    role: 'admin' as 'admin' | 'superadmin'
  });
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const filteredTeachers = teachers.filter(t => {
    const s = search.toLowerCase().trim();
    return (
      (t.fullName && t.fullName.toLowerCase().includes(s)) ||
      (t.username && t.username.toLowerCase().includes(s)) ||
      (t.email && t.email.toLowerCase().includes(s)) ||
      (t.phone && t.phone.toLowerCase().includes(s)) ||
      (t.subject && t.subject.toLowerCase().includes(s))
    );
  });

  const handleOpenAdd = () => {
    setEditingTeacher(null);
    setFormData({
      fullName: '',
      username: '',
      password: '123',
      subject: '',
      email: '',
      phone: '',
      role: 'admin'
    });
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (t: User) => {
    setEditingTeacher(t);
    setFormData({
      fullName: t.fullName,
      username: t.username,
      password: t.password || '',
      subject: t.subject || '',
      email: t.email || '',
      phone: t.phone || '',
      role: t.role as 'admin' | 'superadmin'
    });
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName.trim() || !formData.username.trim()) {
      setErrorMsg('Vui lòng nhập đầy đủ Họ tên và Tên đăng nhập!');
      return;
    }

    const cleanUsername = formData.username.trim().toLowerCase();

    // Check duplicate username
    const isDup = teachers.some(t => t.username.toLowerCase() === cleanUsername && t.id !== editingTeacher?.id);
    if (isDup) {
      setErrorMsg(`Tên đăng nhập "${cleanUsername}" đã được sử dụng. Vui lòng chọn tên khác!`);
      return;
    }

    setIsSaving(true);
    setErrorMsg('');
    try {
      const teacherToSave: User = {
        id: editingTeacher?.id || uuidv4(),
        fullName: formData.fullName.trim(),
        username: cleanUsername,
        password: formData.password && formData.password.trim() ? formData.password.trim() : (editingTeacher?.password || '123'),
        role: formData.role,
        subject: formData.subject.trim() || undefined,
        email: formData.email.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        createdById: currentUser?.id,
        createdAt: editingTeacher?.createdAt || new Date().toISOString()
      };

      await onSaveTeacher(teacherToSave);
      setIsModalOpen(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Lỗi khi lưu tài khoản giáo viên.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header Info */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 p-8 rounded-[2.5rem] text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-amber-500 text-slate-950 font-black text-[9px] uppercase tracking-wider rounded-lg flex items-center gap-1 shadow-md">
              <ShieldCheck size={12}/> SuperAdmin Control
            </span>
            <h1 className="text-2xl font-black uppercase italic tracking-tight">QUẢN LÝ GIÁO VIÊN & PHÂN QUYỀN</h1>
          </div>
          <p className="text-slate-300 text-xs font-medium max-w-2xl leading-relaxed">
            Bạn là <span className="text-amber-400 font-bold">Tổng Quản Trị (SuperAdmin)</span>. Bạn có thể cấp tài khoản cho các giáo viên (Admin), chỉnh sửa thông tin, đặt lại mật khẩu và kiểm soát toàn bộ kho đề thi, học sinh trong trường.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-4 bg-white/10 hover:bg-white/20 border border-white/15 text-white rounded-2xl transition-all shadow-md active:scale-95 disabled:opacity-50"
            title="Làm mới danh sách"
          >
            <RefreshCw size={18} className={isLoading ? "animate-spin" : ""}/>
          </button>
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-2 px-6 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black uppercase text-xs shadow-lg transition-all active:scale-95 border border-blue-400/30"
          >
            <UserPlus size={18}/> CẤP TÀI KHOẢN GIÁO VIÊN MỚI
          </button>
        </div>
      </div>

      {/* Filter and Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-3xl border shadow-sm flex items-center gap-4">
          <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl"><UserCheck size={24}/></div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Tổng số Giáo viên</span>
            <h4 className="text-2xl font-black text-slate-800">{teachers.filter(t => t.role === 'admin').length}</h4>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border shadow-sm flex items-center gap-4">
          <div className="p-4 bg-amber-50 text-amber-600 rounded-2xl"><ShieldCheck size={24}/></div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Tổng Quản Trị (SuperAdmin)</span>
            <h4 className="text-2xl font-black text-slate-800">{teachers.filter(t => t.role === 'superadmin').length}</h4>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border shadow-sm flex items-center gap-4">
          <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl"><Layers size={24}/></div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Tổng Đề thi trong trường</span>
            <h4 className="text-2xl font-black text-slate-800">{quizzes.length}</h4>
          </div>
        </div>
      </div>

      {/* Search Input */}
      <div className="bg-white p-6 rounded-[2rem] border shadow-sm">
        <div className="relative">
          <input
            className="w-full p-4 bg-slate-50 border rounded-2xl outline-none text-xs font-bold pl-12 text-slate-800 focus:bg-white focus:border-blue-500 transition-all"
            placeholder="Tìm kiếm theo Tên giáo viên, Tên đăng nhập, Email, Môn học, SĐT..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
        </div>
      </div>

      {/* Teacher List Table */}
      <div className="bg-white rounded-[2rem] border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-400">
                <th className="p-5 pl-8">Giáo viên</th>
                <th className="p-5">Tài khoản (Username)</th>
                <th className="p-5">Vai trò</th>
                <th className="p-5">Môn / Chuyên môn</th>
                <th className="p-5 text-center">Số đề thi đã tạo</th>
                <th className="p-5">Liên hệ</th>
                <th className="p-5 pr-8 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
              {filteredTeachers.map(t => {
                const teacherQuizzes = quizzes.filter(q => q.createdBy === t.id);
                const isSuper = t.role === 'superadmin';
                const isSelf = Boolean(currentUser?.id && t.id === currentUser.id);

                return (
                  <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-5 pl-8">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm uppercase shadow-sm ${isSuper ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-blue-100 text-blue-800 border border-blue-200'}`}>
                          {t.fullName.charAt(0)}
                        </div>
                        <div>
                          <div className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                            {t.fullName}
                            {isSelf && (
                              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[8px] font-black rounded-md uppercase">
                                Bạn
                              </span>
                            )}
                          </div>
                          {t.createdAt && (
                            <span className="text-[10px] text-slate-400 font-bold">
                              Tạo: {new Date(t.createdAt).toLocaleDateString('vi-VN')}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="p-5 font-mono text-xs font-bold text-slate-800">
                      <span className="bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                        {t.username}
                      </span>
                    </td>

                    <td className="p-5">
                      {isSuper ? (
                        <span className="px-3 py-1 bg-amber-50 border border-amber-200 text-amber-800 font-black text-[9px] uppercase tracking-wider rounded-lg inline-flex items-center gap-1">
                          <ShieldCheck size={12}/> SuperAdmin
                        </span>
                      ) : (
                        <span className="px-3 py-1 bg-blue-50 border border-blue-200 text-blue-700 font-black text-[9px] uppercase tracking-wider rounded-lg inline-flex items-center gap-1">
                          <BookOpen size={12}/> Giáo viên (Admin)
                        </span>
                      )}
                    </td>

                    <td className="p-5 font-bold text-slate-600">
                      {t.subject ? (
                        <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-[10px] font-black uppercase">
                          {t.subject}
                        </span>
                      ) : (
                        <span className="text-slate-300 italic text-[11px]">Chưa cập nhật</span>
                      )}
                    </td>

                    <td className="p-5 text-center">
                      <span className="inline-flex items-center justify-center min-w-[36px] px-2 py-1 bg-slate-100 font-black text-slate-800 rounded-lg text-xs">
                        {teacherQuizzes.length}
                      </span>
                    </td>

                    <td className="p-5 text-[11px] text-slate-500 space-y-1">
                      {t.email && (
                        <div className="flex items-center gap-1 text-slate-600 font-bold">
                          <Mail size={12} className="text-slate-400"/> {t.email}
                        </div>
                      )}
                      {t.phone && (
                        <div className="flex items-center gap-1 text-slate-600 font-bold">
                          <Phone size={12} className="text-slate-400"/> {t.phone}
                        </div>
                      )}
                      {!t.email && !t.phone && (
                        <span className="text-slate-300 italic">--</span>
                      )}
                    </td>

                    <td className="p-5 pr-8 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onResetPassword(t)}
                          className="p-2.5 bg-slate-100 hover:bg-amber-50 hover:text-amber-700 text-slate-600 rounded-xl transition-all border border-slate-200/80"
                          title="Đặt lại mật khẩu về '123'"
                        >
                          <Key size={14}/>
                        </button>
                        <button
                          onClick={() => handleOpenEdit(t)}
                          className="p-2.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 rounded-xl transition-all border border-slate-200/80"
                          title="Chỉnh sửa thông tin"
                        >
                          <Edit3 size={14}/>
                        </button>
                        {!isSelf && (
                          <button
                            onClick={() => onDeleteTeacher(t.id, t.fullName)}
                            className="p-2.5 bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-400 rounded-xl transition-all border border-slate-200/80"
                            title="Xóa tài khoản giáo viên"
                          >
                            <Trash2 size={14}/>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredTeachers.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-16 text-center text-slate-400 font-black uppercase text-xs italic tracking-wider">
                    Không tìm thấy giáo viên nào phù hợp
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Teacher Form Modal */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[5000] flex items-center justify-center p-4"
          onClick={() => setIsModalOpen(false)}
        >
          <div 
            className="bg-white max-w-lg w-full rounded-[2.5rem] border shadow-2xl p-8 overflow-hidden animate-scale-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                  {editingTeacher ? <Edit3 size={20}/> : <UserPlus size={20}/>}
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 uppercase">
                    {editingTeacher ? 'CHỈNH SỬA TÀI KHOẢN GIÁO VIÊN' : 'CẤP TÀI KHOẢN GIÁO VIÊN MỚI'}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    Quyền truy cập hệ thống quản trị EduQuiz
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-2.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
                title="Đóng cửa sổ"
              >
                <X size={20}/>
              </button>
            </div>

            {errorMsg && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-xs font-bold flex items-center gap-2">
                <XCircle size={16} className="shrink-0 text-red-500"/>
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1.5">
                  Họ và tên Giáo viên <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  className="w-full p-3.5 bg-slate-50 border rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                  placeholder="Ví dụ: Thầy Hà Văn Thạnh"
                  value={formData.fullName}
                  onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1.5">
                    Tên đăng nhập (Username) <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    className="w-full p-3.5 bg-slate-50 border rounded-xl text-xs font-mono font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                    placeholder="vd: gv_thanh"
                    value={formData.username}
                    onChange={e => setFormData({ ...formData, username: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1.5">
                    Mật khẩu {editingTeacher && '(để trống nếu giữ nguyên)'}
                  </label>
                  <input
                    className="w-full p-3.5 bg-slate-50 border rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                    placeholder="Mặc định: 123"
                    value={formData.password}
                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1.5">
                    Môn học / Tổ chuyên môn
                  </label>
                  <input
                    list="teacher-subject-suggestions"
                    className="w-full p-3.5 bg-slate-50 border rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                    placeholder="vd: Toán, Vật lí, Hóa học..."
                    value={formData.subject}
                    onChange={e => setFormData({ ...formData, subject: e.target.value })}
                  />
                  <datalist id="teacher-subject-suggestions">
                    <option value="Toán"/>
                    <option value="Vật lí"/>
                    <option value="Hóa học"/>
                    <option value="Sinh học"/>
                    <option value="Ngữ văn"/>
                    <option value="Tiếng Anh"/>
                    <option value="Lịch sử"/>
                    <option value="Địa lí"/>
                    <option value="GDCD"/>
                    <option value="Tin học"/>
                    <option value="Công nghệ"/>
                  </datalist>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1.5">
                    Vai trò / Phân quyền
                  </label>
                  <select
                    className="w-full p-3.5 bg-slate-50 border rounded-xl text-xs font-black uppercase text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                    value={formData.role}
                    onChange={e => setFormData({ ...formData, role: e.target.value as any })}
                  >
                    <option value="admin">GIÁO VIÊN (ADMIN)</option>
                    <option value="superadmin">TỔNG QUẢN TRỊ (SUPERADMIN)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1.5">
                    Email liên hệ
                  </label>
                  <input
                    type="email"
                    className="w-full p-3.5 bg-slate-50 border rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                    placeholder="vd: teacher@school.edu.vn"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1.5">
                    Số điện thoại
                  </label>
                  <input
                    className="w-full p-3.5 bg-slate-50 border rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                    placeholder="vd: 0909091634"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase transition-all"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase transition-all shadow-lg active:scale-95 disabled:opacity-50 flex items-center gap-2"
                >
                  {isSaving ? 'Đang lưu...' : (editingTeacher ? 'Cập nhật' : 'Tạo tài khoản')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
