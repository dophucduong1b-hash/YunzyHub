import {
  VENDORED_PDF_LIB_SCRIPT,
  VENDORED_PDF_LIB_VERSION,
} from './vendoredPdfLibSource';

export interface VendoredLibraryDescriptor {
  id: string;
  name: string;
  version: string;
  globalSymbol: string;
  scriptContent: string;
}

const RECOGNIZED_PDF_LIB_HOSTS = new Set([
  'cdn.jsdelivr.net',
  'unpkg.com',
  'cdnjs.cloudflare.com',
]);

/**
 * Checks whether a script URL is an exact recognized CDN reference for `pdf-lib`
 * (jsdelivr, unpkg, or cdnjs).
 * Does NOT match arbitrary URLs or non-pdf-lib packages.
 */
export function isRecognizedPdfLibUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;

  const normalizedUrl = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;
  let parsed: URL;
  try {
    parsed = new URL(normalizedUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return false;
  }

  const host = parsed.hostname.toLowerCase();
  if (!RECOGNIZED_PDF_LIB_HOSTS.has(host)) {
    return false;
  }

  const pathname = parsed.pathname;

  if (host === 'cdn.jsdelivr.net') {
    return /^\/npm\/pdf-lib(?:@1(?:\.\d+\.\d+)?)?(?:\/dist\/pdf-lib(?:\.min)?\.js)?$/i.test(
      pathname
    );
  }

  if (host === 'unpkg.com') {
    return /^\/pdf-lib(?:@1(?:\.\d+\.\d+)?)?(?:\/dist\/pdf-lib(?:\.min)?\.js)?$/i.test(
      pathname
    );
  }

  if (host === 'cdnjs.cloudflare.com') {
    return /^\/ajax\/libs\/pdf-lib\/1(?:\.\d+\.\d+)?\/pdf-lib(?:\.min)?\.js$/i.test(
      pathname
    );
  }

  return false;
}

/**
 * Checks whether raw HTML contains any recognized CDN reference to pdf-lib
 * (either in <script src="..."> or inside an inline fallback loader).
 */
export function htmlContainsRecognizedPdfLibReference(htmlContent: string): boolean {
  if (!htmlContent) return false;
  const urlMatches =
    htmlContent.match(
      /(?:https?:)?\/\/(?:cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)\/[^\s"'<>\\]+/gi
    ) || [];
  return urlMatches.some((candidate) => isRecognizedPdfLibUrl(candidate));
}

export function getVendoredPdfLibDescriptor(): VendoredLibraryDescriptor {
  return {
    id: `pdf-lib@${VENDORED_PDF_LIB_VERSION}`,
    name: 'pdf-lib',
    version: VENDORED_PDF_LIB_VERSION,
    globalSymbol: 'PDFLib',
    scriptContent: VENDORED_PDF_LIB_SCRIPT,
  };
}
