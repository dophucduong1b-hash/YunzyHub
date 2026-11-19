import type { ToolType } from '../../types/models';

export interface UnpackedPackageFile {
  path: string;
  mimeType: string;
  size: number;
  data: Uint8Array;
  isText: boolean;
  textContent?: string;
}

export interface ImportInspectionResult {
  type: ToolType;
  suggestedName: string;
  suggestedDescription: string;
  entryCandidates: string[];
  defaultEntryPath: string;
  files: UnpackedPackageFile[];
  totalSizeBytes: number;
  warnings: string[];
}

export interface FileImporterAdapter {
  readonly type: 'html' | 'zip' | 'file';
  canHandle(file: File): boolean;
  inspectFile(file: File): Promise<ImportInspectionResult>;
}
