/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
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
  type LibraryViewMode,
  type ThemeMode,
} from './repositories/toolRepository';
import type { NavSection, ToolManifest } from './types/models';
import { haptic } from './utils/haptics';

export type ImportModalMode = 'file' | 'create' | 'url';

export const PRIMARY_NAV_ITEMS: Array<{
  id: Extract<NavSection, 'dashboard' | 'workspace' | 'search' | 'settings'>;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'dashboard', label: 'Home', icon: Home },
  { id: 'workspace', label: 'Không gian', icon: Layers },
  { id: 'search', label: 'Tìm kiếm', icon: Search },
  { id: 'settings', label: 'Cài đặt', icon: Settings },
];

const DOCK_SPRING = {
  type: 'spring' as const,
  stiffness: 480,
  damping: 36,
  mass: 0.72,
};

export default function App() {
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
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

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
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

  return (
    <MotionConfig reducedMotion="user">
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
                onClick={() => navigateTo('library')}
                className={`relative w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors whitespace-nowrap ${
                  activeSection === 'library'
                    ? 'text-white dark:text-neutral-950 font-semibold'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.05]'
                }`}
              >
                {activeSection === 'library' && (
                  <motion.span
                    layoutId="desktop-nav-pill"
                    transition={DOCK_SPRING}
                    className="absolute inset-0 rounded-xl bg-[#17130F] dark:bg-white -z-10"
                  />
                )}
                <span className="flex items-center gap-3">
                  <LayoutGrid className="w-4 h-4 shrink-0" />
                  <span>Thư viện</span>
                </span>
                {tools.length > 0 && (
                  <span
                    className={`font-mono tabular-nums text-[11px] ${
                      activeSection === 'library'
                        ? 'text-white/80 dark:text-neutral-700'
                        : 'text-neutral-500 dark:text-neutral-400'
                    }`}
                  >
                    {tools.length}
                  </span>
                )}
              </motion.button>
            </div>
          </nav>
        </aside>

        {/* Internal Scrollable Content Column */}
        <div
          ref={scrollContainerRef}
          className={`flex-1 flex flex-col min-w-0 min-h-0 ${
            hasRunningWorkspaceTool
              ? 'overflow-hidden'
              : 'overflow-y-auto overscroll-y-contain'
          }`}
        >
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 pt-2">
                <div className="h-28 rounded-2xl bg-black/[0.04] dark:bg-white/[0.05] animate-pulse" />
                <div className="h-28 rounded-2xl bg-black/[0.04] dark:bg-white/[0.05] animate-pulse" />
                <div className="h-28 rounded-2xl bg-black/[0.04] dark:bg-white/[0.05] animate-pulse" />
                <div className="h-28 rounded-2xl bg-black/[0.04] dark:bg-white/[0.05] animate-pulse" />
              </div>
            ) : (
              <>
                {!isWorkspaceActive && (
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={activeSection}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
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

        {/* Pinned iOS Floating Rounded Blur Mobile Dock (anchored inside fixed app-shell so it never drifts up) */}
        <AnimatePresence>
          {!hasRunningWorkspaceTool && (
            <motion.nav
              key="mobile-ios-dock"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={DOCK_SPRING}
              aria-label="Điều hướng di động"
              className="lg:hidden absolute ios-dock-bottom left-5 right-5 z-30 mx-auto max-w-[368px] rounded-[28px] border border-black/[0.08] dark:border-white/[0.12] bg-white/82 dark:bg-[#1C1C1E]/85 backdrop-blur-2xl backdrop-saturate-[180%] shadow-[0_8px_30px_rgba(0,0,0,0.10),0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_14px_38px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.08)] p-1.5 grid grid-cols-4 gap-1"
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
                    aria-label={
                      item.id === 'search' && isActive
                        ? 'Tìm kiếm — chạm lại để mở bàn phím'
                        : item.label
                    }
                    whileTap={{ scale: 0.9 }}
                    transition={{ type: 'spring', stiffness: 550, damping: 30 }}
                    onClick={() => navigateTo(item.id)}
                    className={`relative min-h-[50px] flex flex-col items-center justify-center gap-0.5 rounded-[22px] px-1 py-1.5 text-[11px] leading-tight whitespace-nowrap select-none transition-colors ${
                      isActive
                        ? 'text-neutral-950 dark:text-white font-semibold'
                        : 'text-neutral-500 dark:text-neutral-400 font-medium'
                    }`}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="ios-dock-pill"
                        transition={DOCK_SPRING}
                        className="absolute inset-0 rounded-[22px] bg-black/[0.07] dark:bg-white/[0.14] -z-10"
                      />
                    )}
                    <motion.span
                      animate={{ scale: isActive ? 1.07 : 1 }}
                      transition={DOCK_SPRING}
                      className="relative flex items-center justify-center"
                    >
                      <Icon className="w-[19px] h-[19px] stroke-[2]" />
                      {showWorkspaceCount && (
                        <span className="absolute -top-1 -right-2 min-w-[14px] h-[14px] px-1 rounded-full bg-[#FF6B35] text-white text-[9px] font-bold leading-[14px] text-center tabular-nums">
                          {workspaceTabs.length}
                        </span>
                      )}
                    </motion.span>
                    <span>{item.label}</span>
                  </motion.button>
                );
              })}
            </motion.nav>
          )}
        </AnimatePresence>

        {/* Modals & Detail Drawer */}
        <ImportToolModal
          isOpen={importModalState.open}
          initialMode={importModalState.mode}
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
