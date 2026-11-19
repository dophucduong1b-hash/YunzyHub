import React, { useState } from 'react';
import {
  AlertTriangle,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  RefreshCw,
} from 'lucide-react';
import type { ToolManifest } from '../../types/models';
import { validateExternalUrl } from '../importers/securityValidator';

interface ExternalUrlRunnerProps {
  tool: ToolManifest;
  reloadTrigger: number;
  onReloadRequest: () => void;
}

export const ExternalUrlRunner: React.FC<ExternalUrlRunnerProps> = ({
  tool,
  reloadTrigger,
  onReloadRequest,
}) => {
  const [embedEnabled, setEmbedEnabled] = useState<boolean>(
    tool.embedMode === 'sandbox'
  );

  const urlCheck = validateExternalUrl(tool.url || '');

  if (!urlCheck.valid) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 w-full h-full min-h-0 p-6 text-center">
        <AlertTriangle className="w-6 h-6 text-rose-500 mb-2" />
        <p className="text-xs text-slate-700 dark:text-slate-300 max-w-md">
          {urlCheck.error}
        </p>
      </div>
    );
  }

  const safeUrl = urlCheck.normalizedUrl;

  return (
    <div className="flex flex-col flex-1 w-full h-full min-h-0">
      {/* Compact URL Bar */}
      <div className="flex items-center justify-between gap-2 px-3 h-10 shrink-0 border-b border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
        <div className="flex items-center gap-1.5 min-w-0">
          <Globe className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span className="text-xs font-mono text-slate-700 dark:text-slate-200 truncate">
            {safeUrl}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setEmbedEnabled((prev) => !prev)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            {embedEnabled ? (
              <>
                <EyeOff className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Tắt nhúng</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5" />
                <span>Nhúng</span>
              </>
            )}
          </button>

          {embedEnabled && (
            <button
              type="button"
              onClick={onReloadRequest}
              aria-label="Làm mới khung"
              title="Làm mới"
              className="p-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}

          <a
            href={safeUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Mở thẻ mới"
            title="Nếu bị chặn nhúng, mở trong thẻ mới"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition"
          >
            <span>Mở</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {embedEnabled ? (
        <div className="relative flex-1 w-full h-full min-h-0 bg-white dark:bg-slate-950">
          <iframe
            key={`${tool.id}-url-${reloadTrigger}`}
            title={`Khung nhúng cho ${tool.name}`}
            src={safeUrl}
            sandbox="allow-scripts allow-downloads"
            referrerPolicy="no-referrer"
            className="w-full h-full border-0 block"
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-sm w-full rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-600 dark:text-emerald-300 mx-auto">
              <Globe className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {tool.name}
              </h3>
              <p className="text-xs font-mono text-slate-600 dark:text-slate-300 truncate">
                {safeUrl}
              </p>
            </div>
            <div className="flex items-center justify-center gap-2.5 pt-1">
              <a
                href={safeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition"
              >
                <span>Thẻ mới</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                type="button"
                onClick={() => setEmbedEnabled(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Nhúng</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
