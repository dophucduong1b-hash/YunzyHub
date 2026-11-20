import React from 'react';
import {
  FileArchive,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  Film,
  Globe,
  MoreHorizontal,
  Music,
  Star,
} from 'lucide-react';
import { motion } from 'motion/react';
import type { ToolManifest } from '../types/models';
import { HapticTapOverlay } from './HapticTapOverlay';

interface ToolCardProps {
  tool: ToolManifest;
  isOpenInWorkspace?: boolean;
  onLaunch: (tool: ToolManifest) => void;
  onToggleFavorite: (tool: ToolManifest) => void;
  onEdit: (tool: ToolManifest) => void;
}

export function renderToolTypeGlyph(tool: ToolManifest, sizeClass = 'w-5 h-5 sm:w-[22px] sm:h-[22px] stroke-[1.85]') {
  if (tool.type === 'html') {
    return <FileCode className={`${sizeClass} text-[#FF6B35]`} />;
  }
  if (tool.type === 'zip') {
    return <FileArchive className={`${sizeClass} text-neutral-800 dark:text-neutral-100`} />;
  }
  if (tool.type === 'url') {
    return <Globe className={`${sizeClass} text-emerald-600 dark:text-emerald-400`} />;
  }

  const lower = (tool.entryPath || tool.name).toLowerCase();
  if (lower.endsWith('.pdf')) {
    return <FileText className={`${sizeClass} text-rose-600 dark:text-rose-400`} />;
  }
  if (lower.endsWith('.docx')) {
    return <FileText className={`${sizeClass} text-[#007AFF] dark:text-[#0A84FF]`} />;
  }
  if (lower.endsWith('.csv') || lower.endsWith('.tsv')) {
    return <FileSpreadsheet className={`${sizeClass} text-emerald-600 dark:text-emerald-400`} />;
  }
  if (/\.(png|jpe?g|webp|gif|avif|bmp|ico|svg)$/i.test(lower)) {
    return <FileImage className={`${sizeClass} text-violet-600 dark:text-violet-400`} />;
  }
  if (/\.(mp3|wav|ogg|m4a)$/i.test(lower)) {
    return <Music className={`${sizeClass} text-pink-600 dark:text-pink-400`} />;
  }
  if (/\.(mp4|webm)$/i.test(lower)) {
    return <Film className={`${sizeClass} text-indigo-600 dark:text-indigo-400`} />;
  }
  if (/\.(js|mjs|jsx|ts|tsx|css|scss|json|sql|xml|yaml|yml)$/i.test(lower)) {
    return <FileCode className={`${sizeClass} text-amber-600 dark:text-amber-400`} />;
  }
  return <FileText className={`${sizeClass} text-sky-600 dark:text-sky-400`} />;
}

export const ToolCard: React.FC<ToolCardProps> = ({
  tool,
  isOpenInWorkspace = false,
  onLaunch,
  onToggleFavorite,
  onEdit,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onLaunch(tool);
    }
  };

  return (
    <motion.article
      role="button"
      tabIndex={0}
      aria-label={`Mở ${tool.name}`}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
      onClick={() => onLaunch(tool)}
      onKeyDown={handleKeyDown}
      className={`group relative flex flex-col justify-between rounded-2xl border p-3.5 sm:p-4 cursor-pointer select-none transition-[transform,box-shadow,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(0,0,0,0.06)] dark:hover:shadow-[0_6px_20px_rgba(0,0,0,0.35)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B35] ${
        isOpenInWorkspace
          ? 'border-neutral-900/20 dark:border-white/25 bg-white dark:bg-[#1A1A1D] shadow-[0_2px_10px_rgba(0,0,0,0.05)]'
          : 'border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#161618] hover:border-black/[0.12] dark:hover:border-white/[0.15] shadow-[0_1px_2px_rgba(0,0,0,0.03)]'
      }`}
    >
      <HapticTapOverlay zClass="z-0" />
      <div className="flex items-start justify-between gap-2">
        <div className="pointer-events-none w-11 h-11 sm:w-12 sm:h-12 rounded-[14px] bg-neutral-100 dark:bg-white/[0.07] flex items-center justify-center">
          {renderToolTypeGlyph(tool)}
        </div>

        <div
          className="relative z-10 flex items-center -mr-1 -mt-1"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={() => onToggleFavorite(tool)}
            aria-label={
              tool.favorite ? `Bỏ yêu thích ${tool.name}` : `Yêu thích ${tool.name}`
            }
            title={tool.favorite ? 'Bỏ yêu thích' : 'Yêu thích'}
            className={`relative p-2 rounded-xl transition-colors ${
              tool.favorite
                ? 'text-amber-500 dark:text-amber-400'
                : 'text-neutral-400 dark:text-neutral-500 opacity-75 group-hover:opacity-100 hover:text-neutral-800 dark:hover:text-neutral-100'
            }`}
          >
            <HapticTapOverlay />
            <Star
              className={`w-4 h-4 transition-transform duration-150 ${
                tool.favorite ? 'fill-current' : ''
              }`}
            />
          </motion.button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.86 }}
            onClick={() => onEdit(tool)}
            aria-label={`Tùy chọn ${tool.name}`}
            title="Chi tiết"
            className="relative p-2 rounded-xl text-neutral-400 dark:text-neutral-500 opacity-75 group-hover:opacity-100 hover:text-neutral-800 dark:hover:text-neutral-100 transition-colors"
          >
            <HapticTapOverlay />
            <MoreHorizontal className="w-4 h-4" />
          </motion.button>
        </div>
      </div>

      <h3 className="pointer-events-none mt-3.5 text-[13px] sm:text-sm font-semibold tracking-[-0.01em] text-neutral-900 dark:text-neutral-50 line-clamp-2 leading-snug">
        {tool.name}
      </h3>
    </motion.article>
  );
};
