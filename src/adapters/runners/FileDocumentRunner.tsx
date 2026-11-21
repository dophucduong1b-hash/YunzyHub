import React, { useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import {
  Code2,
  Copy,
  Check,
  Download,
  ExternalLink,
  FileText,
} from 'lucide-react';
import mammoth from 'mammoth';
import { marked } from 'marked';
import { motion } from 'motion/react';
import { LightCodeEditor } from '../../components/LightCodeEditor';
import {
  formatBytes,
  toolRepository,
  type ReadingProgressRecord,
} from '../../repositories/toolRepository';
import type { ToolFileRecord, ToolManifest } from '../../types/models';
import { detectCodeLanguage } from '../../utils/codeSyntax';
import { haptic } from '../../utils/haptics';

interface FileDocumentRunnerProps {
  tool: ToolManifest;
  reloadTrigger: number;
  onEditCode?: () => void;
}

function parseCsvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      current.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      current.push(field);
      rows.push(current);
      current = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || current.length > 0) {
    current.push(field);
    rows.push(current);
  }
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

export const FileDocumentRunner: React.FC<FileDocumentRunnerProps> = ({
  tool,
  reloadTrigger,
  onEditCode,
}) => {
  const [fileRecord, setFileRecord] = useState<ToolFileRecord | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  const [initialProgress, setInitialProgress] = useState<ReadingProgressRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const docScrollRef = useRef<HTMLDivElement | null>(null);
  const csvScrollRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const latestTextScrollRef = useRef(0);
  const latestTextScrolledRef = useRef(false);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    setLoading(true);
    setError(null);
    setDocxHtml(null);
    setInitialProgress(null);
    latestTextScrolledRef.current = false;

    toolRepository
      .getToolFiles(tool.id)
      .then(async (files) => {
        if (!active) return;
        const entry =
          files.find((f) => f.path === tool.entryPath) || files[0] || null;
        if (!entry) {
          setError('Không tìm thấy dữ liệu tệp trong bộ nhớ cục bộ.');
          return;
        }
        const saved = await toolRepository.getReadingProgress(tool.id, entry.path);
        if (!active) return;
        setInitialProgress(saved);
        latestTextScrollRef.current = saved?.scrollY || 0;
        setFileRecord(entry);

        const lowerPath = entry.path.toLowerCase();
        const bytesCopy = new Uint8Array(entry.data.byteLength);
        bytesCopy.set(entry.data);
        const blob = new Blob([bytesCopy], {
          type: entry.mimeType || 'application/octet-stream',
        });
        createdUrl = URL.createObjectURL(blob);
        setBlobUrl(createdUrl);

        if (lowerPath.endsWith('.docx')) {
          try {
            const arrayBuffer = bytesCopy.buffer.slice(
              bytesCopy.byteOffset,
              bytesCopy.byteOffset + bytesCopy.byteLength
            );
            const result = await mammoth.convertToHtml({ arrayBuffer });
            if (active) {
              setDocxHtml(DOMPurify.sanitize(result.value));
            }
          } catch (err) {
            if (active) {
              setError(
                err instanceof Error
                  ? `Không thể đọc tệp DOCX: ${err.message}`
                  : 'Không thể giải mã tài liệu DOCX.'
              );
            }
          }
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Lỗi tải tệp.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [tool.id, tool.entryPath, reloadTrigger]);

  const lowerPath = (fileRecord?.path || '').toLowerCase();
  const textContent = useMemo(() => {
    if (!fileRecord || !fileRecord.isText) return '';
    return (
      fileRecord.textContent ??
      new TextDecoder('utf-8', { fatal: false }).decode(fileRecord.data)
    );
  }, [fileRecord]);

  const renderedMarkdownHtml = useMemo(() => {
    if (!lowerPath.endsWith('.md') && !lowerPath.endsWith('.markdown')) {
      return null;
    }
    const rawHtml = marked.parse(textContent, { async: false }) as string;
    return DOMPurify.sanitize(rawHtml);
  }, [lowerPath, textContent]);

  const csvRows = useMemo(() => {
    if (!lowerPath.endsWith('.csv') && !lowerPath.endsWith('.tsv')) return null;
    const delimiter = lowerPath.endsWith('.tsv') ? '\t' : ',';
    return parseCsvRows(textContent, delimiter);
  }, [lowerPath, textContent]);

  const handleDownload = () => {
    if (!blobUrl || !fileRecord) return;
    haptic.light();
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileRecord.path.split('/').pop() || tool.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleCopy = async () => {
    if (!textContent) return;
    try {
      await navigator.clipboard.writeText(textContent);
      haptic.success();
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Ignore clipboard failures on restricted contexts
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-neutral-500">
        Đang mở tệp...
      </div>
    );
  }

  if (error || !fileRecord) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3">
        <FileText className="w-8 h-8 text-neutral-400" />
        <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
          {error || 'Không thể hiển thị tệp.'}
        </p>
        {blobUrl && (
          <button
            type="button"
            onClick={handleDownload}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-neutral-900 dark:bg-white text-white dark:text-neutral-950"
          >
            Tải xuống tệp
          </button>
        )}
      </div>
    );
  }

  const isPdf = lowerPath.endsWith('.pdf');
  const isDocx = lowerPath.endsWith('.docx');
  const isMarkdown = lowerPath.endsWith('.md') || lowerPath.endsWith('.markdown');
  const isCsv = lowerPath.endsWith('.csv') || lowerPath.endsWith('.tsv');
  const isImage = /\.(png|jpe?g|webp|gif|avif|bmp|ico|svg)$/i.test(lowerPath);
  const isAudio = /\.(mp3|wav|ogg|m4a)$/i.test(lowerPath);
  const isVideo = /\.(mp4|webm)$/i.test(lowerPath);

  useEffect(() => {
    if (loading || !fileRecord) return;
    const entryPath = fileRecord.path;

    let timer: number | null = null;
    let restoreSettled = !(initialProgress && (initialProgress.scrollY > 0 || initialProgress.scrollRatio > 0.001));

    const activeContainer =
      isDocx || isMarkdown ? docScrollRef.current : isCsv ? csvScrollRef.current : null;
    const kind: ReadingProgressRecord['kind'] =
      isDocx || isMarkdown ? 'doc' : isCsv ? 'csv' : isAudio ? 'audio' : 'text';

    if (activeContainer && initialProgress && !restoreSettled) {
      requestAnimationFrame(() => {
        const el = activeContainer;
        const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
        let y = 0;
        if (initialProgress.scrollY > 0 && initialProgress.scrollY <= maxScroll) {
          y = initialProgress.scrollY;
        } else if (initialProgress.scrollRatio > 0.001 && maxScroll > 0) {
          y = Math.round(initialProgress.scrollRatio * maxScroll);
        }
        if (y > 0) el.scrollTop = y;
        restoreSettled = true;
      });
    } else if (isDocx || isMarkdown || isCsv) {
      restoreSettled = true;
    }

    const flushProgress = () => {
      if (!restoreSettled && !fileRecord.isText && !isAudio) return;
      if (activeContainer) {
        const y = Math.max(0, Math.round(activeContainer.scrollTop));
        const maxScroll = Math.max(0, activeContainer.scrollHeight - activeContainer.clientHeight);
        const ratio = maxScroll > 0 ? Math.min(1, y / maxScroll) : 0;
        toolRepository.saveReadingProgress({
          toolId: tool.id,
          entryPath,
          kind,
          scrollY: y,
          scrollRatio: ratio,
        });
      } else if (isAudio && audioRef.current) {
        const ms = Math.max(0, Math.round(audioRef.current.currentTime * 1000));
        const dur = audioRef.current.duration;
        const ratio = dur && isFinite(dur) && dur > 0 ? Math.min(1, audioRef.current.currentTime / dur) : 0;
        toolRepository.saveReadingProgress({
          toolId: tool.id,
          entryPath,
          kind: 'audio',
          scrollY: ms,
          scrollRatio: ratio,
        });
      } else if (fileRecord.isText && latestTextScrolledRef.current) {
        toolRepository.saveReadingProgress({
          toolId: tool.id,
          entryPath,
          kind: 'text',
          scrollY: latestTextScrollRef.current,
          scrollRatio: 0,
        });
      }
    };

    const scheduleFlush = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        flushProgress();
      }, 450);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushProgress();
    };

    activeContainer?.addEventListener('scroll', scheduleFlush, { passive: true });
    window.addEventListener('pagehide', flushProgress);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      flushProgress();
      activeContainer?.removeEventListener('scroll', scheduleFlush);
      window.removeEventListener('pagehide', flushProgress);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [loading, fileRecord, initialProgress, isDocx, isMarkdown, isCsv, isAudio, tool.id, docxHtml, renderedMarkdownHtml]);

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#F5F5F7] dark:bg-[#0A0A0C] overflow-hidden">
      {/* Compact File Action Bar */}
      <div className="shrink-0 px-3 py-2 border-b border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#141416] flex items-center justify-between gap-2 text-xs">
        <div className="min-w-0 flex items-center gap-2">
          <span className="font-mono text-neutral-700 dark:text-neutral-200 truncate">
            {fileRecord.path}
          </span>
          <span className="text-neutral-400 tabular-nums shrink-0">
            {formatBytes(fileRecord.size)}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {fileRecord.isText && (
            <>
              <motion.button
                type="button"
                whileTap={{ scale: 0.94 }}
                onClick={handleCopy}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-black/[0.08] dark:border-white/[0.1] text-neutral-700 dark:text-neutral-200 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">{copied ? 'Đã chép' : 'Chép'}</span>
              </motion.button>

              {onEditCode && (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  onClick={onEditCode}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#17130F] dark:bg-white text-[#F3EEE3] dark:text-[#17130F] font-semibold"
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>Sửa code</span>
                </motion.button>
              )}
            </>
          )}

          {isPdf && blobUrl && (
            <a
              href={blobUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-black/[0.08] dark:border-white/[0.1] text-neutral-700 dark:text-neutral-200 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Mở riêng</span>
            </a>
          )}

          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={handleDownload}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-black/[0.08] dark:border-white/[0.1] text-neutral-700 dark:text-neutral-200 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Tải xuống</span>
          </motion.button>
        </div>
      </div>

      {/* Viewer Canvas */}
      {isPdf && blobUrl ? (
        <div className="flex-1 min-h-0 flex flex-col bg-neutral-200 dark:bg-neutral-900">
          <object
            data={blobUrl}
            type="application/pdf"
            className="w-full h-full flex-1"
            aria-label={tool.name}
          >
            <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-3 bg-white dark:bg-[#161618]">
              <FileText className="w-10 h-10 text-[#FF6B35]" />
              <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                {fileRecord.path}
              </p>
              <p className="text-xs text-neutral-500 max-w-xs">
                Trình duyệt di động không hỗ trợ xem PDF trực tiếp trong khung. Nhấn bên dưới để mở toàn màn hình hoặc tải về.
              </p>
              <div className="flex items-center gap-2">
                <a
                  href={blobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#17130F] dark:bg-white text-white dark:text-[#17130F]"
                >
                  Mở PDF
                </a>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="px-4 py-2 rounded-xl text-xs font-semibold border border-black/[0.1] dark:border-white/[0.12]"
                >
                  Tải xuống
                </button>
              </div>
            </div>
          </object>
        </div>
      ) : isDocx && docxHtml !== null ? (
        <div ref={docScrollRef} className="flex-1 overflow-y-auto p-3 sm:p-6">
          <article
            className="max-w-3xl mx-auto rounded-2xl bg-white text-[#17130F] border border-black/[0.06] shadow-xs p-5 sm:p-8 space-y-3 text-[15px] leading-relaxed [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-bold [&_h3]:text-lg [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-neutral-200 [&_td]:p-2 [&_th]:border [&_th]:border-neutral-200 [&_th]:p-2 [&_img]:max-w-full [&_img]:rounded-lg"
            dangerouslySetInnerHTML={{ __html: docxHtml }}
          />
        </div>
      ) : isMarkdown && renderedMarkdownHtml !== null ? (
        <div ref={docScrollRef} className="flex-1 overflow-y-auto p-3 sm:p-6">
          <article
            className="max-w-3xl mx-auto rounded-2xl bg-white dark:bg-[#161618] text-neutral-900 dark:text-neutral-100 border border-black/[0.06] dark:border-white/[0.08] shadow-xs p-5 sm:p-8 space-y-3 text-[15px] leading-relaxed [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-bold [&_h3]:text-lg [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-3 [&_blockquote]:border-[#FF6B35] [&_blockquote]:pl-3.5 [&_blockquote]:text-neutral-500 [&_pre]:rounded-xl [&_pre]:bg-[#FAF9F6] [&_pre]:text-[#17130F] [&_pre]:p-3.5 [&_pre]:overflow-x-auto [&_pre]:font-mono [&_pre]:text-xs [&_code]:font-mono [&_code]:text-[13px] [&_a]:text-[#007AFF] [&_a]:underline [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-black/10 [&_td]:dark:border-white/10 [&_td]:p-2 [&_th]:border [&_th]:border-black/10 [&_th]:dark:border-white/10 [&_th]:p-2"
            dangerouslySetInnerHTML={{ __html: renderedMarkdownHtml }}
          />
        </div>
      ) : isCsv && csvRows ? (
        <div ref={csvScrollRef} className="flex-1 overflow-auto p-3 sm:p-5">
          <div className="rounded-2xl border border-black/[0.07] dark:border-white/[0.08] bg-white dark:bg-[#161618] overflow-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              {csvRows.length > 0 && (
                <thead className="bg-neutral-100 dark:bg-white/[0.05] sticky top-0">
                  <tr>
                    {csvRows[0].map((cell, i) => (
                      <th
                        key={i}
                        className="px-3 py-2 font-semibold text-neutral-900 dark:text-white border-b border-black/[0.07] dark:border-white/[0.08] whitespace-nowrap"
                      >
                        {cell}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                {csvRows.slice(1).map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        className="px-3 py-2 text-neutral-700 dark:text-neutral-300 whitespace-nowrap"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : isImage && blobUrl ? (
        <div className="flex-1 overflow-auto flex items-center justify-center p-4">
          <img
            src={blobUrl}
            alt={tool.name}
            className="max-w-full max-h-full object-contain rounded-2xl shadow-sm bg-white"
          />
        </div>
      ) : isAudio && blobUrl ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-4">
          <p className="text-sm font-semibold text-neutral-900 dark:text-white">
            {fileRecord.path}
          </p>
          <audio
            ref={audioRef}
            controls
            src={blobUrl}
            onLoadedMetadata={(e) => {
              const el = e.currentTarget;
              const savedSec = (initialProgress?.scrollY || 0) / 1000;
              if (savedSec > 0 && el.duration && savedSec < el.duration - 1) {
                el.currentTime = savedSec;
              }
            }}
            onPause={(e) => {
              const el = e.currentTarget;
              toolRepository.saveReadingProgress({
                toolId: tool.id,
                entryPath: fileRecord.path,
                kind: 'audio',
                scrollY: Math.round(el.currentTime * 1000),
                scrollRatio: el.duration > 0 ? Math.min(1, el.currentTime / el.duration) : 0,
              });
            }}
            className="w-full max-w-md"
          />
        </div>
      ) : isVideo && blobUrl ? (
        <div className="flex-1 flex items-center justify-center p-3 bg-black">
          <video
            controls
            playsInline
            src={blobUrl}
            className="max-w-full max-h-full rounded-xl"
          />
        </div>
      ) : fileRecord.isText ? (
        <div className="flex-1 min-h-0 p-3 sm:p-4 flex flex-col overflow-hidden">
          <LightCodeEditor
            value={textContent}
            onChange={() => {}}
            readOnly
            language={detectCodeLanguage(fileRecord.path)}
            minHeightClass="flex-1 min-h-0"
            ariaLabel={`Xem tệp ${fileRecord.path}`}
            initialScrollTop={initialProgress?.scrollY || 0}
            onScrollTopChange={(y) => {
              latestTextScrollRef.current = y;
              latestTextScrolledRef.current = true;
            }}
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3">
          <FileText className="w-9 h-9 text-neutral-400" />
          <p className="text-sm font-semibold text-neutral-900 dark:text-white">
            {fileRecord.path}
          </p>
          <button
            type="button"
            onClick={handleDownload}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#17130F] dark:bg-white text-white dark:text-[#17130F]"
          >
            Tải xuống tệp
          </button>
        </div>
      )}
    </div>
  );
};
