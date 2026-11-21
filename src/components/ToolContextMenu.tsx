import React, { useEffect, useRef } from 'react';
import {
  Code2,
  Pencil,
  Play,
  Share2,
  Star,
  Trash2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { ToolManifest } from '../types/models';
import { haptic } from '../utils/haptics';

export interface ContextMenuPoint {
  x: number;
  y: number;
}

export function useLongPress(
  onLongPress: (point: ContextMenuPoint) => void,
  delayMs = 450
) {
  const timerRef = useRef<number | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const triggeredRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => clearTimer, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    triggeredRef.current = false;
    const x = e.clientX;
    const y = e.clientY;
    startPosRef.current = { x, y };
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      triggeredRef.current = true;
      haptic.medium();
      onLongPress({ x, y });
    }, delayMs);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!startPosRef.current || timerRef.current === null) return;
    const dx = Math.abs(e.clientX - startPosRef.current.x);
    const dy = Math.abs(e.clientY - startPosRef.current.y);
    if (dx > 10 || dy > 10) {
      clearTimer();
    }
  };

  const onPointerUp = () => {
    clearTimer();
  };

  const onPointerCancel = () => {
    clearTimer();
  };

  const consumeLongPress = () => {
    if (triggeredRef.current) {
      triggeredRef.current = false;
      return true;
    }
    return false;
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    consumeLongPress,
  };
}

interface ToolContextMenuProps {
  tool: ToolManifest | null;
  anchor: ContextMenuPoint | null;
  onClose: () => void;
  onLaunch: (tool: ToolManifest) => void;
  onShare?: (tool: ToolManifest) => void;
  onEditCode?: (tool: ToolManifest) => void;
  onToggleFavorite: (tool: ToolManifest) => void;
  onEdit: (tool: ToolManifest) => void;
  onDelete?: (tool: ToolManifest) => void;
}

export const ToolContextMenu: React.FC<ToolContextMenuProps> = ({
  tool,
  anchor,
  onClose,
  onLaunch,
  onShare,
  onEditCode,
  onToggleFavorite,
  onEdit,
  onDelete,
}) => {
  useEffect(() => {
    if (!tool || !anchor) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tool, anchor, onClose]);

  const menuWidth = 200;
  const approxHeight = tool?.type === 'url' ? 240 : 284;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 390;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 844;
  const left = anchor
    ? Math.max(12, Math.min(anchor.x - 24, vw - menuWidth - 12))
    : 12;
  const top = anchor
    ? Math.max(16, Math.min(anchor.y + 8, vh - approxHeight - 24))
    : 16;

  return (
    <AnimatePresence>
      {tool && anchor && (
        <div
          className="fixed inset-0 z-50 ios-no-callout"
          onClick={onClose}
          onContextMenu={(e) => {
            e.preventDefault();
            onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            className="absolute inset-0 bg-black/20 backdrop-blur-[2px]"
          />
          <motion.div
            role="menu"
            aria-label={`Menu ${tool.name}`}
            initial={{ opacity: 0, scale: 0.94, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: -4 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            style={{ left, top, width: menuWidth }}
            className="fixed rounded-2xl border border-black/[0.08] dark:border-white/[0.12] bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-2xl shadow-[0_14px_40px_rgba(0,0,0,0.18)] py-1.5 text-[13px] overflow-hidden"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                haptic.light();
                onClose();
                onLaunch(tool);
              }}
              className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-left font-medium text-neutral-900 dark:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
            >
              <Play className="w-4 h-4 shrink-0" />
              <span>Mở</span>
            </button>

            {onShare && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  haptic.light();
                  onClose();
                  onShare(tool);
                }}
                className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-left font-medium text-neutral-900 dark:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
              >
                <Share2 className="w-4 h-4 text-[#007AFF] dark:text-[#0A84FF] shrink-0" />
                <span>Chia sẻ</span>
              </button>
            )}

            {onEditCode && tool.type !== 'url' && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  haptic.light();
                  onClose();
                  onEditCode(tool);
                }}
                className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-left font-medium text-neutral-900 dark:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
              >
                <Code2 className="w-4 h-4 text-[#FF6B35] shrink-0" />
                <span>Mã nguồn</span>
              </button>
            )}

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                haptic.medium();
                onClose();
                onToggleFavorite(tool);
              }}
              className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-left font-medium text-neutral-900 dark:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
            >
              <Star
                className={`w-4 h-4 text-amber-500 shrink-0 ${
                  tool.favorite ? 'fill-current' : ''
                }`}
              />
              <span>{tool.favorite ? 'Bỏ yêu thích' : 'Yêu thích'}</span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                haptic.light();
                onClose();
                onEdit(tool);
              }}
              className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-left font-medium text-neutral-900 dark:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
            >
              <Pencil className="w-4 h-4 text-neutral-500 dark:text-neutral-400 shrink-0" />
              <span>Chỉnh sửa</span>
            </button>

            {onDelete && (
              <>
                <div className="my-1 border-t border-black/[0.06] dark:border-white/[0.08]" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    haptic.warning();
                    onClose();
                    onDelete(tool);
                  }}
                  className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-left font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
                >
                  <Trash2 className="w-4 h-4 shrink-0" />
                  <span>Xóa</span>
                </button>
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
