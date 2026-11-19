import JSZip from 'jszip';
import { extractHtmlMetadata } from './htmlImporter';
import {
  inferMimeInfo,
  isIgnorableSystemFile,
  SECURITY_LIMITS,
  validateAndNormalizePath,
} from './securityValidator';
import type {
  FileImporterAdapter,
  ImportInspectionResult,
  UnpackedPackageFile,
} from './types';

function stripSingleCommonRootFolder(files: UnpackedPackageFile[]): UnpackedPackageFile[] {
  if (files.length === 0) return files;
  const firstSegments = new Set<string>();
  for (const f of files) {
    const parts = f.path.split('/');
    if (parts.length < 2) {
      return files; // At least one file is already at root
    }
    firstSegments.add(parts[0]);
  }
  if (firstSegments.size === 1) {
    const prefix = `${Array.from(firstSegments)[0]}/`;
    return files.map((f) => ({
      ...f,
      path: f.path.slice(prefix.length),
    }));
  }
  return files;
}

function rankHtmlCandidates(paths: string[]): string[] {
  return [...paths].sort((a, b) => {
    const aDepth = a.split('/').length;
    const bDepth = b.split('/').length;
    const aIsIndex = /(^|\/)index\.html?$/i.test(a);
    const bIsIndex = /(^|\/)index\.html?$/i.test(b);

    if (aDepth === 1 && aIsIndex && !(bDepth === 1 && bIsIndex)) return -1;
    if (bDepth === 1 && aIsIndex && !(aDepth === 1 && aIsIndex)) return 1;
    if (aIsIndex && !bIsIndex) return -1;
    if (bIsIndex && !aIsIndex) return 1;
    if (aDepth !== bDepth) return aDepth - bDepth;
    return a.localeCompare(b);
  });
}

interface JSZipEntryInternal extends JSZip.JSZipObject {
  unsafeOriginalName?: string;
  _data?: {
    uncompressedSize?: number;
    compressedSize?: number;
  };
}

