import JSZip from 'jszip';
import { toolRepository } from '../repositories/toolRepository';
import type { ToolManifest } from '../types/models';

function triggerDownloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}

function sanitizeFileSlug(name: string): string {
  const cleaned = (name || 'yunzy-tool')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_');
  return cleaned || 'yunzy-tool';
}

export async function shareToolDocument(tool: ToolManifest): Promise<string | null> {
  if (tool.type === 'url') {
    const targetUrl = tool.url || '';
    if (!targetUrl) throw new Error('Không tìm thấy liên kết để chia sẻ.');
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: tool.name,
          text: tool.name,
          url: targetUrl,
        });
        return null;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return null;
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(targetUrl);
      return 'Đã sao chép liên kết';
    }
    throw new Error('Thiết bị chưa hỗ trợ chia sẻ liên kết.');
  }

  const files = await toolRepository.getToolFiles(tool.id);
  if (!files || files.length === 0) {
    throw new Error('Không tìm thấy dữ liệu tệp để chia sẻ.');
  }

  let fileToShare: File;
  if (tool.type === 'zip' || files.length > 1) {
    const zip = new JSZip();
    for (const f of files) {
      const copy = new Uint8Array(f.data.byteLength);
      copy.set(f.data);
      zip.file(f.path, copy);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    fileToShare = new File([zipBlob], `${sanitizeFileSlug(tool.name)}.zip`, {
      type: 'application/zip',
    });
  } else {
    const entry = files.find((f) => f.path === tool.entryPath) || files[0];
    const baseName = entry.path.split('/').pop() || `${sanitizeFileSlug(tool.name)}.html`;
    const copy = new Uint8Array(entry.data.byteLength);
    copy.set(entry.data);
    fileToShare = new File([copy], baseName, {
      type: entry.mimeType || 'application/octet-stream',
    });
  }

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [fileToShare] })
  ) {
    try {
      await navigator.share({
        title: tool.name,
        files: [fileToShare],
      });
      return null;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return null;
      }
    }
  }

  triggerDownloadBlob(fileToShare, fileToShare.name);
  return 'Đã tải tệp để chia sẻ';
}
