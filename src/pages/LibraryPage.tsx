import React, { useMemo, useState } from 'react';
import {
  LayoutGrid,
  List,
  MoreHorizontal,
  Plus,
  SlidersHorizontal,
  Star,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { HapticTapOverlay } from '../components/HapticTapOverlay';
import { renderToolTypeGlyph, ToolCard } from '../components/ToolCard';
import {
  type ContextMenuPoint,
  ToolContextMenu,
  useLongPress,
} from '../components/ToolContextMenu';
import type {
  LibraryViewMode,
  ToolManifest,
  ToolType,
  WorkspaceTabRecord,
} from '../types/models';
import { haptic } from '../utils/haptics';

interface LibraryPageProps {
  tools: ToolManifest[];
  workspaceTabs: WorkspaceTabRecord[];
  viewMode: LibraryViewMode;
  onViewModeChange: (mode: LibraryViewMode) => void;
  onLaunchTool: (tool: ToolManifest) => void;
  onToggleFavorite: (tool: ToolManifest) => void;
  onEditTool: (tool: ToolManifest) => void;
  onEditCode?: (tool: ToolManifest) => void;
  onShareTool?: (tool: ToolManifest) => void;
  onDeleteTool?: (tool: ToolManifest) => void;
  onOpenImportModal: (mode: 'file' | 'create' | 'url') => void;
}

interface LibraryListRowProps {
  tool: ToolManifest;
  onLaunch: (tool: ToolManifest) => void;
  onToggleFavorite: (tool: ToolManifest) => void;
  onEdit: (tool: ToolManifest) => void;
  onOpenContext: (tool: ToolManifest, point: ContextMenuPoint) => void;
}

const LibraryListRow: React.FC<LibraryListRowProps> = ({
  tool,
  onLaunch,
  onToggleFavorite,
  onEdit,
  onOpenContext,
}) => {
  const longPress = useLongPress((pt) => onOpenContext(tool, pt));
  return (
    <tr
      onPointerDown={longPress.onPointerDown}
      onPointerMove={longPress.onPointerMove}
      onPointerUp={longPress.onPointerUp}
      onPointerCancel={longPress.onPointerCancel}
      onContextMenu={(e) => {
        e.preventDefault();
        onOpenContext(tool, { x: e.clientX, y: e.clientY });
      }}
      onClick={() => {
        if (longPress.consumeLongPress()) return;
        onLaunch(tool);
      }}
      className="cursor-pointer ios-no-callout hover:bg-black/[0.025] dark:hover:bg-white/[0.04] active:bg-black/[0.05] dark:active:bg-white/[0.07] transition-colors"
    >
      <td className="py-3 px-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="shrink-0 w-8 h-8 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] flex items-center justify-center">
            {renderToolTypeGlyph(tool, 'w-4 h-4')}
          </span>
          <span className="font-semibold text-[13px] text-neutral-900 dark:text-neutral-100 truncate">
            {tool.name}
          </span>
        </div>
      </td>
      <td
        className="py-2.5 px-3 text-right whitespace-nowrap"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="inline-flex items-center gap-1">
          <motion.button
            type="button"
            whileTap={{ scale: 0.84 }}
            onClick={() => onToggleFavorite(tool)}
            aria-label={tool.favorite ? 'Bỏ yêu thích' : 'Yêu thích'}
            className={`relative p-2 rounded-lg transition-colors ${
              tool.favorite
                ? 'text-amber-500 dark:text-amber-400'
                : 'text-neutral-400 hover:text-neutral-800 dark:hover:text-white'
            }`}
          >
            <HapticTapOverlay />
            <Star className={`w-4 h-4 ${tool.favorite ? 'fill-current' : ''}`} />
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.84 }}
            onClick={() => onEdit(tool)}
            aria-label={`Tùy chọn ${tool.name}`}
            className="relative p-2 rounded-lg text-neutral-400 hover:text-neutral-800 dark:hover:text-white transition-colors"
          >
            <HapticTapOverlay />
            <MoreHorizontal className="w-4 h-4" />
          </motion.button>
        </div>
      </td>
    </tr>
  );
};

