export const SECURITY_LIMITS = {
  MAX_ZIP_FILE_COUNT: 150,
  MAX_TOTAL_UNCOMPRESSED_BYTES: 25 * 1024 * 1024, // 25 MB
  MAX_SINGLE_FILE_BYTES: 10 * 1024 * 1024, // 10 MB
  MAX_URL_LENGTH: 2048,
} as const;

/**
 * Forbidden executable, native binary, and server-side backend script extensions.
 * YunzyHub only runs client-side static HTML/CSS/JS/media assets in an isolated sandbox.
 */
const FORBIDDEN_EXTENSIONS = new Set([
  // Executables & native binaries
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.msi',
  '.bat',
  '.cmd',
  '.sh',
  '.bash',
  '.zsh',
  '.ps1',
  '.vbs',
  '.com',
  '.scr',
  '.pif',
  '.apk',
  '.ipa',
  '.app',
  '.dmg',
  '.pkg',
  '.deb',
  '.rpm',
  '.elf',
  '.bin',
  // Server-side / backend scripts & bytecode
  '.php',
  '.phtml',
  '.phar',
  '.py',
  '.pyc',
  '.pyo',
  '.pyd',
  '.rb',
  '.pl',
  '.pm',
  '.cgi',
  '.fcgi',
  '.asp',
  '.aspx',
  '.jsp',
  '.jspx',
  '.jar',
  '.war',
  '.ear',
  '.class',
  '.node',
  // Nested archives (prevent zip bombs)
  '.zip',
  '.tar',
  '.gz',
  '.tgz',
  '.rar',
  '.7z',
  '.bz2',
  '.xz',
]);

export interface PathValidationResult {
  valid: boolean;
  normalizedPath: string;
  error?: string;
}

/**
 * Validates and normalizes an archive or file path.
 * Strictly rejects path traversal (..), absolute paths (/ or C:\), null bytes,
 * and forbidden executable/backend file extensions.
 */
export function validateAndNormalizePath(rawPath: string): PathValidationResult {
  if (!rawPath || typeof rawPath !== 'string') {
    return { valid: false, normalizedPath: '', error: 'Đường dẫn tệp trống hoặc không hợp lệ.' };
  }

  if (rawPath.includes('\0')) {
    return { valid: false, normalizedPath: '', error: 'Đường dẫn tệp chứa ký tự null không hợp lệ.' };
  }

  // Reject raw backslashes or leading slashes indicating absolute paths or Windows traversal
  const trimmed = rawPath.trim();
  if (trimmed.startsWith('/') || trimmed.startsWith('\\')) {
    return {
      valid: false,
      normalizedPath: '',
      error: `Từ chối đường dẫn tuyệt đối: "${rawPath}". Chỉ chấp nhận đường dẫn tương đối trong gói.`,
    };
  }

  // Reject Windows drive letters like C:\ or D:/
  if (/^[a-zA-Z]:/.test(trimmed)) {
    return {
      valid: false,
      normalizedPath: '',
      error: `Từ chối đường dẫn ổ đĩa tuyệt đối: "${rawPath}".`,
    };
  }

  if (trimmed.includes('\\')) {
    return {
      valid: false,
      normalizedPath: '',
      error: `Từ chối đường dẫn chứa dấu gạch chéo ngược (\\): "${rawPath}".`,
    };
  }

  const segments = trimmed.split('/');
  const cleanSegments: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === '.') {
      continue;
    }
    if (segment === '..' || segment.includes('..')) {
      return {
        valid: false,
        normalizedPath: '',
        error: `Phát hiện tấn công vượt cấp thư mục (Path Traversal) trong đường dẫn: "${rawPath}".`,
      };
    }
    cleanSegments.push(segment);
  }

  if (cleanSegments.length === 0) {
    return { valid: false, normalizedPath: '', error: 'Đường dẫn tệp sau khi chuẩn hóa bị rỗng.' };
  }

  const normalizedPath = cleanSegments.join('/');
  const fileName = cleanSegments[cleanSegments.length - 1].toLowerCase();

  // Check all extensions in the filename (e.g. "shell.php.jpg" or "malware.exe")
  const dotParts = fileName.split('.');
  if (dotParts.length > 1) {
    for (let i = 1; i < dotParts.length; i++) {
      const ext = `.${dotParts[i]}`;
      if (FORBIDDEN_EXTENSIONS.has(ext)) {
        return {
          valid: false,
          normalizedPath,
          error: `Từ chối tệp thực thi / mã nguồn máy chủ hoặc tệp nén lồng nhau ("${rawPath}", phần mở rộng bị cấm: ${ext}).`,
        };
      }
    }
  }

  return { valid: true, normalizedPath };
}

export interface UrlValidationResult {
  valid: boolean;
  normalizedUrl: string;
  error?: string;
}

/**
 * Validates external URLs for URL tools.
 * Strictly allows http: and https: protocols only.
 */
