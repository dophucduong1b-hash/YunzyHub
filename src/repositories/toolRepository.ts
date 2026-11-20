import {
  SECURITY_LIMITS,
  validateAndNormalizePath,
  validateExternalUrl,
} from '../adapters/importers/securityValidator';
import type { UnpackedPackageFile } from '../adapters/importers/types';
import { STORAGE_LIMITS } from '../adapters/runners/compatRuntime';
import { uint8ArrayToBase64 } from '../adapters/runners/packageBundler';
import { db } from '../db/database';
import type {
  AppPreferences,
  BackupFileEntryV1,
  BackupPayloadV1,
  HistoryRecord,
  LibraryViewMode,
  PreferenceRecord,
  ThemeMode,
  ToolFileRecord,
  ToolManifest,
  ToolStorageRecord,
  ToolType,
  WorkspaceTabRecord,
} from '../types/models';

function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof base64 !== 'string') {
    throw new Error('Dữ liệu tệp trong bản sao lưu không phải chuỗi Base64 hợp lệ.');
  }
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new Error('Không thể giải mã Base64 dữ liệu tệp trong bản sao lưu.');
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export interface CreateToolInput {
  name: string;
  description: string;
  type: ToolType;
  category: string;
  tags: string[];
  favorite?: boolean;
  version?: string;
  entryPath?: string;
  url?: string;
  embedMode?: 'external' | 'sandbox';
  files?: UnpackedPackageFile[];
}

export interface UpdateToolMetadataInput {
  name: string;
  description: string;
  category: string;
  tags: string[];
  favorite: boolean;
  version: string;
  entryPath?: string;
  url?: string;
  embedMode?: 'external' | 'sandbox';
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  theme: 'system',
  libraryView: 'grid',
  activeTabId: null,
  seededSampleTools: false,
  hapticsEnabled: true,
  reducedMotion: false,
  swipeBackHome: true,
  openAfterImportDefault: true,
};

export const LEGACY_SAMPLE_TOOL_IDS = [
  'sample-html-dev-studio',
  'sample-zip-pomodoro-suite',
  'sample-url-mdn',
] as const;

