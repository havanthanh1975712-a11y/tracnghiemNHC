
import React, { useState } from 'react';
import { User } from '../types';
import { LogOut, GraduationCap, Key, XCircle, Database, Sparkles } from 'lucide-react';
import { changePassword, isDatabaseConnected } from '../services/storage';

interface LayoutProps {
  children: React.ReactNode;
  user: User | null;
  onLogout: () => void;
}

export default function Layout({ children, user, onLogout }: LayoutProps) {
  const [isChangePassOpen, setIsChangePassOpen] = useState(false);
  const [currentPassInput, setCurrentPassInput] = useState('');
  const [newPassInput, setNewPassInput] = useState('');
  const [msg, setMsg] = useState<{text: string, type: 'success' | 'error'} | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isOnline = isDatabaseConnected();
  const rawKey = process.env.API_KEY;
  const isAIReady = rawKey && rawKey !== "undefined" && rawKey.length > 10;

  const handleChangePass = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user) return;
      setMsg(null);
      setIsSubmitting(true);

      if (currentPassInput !== user.password) {
          setMsg({ text: 'Mật khẩu hiện tại không đúng!', type: 'error' });
          setIsSubmitting(false);
          return;
      }

      const success = await changePassword(user.id, newPassInput);
      
      setIsSubmitting(false);
      if (success) {
          alert("Đổi mật khẩu thành công! Vui lòng đăng nhập lại.");
          setIsChangePassOpen(false);
          onLogout();
      } else {
          setMsg({ text: 'Có lỗi xảy ra, vui lòng thử lại.', type: 'error' });
      }
  };

  const openChangePass = () => {
      setMsg(null);
      setCurrentPassInput('');
      setNewPassInput('');
      setIsChangePassOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <nav className="bg-white border-b sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-8 w-8 text-blue-600" />
              <span className="font-bold text-xl text-gray-900">EduQuiz NHC</span>
            </div>
            {user && (
              <div className="flex items-center gap-4">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-gray-900">{user.fullName}</p>
                  <p className="text-xs text-gray-500 uppercase">
                    {user.role === 'superadmin' ? '👑 Tổng Quản Trị' : (user.role === 'admin' ? 'Giáo Viên' : `Lớp ${user.grade || ''}`)}
                  </p>
                </div>
                
                <button 
                  onClick={openChangePass}
                  className="p-2 rounded-full text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition border border-transparent hover:border-blue-100"
                  title="Đổi mật khẩu"
                >
                  <Key size={20} />
                </button>

                <button 
                  onClick={onLogout}
                  className="p-2 rounded-full text-gray-500 hover:bg-red-50 hover:text-red-600 transition border border-transparent hover:border-red-100"
                  title="Đăng xuất"
                >
                  <LogOut size={20} />
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>
      <main className="flex-1 w-full">
        {children}
      </main>
      <footer className="bg-white border-t mt-auto py-6">
         <div className="max-w-7xl mx-auto text-center text-gray-500 text-sm flex flex-col items-center gap-3">
            <span>© 2026 EduQuiz NHC. LH Thạnh 0909091634</span>
            <div className="flex flex-wrap justify-center gap-3">
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase border ${isOnline ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                    <Database size={12}/> {isOnline ? 'Cloud: lchfhsio...' : 'DB Offline'}
                </div>
                <div 
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase border cursor-help ${isAIReady ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-red-50 text-red-700 border-red-200'}`}
                  title={isAIReady ? "Hệ thống AI đã sẵn sàng" : "Thiếu API_KEY hoặc cần Redeploy lại trên Vercel"}
                >
                    <Sparkles size={12}/> {isAIReady ? 'AI Ready' : 'AI No Key'}
                </div>
            </div>
         </div>
      </footer>

      {isChangePassOpen && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
              <h3 className="font-bold text-gray-800 flex items-center gap-2"><Key size={18}/> Đổi Mật Khẩu</h3>
              <button onClick={() => setIsChangePassOpen(false)} className="text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-full p-1">
                 <XCircle size={20}/>
              </button>
            </div>
            <form onSubmit={handleChangePass} className="p-5 space-y-4">
               {msg && (
                   <div className={`text-sm p-3 rounded-lg border ${msg.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                       {msg.text}
                   </div>
               )}
               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu hiện tại</label>
                 <input 
                    type="password" 
                    required 
                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none" 
                    value={currentPassInput} 
                    onChange={e => setCurrentPassInput(e.target.value)} 
                    placeholder="Nhập mật khẩu cũ"
                 />
               </div>
               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu mới</label>
                 <input 
                    type="password" 
                    required 
                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none" 
                    value={newPassInput} 
                    onChange={e => setNewPassInput(e.target.value)} 
                    placeholder="Nhập mật khẩu mới"
                    minLength={3}
                 />
               </div>
               <div className="pt-2">
                   <button 
                        type="submit" 
                        disabled={isSubmitting}
                        className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-200 disabled:opacity-70"
                   >
                        {isSubmitting ? 'Đang lưu...' : 'Lưu Thay Đổi'}
                   </button>
               </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
