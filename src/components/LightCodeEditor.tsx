import React, { useMemo, useRef } from 'react';
import {
  getLanguageMeta,
  highlightCodeLight,
  type CodeLanguage,
} from '../utils/codeSyntax';

interface LightCodeEditorProps {
  value: string;
  onChange: (nextValue: string) => void;
  language: CodeLanguage;
  placeholder?: string;
  readOnly?: boolean;
  minHeightClass?: string;
  ariaLabel?: string;
}

/**
 * Bright, high-contrast Light-Mode syntax-highlighted code editor.
 * Uses native system monospace typography, synchronized line-number gutter,
 * and distinct per-language syntax accent colors.
 */
export const LightCodeEditor: React.FC<LightCodeEditorProps> = ({
  value,
  onChange,
  language,
  placeholder = 'Nhập mã nguồn tại đây...',
  readOnly = false,
  minHeightClass = 'min-h-[300px]',
  ariaLabel = 'Trình soạn thảo mã nguồn',
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);

  const langMeta = getLanguageMeta(language);

  const lineCount = useMemo(() => {
    if (!value) return 1;
    return value.split('\n').length;
  }, [value]);

  const highlightedHtml = useMemo(() => {
    const html = highlightCodeLight(value, language);
    // Append trailing newline space so final empty line aligns with textarea height
    return value.endsWith('\n') ? `${html}\n ` : html || ' ';
  }, [value, language]);

  const syncScroll = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (preRef.current) {
      preRef.current.scrollTop = ta.scrollTop;
      preRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = ta.scrollTop;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (readOnly) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const next = value.slice(0, start) + '  ' + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = start + 2;
          textareaRef.current.selectionEnd = start + 2;
        }
      });
    }
  };

  return (
    <div
      className={`flex flex-col rounded-2xl border border-[#E4E1D9] bg-[#FFFFFF] text-[#17130F] overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${minHeightClass}`}
    >
      {/* Subtle Top Accent Bar showing active language color */}
      <div className="h-8 px-3 border-b border-[#ECEAE3] bg-[#FAF9F6] flex items-center justify-between gap-2 shrink-0 select-none">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: langMeta.accentColor }}
          />
          <span
            className="px-2 py-0.5 rounded-md text-[11px] font-semibold"
            style={{
              backgroundColor: langMeta.badgeBg,
              color: langMeta.badgeText,
            }}
          >
            {langMeta.label}
          </span>
        </div>
        <span className="text-[11px] font-mono tabular-nums text-[#78716C]">
          {lineCount} dòng · {value.length} ký tự
        </span>
      </div>

      {/* Synchronized Gutter + Highlighted Layer + Editable Textarea */}
      <div className="relative flex-1 min-h-0 flex bg-[#FFFFFF]">
        {/* Line Numbers Gutter */}
        <div
          ref={gutterRef}
          aria-hidden="true"
          className="w-11 shrink-0 bg-[#F7F6F2] border-r border-[#ECEAE3] py-3 pr-2.5 text-right font-mono text-[13px] leading-[1.6] text-[#A8A29E] select-none overflow-hidden"
        >
          {Array.from({ length: lineCount }, (_, idx) => (
            <div key={idx}>{idx + 1}</div>
          ))}
        </div>

        {/* Code Canvas */}
        <div className="relative flex-1 min-w-0 min-h-0 overflow-hidden">
          <pre
            ref={preRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 m-0 p-3 font-mono text-[13px] leading-[1.6] whitespace-pre overflow-hidden text-[#17130F] bg-transparent"
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />

          <textarea
            ref={textareaRef}
            value={value}
            readOnly={readOnly}
            onChange={(e) => onChange(e.target.value)}
            onScroll={syncScroll}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            aria-label={ariaLabel}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            className="relative z-10 w-full h-full min-h-[260px] resize-none border-0 bg-transparent p-3 font-mono text-[13px] leading-[1.6] whitespace-pre overflow-auto text-transparent caret-[#17130F] placeholder:text-[#A8A29E] focus:outline-none selection:bg-[#FF6B35]/20"
            style={{
              fontSize: '13px',
              WebkitTextFillColor: 'transparent',
            }}
          />
        </div>
      </div>
    </div>
  );
};