export const zipImporterAdapter: FileImporterAdapter = {
  type: 'zip',

  canHandle(file: File): boolean {
    const lower = file.name.toLowerCase();
    return (
      lower.endsWith('.zip') ||
      file.type === 'application/zip' ||
      file.type === 'application/x-zip-compressed'
    );
  },

  async inspectFile(file: File): Promise<ImportInspectionResult> {
    if (file.size === 0) {
      throw new Error('Tệp ZIP trống (0 byte).');
    }

    if (file.size > SECURITY_LIMITS.MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new Error(
        `Tệp ZIP vượt quá dung lượng tối đa cho phép (${(
          SECURITY_LIMITS.MAX_TOTAL_UNCOMPRESSED_BYTES /
          (1024 * 1024)
        ).toFixed(0)} MB).`
      );
    }

    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(file);
    } catch {
      throw new Error(
        'Không thể giải nén tệp ZIP. Tệp có thể bị hỏng hoặc không đúng định dạng ZIP chuẩn.'
      );
    }

    const entries = Object.values(zip.files) as JSZipEntryInternal[];
    const rawFiles: UnpackedPackageFile[] = [];
    let totalBytes = 0;
    let declaredTotalBytes = 0;
    let fileCount = 0;

    for (const entry of entries) {
      // Always inspect unsafeOriginalName BEFORE JSZip's internal path sanitization
      const rawEntryName = entry.unsafeOriginalName ?? entry.name;

      // Even for directory entries, reject traversal or absolute paths in the archive
      if (entry.dir) {
        const dirClean = rawEntryName.replace(/\/+$/, '');
        if (dirClean && !isIgnorableSystemFile(rawEntryName)) {
          const dirCheck = validateAndNormalizePath(`${dirClean}/placeholder.txt`);
          if (!dirCheck.valid) {
            throw new Error(dirCheck.error || `Thư mục không an toàn trong gói ZIP: ${rawEntryName}`);
          }
        }
        continue;
      }

      if (isIgnorableSystemFile(rawEntryName) || isIgnorableSystemFile(entry.name)) {
        continue;
      }

      fileCount += 1;
      if (fileCount > SECURITY_LIMITS.MAX_ZIP_FILE_COUNT) {
        throw new Error(
          `Gói ZIP chứa quá nhiều tệp (vượt quá giới hạn tối đa ${SECURITY_LIMITS.MAX_ZIP_FILE_COUNT} tệp). Từ chối nhập để đảm bảo an toàn.`
        );
      }

      // Validate both unsafeOriginalName (pre-JSZip sanitization) and entry.name
      const rawValidation = validateAndNormalizePath(rawEntryName);
      if (!rawValidation.valid) {
        throw new Error(rawValidation.error || `Đường dẫn không an toàn: ${rawEntryName}`);
      }
      const sanitizedValidation = validateAndNormalizePath(entry.name);
      if (!sanitizedValidation.valid) {
        throw new Error(sanitizedValidation.error || `Đường dẫn không an toàn: ${entry.name}`);
      }

      // Pre-decompression Zip Bomb check using header metadata if available
      const declaredSize = entry._data?.uncompressedSize;
      if (typeof declaredSize === 'number') {
        if (declaredSize < 0 || declaredSize > SECURITY_LIMITS.MAX_SINGLE_FILE_BYTES) {
          throw new Error(
            `Tệp "${rawValidation.normalizedPath}" khai báo dung lượng giải nén vượt quá giới hạn 10 MB.`
          );
        }
        declaredTotalBytes += declaredSize;
        if (declaredTotalBytes > SECURITY_LIMITS.MAX_TOTAL_UNCOMPRESSED_BYTES) {
          throw new Error(
            `Tổng dung lượng giải nén khai báo của gói ZIP vượt quá giới hạn an toàn ${(
              SECURITY_LIMITS.MAX_TOTAL_UNCOMPRESSED_BYTES /
              (1024 * 1024)
            ).toFixed(0)} MB.`
          );
        }
      }

      const data = await entry.async('uint8array');
      if (data.byteLength > SECURITY_LIMITS.MAX_SINGLE_FILE_BYTES) {
        throw new Error(
          `Tệp "${rawValidation.normalizedPath}" trong gói ZIP vượt quá giới hạn 10 MB cho một tệp đơn lẻ.`
        );
      }

      totalBytes += data.byteLength;
      if (totalBytes > SECURITY_LIMITS.MAX_TOTAL_UNCOMPRESSED_BYTES) {
        throw new Error(
          `Tổng dung lượng sau giải nén vượt quá giới hạn an toàn ${(
            SECURITY_LIMITS.MAX_TOTAL_UNCOMPRESSED_BYTES /
            (1024 * 1024)
          ).toFixed(0)} MB.`
        );
      }

      const { mimeType, isText } = inferMimeInfo(rawValidation.normalizedPath);
      let textContent: string | undefined;
      if (isText) {
        textContent = new TextDecoder('utf-8', { fatal: false }).decode(data);
      }

      rawFiles.push({
        path: rawValidation.normalizedPath,
        mimeType,
        size: data.byteLength,
        data,
        isText,
        textContent,
      });
    }

    if (rawFiles.length === 0) {
      throw new Error('Gói ZIP không chứa tệp hợp lệ nào.');
    }

    const normalizedFiles = stripSingleCommonRootFolder(rawFiles);

    // Ensure no duplicate paths after normalization
    const seenPaths = new Set<string>();
    const deduplicatedFiles: UnpackedPackageFile[] = [];
    for (const f of normalizedFiles) {
      if (seenPaths.has(f.path)) {
        throw new Error(`Gói ZIP chứa các tệp trùng lặp đường dẫn sau chuẩn hóa: "${f.path}".`);
      }
      seenPaths.add(f.path);
      deduplicatedFiles.push(f);
    }

    const htmlPaths = deduplicatedFiles
      .filter((f) => /\.(html|htm)$/i.test(f.path))
      .map((f) => f.path);

    if (htmlPaths.length === 0) {
      throw new Error(
        'Gói ZIP không chứa bất kỳ tệp HTML (.html hoặc .htm) nào. Công cụ ZIP cần ít nhất một tệp HTML để khởi chạy.'
      );
    }

    const sortedCandidates = rankHtmlCandidates(htmlPaths);
    const defaultEntryPath = sortedCandidates[0];
    const primaryHtmlFile = deduplicatedFiles.find((f) => f.path === defaultEntryPath);

    const fallbackName =
      file.name.replace(/\.zip$/i, '').replace(/[-_]+/g, ' ').trim() || 'Gói Công Cụ ZIP';
    const meta = primaryHtmlFile?.textContent
      ? extractHtmlMetadata(primaryHtmlFile.textContent, fallbackName)
      : { title: fallbackName, description: 'Gói công cụ đa tệp đóng gói ZIP.', warnings: [] };

    const warnings = [...meta.warnings];
    if (sortedCandidates.length > 1) {
      warnings.push(
        `Gói ZIP có ${sortedCandidates.length} tệp HTML. Bạn có thể chọn tệp khởi chạy chính bên dưới.`
      );
    }

    return {
      type: 'zip',
      suggestedName: meta.title,
      suggestedDescription: meta.description,
      entryCandidates: sortedCandidates,
      defaultEntryPath,
      files: deduplicatedFiles,
      totalSizeBytes: totalBytes,
      warnings,
    };
  },
};
