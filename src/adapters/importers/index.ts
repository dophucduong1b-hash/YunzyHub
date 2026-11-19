import { documentImporterAdapter } from './documentImporter';
import { htmlImporterAdapter } from './htmlImporter';
import type { FileImporterAdapter, ImportInspectionResult } from './types';
import { zipImporterAdapter } from './zipImporter';

const FILE_IMPORTER_REGISTRY: FileImporterAdapter[] = [
  htmlImporterAdapter,
  zipImporterAdapter,
  documentImporterAdapter,
];

export async function inspectImportedFile(file: File): Promise<ImportInspectionResult> {
  const adapter = FILE_IMPORTER_REGISTRY.find((item) => item.canHandle(file));
  if (!adapter) {
    throw new Error(
      `Định dạng tệp "${file.name}" chưa được hỗ trợ. Hỗ trợ: HTML, ZIP, PDF, DOCX, Markdown, TXT, JSON, CSV, mã nguồn, ảnh và media phổ biến.`
    );
  }
  return adapter.inspectFile(file);
}

export * from './documentImporter';
export * from './htmlImporter';
export * from './securityValidator';
export * from './types';
export * from './urlImporter';
export * from './zipImporter';
