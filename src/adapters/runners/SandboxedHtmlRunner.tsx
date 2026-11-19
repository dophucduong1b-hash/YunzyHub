import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Database,
  FileCode,
  Info,
  PackageCheck,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { toolRepository } from '../../repositories/toolRepository';
import type { ToolFileRecord, ToolManifest } from '../../types/models';
import type {
  RuntimeDiagnosticMessage,
  StorageSyncMessage,
} from './compatRuntime';
import {
  RUNNER_LIMITATIONS_VI,
  SANDBOX_CSP_DIRECTIVE,
  SANDBOX_IFRAME_PERMISSIONS,
} from './cspBuilder';
import { compilePackageToSrcDoc } from './packageBundler';

interface SandboxedHtmlRunnerProps {
  tool: ToolManifest;
  reloadTrigger: number;
  onReloadRequest: () => void;
}

interface DiagnosticEntry {
  id: string;
  level: 'error' | 'warn';
  message: string;
  source?: string;
  lineno?: number;
  timestamp: string;
}

function generateCapabilityToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `cap-${Date.now()}-${Math.random().toString(36).slice(2, 12)}-${Math.random()
    .toString(36)
    .slice(2, 12)}`;
}

export const SandboxedHtmlRunner: React.FC<SandboxedHtmlRunnerProps> = ({
  tool,
  reloadTrigger,
  onReloadRequest,
}) => {
  const [files, setFiles] = useState<ToolFileRecord[] | null>(null);
  const [initialStorage, setInitialStorage] = useState<Record<string, string>>({});
  const [storageKeyCount, setStorageKeyCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeEntryPath, setActiveEntryPath] = useState<string>(
    tool.entryPath || 'index.html'
  );
  const [showInfoPopover, setShowInfoPopover] = useState<boolean>(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticEntry[]>([]);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    setActiveEntryPath(tool.entryPath || 'index.html');
  }, [tool.entryPath, tool.id]);

  // Generate a fresh random capability token on each runner load/reload
  const capabilityToken = useMemo(
    () => generateCapabilityToken(),
    [tool.id, activeEntryPath, reloadTrigger]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDiagnostics([]);

    Promise.all([
      toolRepository.getToolFiles(tool.id),
      toolRepository.getToolStorage(tool.id),
    ])
      .then(([records, storedEntries]) => {
        if (cancelled) return;
        if (!records || records.length === 0) {
          setError('Không tìm thấy dữ liệu công cụ.');
          setFiles([]);
        } else {
          setFiles(records);
          setInitialStorage(storedEntries);
          setStorageKeyCount(Object.keys(storedEntries).length);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Lỗi đọc dữ liệu.');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tool.id, reloadTrigger]);

  // Listen to strictly validated postMessage events from this exact runner iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) {
        return;
      }

      const data = event.data;
      if (!data || typeof data !== 'object') {
        return;
      }

      if (data.toolId !== tool.id || data.token !== capabilityToken) {
        return;
      }

      if (data.type === '__YUNZY_STORAGE_SYNC__') {
        const msg = data as StorageSyncMessage;
        if (msg.op === 'set' || msg.op === 'remove' || msg.op === 'clear') {
          toolRepository
            .applyToolStorageMutation(tool.id, {
              op: msg.op,
              key: msg.key,
              value: msg.value,
            })
            .then(() => toolRepository.getToolStorage(tool.id))
            .then((updated) => {
              setStorageKeyCount(Object.keys(updated).length);
            })
            .catch((err) => {
              setDiagnostics((prev) => [
                ...prev.slice(-9),
                {
                  id: `${Date.now()}-${Math.random()}`,
                  level: 'warn',
                  message:
                    err instanceof Error
                      ? err.message
                      : 'Không thể lưu dữ liệu cục bộ của công cụ.',
                  timestamp: new Date().toLocaleTimeString('vi-VN'),
                },
              ]);
            });
        }
      } else if (data.type === '__YUNZY_RUNTIME_DIAGNOSTIC__') {
        const diag = data as RuntimeDiagnosticMessage;
        setDiagnostics((prev) => [
          ...prev.slice(-9),
          {
            id: `${Date.now()}-${Math.random()}`,
            level: diag.level === 'warn' ? 'warn' : 'error',
            message: String(diag.message || 'Lỗi thực thi trong công cụ'),
            source: diag.source,
            lineno: diag.lineno,
            timestamp: new Date().toLocaleTimeString('vi-VN'),
          },
        ]);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [tool.id, capabilityToken]);

  const htmlCandidates = useMemo(() => {
    if (!files) return [];
    return files
      .filter((f) => /\.(html|htm)$/i.test(f.path))
      .map((f) => f.path);
  }, [files]);

  const compiledResult = useMemo(() => {
    if (!files || files.length === 0) return null;
    try {
      return compilePackageToSrcDoc(files, activeEntryPath, {
        toolId: tool.id,
        capabilityToken,
        initialLocalStorage: initialStorage,
      });
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : 'Lỗi khởi tạo.',
      };
    }
  }, [files, activeEntryPath, tool.id, capabilityToken, initialStorage]);

  const handleClearToolStorage = async () => {
    await toolRepository.applyToolStorageMutation(tool.id, { op: 'clear' });
    setInitialStorage({});
    setStorageKeyCount(0);
    onReloadRequest();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center flex-1 w-full h-full min-h-0">
        <div className="w-7 h-7 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (error || (compiledResult && 'error' in compiledResult)) {
    const errMsg =
      error || (compiledResult && 'error' in compiledResult ? compiledResult.error : '');
    return (
      <div className="flex flex-col items-center justify-center flex-1 w-full h-full min-h-0 p-6 text-center">
        <AlertTriangle className="w-6 h-6 text-rose-500 mb-2" />
        <p className="text-xs text-slate-700 dark:text-slate-300 max-w-sm">
          {errMsg}
        </p>
        <button
          type="button"
          onClick={onReloadRequest}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 text-white dark:bg-white dark:text-slate-900"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Tải lại</span>
        </button>
      </div>
    );
  }

  if (!compiledResult || !('srcDoc' in compiledResult)) {
    return null;
  }

  return (
    <div className="relative flex flex-col flex-1 w-full h-full min-h-0">
      {/* Floating Compact Controls (Top-Right Corner) */}
      <div className="absolute top-1.5 right-2 z-20 flex items-center gap-1 rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl px-1.5 py-1 shadow-xs">
        {diagnostics.length > 0 && (
          <button
            type="button"
            onClick={() => setShowInfoPopover(true)}
            aria-label="Cảnh báo chẩn đoán công cụ"
            title={`${diagnostics.length} thông báo chẩn đoán`}
            className="inline-flex items-center gap-1 px-1.5 py-1 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[11px] font-semibold"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{diagnostics.length}</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setShowInfoPopover((prev) => !prev)}
          aria-label="Thông tin gói và bảo mật"
          title="Thông tin & Bảo mật"
          className={`p-1.5 rounded-lg transition ${
            showInfoPopover
              ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Info className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={onReloadRequest}
          aria-label="Làm mới công cụ"
          title="Làm mới"
          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Info Popover for Entry Point, File Metadata, Vendored Libs, Isolated Storage & Diagnostics */}
      {showInfoPopover && (
        <div className="absolute top-12 right-3 z-30 w-80 sm:w-96 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl p-4 shadow-xl text-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-900 dark:text-white">
              Thông tin &amp; Bảo mật
            </span>
            <button
              type="button"
              onClick={() => setShowInfoPopover(false)}
              aria-label="Đóng thông tin"
              className="p-1 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-1.5 text-slate-700 dark:text-slate-300">
            <div className="flex justify-between">
              <span>Tệp đang chạy:</span>
              <span className="font-mono text-slate-900 dark:text-white">
                {compiledResult.entryPath}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Tài nguyên nội bộ:</span>
              <span className="tabular-nums">
                {compiledResult.resolvedAssetsCount} tệp
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1">
                <Database className="w-3.5 h-3.5 text-sky-500" />
                <span>Lưu trữ cục bộ cô lập:</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="tabular-nums font-medium text-slate-900 dark:text-white">
                  {storageKeyCount} khóa
                </span>
                {storageKeyCount > 0 && (
                  <button
                    type="button"
                    onClick={handleClearToolStorage}
                    title="Xóa dữ liệu localStorage của công cụ này"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Xóa</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {compiledResult.vendoredLibraries.length > 0 && (
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
              <PackageCheck className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>
                Thư viện cục bộ: <strong>{compiledResult.vendoredLibraries.join(', ')}</strong>
              </span>
            </div>
          )}

          {htmlCandidates.length > 1 && (
            <div>
              <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1">
                <FileCode className="w-3.5 h-3.5 inline mr-1" />
                Đổi trang HTML:
              </label>
              <select
                aria-label="Chọn trang HTML"
                value={activeEntryPath}
                onChange={(e) => setActiveEntryPath(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-white"
              >
                {htmlCandidates.map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {candidate}
                  </option>
                ))}
              </select>
            </div>
          )}

          {compiledResult.missingAssets.length > 0 && (
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-800 dark:text-amber-300">
              Thiếu tệp: {compiledResult.missingAssets.join(', ')}
            </div>
          )}

          {diagnostics.length > 0 && (
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-rose-800 dark:text-rose-300">
                  Chẩn đoán thời gian chạy ({diagnostics.length})
                </span>
                <button
                  type="button"
                  onClick={() => setDiagnostics([])}
                  className="text-[11px] text-rose-600 dark:text-rose-400 underline"
                >
                  Ẩn
                </button>
              </div>
              <ul className="space-y-1 max-h-28 overflow-y-auto text-[11px] font-mono text-rose-700 dark:text-rose-200">
                {diagnostics.map((d) => (
                  <li key={d.id} className="break-words">
                    [{d.timestamp}] {d.message}
                    {d.lineno ? ` (dòng ${d.lineno})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
            <div className="font-mono text-[11px] text-slate-600 dark:text-slate-400">
              sandbox="{SANDBOX_IFRAME_PERMISSIONS}"
            </div>
            <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-950 font-mono text-[10px] text-slate-700 dark:text-slate-300 break-all">
              {SANDBOX_CSP_DIRECTIVE}
            </div>
            <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-600 dark:text-slate-400 max-h-28 overflow-y-auto">
              {RUNNER_LIMITATIONS_VI.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Isolated Sandbox Iframe */}
      <div className="relative flex-1 w-full h-full min-h-0 bg-white dark:bg-slate-950">
        <iframe
          ref={iframeRef}
          key={`${tool.id}-${activeEntryPath}-${reloadTrigger}`}
          title={`Khung chạy công cụ ${tool.name}`}
          sandbox="allow-scripts allow-downloads"
          referrerPolicy="no-referrer"
          srcDoc={compiledResult.srcDoc}
          className="w-full h-full border-0 block"
        />
      </div>
    </div>
  );
};
