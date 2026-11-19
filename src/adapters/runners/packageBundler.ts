import type { UnpackedPackageFile } from '../importers/types';
import {
  buildCompatibilityBootstrapScript,
  type CompatBootstrapOptions,
} from './compatRuntime';
import { SANDBOX_CSP_DIRECTIVE } from './cspBuilder';
import {
  getVendoredPdfLibDescriptor,
  htmlContainsRecognizedPdfLibReference,
  isRecognizedPdfLibUrl,
} from './vendoredLibraries';

export interface CompiledSandboxPackage {
  srcDoc: string;
  entryPath: string;
  resolvedAssetsCount: number;
  missingAssets: string[];
  vendoredLibraries: string[];
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...sub);
  }
  return btoa(binary);
}

export function stringToBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return uint8ArrayToBase64(bytes);
}

export function toDataUri(mimeType: string, bytes: Uint8Array): string {
  const b64 = uint8ArrayToBase64(bytes);
  return `data:${mimeType};base64,${b64}`;
}

export function toTextDataUri(mimeType: string, text: string): string {
  const b64 = stringToBase64Utf8(text);
  return `data:${mimeType};charset=utf-8;base64,${b64}`;
}

/**
 * Resolves a relative reference (e.g. "../assets/logo.png" or "./styles/main.css")
 * against the directory of `baseFilePath` (e.g. "pages/index.html").
 * Returns null if the reference is an external URL, data:, blob:, mailto:, or #hash.
 */
export function resolveRelativePackagePath(
  baseFilePath: string,
  rawReference: string
): { lookupPath: string; hashFragment: string } | null {
  if (!rawReference) return null;
  const trimmed = rawReference.trim();
  if (
    !trimmed ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:') ||
    trimmed.startsWith('javascript:') ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) ||
    trimmed.startsWith('//')
  ) {
    return null;
  }

  // Separate hash and query string
  const hashIndex = trimmed.indexOf('#');
  const hashFragment = hashIndex !== -1 ? trimmed.slice(hashIndex) : '';
  const withoutHash = hashIndex !== -1 ? trimmed.slice(0, hashIndex) : trimmed;
  const queryIndex = withoutHash.indexOf('?');
  const cleanRef = (queryIndex !== -1 ? withoutHash.slice(0, queryIndex) : withoutHash).replace(
    /\\/g,
    '/'
  );

  if (!cleanRef) return null;

  const baseParts = baseFilePath.replace(/\\/g, '/').split('/');
  baseParts.pop(); // directory of baseFilePath

  const refParts = cleanRef.startsWith('/')
    ? cleanRef.slice(1).split('/')
    : cleanRef.split('/');

  const stack = cleanRef.startsWith('/') ? [] : [...baseParts];

  for (const part of refParts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (stack.length > 0) {
        stack.pop();
      }
    } else {
      stack.push(part);
    }
  }

  let lookupPath = stack.join('/');
  try {
    lookupPath = decodeURIComponent(lookupPath);
  } catch {
    // Keep raw joined path if malformed percent-encoding
  }
  return { lookupPath, hashFragment };
}

/**
 * Rewrites relative url(...) and @import "..." references inside a CSS string
 * using the package file map.
 */
