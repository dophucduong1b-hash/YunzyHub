import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  HardDrive,
  Info,
  Monitor,
  Moon,
  Palette,
  Sun,
  Trash2,
  Upload,
  Vibrate,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  RUNNER_LIMITATIONS_VI,
  SANDBOX_CSP_DIRECTIVE,
} from '../adapters/runners/cspBuilder';
import { HapticTapOverlay } from '../components/HapticTapOverlay';
import { PWAInstallButton } from '../components/PWAInstallButton';
import {
  formatBytes,
  toolRepository,
  type ThemeMode,
} from '../repositories/toolRepository';
import type { ToolManifest } from '../types/models';
import { haptic } from '../utils/haptics';

interface SettingsPageProps {
  tools: ToolManifest[];
  theme: ThemeMode;
  onThemeChange: (nextTheme: ThemeMode) => void;
  hapticsEnabled?: boolean;
  onHapticsEnabledChange?: (enabled: boolean) => void;
}

const SEGMENT_SPRING = {
  type: 'spring' as const,
  stiffness: 500,
  damping: 36,
  mass: 0.72,
};

export const SettingsPage: React.FC<SettingsPageProps> = ({
  tools,
  theme,
  onThemeChange,
  hapticsEnabled = true,
  onHapticsEnabledChange,
}) => {
  const [storageEstimate, setStorageEstimate] = useState<{
    usage: number;
    quota: number;
  } | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [showAdvancedInfo, setShowAdvancedInfo] = useState(false);

  const backupInputRef = useRef<HTMLInputElement | null>(null);

  const totalPackagedBytes = tools.reduce(
    (acc, t) => acc + (t.sizeBytes || 0),
    0
  );
  const maxSafeBudget = 25 * 1024 * 1024;
  const usagePercent = Math.min(
    100,
    Math.max(2, Math.round((totalPackagedBytes / maxSafeBudget) * 100))
  );

  useEffect(() => {
    if (
      typeof navigator !== 'undefined' &&
      navigator.storage &&
      navigator.storage.estimate
    ) {
      navigator.storage
        .estimate()
        .then((est) => {
          setStorageEstimate({
            usage: est.usage || 0,
            quota: est.quota || 0,
          });
        })
        .catch(() => {
          setStorageEstimate(null);
        });
    }
  }, [tools]);

  const handleExportBackup = async () => {
    haptic.light();
    setBusy(true);
    setStatusMessage(null);
    try {
      const payload = await toolRepository.exportVersionedBackup();
      const jsonStr = JSON.stringify(payload, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement('a');
        const dateStr = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `yunzyhub-backup-v1-${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }

      haptic.success();
      setStatusMessage({
        type: 'success',
        text: `Đã sao lưu ${payload.tools.length} công cụ.`,
      });
    } catch (err) {
      haptic.warning();
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Lỗi sao lưu.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleImportBackupFile = async (file: File) => {
    setBusy(true);
    setStatusMessage(null);
    try {
      const text = await file.text();
      const result = await toolRepository.importVersionedBackup(
        text,
        importMode
      );
      haptic.success();
      setStatusMessage({
        type: 'success',
        text: `Đã khôi phục ${result.importedToolsCount} công cụ.`,
      });
    } catch (err) {
      haptic.warning();
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Tệp sao lưu không hợp lệ.',
      });
    } finally {
      setBusy(false);
      if (backupInputRef.current) {
        backupInputRef.current.value = '';
      }
    }
  };

  const handleClearAll = async () => {
    haptic.warning();
    setBusy(true);
    setStatusMessage(null);
    try {
      await toolRepository.clearAllData();
      setConfirmClearAll(false);
      setStatusMessage({
        type: 'success',
        text: 'Đã xóa toàn bộ dữ liệu.',
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Lỗi xóa dữ liệu.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-base sm:text-lg font-semibold tracking-tight text-neutral-950 dark:text-white">
          Cài đặt
        </h1>
        <div className="flex items-center gap-2">
          <PWAInstallButton />
          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={() => {
              haptic.light();
              setShowAdvancedInfo((prev) => !prev);
            }}
            aria-label="Thông tin kỹ thuật và bảo mật"
            title="Thông tin"
            className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
              showAdvancedInfo
                ? 'border-neutral-900/20 dark:border-white/25 bg-neutral-900/[0.06] dark:bg-white/[0.12] text-neutral-950 dark:text-white font-semibold'
                : 'border-black/[0.07] dark:border-white/[0.09] bg-white dark:bg-[#161618] text-neutral-700 dark:text-neutral-200'
            }`}
          >
            <HapticTapOverlay />
            <Info className="w-3.5 h-3.5" />
            <span>Thông tin</span>
          </motion.button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {statusMessage && (
          <motion.div
            key="settings-status"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            role="status"
            className={`px-4 py-3 rounded-2xl border flex items-center gap-2.5 text-xs font-medium ${
              statusMessage.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-900 dark:text-emerald-200'
                : 'bg-rose-500/10 border-rose-500/25 text-rose-900 dark:text-rose-200'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            )}
            <span>{statusMessage.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Clean Grouped Settings Card */}
      <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#161618] divide-y divide-black/[0.06] dark:divide-white/[0.07] overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        {/* Theme */}
        <div className="px-4 sm:px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Palette className="w-4 h-4 text-neutral-500 dark:text-neutral-400 shrink-0" />
            <span className="text-sm font-medium text-neutral-900 dark:text-white">
              Giao diện
            </span>
          </div>

          <div
            className="inline-flex p-1 rounded-xl bg-black/[0.05] dark:bg-white/[0.07]"
            role="group"
            aria-label="Chọn giao diện"
          >
            {(
              [
                { id: 'light', label: 'Sáng', icon: Sun },
                { id: 'dark', label: 'Tối', icon: Moon },
                { id: 'system', label: 'Hệ thống', icon: Monitor },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const active = theme === item.id;
              return (
                <motion.button
                  key={item.id}
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  aria-label={item.label}
                  onClick={() => onThemeChange(item.id)}
                  className={`relative inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    active
                      ? 'text-neutral-950 dark:text-white font-semibold'
                      : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  <HapticTapOverlay />
                  {active && (
                    <motion.span
                      layoutId="theme-segment-pill"
                      transition={SEGMENT_SPRING}
                      className="absolute inset-0 rounded-lg bg-white dark:bg-[#2C2C2E] shadow-2xs"
                    />
                  )}
                  <Icon className="relative z-10 w-3.5 h-3.5" />
                  <span className="relative z-10">{item.label}</span>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Haptic Feedback */}
        <div className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Vibrate className="w-4 h-4 text-neutral-500 dark:text-neutral-400 shrink-0" />
            <span className="text-sm font-medium text-neutral-900 dark:text-white">
              Phản hồi rung
            </span>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={hapticsEnabled}
            aria-label="Phản hồi rung"
            onClick={() => onHapticsEnabledChange?.(!hapticsEnabled)}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B35]/50 ${
              hapticsEnabled
                ? 'bg-[#34C759] dark:bg-[#30D158]'
                : 'bg-black/[0.14] dark:bg-white/[0.18]'
            }`}
          >
            <HapticTapOverlay forceEnable />
            <motion.span
              layout
              transition={{ type: 'spring', stiffness: 560, damping: 32 }}
              className={`pointer-events-none block h-6 w-6 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.22)] ${
                hapticsEnabled ? 'ml-auto' : 'mr-auto'
              }`}
            />
          </button>
        </div>

        {/* Storage */}
        <div className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <HardDrive className="w-4 h-4 text-neutral-500 dark:text-neutral-400 shrink-0" />
            <span className="text-sm font-medium text-neutral-900 dark:text-white">
              Lưu trữ
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <div
              className="w-24 sm:w-28 h-1.5 rounded-full bg-black/[0.07] dark:bg-white/[0.1] overflow-hidden"
              aria-hidden="true"
            >
              <div
                className="h-full rounded-full bg-neutral-900 dark:bg-white transition-all duration-300"
                style={{ width: `${usagePercent}%` }}
              />
            </div>
            <span className="text-xs font-mono tabular-nums font-medium text-neutral-800 dark:text-neutral-200">
              {formatBytes(totalPackagedBytes)}
            </span>
          </div>
        </div>

        {/* Export Backup */}
        <div className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Download className="w-4 h-4 text-neutral-500 dark:text-neutral-400 shrink-0" />
            <span className="text-sm font-medium text-neutral-900 dark:text-white">
              Sao lưu
            </span>
          </div>

          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            disabled={busy}
            onClick={handleExportBackup}
            className="relative px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-neutral-950 transition-colors disabled:opacity-50"
          >
            <HapticTapOverlay disabled={busy} />
            Tải về
          </motion.button>
        </div>

        {/* Import Backup */}
        <div className="px-4 sm:px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Upload className="w-4 h-4 text-neutral-500 dark:text-neutral-400 shrink-0" />
            <span className="text-sm font-medium text-neutral-900 dark:text-white">
              Khôi phục
            </span>
          </div>

          <div className="flex items-center gap-2">
            <select
              aria-label="Chế độ khôi phục"
              value={importMode}
              onChange={(e) => {
                haptic.selection();
                setImportMode(e.target.value as 'merge' | 'replace');
              }}
              className="rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-[#F5F5F7] dark:bg-[#1F1F23] px-2.5 py-1.5 text-xs font-medium text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40"
            >
              <option value="merge">Gộp</option>
              <option value="replace">Thay thế</option>
            </select>

            <input
              ref={backupInputRef}
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportBackupFile(f);
              }}
              className="hidden"
              aria-label="Chọn tệp sao lưu"
            />
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              disabled={busy}
              onClick={() => {
                haptic.light();
                backupInputRef.current?.click();
              }}
              className="relative px-3.5 py-1.5 rounded-xl text-xs font-semibold border border-black/[0.09] dark:border-white/[0.12] bg-white dark:bg-[#1F1F23] text-neutral-900 dark:text-white hover:bg-neutral-50 dark:hover:bg-[#2A2A2E] transition-colors disabled:opacity-50"
            >
              <HapticTapOverlay disabled={busy} />
              Chọn tệp
            </motion.button>
          </div>
        </div>

        {/* Clear All Data */}
        <div className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Trash2 className="w-4 h-4 text-rose-500 shrink-0" />
            <span className="text-sm font-medium text-neutral-900 dark:text-white">
              Xóa dữ liệu
            </span>
          </div>

          {!confirmClearAll ? (
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              disabled={busy}
              onClick={() => {
                haptic.warning();
                setConfirmClearAll(true);
              }}
              className="relative px-3.5 py-1.5 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              <HapticTapOverlay disabled={busy} />
              Xóa hết
            </motion.button>
          ) : (
            <div className="flex items-center gap-2">
              <motion.button
                type="button"
                whileTap={{ scale: 0.94 }}
                disabled={busy}
                onClick={handleClearAll}
                className="relative px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-500 transition-colors"
              >
                <HapticTapOverlay disabled={busy} />
                Xác nhận
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.94 }}
                onClick={() => {
                  haptic.light();
                  setConfirmClearAll(false);
                }}
                className="relative px-2.5 py-1.5 rounded-lg text-xs text-neutral-600 dark:text-neutral-300"
              >
                <HapticTapOverlay />
                Hủy
              </motion.button>
            </div>
          )}
        </div>
      </div>

      {/* Collapsible Advanced Info */}
      <AnimatePresence initial={false}>
        {showAdvancedInfo && (
          <motion.div
            key="settings-advanced-info"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#161618] p-4 sm:p-5 space-y-3 text-xs"
          >
            <div className="flex items-center justify-between text-neutral-800 dark:text-neutral-200 font-semibold">
              <span>Bảo mật &amp; Lưu trữ</span>
              {storageEstimate && storageEstimate.quota > 0 && (
                <span className="font-mono tabular-nums">
                  {formatBytes(storageEstimate.usage)} /{' '}
                  {formatBytes(storageEstimate.quota)}
                </span>
              )}
            </div>

            <div className="p-2.5 rounded-xl bg-[#F5F5F7] dark:bg-[#0A0A0C] font-mono text-[11px] text-neutral-700 dark:text-neutral-300 break-all">
              {SANDBOX_CSP_DIRECTIVE}
            </div>

            <ul className="list-disc pl-5 space-y-1 text-neutral-600 dark:text-neutral-400">
              {RUNNER_LIMITATIONS_VI.map((lim, idx) => (
                <li key={idx}>{lim}</li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
