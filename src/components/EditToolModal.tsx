import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Code2,
  ExternalLink,
  FileCode,
  Play,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  formatBytes,
  formatDateTimeVi,
  getToolTypeLabelVi,
  toolRepository,
} from '../repositories/toolRepository';
import type { ToolFileRecord, ToolManifest } from '../types/models';
import { haptic } from '../utils/haptics';
import { HapticTapOverlay } from './HapticTapOverlay';

interface EditToolModalProps {
  tool: ToolManifest | null;
  onClose: () => void;
  onUpdated: (updated: ToolManifest) => void;
  onDeleted: (toolId: string) => void;
  onLaunch?: (tool: ToolManifest) => void;
  onEditCode?: (tool: ToolManifest) => void;
}

const DRAWER_TRANSITION = {
  duration: 0.24,
  ease: [0.22, 1, 0.36, 1] as const,
};

export const EditToolModal: React.FC<EditToolModalProps> = ({
  tool,
  onClose,
  onUpdated,
  onDeleted,
  onLaunch,
  onEditCode,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [version, setVersion] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [entryPath, setEntryPath] = useState('');
  const [url, setUrl] = useState('');
  const [embedMode, setEmbedMode] = useState<'external' | 'sandbox'>('external');

  const [packageFiles, setPackageFiles] = useState<ToolFileRecord[]>([]);
  const [showFiles, setShowFiles] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!tool) return;
    setName(tool.name);
    setDescription(tool.description);
    setCategory(tool.category);
    setTagsInput(tool.tags.join(', '));
    setVersion(tool.version);
    setFavorite(tool.favorite);
    setEntryPath(tool.entryPath || 'index.html');
    setUrl(tool.url || '');
    setEmbedMode(tool.embedMode || 'external');
    setError(null);
    setConfirmDelete(false);
    setShowFiles(false);

    if (tool.type === 'html' || tool.type === 'zip' || tool.type === 'file') {
      toolRepository
        .getToolFiles(tool.id)
        .then(setPackageFiles)
        .catch(() => setPackageFiles([]));
    } else {
      setPackageFiles([]);
    }
  }, [tool]);

  const hasEditableCode = packageFiles.some((f) => f.isText);

  const htmlCandidates = packageFiles
    .filter((f) => /\.(html|htm)$/i.test(f.path))
    .map((f) => f.path);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tool) return;
    setError(null);
    setSaving(true);
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const updated = await toolRepository.updateToolMetadata(tool.id, {
        name,
        description,
        category,
        tags,
        favorite,
        version,
        entryPath: tool.type !== 'url' ? entryPath : undefined,
        url: tool.type === 'url' ? url : undefined,
        embedMode: tool.type === 'url' ? embedMode : undefined,
      });
      onUpdated(updated);
      onClose();
    } catch (err) {
      haptic.warning();
      setError(err instanceof Error ? err.message : 'Không thể cập nhật.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!tool) return;
    setSaving(true);
    try {
      await toolRepository.deleteTool(tool.id);
      onDeleted(tool.id);
      onClose();
    } catch (err) {
      haptic.warning();
      setError(err instanceof Error ? err.message : 'Không thể xóa.');
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {tool && (
        <motion.div
          key="edit-drawer-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-drawer-title"
          onClick={onClose}
        >
          <motion.div
            key="edit-drawer-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={DRAWER_TRANSITION}
            className="w-full max-w-md h-full border-l border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#161618] shadow-2xl flex flex-col justify-between overflow-hidden ios-top-safe"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08]">
              <div className="min-w-0">
                <h2
                  id="detail-drawer-title"
                  className="text-base font-semibold tracking-tight text-neutral-950 dark:text-white truncate"
                >
                  Chi tiết
                </h2>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  {getToolTypeLabelVi(tool.type)}
                  {tool.type !== 'url' &&
                    ` · ${tool.fileCount} tệp · ${formatBytes(tool.sizeBytes)}`}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {onEditCode && hasEditableCode && (
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    onClick={() => onEditCode(tool)}
                    className="relative inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border border-[#FF6B35]/25 bg-[#FFF1EB] dark:bg-[#FF6B35]/15 text-[#C2410C] dark:text-[#FF8C5A] transition-colors"
                  >
                    <HapticTapOverlay />
                    <Code2 className="w-3.5 h-3.5" />
                    <span>Sửa code</span>
                  </motion.button>
                )}
                {onLaunch && (
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    onClick={() => {
                      onLaunch(tool);
                      onClose();
                    }}
                    className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#17130F] hover:bg-[#2C241E] dark:bg-white dark:hover:bg-neutral-200 text-[#F3EEE3] dark:text-[#17130F] transition-colors"
                  >
                    <HapticTapOverlay />
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Mở</span>
                  </motion.button>
                )}
                {tool.type === 'url' && tool.url && (
                  <a
                    href={tool.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Mở thẻ mới"
                    className="p-2 rounded-xl text-neutral-500 dark:text-neutral-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.88 }}
                  onClick={onClose}
                  aria-label="Đóng"
                  className="relative p-2 rounded-xl text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
                >
                  <HapticTapOverlay />
                  <X className="w-5 h-5" />
                </motion.button>
              </div>
            </div>

            {/* Body */}
            <form
              id="tool-detail-form"
              onSubmit={handleSave}
              className="flex-1 p-5 space-y-4 overflow-y-auto"
            >
              {error && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center gap-2 text-xs text-rose-700 dark:text-rose-300">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label
                  htmlFor="edit-tool-name"
                  className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                >
                  Tên
                </label>
                <input
                  id="edit-tool-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.09] dark:border-white/[0.11] bg-[#F5F5F7] dark:bg-[#1F1F23] px-3.5 py-2 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40"
                />
              </div>

              <div>
                <label
                  htmlFor="edit-tool-desc"
                  className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                >
                  Mô tả
                </label>
                <textarea
                  id="edit-tool-desc"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.09] dark:border-white/[0.11] bg-[#F5F5F7] dark:bg-[#1F1F23] px-3.5 py-2 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="edit-tool-category"
                    className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                  >
                    Danh mục
                  </label>
                  <input
                    id="edit-tool-category"
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-xl border border-black/[0.09] dark:border-white/[0.11] bg-[#F5F5F7] dark:bg-[#1F1F23] px-3 py-2 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40"
                  />
                </div>

                <div>
                  <label
                    htmlFor="edit-tool-version"
                    className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                  >
                    Phiên bản
                  </label>
                  <input
                    id="edit-tool-version"
                    type="text"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    className="w-full rounded-xl border border-black/[0.09] dark:border-white/[0.11] bg-[#F5F5F7] dark:bg-[#1F1F23] px-3 py-2 text-sm font-mono text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="edit-tool-tags"
                  className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                >
                  Thẻ
                </label>
                <input
                  id="edit-tool-tags"
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.09] dark:border-white/[0.11] bg-[#F5F5F7] dark:bg-[#1F1F23] px-3.5 py-2 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40"
                />
              </div>

              {tool.type === 'url' ? (
                <>
                  <div>
                    <label
                      htmlFor="edit-tool-url"
                      className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                    >
                      URL
                    </label>
                    <input
                      id="edit-tool-url"
                      type="url"
                      required
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      className="w-full rounded-xl border border-black/[0.09] dark:border-white/[0.11] bg-[#F5F5F7] dark:bg-[#1F1F23] px-3.5 py-2 text-sm font-mono text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="edit-tool-embed"
                      className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                    >
                      Cách mở
                    </label>
                    <select
                      id="edit-tool-embed"
                      value={embedMode}
                      onChange={(e) =>
                        setEmbedMode(e.target.value as 'external' | 'sandbox')
                      }
                      className="w-full rounded-xl border border-black/[0.09] dark:border-white/[0.11] bg-[#F5F5F7] dark:bg-[#1F1F23] px-3.5 py-2 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40"
                    >
                      <option value="external">Thẻ mới</option>
                      <option value="sandbox">Nhúng trong khung</option>
                    </select>
                  </div>
                </>
              ) : (
                htmlCandidates.length > 1 && (
                  <div>
                    <label
                      htmlFor="edit-tool-entry"
                      className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                    >
                      Tệp chính
                    </label>
                    <select
                      id="edit-tool-entry"
                      value={entryPath}
                      onChange={(e) => setEntryPath(e.target.value)}
                      className="w-full rounded-xl border border-black/[0.09] dark:border-white/[0.11] bg-[#F5F5F7] dark:bg-[#1F1F23] px-3.5 py-2 text-sm font-mono text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40"
                    >
                      {htmlCandidates.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              )}

              <label className="inline-flex items-center gap-2 text-xs font-medium text-neutral-700 dark:text-neutral-200 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={favorite}
                  onChange={(e) => setFavorite(e.target.checked)}
                  className="rounded border-neutral-300 accent-neutral-900 dark:accent-white"
                />
                <span>Yêu thích</span>
              </label>

              <div className="pt-3 border-t border-black/[0.06] dark:border-white/[0.08] space-y-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                <div className="flex justify-between">
                  <span>Mở gần nhất</span>
                  <span className="font-mono tabular-nums">
                    {formatDateTimeVi(tool.lastOpenedAt)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Cập nhật</span>
                  <span className="font-mono tabular-nums">
                    {formatDateTimeVi(tool.updatedAt)}
                  </span>
                </div>
              </div>

              {packageFiles.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      haptic.light();
                      setShowFiles((prev) => !prev);
                    }}
                    className="text-xs font-semibold text-[#007AFF] dark:text-[#0A84FF]"
                  >
                    {showFiles
                      ? 'Ẩn tệp'
                      : `Danh sách tệp (${packageFiles.length})`}
                  </button>

                  {showFiles && (
                    <div className="mt-2 rounded-xl border border-black/[0.07] dark:border-white/[0.09] divide-y divide-black/[0.05] dark:divide-white/[0.06] max-h-40 overflow-y-auto text-xs bg-[#F5F5F7]/60 dark:bg-[#0A0A0C]/60">
                      {packageFiles.map((f) => (
                        <div
                          key={f.id}
                          className="px-3 py-1.5 flex items-center justify-between gap-2"
                        >
                          <span className="font-mono text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5 truncate">
                            <FileCode className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                            {f.path}
                          </span>
                          <span className="text-neutral-500 dark:text-neutral-400 tabular-nums shrink-0">
                            {formatBytes(f.size)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </form>

            {/* Footer */}
            <div className="px-5 py-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between gap-3">
              {!confirmDelete ? (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  onClick={() => {
                    haptic.warning();
                    setConfirmDelete(true);
                  }}
                  className="relative inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors"
                >
                  <HapticTapOverlay />
                  <Trash2 className="w-4 h-4" />
                  <span>Xóa</span>
                </motion.button>
              ) : (
                <div className="flex items-center gap-2">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    onClick={handleDelete}
                    disabled={saving}
                    className="relative px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-500 transition-colors"
                  >
                    <HapticTapOverlay disabled={saving} />
                    Xác nhận
                  </motion.button>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    onClick={() => {
                      haptic.light();
                      setConfirmDelete(false);
                    }}
                    className="relative px-2 py-1.5 rounded-lg text-xs text-neutral-600 dark:text-neutral-300"
                  >
                    <HapticTapOverlay />
                    Hủy
                  </motion.button>
                </div>
              )}

              <div className="flex items-center gap-2">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={onClose}
                  className="relative px-3.5 py-2 rounded-xl text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
                >
                  <HapticTapOverlay />
                  Đóng
                </motion.button>
                <motion.button
                  type="submit"
                  form="tool-detail-form"
                  whileTap={{ scale: 0.95 }}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-neutral-950 transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Lưu</span>
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