function rewriteCssUrls(
  cssText: string,
  cssFilePath: string,
  fileMap: Map<string, UnpackedPackageFile>,
  resolvedCounter: { count: number },
  missingSet: Set<string>,
  visitedCss = new Set<string>()
): string {
  visitedCss.add(cssFilePath);

  // First rewrite @import "relative.css" (without url()) into @import url("data:text/css...")
  const withImports = cssText.replace(
    /@import\s+(?:url\(\s*(['"]?)([^'")]+)\1\s*\)|(['"])([^'"]+)\3)/gi,
    (fullMatch, _q1, urlPath1, _q2, urlPath2) => {
      const rawRef = urlPath1 || urlPath2;
      const resolved = resolveRelativePackagePath(cssFilePath, rawRef);
      if (!resolved) return fullMatch;

      const target = fileMap.get(resolved.lookupPath);
      if (!target) {
        missingSet.add(resolved.lookupPath);
        return fullMatch;
      }

      resolvedCounter.count += 1;
      if (
        (target.mimeType === 'text/css' || target.path.toLowerCase().endsWith('.css')) &&
        !visitedCss.has(target.path)
      ) {
        const nestedSource =
          target.textContent ?? new TextDecoder('utf-8', { fatal: false }).decode(target.data);
        const nestedCompiled = rewriteCssUrls(
          nestedSource,
          target.path,
          fileMap,
          resolvedCounter,
          missingSet,
          new Set(visitedCss)
        );
        return `@import url("${toTextDataUri('text/css', nestedCompiled)}")`;
      }
      return `@import url("${toDataUri(target.mimeType, target.data)}")`;
    }
  );

  // Next rewrite url(...) references
  return withImports.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (fullMatch, _quote, rawUrl) => {
    const resolved = resolveRelativePackagePath(cssFilePath, rawUrl);
    if (!resolved) return fullMatch;

    const target = fileMap.get(resolved.lookupPath);
    if (!target) {
      missingSet.add(resolved.lookupPath);
      return fullMatch;
    }

    resolvedCounter.count += 1;
    const dataUri = toDataUri(target.mimeType, target.data);
    return `url("${dataUri}${resolved.hashFragment}")`;
  });
}

/**
 * Rewrites srcset="img1.png 1x, img2.png 2x" attributes for packaged images.
 */
function rewriteSrcset(
  srcsetValue: string,
  entryPath: string,
  fileMap: Map<string, UnpackedPackageFile>,
  resolvedCounter: { count: number },
  missingSet: Set<string>
): string {
  return srcsetValue
    .split(',')
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return trimmed;
      const spaceIdx = trimmed.search(/\s/);
      const urlPart = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
      const descriptor = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx);

      const resolved = resolveRelativePackagePath(entryPath, urlPart);
      if (!resolved) return trimmed;

      const target = fileMap.get(resolved.lookupPath);
      if (!target) {
        missingSet.add(resolved.lookupPath);
        return trimmed;
      }

      resolvedCounter.count += 1;
      return `${toDataUri(target.mimeType, target.data)}${resolved.hashFragment}${descriptor}`;
    })
    .join(', ');
}

/**
 * Computes relative specifier from directory of `fromFile` to `toFile`
 * (e.g. from "pages/index.html" to "scripts/app.js" -> "../scripts/app.js")
 */
function getRelativeSpecifier(fromFile: string, toFile: string): string {
  const fromParts = fromFile.replace(/\\/g, '/').split('/');
  fromParts.pop();
  const toParts = toFile.replace(/\\/g, '/').split('/');

  let common = 0;
  while (
    common < fromParts.length &&
    common < toParts.length &&
    fromParts[common] === toParts[common]
  ) {
    common += 1;
  }

  const upCount = fromParts.length - common;
  const relParts: string[] = [];
  for (let i = 0; i < upCount; i++) {
    relParts.push('..');
  }
  relParts.push(...toParts.slice(common));
  const joined = relParts.join('/');
  return joined.startsWith('.') ? joined : `./${joined}`;
}

/**
 * Compiles an imported HTML/ZIP package into a single self-contained `srcDoc` string
 * with a strict Content Security Policy injected at the very top of `<head>` and all
 * packaged relative JS/CSS/images/fonts/SVGs resolved safely without parent execution.
 */
