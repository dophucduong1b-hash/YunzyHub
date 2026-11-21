import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  BookOpen,
  CheckCircle2,
  Database,
  Download,
  Hand,
  HardDrive,
  History,
  Info,
  Layers,
  Monitor,
  Moon,
  Palette,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Type,
  Upload,
  Vibrate,
  X,
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
  type AppFontFamily,
  type ThemeMode,
  type WorkspaceTabBarPosition,
} from '../repositories/toolRepository';
import type { ToolManifest } from '../types/models';
import { APP_VERSION } from '../utils/appVersion';
import { APP_FONT_OPTIONS } from '../utils/fonts';
import { haptic } from '../utils/haptics';

interface SettingsPageProps {
  tools: ToolManifest[];
  theme: ThemeMode;
  onThemeChange: (nextTheme: ThemeMode) => void;
  fontFamily?: AppFontFamily;
  onFontFamilyChange?: (font: AppFontFamily) => void;
  fontScale?: number;
  onFontScaleChange?: (scale: number) => void;
  workspaceTabBarPosition?: WorkspaceTabBarPosition;
  onWorkspaceTabBarPositionChange?: (position: WorkspaceTabBarPosition) => void;
  hapticsEnabled?: boolean;
  onHapticsEnabledChange?: (enabled: boolean) => void;
  reducedMotion?: boolean;
  onReducedMotionChange?: (enabled: boolean) => void;
  swipeBackHome?: boolean;
  onSwipeBackHomeChange?: (enabled: boolean) => void;
  openAfterImportDefault?: boolean;
  onOpenAfterImportDefaultChange?: (enabled: boolean) => void;
  workspaceTabCount?: number;
  onCloseAllWorkspaceTabs?: () => Promise<void> | void;
  toolStorageCount?: number;
  toolStorageBytes?: number;
  historyCount?: number;
}

const APPLE_EASE = [0.22, 1, 0.36, 1] as const;

const SEGMENT_SPRING = {
  type: 'spring' as const,
  stiffness: 420,
  damping: 40,
  mass: 0.8,
};

interface SettingsSwitchRowProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  subtitle?: string;
  checked: boolean;
  onToggle: (next: boolean) => void;
  forceHapticOverlay?: boolean;
}

