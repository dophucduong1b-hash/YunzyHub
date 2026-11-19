export type ToolType = 'html' | 'zip' | 'url' | 'file';

export type ThemeMode = 'light' | 'dark' | 'system';

export type LibraryViewMode = 'grid' | 'list';

export type NavSection =
  | 'dashboard'
  | 'library'
  | 'search'
  | 'favorites'
  | 'workspace'
  | 'settings';

export interface ToolManifest {
  id: string;
  name: string;
  description: string;
  type: ToolType;
  category: string;
  tags: string[];
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
  entryPath?: string;
  url?: string;
  version: string;
  sizeBytes: number;
  fileCount: number;
  embedMode?: 'external' | 'sandbox';
}

export interface ToolFileRecord {
  id: string; // `${toolId}::${path}`
  toolId: string;
  path: string; // Normalized relative POSIX path, e.g. "index.html" or "assets/app.js"
  mimeType: string;
  size: number;
  data: Uint8Array;
  isText: boolean;
  textContent?: string;
}

export interface PreferenceRecord {
  key: string;
  value: unknown;
  updatedAt: string;
}

export interface HistoryRecord {
  id?: number;
  toolId: string;
  toolName: string;
  toolType: ToolType;
  action: 'open' | 'import' | 'update';
  timestamp: string;
}

export interface WorkspaceTabRecord {
  id: string; // Tab ID (equals toolId so one tab per tool or unique tab instance)
  toolId: string;
  openedAt: string;
  order: number;
  reloadCount: number;
}

export interface AppPreferences {
  theme: ThemeMode;
  libraryView: LibraryViewMode;
  activeTabId: string | null;
  seededSampleTools: boolean;
}

export interface ToolStorageRecord {
  toolId: string;
  entries: Record<string, string>;
  byteSize: number;
  updatedAt: string;
}

export interface BackupFileEntryV1 {
  toolId: string;
  path: string;
  mimeType: string;
  size: number;
  isText: boolean;
  base64Data: string;
}

export interface BackupPayloadV1 {
  schemaVersion: 1;
  app: 'YunzyHub';
  exportedAt: string;
  tools: ToolManifest[];
  files: BackupFileEntryV1[];
  preferences: PreferenceRecord[];
  workspace: WorkspaceTabRecord[];
  history: HistoryRecord[];
  toolStorage?: ToolStorageRecord[];
}

