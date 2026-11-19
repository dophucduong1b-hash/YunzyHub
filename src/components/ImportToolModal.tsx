import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Code2,
  Eye,
  FileCode,
  FileUp,
  FolderTree,
  Globe,
  Upload,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  FILE_PICKER_ACCEPT,
  inspectExternalUrl,
  inspectImportedFile,
  type ImportInspectionResult,
} from '../adapters/importers';
import { compilePackageToSrcDoc } from '../adapters/runners/packageBundler';
import { formatBytes, toolRepository } from '../repositories/toolRepository';
import type { ToolManifest } from '../types/models';
import {
  CODE_LANGUAGES,
  getLanguageMeta,
  type CodeLanguage,
} from '../utils/codeSyntax';
import { haptic } from '../utils/haptics';
import { LightCodeEditor } from './LightCodeEditor';

interface ImportToolModalProps {
  isOpen: boolean;
  initialMode?: 'file' | 'create' | 'url';
  onClose: () => void;
  onSuccess: (createdTool: ToolManifest, openImmediately: boolean) => void;
}

const SUGGESTED_CATEGORIES = [
  'Tiện ích',
  'Lập trình',
  'Năng suất',
  'Tài liệu',
  'Thiết kế',
  'Khác',
];

const SHEET_SPRING = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 36,
  mass: 0.8,
};

const SEGMENT_SPRING = {
  type: 'spring' as const,
  stiffness: 500,
  damping: 36,
  mass: 0.72,
};

