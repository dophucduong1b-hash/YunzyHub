import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  Code2,
  FileArchive,
  FileCode,
  FileText,
  Globe,
  Info,
  Layers,
  LayoutGrid,
  Plus,
  RefreshCw,
  Search,
  Share2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { ToolRunnerHost } from '../adapters/runners/ToolRunnerHost';
import { HapticTapOverlay } from '../components/HapticTapOverlay';
import { useLongPress } from '../components/ToolContextMenu';
import {
  formatBytes,
  formatDateTimeVi,
  getToolTypeLabelVi,
  toolRepository,
} from '../repositories/toolRepository';
import type {
  NavSection,
  ToolManifest,
  WorkspaceTabBarPosition,
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
  onShareTool?: (tool: ToolManifest) => void;
  onOpenImportModal: (mode: 'file' | 'create' | 'url') => void;
  onEditCode?: (tool: ToolManifest) => void;
  onNavigate: (section: NavSection) => void;
  onBack?: () => void;
  swipeBackHome?: boolean;
  tabBarPosition?: WorkspaceTabBarPosition;
}

function renderSmallTabGlyph(type: ToolManifest['type']) {
  switch (type) {
    case 'html':
      return <FileCode className="w-3 h-3 text-[#FF6B35] shrink-0" />;
    case 'zip':
      return (
        <FileArchive className="w-3 h-3 text-neutral-700 dark:text-neutral-300 shrink-0" />
      );
    case 'file':
      return (
        <FileText className="w-3 h-3 text-sky-600 dark:text-sky-400 shrink-0" />
      );
    case 'url':
      return (
        <Globe className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
      );
  }
}

interface WorkspaceTabChipProps {
  tab: WorkspaceTabRecord;
  tool: ToolManifest;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
  onOpenMenu: (x: number, y: number) => void;
}

const WorkspaceTabChip: React.FC<WorkspaceTabChipProps> = ({
  tab,
  tool,
  isActive,
  onSelect,
  onClose,
  onOpenMenu,
}) => {
  const longPress = useLongPress((pt) => onOpenMenu(pt.x, pt.y));

  return (
    <div
      key={tab.id}
      role="tab"
      aria-selected={isActive}
      onPointerDown={longPress.onPointerDown}
      onPointerMove={longPress.onPointerMove}
      onPointerUp={longPress.onPointerUp}
      onPointerCancel={longPress.onPointerCancel}
      onContextMenu={(e) => {
        e.preventDefault();
        onOpenMenu(e.clientX, e.clientY);
      }}
      onClick={() => {
        if (longPress.consumeLongPress()) return;
        haptic.selection();
        onSelect();
      }}
      className={`relative group h-[28px] min-w-[64px] max-w-[128px] flex items-center gap-1 pl-2 pr-0.5 rounded-[9px] text-[11px] transition shrink-0 cursor-pointer border ios-no-callout ${
        isActive
          ? 'bg-neutral-100 dark:bg-white/[0.11] text-neutral-950 dark:text-white border-black/[0.08] dark:border-white/[0.12] font-semibold'
          : 'bg-transparent border-transparent text-neutral-500 dark:text-neutral-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] font-medium'
      }`}
    >
      <HapticTapOverlay zClass="z-0" />
      <span className="pointer-events-none flex items-center gap-1 min-w-0">
        {renderSmallTabGlyph(tool.type)}
        <span className="truncate">{tool.name}</span>
      </span>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          haptic.light();
          onClose();
        }}
        aria-label={`Đóng ${tool.name}`}
        className="relative z-10 p-1 rounded-[5px] text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 transition shrink-0"
      >
        <X className="w-2.5 h-2.5" />
      </button>
    </div>
  );
};