const SettingsSwitchRow: React.FC<SettingsSwitchRowProps> = ({
  icon: Icon,
  label,
  subtitle,
  checked,
  onToggle,
  forceHapticOverlay = false,
}) => (
  <div className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3">
    <div className="flex items-center gap-3 min-w-0">
      <Icon className="w-4 h-4 text-neutral-500 dark:text-neutral-400 shrink-0" />
      <div className="min-w-0">
        <span className="block text-sm font-medium text-neutral-900 dark:text-white">
          {label}
        </span>
        {subtitle && (
          <span className="block text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
            {subtitle}
          </span>
        )}
      </div>
    </div>

    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onToggle(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B35]/50 ${
        checked
          ? 'bg-[#34C759] dark:bg-[#30D158]'
          : 'bg-black/[0.14] dark:bg-white/[0.18]'
      }`}
    >
      <HapticTapOverlay forceEnable={forceHapticOverlay} />
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 460, damping: 36 }}
        className={`pointer-events-none block h-6 w-6 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.22)] ${
          checked ? 'ml-auto' : 'mr-auto'
        }`}
      />
    </button>
  </div>
);

export const SettingsPage: React.FC<SettingsPageProps> = ({
  tools,
  theme,
  onThemeChange,
  fontFamily = 'system',
  onFontFamilyChange,
  fontScale = 1.0,
  onFontScaleChange,
  workspaceTabBarPosition = 'top',
  onWorkspaceTabBarPositionChange,
  hapticsEnabled = true,
  onHapticsEnabledChange,
  reducedMotion = false,
  onReducedMotionChange,
  swipeBackHome = true,
  onSwipeBackHomeChange,
  openAfterImportDefault = true,
  onOpenAfterImportDefaultChange,
  workspaceTabCount = 0,
  onCloseAllWorkspaceTabs,
  toolStorageCount = 0,
  toolStorageBytes = 0,
  historyCount = 0,
}) => {
  const [storageEstimate, setStorageEstimate] = useState<{
    usage: number;
    quota: number;
  } | null>(null);
  const [isPersisted, setIsPersisted] = useState<boolean | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmClearStorage, setConfirmClearStorage] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [showAdvancedInfo, setShowAdvancedInfo] = useState(false);
  const [showUserGuide, setShowUserGuide] = useState(false);
  const [sliderScale, setSliderScale] = useState(fontScale);

  useEffect(() => {
    setSliderScale(fontScale);
  }, [fontScale]);

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

    if (
      typeof navigator !== 'undefined' &&
      navigator.storage &&
      typeof navigator.storage.persisted === 'function'
    ) {
      navigator.storage
        .persisted()
        .then((persisted) => setIsPersisted(Boolean(persisted)))
        .catch(() => setIsPersisted(null));
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

  const handleCloseAllTabs = async () => {
    haptic.light();
    setBusy(true);
    setStatusMessage(null);
    try {
      await onCloseAllWorkspaceTabs?.();
      haptic.success();
      setStatusMessage({
        type: 'success',
        text: 'Đã đóng toàn bộ thẻ trong Không gian.',
      });
    } catch (err) {
      haptic.warning();
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Không thể đóng thẻ.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleClearToolStorage = async () => {
    haptic.warning();
    setBusy(true);
    setStatusMessage(null);
    try {
      const cleared = await toolRepository.clearAllToolStorage();
      setConfirmClearStorage(false);
      haptic.success();
      setStatusMessage({
        type: 'success',
        text: `Đã dọn dữ liệu cục bộ của ${cleared} công cụ.`,
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Lỗi dọn dữ liệu công cụ.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleClearHistory = async () => {
    haptic.light();
    setBusy(true);
    setStatusMessage(null);
    try {
      await toolRepository.clearHistory();
      haptic.success();
      setStatusMessage({
        type: 'success',
        text: 'Đã xóa lịch sử mở gần đây.',
      });
    } catch (err) {
      haptic.warning();
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Lỗi xóa lịch sử.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRequestPersistentStorage = async () => {
    haptic.light();
    if (
      typeof navigator === 'undefined' ||
      !navigator.storage ||
      typeof navigator.storage.persist !== 'function'
    ) {
      setStatusMessage({
        type: 'error',
        text: 'Trình duyệt hiện tại không hỗ trợ bảo vệ bộ nhớ.',
      });
      return;
    }
    setBusy(true);
    setStatusMessage(null);
    try {
      const granted = await navigator.storage.persist();
      setIsPersisted(Boolean(granted));
      if (granted) {
        haptic.success();
        setStatusMessage({
          type: 'success',
          text: 'Đã bật bảo vệ bộ nhớ bền vững khỏi tự động dọn cache.',
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: 'Hệ thống chưa cấp quyền bộ nhớ bền vững (hãy mở từ Màn hình chính).',
        });
      }
    } catch {
      setStatusMessage({
        type: 'error',
        text: 'Không thể yêu cầu quyền bộ nhớ bền vững.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCheckUpdate = async () => {
    haptic.light();
    if (
      typeof navigator === 'undefined' ||
      !('serviceWorker' in navigator)
    ) {
      setStatusMessage({
        type: 'error',
        text: 'Chưa có Service Worker đang hoạt động.',
      });
      return;
    }
    setBusy(true);
    setStatusMessage(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        setStatusMessage({
          type: 'error',
          text: 'Chưa có Service Worker đang hoạt động.',
        });
        return;
      }

      await reg.update();

      const applyWaitingAndReload = (sw: ServiceWorker | null) => {
        if (sw) {
          sw.postMessage({ type: 'SKIP_WAITING' });
        }
        setStatusMessage({
          type: 'success',
          text: 'Đang tải bản cập nhật mới...',
        });
        window.setTimeout(() => window.location.reload(), 300);
      };

      if (reg.waiting) {
        applyWaitingAndReload(reg.waiting);
        return;
      }

      if (reg.installing) {
        setStatusMessage({
          type: 'success',
          text: 'Đang tải bản cập nhật mới...',
        });
        const installingWorker = reg.installing;
        await new Promise<void>((resolve) => {
          const timer = window.setTimeout(resolve, 6000);
          installingWorker.addEventListener('statechange', () => {
            if (
              installingWorker.state === 'installed' ||
              installingWorker.state === 'activated' ||
              installingWorker.state === 'redundant'
            ) {
              window.clearTimeout(timer);
              resolve();
            }
          });
        });
        if (reg.waiting || installingWorker.state === 'installed' || installingWorker.state === 'activated') {
          applyWaitingAndReload(reg.waiting);
          return;
        }
      }

      haptic.success();
      setStatusMessage({
        type: 'success',
        text: `Bạn đang dùng phiên bản mới nhất (v${APP_VERSION}).`,
      });
    } catch {
      haptic.warning();
      setStatusMessage({
        type: 'error',
        text: 'Không thể kiểm tra cập nhật lúc này.',
      });
    } finally {
      setBusy(false);
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
            whileTap={{ scale: 0.96 }}
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
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: APPLE_EASE }}
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

      {/* Group 1: Trải nghiệm */}
      <section className="space-y-1.5">
        <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Trải nghiệm
        </h2>
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
                    whileTap={{ scale: 0.96 }}
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

          {/* Font Family Selector (10 Bundled Fonts) */}
          <div className="px-4 sm:px-5 py-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <Type className="w-4 h-4 text-neutral-500 dark:text-neutral-400 shrink-0" />
                <span className="text-sm font-medium text-neutral-900 dark:text-white">
                  Phông chữ
                </span>
              </div>
              <span className="text-xs font-semibold text-[#FF6B35]">
                {APP_FONT_OPTIONS.find((f) => f.id === fontFamily)?.label || 'Hệ thống'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {APP_FONT_OPTIONS.map((opt) => {
                const selected = fontFamily === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      haptic.selection();
                      onFontFamilyChange?.(opt.id);
                    }}
                    style={{ fontFamily: opt.fontFamilyCss }}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border text-left transition-colors ${
                      selected
                        ? 'bg-[#17130F] dark:bg-white border-transparent text-[#F3EEE3] dark:text-[#17130F]'
                        : 'bg-[#F5F5F7] dark:bg-[#1F1F23] border-black/[0.06] dark:border-white/[0.08] text-neutral-600 dark:text-neutral-300'
                    }`}
                  >
                    <span
                      className={`text-[15px] font-bold shrink-0 ${
                        selected ? 'text-[#FF6B35]' : 'text-neutral-900 dark:text-white'
                      }`}
                    >
                      Aa
                    </span>
                    <span className="text-xs font-medium truncate">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Font Size Slider */}
          <div className="px-4 sm:px-5 py-3.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-neutral-900 dark:text-white">
                Kích thước chữ
              </span>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-semibold tabular-nums ${
                    Math.abs(sliderScale - 1.0) < 0.01
                      ? 'text-neutral-500 dark:text-neutral-400'
                      : 'text-[#FF6B35]'
                  }`}
                >
                  {Math.abs(sliderScale - 1.0) < 0.01
                    ? 'Hệ thống (100%)'
                    : `${Math.round(sliderScale * 100)}%`}
                </span>
                {Math.abs(sliderScale - 1.0) >= 0.01 && (
                  <button
                    type="button"
                    onClick={() => {
                      haptic.selection();
                      setSliderScale(1.0);
                      onFontScaleChange?.(1.0);
                    }}
                    className="px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-[#007AFF]/12 text-[#007AFF] dark:text-[#0A84FF]"
                  >
                    Mặc định
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-[11px] font-semibold text-neutral-500">A</span>
              <input
                type="range"
                aria-label="Kích thước chữ"
                min={0.85}
                max={1.3}
                step={0.05}
                value={sliderScale}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setSliderScale(next);
                  onFontScaleChange?.(next);
                }}
                className="flex-1 accent-[#FF6B35]"
              />
              <span className="text-base font-bold text-neutral-900 dark:text-white">A</span>
            </div>

            <div className="px-3 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#1F1F23] text-[13px] text-neutral-900 dark:text-white">
              Xem trước cỡ chữ
            </div>
          </div>

          <SettingsSwitchRow
            icon={Vibrate}
            label="Phản hồi rung"
            checked={hapticsEnabled}
            forceHapticOverlay
            onToggle={(next) => onHapticsEnabledChange?.(next)}
          />

          <SettingsSwitchRow
            icon={Sparkles}
            label="Giảm chuyển động"
            checked={reducedMotion}
            onToggle={(next) => onReducedMotionChange?.(next)}
          />

          <SettingsSwitchRow
            icon={Hand}
            label="Vuốt trái → phải về Home"
            checked={swipeBackHome}
            onToggle={(next) => onSwipeBackHomeChange?.(next)}
          />

          <SettingsSwitchRow
            icon={Play}
            label="Mở ngay sau khi thêm"
            checked={openAfterImportDefault}
            onToggle={(next) => onOpenAfterImportDefaultChange?.(next)}
          />
        </div>
      </section>

      {/* Group 2: Không gian & Công cụ */}
      <section className="space-y-1.5">
        <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Không gian &amp; Công cụ
        </h2>
        <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#161618] divide-y divide-black/[0.06] dark:divide-white/[0.07] overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          {/* Workspace Tab Bar Position (Top / Bottom) */}
          <div className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <ArrowUpDown className="w-4 h-4 text-neutral-500 dark:text-neutral-400 shrink-0" />
              <span className="text-sm font-medium text-neutral-900 dark:text-white">
                Vị trí thanh tab
              </span>
            </div>

            <div
              className="inline-flex p-1 rounded-xl bg-black/[0.05] dark:bg-white/[0.07]"
              role="group"
              aria-label="Vị trí thanh tab"
            >
              {(
                [
                  { id: 'top', label: 'Trên cùng' },
                  { id: 'bottom', label: 'Dưới cùng' },
                ] as const
              ).map((pos) => {
                const active = workspaceTabBarPosition === pos.id;
                return (
                  <motion.button
                    key={pos.id}
                    type="button"
                    whileTap={{ scale: 0.96 }}
                    onClick={() => {
                      haptic.selection();
                      onWorkspaceTabBarPositionChange?.(pos.id);
                    }}
                    className={`relative px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      active
                        ? 'text-neutral-950 dark:text-white font-semibold'
                        : 'text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="tabbar-pos-pill"
                        transition={SEGMENT_SPRING}
                        className="absolute inset-0 rounded-lg bg-white dark:bg-[#2C2C2E] shadow-2xs"
                      />
                    )}
                    <span className="relative z-10">{pos.label}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Open Workspace Tabs */}
          <div className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Layers className="w-4 h-4 text-neutral-500 dark:text-neutral-400 shrink-0" />
              <div className="min-w-0">
                <span className="block text-sm font-medium text-neutral-900 dark:text-white">
                  Thẻ đang mở
                </span>
                <span className="block text-[11px] font-mono tabular-nums text-neutral-500 dark:text-neutral-400">
                  {workspaceTabCount} thẻ
                </span>
              </div>
            </div>

            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              disabled={busy || workspaceTabCount === 0}
              onClick={handleCloseAllTabs}
              className="relative px-3 py-1.5 rounded-xl text-xs font-semibold border border-black/[0.08] dark:border-white/[0.11] bg-white dark:bg-[#1F1F23] text-neutral-800 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-[#2A2A2E] transition-colors disabled:opacity-40 shrink-0"
            >
              <HapticTapOverlay disabled={busy || workspaceTabCount === 0} />
              Đóng hết
            </motion.button>
          </div>

          {/* Isolated Tool Storage */}
          <div className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Database className="w-4 h-4 text-neutral-500 dark:text-neutral-400 shrink-0" />
              <div className="min-w-0">
                <span className="block text-sm font-medium text-neutral-900 dark:text-white">
                  Dữ liệu lưu của công cụ
                </span>
                <span className="block text-[11px] font-mono tabular-nums text-neutral-500 dark:text-neutral-400">
                  {toolStorageCount} công cụ · {formatBytes(toolStorageBytes)}
                </span>
              </div>
            </div>

            {!confirmClearStorage ? (
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                disabled={busy || toolStorageCount === 0}
                onClick={() => {
                  haptic.warning();
                  setConfirmClearStorage(true);
                }}
                className="relative px-3 py-1.5 rounded-xl text-xs font-semibold border border-black/[0.08] dark:border-white/[0.11] bg-white dark:bg-[#1F1F23] text-neutral-800 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-[#2A2A2E] transition-colors disabled:opacity-40 shrink-0"
              >
                <HapticTapOverlay disabled={busy || toolStorageCount === 0} />
                Dọn
              </motion.button>
            ) : (
              <div className="flex items-center gap-1.5 shrink-0">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  disabled={busy}
                  onClick={handleClearToolStorage}
                  className="relative px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-500 transition-colors"
                >
                  <HapticTapOverlay disabled={busy} />
                  Xác nhận
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={() => {
                    haptic.light();
                    setConfirmClearStorage(false);
                  }}
                  className="relative px-2 py-1.5 rounded-lg text-xs text-neutral-600 dark:text-neutral-300"
                >
                  <HapticTapOverlay />
                  Hủy
                </motion.button>
              </div>
            )}
          </div>

          {/* Recent Launch History */}
          <div className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <History className="w-4 h-4 text-neutral-500 dark:text-neutral-400 shrink-0" />
              <div className="min-w-0">
                <span className="block text-sm font-medium text-neutral-900 dark:text-white">
                  Lịch sử mở gần đây
                </span>
                <span className="block text-[11px] font-mono tabular-nums text-neutral-500 dark:text-neutral-400">
                  {historyCount} mục
                </span>
              </div>
            </div>

            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              disabled={busy || historyCount === 0}
              onClick={handleClearHistory}
              className="relative px-3 py-1.5 rounded-xl text-xs font-semibold border border-black/[0.08] dark:border-white/[0.11] bg-white dark:bg-[#1F1F23] text-neutral-800 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-[#2A2A2E] transition-colors disabled:opacity-40 shrink-0"
            >
              <HapticTapOverlay disabled={busy || historyCount === 0} />
              Xóa
            </motion.button>
          </div>
        </div>
      </section>

      {/* Group 3: Dữ liệu & Hệ thống */}
      <section className="space-y-1.5">
        <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Dữ liệu &amp; Hệ thống
        </h2>
        <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#161618] divide-y divide-black/[0.06] dark:divide-white/[0.07] overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          {/* Storage */}
          <div className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <HardDrive className="w-4 h-4 text-neutral-500 dark:text-neutral-400 shrink-0" />
              <div className="min-w-0">
                <span className="block text-sm font-medium text-neutral-900 dark:text-white">
                  Lưu trữ
                </span>
                <span className="block text-[11px] font-mono tabular-nums text-neutral-500 dark:text-neutral-400">
                  {tools.length} công cụ
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
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

          {/* Persistent Storage */}
          {isPersisted !== null && (
            <div className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <ShieldCheck className="w-4 h-4 text-neutral-500 dark:text-neutral-400 shrink-0" />
                <span className="text-sm font-medium text-neutral-900 dark:text-white">
                  Bảo vệ bộ nhớ
                </span>
              </div>

              {isPersisted ? (
                <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                  Đã bảo vệ
                </span>
              ) : (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  disabled={busy}
                  onClick={handleRequestPersistentStorage}
                  className="relative px-3 py-1.5 rounded-xl text-xs font-semibold border border-black/[0.08] dark:border-white/[0.11] bg-white dark:bg-[#1F1F23] text-neutral-800 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-[#2A2A2E] transition-colors disabled:opacity-50"
                >
                  <HapticTapOverlay disabled={busy} />
                  Kích hoạt
                </motion.button>
              )}
            </div>
          )}

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
              whileTap={{ scale: 0.96 }}
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
                whileTap={{ scale: 0.96 }}
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

          {/* App Update Check */}
          <div className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <RefreshCw className="w-4 h-4 text-neutral-500 dark:text-neutral-400 shrink-0" />
              <span className="text-sm font-medium text-neutral-900 dark:text-white">
                Cập nhật ứng dụng
              </span>
            </div>

            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              disabled={busy}
              onClick={handleCheckUpdate}
              className="relative px-3.5 py-1.5 rounded-xl text-xs font-semibold border border-black/[0.09] dark:border-white/[0.12] bg-white dark:bg-[#1F1F23] text-neutral-900 dark:text-white hover:bg-neutral-50 dark:hover:bg-[#2A2A2E] transition-colors disabled:opacity-50"
            >
              <HapticTapOverlay disabled={busy} />
              Kiểm tra
            </motion.button>
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
                whileTap={{ scale: 0.96 }}
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
                  whileTap={{ scale: 0.96 }}
                  disabled={busy}
                  onClick={handleClearAll}
                  className="relative px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-500 transition-colors"
                >
                  <HapticTapOverlay disabled={busy} />
                  Xác nhận
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
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
      </section>

      {/* Group 4: Hướng dẫn & Hỗ trợ */}
      <section className="space-y-1.5">
        <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Hướng dẫn &amp; Hỗ trợ
        </h2>
        <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#161618] overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <div className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <BookOpen className="w-4 h-4 text-neutral-500 dark:text-neutral-400 shrink-0" />
              <span className="text-sm font-medium text-neutral-900 dark:text-white">
                Hướng dẫn sử dụng
              </span>
            </div>

            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                haptic.light();
                setShowUserGuide(true);
              }}
              className="relative px-3.5 py-1.5 rounded-xl text-xs font-semibold border border-black/[0.08] dark:border-white/[0.11] bg-white dark:bg-[#1F1F23] text-neutral-800 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-[#2A2A2E] transition-colors shrink-0"
            >
              <HapticTapOverlay />
              Xem
            </motion.button>
          </div>
        </div>
      </section>

      {/* Collapsible Advanced Info */}
      <AnimatePresence initial={false}>
        {showAdvancedInfo && (
          <motion.div
            key="settings-advanced-info"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: APPLE_EASE }}
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

      {/* Centered App Version Footer */}
      <p className="pt-2 pb-1 text-center text-[11px] font-mono tabular-nums text-neutral-400 dark:text-neutral-500 select-none">
        YunzyHub v{APP_VERSION}
      </p>

      {/* User Guide Modal */}
      {showUserGuide && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-xs p-0 sm:p-4"
          onClick={() => setShowUserGuide(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#161618] border border-black/[0.08] dark:border-white/[0.1] shadow-2xl overflow-hidden ios-bottom-safe"
          >
            <div className="px-5 py-3.5 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[#FF6B35]" />
                <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
                  Hướng dẫn sử dụng
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowUserGuide(false)}
                aria-label="Đóng hướng dẫn"
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-800 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
              <div className="p-3.5 rounded-2xl bg-[#F5F5F7] dark:bg-[#1F1F23] space-y-1">
                <p className="font-semibold text-neutral-950 dark:text-white">
                  1. Cài vào iPhone (PWA) &amp; Hoạt động ngoại tuyến
                </p>
                <p>• Mở YunzyHub bằng Safari trên iPhone → chạm nút Chia sẻ (Share) → chọn Thêm vào MH chính.</p>
                <p>• Toàn bộ ứng dụng, tài liệu và phông chữ được lưu cục bộ trong IndexedDB để dùng offline.</p>
              </div>
              <div className="p-3.5 rounded-2xl bg-[#F5F5F7] dark:bg-[#1F1F23] space-y-1">
                <p className="font-semibold text-neutral-950 dark:text-white">
                  2. Quản lý &amp; Chia sẻ tài liệu
                </p>
                <p>• Nhấn nút (+) ở màn hình Home hoặc Thư viện để thêm tệp HTML, gói ZIP, DOCX, Markdown, PDF, CSV.</p>
                <p>• Ấn giữ vào thẻ tài liệu để mở menu nhanh: Mở, Chia sẻ, Mã nguồn, Yêu thích, Chỉnh sửa và Xóa.</p>
              </div>
              <div className="p-3.5 rounded-2xl bg-[#F5F5F7] dark:bg-[#1F1F23] space-y-1">
                <p className="font-semibold text-neutral-950 dark:text-white">
                  3. Không gian đa nhiệm &amp; Tiến độ đọc ngầm
                </p>
                <p>• Chọn Vị trí thanh tab Trên cùng hoặc Dưới cùng trong Cài đặt. Vuốt xuống (hoặc vuốt lên nếu đặt ở dưới) từ thanh tab để chuyển nhanh thẻ đang mở.</p>
                <p>• Nhấn (+) trên thanh tab để thêm nhanh từ Thư viện; ấn giữ thẻ tab để Tải lại, Thông tin, Mã nguồn, Chia sẻ hoặc Đóng.</p>
                <p>• Vị trí cuộn tài liệu được lưu ngầm tự động và mở lại đúng đoạn đang đọc.</p>
              </div>
            </div>

            <div className="p-4 border-t border-black/[0.06] dark:border-white/[0.08]">
              <button
                type="button"
                onClick={() => setShowUserGuide(false)}
                className="w-full h-11 rounded-2xl text-xs font-semibold bg-[#17130F] dark:bg-white text-white dark:text-[#17130F]"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