export function compilePackageToSrcDoc(
  files: UnpackedPackageFile[],
  requestedEntryPath?: string,
  compatOptions?: CompatBootstrapOptions
): CompiledSandboxPackage {
  if (!files || files.length === 0) {
    throw new Error('Không tìm thấy tệp nào trong gói công cụ.');
  }

  const fileMap = new Map<string, UnpackedPackageFile>();
  for (const f of files) {
    fileMap.set(f.path, f);
  }

  // Locate entry HTML file
  const entryFile =
    (requestedEntryPath ? fileMap.get(requestedEntryPath) : undefined) ||
    files.find((f) => f.path === 'index.html') ||
    files.find((f) => /\.(html|htm)$/i.test(f.path)) ||
    files[0];

  const entryPath = entryFile.path;
  const rawHtml =
    entryFile.textContent ?? new TextDecoder('utf-8', { fatal: false }).decode(entryFile.data);

  const resolvedCounter = { count: 0 };
  const missingSet = new Set<string>();
  const vendoredSet = new Set<string>();

  // Pre-compile all CSS files so nested url(...) and @import inside CSS work seamlessly
  const compiledCssDataUriMap = new Map<string, string>();
  for (const file of files) {
    if (file.mimeType === 'text/css' || file.path.toLowerCase().endsWith('.css')) {
      const cssSource =
        file.textContent ?? new TextDecoder('utf-8', { fatal: false }).decode(file.data);
      const rewrittenCss = rewriteCssUrls(
        cssSource,
        file.path,
        fileMap,
        resolvedCounter,
        missingSet
      );
      compiledCssDataUriMap.set(file.path, toTextDataUri('text/css', rewrittenCss));
    }
  }

  // Parse HTML into an inert document (DOMParser does NOT execute scripts or fetch assets)
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, 'text/html');

  // Remove any existing <base>, <meta http-equiv="Content-Security-Policy">, or <meta http-equiv="refresh">
  doc.querySelectorAll('base').forEach((el) => el.remove());
  doc.querySelectorAll('meta[http-equiv]').forEach((el) => {
    const equiv = (el.getAttribute('http-equiv') || '').trim().toLowerCase();
    if (equiv === 'content-security-policy' || equiv === 'refresh') {
      el.remove();
    }
  });

  // Rewrite inline <style> blocks for relative url(...)
  doc.querySelectorAll('style').forEach((styleEl) => {
    if (styleEl.textContent) {
      styleEl.textContent = rewriteCssUrls(
        styleEl.textContent,
        entryPath,
        fileMap,
        resolvedCounter,
        missingSet
      );
    }
  });

  // Rewrite inline style="..." attributes containing url(...)
  doc.querySelectorAll('[style]').forEach((el) => {
    const inlineStyle = el.getAttribute('style');
    if (inlineStyle && inlineStyle.includes('url(')) {
      el.setAttribute(
        'style',
        rewriteCssUrls(inlineStyle, entryPath, fileMap, resolvedCounter, missingSet)
      );
    }
  });

  // Resolve <link href="..."> (stylesheets, icons, preload)
  doc.querySelectorAll('link[href]').forEach((linkEl) => {
    const href = linkEl.getAttribute('href');
    if (!href) return;
    const resolved = resolveRelativePackagePath(entryPath, href);
    if (!resolved) return;

    const cssUri = compiledCssDataUriMap.get(resolved.lookupPath);
    if (cssUri) {
      resolvedCounter.count += 1;
      linkEl.setAttribute('href', cssUri);
      return;
    }

    const target = fileMap.get(resolved.lookupPath);
    if (target) {
      resolvedCounter.count += 1;
      linkEl.setAttribute('href', toDataUri(target.mimeType, target.data));
    } else {
      missingSet.add(resolved.lookupPath);
    }
  });

  // Build an ES Module importmap for packaged .js/.mjs files (mapping both root and entryPath-relative specifiers)
  const importMapEntries: Record<string, string> = {};
  for (const file of files) {
    if (file.mimeType === 'text/javascript' || /\.(js|mjs)$/i.test(file.path)) {
      const jsText =
        file.textContent ?? new TextDecoder('utf-8', { fatal: false }).decode(file.data);
      const dataUri = toTextDataUri('text/javascript', jsText);
      importMapEntries[file.path] = dataUri;
      importMapEntries[`./${file.path}`] = dataUri;
      importMapEntries[`/${file.path}`] = dataUri;
      const relFromEntry = getRelativeSpecifier(entryPath, file.path);
      importMapEntries[relFromEntry] = dataUri;
    }
  }

  // Resolve <script src="..."> (both recognized local vendored libraries and relative package files)
  let pdfLibInjected = false;
  doc.querySelectorAll('script[src]').forEach((scriptEl) => {
    const src = scriptEl.getAttribute('src');
    if (!src) return;

    if (isRecognizedPdfLibUrl(src)) {
      const vendoredPdfLib = getVendoredPdfLibDescriptor();
      vendoredSet.add(vendoredPdfLib.id);
      resolvedCounter.count += 1;

      if (!pdfLibInjected) {
        pdfLibInjected = true;
        const inlineOnload = scriptEl.getAttribute('onload');
        scriptEl.removeAttribute('src');
        scriptEl.removeAttribute('integrity');
        scriptEl.removeAttribute('crossorigin');
        scriptEl.removeAttribute('async');
        scriptEl.removeAttribute('defer');
        scriptEl.removeAttribute('onerror');
        scriptEl.removeAttribute('onload');
        scriptEl.setAttribute('data-yunzy-vendored', vendoredPdfLib.id);
        scriptEl.textContent = inlineOnload
          ? `${vendoredPdfLib.scriptContent}\n;(function(){ try { ${inlineOnload} } catch(_e){} })();`
          : vendoredPdfLib.scriptContent;
      } else {
        // Remove duplicate static CDN fallback script tags
        scriptEl.remove();
      }
      return;
    }

    const resolved = resolveRelativePackagePath(entryPath, src);
    if (!resolved) return;

    const target = fileMap.get(resolved.lookupPath);
    if (target) {
      resolvedCounter.count += 1;
      const jsText =
        target.textContent ?? new TextDecoder('utf-8', { fatal: false }).decode(target.data);
      scriptEl.setAttribute('src', toTextDataUri('text/javascript', jsText));
    } else {
      missingSet.add(resolved.lookupPath);
    }
  });

  // Resolve media elements: <img src>, <source src>, <audio src>, <video src>, <video poster>, <image href>
  const mediaSelectors: Array<{ selector: string; attr: string }> = [
    { selector: 'img[src]', attr: 'src' },
    { selector: 'source[src]', attr: 'src' },
    { selector: 'audio[src]', attr: 'src' },
    { selector: 'video[src]', attr: 'src' },
    { selector: 'video[poster]', attr: 'poster' },
    { selector: 'image[href]', attr: 'href' },
  ];

  for (const { selector, attr } of mediaSelectors) {
    doc.querySelectorAll(selector).forEach((el) => {
      const val = el.getAttribute(attr);
      if (!val) return;
      const resolved = resolveRelativePackagePath(entryPath, val);
      if (!resolved) return;

      const target = fileMap.get(resolved.lookupPath);
      if (target) {
        resolvedCounter.count += 1;
        el.setAttribute(attr, `${toDataUri(target.mimeType, target.data)}${resolved.hashFragment}`);
      } else {
        missingSet.add(resolved.lookupPath);
      }
    });
  }

  // Resolve srcset on <img> and <source>
  doc.querySelectorAll('img[srcset], source[srcset]').forEach((el) => {
    const srcsetVal = el.getAttribute('srcset');
    if (!srcsetVal) return;
    el.setAttribute(
      'srcset',
      rewriteSrcset(srcsetVal, entryPath, fileMap, resolvedCounter, missingSet)
    );
  });

  // Ensure <head> exists
  if (!doc.head) {
    const headEl = doc.createElement('head');
    doc.documentElement.insertBefore(headEl, doc.body || null);
  }

  // If the HTML references recognized pdf-lib CDN URLs only inside an inline script (not a <script src>),
  // inject the vendored pdf-lib script before tool scripts run.
  if (!pdfLibInjected && htmlContainsRecognizedPdfLibReference(rawHtml)) {
    const vendoredPdfLib = getVendoredPdfLibDescriptor();
    vendoredSet.add(vendoredPdfLib.id);
    resolvedCounter.count += 1;
    pdfLibInjected = true;
    const pdfLibScript = doc.createElement('script');
    pdfLibScript.setAttribute('data-yunzy-vendored', vendoredPdfLib.id);
    pdfLibScript.textContent = vendoredPdfLib.scriptContent;
    doc.head.insertBefore(pdfLibScript, doc.head.firstChild);
  }

  // Inject compatibility bootstrap script BEFORE any tool script executes
  const effectiveCompat: CompatBootstrapOptions = compatOptions ?? {
    toolId: 'preview-sandbox',
    capabilityToken: 'preview-token',
    initialLocalStorage: {},
  };
  const compatScript = doc.createElement('script');
  compatScript.setAttribute('data-yunzy-compat', 'bootstrap');
  compatScript.textContent = buildCompatibilityBootstrapScript(effectiveCompat);
  doc.head.insertBefore(compatScript, doc.head.firstChild);

  // Inject importmap before compatibility script if there are packaged JS files and no existing importmap
  if (
    Object.keys(importMapEntries).length > 0 &&
    !doc.head.querySelector('script[type="importmap"]')
  ) {
    const importMapScript = doc.createElement('script');
    importMapScript.setAttribute('type', 'importmap');
    importMapScript.textContent = JSON.stringify({ imports: importMapEntries });
    doc.head.insertBefore(importMapScript, doc.head.firstChild);
  }

  // Inject strict Content-Security-Policy as the VERY FIRST element in <head>
  const cspMeta = doc.createElement('meta');
  cspMeta.setAttribute('http-equiv', 'Content-Security-Policy');
  cspMeta.setAttribute('content', SANDBOX_CSP_DIRECTIVE);
  doc.head.insertBefore(cspMeta, doc.head.firstChild);

  // Ensure UTF-8 charset meta exists right after CSP
  if (!doc.head.querySelector('meta[charset]')) {
    const charsetMeta = doc.createElement('meta');
    charsetMeta.setAttribute('charset', 'UTF-8');
    cspMeta.after(charsetMeta);
  }

  const serialized = `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;

  return {
    srcDoc: serialized,
    entryPath,
    resolvedAssetsCount: resolvedCounter.count,
    missingAssets: Array.from(missingSet),
    vendoredLibraries: Array.from(vendoredSet),
  };
}