type SortKey = 'updated' | 'recent' | 'name';

const SEGMENT_SPRING = {
  type: 'spring' as const,
  stiffness: 420,
  damping: 40,
  mass: 0.8,
};

export const LibraryPage: React.FC<LibraryPageProps> = ({
  tools,
  workspaceTabs,
  viewMode,
  onViewModeChange,
  onLaunchTool,
  onToggleFavorite,
  onEditTool,
  onEditCode,
  onShareTool,
  onDeleteTool,
  onOpenImportModal,
}) => {
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<'all' | ToolType>('all');
  const [sortBy, setSortBy] = useState<SortKey>('updated');
  const [listMenu, setListMenu] = useState<{
    tool: ToolManifest;
    anchor: ContextMenuPoint;
  } | null>(null);

  const openTabIds = useMemo(
    () => new Set(workspaceTabs.map((w) => w.toolId)),
    [workspaceTabs]
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    tools.forEach((t) => {
      if (t.category) set.add(t.category);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [tools]);

  const activeFilterCount =
    (selectedCategory !== 'all' ? 1 : 0) +
    (selectedType !== 'all' ? 1 : 0) +
    (sortBy !== 'updated' ? 1 : 0);

  const filteredTools = useMemo(() => {
    return tools
      .filter((t) => {
        if (selectedCategory !== 'all' && t.category !== selectedCategory)
          return false;
        if (selectedType !== 'all' && t.type !== selectedType) return false;
        return true;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'name':
            return a.name.localeCompare(b.name, 'vi');
          case 'recent':
            return (b.lastOpenedAt || '').localeCompare(a.lastOpenedAt || '');
          case 'updated':
          default:
            return b.updatedAt.localeCompare(a.updatedAt);
        }
      });
  }, [tools, selectedCategory, selectedType, sortBy]);

  return (
    <div className="space-y-5">
      {/* Compact Header */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-base sm:text-lg font-semibold tracking-tight text-neutral-950 dark:text-white">
          Thư viện
        </h1>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              haptic.selection();
              setShowFilters((prev) => !prev);
            }}
            aria-expanded={showFilters}
            className={`relative inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-colors whitespace-nowrap ${
              showFilters || activeFilterCount > 0
                ? 'border-neutral-900/20 dark:border-white/25 bg-neutral-900/[0.06] dark:bg-white/[0.12] text-neutral-950 dark:text-white font-semibold'
                : 'border-black/[0.07] dark:border-white/[0.09] bg-white dark:bg-[#161618] text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-[#1E1E21]'
            }`}
          >
            <HapticTapOverlay />
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>
              Lọc{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </span>
          </motion.button>

          <div
            className="flex items-center gap-0.5 p-1 rounded-xl border border-black/[0.07] dark:border-white/[0.09] bg-white dark:bg-[#161618]"
            role="group"
            aria-label="Chế độ xem"
          >
            <motion.button
              type="button"
              whileTap={{ scale: 0.92 }}
              onClick={() => onViewModeChange('grid')}
              aria-label="Dạng ô"
              title="Dạng ô"
              className={`relative p-1.5 rounded-lg transition-colors ${
                viewMode === 'grid'
                  ? 'text-white dark:text-neutral-950'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <HapticTapOverlay />
              {viewMode === 'grid' && (
                <motion.span
                  layoutId="library-view-pill"
                  transition={SEGMENT_SPRING}
                  className="absolute inset-0 rounded-lg bg-neutral-900 dark:bg-white"
                />
              )}
              <LayoutGrid className="relative z-10 w-3.5 h-3.5" />
            </motion.button>
            <motion.button
              type="button"
              whileTap={{ scale: 0.92 }}
              onClick={() => onViewModeChange('list')}
              aria-label="Dạng danh sách"
              title="Dạng danh sách"
              className={`relative p-1.5 rounded-lg transition-colors ${
                viewMode === 'list'
                  ? 'text-white dark:text-neutral-950'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <HapticTapOverlay />
              {viewMode === 'list' && (
                <motion.span
                  layoutId="library-view-pill"
                  transition={SEGMENT_SPRING}
                  className="absolute inset-0 rounded-lg bg-neutral-900 dark:bg-white"
                />
              )}
              <List className="relative z-10 w-3.5 h-3.5" />
            </motion.button>
          </div>

          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={() => onOpenImportModal('file')}
            className="relative inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#17130F] hover:bg-[#2C241E] dark:bg-white dark:hover:bg-neutral-200 text-[#F3EEE3] dark:text-[#17130F] transition-colors whitespace-nowrap shadow-2xs"
          >
            <HapticTapOverlay />
            <Plus className="w-4 h-4" />
            <span>Thêm</span>
          </motion.button>
        </div>
      </div>

      {/* Collapsible Filters */}
      <AnimatePresence initial={false}>
        {showFilters && (
          <motion.div
            key="library-filters"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#161618] p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
          >
            <div className="flex flex-wrap items-center gap-2.5">
              <select
                aria-label="Loại"
                value={selectedType}
                onChange={(e) => {
                  haptic.selection();
                  setSelectedType(e.target.value as 'all' | ToolType);
                }}
                className="rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-[#F5F5F7] dark:bg-[#1F1F23] px-3 py-1.5 text-xs font-medium text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/40"
              >
                <option value="all">Mọi loại</option>
                <option value="html">HTML</option>
                <option value="zip">ZIP</option>
                <option value="file">Tệp</option>
                <option value="url">URL</option>
              </select>

              {categories.length > 0 && (
                <select
                  aria-label="Danh mục"
                  value={selectedCategory}
                  onChange={(e) => {
                    haptic.selection();
                    setSelectedCategory(e.target.value);
                  }}
                  className="rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-[#F5F5F7] dark:bg-[#1F1F23] px-3 py-1.5 text-xs font-medium text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40 dark:focus:ring-[#0A84FF]/40"
                >
                  <option value="all">Mọi danh mục</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              )}

              <select
                aria-label="Sắp xếp"
                value={sortBy}
                onChange={(e) => {
                  haptic.selection();
                  setSortBy(e.target.value as SortKey);
                }}
                className="rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-[#F5F5F7] dark:bg-[#1F1F23] px-3 py-1.5 text-xs font-medium text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40 dark:focus:ring-[#0A84FF]/40"
              >
                <option value="updated">Mới nhất</option>
                <option value="recent">Gần đây</option>
                <option value="name">A–Z</option>
              </select>
            </div>

            {activeFilterCount > 0 && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.94 }}
                onClick={() => {
                  haptic.light();
                  setSelectedCategory('all');
                  setSelectedType('all');
                  setSortBy('updated');
                }}
                className="relative text-xs font-semibold text-[#007AFF] dark:text-[#0A84FF]"
              >
                <HapticTapOverlay />
                Đặt lại
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      {filteredTools.length === 0 ? (
        <div className="rounded-3xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#161618] py-16 px-6 text-center space-y-4">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-300">
            Chưa có công cụ
          </p>
          {tools.length === 0 && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => onOpenImportModal('file')}
              className="relative inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-semibold bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-neutral-950 transition-colors"
            >
              <HapticTapOverlay />
              <Plus className="w-4 h-4" />
              <span>Thêm</span>
            </motion.button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {filteredTools.map((tool) => (
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
        <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#161618] overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <table className="w-full text-left border-collapse text-xs">
            <tbody className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
              {filteredTools.map((tool) => (
                <LibraryListRow
                  key={tool.id}
                  tool={tool}
                  onLaunch={onLaunchTool}
                  onToggleFavorite={onToggleFavorite}
                  onEdit={onEditTool}
                  onOpenContext={(target, pt) => setListMenu({ tool: target, anchor: pt })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ToolContextMenu
        tool={listMenu?.tool ?? null}
        anchor={listMenu?.anchor ?? null}
        onClose={() => setListMenu(null)}
        onLaunch={onLaunchTool}
        onShare={onShareTool}
        onEditCode={onEditCode}
        onToggleFavorite={onToggleFavorite}
        onEdit={onEditTool}
        onDelete={onDeleteTool}
      />
    </div>
  );
};
