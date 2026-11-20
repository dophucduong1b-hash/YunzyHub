import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  Code2,
  FileArchive,
  FileCode,
  FileText,
  Globe,
  Layers,
  LayoutGrid,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import { ToolRunnerHost } from '../adapters/runners/ToolRunnerHost';
import { HapticTapOverlay } from '../components/HapticTapOverlay';
import { toolRepository } from '../repositories/toolRepository';
import type {
  NavSection,
  ToolManifest,
  WorkspaceTabRecord,
} from '../types/models';
import { haptic } from '../utils/haptics';

interface WorkspacePageProps {
  tools: ToolManifest[];
  workspaceTabs: WorkspaceTabRecord[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCloseAllTabs: () => void;
  onLaunchTool: (tool: ToolManifest) => void;
  onOpenImportModal: (mode: 'file' | 'create' | 'url') => void;
  onEditCode?: (tool: ToolManifest) => void;
  onNavigate: (section: NavSection) => void;
  onBack?: () => void;
  swipeBackHome?: boolean;
}

export const WorkspacePage: React.FC<WorkspacePageProps> = ({
  tools,
  workspaceTabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onCloseAllTabs,
  onOpenImportModal,
  onEditCode,
  onNavigate,
  onBack,
  swipeBackHome = true,
}) => {
  const [edgeSwipeProgress, setEdgeSwipeProgress] = useState(0);
  const edgeSwipeRef = useRef<{
    startX: number;
    startY: number;
    startTime: number;
    locked: 'none' | 'horizontal' | 'cancelled';
  } | null>(null);
  const toolMap = useMemo(() => {
    const map = new Map<string, ToolManifest>();
    tools.forEach((t) => map.set(t.id, t));
    return map;
  }, [tools]);

  const resolvedTabs = useMemo(() => {
    return workspaceTabs
      .map((tab) => {
        const tool = toolMap.get(tab.toolId);
        return tool ? { tab, tool } : null;
      })
      .filter(
        (item): item is { tab: WorkspaceTabRecord; tool: ToolManifest } =>
          item !== null
      );
  }, [workspaceTabs, toolMap]);

  const effectiveActiveTabId = useMemo(() => {
    if (activeTabId && resolvedTabs.some((r) => r.tab.id === activeTabId)) {
      return activeTabId;
    }
    return resolvedTabs.length > 0 ? resolvedTabs[0].tab.id : null;
  }, [activeTabId, resolvedTabs]);

  const activeTool = useMemo(() => {
    const found = resolvedTabs.find((r) => r.tab.id === effectiveActiveTabId);
    return found ? found.tool : null;
  }, [resolvedTabs, effectiveActiveTabId]);

  const handleBack = () => {
    haptic.light();
    if (onBack) {
      onBack();
    } else {
      onNavigate('dashboard');
    }
  };

  const renderTabIcon = (type: ToolManifest['type']) => {
    switch (type) {
      case 'html':
        return (
          <FileCode className="w-3.5 h-3.5 text-[#FF6B35] shrink-0" />
        );
      case 'zip':
        return (
          <FileArchive className="w-3.5 h-3.5 text-neutral-700 dark:text-neutral-300 shrink-0" />
        );
      case 'file':
        return (
          <FileText className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
        );
      case 'url':
        return (
          <Globe className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
        );
    }
  };

  if (resolvedTabs.length === 0) {
    return (
      <div className="min-h-[65dvh] w-full flex flex-col items-center justify-center p-6 text-center space-y-4 rounded-3xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#161618] shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="w-12 h-12 rounded-2xl bg-[#F5F5F7] dark:bg-[#1F1F23] flex items-center justify-center">
          <Layers className="w-6 h-6 text-neutral-400" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-neutral-900 dark:text-white">
            Không gian đang trống
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Mở công cụ từ Thư viện hoặc tạo mã nguồn mới
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={() => onNavigate('library')}
            className="relative inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-semibold bg-[#17130F] hover:bg-[#2C241E] dark:bg-white dark:hover:bg-neutral-200 text-[#F3EEE3] dark:text-[#17130F] transition-colors"
          >
            <HapticTapOverlay />
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Mở Thư viện</span>
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={() => onOpenImportModal('create')}
            className="relative inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-semibold border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-[#1F1F23] text-neutral-800 dark:text-neutral-100 transition-colors"
          >
            <HapticTapOverlay />
            <Code2 className="w-3.5 h-3.5 text-[#FF6B35]" />
            <span>Tạo code</span>
          </motion.button>
        </div>
      </div>
    );
  }

  const handleEdgeTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!swipeBackHome || e.touches.length !== 1) return;
    const t = e.touches[0];
    edgeSwipeRef.current = {
      startX: t.clientX,
      startY: t.clientY,
      startTime: Date.now(),
      locked: 'none',
    };
  };

  const handleEdgeTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const state = edgeSwipeRef.current;
    if (!state || state.locked === 'cancelled' || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - state.startX;
    const dy = t.clientY - state.startY;

    if (state.locked === 'none') {
      if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) {
        state.locked = 'cancelled';
        setEdgeSwipeProgress(0);
        return;
      }
      if (dx > 6 && dx > Math.abs(dy) * 1.3) {
        state.locked = 'horizontal';
      } else if (dx < -6) {
        state.locked = 'cancelled';
        return;
      }
    }

