/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ChevronLeft,
  Home,
  Layers,
  LayoutGrid,
  Search,
  Settings,
  WifiOff,
} from 'lucide-react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { BrandLogo } from './components/BrandLogo';
import { CodeEditorModal } from './components/CodeEditorModal';
import { EditToolModal } from './components/EditToolModal';
import { HapticTapOverlay } from './components/HapticTapOverlay';
import { ImportToolModal } from './components/ImportToolModal';
import { db } from './db/database';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { DashboardPage } from './pages/DashboardPage';
import { LibraryPage } from './pages/LibraryPage';
import { SearchPage } from './pages/SearchPage';
import { SettingsPage } from './pages/SettingsPage';
import { WorkspacePage } from './pages/WorkspacePage';
import {
  DEFAULT_PREFERENCES,
  parsePreferenceValue,
  toolRepository,
  type AppFontFamily,
  type LibraryViewMode,
  type ThemeMode,
  type WorkspaceTabBarPosition,
} from './repositories/toolRepository';
import type { NavSection, ToolManifest } from './types/models';
import { normalizeFontFamily, resolveFontStack } from './utils/fonts';
import { haptic } from './utils/haptics';
import { shareToolDocument } from './utils/shareTool';

export type ImportModalMode = 'file' | 'create' | 'url';

export const PRIMARY_NAV_ITEMS: Array<{
  id: Extract<NavSection, 'dashboard' | 'workspace' | 'library' | 'settings'>;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'dashboard', label: 'Home', icon: Home },
  { id: 'workspace', label: 'Không gian', icon: Layers },
  { id: 'library', label: 'Thư viện', icon: LayoutGrid },
  { id: 'settings', label: 'Cài đặt', icon: Settings },
];

const APPLE_EASE = [0.22, 1, 0.36, 1] as const;

const DOCK_SPRING = {
  type: 'spring' as const,
  stiffness: 420,
  damping: 40,
  mass: 0.8,
};

const NAV_ORDER: Record<NavSection, number> = {
  dashboard: 0,
  workspace: 1,
  library: 2,
  favorites: 2,
  settings: 3,
  search: 4,
};

