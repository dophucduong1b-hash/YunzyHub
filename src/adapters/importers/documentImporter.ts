import {
  SECURITY_LIMITS,
  inferMimeInfo,
  validateAndNormalizePath,
} from './securityValidator';
import type { FileImporterAdapter, ImportInspectionResult } from './types';

export const SUPPORTED_FILE_EXTENSIONS = new Set([
  // Documents & Markdown
  '.pdf',
  '.docx',
  '.md',
  '.markdown',
  '.txt',
  '.log',
  '.rtf',
  // Data & Config
  '.json',
  '.csv',
  '.tsv',
  '.xml',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.conf',
  // Web & Source Code
  '.js',
  '.mjs',
  '.jsx',
  '.ts',
  '.tsx',
  '.css',
  '.scss',
  '.less',
  '.sql',
  '.c',
  '.cpp',
  '.h',
  '.java',
  '.go',
  '.rs',
  '.swift',
  '.kt',
  '.vue',
  '.svelte',
  '.svg',
  // Images
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.avif',
  '.bmp',
  '.ico',
  // Media
  '.mp3',
  '.wav',
  '.ogg',
  '.m4a',
  '.mp4',
  '.webm',
]);

export const FILE_PICKER_ACCEPT = [
  '.html',
  '.htm',
  '.zip',
  ...Array.from(SUPPORTED_FILE_EXTENSIONS),
].join(',');

function getFileExtension(fileName: string): string {
  const lower = fileName.toLowerCase();
  const idx = lower.lastIndexOf('.');
  return idx !== -1 ? lower.slice(idx) : '';
}

function sanitizeFlatFileName(rawName: string): string {
  const base = rawName.split(/[/\\]/).pop() || 'document.txt';
  const cleaned = base.replace(/\0/g, '').trim();
  return cleaned || 'document.txt';
}

export const documentImporterAdapter: FileImporterAdapter = {
  type: 'file',

  canHandle(file: File): boolean {
    const ext = getFileExtension(file.name);
    return SUPPORTED_FILE_EXTENSIONS.has(ext);
  },

  async inspectFile(file: File): Promise<ImportInspectionResult> {
    if (file.size === 0) {
      throw new Error('Tệp tải lên đang trống (0 byte).');
    }
    if (file.size > SECURITY_LIMITS.MAX_SINGLE_FILE_BYTES) {
      throw new Error(
        `Tệp "${file.name}" vượt quá giới hạn dung lượng 10 MB.`
      );
    }

    const safeFileName = sanitizeFlatFileName(file.name);
    const pathCheck = validateAndNormalizePath(safeFileName);
    if (!pathCheck.valid) {
      throw new Error(pathCheck.error || `Tên tệp "${file.name}" không hợp lệ.`);
    }

    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const mimeInfo = inferMimeInfo(pathCheck.normalizedPath);
    const textContent = mimeInfo.isText
      ? new TextDecoder('utf-8', { fatal: false }).decode(bytes)
      : undefined;

    const baseName = pathCheck.normalizedPath.replace(/\.[^.]+$/, '');
    const ext = getFileExtension(pathCheck.normalizedPath).replace('.', '').toUpperCase();

    return {
      type: 'file',
      suggestedName: baseName.replace(/[-_]+/g, ' ').trim() || pathCheck.normalizedPath,
      suggestedDescription: `Tệp ${ext || 'tài liệu'} cục bộ (${pathCheck.normalizedPath}).`,
      entryCandidates: [pathCheck.normalizedPath],
      defaultEntryPath: pathCheck.normalizedPath,
      files: [
        {
          path: pathCheck.normalizedPath,
          mimeType: file.type || mimeInfo.mimeType,
          size: bytes.byteLength,
          data: bytes,
          isText: mimeInfo.isText,
          textContent,
        },
      ],
      totalSizeBytes: bytes.byteLength,
      warnings: [],
    };
  },
};