    if (state.locked === 'horizontal') {
      setEdgeSwipeProgress(Math.min(1, Math.max(0, dx / 72)));
    }
  };

  const handleEdgeTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const state = edgeSwipeRef.current;
    edgeSwipeRef.current = null;
    setEdgeSwipeProgress(0);
    if (!state || state.locked !== 'horizontal') return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - state.startX;
    const elapsed = Date.now() - state.startTime;
    if (dx >= 56 || (dx >= 34 && elapsed < 260)) {
      haptic.selection();
      onNavigate('dashboard');
    }
  };

  const handleEdgeTouchCancel = () => {
    edgeSwipeRef.current = null;
    setEdgeSwipeProgress(0);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 14 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-40 w-full flex flex-col bg-white dark:bg-[#0A0A0C] overflow-hidden lg:static lg:z-auto lg:h-[calc(100vh-2rem)] lg:rounded-2xl lg:border lg:border-black/[0.07] lg:dark:border-white/[0.08] lg:bg-white lg:dark:bg-[#161618] lg:shadow-xs"
    >
      {/* Slim Single-Row Mobile & Desktop Top Bar (respects Dynamic Island safe area) */}
      <div className="ios-top-safe shrink-0 border-b border-black/[0.07] dark:border-white/[0.08] bg-white/95 dark:bg-[#111113]/95 backdrop-blur-xl">
        <div className="h-11 flex items-center justify-between gap-1.5 px-1.5 sm:px-2.5">
          <motion.button
            type="button"
            whileTap={{ scale: 0.88 }}
            onClick={handleBack}
            aria-label="Quay lại"
            title="Quay lại"
            className="relative min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl text-neutral-700 dark:text-neutral-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition shrink-0"
          >
            <HapticTapOverlay />
            <ArrowLeft className="w-4 h-4" />
          </motion.button>

          <div
            className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto no-scrollbar"
            role="tablist"
            aria-label="Các thẻ đang mở"
          >
            {resolvedTabs.map(({ tab, tool }) => {
              const isActive = tab.id === effectiveActiveTabId;
              return (
                <div
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => onSelectTab(tab.id)}
                  className={`relative group flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-xl text-xs font-medium transition shrink-0 cursor-pointer border ${
                    isActive
                      ? 'bg-neutral-100 dark:bg-white/[0.10] text-neutral-950 dark:text-white border-black/[0.06] dark:border-white/[0.10] font-semibold'
                      : 'bg-transparent border-transparent text-neutral-500 dark:text-neutral-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]'
                  }`}
                >
                  <HapticTapOverlay zClass="z-0" />
                  <span className="pointer-events-none flex items-center gap-1.5 min-w-0">
                    {renderTabIcon(tool.type)}
                    <span className="truncate max-w-[130px] sm:max-w-[170px]">
                      {tool.name}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tab.id);
                    }}
                    aria-label={`Đóng ${tool.name}`}
                    className="relative z-10 p-1 rounded-lg text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 transition"
                  >
                    <HapticTapOverlay />
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {onEditCode && activeTool && activeTool.type !== 'url' && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.88 }}
                onClick={() => onEditCode(activeTool)}
                aria-label="Sửa mã nguồn"
                title="Sửa mã nguồn"
                className="relative min-w-[34px] min-h-[34px] flex items-center justify-center rounded-xl text-[#FF6B35] hover:bg-[#FF6B35]/10 transition"
              >
                <HapticTapOverlay />
                <Code2 className="w-4 h-4" />
              </motion.button>
            )}
            {resolvedTabs.length > 1 && (
              <button
                type="button"
                onClick={onCloseAllTabs}
                className="hidden sm:inline-flex px-2 py-1 rounded-lg text-[11px] font-medium text-neutral-500 dark:text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 transition whitespace-nowrap"
              >
                Đóng hết
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Full-Viewport Tool Content Area */}
      <div className="relative flex-1 min-h-0 w-full overflow-hidden flex flex-col">
        {swipeBackHome && (
          <div
            onTouchStart={handleEdgeTouchStart}
            onTouchMove={handleEdgeTouchMove}
            onTouchEnd={handleEdgeTouchEnd}
            onTouchCancel={handleEdgeTouchCancel}
            aria-hidden="true"
            className="fixed left-0 bottom-0 w-[22px] z-50 lg:hidden"
            style={{
              top: 'calc(env(safe-area-inset-top, 0px) + 44px)',
              touchAction: 'pan-y',
            }}
          />
        )}
        {edgeSwipeProgress > 0.08 && (
          <div
            aria-hidden="true"
            className="fixed left-3 top-1/2 z-50 pointer-events-none lg:hidden inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border border-black/[0.08] dark:border-white/[0.12] bg-white/88 dark:bg-[#1C1C1E]/90 backdrop-blur-xl shadow-lg text-xs font-semibold text-neutral-900 dark:text-white"
            style={{
              opacity: Math.min(1, edgeSwipeProgress * 1.2),
              transform: `translate3d(${Math.round((edgeSwipeProgress - 1) * 16)}px, -50%, 0)`,
            }}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Home</span>
          </div>
        )}
        {resolvedTabs.map(({ tab, tool }) => {
          const isActive = tab.id === effectiveActiveTabId;
          return (
            <div
              key={tab.id}
              role="tabpanel"
              hidden={!isActive}
              className={
                isActive ? 'flex-1 min-h-0 h-full w-full flex flex-col' : 'hidden'
              }
            >
              <ToolRunnerHost
                tool={tool}
                reloadTrigger={tab.reloadCount || 0}
                onReloadRequest={() => toolRepository.reloadWorkspaceTab(tab.id)}
                onEditCode={
                  onEditCode && tool.type !== 'url'
                    ? () => onEditCode(tool)
                    : undefined
                }
              />
            </div>
          );
        })}
      </div>
    </motion.div>
  );
};
