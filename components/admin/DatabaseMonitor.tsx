import React, { useState, useEffect } from 'react';
import { 
  Database, Activity, HardDrive, RefreshCw, Download, Trash2, 
  CheckCircle2, AlertTriangle, ShieldCheck, Zap, Layers, 
  ExternalLink, Server, Globe, Cpu, ArrowUpRight, Clock,
  FileSpreadsheet, Lock, AlertCircle, BarChart3, HelpCircle
} from 'lucide-react';
import { 
  getDatabaseMetrics, 
  pingDatabase, 
  exportFullDatabaseBackup, 
  clearLocalCache,
  syncAllQuizzesMetadata,
  deduplicateBankQuestions,
  DatabaseMetrics,
  isDatabaseConnected
} from '../../services/storage';

interface DatabaseMonitorProps {
  isSuperAdmin: boolean;
  onShowAlert?: (title: string, message: string, type: 'info' | 'warning' | 'error' | 'success') => void;
  onShowConfirm?: (title: string, message: string, onConfirm: () => void) => void;
}

export default function DatabaseMonitor({
  isSuperAdmin,
  onShowAlert,
  onShowConfirm
}: DatabaseMonitorProps) {
  const [metrics, setMetrics] = useState<DatabaseMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPinging, setIsPinging] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [lastPingTime, setLastPingTime] = useState<number | null>(null);

  const fetchMetrics = async () => {
    setIsLoading(true);
    try {
      const data = await getDatabaseMetrics();
      setMetrics(data);
      setLastPingTime(data.latencyMs);
    } catch (e: any) {
      console.error("Lỗi lấy dữ liệu giám sát CSDL:", e);
      if (onShowAlert) {
        onShowAlert("Lỗi tải thông tin", "Không thể lấy dữ liệu thống kê CSDL: " + (e.message || "Lỗi không xác định"), "error");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  const handlePingTest = async () => {
    setIsPinging(true);
    try {
      const latency = await pingDatabase();
      setLastPingTime(latency);
      if (metrics) {
        setMetrics({
          ...metrics,
          latencyMs: latency,
          status: latency < 0 ? 'disconnected' : latency > 800 ? 'warning' : 'optimal'
        });
      }
      if (onShowAlert) {
        if (latency >= 0) {
          onShowAlert("Kiểm tra kết nối", `Thời gian phản hồi Cloud Firestore: ${latency} ms (Trạng thái: Tốt)`, "success");
        } else {
          onShowAlert("Mất kết nối", "Không thể ping tới Cloud Firestore. Vui lòng kiểm tra mạng!", "error");
        }
      }
    } finally {
      setIsPinging(false);
    }
  };

  const handleExportBackup = async () => {
    if (!isSuperAdmin) {
      if (onShowAlert) onShowAlert("Không có quyền", "Chỉ Tổng Quản Trị (SuperAdmin) mới có quyền xuất bản sao lưu CSDL.", "warning");
      return;
    }

    setIsExporting(true);
    try {
      const jsonString = await exportFullDatabaseBackup();
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
      a.download = `eduquiz_database_backup_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (onShowAlert) {
        onShowAlert("Sao lưu thành công", "Đã tải xuống file bản sao lưu JSON toàn bộ Cơ sở dữ liệu EduQuiz VN!", "success");
      }
    } catch (e: any) {
      if (onShowAlert) {
        onShowAlert("Lỗi sao lưu", "Không thể xuất bản sao lưu: " + (e.message || "Lỗi không xác định"), "error");
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleOptimizeDatabase = async () => {
    if (!isSuperAdmin) return;
    const confirmAction = () => {
      setIsOptimizing(true);
      setTimeout(async () => {
        try {
          const syncCount = await syncAllQuizzesMetadata();
          const dedupCount = await deduplicateBankQuestions();
          await fetchMetrics();
          if (onShowAlert) {
            onShowAlert(
              "Tối ưu hoàn tất",
              `Đã tối ưu hóa CSDL:\n• Đồng bộ metadata: ${syncCount} đề thi\n• Loại bỏ câu hỏi trùng lặp trong Ngân hàng: ${dedupCount} câu\n• Giúp giảm dung lượng và tăng tốc độ tải trang!`,
              "success"
            );
          }
        } catch (e: any) {
          if (onShowAlert) {
            onShowAlert("Lỗi tối ưu", "Không thể hoàn tất tối ưu: " + (e.message || "Lỗi"), "error");
          }
        } finally {
          setIsOptimizing(false);
        }
      }, 100);
    };

    if (onShowConfirm) {
      onShowConfirm(
        "Tối ưu & Dọn dẹp CSDL",
        "Hệ thống sẽ đồng bộ lại Metadata đề thi và loại bỏ các câu hỏi trùng lặp trong Ngân hàng câu hỏi nhằm tiết kiệm dung lượng và băng thông. Tiếp tục?",
        confirmAction
      );
    } else {
      if (confirm("Hệ thống sẽ đồng bộ lại Metadata đề thi và loại bỏ các câu hỏi trùng lặp trong Ngân hàng câu hỏi nhằm tiết kiệm dung lượng và băng thông. Tiếp tục?")) {
        confirmAction();
      }
    }
  };

  const handleClearCache = () => {
    const doClear = () => {
      clearLocalCache();
    };

    if (onShowConfirm) {
      onShowConfirm(
        "Xóa bộ nhớ đệm (Cache)",
        "Thao tác này sẽ xóa sạch cache tạm thời trên trình duyệt máy bạn và tải lại ứng dụng. Dữ liệu trên Cloud Firestore sẽ không bị ảnh hưởng. Bạn có muốn tiếp tục?",
        doClear
      );
    } else {
      if (confirm("Xóa cache trình duyệt và tải lại trang?")) {
        doClear();
      }
    }
  };

  const formatBytes = (bytes: number, decimals: number = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const isConnected = metrics?.connected ?? isDatabaseConnected();

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
              <Database size={24} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-800 uppercase tracking-tight">
                Giám sát CSDL & Băng thông
              </h1>
              <p className="text-xs font-bold text-slate-500 mt-0.5">
                Theo dõi tình trạng kết nối, dung lượng lưu trữ, lưu lượng mạng và hạn mức Cloud Firestore
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handlePingTest}
            disabled={isPinging || isLoading}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl font-black text-[11px] uppercase transition-all shadow-sm active:scale-95 disabled:opacity-50"
            title="Đo thời gian phản hồi thực tế tới Cloud Firestore"
          >
            <Activity size={15} className={`text-blue-600 ${isPinging ? 'animate-spin' : ''}`} />
            <span>{isPinging ? 'Đang Ping...' : 'Kiểm tra Ping'}</span>
          </button>

          <button
            type="button"
            onClick={fetchMetrics}
            disabled={isLoading}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl font-black text-[11px] uppercase transition-all shadow-sm active:scale-95 disabled:opacity-50"
            title="Làm mới lại toàn bộ số liệu thống kê"
          >
            <RefreshCw size={15} className={`text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>

          {isSuperAdmin && (
            <>
              <button
                type="button"
                onClick={handleExportBackup}
                disabled={isExporting || isLoading || !isConnected}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl font-black text-[11px] uppercase transition-all shadow-md active:scale-95 disabled:opacity-50"
                title="Tải về file sao lưu JSON toàn bộ dữ liệu"
              >
                <Download size={15} className={isExporting ? 'animate-bounce' : ''} />
                <span>{isExporting ? 'Đang xuất...' : 'Sao lưu CSDL (JSON)'}</span>
              </button>

              <button
                type="button"
                onClick={handleOptimizeDatabase}
                disabled={isOptimizing || isLoading || !isConnected}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded-xl font-black text-[11px] uppercase transition-all shadow-md active:scale-95 disabled:opacity-50"
                title="Đồng bộ metadata và lọc sạch câu hỏi trùng lặp"
              >
                <Zap size={15} className={isOptimizing ? 'animate-spin' : ''} />
                <span>{isOptimizing ? 'Đang tối ưu...' : 'Tối ưu CSDL'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Hero Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1: Trạng thái & Latency */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Trạng thái CSDL</span>
            <div className={`p-2 rounded-xl ${
              isConnected ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
            }`}>
              {isConnected ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-black ${
                isConnected ? 'text-slate-800' : 'text-red-600'
              }`}>
                {isConnected ? 'Hoạt động tốt' : 'Mất kết nối'}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs font-bold">
              <span className="text-slate-500">Độ trễ Latency:</span>
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-black ${
                (lastPingTime || 0) < 300 
                  ? 'bg-emerald-100 text-emerald-800' 
                  : (lastPingTime || 0) < 800 
                  ? 'bg-amber-100 text-amber-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                {lastPingTime !== null && lastPingTime >= 0 ? `${lastPingTime} ms` : 'N/A'}
              </span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-medium">
            <span>Firebase Firestore</span>
            <span className="text-emerald-600 font-bold">Online</span>
          </div>
        </div>

        {/* Card 2: Dung lượng CSDL ước tính */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Dung lượng CSDL</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <HardDrive size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-800">
              {formatBytes(metrics?.totalEstimatedSizeBytes || 0)}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs font-bold text-slate-500">
              <span>Hạn mức Free: 1.0 GB</span>
              <span className="text-blue-600 font-black">
                {metrics?.quotas?.estimatedStorageUsedPercent ?? 0}%
              </span>
            </div>
          </div>
          <div className="mt-3 w-full bg-slate-100 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-blue-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.max(2, metrics?.quotas?.estimatedStorageUsedPercent ?? 0)}%` }}
            />
          </div>
        </div>

        {/* Card 3: Tổng số bản ghi (Documents) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Tổng số bản ghi</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Layers size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-800">
              {(metrics?.totalDocuments || 0).toLocaleString()} <span className="text-sm font-bold text-slate-400">docs</span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-slate-500">
              <span>Trải dài trên</span>
              <span className="text-indigo-600 font-black">{metrics?.collections?.length || 9} Collections</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-medium">
            <span>Dữ liệu đồng bộ</span>
            <span className="text-slate-600 font-bold">Thời gian thực</span>
          </div>
        </div>

        {/* Card 4: Bộ nhớ Cache Trình duyệt */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Cache Trình duyệt</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <Cpu size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-800">
              {formatBytes(metrics?.localCacheSizeBytes || 0)}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs font-bold text-slate-500">
              <span>LocalStorage & State</span>
              <button 
                onClick={handleClearCache}
                className="text-amber-600 hover:text-amber-700 underline text-[11px] font-bold"
              >
                Dọn dẹp
              </button>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-medium">
            <span>Client Storage</span>
            <span className="text-emerald-600 font-bold">Tối ưu</span>
          </div>
        </div>
      </div>

      {/* Main Breakdown: Collections Storage & Firebase Free Quotas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Chi tiết từng Bảng / Collection */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-slate-100 text-slate-700 rounded-xl">
                <BarChart3 size={20} />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">
                  Phân tích Dung lượng từng Bảng (Collections)
                </h3>
                <p className="text-xs font-medium text-slate-500">
                  Số lượng document và dung lượng lưu trữ ước tính chi tiết
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-slate-400 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
              {metrics?.collections?.length || 0} bảng
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-black uppercase text-[10px] tracking-wider">
                  <th className="pb-3 px-3">Bảng / Collection</th>
                  <th className="pb-3 px-3">Mô tả dữ liệu</th>
                  <th className="pb-3 px-3 text-right">Số bản ghi (Docs)</th>
                  <th className="pb-3 px-3 text-right">Dung lượng ước tính</th>
                  <th className="pb-3 px-3 text-right">Tỷ trọng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {metrics?.collections?.map((col) => {
                  const totalBytes = metrics?.totalEstimatedSizeBytes || 1;
                  const percent = Math.round((col.estimatedSizeBytes / totalBytes) * 100) || 0;
                  return (
                    <tr key={col.name} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-3">
                        <div className="font-black text-slate-800">{col.label}</div>
                        <code className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-mono">
                          {col.name}
                        </code>
                      </td>
                      <td className="py-3.5 px-3 text-slate-500 max-w-[220px]">
                        {col.description}
                      </td>
                      <td className="py-3.5 px-3 text-right font-black text-slate-800">
                        {col.count.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-3 text-right font-bold text-slate-700">
                        {formatBytes(col.estimatedSizeBytes)}
                      </td>
                      <td className="py-3.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                            <div 
                              className="bg-blue-600 h-full rounded-full"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <span className="font-bold text-slate-600 text-[11px] w-7 text-right">
                            {percent}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Col: Hạn mức Firestore & Băng thông Spark Plan */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-5">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <ShieldCheck size={20} />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">
                  Hạn mức Miễn phí (Free Tier)
                </h3>
                <p className="text-xs font-medium text-slate-500">
                  Chỉ số hạn mức theo gói Google Cloud Firestore
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Lưu trữ */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/60 space-y-2">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-600">Dung lượng lưu trữ (Storage):</span>
                  <span className="text-slate-800 font-black">
                    {formatBytes(metrics?.totalEstimatedSizeBytes || 0)} / 1 GiB
                  </span>
                </div>
                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-emerald-500 h-full rounded-full"
                    style={{ width: `${Math.max(2, metrics?.quotas?.estimatedStorageUsedPercent ?? 0)}%` }}
                  />
                </div>
                <div className="text-[10px] text-slate-400 flex justify-between font-medium">
                  <span>Trạng thái: An toàn (Dưới 1%)</span>
                  <span>1,024 MB miễn phí</span>
                </div>
              </div>

              {/* Băng thông ra (Egress Bandwidth) */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/60 space-y-2">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-600">Băng thông mạng ra (Egress):</span>
                  <span className="text-slate-800 font-black">10 GiB / tháng</span>
                </div>
                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                  <div className="bg-blue-500 h-full rounded-full" style={{ width: '3%' }} />
                </div>
                <div className="text-[10px] text-slate-400 flex justify-between font-medium">
                  <span>Miễn phí 10GB/tháng</span>
                  <span>Đã tối ưu hóa Metadata</span>
                </div>
              </div>

              {/* Lượt Đọc/Ghi hàng ngày */}
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 text-center">
                  <div className="text-[10px] font-black uppercase text-slate-400">Đọc (Reads / ngày)</div>
                  <div className="text-base font-black text-slate-800 mt-1">50,000</div>
                  <div className="text-[9px] text-emerald-600 font-bold mt-0.5">Miễn phí mỗi ngày</div>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 text-center">
                  <div className="text-[10px] font-black uppercase text-slate-400">Ghi (Writes / ngày)</div>
                  <div className="text-base font-black text-slate-800 mt-1">20,000</div>
                  <div className="text-[9px] text-emerald-600 font-bold mt-0.5">Miễn phí mỗi ngày</div>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <a
                href={`https://console.firebase.google.com/project/${metrics?.projectId}/firestore/usage`}
                target="_blank"
                rel="noreferrer"
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-black text-white text-xs font-black uppercase rounded-xl transition-all shadow-sm"
              >
                <span>Xem biểu đồ trên Firebase Console</span>
                <ExternalLink size={14} />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Cloud Configuration & Technical Information */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
            <Server size={20} />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">
              Thông số Kỹ thuật & Hạ tầng Cloud
            </h3>
            <p className="text-xs font-medium text-slate-500">
              Chi tiết cấu hình định danh cơ sở dữ liệu đã liên kết
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/60">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Project ID</span>
            <p className="text-xs font-mono font-bold text-slate-800 mt-1 break-all select-all">
              {metrics?.projectId || 'ai-studio-applet-webapp-7d6a6'}
            </p>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/60">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Database ID</span>
            <p className="text-xs font-mono font-bold text-slate-800 mt-1 break-all select-all">
              {metrics?.databaseId || 'ai-studio-eduquizvn-...'}
            </p>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/60">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Storage Bucket</span>
            <p className="text-xs font-mono font-bold text-slate-800 mt-1 break-all select-all">
              {metrics?.storageBucket || 'ai-studio-applet-...'}
            </p>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/60">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Kiến trúc Tối ưu</span>
            <p className="text-xs font-bold text-emerald-700 mt-1">
              Metadata Indexing + Lazy Load
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
