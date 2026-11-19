import React, { useMemo, useState } from 'react';
import { Search as SearchIcon, X } from 'lucide-react';
import { motion } from 'motion/react';
import { ToolCard } from '../components/ToolCard';
import type { ToolManifest, WorkspaceTabRecord } from '../types/models';
import { haptic } from '../utils/haptics';

interface SearchPageProps {
  tools: ToolManifest[];
  workspaceTabs: WorkspaceTabRecord[];
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onLaunchTool: (tool: ToolManifest) => void;
  onToggleFavorite: (tool: ToolManifest) => void;
  onEditTool: (tool: ToolManifest) => void;
}

export const SearchPage: React.FC<SearchPageProps> = ({
  tools,
  workspaceTabs,
  inputRef,
  onLaunchTool,
  onToggleFavorite,
  onEditTool,
}) => {
  const [query, setQuery] = useState('');

  const openTabIds = useMemo(
    () => new Set(workspaceTabs.map((w) => w.toolId)),
    [workspaceTabs]
  );

  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return tools;

    return tools.filter((tool) => {
      const inName = tool.name.toLowerCase().includes(normalizedQuery);
      const inDesc = tool.description.toLowerCase().includes(normalizedQuery);
      const inCat = tool.category.toLowerCase().includes(normalizedQuery);
      const inTags = tool.tags.some((t) =>
        t.toLowerCase().includes(normalizedQuery)
      );
      const inUrl = (tool.url || '').toLowerCase().includes(normalizedQuery);
      const inEntry = (tool.entryPath || '').toLowerCase().includes(normalizedQuery);

      return inName || inDesc || inCat || inTags || inUrl || inEntry;
    });
  }, [tools, query]);

  return (
    <div className="space-y-5">
      {/* Single Search Field */}
      <div className="relative max-w-xl">
        <SearchIcon className="w-4 h-4 text-neutral-400 dark:text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Tìm kiếm công cụ"
          placeholder="Tìm kiếm..."
          className="w-full rounded-2xl border border-black/[0.07] dark:border-white/[0.09] bg-white dark:bg-[#161618] pl-10 pr-9 py-2.5 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/40 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-shadow"
        />
        {query && (
          <motion.button
            type="button"
            whileTap={{ scale: 0.85 }}
            onClick={() => {
              haptic.light();
              setQuery('');
            }}
            aria-label="Xóa từ khóa"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </motion.button>
        )}
      </div>

      {/* Results Grid */}
      {results.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {results.map((tool) => (
            <ToolCard
              key={tool.id}
              tool={tool}
              isOpenInWorkspace={openTabIds.has(tool.id)}
              onLaunch={onLaunchTool}
              onToggleFavorite={onToggleFavorite}
              onEdit={onEditTool}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#161618] py-16 px-6 text-center">
          <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
            Không có kết quả
          </p>
        </div>
      )}
    </div>
  );
};
