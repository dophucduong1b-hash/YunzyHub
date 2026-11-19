import React, { useEffect, useMemo, useState } from 'react';
import { Check, Code2, Eye, Save, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { compilePackageToSrcDoc } from '../adapters/runners/packageBundler';
import { toolRepository } from '../repositories/toolRepository';
import type { ToolFileRecord, ToolManifest } from '../types/models';
import {
  detectCodeLanguage,
  getLanguageMeta,
} from '../utils/codeSyntax';
import { haptic } from '../utils/haptics';
import { LightCodeEditor } from './LightCodeEditor';

interface CodeEditorModalProps {
  tool: ToolManifest | null;
  onClose: () => void;
  onSaved?: () => void;
}

export const CodeEditorModal: React.FC<CodeEditorModalProps> = ({
  tool,
  onClose,
  onSaved,
}) => {
  const [files, setFiles] = useState<ToolFileRecord[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [draftContent, setDraftContent] = useState<string>('');
  const [savedContent, setSavedContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const editableFiles = useMemo(
    () => files.filter((f) => f.isText),
    [files]
  );

  useEffect(() => {
    if (!tool) return;
    setLoading(true);
    setError(null);
    setShowPreview(false);
    setJustSaved(false);

    toolRepository
      .getToolFiles(tool.id)
      .then((loaded) => {
        setFiles(loaded);
        const textFiles = loaded.filter((f) => f.isText);
        const preferred =
          textFiles.find((f) => f.path === tool.entryPath) || textFiles[0];
        if (preferred) {
          const text =
            preferred.textContent ??
            new TextDecoder('utf-8', { fatal: false }).decode(preferred.data);
          setSelectedPath(preferred.path);
          setDraftContent(text);
          setSavedContent(text);
        } else {
          setSelectedPath('');
          setDraftContent('');
          setSavedContent('');
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Không thể đọc tệp mã nguồn.');
      })
      .finally(() => setLoading(false));
  }, [tool]);

  const handleSelectFile = (file: ToolFileRecord) => {
    haptic.selection();
    const text =
      file.textContent ??
      new TextDecoder('utf-8', { fatal: false }).decode(file.data);
    setSelectedPath(file.path);
    setDraftContent(text);
    setSavedContent(text);
    setJustSaved(false);
    setError(null);
  };

  const isDirty = draftContent !== savedContent;
  const activeLanguage = detectCodeLanguage(selectedPath);

  const handleSave = async () => {
    if (!tool || !selectedPath) return;
    setSaving(true);
    setError(null);
    try {
      await toolRepository.updateToolFileContent(tool.id, selectedPath, draftContent);
      setSavedContent(draftContent);
      setFiles((prev) =>
        prev.map((f) =>
          f.path === selectedPath
            ? {
                ...f,
                textContent: draftContent,
                data: new TextEncoder().encode(draftContent),
                size: new TextEncoder().encode(draftContent).byteLength,
              }
            : f
        )
      );
      setJustSaved(true);
      haptic.success();
      onSaved?.();
      setTimeout(() => setJustSaved(false), 1800);
    } catch (err) {
      haptic.warning();
      setError(err instanceof Error ? err.message : 'Không thể lưu mã nguồn.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!tool) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (isDirty && !saving) {
          handleSave();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const livePreviewSrcDoc = useMemo(() => {
    if (!showPreview || !tool || (tool.type !== 'html' && tool.type !== 'zip')) {
      return null;
    }
    try {
      const mergedFiles = files.map((f) =>
        f.path === selectedPath
          ? {
              ...f,
              textContent: draftContent,
              data: new TextEncoder().encode(draftContent),
              size: new TextEncoder().encode(draftContent).byteLength,
            }
          : f
      );
      return compilePackageToSrcDoc(mergedFiles, tool.entryPath).srcDoc;
    } catch {
      return null;
    }
  }, [showPreview, tool, files, selectedPath, draftContent]);

  return (
    <AnimatePresence>
      {tool && (
        <motion.div
          key="code-editor-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 flex flex-col bg-[#F7F6F2] text-[#17130F] w-full overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-label={`Sửa code ${tool.name}`}
        >
          {/* Crisp Light Top Toolbar */}
          <div className="ios-top-safe shrink-0 border-b border-[#E4E1D9] bg-[#FFFFFF]">
            <div className="h-12 px-3 sm:px-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Code2 className="w-4 h-4 text-[#FF6B35] shrink-0" />
                <span className="text-sm font-semibold text-[#17130F] truncate">
                  {tool.name}
                </span>
                {isDirty && (
                  <span
                    className="w-2 h-2 rounded-full bg-[#FF6B35] shrink-0"
                    title="Chưa lưu"
                  />
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {(tool.type === 'html' || tool.type === 'zip') && (
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    onClick={() => {
                      haptic.selection();
                      setShowPreview((prev) => !prev);
                    }}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                      showPreview
                        ? 'border-[#FF6B35]/40 bg-[#FFF1EB] text-[#C2410C]'
                        : 'border-[#E4E1D9] bg-[#FAF9F6] text-[#44403C] hover:bg-[#F3EEE3]'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Xem thử</span>
                  </motion.button>
                )}

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  disabled={saving || !isDirty}
                  onClick={handleSave}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#17130F] hover:bg-[#2E2620] disabled:opacity-40 text-[#F3EEE3] transition-colors"
                >
                  {justSaved ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Đã lưu</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>{saving ? 'Đang lưu...' : 'Lưu'}</span>
                    </>
                  )}
                </motion.button>

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.9 }}
                  onClick={onClose}
                  aria-label="Đóng trình sửa code"
                  className="p-2 rounded-xl text-[#57534E] hover:text-[#17130F] hover:bg-[#F3EEE3] transition-colors"
                >
                  <X className="w-4 h-4" />
                </motion.button>
              </div>
            </div>

            {/* File Switcher Tabs for Multi-file ZIP Packages */}
            {editableFiles.length > 1 && (
              <div className="px-3 pb-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {editableFiles.map((f) => {
                  const meta = getLanguageMeta(detectCodeLanguage(f.path));
                  const active = f.path === selectedPath;
                  return (
                    <button
                      key={f.path}
                      type="button"
                      onClick={() => handleSelectFile(f)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono transition-colors shrink-0 border ${
                        active
                          ? 'bg-[#17130F] text-[#F3EEE3] border-[#17130F] font-semibold'
                          : 'bg-[#FAF9F6] text-[#57534E] border-[#E4E1D9] hover:text-[#17130F]'
                      }`}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: meta.accentColor }}
                      />
                      <span>{f.path}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Error Banner */}
          {error && (
            <div className="px-4 py-2 bg-rose-50 border-b border-rose-200 text-xs text-rose-700 font-medium">
              {error}
            </div>
          )}

          {/* Editor / Preview Body */}
          <div className="flex-1 min-h-0 p-2.5 sm:p-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] flex flex-col lg:flex-row gap-3 overflow-hidden">
            {loading ? (
              <div className="flex-1 flex items-center justify-center text-xs text-[#78716C]">
                Đang tải mã nguồn...
              </div>
            ) : editableFiles.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-xs text-[#78716C]">
                Tệp nhị phân này không hỗ trợ chỉnh sửa mã nguồn trực tiếp.
              </div>
            ) : (
              <>
                <div className={`flex-1 min-h-0 flex flex-col ${showPreview ? 'lg:w-1/2' : 'w-full'}`}>
                  <LightCodeEditor
                    value={draftContent}
                    onChange={setDraftContent}
                    language={activeLanguage}
                    minHeightClass="flex-1 min-h-0"
                    ariaLabel={`Nội dung tệp ${selectedPath}`}
                  />
                </div>

                {showPreview && livePreviewSrcDoc && (
                  <div className="flex-1 min-h-[220px] lg:w-1/2 rounded-2xl border border-[#E4E1D9] bg-white overflow-hidden shadow-xs">
                    <iframe
                      title="Xem trước trực tiếp"
                      sandbox="allow-scripts allow-downloads"
                      referrerPolicy="no-referrer"
                      srcDoc={livePreviewSrcDoc}
                      className="w-full h-full border-0 block"
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