export const ImportToolModal: React.FC<ImportToolModalProps> = ({
  isOpen,
  initialMode = 'file',
  onClose,
  onSuccess,
}) => {
  const [mode, setMode] = useState<'file' | 'create' | 'url'>(initialMode);
  const [isDragging, setIsDragging] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [inspection, setInspection] = useState<ImportInspectionResult | null>(
    null
  );
  const [previewTab, setPreviewTab] = useState<'none' | 'files' | 'sandbox'>(
    'none'
  );
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  // Create-code mode state
  const [codeLang, setCodeLang] = useState<CodeLanguage>('html');
  const [codeFileName, setCodeFileName] = useState('index.html');
  const [codeContent, setCodeContent] = useState(
    () => getLanguageMeta('html').starterCode
  );
  const [showCreatePreview, setShowCreatePreview] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Tiện ích');
  const [tagsInput, setTagsInput] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [favorite, setFavorite] = useState(false);
  const [entryPath, setEntryPath] = useState('index.html');

  const [urlInput, setUrlInput] = useState('');
  const [embedMode, setEmbedMode] = useState<'external' | 'sandbox'>('external');

  const [submitting, setSubmitting] = useState(false);
  const [openAfterImport, setOpenAfterImport] = useState(true);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError(null);
      if (initialMode === 'create') {
        const meta = getLanguageMeta('html');
        setCodeLang('html');
        setCodeFileName(meta.defaultFileName);
        setCodeContent(meta.starterCode);
        setShowCreatePreview(false);
      }
    }
  }, [isOpen, initialMode]);

  const resetState = (nextMode: 'file' | 'create' | 'url') => {
    if (nextMode !== mode) {
      haptic.selection();
    }
    setMode(nextMode);
    setError(null);
    setInspection(null);
    setSelectedFileName('');
    setName('');
    setDescription('');
    setCategory(nextMode === 'create' ? 'Lập trình' : 'Tiện ích');
    setTagsInput('');
    setVersion('1.0.0');
    setFavorite(false);
    setEntryPath('index.html');
    setUrlInput('');
    setEmbedMode('external');
    setPreviewTab('none');
    setShowMoreOptions(false);
    setShowCreatePreview(false);

    if (nextMode === 'create') {
      const meta = getLanguageMeta('html');
      setCodeLang('html');
      setCodeFileName(meta.defaultFileName);
      setCodeContent(meta.starterCode);
    }
  };

  const handleSelectLanguage = (nextLang: CodeLanguage) => {
    if (nextLang === codeLang) return;
    haptic.selection();
    const prevMeta = getLanguageMeta(codeLang);
    const nextMeta = getLanguageMeta(nextLang);
    const isUsingDefaultCode = codeContent.trim() === prevMeta.starterCode.trim();
    const isUsingDefaultName = codeFileName === prevMeta.defaultFileName;

    setCodeLang(nextLang);
    if (isUsingDefaultName || !codeFileName.trim()) {
      setCodeFileName(nextMeta.defaultFileName);
    } else {
      const base = codeFileName.replace(/\.[^./\\]+$/, '');
      setCodeFileName(`${base}${nextMeta.ext}`);
    }
    if (isUsingDefaultCode || !codeContent.trim()) {
      setCodeContent(nextMeta.starterCode);
    }
    if (nextLang !== 'html') {
      setShowCreatePreview(false);
    }
  };

  const handleFileProcess = async (file: File) => {
    setInspecting(true);
    setError(null);
    setSelectedFileName(file.name);

    try {
      const result = await inspectImportedFile(file);
      haptic.success();
      setInspection(result);
      setName(result.suggestedName);
      setDescription(result.suggestedDescription);
      setEntryPath(result.defaultEntryPath);
      setCategory(result.type === 'file' ? 'Tài liệu' : 'Tiện ích');
      setTagsInput('');
    } catch (err) {
      haptic.warning();
      setInspection(null);
      setError(
        err instanceof Error ? err.message : 'Không thể đọc tệp đã chọn.'
      );
    } finally {
      setInspecting(false);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      await handleFileProcess(droppedFiles[0]);
    }
  };

  const handleUrlInspect = () => {
    setError(null);
    try {
      const result = inspectExternalUrl(urlInput);
      setInspection(result);
      if (!name.trim()) setName(result.suggestedName);
      if (!description.trim()) setDescription(result.suggestedDescription);
    } catch (err) {
      haptic.warning();
      setError(err instanceof Error ? err.message : 'URL không hợp lệ.');
    }
  };

  const compiledPreview = useMemo(() => {
    if (
      previewTab !== 'sandbox' ||
      !inspection ||
      (inspection.type !== 'html' && inspection.type !== 'zip')
    ) {
      return null;
    }
    try {
      return compilePackageToSrcDoc(inspection.files, entryPath);
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : 'Lỗi xem trước.',
      };
    }
  }, [inspection, entryPath, previewTab]);

  const compiledCreatePreview = useMemo(() => {
    if (mode !== 'create' || !showCreatePreview || codeLang !== 'html') {
      return null;
    }
    try {
      const encoded = new TextEncoder().encode(codeContent);
      return compilePackageToSrcDoc(
        [
          {
            path: codeFileName.trim() || 'index.html',
            mimeType: 'text/html',
            size: encoded.byteLength,
            data: encoded,
            isText: true,
            textContent: codeContent,
          },
        ],
        codeFileName.trim() || 'index.html'
      );
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : 'Lỗi xem trước.',
      };
    }
  }, [mode, showCreatePreview, codeLang, codeContent, codeFileName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const parsedTags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      if (mode === 'file') {
        if (!inspection) {
          throw new Error('Chọn tệp trước khi lưu.');
        }

        const created = await toolRepository.createTool({
          name,
          description,
          type: inspection.type,
          category,
          tags: parsedTags,
          favorite,
          version,
          entryPath,
          files: inspection.files,
        });

        onSuccess(created, openAfterImport);
      } else if (mode === 'create') {
        const langMeta = getLanguageMeta(codeLang);
        const rawFileName = codeFileName.trim() || langMeta.defaultFileName;
        const normalizedFileName = rawFileName.includes('.')
          ? rawFileName
          : `${rawFileName}${langMeta.ext}`;
        const bytes = new TextEncoder().encode(codeContent);
        if (bytes.byteLength === 0) {
          throw new Error('Nội dung mã nguồn không được để trống.');
        }

        const isHtml =
          codeLang === 'html' || /\.(html|htm)$/i.test(normalizedFileName);
        const derivedName =
          name.trim() || normalizedFileName.replace(/\.[^.]+$/, '');

        const created = await toolRepository.createTool({
          name: derivedName,
          description:
            description.trim() || `Tạo trực tiếp (${langMeta.label})`,
          type: isHtml ? 'html' : 'file',
          category: category || 'Lập trình',
          tags: parsedTags.length > 0 ? parsedTags : [codeLang],
          favorite,
          version,
          entryPath: normalizedFileName,
          files: [
            {
              path: normalizedFileName,
              mimeType: langMeta.mimeType,
              size: bytes.byteLength,
              data: bytes,
              isText: true,
              textContent: codeContent,
            },
          ],
        });

        onSuccess(created, openAfterImport);
      } else {
        const urlResult = inspectExternalUrl(urlInput);
        const created = await toolRepository.createTool({
          name: name.trim() || urlResult.suggestedName,
          description: description.trim() || urlResult.suggestedDescription,
          type: 'url',
          category,
          tags: parsedTags,
          favorite,
          version,
          url: urlInput,
          embedMode,
        });

        onSuccess(created, openAfterImport);
      }
    } catch (err) {
      haptic.warning();
      setError(err instanceof Error ? err.message : 'Không thể lưu.');
    } finally {
      setSubmitting(false);
    }
  };

  const isWideModal = mode === 'create';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="import-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-xs sm:p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-modal-title"
          onClick={onClose}
        >
          <motion.div
            key="import-modal-sheet"
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 36, opacity: 0, scale: 0.98 }}
            transition={SHEET_SPRING}
            className={`w-full ${
              isWideModal ? 'max-w-3xl' : 'max-w-xl'
            } rounded-t-[28px] sm:rounded-2xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#161618] shadow-2xl overflow-hidden pb-[env(safe-area-inset-bottom,0px)] sm:pb-0 transition-[max-width] duration-200`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Subtle iOS Grab Handle on Mobile */}
            <div className="sm:hidden pt-2.5 flex justify-center">
              <div className="w-9 h-1 rounded-full bg-neutral-300 dark:bg-neutral-700" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 sm:py-4 border-b border-black/[0.06] dark:border-white/[0.08]">
              <h2
                id="import-modal-title"
                className="text-base font-semibold tracking-tight text-neutral-950 dark:text-white"
              >
                {mode === 'create' ? 'Tạo mới bằng mã nguồn' : 'Thêm công cụ'}
              </h2>
              <motion.button
                type="button"
                whileTap={{ scale: 0.88 }}
                onClick={onClose}
                aria-label="Đóng"
                className="p-2 rounded-xl text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
              >
                <X className="w-5 h-5" />
              </motion.button>
            </div>

            {/* 3-Tab Mode Switcher: Tệp / Tạo / URL */}
            <div className="px-5 pt-4">
              <div className="grid grid-cols-3 p-1 rounded-xl bg-black/[0.05] dark:bg-white/[0.07]">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={() => resetState('file')}
                  className={`relative inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    mode === 'file'
                      ? 'text-neutral-950 dark:text-white font-semibold'
                      : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  {mode === 'file' && (
                    <motion.span
                      layoutId="import-mode-pill"
                      transition={SEGMENT_SPRING}
                      className="absolute inset-0 rounded-lg bg-white dark:bg-[#2C2C2E] shadow-2xs"
                    />
                  )}
                  <FileUp className="relative z-10 w-3.5 h-3.5 text-[#007AFF] dark:text-[#0A84FF]" />
                  <span className="relative z-10">Thêm tệp</span>
                </motion.button>

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={() => resetState('create')}
                  className={`relative inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    mode === 'create'
                      ? 'text-neutral-950 dark:text-white font-semibold'
                      : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  {mode === 'create' && (
                    <motion.span
                      layoutId="import-mode-pill"
                      transition={SEGMENT_SPRING}
                      className="absolute inset-0 rounded-lg bg-white dark:bg-[#2C2C2E] shadow-2xs"
                    />
                  )}
                  <Code2 className="relative z-10 w-3.5 h-3.5 text-[#FF6B35]" />
                  <span className="relative z-10">Tạo</span>
                </motion.button>

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={() => resetState('url')}
                  className={`relative inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    mode === 'url'
                      ? 'text-neutral-950 dark:text-white font-semibold'
                      : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  {mode === 'url' && (
                    <motion.span
                      layoutId="import-mode-pill"
                      transition={SEGMENT_SPRING}
                      className="absolute inset-0 rounded-lg bg-white dark:bg-[#2C2C2E] shadow-2xs"
                    />
                  )}
                  <Globe className="relative z-10 w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="relative z-10">Web URL</span>
                </motion.button>
              </div>
            </div>

            <form
              onSubmit={handleSubmit}
              className="p-5 space-y-4 max-h-[78dvh] overflow-y-auto"
            >
              {error && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {mode === 'file' ? (
                <>
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => {
                      haptic.light();
                      fileInputRef.current?.click();
                    }}
                    className={`cursor-pointer rounded-2xl border border-dashed p-5 text-center transition-colors ${
                      isDragging
                        ? 'border-[#FF6B35] bg-[#FF6B35]/[0.06]'
                        : 'border-black/[0.14] dark:border-white/[0.15] hover:border-black/[0.28] dark:hover:border-white/[0.3] bg-[#F5F5F7]/70 dark:bg-[#1E1E22]/60'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={FILE_PICKER_ACCEPT}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFileProcess(f);
                      }}
                      className="hidden"
                      aria-label="Chọn tệp để tải lên"
                    />
                    <div className="w-10 h-10 rounded-2xl bg-black/[0.05] dark:bg-white/[0.08] flex items-center justify-center text-neutral-800 dark:text-neutral-200 mx-auto mb-2.5">
                      <Upload className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                      {selectedFileName || 'Chọn tệp để thêm'}
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
                      HTML, ZIP, PDF, DOCX, MD, TXT, JSON, CSV, ảnh, mã nguồn...
                    </p>
                  </div>

                  {inspecting && (
                    <div className="p-3 rounded-xl bg-[#F5F5F7] dark:bg-[#1F1F23] text-xs text-neutral-600 dark:text-neutral-300 flex items-center gap-2.5">
                      <div className="w-4 h-4 rounded-full border-2 border-neutral-900 dark:border-white border-t-transparent animate-spin" />
                      <span>Đang kiểm tra tệp...</span>
                    </div>
                  )}

                  {inspection && (
                    <div className="space-y-3">
                      <div className="px-3.5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between gap-2 text-xs text-emerald-800 dark:text-emerald-200">
                        <span className="inline-flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span>
                            {inspection.files.length} tệp ·{' '}
                            {formatBytes(inspection.totalSizeBytes)}
                          </span>
                        </span>

                        <div className="flex items-center gap-1">
                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.93 }}
                            onClick={() => {
                              haptic.selection();
                              setPreviewTab((prev) =>
                                prev === 'files' ? 'none' : 'files'
                              );
                            }}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                              previewTab === 'files'
                                ? 'bg-white dark:bg-[#161618] text-neutral-900 dark:text-white'
                                : 'text-emerald-800 dark:text-emerald-200 hover:bg-emerald-500/15'
                            }`}
                          >
                            <FolderTree className="w-3.5 h-3.5" />
                            <span>Tệp</span>
                          </motion.button>
                          {(inspection.type === 'html' ||
                            inspection.type === 'zip') && (
                            <motion.button
                              type="button"
                              whileTap={{ scale: 0.93 }}
                              onClick={() => {
                                haptic.selection();
                                setPreviewTab((prev) =>
                                  prev === 'sandbox' ? 'none' : 'sandbox'
                                );
                              }}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                                previewTab === 'sandbox'
                                  ? 'bg-white dark:bg-[#161618] text-neutral-900 dark:text-white'
                                  : 'text-emerald-800 dark:text-emerald-200 hover:bg-emerald-500/15'
                              }`}
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Xem thử</span>
                            </motion.button>
                          )}
                        </div>
                      </div>

                      {inspection.warnings.length > 0 && (
                        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-1 text-xs text-amber-800 dark:text-amber-200">
                          {inspection.warnings.map((w, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              <span>{w}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {inspection.entryCandidates.length > 1 && (
                        <div>
                          <label
                            htmlFor="import-entry-path"
                            className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                          >
                            Tệp chính
                          </label>
                          <select
                            id="import-entry-path"
                            value={entryPath}
                            onChange={(e) => setEntryPath(e.target.value)}
                            className="w-full rounded-xl border border-black/[0.09] dark:border-white/[0.11] bg-[#F5F5F7] dark:bg-[#1F1F23] px-3 py-2 text-xs font-mono text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/40"
                          >
                            {inspection.entryCandidates.map((cand) => (
                              <option key={cand} value={cand}>
                                {cand}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {previewTab === 'files' && (
                        <div className="rounded-xl border border-black/[0.07] dark:border-white/[0.09] max-h-40 overflow-y-auto divide-y divide-black/[0.05] dark:divide-white/[0.06] bg-[#F5F5F7]/70 dark:bg-[#0A0A0C]/60">
                          {inspection.files.map((f) => (
                            <div
                              key={f.path}
                              className="px-3 py-1.5 flex items-center justify-between text-xs gap-2"
                            >
                              <span className="font-mono text-neutral-800 dark:text-neutral-200 truncate flex items-center gap-1.5">
                                <FileCode className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                                {f.path}
                              </span>
                              <span className="text-neutral-500 dark:text-neutral-400 shrink-0 tabular-nums">
                                {formatBytes(f.size)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {previewTab === 'sandbox' && (
                        <div className="h-56 rounded-xl border border-black/[0.07] dark:border-white/[0.09] overflow-hidden bg-white dark:bg-neutral-950">
                          {compiledPreview && 'srcDoc' in compiledPreview ? (
                            <iframe
                              title="Xem trước công cụ trong Sandbox"
                              sandbox="allow-scripts allow-downloads"
                              referrerPolicy="no-referrer"
                              srcDoc={compiledPreview.srcDoc}
                              className="w-full h-full border-0 block"
                            />
                          ) : (
                            <div className="p-4 text-xs text-rose-600">
                              Không thể xem trước.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : mode === 'create' ? (
                <div className="space-y-3">
                  {/* Language Selector Chips with distinct per-language accent colors */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                      {CODE_LANGUAGES.map((lang) => {
                        const isSelected = codeLang === lang.id;
                        return (
                          <motion.button
                            key={lang.id}
                            type="button"
                            whileTap={{ scale: 0.94 }}
                            onClick={() => handleSelectLanguage(lang.id)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all whitespace-nowrap ${
                              isSelected
                                ? 'border-transparent shadow-2xs font-semibold'
                                : 'border-black/[0.07] dark:border-white/[0.1] bg-[#FAF9F6] dark:bg-[#1F1F23] text-neutral-600 dark:text-neutral-300 hover:border-black/[0.18]'
                            }`}
                            style={
                              isSelected
                                ? {
                                    backgroundColor: lang.badgeBg,
                                    color: lang.badgeText,
                                    boxShadow: `inset 0 0 0 1px ${lang.accentColor}44`,
                                  }
                                : undefined
                            }
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: lang.accentColor }}
                            />
                            <span>{lang.label}</span>
                          </motion.button>
                        );
                      })}
                    </div>

                    {codeLang === 'html' && (
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.94 }}
                        onClick={() => {
                          haptic.selection();
                          setShowCreatePreview((prev) => !prev);
                        }}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                          showCreatePreview
                            ? 'border-[#FF6B35]/30 bg-[#FFF1EB] text-[#C2410C]'
                            : 'border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-[#1F1F23] text-neutral-700 dark:text-neutral-200'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{showCreatePreview ? 'Sửa code' : 'Xem thử'}</span>
                      </motion.button>
                    )}
                  </div>

                  {/* Filename Input */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="create-tool-name"
                        className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                      >
                        Tên công cụ
                      </label>
                      <input
                        id="create-tool-name"
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Ví dụ: Bộ đếm nhanh"
                        className="w-full rounded-xl border border-black/[0.09] dark:border-white/[0.11] bg-[#F5F5F7] dark:bg-[#1F1F23] px-3.5 py-2 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/40"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="create-file-name"
                        className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                      >
                        Tên tệp
                      </label>
                      <input
                        id="create-file-name"
                        type="text"
                        required
                        value={codeFileName}
                        onChange={(e) => setCodeFileName(e.target.value)}
                        placeholder="index.html"
                        className="w-full rounded-xl border border-black/[0.09] dark:border-white/[0.11] bg-[#F5F5F7] dark:bg-[#1F1F23] px-3.5 py-2 text-sm font-mono text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/40"
                      />
                    </div>
                  </div>

                  {/* Bright Light-Mode Syntax-Highlighted Code Editor or Live Sandbox Preview */}
                  {showCreatePreview && codeLang === 'html' ? (
                    <div className="h-[320px] rounded-2xl border border-[#E4E1D9] overflow-hidden bg-white">
                      {compiledCreatePreview &&
                      'srcDoc' in compiledCreatePreview ? (
                        <iframe
                          title="Xem trước mã HTML trong Sandbox"
                          sandbox="allow-scripts allow-downloads"
                          referrerPolicy="no-referrer"
                          srcDoc={compiledCreatePreview.srcDoc}
                          className="w-full h-full border-0 block"
                        />
                      ) : (
                        <div className="p-4 text-xs text-rose-600">
                          Không thể xem trước mã HTML.
                        </div>
                      )}
                    </div>
                  ) : (
                    <LightCodeEditor
                      value={codeContent}
                      onChange={setCodeContent}
                      language={codeLang}
                      minHeightClass="h-[320px]"
                      ariaLabel="Soạn mã nguồn tạo công cụ mới"
                    />
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="import-url-input"
                      className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                    >
                      URL
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="import-url-input"
                        type="url"
                        required
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        onBlur={() => {
                          if (urlInput.trim() && !name.trim()) handleUrlInspect();
                        }}
                        placeholder="https://example.com"
                        className="flex-1 rounded-xl border border-black/[0.09] dark:border-white/[0.11] bg-[#F5F5F7] dark:bg-[#1F1F23] px-3.5 py-2.5 text-sm font-mono text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/40"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="import-embed-mode"
                      className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                    >
                      Cách mở
                    </label>
                    <select
                      id="import-embed-mode"
                      value={embedMode}
                      onChange={(e) =>
                        setEmbedMode(e.target.value as 'external' | 'sandbox')
                      }
                      className="w-full rounded-xl border border-black/[0.09] dark:border-white/[0.11] bg-[#F5F5F7] dark:bg-[#1F1F23] px-3.5 py-2.5 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/40"
                    >
                      <option value="external">Thẻ mới</option>
                      <option value="sandbox">Nhúng trong khung</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Tool Name (for file & url modes; create mode renders name inline above editor) */}
              {mode !== 'create' && (
                <div>
                  <label
                    htmlFor="import-tool-name"
                    className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                  >
                    Tên
                  </label>
                  <input
                    id="import-tool-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Tên công cụ"
                    className="w-full rounded-xl border border-black/[0.09] dark:border-white/[0.11] bg-[#F5F5F7] dark:bg-[#1F1F23] px-3.5 py-2.5 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/40"
                  />
                </div>
              )}

              {/* Collapsible Optional Fields */}
              <div>
                <button
                  type="button"
                  onClick={() => {
                    haptic.light();
                    setShowMoreOptions((prev) => !prev);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white transition-colors"
                >
                  {showMoreOptions ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                  <span>Tùy chọn thêm</span>
                </button>

                <AnimatePresence initial={false}>
                  {showMoreOptions && (
                    <motion.div
                      key="import-more-options"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-black/[0.06] dark:border-white/[0.08]"
                    >
                      <div className="sm:col-span-2">
                        <label
                          htmlFor="import-tool-desc"
                          className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                        >
                          Mô tả
                        </label>
                        <textarea
                          id="import-tool-desc"
                          rows={2}
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          className="w-full rounded-xl border border-black/[0.09] dark:border-white/[0.11] bg-[#F5F5F7] dark:bg-[#1F1F23] px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/40"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="import-tool-category"
                          className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                        >
                          Danh mục
                        </label>
                        <input
                          id="import-tool-category"
                          type="text"
                          list="yunzy-category-suggestions"
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          className="w-full rounded-xl border border-black/[0.09] dark:border-white/[0.11] bg-[#F5F5F7] dark:bg-[#1F1F23] px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/40"
                        />
                        <datalist id="yunzy-category-suggestions">
                          {SUGGESTED_CATEGORIES.map((c) => (
                            <option key={c} value={c} />
                          ))}
                        </datalist>
                      </div>

                      <div>
                        <label
                          htmlFor="import-tool-version"
                          className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                        >
                          Phiên bản
                        </label>
                        <input
                          id="import-tool-version"
                          type="text"
                          value={version}
                          onChange={(e) => setVersion(e.target.value)}
                          className="w-full rounded-xl border border-black/[0.09] dark:border-white/[0.11] bg-[#F5F5F7] dark:bg-[#1F1F23] px-3 py-2 text-sm font-mono text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/40"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label
                          htmlFor="import-tool-tags"
                          className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                        >
                          Thẻ
                        </label>
                        <input
                          id="import-tool-tags"
                          type="text"
                          value={tagsInput}
                          onChange={(e) => setTagsInput(e.target.value)}
                          placeholder="pdf, tiện ích"
                          className="w-full rounded-xl border border-black/[0.09] dark:border-white/[0.11] bg-[#F5F5F7] dark:bg-[#1F1F23] px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/40"
                        />
                      </div>

                      <div className="sm:col-span-2 flex flex-wrap items-center gap-4">
                        <label className="inline-flex items-center gap-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={favorite}
                            onChange={(e) => setFavorite(e.target.checked)}
                            className="rounded border-neutral-300 accent-[#17130F] dark:accent-white"
                          />
                          <span>Yêu thích</span>
                        </label>

                        <label className="inline-flex items-center gap-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={openAfterImport}
                            onChange={(e) => setOpenAfterImport(e.target.checked)}
                            className="rounded border-neutral-300 accent-[#17130F] dark:accent-white"
                          />
                          <span>Mở ngay</span>
                        </label>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-black/[0.06] dark:border-white/[0.08]">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
                >
                  Hủy
                </motion.button>
                <motion.button
                  type="submit"
                  whileTap={{ scale: 0.95 }}
                  disabled={submitting || (mode === 'file' && !inspection)}
                  className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#17130F] hover:bg-[#2C241E] dark:bg-white dark:hover:bg-neutral-200 disabled:opacity-40 text-[#F3EEE3] dark:text-[#17130F] transition-colors"
                >
                  {submitting
                    ? 'Đang lưu...'
                    : mode === 'create'
                      ? 'Tạo & Lưu'
                      : 'Lưu'}
                </motion.button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