export default function App() {
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [navDirection, setNavDirection] = useState<1 | -1>(1);
  const [lastBrowseSection, setLastBrowseSection] =
    useState<NavSection>('dashboard');
  const [dbInitialized, setDbInitialized] = useState(false);
  const [importModalState, setImportModalState] = useState<{
    open: boolean;
    mode: ImportModalMode;
  }>({ open: false, mode: 'file' });
  const [editingTool, setEditingTool] = useState<ToolManifest | null>(null);
  const [codeEditingTool, setCodeEditingTool] = useState<ToolManifest | null>(
    null
  );
  const [pendingDeleteTool, setPendingDeleteTool] = useState<ToolManifest | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [swipeHomeProgress, setSwipeHomeProgress] = useState(0);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const swipeGestureRef = useRef<{
    startX: number;
    startY: number;
    startTime: number;
    locked: 'none' | 'horizontal' | 'cancelled';
  } | null>(null);
  const isOnline = useOnlineStatus();

  useEffect(() => {
    toolRepository
      .initializeIfNeeded()
      .then(() => setDbInitialized(true))
      .catch(() => setDbInitialized(true));
  }, []);

  const tools = useLiveQuery(() => db.tools.toArray(), [], []);
  const workspaceTabs = useLiveQuery(
    () => db.workspace.orderBy('order').toArray(),
    [],
    []
  );
  const preferences = useLiveQuery(() => db.preferences.toArray(), [], []);
  const toolStorageRecords = useLiveQuery(() => db.toolStorage.toArray(), [], []);
  const historyCount = useLiveQuery(() => db.history.count(), [], 0);

  const toolStorageBytes = toolStorageRecords.reduce(
    (acc, r) => acc + (r.byteSize || 0),
    0
  );

  const theme = parsePreferenceValue<ThemeMode>(
    preferences,
    'theme',
    DEFAULT_PREFERENCES.theme
  );
  const libraryView = parsePreferenceValue<LibraryViewMode>(
    preferences,
    'libraryView',
    DEFAULT_PREFERENCES.libraryView
  );
  const activeTabId = parsePreferenceValue<string | null>(
    preferences,
    'activeTabId',
    DEFAULT_PREFERENCES.activeTabId
  );
  const hapticsEnabled = parsePreferenceValue<boolean>(
    preferences,
    'hapticsEnabled',
    DEFAULT_PREFERENCES.hapticsEnabled ?? true
  );
  const reducedMotion = parsePreferenceValue<boolean>(
    preferences,
    'reducedMotion',
    DEFAULT_PREFERENCES.reducedMotion ?? false
  );
  const swipeBackHome = parsePreferenceValue<boolean>(
    preferences,
    'swipeBackHome',
    DEFAULT_PREFERENCES.swipeBackHome ?? true
  );
  const openAfterImportDefault = parsePreferenceValue<boolean>(
    preferences,
    'openAfterImportDefault',
    DEFAULT_PREFERENCES.openAfterImportDefault ?? true
  );
  const rawFontFamily = parsePreferenceValue<string>(
    preferences,
    'fontFamily',
    DEFAULT_PREFERENCES.fontFamily ?? 'system'
  );
  const fontFamily: AppFontFamily = normalizeFontFamily(rawFontFamily);
  const fontScale = Math.min(
    1.3,
    Math.max(
      0.85,
      Number(
        parsePreferenceValue<number>(
          preferences,
          'fontScale',
          DEFAULT_PREFERENCES.fontScale ?? 1.0
        )
      ) || 1.0
    )
  );
  const workspaceTabBarPosition =
    parsePreferenceValue<string>(
      preferences,
      'workspaceTabBarPosition',
      DEFAULT_PREFERENCES.workspaceTabBarPosition ?? 'top'
    ) === 'bottom'
      ? ('bottom' as WorkspaceTabBarPosition)
      : ('top' as WorkspaceTabBarPosition);

  useEffect(() => {
    haptic.setEnabled(hapticsEnabled);
  }, [hapticsEnabled]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('reduce-motion', reducedMotion);
    }
  }, [reducedMotion]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty(
        '--app-font-family',
        resolveFontStack(fontFamily)
      );
      document.documentElement.style.setProperty(
        '--app-font-scale',
        String(fontScale)
      );
    }
  }, [fontFamily, fontScale]);

  useEffect(() => {
    if (!toastMessage) return;
    const t = window.setTimeout(() => setToastMessage(null), 2200);
    return () => window.clearTimeout(t);
  }, [toastMessage]);

  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      const isDark =
        theme === 'dark' || (theme === 'system' && mediaQuery.matches);
      if (isDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    applyTheme();
    mediaQuery.addEventListener('change', applyTheme);
    return () => mediaQuery.removeEventListener('change', applyTheme);
  }, [theme]);

  const navigateTo = (section: NavSection) => {
    // Double-tap Search icon: 1st tap enters Search view, 2nd tap synchronously focuses input to raise iOS keyboard
    if (section === 'search' && activeSection === 'search') {
      haptic.light();
      const input = searchInputRef.current;
      if (input) {
        input.focus();
        try {
          input.setSelectionRange(input.value.length, input.value.length);
        } catch {
          // Some browsers ignore setSelectionRange on type="search"
        }
      }
      return;
    }

    if (section !== activeSection) {
      setNavDirection(NAV_ORDER[section] >= NAV_ORDER[activeSection] ? 1 : -1);
      haptic.selection();
    }
    if (section !== 'workspace') {
      setLastBrowseSection(section);
    }
    setActiveSection(section);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  };

  const handleLaunchTool = async (tool: ToolManifest) => {
    haptic.light();
    if (activeSection !== 'workspace') {
      setLastBrowseSection(activeSection);
    }
    await toolRepository.openToolInWorkspace(tool.id);
    setActiveSection('workspace');
  };

  const handleToggleFavorite = async (tool: ToolManifest) => {
    haptic.medium();
    await toolRepository.toggleFavorite(tool.id);
  };

  const handleOpenCodeEditor = (tool: ToolManifest) => {
    haptic.light();
    setCodeEditingTool(tool);
  };

  const handleShareTool = async (tool: ToolManifest) => {
    try {
      const msg = await shareToolDocument(tool);
      if (msg) setToastMessage(msg);
    } catch (err) {
      haptic.warning();
      setToastMessage(
        err instanceof Error ? err.message : 'Không thể chia sẻ công cụ.'
      );
    }
  };

  const handleCodeSaved = async () => {
    if (!codeEditingTool) return;
    const matchingTabs = workspaceTabs.filter(
      (tab) => tab.toolId === codeEditingTool.id
    );
    await Promise.all(
      matchingTabs.map((tab) => toolRepository.reloadWorkspaceTab(tab.id))
    );
  };

  const isWorkspaceActive = activeSection === 'workspace';
  const hasRunningWorkspaceTool = isWorkspaceActive && workspaceTabs.length > 0;

  const canSwipeBackHome =
    swipeBackHome &&
    activeSection !== 'dashboard' &&
    !hasRunningWorkspaceTool &&
    !importModalState.open &&
    !editingTool &&
    !codeEditingTool;

  const handleContainerTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!canSwipeBackHome || e.touches.length !== 1) return;
    const target = e.target as HTMLElement | null;
    if (
      target?.closest('input, textarea, select, [contenteditable="true"]')
    ) {
      return;
    }
    let el = target;
    const container = scrollContainerRef.current;
    while (el && el !== container) {
      if (el.scrollWidth > el.clientWidth + 4 && el.scrollLeft > 0) {
        return;
      }
      el = el.parentElement;
    }
    const t = e.touches[0];
    swipeGestureRef.current = {
      startX: t.clientX,
      startY: t.clientY,
      startTime: Date.now(),
      locked: 'none',
    };
  };

  const handleContainerTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const state = swipeGestureRef.current;
    if (!state || state.locked === 'cancelled' || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - state.startX;
    const dy = t.clientY - state.startY;

    if (state.locked === 'none') {
      if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) {
        state.locked = 'cancelled';
        setSwipeHomeProgress(0);
        return;
      }
      if (dx > 12 && dx > Math.abs(dy) * 1.4) {
        state.locked = 'horizontal';
      } else if (dx < -10) {
        state.locked = 'cancelled';
        return;
      }
    }

    if (state.locked === 'horizontal') {
      setSwipeHomeProgress(Math.min(1, Math.max(0, (dx - 12) / 76)));
    }
  };

  const handleContainerTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const state = swipeGestureRef.current;
    swipeGestureRef.current = null;
    setSwipeHomeProgress(0);
    if (!state || state.locked !== 'horizontal' || !canSwipeBackHome) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - state.startX;
    const elapsed = Date.now() - state.startTime;
    if (dx >= 72 || (dx >= 44 && elapsed < 260)) {
      navigateTo('dashboard');
    }
  };

  const handleContainerTouchCancel = () => {
    swipeGestureRef.current = null;
    setSwipeHomeProgress(0);
  };

  return (
    <MotionConfig reducedMotion={reducedMotion ? 'always' : 'user'}>
      {/* Full-bleed fixed app-shell (inset-0 without 100dvh override) spans true edge-to-edge on iOS PWA */}
      <div className="fixed inset-0 w-full overflow-hidden bg-[#F5F5F7] dark:bg-[#0A0A0C] text-neutral-900 dark:text-neutral-50 selection:bg-[#FF6B35]/20 flex">
        {/* Desktop Sidebar */}
        <aside
          aria-label="Thanh điều hướng chính"
          className="hidden lg:flex lg:w-56 lg:flex-col lg:shrink-0 border-r border-black/[0.06] dark:border-white/[0.07] bg-white/85 dark:bg-[#111113]/90 backdrop-blur-2xl px-3 py-5"
        >
          <div className="px-2.5 mb-6">
            <button
              type="button"
              onClick={() => navigateTo('dashboard')}
              className="text-left focus:outline-none"
              aria-label="YunzyHub Trang chủ"
            >
              <BrandLogo size={28} showWordmark />
            </button>
          </div>

          <nav className="space-y-1">
            {PRIMARY_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;

              return (
                <motion.button
                  key={item.id}
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => navigateTo(item.id)}
                  className={`relative w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'text-white dark:text-neutral-950 font-semibold'
                      : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.05]'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="desktop-nav-pill"
                      transition={DOCK_SPRING}
                      className="absolute inset-0 rounded-xl bg-[#17130F] dark:bg-white -z-10"
                    />
                  )}
                  <span className="flex items-center gap-3">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </span>
                  {item.id === 'workspace' && workspaceTabs.length > 0 && (
                    <span
                      className={`font-mono tabular-nums text-[11px] ${
                        isActive
                          ? 'text-white/80 dark:text-neutral-700'
                          : 'text-neutral-500 dark:text-neutral-400'
                      }`}
                    >
                      {workspaceTabs.length}
                    </span>
                  )}
                </motion.button>
              );
            })}

            <div className="pt-2.5 mt-2.5 border-t border-black/[0.06] dark:border-white/[0.07]">
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => navigateTo('search')}
                className={`relative w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors whitespace-nowrap ${
                  activeSection === 'search'
                    ? 'text-white dark:text-neutral-950 font-semibold'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.05]'
                }`}
              >
                {activeSection === 'search' && (
                  <motion.span
                    layoutId="desktop-nav-pill"
                    transition={DOCK_SPRING}
                    className="absolute inset-0 rounded-xl bg-[#17130F] dark:bg-white -z-10"
                  />
                )}
                <span className="flex items-center gap-3">
                  <Search className="w-4 h-4 shrink-0" />
                  <span>Tìm kiếm</span>
                </span>
              </motion.button>
            </div>
          </nav>
        </aside>

        {/* Internal Scrollable Content Column */}
        <div
          ref={scrollContainerRef}
          onTouchStart={handleContainerTouchStart}
          onTouchMove={handleContainerTouchMove}
          onTouchEnd={handleContainerTouchEnd}
          onTouchCancel={handleContainerTouchCancel}
          className={`flex-1 flex flex-col min-w-0 min-h-0 ${
            hasRunningWorkspaceTool
              ? 'overflow-hidden'
              : 'overflow-y-auto overscroll-y-contain'
          }`}
        >
          {swipeHomeProgress > 0.08 && (
            <div
              aria-hidden="true"
              className="fixed left-3 top-1/2 z-40 pointer-events-none lg:hidden inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border border-black/[0.08] dark:border-white/[0.12] bg-white/88 dark:bg-[#1C1C1E]/90 backdrop-blur-xl shadow-lg text-xs font-semibold text-neutral-900 dark:text-white"
              style={{
                opacity: Math.min(1, swipeHomeProgress * 1.2),
                transform: `translate3d(${Math.round((swipeHomeProgress - 1) * 16)}px, -50%, 0)`,
              }}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Home</span>
            </div>
          )}
          {!isOnline && !hasRunningWorkspaceTool && (
            <div className="px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-2 text-xs font-medium text-amber-800 dark:text-amber-200 shrink-0">
              <WifiOff className="w-3.5 h-3.5 shrink-0" />
              <span>Ngoại tuyến</span>
            </div>
          )}

          <main
            className={
              hasRunningWorkspaceTool
                ? 'flex-1 flex flex-col min-h-0 w-full p-0 lg:p-4'
                : 'flex-1 px-4 pb-28 sm:px-6 lg:pb-8 max-w-6xl w-full mx-auto ios-page-top'
            }
          >
            {!dbInitialized ? (
              <div className="min-h-[120px]" aria-busy="true" />
            ) : (
              <>
                {!isWorkspaceActive && (
                  <AnimatePresence initial={false}>
                    <motion.div
                      key={activeSection}
                      initial={{ opacity: 0, x: navDirection * 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.22, ease: APPLE_EASE }}
                    >
                      {activeSection === 'dashboard' && (
                        <DashboardPage
                          tools={tools}
                          workspaceTabs={workspaceTabs}
                          onLaunchTool={handleLaunchTool}
                          onToggleFavorite={handleToggleFavorite}
                          onEditTool={(t) => {
                            haptic.light();
                            setEditingTool(t);
                          }}
                          onEditCode={(t) => {
                            if (t.type !== 'url') handleOpenCodeEditor(t);
                          }}
                          onShareTool={handleShareTool}
                          onDeleteTool={(t) => setPendingDeleteTool(t)}
                          onOpenImportModal={(mode) => {
                            haptic.light();
                            setImportModalState({ open: true, mode });
                          }}
                          onNavigate={navigateTo}
                        />
                      )}

                      {activeSection === 'library' && (
                        <LibraryPage
                          tools={tools}
                          workspaceTabs={workspaceTabs}
                          viewMode={libraryView}
                          onViewModeChange={(mode) => {
                            haptic.selection();
                            toolRepository.setPreference('libraryView', mode);
                          }}
                          onLaunchTool={handleLaunchTool}
                          onToggleFavorite={handleToggleFavorite}
                          onEditTool={(t) => {
                            haptic.light();
                            setEditingTool(t);
                          }}
                          onEditCode={(t) => {
                            if (t.type !== 'url') handleOpenCodeEditor(t);
                          }}
                          onShareTool={handleShareTool}
                          onDeleteTool={(t) => setPendingDeleteTool(t)}
                          onOpenImportModal={(mode) => {
                            haptic.light();
                            setImportModalState({ open: true, mode });
                          }}
                        />
                      )}

                      {activeSection === 'search' && (
                        <SearchPage
                          tools={tools}
                          workspaceTabs={workspaceTabs}
                          inputRef={searchInputRef}
                          onLaunchTool={handleLaunchTool}
                          onToggleFavorite={handleToggleFavorite}
                          onEditTool={(t) => {
                            haptic.light();
                            setEditingTool(t);
                          }}
                          onEditCode={(t) => {
                            if (t.type !== 'url') handleOpenCodeEditor(t);
                          }}
                          onShareTool={handleShareTool}
                          onDeleteTool={(t) => setPendingDeleteTool(t)}
                        />
                      )}

                      {activeSection === 'settings' && (
                        <SettingsPage
                          tools={tools}
                          theme={theme}
                          onThemeChange={(nextTheme) => {
                            haptic.selection();
                            toolRepository.setPreference('theme', nextTheme);
                          }}
                          fontFamily={fontFamily}
                          onFontFamilyChange={(font) => {
                            toolRepository.setPreference('fontFamily', font);
                          }}
                          fontScale={fontScale}
                          onFontScaleChange={(scale) => {
                            toolRepository.setPreference('fontScale', scale);
                          }}
                          workspaceTabBarPosition={workspaceTabBarPosition}
                          onWorkspaceTabBarPositionChange={(pos) => {
                            toolRepository.setPreference('workspaceTabBarPosition', pos);
                          }}
                          hapticsEnabled={hapticsEnabled}
                          onHapticsEnabledChange={(enabled) => {
                            haptic.setEnabled(enabled);
                            if (enabled) haptic.selection();
                            toolRepository.setPreference('hapticsEnabled', enabled);
                          }}
                          reducedMotion={reducedMotion}
                          onReducedMotionChange={(enabled) => {
                            haptic.selection();
                            toolRepository.setPreference('reducedMotion', enabled);
                          }}
                          swipeBackHome={swipeBackHome}
                          onSwipeBackHomeChange={(enabled) => {
                            haptic.selection();
                            toolRepository.setPreference('swipeBackHome', enabled);
                          }}
                          openAfterImportDefault={openAfterImportDefault}
                          onOpenAfterImportDefaultChange={(enabled) => {
                            haptic.selection();
                            toolRepository.setPreference(
                              'openAfterImportDefault',
                              enabled
                            );
                          }}
                          workspaceTabCount={workspaceTabs.length}
                          onCloseAllWorkspaceTabs={() =>
                            toolRepository.closeAllWorkspaceTabs()
                          }
                          toolStorageCount={toolStorageRecords.length}
                          toolStorageBytes={toolStorageBytes}
                          historyCount={historyCount}
                        />
                      )}
                    </motion.div>
                  </AnimatePresence>
                )}

                {/* WorkspacePage stays mounted so open tool iframes preserve live state across navigation */}
                <div
                  className={
                    isWorkspaceActive
                      ? 'flex-1 flex flex-col min-h-0 w-full'
                      : 'hidden'
                  }
                  aria-hidden={!isWorkspaceActive}
                >
                  <WorkspacePage
                    tools={tools}
                    workspaceTabs={workspaceTabs}
                    activeTabId={activeTabId}
                    swipeBackHome={swipeBackHome}
                    tabBarPosition={workspaceTabBarPosition}
                    onSelectTab={(tabId) => {
                      haptic.selection();
                      toolRepository.setActiveWorkspaceTab(tabId);
                    }}
                    onCloseTab={(tabId) => {
                      haptic.light();
                      toolRepository.closeWorkspaceTab(tabId);
                    }}
                    onCloseAllTabs={() => {
                      haptic.warning();
                      toolRepository.closeAllWorkspaceTabs();
                    }}
                    onLaunchTool={handleLaunchTool}
                    onShareTool={handleShareTool}
                    onOpenImportModal={(mode) => {
                      haptic.light();
                      setImportModalState({ open: true, mode });
                    }}
                    onEditCode={handleOpenCodeEditor}
                    onNavigate={navigateTo}
                    onBack={() =>
                      navigateTo(
                        lastBrowseSection === 'workspace'
                          ? 'dashboard'
                          : lastBrowseSection
                      )
                    }
                  />
                </div>
              </>
            )}
          </main>
        </div>

        {/* Pinned iOS Floating Concentric Circle-Pill Blur Mobile Dock */}
        <AnimatePresence initial={false}>
          {!hasRunningWorkspaceTool && (
            <motion.nav
              key="mobile-ios-dock"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ duration: 0.2, ease: APPLE_EASE }}
              aria-label="Điều hướng di động"
              className="lg:hidden absolute ios-dock-bottom left-4 right-4 z-30 mx-auto max-w-[380px] rounded-full border border-black/[0.08] dark:border-white/[0.12] bg-white/82 dark:bg-[#1C1C1E]/85 backdrop-blur-2xl backdrop-saturate-[180%] shadow-[0_8px_30px_rgba(0,0,0,0.10),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_14px_38px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.08)] p-[5px] grid grid-cols-4 gap-1 will-change-transform"
            >
              {PRIMARY_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                const showWorkspaceCount =
                  item.id === 'workspace' && workspaceTabs.length > 0;
                return (
                  <motion.button
                    key={item.id}
                    type="button"
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={item.label}
                    whileTap={{ scale: 0.93 }}
                    transition={{ duration: 0.14, ease: APPLE_EASE }}
                    onClick={() => navigateTo(item.id)}
                    className={`relative min-h-[52px] flex flex-col items-center justify-center gap-0.5 rounded-full px-1 py-1.5 text-[11px] leading-tight whitespace-nowrap select-none transition-colors ${
                      isActive
                        ? 'text-neutral-950 dark:text-white font-semibold'
                        : 'text-neutral-500 dark:text-neutral-400 font-medium'
                    }`}
                  >
                    <HapticTapOverlay />
                    {isActive && (
                      <motion.span
                        layoutId="ios-dock-pill"
                        transition={DOCK_SPRING}
                        className="absolute inset-0 rounded-full bg-black/[0.07] dark:bg-white/[0.14] border border-white/70 dark:border-white/[0.14] -z-10 will-change-transform"
                      />
                    )}
                    <span className="relative flex items-center justify-center">
                      <Icon className="w-[19px] h-[19px] stroke-[2]" />
                      {showWorkspaceCount && (
                        <span className="absolute -top-1 -right-2 min-w-[14px] h-[14px] px-1 rounded-full bg-[#FF6B35] text-white text-[9px] font-bold leading-[14px] text-center tabular-nums">
                          {workspaceTabs.length}
                        </span>
                      )}
                    </span>
                    <span>{item.label}</span>
                  </motion.button>
                );
              })}
            </motion.nav>
          )}
        </AnimatePresence>

        {/* Delete Confirmation Dialog from Context Menu */}
        {pendingDeleteTool && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4"
            onClick={() => setPendingDeleteTool(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xs rounded-2xl bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/[0.1] p-5 shadow-2xl space-y-3"
            >
              <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
                Xóa công cụ?
              </h3>
              <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                Bạn có chắc muốn xóa "{pendingDeleteTool.name}" khỏi thư viện?
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPendingDeleteTool(null)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-neutral-600 dark:text-neutral-300"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const id = pendingDeleteTool.id;
                    setPendingDeleteTool(null);
                    haptic.warning();
                    await toolRepository.deleteTool(id);
                    setToastMessage('Đã xóa công cụ');
                  }}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-rose-600 text-white"
                >
                  Xóa
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Lightweight Toast */}
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              key="app-toast"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-[#17130F]/90 dark:bg-white/95 text-white dark:text-[#17130F] text-xs font-semibold shadow-xl backdrop-blur-xl pointer-events-none whitespace-nowrap"
            >
              {toastMessage}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modals & Detail Drawer */}
        <ImportToolModal
          isOpen={importModalState.open}
          initialMode={importModalState.mode}
          defaultOpenAfterImport={openAfterImportDefault}
          onClose={() => {
            haptic.light();
            setImportModalState((s) => ({ ...s, open: false }));
          }}
          onSuccess={async (createdTool, openImmediately) => {
            haptic.success();
            setImportModalState((s) => ({ ...s, open: false }));
            if (openImmediately) {
              await toolRepository.openToolInWorkspace(createdTool.id);
              setActiveSection('workspace');
            }
          }}
        />

        <EditToolModal
          tool={editingTool}
          onClose={() => {
            haptic.light();
            setEditingTool(null);
          }}
          onUpdated={() => {
            haptic.success();
            setEditingTool(null);
          }}
          onDeleted={() => {
            haptic.warning();
            setEditingTool(null);
          }}
          onLaunch={handleLaunchTool}
          onEditCode={(t) => {
            setEditingTool(null);
            handleOpenCodeEditor(t);
          }}
        />

        <CodeEditorModal
          tool={codeEditingTool}
          onClose={() => {
            haptic.light();
            setCodeEditingTool(null);
          }}
          onSaved={handleCodeSaved}
        />
      </div>
    </MotionConfig>
  );
}