export const WorkspacePage: React.FC<WorkspacePageProps> = ({
  tools,
  workspaceTabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onCloseAllTabs,
  onLaunchTool,
  onShareTool,
  onOpenImportModal,
  onEditCode,
  onNavigate,
  onBack,
  swipeBackHome = true,
  tabBarPosition = 'top',
}) => {
  const isBottom = tabBarPosition === 'bottom';
  const [edgeSwipeProgress, setEdgeSwipeProgress] = useState(0);
  const [showOpenTabsDropdown, setShowOpenTabsDropdown] = useState(false);
  const [showLibraryQuickAdd, setShowLibraryQuickAdd] = useState(false);
  const [libraryQuickQuery, setLibraryQuickQuery] = useState('');
  const [showSandboxInfo, setShowSandboxInfo] = useState(false);
  const [infoDialogTool, setInfoDialogTool] = useState<ToolManifest | null>(null);
  const [tabMenu, setTabMenu] = useState<{
    tabId: string;
    tool: ToolManifest;
    x: number;
    y: number;
  } | null>(null);

  const edgeSwipeRef = useRef<{
    startX: number;
    startY: number;
    startTime: number;
    locked: 'none' | 'horizontal' | 'cancelled';
  } | null>(null);

  const barDragRef = useRef<{
    startY: number;
    triggered: boolean;
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

  const openTabToolIds = useMemo(
    () => new Set(resolvedTabs.map((r) => r.tool.id)),
    [resolvedTabs]
  );

  const effectiveActiveTabId = useMemo(() => {
    if (activeTabId && resolvedTabs.some((r) => r.tab.id === activeTabId)) {
      return activeTabId;
    }
    return resolvedTabs.length > 0 ? resolvedTabs[0].tab.id : null;
  }, [activeTabId, resolvedTabs]);

  useEffect(() => {
    setShowSandboxInfo(false);
  }, [effectiveActiveTabId]);

  useEffect(() => {
    if (!tabMenu && !showOpenTabsDropdown && !showLibraryQuickAdd && !infoDialogTool) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (infoDialogTool) setInfoDialogTool(null);
      else if (tabMenu) setTabMenu(null);
      else if (showLibraryQuickAdd) setShowLibraryQuickAdd(false);
      else if (showOpenTabsDropdown) setShowOpenTabsDropdown(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tabMenu, showOpenTabsDropdown, showLibraryQuickAdd, infoDialogTool]);

  const filteredQuickLibraryTools = useMemo(() => {
    const q = libraryQuickQuery.trim().toLowerCase();
    const sorted = [...tools].sort((a, b) =>
      (b.lastOpenedAt || b.updatedAt).localeCompare(a.lastOpenedAt || a.updatedAt)
    );
    if (!q) return sorted;
    return sorted.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        (t.entryPath || '').toLowerCase().includes(q) ||
        (t.url || '').toLowerCase().includes(q)
    );
  }, [tools, libraryQuickQuery]);

  const handleBack = () => {
    haptic.light();
    if (onBack) {
      onBack();
    } else {
      onNavigate('dashboard');
    }
  };

  if (resolvedTabs.length === 0) {
    return (
      <div className="min-h-[65dvh] w-full flex flex-col items-center justify-center p-6 text-center space-y-4 rounded-3xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#161618] shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="w-12 h-12 rounded-2xl bg-[#F5F5F7] dark:bg-[#1F1F23] flex items-center justify-center">
          <Layers className="w-6 h-6 text-neutral-400" />
        </div>
        <p className="text-sm font-semibold text-neutral-900 dark:text-white">
          Chưa có thẻ
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={() => onNavigate('library')}
            className="relative inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-semibold bg-[#17130F] hover:bg-[#2C241E] dark:bg-white dark:hover:bg-neutral-200 text-[#F3EEE3] dark:text-[#17130F] transition-colors"
          >
            <HapticTapOverlay />
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Thư viện</span>
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

  const handleBarTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    barDragRef.current = { startY: e.touches[0].clientY, triggered: false };
  };

  const handleBarTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const st = barDragRef.current;
    if (!st || st.triggered || e.touches.length !== 1) return;
    const rawDy = e.touches[0].clientY - st.startY;
    const openDelta = isBottom ? -rawDy : rawDy;
    if (openDelta >= 26) {
      st.triggered = true;
      haptic.selection();
      setShowLibraryQuickAdd(false);
      setShowOpenTabsDropdown(true);
    } else if (openDelta <= -18 && showOpenTabsDropdown) {
      st.triggered = true;
      setShowOpenTabsDropdown(false);
    }
  };

  const handleBarTouchEnd = () => {
    barDragRef.current = null;
  };

  const tabBarStrip = (
    <div
      onTouchStart={handleBarTouchStart}
      onTouchMove={handleBarTouchMove}
      onTouchEnd={handleBarTouchEnd}
      onTouchCancel={handleBarTouchEnd}
      className={`shrink-0 bg-white/95 dark:bg-[#111113]/95 backdrop-blur-xl select-none ${
        isBottom
          ? 'ios-bottom-safe border-t border-black/[0.07] dark:border-white/[0.08]'
          : 'ios-top-safe border-b border-black/[0.07] dark:border-white/[0.08]'
      }`}
    >
      {isBottom && (
        <button
          type="button"
          onClick={() => {
            haptic.selection();
            setShowLibraryQuickAdd(false);
            setShowOpenTabsDropdown((v) => !v);
          }}
          aria-label="Mở thẻ đang chạy"
          className="w-full pt-1.5 pb-0.5 flex justify-center"
        >
          <span
            className={`w-7 h-[3px] rounded-full transition-colors ${
              showOpenTabsDropdown
                ? 'bg-[#FF6B35]'
                : 'bg-neutral-400/40 dark:bg-neutral-500/40'
            }`}
          />
        </button>
      )}

      <div className="h-[38px] flex items-center gap-1 px-1.5">
        <motion.button
          type="button"
          whileTap={{ scale: 0.88 }}
          onClick={handleBack}
          aria-label="Quay lại"
          title="Quay lại"
          className="relative w-8 h-8 flex items-center justify-center rounded-[9px] text-neutral-700 dark:text-neutral-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition shrink-0"
        >
          <HapticTapOverlay />
          <ArrowLeft className="w-4 h-4" />
        </motion.button>

        <div
          className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto no-scrollbar"
          role="tablist"
          aria-label="Các thẻ đang mở"
        >
          {resolvedTabs.map(({ tab, tool }) => (
            <WorkspaceTabChip
              key={tab.id}
              tab={tab}
              tool={tool}
              isActive={tab.id === effectiveActiveTabId}
              onSelect={() => onSelectTab(tab.id)}
              onClose={() => onCloseTab(tab.id)}
              onOpenMenu={(x, y) => {
                setShowOpenTabsDropdown(false);
                setShowLibraryQuickAdd(false);
                setTabMenu({ tabId: tab.id, tool, x, y });
              }}
            />
          ))}
        </div>

        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={() => {
            haptic.light();
            setShowOpenTabsDropdown(false);
            setShowLibraryQuickAdd((v) => !v);
          }}
          aria-label="Thêm từ Thư viện"
          title="Thư viện"
          className={`w-[30px] h-[30px] rounded-[9px] border flex items-center justify-center shrink-0 transition-colors ${
            showLibraryQuickAdd
              ? 'bg-[#17130F] dark:bg-white text-white dark:text-[#17130F] border-transparent'
              : 'bg-[#F5F5F7] dark:bg-[#1F1F23] text-neutral-900 dark:text-white border-black/[0.07] dark:border-white/[0.09]'
          }`}
        >
          <Plus className="w-4 h-4" />
        </motion.button>
      </div>

      {!isBottom && (
        <button
          type="button"
          onClick={() => {
            haptic.selection();
            setShowLibraryQuickAdd(false);
            setShowOpenTabsDropdown((v) => !v);
          }}
          aria-label="Mở thẻ đang chạy"
          className="w-full pb-1 pt-0.5 flex justify-center"
        >
          <span
            className={`w-7 h-[3px] rounded-full transition-colors ${
              showOpenTabsDropdown
                ? 'bg-[#FF6B35]'
                : 'bg-neutral-400/40 dark:bg-neutral-500/40'
            }`}
          />
        </button>
      )}
    </div>
  );

  const vw = typeof window !== 'undefined' ? window.innerWidth : 390;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 844;
  const tabMenuW = 190;
  const tabMenuH = tabMenu?.tool.type === 'url' ? 200 : 244;
  const tabMenuLeft = tabMenu
    ? Math.max(12, Math.min(tabMenu.x - tabMenuW / 2, vw - tabMenuW - 12))
    : 12;
  const tabMenuTop = tabMenu
    ? Math.max(16, Math.min(tabMenu.y - (isBottom ? tabMenuH + 12 : -8), vh - tabMenuH - 16))
    : 16;

  return (
    <motion.div
      initial={{ opacity: 0, x: 14 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-40 w-full flex flex-col bg-white dark:bg-[#0A0A0C] overflow-hidden lg:static lg:z-auto lg:h-[calc(100vh-2rem)] lg:rounded-2xl lg:border lg:border-black/[0.07] lg:dark:border-white/[0.08] lg:bg-white lg:dark:bg-[#161618] lg:shadow-xs"
    >
      {!isBottom && tabBarStrip}

      {/* Runner Area + Popovers + Left-edge Swipe Home */}
      <div
        className={`relative flex-1 min-h-0 w-full overflow-hidden flex flex-col ${
          isBottom ? 'ios-top-safe' : ''
        }`}
      >
        {swipeBackHome && (
          <div
            onTouchStart={handleEdgeTouchStart}
            onTouchMove={handleEdgeTouchMove}
            onTouchEnd={handleEdgeTouchEnd}
            onTouchCancel={handleEdgeTouchCancel}
            aria-hidden="true"
            className="fixed left-0 w-[20px] z-50 lg:hidden"
            style={{
              top: isBottom ? 'env(safe-area-inset-top, 0px)' : 'calc(env(safe-area-inset-top, 0px) + 52px)',
              bottom: isBottom ? '60px' : '0px',
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
                isBottomTabBar={isBottom}
                showInfoPopover={isActive ? showSandboxInfo : false}
                onShowInfoPopoverChange={isActive ? setShowSandboxInfo : undefined}
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

        {/* Scrim */}
        <AnimatePresence>
          {(showOpenTabsDropdown || showLibraryQuickAdd) && (
            <motion.div
              key="ws-popup-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowOpenTabsDropdown(false);
                setShowLibraryQuickAdd(false);
              }}
              className="absolute inset-0 z-30 bg-black/30 backdrop-blur-[1px]"
            />
          )}
        </AnimatePresence>

        {/* 1. Minimalist Open Tabs Quick Switcher */}
        <AnimatePresence>
          {showOpenTabsDropdown && (
            <motion.div
              key="ws-open-tabs-popup"
              initial={{ opacity: 0, y: isBottom ? 24 : -24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: isBottom ? 24 : -24 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className={`absolute left-0 right-0 z-40 bg-white/96 dark:bg-[#1C1C1E]/96 backdrop-blur-2xl border-black/[0.08] dark:border-white/[0.1] shadow-2xl px-3.5 py-3 space-y-2.5 ${
                isBottom
                  ? 'bottom-0 rounded-t-[22px] border-t'
                  : 'top-0 rounded-b-[22px] border-b'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-neutral-950 dark:text-white">
                  Thẻ đang mở ({resolvedTabs.length})
                </h2>
                <div className="flex items-center gap-1.5">
                  {resolvedTabs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        haptic.warning();
                        setShowOpenTabsDropdown(false);
                        onCloseAllTabs();
                      }}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-rose-500/12 text-rose-600 dark:text-rose-400"
                    >
                      Đóng hết
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowOpenTabsDropdown(false)}
                    aria-label="Đóng"
                    className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="max-h-[300px] overflow-y-auto space-y-1.5 pr-0.5">
                {resolvedTabs.map(({ tab, tool }) => {
                  const selected = tab.id === effectiveActiveTabId;
                  return (
                    <div
                      key={tab.id}
                      onClick={() => {
                        haptic.selection();
                        onSelectTab(tab.id);
                        setShowOpenTabsDropdown(false);
                      }}
                      className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-[13px] border cursor-pointer transition-colors ${
                        selected
                          ? 'bg-[#F5F5F7] dark:bg-white/[0.08] border-[#FF6B35]/45'
                          : 'bg-white dark:bg-[#161618] border-black/[0.06] dark:border-white/[0.08]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span className="w-8 h-8 rounded-[9px] bg-[#F5F5F7] dark:bg-white/[0.06] flex items-center justify-center shrink-0">
                          {renderSmallTabGlyph(tool.type)}
                        </span>
                        <span
                          className={`text-[13px] truncate text-neutral-950 dark:text-white ${
                            selected ? 'font-semibold' : 'font-medium'
                          }`}
                        >
                          {tool.name}
                        </span>
                        {selected && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B35] shrink-0" />
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {onEditCode && tool.type !== 'url' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              haptic.light();
                              setShowOpenTabsDropdown(false);
                              onEditCode(tool);
                            }}
                            aria-label="Mã nguồn"
                            className="p-1.5 rounded-lg text-[#FF6B35] hover:bg-[#FF6B35]/10"
                          >
                            <Code2 className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            haptic.light();
                            onCloseTab(tab.id);
                          }}
                          aria-label={`Đóng ${tool.name}`}
                          className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 2. Minimalist Library Quick-Add Popup */}
        <AnimatePresence>
          {showLibraryQuickAdd && (
            <motion.div
              key="ws-quick-add-popup"
              initial={{ opacity: 0, y: isBottom ? 24 : -24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: isBottom ? 24 : -24 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className={`absolute left-0 right-0 z-40 bg-white/96 dark:bg-[#1C1C1E]/96 backdrop-blur-2xl border-black/[0.08] dark:border-white/[0.1] shadow-2xl px-3.5 py-3 space-y-2.5 ${
                isBottom
                  ? 'bottom-0 rounded-t-[22px] border-t'
                  : 'top-0 rounded-b-[22px] border-b'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-neutral-950 dark:text-white">
                  Thư viện
                </h2>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      haptic.light();
                      setShowLibraryQuickAdd(false);
                      onOpenImportModal('file');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[9px] text-[11px] font-semibold bg-[#F5F5F7] dark:bg-[#2C2C2E] border border-black/[0.06] dark:border-white/[0.08] text-neutral-900 dark:text-white"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Mới</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLibraryQuickAdd(false)}
                    aria-label="Đóng"
                    className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={libraryQuickQuery}
                  onChange={(e) => setLibraryQuickQuery(e.target.value)}
                  placeholder="Tìm..."
                  aria-label="Tìm nhanh công cụ"
                  className="w-full h-9 rounded-xl border border-black/[0.07] dark:border-white/[0.09] bg-[#F5F5F7] dark:bg-[#161618] pl-9 pr-8 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/40"
                />
                {libraryQuickQuery && (
                  <button
                    type="button"
                    onClick={() => setLibraryQuickQuery('')}
                    aria-label="Xóa tìm kiếm"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {filteredQuickLibraryTools.length === 0 ? (
                <p className="py-6 text-center text-xs text-neutral-500 dark:text-neutral-400">
                  {tools.length === 0 ? 'Thư viện trống' : 'Không có kết quả'}
                </p>
              ) : (
                <div className="max-h-[320px] overflow-y-auto space-y-1.5 pr-0.5">
                  {filteredQuickLibraryTools.map((tool) => {
                    const alreadyOpen = openTabToolIds.has(tool.id);
                    return (
                      <div
                        key={tool.id}
                        onClick={() => {
                          haptic.light();
                          setShowLibraryQuickAdd(false);
                          setLibraryQuickQuery('');
                          onLaunchTool(tool);
                        }}
                        className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-[13px] border cursor-pointer transition-colors ${
                          alreadyOpen
                            ? 'bg-white dark:bg-[#161618] border-[#007AFF]/35'
                            : 'bg-white dark:bg-[#161618] border-black/[0.06] dark:border-white/[0.08]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <span className="w-8 h-8 rounded-[9px] bg-[#F5F5F7] dark:bg-white/[0.06] flex items-center justify-center shrink-0">
                            {renderSmallTabGlyph(tool.type)}
                          </span>
                          <span className="text-[13px] font-semibold truncate text-neutral-950 dark:text-white">
                            {tool.name}
                          </span>
                        </div>

                        {alreadyOpen ? (
                          <span className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-[#007AFF]/12 text-[#007AFF] dark:text-[#0A84FF] shrink-0">
                            Đang mở
                          </span>
                        ) : (
                          <span className="w-7 h-7 rounded-full bg-[#17130F] dark:bg-white text-white dark:text-[#17130F] flex items-center justify-center shrink-0">
                            <Plus className="w-4 h-4" />
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {isBottom && tabBarStrip}

      {/* Tab Long-press Context Menu */}
      <AnimatePresence>
        {tabMenu && (
          <div
            className="fixed inset-0 z-50 ios-no-callout"
            onClick={() => setTabMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setTabMenu(null);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ duration: 0.14 }}
              onClick={(e) => e.stopPropagation()}
              style={{ left: tabMenuLeft, top: tabMenuTop, width: tabMenuW }}
              className="fixed rounded-2xl border border-black/[0.08] dark:border-white/[0.12] bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-2xl shadow-2xl py-1.5 text-[13px] overflow-hidden"
            >
              <button
                type="button"
                onClick={() => {
                  const target = tabMenu;
                  setTabMenu(null);
                  haptic.light();
                  if (target.tabId !== effectiveActiveTabId) onSelectTab(target.tabId);
                  toolRepository.reloadWorkspaceTab(target.tabId);
                }}
                className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-left font-medium text-neutral-900 dark:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
              >
                <RefreshCw className="w-4 h-4 shrink-0" />
                <span>Tải lại</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const target = tabMenu;
                  setTabMenu(null);
                  haptic.light();
                  if (target.tabId !== effectiveActiveTabId) onSelectTab(target.tabId);
                  if (target.tool.type === 'html' || target.tool.type === 'zip') {
                    setShowSandboxInfo(true);
                  } else {
                    setInfoDialogTool(target.tool);
                  }
                }}
                className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-left font-medium text-neutral-900 dark:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
              >
                <Info className="w-4 h-4 text-[#007AFF] dark:text-[#0A84FF] shrink-0" />
                <span>Thông tin</span>
              </button>

              {onEditCode && tabMenu.tool.type !== 'url' && (
                <button
                  type="button"
                  onClick={() => {
                    const targetTool = tabMenu.tool;
                    setTabMenu(null);
                    haptic.light();
                    onEditCode(targetTool);
                  }}
                  className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-left font-medium text-neutral-900 dark:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
                >
                  <Code2 className="w-4 h-4 text-[#FF6B35] shrink-0" />
                  <span>Mã nguồn</span>
                </button>
              )}

              {onShareTool && (
                <button
                  type="button"
                  onClick={() => {
                    const targetTool = tabMenu.tool;
                    setTabMenu(null);
                    haptic.light();
                    onShareTool(targetTool);
                  }}
                  className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-left font-medium text-neutral-900 dark:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
                >
                  <Share2 className="w-4 h-4 text-[#007AFF] dark:text-[#0A84FF] shrink-0" />
                  <span>Chia sẻ</span>
                </button>
              )}

              <div className="my-1 border-t border-black/[0.06] dark:border-white/[0.08]" />

              <button
                type="button"
                onClick={() => {
                  const tabId = tabMenu.tabId;
                  setTabMenu(null);
                  haptic.light();
                  onCloseTab(tabId);
                }}
                className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-left font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
              >
                <X className="w-4 h-4 shrink-0" />
                <span>Đóng</span>
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Tool Info Dialog for non-HTML/ZIP tabs */}
      {infoDialogTool && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs"
          onClick={() => setInfoDialogTool(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#1C1C1E] p-5 shadow-2xl space-y-3 text-xs"
          >
            <h3 className="text-base font-semibold text-neutral-950 dark:text-white truncate">
              {infoDialogTool.name}
            </h3>
            <div className="space-y-1.5 text-neutral-600 dark:text-neutral-300">
              <div className="flex justify-between gap-3">
                <span>Loại</span>
                <span className="font-medium text-neutral-950 dark:text-white">
                  {getToolTypeLabelVi(infoDialogTool.type)}
                </span>
              </div>
              {infoDialogTool.entryPath && (
                <div className="flex justify-between gap-3">
                  <span>Tệp chính</span>
                  <span className="font-mono text-neutral-950 dark:text-white truncate">
                    {infoDialogTool.entryPath}
                  </span>
                </div>
              )}
              {infoDialogTool.url && (
                <div className="flex justify-between gap-3">
                  <span>Địa chỉ</span>
                  <span className="font-mono text-neutral-950 dark:text-white truncate">
                    {infoDialogTool.url}
                  </span>
                </div>
              )}
              {infoDialogTool.type !== 'url' && (
                <>
                  <div className="flex justify-between gap-3">
                    <span>Dung lượng</span>
                    <span className="font-medium text-neutral-950 dark:text-white">
                      {formatBytes(infoDialogTool.sizeBytes)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Số tệp</span>
                    <span className="font-medium text-neutral-950 dark:text-white">
                      {infoDialogTool.fileCount} tệp
                    </span>
                  </div>
                </>
              )}
              <div className="flex justify-between gap-3">
                <span>Danh mục</span>
                <span className="font-medium text-neutral-950 dark:text-white">
                  {infoDialogTool.category}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Cập nhật</span>
                <span className="font-medium text-neutral-950 dark:text-white">
                  {formatDateTimeVi(infoDialogTool.updatedAt)}
                </span>
              </div>
            </div>
            <div className="pt-2 flex justify-end gap-2">
              {onEditCode && infoDialogTool.type !== 'url' && (
                <button
                  type="button"
                  onClick={() => {
                    const target = infoDialogTool;
                    setInfoDialogTool(null);
                    onEditCode(target);
                  }}
                  className="px-3 py-1.5 rounded-xl font-semibold text-[#FF6B35] hover:bg-[#FF6B35]/10"
                >
                  Mã nguồn
                </button>
              )}
              <button
                type="button"
                onClick={() => setInfoDialogTool(null)}
                className="px-3 py-1.5 rounded-xl font-semibold text-neutral-900 dark:text-white bg-black/[0.06] dark:bg-white/[0.1]"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};
