import React, { useMemo, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { motion } from 'motion/react';
import { HapticTapOverlay } from '../components/HapticTapOverlay';
import { ToolCard } from '../components/ToolCard';
import type {
  HistoryRecord,
  NavSection,
  ToolManifest,
  WorkspaceTabRecord,
} from '../types/models';
import { haptic } from '../utils/haptics';

interface DashboardPageProps {
  tools: ToolManifest[];
  workspaceTabs: WorkspaceTabRecord[];
  recentHistory?: HistoryRecord[];
  onLaunchTool: (tool: ToolManifest) => void;
  onToggleFavorite: (tool: ToolManifest) => void;
  onEditTool: (tool: ToolManifest) => void;
  onEditCode?: (tool: ToolManifest) => void;
  onShareTool?: (tool: ToolManifest) => void;
  onDeleteTool?: (tool: ToolManifest) => void;
  onOpenImportModal: (mode: 'file' | 'create' | 'url') => void;
  onNavigate?: (section: NavSection) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  tools,
  workspaceTabs,
  onLaunchTool,
  onToggleFavorite,
  onEditTool,
  onEditCode,
  onShareTool,
  onDeleteTool,
  onOpenImportModal,
}) => {
  const [query, setQuery] = useState('');

  const openTabIds = useMemo(
    () => new Set(workspaceTabs.map((w) => w.toolId)),
    [workspaceTabs]
  );

  const favorites = useMemo(() => tools.filter((t) => t.favorite), [tools]);

  const recentTools = useMemo(() => {
    const favoriteIds = new Set(favorites.map((f) => f.id));
    const remaining = tools.filter((t) => !favoriteIds.has(t.id));
    const sorted = [...remaining].sort((a, b) =>
      (b.lastOpenedAt || b.updatedAt).localeCompare(
        a.lastOpenedAt || a.updatedAt
      )
    );
    return sorted;
  }, [tools, favorites]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return tools.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q)) ||
        (t.entryPath || '').toLowerCase().includes(q)
    );
  }, [tools, query]);

  return (
    <div className="space-y-6">
      {/* Balanced Top Bar (Search Pill + Add Button; no redundant Library button) */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-neutral-400 dark:text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Tìm kiếm công cụ"
            placeholder="Tìm kiếm..."
            className="w-full h-11 rounded-full border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#161618] pl-10 pr-9 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/40 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                haptic.light();
                setQuery('');
              }}
              aria-label="Xóa tìm kiếm"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
            >
              <HapticTapOverlay />
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <motion.button
          type="button"
          whileTap={{ scale: 0.94 }}
          onClick={() => onOpenImportModal('file')}
          aria-label="Thêm công cụ"
          className="relative w-11 h-11 sm:w-auto sm:px-4 rounded-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-[#17130F] hover:bg-[#2C241E] dark:bg-white dark:hover:bg-neutral-200 text-[#F3EEE3] dark:text-[#17130F] transition-colors whitespace-nowrap shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
        >
          <HapticTapOverlay />
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Thêm</span>
        </motion.button>
      </div>

      {/* Empty Library State */}
      {tools.length === 0 ? (
        <div className="rounded-3xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#161618] py-16 px-6 text-center space-y-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-300">
            Chưa có công cụ
          </p>
          <div className="flex items-center justify-center gap-2">
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => onOpenImportModal('file')}
              className="relative inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-semibold bg-[#17130F] hover:bg-[#2C241E] dark:bg-white dark:hover:bg-neutral-200 text-[#F3EEE3] dark:text-[#17130F] transition-colors"
            >
              <HapticTapOverlay />
              <Plus className="w-4 h-4" />
              <span>Thêm</span>
            </motion.button>
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => onOpenImportModal('create')}
              className="relative inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-semibold border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-[#1F1F23] text-neutral-800 dark:text-neutral-100 transition-colors"
            >
              <HapticTapOverlay />
              <span>Tạo code</span>
            </motion.button>
          </div>
        </div>
      ) : searchResults !== null ? (
        <section className="space-y-3">
          {searchResults.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {searchResults.map((tool) => (
                <ToolCard
                  key={tool.id}
                  tool={tool}
                  isOpenInWorkspace={openTabIds.has(tool.id)}
                  onLaunch={onLaunchTool}
                  onToggleFavorite={onToggleFavorite}
                  onEdit={onEditTool}
                  onEditCode={onEditCode}
                  onShare={onShareTool}
                  onDelete={onDeleteTool}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 py-8 text-center">
              Không có kết quả
            </p>
          )}
        </section>
      ) : (
        <div className="space-y-6">
          {favorites.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-medium text-neutral-500 dark:text-neutral-400 px-0.5">
                Yêu thích
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {favorites.map((tool) => (
                  <ToolCard
                    key={tool.id}
                    tool={tool}
                    isOpenInWorkspace={openTabIds.has(tool.id)}
                    onLaunch={onLaunchTool}
                    onToggleFavorite={onToggleFavorite}
                    onEdit={onEditTool}
                    onEditCode={onEditCode}
                    onShare={onShareTool}
                    onDelete={onDeleteTool}
                  />
                ))}
              </div>
            </section>
          )}

          {recentTools.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-medium text-neutral-500 dark:text-neutral-400 px-0.5">
                Gần đây
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {recentTools.map((tool) => (
                  <ToolCard
                    key={tool.id}
                    tool={tool}
                    isOpenInWorkspace={openTabIds.has(tool.id)}
                    onLaunch={onLaunchTool}
                    onToggleFavorite={onToggleFavorite}
                    onEdit={onEditTool}
                    onEditCode={onEditCode}
                    onShare={onShareTool}
                    onDelete={onDeleteTool}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};