export const toolRepository = {
  /**
   * Initializes local preferences and performs a one-time cleanup of legacy built-in sample tools.
   * Never deletes or overwrites user-imported tools.
   */
  async initializeIfNeeded(): Promise<void> {
    await db.transaction(
      'rw',
      [db.tools, db.toolFiles, db.toolStorage, db.preferences, db.workspace],
      async () => {
        const cleanedPref = await db.preferences.get('cleanedLegacySamples');
        if (cleanedPref?.value === true) {
          return;
        }

        const sampleIdSet = new Set<string>(LEGACY_SAMPLE_TOOL_IDS);
        for (const sampleId of LEGACY_SAMPLE_TOOL_IDS) {
          await db.tools.delete(sampleId);
          await db.toolFiles.where('toolId').equals(sampleId).delete();
          await db.toolStorage.delete(sampleId);
          await db.workspace.delete(sampleId);
        }

        const activePref = await db.preferences.get('activeTabId');
        if (typeof activePref?.value === 'string' && sampleIdSet.has(activePref.value)) {
          const remainingTabs = await db.workspace.orderBy('order').toArray();
          const nextActive = remainingTabs.length > 0 ? remainingTabs[0].id : null;
          await db.preferences.put({
            key: 'activeTabId',
            value: nextActive,
            updatedAt: new Date().toISOString(),
          });
        }

        const now = new Date().toISOString();
        await db.preferences.put({
          key: 'seededSampleTools',
          value: true,
          updatedAt: now,
        });
        await db.preferences.put({
          key: 'cleanedLegacySamples',
          value: true,
          updatedAt: now,
        });
      }
    );
  },

  /**
   * Creates a new tool (HTML, ZIP, or URL) transactionally with full security validation.
   */
  async createTool(input: CreateToolInput): Promise<ToolManifest> {
    const trimmedName = (input.name || '').trim();
    if (!trimmedName) {
      throw new Error('Tên công cụ không được để trống.');
    }

    if (!['html', 'zip', 'url', 'file'].includes(input.type)) {
      throw new Error(`Loại công cụ không hợp lệ: "${String(input.type)}".`);
    }

    const now = new Date().toISOString();
    const id = `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const cleanTags = Array.from(
      new Set(
        (Array.isArray(input.tags) ? input.tags : [])
          .map((t) => String(t).trim().toLowerCase())
          .filter((t) => t.length > 0)
      )
    );

    let normalizedUrl: string | undefined;
    let resolvedEntryPath: string | undefined;
    const filesToPersist: ToolFileRecord[] = [];
    let totalSizeBytes = 0;

    if (input.type === 'url') {
      const urlCheck = validateExternalUrl(input.url || '');
      if (!urlCheck.valid) {
        throw new Error(urlCheck.error || 'Địa chỉ URL không hợp lệ.');
      }
      normalizedUrl = urlCheck.normalizedUrl;
    } else {
      if (!input.files || input.files.length === 0) {
        throw new Error('Công cụ HTML/ZIP phải có ít nhất một tệp dữ liệu.');
      }
      if (input.files.length > SECURITY_LIMITS.MAX_ZIP_FILE_COUNT) {
        throw new Error(`Số lượng tệp vượt quá giới hạn ${SECURITY_LIMITS.MAX_ZIP_FILE_COUNT}.`);
      }

      const seenPaths = new Set<string>();
      for (const f of input.files) {
        const pathCheck = validateAndNormalizePath(f.path);
        if (!pathCheck.valid) {
          throw new Error(pathCheck.error || `Đường dẫn tệp không hợp lệ: ${f.path}`);
        }
        if (seenPaths.has(pathCheck.normalizedPath)) {
          throw new Error(`Đường dẫn tệp bị trùng lặp: "${pathCheck.normalizedPath}".`);
        }
        seenPaths.add(pathCheck.normalizedPath);

        if (f.size > SECURITY_LIMITS.MAX_SINGLE_FILE_BYTES) {
          throw new Error(`Tệp "${pathCheck.normalizedPath}" vượt quá giới hạn 10 MB.`);
        }
        totalSizeBytes += f.size;
        if (totalSizeBytes > SECURITY_LIMITS.MAX_TOTAL_UNCOMPRESSED_BYTES) {
          throw new Error('Tổng dung lượng gói vượt quá 25 MB.');
        }

        filesToPersist.push({
          id: `${id}::${pathCheck.normalizedPath}`,
          toolId: id,
          path: pathCheck.normalizedPath,
          mimeType: f.mimeType,
          size: f.size,
          data: f.data,
          isText: f.isText,
          textContent: f.textContent,
        });
      }

      const candidateEntry = input.entryPath || filesToPersist[0]?.path || 'index.html';
      const entryCheck = validateAndNormalizePath(candidateEntry);
      if (!entryCheck.valid) {
        throw new Error(entryCheck.error || 'Đường dẫn tệp khởi chạy không hợp lệ.');
      }
      if (!seenPaths.has(entryCheck.normalizedPath)) {
        throw new Error(
          `Tệp khởi chạy "${entryCheck.normalizedPath}" không tồn tại trong gói tệp đã tải lên.`
        );
      }
      resolvedEntryPath = entryCheck.normalizedPath;
    }

    const manifest: ToolManifest = {
      id,
      name: trimmedName,
      description: (input.description || '').trim() || 'Không có mô tả.',
      type: input.type,
      category: (input.category || '').trim() || 'Chung',
      tags: cleanTags,
      favorite: Boolean(input.favorite),
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: null,
      entryPath: resolvedEntryPath,
      url: normalizedUrl,
      version: (input.version || '1.0.0').trim() || '1.0.0',
      sizeBytes: totalSizeBytes,
      fileCount: filesToPersist.length,
      embedMode: input.type === 'url' ? input.embedMode || 'external' : undefined,
    };

    await db.transaction(
      'rw',
      [db.tools, db.toolFiles, db.history],
      async () => {
        await db.tools.add(manifest);
        if (filesToPersist.length > 0) {
          await db.toolFiles.bulkAdd(filesToPersist);
        }
        await db.history.add({
          toolId: manifest.id,
          toolName: manifest.name,
          toolType: manifest.type,
          action: 'import',
          timestamp: now,
        });
      }
    );

    return manifest;
  },

  /**
   * Updates an existing tool's metadata transactionally with strict URL and entryPath validation.
   */
  async updateToolMetadata(
    toolId: string,
    updates: UpdateToolMetadataInput
  ): Promise<ToolManifest> {
    return db.transaction('rw', [db.tools, db.toolFiles, db.history], async () => {
      const existing = await db.tools.get(toolId);
      if (!existing) {
        throw new Error('Không tìm thấy công cụ cần cập nhật.');
      }

      const trimmedName = (updates.name || '').trim();
      if (!trimmedName) {
        throw new Error('Tên công cụ không được để trống.');
      }

      let normalizedUrl = existing.url;
      let resolvedEntryPath = existing.entryPath;

      if (existing.type === 'url') {
        const check = validateExternalUrl(updates.url || '');
        if (!check.valid) {
          throw new Error(check.error || 'URL không hợp lệ.');
        }
        normalizedUrl = check.normalizedUrl;
        resolvedEntryPath = undefined;
      } else {
        normalizedUrl = undefined;
        if (updates.entryPath !== undefined) {
          const entryCheck = validateAndNormalizePath(updates.entryPath);
          if (!entryCheck.valid) {
            throw new Error(entryCheck.error || 'Đường dẫn tệp khởi chạy không hợp lệ.');
          }
          const fileRecord = await db.toolFiles.get(`${toolId}::${entryCheck.normalizedPath}`);
          if (!fileRecord) {
            throw new Error(
              `Tệp khởi chạy "${entryCheck.normalizedPath}" không tồn tại trong gói công cụ.`
            );
          }
          resolvedEntryPath = entryCheck.normalizedPath;
        }
      }

      const cleanTags = Array.from(
        new Set(
          (Array.isArray(updates.tags) ? updates.tags : [])
            .map((t) => String(t).trim().toLowerCase())
            .filter((t) => t.length > 0)
        )
      );

      const now = new Date().toISOString();
      const updated: ToolManifest = {
        ...existing,
        name: trimmedName,
        description: (updates.description || '').trim() || 'Không có mô tả.',
        category: (updates.category || '').trim() || 'Chung',
        tags: cleanTags,
        favorite: Boolean(updates.favorite),
        version: (updates.version || '').trim() || existing.version,
        entryPath: resolvedEntryPath,
        url: normalizedUrl,
        embedMode:
          existing.type === 'url'
            ? updates.embedMode || existing.embedMode || 'external'
            : undefined,
        updatedAt: now,
      };

      await db.tools.put(updated);
      await db.history.add({
        toolId: updated.id,
        toolName: updated.name,
        toolType: updated.type,
        action: 'update',
        timestamp: now,
      });

      return updated;
    });
  },

  /**
   * Toggles favorite status on a tool.
   */
  async toggleFavorite(toolId: string): Promise<boolean> {
    return db.transaction('rw', db.tools, async () => {
      const tool = await db.tools.get(toolId);
      if (!tool) throw new Error('Không tìm thấy công cụ.');
      const nextFav = !tool.favorite;
      await db.tools.update(toolId, {
        favorite: nextFav,
        updatedAt: new Date().toISOString(),
      });
      return nextFav;
    });
  },

  /**
   * Deletes a tool, its packaged blobs, its isolated localStorage, and closes any open workspace tab transactionally.
   */
  async deleteTool(toolId: string): Promise<void> {
    await db.transaction(
      'rw',
      [db.tools, db.toolFiles, db.toolStorage, db.workspace, db.preferences],
      async () => {
        await db.tools.delete(toolId);
        await db.toolFiles.where('toolId').equals(toolId).delete();
        await db.toolStorage.delete(toolId);
        await db.workspace.delete(toolId);

        const activePref = await db.preferences.get('activeTabId');
        if (activePref?.value === toolId) {
          const remainingTabs = await db.workspace.orderBy('order').toArray();
          const nextActive = remainingTabs.length > 0 ? remainingTabs[0].id : null;
          await db.preferences.put({
            key: 'activeTabId',
            value: nextActive,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    );
  },

  /**
   * Fetches all packaged files for a given toolId.
   */
  async getToolFiles(toolId: string): Promise<ToolFileRecord[]> {
    return db.toolFiles.where('toolId').equals(toolId).toArray();
  },

  /**
   * Updates the text content of a file inside an existing tool directly from the in-app code editor.
   * Recalculates sizeBytes, updates timestamps, and triggers live reload on open workspace tabs.
   */
  async updateToolFileContent(
    toolId: string,
    filePath: string,
    newContent: string
  ): Promise<ToolManifest> {
    const pathCheck = validateAndNormalizePath(filePath);
    if (!pathCheck.valid) {
      throw new Error(pathCheck.error || 'Đường dẫn tệp không hợp lệ.');
    }

    const encoded = new TextEncoder().encode(newContent);
    if (encoded.byteLength > SECURITY_LIMITS.MAX_SINGLE_FILE_BYTES) {
      throw new Error('Nội dung tệp vượt quá giới hạn 10 MB.');
    }

    return db.transaction(
      'rw',
      [db.tools, db.toolFiles, db.workspace, db.history],
      async () => {
        const tool = await db.tools.get(toolId);
        if (!tool) {
          throw new Error('Không tìm thấy công cụ cần chỉnh sửa.');
        }

        const fileId = `${toolId}::${pathCheck.normalizedPath}`;
        const existingFile = await db.toolFiles.get(fileId);
        if (!existingFile) {
          throw new Error(`Không tìm thấy tệp "${pathCheck.normalizedPath}" trong công cụ.`);
        }

        await db.toolFiles.put({
          ...existingFile,
          data: encoded,
          size: encoded.byteLength,
          isText: true,
          textContent: newContent,
        });

        const allFiles = await db.toolFiles.where('toolId').equals(toolId).toArray();
        const totalSizeBytes = allFiles.reduce((sum, f) => sum + (f.size || 0), 0);
        if (totalSizeBytes > SECURITY_LIMITS.MAX_TOTAL_UNCOMPRESSED_BYTES) {
          throw new Error('Tổng dung lượng gói vượt quá giới hạn 25 MB.');
        }

        const now = new Date().toISOString();
        const updatedManifest: ToolManifest = {
          ...tool,
          sizeBytes: totalSizeBytes,
          updatedAt: now,
        };
        await db.tools.put(updatedManifest);

        const openTab = await db.workspace.get(toolId);
        if (openTab) {
          await db.workspace.update(toolId, {
            reloadCount: (openTab.reloadCount || 0) + 1,
          });
        }

        await db.history.add({
          toolId: tool.id,
          toolName: tool.name,
          toolType: tool.type,
          action: 'update',
          timestamp: now,
        });

        return updatedManifest;
      }
    );
  },

  /**
   * Fetches the isolated localStorage snapshot for a specific toolId.
   */
  async getToolStorage(toolId: string): Promise<Record<string, string>> {
    if (!toolId || typeof toolId !== 'string') return {};
    const record = await db.toolStorage.get(toolId);
    if (!record || !record.entries || typeof record.entries !== 'object') {
      return {};
    }
    return { ...record.entries };
  },

  /**
   * Applies a validated localStorage mutation (set, remove, or clear) scoped strictly to `toolId`
   * with bounded key count, key length, and total byte size.
   */
  async applyToolStorageMutation(
    toolId: string,
    mutation: { op: 'set' | 'remove' | 'clear'; key?: string; value?: string }
  ): Promise<void> {
    if (!toolId || typeof toolId !== 'string') {
      throw new Error('Thiếu toolId hợp lệ khi lưu trữ trạng thái công cụ.');
    }

    await db.transaction('rw', [db.tools, db.toolStorage], async () => {
      const toolExists = await db.tools.get(toolId);
      if (!toolExists) {
        throw new Error('Không tìm thấy công cụ tương ứng để lưu dữ liệu cục bộ.');
      }

      const now = new Date().toISOString();

      if (mutation.op === 'clear') {
        await db.toolStorage.put({
          toolId,
          entries: {},
          byteSize: 0,
          updatedAt: now,
        });
        return;
      }

      const existing = await db.toolStorage.get(toolId);
      const entries: Record<string, string> = existing?.entries ? { ...existing.entries } : {};

      if (mutation.op === 'remove') {
        const key = String(mutation.key ?? '');
        delete entries[key];
      } else if (mutation.op === 'set') {
        const key = String(mutation.key ?? '');
        const value = String(mutation.value ?? '');

        if (key.length === 0 || key.length > STORAGE_LIMITS.MAX_KEY_LENGTH) {
          throw new Error(
            `Khóa localStorage không hợp lệ hoặc vượt quá ${STORAGE_LIMITS.MAX_KEY_LENGTH} ký tự.`
          );
        }

        const existingKeys = Object.keys(entries);
        if (!(key in entries) && existingKeys.length >= STORAGE_LIMITS.MAX_KEYS_PER_TOOL) {
          throw new Error(
            `Số lượng khóa localStorage của công cụ vượt quá giới hạn (${STORAGE_LIMITS.MAX_KEYS_PER_TOOL} khóa).`
          );
        }

        entries[key] = value;
      } else {
        throw new Error('Thao tác lưu trữ không hợp lệ.');
      }

      let byteSize = 0;
      for (const [k, v] of Object.entries(entries)) {
        byteSize += (k.length + v.length) * 2;
      }

      if (byteSize > STORAGE_LIMITS.MAX_TOTAL_BYTES_PER_TOOL) {
        throw new Error('Dung lượng localStorage của công cụ vượt quá giới hạn an toàn (2 MB).');
      }

      await db.toolStorage.put({
        toolId,
        entries,
        byteSize,
        updatedAt: now,
      });
    });
  },

  /**
   * Opens a tool in the Workspace, updates lastOpenedAt, and records history.
   */
  async openToolInWorkspace(toolId: string): Promise<void> {
    await db.transaction(
      'rw',
      [db.tools, db.workspace, db.preferences, db.history],
      async () => {
        const tool = await db.tools.get(toolId);
        if (!tool) {
          throw new Error('Không tìm thấy công cụ.');
        }

        const now = new Date().toISOString();
        await db.tools.update(toolId, { lastOpenedAt: now });

        const existingTab = await db.workspace.get(toolId);
        if (!existingTab) {
          const allTabs = await db.workspace.orderBy('order').toArray();
          const nextOrder =
            allTabs.length > 0 ? Math.max(...allTabs.map((t) => t.order)) + 1 : 0;
          await db.workspace.put({
            id: toolId,
            toolId,
            openedAt: now,
            order: nextOrder,
            reloadCount: 0,
          });
        }

        await db.preferences.put({
          key: 'activeTabId',
          value: toolId,
          updatedAt: now,
        });

        await db.history.add({
          toolId: tool.id,
          toolName: tool.name,
          toolType: tool.type,
          action: 'open',
          timestamp: now,
        });
      }
    );
  },

  /**
   * Sets the active workspace tab ID.
   */
  async setActiveWorkspaceTab(tabId: string | null): Promise<void> {
    await db.preferences.put({
      key: 'activeTabId',
      value: tabId,
      updatedAt: new Date().toISOString(),
    });
  },

  /**
   * Closes a workspace tab and selects an adjacent tab if it was active.
   */
  async closeWorkspaceTab(tabId: string): Promise<void> {
    await db.transaction('rw', [db.workspace, db.preferences], async () => {
      await db.workspace.delete(tabId);
      const activePref = await db.preferences.get('activeTabId');
      if (activePref?.value === tabId) {
        const remaining = await db.workspace.orderBy('order').toArray();
        const nextId = remaining.length > 0 ? remaining[remaining.length - 1].id : null;
        await db.preferences.put({
          key: 'activeTabId',
          value: nextId,
          updatedAt: new Date().toISOString(),
        });
      }
    });
  },

  /**
   * Increments reloadCount on a workspace tab to trigger fresh runner mount.
   */
  async reloadWorkspaceTab(tabId: string): Promise<void> {
    const tab = await db.workspace.get(tabId);
    if (tab) {
      await db.workspace.update(tabId, {
        reloadCount: (tab.reloadCount || 0) + 1,
      });
    }
  },

  /**
   * Closes all workspace tabs.
   */
  async closeAllWorkspaceTabs(): Promise<void> {
    await db.transaction('rw', [db.workspace, db.preferences], async () => {
      await db.workspace.clear();
      await db.preferences.put({
        key: 'activeTabId',
        value: null,
        updatedAt: new Date().toISOString(),
      });
    });
  },

  /**
   * Updates user preference (theme or libraryView).
   */
  async setPreference<K extends keyof AppPreferences>(
    key: K,
    value: AppPreferences[K]
  ): Promise<void> {
    await db.preferences.put({
      key,
      value,
      updatedAt: new Date().toISOString(),
    });
  },

  /**
   * Exports a versioned JSON backup containing tools, base64 file blobs, preferences, workspace, history, and toolStorage.
   */
  async exportVersionedBackup(): Promise<BackupPayloadV1> {
    const [tools, rawFiles, preferences, workspace, history, toolStorage] = await Promise.all([
      db.tools.toArray(),
      db.toolFiles.toArray(),
      db.preferences.toArray(),
      db.workspace.toArray(),
      db.history.toArray(),
      db.toolStorage.toArray(),
    ]);

    const files: BackupFileEntryV1[] = rawFiles.map((f) => ({
      toolId: f.toolId,
      path: f.path,
      mimeType: f.mimeType,
      size: f.size,
      isText: f.isText,
      base64Data: uint8ArrayToBase64(f.data),
    }));

    return {
      schemaVersion: 1,
      app: 'YunzyHub',
      exportedAt: new Date().toISOString(),
      tools,
      files,
      preferences,
      workspace,
      history,
      toolStorage,
    };
  },

  /**
   * Imports and validates a versioned JSON backup transactionally.
   * Validates URLs, file paths, entry points, file sizes, and preference schemas at the restore boundary.
   */
  async importVersionedBackup(
    rawJsonText: string,
    mode: 'merge' | 'replace'
  ): Promise<{ importedToolsCount: number; importedFilesCount: number }> {
    let parsed: BackupPayloadV1;
    try {
      parsed = JSON.parse(rawJsonText);
    } catch {
      throw new Error('Tệp sao lưu không phải định dạng JSON hợp lệ.');
    }

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      parsed.app !== 'YunzyHub' ||
      parsed.schemaVersion !== 1 ||
      !Array.isArray(parsed.tools) ||
      !Array.isArray(parsed.files)
    ) {
      throw new Error(
        'Tệp sao lưu không tương thích hoặc thiếu thông tin phiên bản (Yêu cầu: app="YunzyHub", schemaVersion=1).'
      );
    }

    // 1. Validate all files first so we can verify tool file integrity and entry points
    const validatedFiles: ToolFileRecord[] = [];
    const filesByToolId = new Map<string, Map<string, ToolFileRecord>>();
    let totalBackupBytes = 0;

    for (const f of parsed.files) {
      if (!f || typeof f.toolId !== 'string' || !f.toolId.trim() || typeof f.path !== 'string') {
        throw new Error('Bản ghi tệp trong bản sao lưu bị thiếu toolId hoặc đường dẫn.');
      }

      const pathCheck = validateAndNormalizePath(f.path);
      if (!pathCheck.valid) {
        throw new Error(`Tệp trong bản sao lưu vi phạm quy tắc bảo mật: ${pathCheck.error}`);
      }

      const data = base64ToUint8Array(f.base64Data);
      if (data.byteLength > SECURITY_LIMITS.MAX_SINGLE_FILE_BYTES) {
        throw new Error(
          `Tệp "${pathCheck.normalizedPath}" trong bản sao lưu vượt quá giới hạn 10 MB.`
        );
      }

      totalBackupBytes += data.byteLength;
      if (totalBackupBytes > SECURITY_LIMITS.MAX_TOTAL_UNCOMPRESSED_BYTES * 4) {
        throw new Error('Tổng dung lượng bản sao lưu vượt quá giới hạn an toàn (100 MB).');
      }

      const textContent = f.isText
        ? new TextDecoder('utf-8', { fatal: false }).decode(data)
        : undefined;

      const record: ToolFileRecord = {
        id: `${f.toolId}::${pathCheck.normalizedPath}`,
        toolId: f.toolId,
        path: pathCheck.normalizedPath,
        mimeType: typeof f.mimeType === 'string' && f.mimeType ? f.mimeType : 'application/octet-stream',
        size: data.byteLength,
        data,
        isText: Boolean(f.isText),
        textContent,
      };

      let toolFileMap = filesByToolId.get(f.toolId);
      if (!toolFileMap) {
        toolFileMap = new Map<string, ToolFileRecord>();
        filesByToolId.set(f.toolId, toolFileMap);
      }
      if (toolFileMap.has(record.path)) {
        throw new Error(
          `Bản sao lưu chứa đường dẫn tệp trùng lặp "${record.path}" cho công cụ "${f.toolId}".`
        );
      }
      if (toolFileMap.size >= SECURITY_LIMITS.MAX_ZIP_FILE_COUNT) {
        throw new Error(
          `Công cụ "${f.toolId}" trong bản sao lưu vượt quá giới hạn ${SECURITY_LIMITS.MAX_ZIP_FILE_COUNT} tệp.`
        );
      }

      toolFileMap.set(record.path, record);
      validatedFiles.push(record);
    }

    // 2. Validate all tool manifests at the restore boundary
    const nowIso = new Date().toISOString();
    const validatedTools: ToolManifest[] = [];
    const seenToolIds = new Set<string>();

    for (const t of parsed.tools) {
      if (
        !t ||
        typeof t.id !== 'string' ||
        !t.id.trim() ||
        typeof t.name !== 'string' ||
        !t.name.trim() ||
        !['html', 'zip', 'url', 'file'].includes(t.type)
      ) {
        throw new Error(
          `Dữ liệu công cụ trong bản sao lưu bị hỏng hoặc thiếu trường bắt buộc (ID: ${
            t?.id || 'không rõ'
          }).`
        );
      }

      if (seenToolIds.has(t.id)) {
        throw new Error(`Bản sao lưu chứa ID công cụ bị trùng lặp: "${t.id}".`);
      }
      seenToolIds.add(t.id);

      let normalizedUrl: string | undefined;
      let normalizedEntryPath: string | undefined;
      let computedSizeBytes = 0;
      let computedFileCount = 0;

      if (t.type === 'url') {
        const urlCheck = validateExternalUrl(t.url || '');
        if (!urlCheck.valid) {
          throw new Error(
            `Công cụ URL "${t.name}" trong bản sao lưu chứa địa chỉ không an toàn: ${urlCheck.error}`
          );
        }
        normalizedUrl = urlCheck.normalizedUrl;
      } else {
        const toolFiles = filesByToolId.get(t.id);
        if (!toolFiles || toolFiles.size === 0) {
          throw new Error(
            `Công cụ ${t.type.toUpperCase()} "${t.name}" thiếu dữ liệu tệp đính kèm trong bản sao lưu.`
          );
        }

        const rawEntry = t.entryPath || 'index.html';
        const entryCheck = validateAndNormalizePath(rawEntry);
        if (!entryCheck.valid) {
          throw new Error(
            `Điểm vào của công cụ "${t.name}" không an toàn: ${entryCheck.error}`
          );
        }
        if (!toolFiles.has(entryCheck.normalizedPath)) {
          throw new Error(
            `Tệp khởi chạy "${entryCheck.normalizedPath}" của công cụ "${t.name}" không tồn tại trong danh sách tệp sao lưu.`
          );
        }
        normalizedEntryPath = entryCheck.normalizedPath;
        computedFileCount = toolFiles.size;
        for (const fileRec of toolFiles.values()) {
          computedSizeBytes += fileRec.size;
        }
        if (computedSizeBytes > SECURITY_LIMITS.MAX_TOTAL_UNCOMPRESSED_BYTES) {
          throw new Error(`Gói công cụ "${t.name}" vượt quá giới hạn dung lượng 25 MB.`);
        }
      }

      const cleanTags = Array.isArray(t.tags)
        ? Array.from(
            new Set(
              t.tags
                .filter((tag): tag is string => typeof tag === 'string')
                .map((tag) => tag.trim().toLowerCase())
                .filter(Boolean)
            )
          )
        : [];

      validatedTools.push({
        id: t.id.trim(),
        name: t.name.trim(),
        description:
          typeof t.description === 'string' && t.description.trim()
            ? t.description.trim()
            : 'Không có mô tả.',
        type: t.type,
        category:
          typeof t.category === 'string' && t.category.trim() ? t.category.trim() : 'Chung',
        tags: cleanTags,
        favorite: Boolean(t.favorite),
        createdAt: typeof t.createdAt === 'string' && t.createdAt ? t.createdAt : nowIso,
        updatedAt: typeof t.updatedAt === 'string' && t.updatedAt ? t.updatedAt : nowIso,
        lastOpenedAt:
          typeof t.lastOpenedAt === 'string' && t.lastOpenedAt ? t.lastOpenedAt : null,
        entryPath: normalizedEntryPath,
        url: normalizedUrl,
        version: typeof t.version === 'string' && t.version.trim() ? t.version.trim() : '1.0.0',
        sizeBytes: computedSizeBytes,
        fileCount: computedFileCount,
        embedMode:
          t.type === 'url'
            ? t.embedMode === 'sandbox'
              ? 'sandbox'
              : 'external'
            : undefined,
      });
    }

    // Ensure no orphan files belong to unknown tools
    for (const f of validatedFiles) {
      if (!seenToolIds.has(f.toolId)) {
        throw new Error(
          `Tệp "${f.path}" trong bản sao lưu tham chiếu tới toolId không tồn tại ("${f.toolId}").`
        );
      }
    }

    // 3. Validate preferences if present
    const validatedPreferences: PreferenceRecord[] = [];
    if (parsed.preferences !== undefined) {
      if (!Array.isArray(parsed.preferences)) {
        throw new Error('Trường preferences trong bản sao lưu không hợp lệ.');
      }
      for (const pref of parsed.preferences) {
        if (!pref || typeof pref.key !== 'string') {
          throw new Error('Bản ghi tùy chọn trong bản sao lưu không hợp lệ.');
        }
        if (
          pref.key === 'theme' &&
          !['light', 'dark', 'system'].includes(String(pref.value))
        ) {
          throw new Error(`Giá trị chủ đề (theme) không hợp lệ trong bản sao lưu: ${String(pref.value)}`);
        }
        if (
          pref.key === 'libraryView' &&
          !['grid', 'list'].includes(String(pref.value))
        ) {
          throw new Error(
            `Giá trị chế độ xem (libraryView) không hợp lệ trong bản sao lưu: ${String(pref.value)}`
          );
        }
        validatedPreferences.push({
          key: pref.key,
          value: pref.value,
          updatedAt: typeof pref.updatedAt === 'string' ? pref.updatedAt : nowIso,
        });
      }
    }

    // 4. Validate workspace tabs if present
    const validatedWorkspace: WorkspaceTabRecord[] = [];
    if (parsed.workspace !== undefined) {
      if (!Array.isArray(parsed.workspace)) {
        throw new Error('Trường workspace trong bản sao lưu không hợp lệ.');
      }
      for (let idx = 0; idx < parsed.workspace.length; idx++) {
        const w = parsed.workspace[idx];
        if (!w || typeof w.toolId !== 'string' || !seenToolIds.has(w.toolId)) {
          continue;
        }
        validatedWorkspace.push({
          id: w.toolId,
          toolId: w.toolId,
          openedAt: typeof w.openedAt === 'string' ? w.openedAt : nowIso,
          order: typeof w.order === 'number' ? w.order : idx,
          reloadCount: 0,
        });
      }
    }

    // 5. Validate history entries if present
    const validatedHistory: HistoryRecord[] = [];
    if (Array.isArray(parsed.history)) {
      for (const h of parsed.history) {
        if (
          h &&
          typeof h.toolId === 'string' &&
          typeof h.toolName === 'string' &&
          ['html', 'zip', 'url', 'file'].includes(h.toolType) &&
          ['open', 'import', 'update'].includes(h.action) &&
          typeof h.timestamp === 'string'
        ) {
          validatedHistory.push({
            toolId: h.toolId,
            toolName: h.toolName,
            toolType: h.toolType,
            action: h.action,
            timestamp: h.timestamp,
          });
        }
      }
    }

    // 6. Validate per-tool localStorage records if present
    const validatedToolStorage: ToolStorageRecord[] = [];
    if (Array.isArray(parsed.toolStorage)) {
      for (const ts of parsed.toolStorage) {
        if (
          !ts ||
          typeof ts.toolId !== 'string' ||
          !seenToolIds.has(ts.toolId) ||
          !ts.entries ||
          typeof ts.entries !== 'object'
        ) {
          continue;
        }
        const cleanEntries: Record<string, string> = {};
        let byteSize = 0;
        const keys = Object.keys(ts.entries);
        if (keys.length > STORAGE_LIMITS.MAX_KEYS_PER_TOOL) {
          throw new Error(`Dữ liệu localStorage của công cụ "${ts.toolId}" vượt quá số khóa cho phép.`);
        }
        for (const k of keys) {
          if (k.length === 0 || k.length > STORAGE_LIMITS.MAX_KEY_LENGTH) {
            throw new Error(`Khóa localStorage của công cụ "${ts.toolId}" không hợp lệ.`);
          }
          const v = String(ts.entries[k] ?? '');
          byteSize += (k.length + v.length) * 2;
          if (byteSize > STORAGE_LIMITS.MAX_TOTAL_BYTES_PER_TOOL) {
            throw new Error(`Dữ liệu localStorage của công cụ "${ts.toolId}" vượt quá giới hạn 2 MB.`);
          }
          cleanEntries[k] = v;
        }
        validatedToolStorage.push({
          toolId: ts.toolId,
          entries: cleanEntries,
          byteSize,
          updatedAt: typeof ts.updatedAt === 'string' ? ts.updatedAt : nowIso,
        });
      }
    }

    await db.transaction(
      'rw',
      [db.tools, db.toolFiles, db.toolStorage, db.preferences, db.workspace, db.history],
      async () => {
        if (mode === 'replace') {
          await Promise.all([
            db.tools.clear(),
            db.toolFiles.clear(),
            db.toolStorage.clear(),
            db.workspace.clear(),
            db.history.clear(),
          ]);
        } else {
          // In merge mode, replace files belonging to any toolId being updated by the backup
          for (const toolId of seenToolIds) {
            await db.toolFiles.where('toolId').equals(toolId).delete();
          }
        }

        await db.tools.bulkPut(validatedTools);
        await db.toolFiles.bulkPut(validatedFiles);

        if (validatedToolStorage.length > 0) {
          await db.toolStorage.bulkPut(validatedToolStorage);
        }

        if (validatedWorkspace.length > 0) {
          await db.workspace.bulkPut(validatedWorkspace);
        }

        if (validatedPreferences.length > 0) {
          await db.preferences.bulkPut(validatedPreferences);
        }

        if (validatedHistory.length > 0) {
          await db.history.bulkAdd(validatedHistory);
        }
      }
    );

    return {
      importedToolsCount: validatedTools.length,
      importedFilesCount: validatedFiles.length,
    };
  },

  /**
   * Clears isolated localStorage data for all tools while keeping installed tools intact.
   */
  async clearAllToolStorage(): Promise<number> {
    return db.transaction('rw', db.toolStorage, async () => {
      const count = await db.toolStorage.count();
      await db.toolStorage.clear();
      return count;
    });
  },

  /**
   * Clears recent launch history records and resets lastOpenedAt timestamps without deleting tools.
   */
  async clearHistory(): Promise<number> {
    return db.transaction('rw', [db.history, db.tools], async () => {
      const count = await db.history.count();
      await db.history.clear();
      const allTools = await db.tools.toArray();
      if (allTools.length > 0) {
        await db.tools.bulkPut(
          allTools.map((t) => ({
            ...t,
            lastOpenedAt: null,
          }))
        );
      }
      return count;
    });
  },

  /**
   * Clears all user data and resets to a clean state.
   */
  async clearAllData(): Promise<void> {
    await db.transaction(
      'rw',
      [db.tools, db.toolFiles, db.toolStorage, db.preferences, db.workspace, db.history],
      async () => {
        await Promise.all([
          db.tools.clear(),
          db.toolFiles.clear(),
          db.toolStorage.clear(),
          db.workspace.clear(),
          db.history.clear(),
        ]);
        const now = new Date().toISOString();
        await db.preferences.put({
          key: 'seededSampleTools',
          value: true,
          updatedAt: now,
        });
        await db.preferences.put({
          key: 'cleanedLegacySamples',
          value: true,
          updatedAt: now,
        });
        await db.preferences.put({
          key: 'activeTabId',
          value: null,
          updatedAt: now,
        });
      }
    );
  },
};

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, idx);
  return `${val.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

export function formatDateTimeVi(isoString: string | null | undefined): string {
  if (!isoString) return 'Chưa mở lần nào';
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return isoString;
  }
}

export function getToolTypeLabelVi(type: ToolType): string {
  switch (type) {
    case 'html':
      return 'HTML Độc lập';
    case 'zip':
      return 'Gói ZIP';
    case 'url':
      return 'Web URL';
    case 'file':
      return 'Tệp tài liệu';
  }
}

export function parsePreferenceValue<T>(
  records: Array<{ key: string; value: unknown }> | undefined,
  key: string,
  fallback: T
): T {
  if (!records) return fallback;
  const found = records.find((r) => r.key === key);
  return (found?.value as T) ?? fallback;
}
export type { ThemeMode, LibraryViewMode };
