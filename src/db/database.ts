import Dexie, { type Table } from 'dexie';
import type {
  HistoryRecord,
  PreferenceRecord,
  ReadingProgressRecord,
  ToolFileRecord,
  ToolManifest,
  ToolStorageRecord,
  WorkspaceTabRecord,
} from '../types/models';

export class YunzyHubDatabase extends Dexie {
  tools!: Table<ToolManifest, string>;
  toolFiles!: Table<ToolFileRecord, string>;
  preferences!: Table<PreferenceRecord, string>;
  history!: Table<HistoryRecord, number>;
  workspace!: Table<WorkspaceTabRecord, string>;
  toolStorage!: Table<ToolStorageRecord, string>;
  readingProgress!: Table<ReadingProgressRecord, string>;

  constructor() {
    super('YunzyHubLocalDB');

    this.version(1).stores({
      tools: '&id, name, type, category, *tags, favorite, createdAt, updatedAt, lastOpenedAt',
      toolFiles: '&id, toolId, [toolId+path], path, mimeType, size',
      preferences: '&key, updatedAt',
      history: '++id, toolId, toolType, action, timestamp',
      workspace: '&id, toolId, order, openedAt',
    });

    this.version(2).stores({
      tools: '&id, name, type, category, *tags, favorite, createdAt, updatedAt, lastOpenedAt',
      toolFiles: '&id, toolId, [toolId+path], path, mimeType, size',
      preferences: '&key, updatedAt',
      history: '++id, toolId, toolType, action, timestamp',
      workspace: '&id, toolId, order, openedAt',
      toolStorage: '&toolId, updatedAt',
    });

    this.version(3).stores({
      tools: '&id, name, type, category, *tags, favorite, createdAt, updatedAt, lastOpenedAt',
      toolFiles: '&id, toolId, [toolId+path], path, mimeType, size',
      preferences: '&key, updatedAt',
      history: '++id, toolId, toolType, action, timestamp',
      workspace: '&id, toolId, order, openedAt',
      toolStorage: '&toolId, updatedAt',
      readingProgress: '&id, toolId, updatedAt',
    });
  }
}

export const db = new YunzyHubDatabase();

