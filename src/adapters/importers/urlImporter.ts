import { validateExternalUrl } from './securityValidator';
import type { ImportInspectionResult } from './types';

export function inspectExternalUrl(rawUrl: string): ImportInspectionResult {
  const check = validateExternalUrl(rawUrl);
  if (!check.valid) {
    throw new Error(check.error || 'Địa chỉ URL không hợp lệ.');
  }

  const parsed = new URL(check.normalizedUrl);
  const hostLabel = parsed.hostname.replace(/^www\./i, '');

  const warnings: string[] = [];
  if (parsed.protocol === 'http:') {
    warnings.push(
      'URL sử dụng giao thức HTTP không mã hóa. Khuyến nghị sử dụng HTTPS để bảo mật và tránh bị trình duyệt chặn Mixed Content khi nhúng.'
    );
  }

  return {
    type: 'url',
    suggestedName: hostLabel,
    suggestedDescription: `Ứng dụng web bên ngoài tại ${parsed.origin}`,
    entryCandidates: [],
    defaultEntryPath: '',
    files: [],
    totalSizeBytes: 0,
    warnings,
  };
}
