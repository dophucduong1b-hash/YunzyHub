import { isRecognizedPdfLibUrl } from '../runners/vendoredLibraries';
import {
  SECURITY_LIMITS,
  validateAndNormalizePath,
} from './securityValidator';
import type { FileImporterAdapter, ImportInspectionResult } from './types';

export function extractHtmlMetadata(htmlContent: string, fallbackName: string): {
  title: string;
  description: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  const titleMatch = htmlContent.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const rawTitle = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '';

  const descMatch =
    htmlContent.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
    htmlContent.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  const rawDesc = descMatch ? descMatch[1].replace(/\s+/g, ' ').trim() : '';

  // Detect external http/https script or stylesheet references (excluding locally vendored pdf-lib)
  const scriptSrcMatches = Array.from(
    htmlContent.matchAll(/<script[^>]+src=["'](https?:\/\/[^"']+)["']/gi)
  ).map((m) => m[1]);
  const unsupportedExternalScripts = scriptSrcMatches.filter(
    (url) => !isRecognizedPdfLibUrl(url)
  );
  const externalLinkMatch = htmlContent.match(/<link[^>]+href=["']https?:\/\/[^"']+["']/i);

  if (unsupportedExternalScripts.length > 0 || externalLinkMatch) {
    warnings.push(
      'Phát hiện tài nguyên mạng bên ngoài (CDN script/stylesheet) trong HTML. Chính sách CSP Sandbox nghiêm ngặt sẽ chặn kết nối mạng bên ngoài khi chạy; hãy đóng gói toàn bộ JS/CSS vào tệp ZIP nếu công cụ cần các thư viện này.'
    );
  }

  return {
    title: rawTitle || fallbackName,
    description: rawDesc || 'Công cụ HTML độc lập chạy trong môi trường Sandbox cô lập.',
    warnings,
  };
}

export const htmlImporterAdapter: FileImporterAdapter = {
  type: 'html',

  canHandle(file: File): boolean {
    const lower = file.name.toLowerCase();
    return (
      lower.endsWith('.html') ||
      lower.endsWith('.htm') ||
      file.type === 'text/html'
    );
  },

  async inspectFile(file: File): Promise<ImportInspectionResult> {
    if (file.size === 0) {
      throw new Error('Tệp HTML trống (0 byte). Vui lòng chọn tệp HTML hợp lệ.');
    }

    if (file.size > SECURITY_LIMITS.MAX_SINGLE_FILE_BYTES) {
      throw new Error(
        `Kích thước tệp HTML vượt quá giới hạn cho phép (${(
          SECURITY_LIMITS.MAX_SINGLE_FILE_BYTES /
          (1024 * 1024)
        ).toFixed(0)} MB).`
      );
    }

    const pathCheck = validateAndNormalizePath(file.name);
    const entryPath = pathCheck.valid ? pathCheck.normalizedPath : 'index.html';

    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const textContent = decoder.decode(data);

    if (!textContent.trim()) {
      throw new Error('Nội dung tệp HTML trống.');
    }

    const baseName = file.name.replace(/\.(html|htm)$/i, '').replace(/[-_]+/g, ' ').trim();
    const meta = extractHtmlMetadata(textContent, baseName || 'Công cụ HTML');

    return {
      type: 'html',
      suggestedName: meta.title,
      suggestedDescription: meta.description,
      entryCandidates: [entryPath],
      defaultEntryPath: entryPath,
      files: [
        {
          path: entryPath,
          mimeType: 'text/html',
          size: data.byteLength,
          data,
          isText: true,
          textContent,
        },
      ],
      totalSizeBytes: data.byteLength,
      warnings: meta.warnings,
    };
  },
};