export function validateExternalUrl(rawUrl: string): UrlValidationResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, normalizedUrl: '', error: 'Vui lòng nhập địa chỉ URL.' };
  }

  const trimmed = rawUrl.trim();
  if (trimmed.length > SECURITY_LIMITS.MAX_URL_LENGTH) {
    return { valid: false, normalizedUrl: '', error: 'Địa chỉ URL vượt quá độ dài tối đa cho phép (2048 ký tự).' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      valid: false,
      normalizedUrl: '',
      error: 'Định dạng URL không hợp lệ. Vui lòng nhập đầy đủ http:// hoặc https:// (ví dụ: https://example.com).',
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      valid: false,
      normalizedUrl: '',
      error: `Giao thức "${parsed.protocol}" bị từ chối vì lý do bảo mật. Chỉ cho phép http:// hoặc https://.`,
    };
  }

  if (parsed.username || parsed.password) {
    return {
      valid: false,
      normalizedUrl: '',
      error: 'URL không được chứa thông tin đăng nhập (username/password) nhúng trực tiếp.',
    };
  }

  if (!parsed.hostname || !parsed.hostname.includes('.') && parsed.hostname !== 'localhost') {
    return {
      valid: false,
      normalizedUrl: '',
      error: 'Tên miền trong URL không hợp lệ.',
    };
  }

  return { valid: true, normalizedUrl: parsed.toString() };
}

const MIME_MAP: Record<string, { mime: string; isText: boolean }> = {
  '.html': { mime: 'text/html', isText: true },
  '.htm': { mime: 'text/html', isText: true },
  '.css': { mime: 'text/css', isText: true },
  '.scss': { mime: 'text/x-scss', isText: true },
  '.less': { mime: 'text/x-less', isText: true },
  '.js': { mime: 'text/javascript', isText: true },
  '.mjs': { mime: 'text/javascript', isText: true },
  '.jsx': { mime: 'text/jsx', isText: true },
  '.ts': { mime: 'text/typescript', isText: true },
  '.tsx': { mime: 'text/tsx', isText: true },
  '.json': { mime: 'application/json', isText: true },
  '.svg': { mime: 'image/svg+xml', isText: true },
  '.txt': { mime: 'text/plain', isText: true },
  '.log': { mime: 'text/plain', isText: true },
  '.ini': { mime: 'text/plain', isText: true },
  '.conf': { mime: 'text/plain', isText: true },
  '.rtf': { mime: 'application/rtf', isText: true },
  '.md': { mime: 'text/markdown', isText: true },
  '.markdown': { mime: 'text/markdown', isText: true },
  '.xml': { mime: 'application/xml', isText: true },
  '.yaml': { mime: 'application/x-yaml', isText: true },
  '.yml': { mime: 'application/x-yaml', isText: true },
  '.toml': { mime: 'application/toml', isText: true },
  '.csv': { mime: 'text/csv', isText: true },
  '.tsv': { mime: 'text/tab-separated-values', isText: true },
  '.sql': { mime: 'application/sql', isText: true },
  '.c': { mime: 'text/x-c', isText: true },
  '.cpp': { mime: 'text/x-c++', isText: true },
  '.h': { mime: 'text/x-c', isText: true },
  '.java': { mime: 'text/x-java', isText: true },
  '.go': { mime: 'text/x-go', isText: true },
  '.rs': { mime: 'text/x-rust', isText: true },
  '.swift': { mime: 'text/x-swift', isText: true },
  '.kt': { mime: 'text/x-kotlin', isText: true },
  '.vue': { mime: 'text/plain', isText: true },
  '.svelte': { mime: 'text/plain', isText: true },
  '.pdf': { mime: 'application/pdf', isText: false },
  '.docx': {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    isText: false,
  },
  '.png': { mime: 'image/png', isText: false },
  '.jpg': { mime: 'image/jpeg', isText: false },
  '.jpeg': { mime: 'image/jpeg', isText: false },
  '.gif': { mime: 'image/gif', isText: false },
  '.webp': { mime: 'image/webp', isText: false },
  '.avif': { mime: 'image/avif', isText: false },
  '.bmp': { mime: 'image/bmp', isText: false },
  '.ico': { mime: 'image/x-icon', isText: false },
  '.woff': { mime: 'font/woff', isText: false },
  '.woff2': { mime: 'font/woff2', isText: false },
  '.ttf': { mime: 'font/ttf', isText: false },
  '.otf': { mime: 'font/otf', isText: false },
  '.mp3': { mime: 'audio/mpeg', isText: false },
  '.wav': { mime: 'audio/wav', isText: false },
  '.ogg': { mime: 'audio/ogg', isText: false },
  '.m4a': { mime: 'audio/mp4', isText: false },
  '.mp4': { mime: 'video/mp4', isText: false },
  '.webm': { mime: 'video/webm', isText: false },
};

export function inferMimeInfo(path: string): { mimeType: string; isText: boolean } {
  const lower = path.toLowerCase();
  const dotIdx = lower.lastIndexOf('.');
  if (dotIdx !== -1) {
    const ext = lower.slice(dotIdx);
    const info = MIME_MAP[ext];
    if (info) {
      return { mimeType: info.mime, isText: info.isText };
    }
  }
  return { mimeType: 'application/octet-stream', isText: false };
}

export function isIgnorableSystemFile(rawPath: string): boolean {
  const normalized = rawPath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts.some(
    (p) =>
      p === '__MACOSX' ||
      p === '.DS_Store' ||
      p === 'Thumbs.db' ||
      p === 'desktop.ini' ||
      p.startsWith('._')
  );
}
