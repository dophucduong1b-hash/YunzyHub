import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import 'fake-indexeddb/auto';
// @ts-expect-error jsdom types not required for test runner
import { JSDOM } from 'jsdom';
import JSZip from 'jszip';

// Set up DOM globals (DOMParser, File, Blob, atob, btoa) for importers and packageBundler
const jsdomInstance = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
  url: 'http://localhost:3000/',
});
globalThis.DOMParser = jsdomInstance.window.DOMParser;
globalThis.Document = jsdomInstance.window.Document;
globalThis.HTMLElement = jsdomInstance.window.HTMLElement;

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  htmlImporterAdapter,
  inspectExternalUrl,
  inspectImportedFile,
  SECURITY_LIMITS,
  validateExternalUrl,
  zipImporterAdapter,
} from '../src/adapters/importers/index.ts';
import {
  SANDBOX_CSP_DIRECTIVE,
  SANDBOX_IFRAME_PERMISSIONS,
} from '../src/adapters/runners/cspBuilder.ts';
import { compilePackageToSrcDoc } from '../src/adapters/runners/packageBundler.ts';
import { PRIMARY_NAV_ITEMS } from '../src/App.tsx';
import { db } from '../src/db/database.ts';
import { DashboardPage } from '../src/pages/DashboardPage.tsx';
import { LibraryPage } from '../src/pages/LibraryPage.tsx';
import { SearchPage } from '../src/pages/SearchPage.tsx';
import { SettingsPage } from '../src/pages/SettingsPage.tsx';
import { WorkspacePage } from '../src/pages/WorkspacePage.tsx';
import {
  LEGACY_SAMPLE_TOOL_IDS,
  toolRepository,
} from '../src/repositories/toolRepository.ts';

function toFile(bytes: Uint8Array, name: string, type: string): File {
  return new File([bytes as unknown as BlobPart], name, { type });
}

/**
 * Helper to build a raw minimal valid ZIP binary buffer with an unsanitized filename
 * (e.g. "../evil.html" or "/abs/evil.html") in both Local File Header and Central Directory,
 * so JSZip sets `entry.unsafeOriginalName = rawName` while sanitizing `entry.name`.
 */
function createRawZipWithUnsanitizedFilename(rawFileName: string, content: string): Uint8Array {
  const nameBytes = new TextEncoder().encode(rawFileName);
  const dataBytes = new TextEncoder().encode(content);

  function crc32(buf: Uint8Array): number {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let k = 0; k < 8; k++) {
        c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
      }
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  const crc = crc32(dataBytes);
  const localHeaderLen = 30 + nameBytes.length;
  const localOffset = 0;
  const cdOffset = localHeaderLen + dataBytes.length;
  const cdLen = 46 + nameBytes.length;
  const totalLen = cdOffset + cdLen + 22;

  const out = new Uint8Array(totalLen);
  const view = new DataView(out.buffer);

  // Local file header
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, dataBytes.length, true);
  view.setUint32(22, dataBytes.length, true);
  view.setUint16(26, nameBytes.length, true);
  view.setUint16(28, 0, true);
  out.set(nameBytes, 30);
  out.set(dataBytes, 30 + nameBytes.length);

  // Central directory header
  view.setUint32(cdOffset + 0, 0x02014b50, true);
  view.setUint16(cdOffset + 4, 20, true);
  view.setUint16(cdOffset + 6, 20, true);
  view.setUint16(cdOffset + 8, 0, true);
  view.setUint16(cdOffset + 10, 0, true);
  view.setUint16(cdOffset + 12, 0, true);
  view.setUint16(cdOffset + 14, 0, true);
  view.setUint32(cdOffset + 16, crc, true);
  view.setUint32(cdOffset + 20, dataBytes.length, true);
  view.setUint32(cdOffset + 24, dataBytes.length, true);
  view.setUint16(cdOffset + 28, nameBytes.length, true);
  view.setUint16(cdOffset + 30, 0, true);
  view.setUint16(cdOffset + 32, 0, true);
  view.setUint16(cdOffset + 34, 0, true);
  view.setUint16(cdOffset + 36, 0, true);
  view.setUint32(cdOffset + 38, 0, true);
  view.setUint32(cdOffset + 42, localOffset, true);
  out.set(nameBytes, cdOffset + 46);

  // End of central directory record
  const eocd = cdOffset + cdLen;
  view.setUint32(eocd + 0, 0x06054b50, true);
  view.setUint16(eocd + 4, 0, true);
  view.setUint16(eocd + 6, 0, true);
  view.setUint16(eocd + 8, 1, true);
  view.setUint16(eocd + 10, 1, true);
  view.setUint32(eocd + 12, cdLen, true);
  view.setUint32(eocd + 16, cdOffset, true);
  view.setUint16(eocd + 20, 0, true);

  return out;
}

async function runAllTests() {
  let passed = 0;
  async function test(name: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      passed += 1;
      console.log(`  [PASS] ${name}`);
    } catch (err) {
      console.error(`  [FAIL] ${name}`);
      throw err;
    }
  }

  console.log('=== YunzyHub Phase 2 Automated QA & Integration Suite ===');

  await test('1. HTML Importer: valid HTML metadata extraction, CDN warning, and empty/oversized rejection', async () => {
    const htmlSource = `<!DOCTYPE html>
      <html>
        <head>
          <title>Máy Tính Cá Nhân</title>
          <meta name="description" content="Công cụ tính toán nhanh" />
          <script src="https://cdn.example.com/lib.js"></script>
        </head>
        <body><button onclick="document.body.dataset.res='PASS 42'">Run</button></body>
      </html>`;
    const file = new File([htmlSource], 'calc.html', { type: 'text/html' });
    const res = await inspectImportedFile(file);

    assert.equal(res.type, 'html');
    assert.equal(res.suggestedName, 'Máy Tính Cá Nhân');
    assert.equal(res.suggestedDescription, 'Công cụ tính toán nhanh');
    assert.equal(res.defaultEntryPath, 'calc.html');
    assert.equal(res.warnings.length, 1, 'Should warn about external CDN script');

    const emptyFile = new File([], 'empty.html', { type: 'text/html' });
    await assert.rejects(() => htmlImporterAdapter.inspectFile(emptyFile), /trống/);
  });

  await test('2. ZIP Importer & Bundler: nested CSS (@import + url), nested JS, SVG, entry point selection, and CSP injection precedence', async () => {
    const zip = new JSZip();
    zip.file(
      'my-suite/pages/main.html',
      `<!DOCTYPE html><html><head>
        <base href="https://attacker.example.com/" />
        <meta http-equiv="Content-Security-Policy" content="default-src *" />
        <meta http-equiv="refresh" content="0;url=https://attacker.example.com" />
        <title>Main Entry</title>
        <link rel="stylesheet" href="../styles/style.css" />
      </head><body>
        <img src="../assets/icon.svg#badge" srcset="../assets/icon.svg 1x, ../assets/icon.svg 2x" />
        <script src="../scripts/logic.js"></script>
      </body></html>`
    );
    zip.file(
      'my-suite/pages/secondary.html',
      `<!DOCTYPE html><html><head><title>Secondary Tool</title></head><body><h1>Page 2</h1></body></html>`
    );
    zip.file('my-suite/styles/tokens.css', `:root { --brand: #0ea5e9; }`);
    zip.file(
      'my-suite/styles/style.css',
      `@import "./tokens.css";\nbody { background-image: url('../assets/icon.svg#bg'); color: var(--brand); }`
    );
    zip.file('my-suite/scripts/logic.js', `window.__TEST_LOADED__ = 42;`);
    zip.file('my-suite/assets/icon.svg', `<svg xmlns="http://www.w3.org/2000/svg"></svg>`);

    const zipBytes = await zip.generateAsync({ type: 'uint8array' });
    const zipFile = toFile(zipBytes, 'my-suite.zip', 'application/zip');

    const inspection = await zipImporterAdapter.inspectFile(zipFile);
    assert.equal(inspection.type, 'zip');
    assert.equal(inspection.entryCandidates.length, 2);
    assert.deepEqual(inspection.entryCandidates, ['pages/main.html', 'pages/secondary.html']);

    // Compile with selected entry 'pages/main.html'
    const compiled = compilePackageToSrcDoc(inspection.files, 'pages/main.html');
    assert.equal(compiled.entryPath, 'pages/main.html');
    assert.equal(compiled.missingAssets.length, 0);
    assert.ok(
      compiled.resolvedAssetsCount >= 5,
      'Should resolve CSS, @import CSS, CSS url(), img, srcset, and script'
    );

    // Parse compiled srcDoc and verify security invariants
    const parsedDoc = new DOMParser().parseFromString(compiled.srcDoc, 'text/html');
    assert.equal(parsedDoc.querySelectorAll('base').length, 0, 'Must strip <base> tags');
    assert.equal(
      parsedDoc.querySelectorAll('meta[http-equiv="refresh" i]').length,
      0,
      'Must strip <meta http-equiv="refresh">'
    );

    const cspMetas = parsedDoc.querySelectorAll('meta[http-equiv="Content-Security-Policy"]');
    assert.equal(cspMetas.length, 1, 'Must have exactly 1 CSP meta tag (attacker CSP removed)');
    assert.equal(
      parsedDoc.head.firstElementChild,
      cspMetas[0],
      'CSP <meta> MUST be the very first element in <head>'
    );
    assert.equal(cspMetas[0].getAttribute('content'), SANDBOX_CSP_DIRECTIVE);

    // Verify switching entry point to pages/secondary.html works
    const compiledSecondary = compilePackageToSrcDoc(inspection.files, 'pages/secondary.html');
    assert.equal(compiledSecondary.entryPath, 'pages/secondary.html');
    assert.ok(compiledSecondary.srcDoc.includes('Secondary Tool'));
  });

  await test('3. ZIP Traversal Before JSZip Sanitization (unsafeOriginalName)', async () => {
    const rawTraversalZip = createRawZipWithUnsanitizedFilename(
      '../traversal.html',
      '<!DOCTYPE html><html><body>Evil</body></html>'
    );
    const traversalFile = toFile(rawTraversalZip, 'traversal.zip', 'application/zip');

    await assert.rejects(
      () => zipImporterAdapter.inspectFile(traversalFile),
      /Path Traversal|\.\./i,
      'Must reject "../traversal.html" via unsafeOriginalName even though JSZip sanitizes entry.name'
    );

    const rawAbsZip = createRawZipWithUnsanitizedFilename(
      '/etc/passwd.html',
      '<!DOCTYPE html><html><body>Evil</body></html>'
    );
    const absFile = toFile(rawAbsZip, 'abs.zip', 'application/zip');
    await assert.rejects(
      () => zipImporterAdapter.inspectFile(absFile),
      /tuyệt đối/i,
      'Must reject leading slash "/etc/passwd.html" via unsafeOriginalName'
    );
  });

  await test('4. Malformed Archive, Executable/Backend Rejection, File Count Limit, and Size Limit', async () => {
    const garbageFile = toFile(new Uint8Array([1, 2, 3, 4, 5, 6]), 'corrupt.zip', 'application/zip');
    await assert.rejects(
      () => zipImporterAdapter.inspectFile(garbageFile),
      /Không thể giải nén tệp ZIP/
    );

    for (const forbiddenName of ['payload.exe', 'backdoor.php', 'server.py', 'run.sh', 'nested.zip']) {
      const z = new JSZip();
      z.file('index.html', '<html></html>');
      z.file(forbiddenName, 'binary');
      const bytes = await z.generateAsync({ type: 'uint8array' });
      const f = toFile(bytes, 'bad.zip', 'application/zip');
      await assert.rejects(
        () => zipImporterAdapter.inspectFile(f),
        /Từ chối tệp thực thi/i,
        `Should reject ${forbiddenName}`
      );
    }

    const manyFilesZip = new JSZip();
    for (let i = 0; i <= SECURITY_LIMITS.MAX_ZIP_FILE_COUNT + 1; i++) {
      manyFilesZip.file(`file-${i}.html`, '<p>ok</p>');
    }
    const manyBytes = await manyFilesZip.generateAsync({ type: 'uint8array' });
    const manyFile = toFile(manyBytes, 'many.zip', 'application/zip');
    await assert.rejects(
      () => zipImporterAdapter.inspectFile(manyFile),
      /quá nhiều tệp/i,
      'Should reject archive exceeding MAX_ZIP_FILE_COUNT'
    );

    const bombZip = new JSZip();
    bombZip.file('index.html', '<html></html>');
    const hugeZeroes = new Uint8Array(SECURITY_LIMITS.MAX_SINGLE_FILE_BYTES + 1024);
    bombZip.file('huge.txt', hugeZeroes, { compression: 'DEFLATE' });
    const bombBytes = await bombZip.generateAsync({ type: 'uint8array' });
    assert.ok(bombBytes.byteLength < 100 * 1024, 'Compressed bomb is small (<100KB)');
    const bombFile = toFile(bombBytes, 'bomb.zip', 'application/zip');
    await assert.rejects(
      () => zipImporterAdapter.inspectFile(bombFile),
      /10 MB/i,
      'Should reject compressed zip bomb exceeding single file uncompressed limit'
    );
  });

  await test('5. URL Validation at Every Persistence and Restore Boundary', async () => {
    const unsafeUrls = [
      'ftp://files.example.com/tool',
      'javascript:alert(document.domain)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'blob:https://example.com/123',
      'https://admin:secret@example.com/',
      'not-a-url',
    ];

    for (const badUrl of unsafeUrls) {
      assert.equal(validateExternalUrl(badUrl).valid, false);
      assert.throws(() => inspectExternalUrl(badUrl));

      await assert.rejects(() =>
        toolRepository.createTool({
          name: 'Bad URL Tool',
          description: 'Test',
          type: 'url',
          category: 'Test',
          tags: [],
          url: badUrl,
        })
      );
    }

    const validTool = await toolRepository.createTool({
      name: 'Example App',
      description: 'Valid HTTPS URL',
      type: 'url',
      category: 'Web',
      tags: ['example'],
      url: 'https://example.com/path',
    });
    assert.equal(validTool.url, 'https://example.com/path');

    for (const badUrl of unsafeUrls) {
      await assert.rejects(() =>
        toolRepository.updateToolMetadata(validTool.id, {
          name: 'Example App',
          description: 'Updated',
          category: 'Web',
          tags: [],
          favorite: false,
          version: '1.0.0',
          url: badUrl,
        })
      );
    }

    const maliciousBackup = JSON.stringify({
      schemaVersion: 1,
      app: 'YunzyHub',
      exportedAt: new Date().toISOString(),
      tools: [
        {
          ...validTool,
          id: 'evil-url-id',
          url: 'ftp://evil.example.com/',
        },
      ],
      files: [],
      preferences: [],
      workspace: [],
      history: [],
    });
    await assert.rejects(
      () => toolRepository.importVersionedBackup(maliciousBackup, 'merge'),
      /Giao thức "ftp:" bị từ chối/
    );
  });

  await test('6. IndexedDB Transaction Rollback & Preservation of Existing User Data', async () => {
    await toolRepository.clearAllData();
    await toolRepository.initializeIfNeeded();

    const customHtmlBytes = new TextEncoder().encode('<!DOCTYPE html><title>Custom</title><p>Hi</p>');
    const userTool = await toolRepository.createTool({
      name: 'Công Cụ Của Tôi',
      description: 'Dữ liệu quan trọng của người dùng',
      type: 'html',
      category: 'Cá nhân',
      tags: ['custom'],
      favorite: true,
      entryPath: 'index.html',
      files: [
        {
          path: 'index.html',
          mimeType: 'text/html',
          size: customHtmlBytes.byteLength,
          data: customHtmlBytes,
          isText: true,
          textContent: '<!DOCTYPE html><title>Custom</title><p>Hi</p>',
        },
      ],
    });

    await toolRepository.initializeIfNeeded();
    const toolsBefore = await db.tools.toArray();
    assert.equal(toolsBefore.length, 1);
    assert.equal(toolsBefore[0].id, userTool.id);

    await assert.rejects(async () => {
      await db.transaction('rw', [db.tools, db.toolFiles], async () => {
        await db.tools.delete(userTool.id);
        await db.toolFiles.where('toolId').equals(userTool.id).delete();
        throw new Error('Simulated transaction failure');
      });
    });

    const restoredTool = await db.tools.get(userTool.id);
    assert.ok(restoredTool, 'User tool manifest must survive rolled-back transaction');
    const restoredFiles = await toolRepository.getToolFiles(userTool.id);
    assert.equal(restoredFiles.length, 1, 'User tool file blob must survive rolled-back transaction');
  });

  await test('7. Versioned Backup Export/Import: Preserving Blobs, Preferences, Workspace & Rejecting Malformed Backups', async () => {
    await toolRepository.setPreference('theme', 'dark');
    await toolRepository.setPreference('libraryView', 'list');

    const allTools = await db.tools.toArray();
    const targetTool = allTools[0];
    await toolRepository.openToolInWorkspace(targetTool.id);

    const exported = await toolRepository.exportVersionedBackup();
    assert.equal(exported.schemaVersion, 1);
    assert.equal(exported.app, 'YunzyHub');
    assert.equal(exported.tools.length, 1);
    assert.equal(exported.files.length, 1);
    assert.equal(exported.workspace.length, 1);

    await toolRepository.clearAllData();
    assert.equal(await db.tools.count(), 0);

    const restoreRes = await toolRepository.importVersionedBackup(
      JSON.stringify(exported),
      'replace'
    );
    assert.equal(restoreRes.importedToolsCount, 1);
    assert.equal(restoreRes.importedFilesCount, 1);

    const restoredFiles = await toolRepository.getToolFiles(targetTool.id);
    assert.equal(restoredFiles.length, 1);
    assert.equal(restoredFiles[0].textContent, '<!DOCTYPE html><title>Custom</title><p>Hi</p>');

    const themePref = await db.preferences.get('theme');
    assert.equal(themePref?.value, 'dark');
    const viewPref = await db.preferences.get('libraryView');
    assert.equal(viewPref?.value, 'list');
    const wsTabs = await db.workspace.toArray();
    assert.equal(wsTabs.length, 1);
    assert.equal(wsTabs[0].toolId, targetTool.id);

    await assert.rejects(
      () =>
        toolRepository.importVersionedBackup(
          JSON.stringify({ ...exported, schemaVersion: 99 }),
          'merge'
        ),
      /schemaVersion=1/
    );

    await assert.rejects(
      () =>
        toolRepository.importVersionedBackup(
          JSON.stringify({
            ...exported,
            files: [{ ...exported.files[0], path: '../../etc/shadow' }],
          }),
          'merge'
        ),
      /Path Traversal/i
    );

    await assert.rejects(
      () =>
        toolRepository.importVersionedBackup(
          JSON.stringify({
            ...exported,
            files: [],
          }),
          'merge'
        ),
      /thiếu dữ liệu tệp đính kèm/
    );
  });

  await test('8. Legacy Sample Cleanup, Zero Sample Seeding, CRUD, Favorites, Workspace Multi-Tab Order & Cascade Deletion', async () => {
    // Verify legacy built-in sample tools are cleaned without touching user tools
    const now = new Date().toISOString();
    await db.preferences.delete('cleanedLegacySamples');
    await db.tools.put({
      id: LEGACY_SAMPLE_TOOL_IDS[0],
      name: 'Old Legacy Sample',
      description: 'Legacy sample',
      type: 'html',
      category: 'Sample',
      tags: [],
      favorite: false,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: null,
      entryPath: 'index.html',
      version: '1.0.0',
      sizeBytes: 10,
      fileCount: 1,
    });
    await db.workspace.put({
      id: LEGACY_SAMPLE_TOOL_IDS[0],
      toolId: LEGACY_SAMPLE_TOOL_IDS[0],
      openedAt: now,
      order: 99,
      reloadCount: 0,
    });

    await toolRepository.initializeIfNeeded();
    assert.equal(
      await db.tools.get(LEGACY_SAMPLE_TOOL_IDS[0]),
      undefined,
      'Legacy sample tool must be removed by one-time cleanup'
    );
    assert.equal(
      await db.workspace.get(LEGACY_SAMPLE_TOOL_IDS[0]),
      undefined,
      'Legacy sample workspace tab must be removed'
    );

    // User's existing custom tool from Test 7 must remain intact
    const toolsAfterCleanup = await db.tools.toArray();
    assert.equal(
      toolsAfterCleanup.length,
      1,
      'User tool must be preserved and no new sample tools should be seeded'
    );

    const htmlBytes = new TextEncoder().encode(
      '<!DOCTYPE html><html><head><title>Pomodoro</title></head><body><h1>Timer</h1></body></html>'
    );
    const createdZipTool = await toolRepository.createTool({
      name: 'Pomodoro Timer',
      description: 'Focus timer',
      type: 'zip',
      category: 'Năng suất',
      tags: ['timer'],
      favorite: false,
      version: '1.0.0',
      entryPath: 'index.html',
      files: [
        {
          path: 'index.html',
          mimeType: 'text/html',
          size: htmlBytes.byteLength,
          data: htmlBytes,
          isText: true,
          textContent: new TextDecoder().decode(htmlBytes),
        },
      ],
    });

    const initialFav = createdZipTool.favorite;
    const toggledFav = await toolRepository.toggleFavorite(createdZipTool.id);
    assert.equal(toggledFav, !initialFav);

    await assert.rejects(
      () =>
        toolRepository.updateToolMetadata(createdZipTool.id, {
          name: createdZipTool.name,
          description: createdZipTool.description,
          category: createdZipTool.category,
          tags: createdZipTool.tags,
          favorite: toggledFav,
          version: '2.0.0',
          entryPath: 'nonexistent.html',
        }),
      /không tồn tại/
    );

    const updatedPomo = await toolRepository.updateToolMetadata(createdZipTool.id, {
      name: 'Pomodoro Pro',
      description: createdZipTool.description,
      category: 'Năng suất cao',
      tags: ['pomodoro', 'vip'],
      favorite: true,
      version: '2.0.0',
      entryPath: 'index.html',
    });
    assert.equal(updatedPomo.name, 'Pomodoro Pro');
    assert.equal(updatedPomo.version, '2.0.0');

    await toolRepository.openToolInWorkspace(createdZipTool.id);
    const activePref = await db.preferences.get('activeTabId');
    assert.equal(activePref?.value, createdZipTool.id);

    const tabsBeforeDelete = await db.workspace.toArray();
    assert.equal(tabsBeforeDelete.length, 2);

    await toolRepository.deleteTool(createdZipTool.id);
    assert.equal(await db.tools.get(createdZipTool.id), undefined);
    assert.equal((await toolRepository.getToolFiles(createdZipTool.id)).length, 0);
    assert.equal(await db.workspace.get(createdZipTool.id), undefined);
  });

  await test('9. Static Security Audit of All <iframe Elements & PWA Build Artifacts', async () => {
    assert.equal(SANDBOX_IFRAME_PERMISSIONS, 'allow-scripts allow-downloads');

    const filesToAudit = [
      'src/adapters/runners/SandboxedHtmlRunner.tsx',
      'src/adapters/runners/ExternalUrlRunner.tsx',
      'src/components/ImportToolModal.tsx',
      'src/components/CodeEditorModal.tsx',
    ];

    for (const relPath of filesToAudit) {
      const content = fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf-8');
      const iframeTags = content.match(/<iframe[\s\S]*?\/>/g) || [];
      assert.ok(iframeTags.length > 0, `${relPath} must contain an <iframe /> element`);

      for (const tag of iframeTags) {
        assert.ok(
          tag.includes('sandbox="allow-scripts allow-downloads"'),
          `${relPath} iframe must have exact sandbox="allow-scripts allow-downloads"`
        );
        assert.ok(
          tag.includes('referrerPolicy="no-referrer"'),
          `${relPath} iframe must have referrerPolicy="no-referrer"`
        );
        assert.ok(
          !tag.includes('allow-same-origin'),
          `${relPath} iframe must NEVER include allow-same-origin`
        );
        assert.ok(
          !tag.includes('allow-top-navigation'),
          `${relPath} iframe must NEVER include allow-top-navigation`
        );
        assert.ok(
          !tag.includes('allow-popups'),
          `${relPath} iframe must NEVER include allow-popups`
        );
      }
    }

    const manifestPath = path.resolve(process.cwd(), 'dist/manifest.webmanifest');
    const swPath = path.resolve(process.cwd(), 'dist/sw.js');
    assert.ok(fs.existsSync(manifestPath), 'dist/manifest.webmanifest must exist');
    assert.ok(fs.existsSync(swPath), 'dist/sw.js must exist');

    const manifestJson = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    assert.equal(manifestJson.short_name, 'YunzyHub');
    assert.equal(manifestJson.display, 'standalone');
  });

  await test('10. UI Pages Rendering: Clean Interface, 4-Function iOS Blur Taskbar & Full-Viewport Mobile Workspace', async () => {
    // Verify exact 4 navigation items in exact requested order (Thư viện swapped with Không gian)
    assert.deepEqual(
      PRIMARY_NAV_ITEMS.map((item) => item.label),
      ['Home', 'Không gian', 'Tìm kiếm', 'Cài đặt'],
      'Taskbar must display exact 4 functions: Home, Không gian, Tìm kiếm, Cài đặt'
    );

    // Verify iOS floating rounded blur taskbar, fixed shell preventing dock drift, zoom lock, Hex Hub icon, system fonts, haptics & animations
    const indexHtmlSource = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
    assert.ok(indexHtmlSource.includes('viewport-fit=cover'), 'index.html must include viewport-fit=cover for iPhone safe-area insets');
    assert.ok(
      indexHtmlSource.includes('maximum-scale=1.0') && indexHtmlSource.includes('user-scalable=no'),
      'index.html must lock viewport scale and disable zoom'
    );
    assert.ok(
      indexHtmlSource.includes('sizes="180x180" href="/apple-touch-icon.png'),
      'index.html must reference 180x180 apple-touch-icon.png for Safari Add to Home Screen'
    );

    const indexCssSource = fs.readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf-8');
    assert.ok(
      indexCssSource.includes('-apple-system, BlinkMacSystemFont'),
      'CSS must use native system fonts'
    );
    assert.ok(
      indexCssSource.includes('bottom: max(0.75rem, calc(env(safe-area-inset-bottom, 0px) - 0.5rem));'),
      'Mobile dock must sit comfortably right above iPhone Home Indicator without floating too high'
    );
    assert.ok(indexCssSource.includes('touch-action: pan-x pan-y'), 'CSS must prevent pinch/double-tap zoom while keeping scroll smooth');
    assert.ok(indexCssSource.includes('.ios-top-safe'), 'Must define .ios-top-safe for Dynamic Island clearance');

    const mainTsxSource = fs.readFileSync(path.resolve(process.cwd(), 'src/main.tsx'), 'utf-8');
    assert.ok(mainTsxSource.includes('gesturestart'), 'main.tsx must guard against iOS Safari gesture pinch zoom');

    const hapticsSource = fs.readFileSync(path.resolve(process.cwd(), 'src/utils/haptics.ts'), 'utf-8');
    assert.ok(hapticsSource.includes('export const haptic'), 'Must provide tactile haptics utility');

    const appSource = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf-8');
    assert.ok(appSource.includes('fixed inset-0 h-[100dvh]'), 'App shell must be fixed full-viewport to stop iOS dock drifting');
    assert.ok(appSource.includes('searchInputRef'), 'App must wire double-tap Search icon to focus keyboard input');
    assert.ok(appSource.includes('CodeEditorModal'), 'App must wire in-app direct code editing modal');
    assert.ok(appSource.includes('rounded-[28px]'), 'Mobile taskbar must have iOS rounded corners');
    assert.ok(appSource.includes('backdrop-blur-2xl'), 'Mobile taskbar must have frosted blur');
    assert.ok(appSource.includes('grid-cols-4'), 'Mobile taskbar must lay out 4 equal columns');
    assert.ok(!appSource.includes('blur-3xl'), 'App must not contain AI ambient gradient blobs');
    assert.ok(appSource.includes('MotionConfig'), 'App must wrap animations in MotionConfig with reducedMotion="user"');
    assert.ok(appSource.includes('ios-dock-pill'), 'Mobile dock must include shared-element spring indicator');

    const htmlRunnerSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/adapters/runners/SandboxedHtmlRunner.tsx'),
      'utf-8'
    );
    assert.ok(
      !htmlRunnerSource.includes('min-h-[540px]') && !htmlRunnerSource.includes('min-h-[520px]'),
      'SandboxedHtmlRunner must not force rigid min-heights that clip/squeeze mobile viewports'
    );

    const tools = await db.tools.toArray();
    const workspaceTabs = await db.workspace.orderBy('order').toArray();

    // Dashboard: clean search + Thêm, no sample tools button, no marketing jargon
    const dashHtml = renderToStaticMarkup(
      React.createElement(DashboardPage, {
        tools,
        workspaceTabs,
        onLaunchTool: () => {},
        onToggleFavorite: () => {},
        onEditTool: () => {},
        onOpenImportModal: () => {},
        onNavigate: () => {},
      })
    );
    assert.ok(dashHtml.includes('placeholder="Tìm kiếm..."'), 'Dashboard must lead with compact search field');
    assert.ok(dashHtml.includes('Thêm'), 'Dashboard must include small Thêm button');
    assert.ok(!dashHtml.includes('Công cụ mẫu'), 'Dashboard must not offer sample tools');
    assert.ok(!dashHtml.includes('Local-First PWA'), 'Dashboard must not contain marketing jargon');

    // Empty Dashboard must also not include sample tools
    const emptyDashHtml = renderToStaticMarkup(
      React.createElement(DashboardPage, {
        tools: [],
        workspaceTabs: [],
        onLaunchTool: () => {},
        onToggleFavorite: () => {},
        onEditTool: () => {},
        onOpenImportModal: () => {},
        onNavigate: () => {},
      })
    );
    assert.ok(!emptyDashHtml.includes('Công cụ mẫu'), 'Empty dashboard must not render sample tools button');

    // Library Grid & List rendering
    const libGridHtml = renderToStaticMarkup(
      React.createElement(LibraryPage, {
        tools,
        workspaceTabs,
        viewMode: 'grid',
        onViewModeChange: () => {},
        onLaunchTool: () => {},
        onToggleFavorite: () => {},
        onEditTool: () => {},
        onOpenImportModal: () => {},
      })
    );
    const libListHtml = renderToStaticMarkup(
      React.createElement(LibraryPage, {
        tools,
        workspaceTabs,
        viewMode: 'list',
        onViewModeChange: () => {},
        onLaunchTool: () => {},
        onToggleFavorite: () => {},
        onEditTool: () => {},
        onOpenImportModal: () => {},
      })
    );
    assert.ok(libGridHtml.includes('Lọc'), 'Library must have collapsed Lọc button');
    assert.ok(libGridHtml.includes('Công Cụ Của Tôi'));
    assert.ok(libListHtml.includes('<table'));

    // Search: single search field + tiles
    const searchHtml = renderToStaticMarkup(
      React.createElement(SearchPage, {
        tools,
        workspaceTabs,
        onLaunchTool: () => {},
        onToggleFavorite: () => {},
        onEditTool: () => {},
      })
    );
    assert.ok(searchHtml.includes('type="search"'), 'SearchPage must render single search input');
    assert.ok(!searchHtml.includes('Thẻ phổ biến'), 'SearchPage must hide tag clouds');

    // Workspace: full-screen mobile container (fixed inset-0 h-[100dvh]) + back button + tablist
    const wsHtml = renderToStaticMarkup(
      React.createElement(WorkspacePage, {
        tools,
        workspaceTabs,
        activeTabId: workspaceTabs[0]?.id || null,
        onSelectTab: () => {},
        onCloseTab: () => {},
        onCloseAllTabs: () => {},
        onLaunchTool: () => {},
        onOpenImportModal: () => {},
        onNavigate: () => {},
      })
    );
    assert.ok(wsHtml.includes('fixed inset-0'), 'Workspace must fill full screen on mobile');
    assert.ok(wsHtml.includes('h-[100dvh]'), 'Workspace must use 100dvh height on mobile');
    assert.ok(wsHtml.includes('aria-label="Quay lại"'), 'Workspace must provide back button');
    assert.ok(wsHtml.includes('role="tablist"'), 'Workspace must render multi-tab list');
    assert.ok(wsHtml.includes('role="tabpanel"'), 'Workspace must render tabpanels');

    // Settings: clean short rows, no sample tools row, collapsed technical details
    const settingsHtml = renderToStaticMarkup(
      React.createElement(SettingsPage, {
        tools,
        theme: 'dark',
        onThemeChange: () => {},
      })
    );
    assert.ok(settingsHtml.includes('Giao diện'));
    assert.ok(settingsHtml.includes('Lưu trữ'));
    assert.ok(settingsHtml.includes('Sao lưu'));
    assert.ok(settingsHtml.includes('Khôi phục'));
    assert.ok(!settingsHtml.includes('Bộ công cụ mẫu'), 'Settings must not contain sample tools row');
    assert.ok(!settingsHtml.includes('default-src'), 'Raw CSP terms must be collapsed behind Info button by default');
  });

  await test('11. PDF Studio Compatibility: Opaque-Origin localStorage Startup, Local Vendored pdf-lib@1.17.1, Event Listeners & PDF Export Flow', async () => {
    const pdfStudioHtml = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <title>PDF Studio Pro</title>
  <script src="https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js"></script>
  <script>
    if (typeof window.PDFLib === "undefined") {
      document.write('<script src="https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js"><\\/script>');
    }
    if (typeof window.PDFLib === "undefined") {
      document.write('<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js"><\\/script>');
    }
  </script>
</head>
<body>
  <button id="uploadBtn" type="button">Chọn tệp PDF</button>
  <button id="exportBtn" type="button">Xuất PDF</button>
  <div id="summaryStatus">Chưa khởi tạo</div>
  <script>
    let pdfLibReady = false;
    let listenersAttached = false;
    let shortcutAttached = false;

    function setThemeMode(mode) {
      localStorage.setItem("pdf_studio_theme_mode", mode);
      document.documentElement.dataset.themeMode = mode;
    }

    function initTheme() {
      const savedMode = localStorage.getItem("pdf_studio_theme_mode") || "system";
      setThemeMode(savedMode);
    }

    function checkPdfLibLoaded() {
      pdfLibReady = Boolean(window.PDFLib && typeof window.PDFLib.PDFDocument === "function");
      document.documentElement.dataset.pdfLibReady = String(pdfLibReady);
    }

    function setupEventListeners() {
      const uploadBtn = document.getElementById("uploadBtn");
      uploadBtn.addEventListener("click", function() {
        localStorage.setItem("pdf_studio_last_action", "upload_clicked");
        document.getElementById("summaryStatus").textContent = "UPLOAD_READY_PASS";
      });

      const exportBtn = document.getElementById("exportBtn");
      exportBtn.addEventListener("click", async function() {
        const pdfDoc = await window.PDFLib.PDFDocument.create();
        const page = pdfDoc.addPage([200, 200]);
        page.drawText("YunzyHub PDF Studio Test");
        const bytes = await pdfDoc.save();
        window.__EXPORTED_PDF_BYTES__ = bytes;
        const blob = new Blob([bytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "pdf-studio-output.pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      });

      listenersAttached = true;
    }

    function setupKeyboardShortcuts() {
      shortcutAttached = true;
    }

    function updateSummary() {
      document.getElementById("summaryStatus").textContent =
        "INIT_COMPLETE:" + (pdfLibReady ? "PDFLIB_OK" : "NO_PDFLIB") + ":" + (listenersAttached ? "LISTENERS_OK" : "DEAD");
    }

    function init() {
      initTheme();
      checkPdfLibLoaded();
      setupEventListeners();
      setupKeyboardShortcuts();
      updateSummary();
    }

    init();
  </script>
</body>
</html>`;

    // 1. Inspect and persist tool without modifying stored HTML in IndexedDB
    const pdfFile = new File([pdfStudioHtml], 'pdf-studio.html', { type: 'text/html' });
    const inspection = await inspectImportedFile(pdfFile);
    assert.equal(
      inspection.warnings.length,
      0,
      'Recognized pdf-lib@1.17.1 CDN script should not trigger broken external CDN warning'
    );

    const createdTool = await toolRepository.createTool({
      name: inspection.suggestedName,
      description: inspection.suggestedDescription,
      type: 'html',
      category: 'Tài liệu',
      tags: ['pdf'],
      entryPath: inspection.defaultEntryPath,
      files: inspection.files,
    });

    // Verify stored HTML in IndexedDB is completely unchanged (runner-stage compatibility)
    const storedFiles = await toolRepository.getToolFiles(createdTool.id);
    assert.equal(storedFiles.length, 1);
    assert.equal(storedFiles[0].textContent, pdfStudioHtml, 'Original HTML in IndexedDB must remain unmodified');

    // Pre-seed per-tool localStorage in Hub IndexedDB to verify synchronous hydration
    await toolRepository.applyToolStorageMutation(createdTool.id, {
      op: 'set',
      key: 'pdf_studio_theme_mode',
      value: 'dark',
    });
    const hydratedSnapshot = await toolRepository.getToolStorage(createdTool.id);
    assert.equal(hydratedSnapshot.pdf_studio_theme_mode, 'dark');

    // 2. Compile at runner stage with compatibility options
    const capToken = 'cap-test-pdf-studio-token-123';
    const compiled = compilePackageToSrcDoc(storedFiles, createdTool.entryPath, {
      toolId: createdTool.id,
      capabilityToken: capToken,
      initialLocalStorage: hydratedSnapshot,
    });

    assert.deepEqual(
      compiled.vendoredLibraries,
      ['pdf-lib@1.17.1'],
      'Must detect and vendor pdf-lib@1.17.1 locally'
    );
    assert.ok(
      !compiled.srcDoc.includes('src="https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js"'),
      'External jsdelivr script src must be replaced by local vendored pdf-lib script'
    );

    // 3. Execute compiled srcDoc in a JSDOM instance with opaque-origin (about:blank) where native localStorage throws SecurityError
    const postedMessages: Array<Record<string, unknown>> = [];
    const runnerDom = new JSDOM(compiled.srcDoc, {
      url: 'about:blank',
      runScripts: 'dangerously',
      beforeParse(win: Window & typeof globalThis) {
        // Simulate parent postMessage bridge receiver
        Object.defineProperty(win, 'parent', {
          configurable: true,
          value: {
            postMessage(payload: Record<string, unknown>) {
              postedMessages.push(payload);
            },
          },
        });
        if (!win.URL.createObjectURL) {
          win.URL.createObjectURL = () => 'blob:null/mock-pdf-blob-id';
        }
        if (!win.URL.revokeObjectURL) {
          win.URL.revokeObjectURL = () => {};
        }
      },
    });

    const win = runnerDom.window;
    const doc = win.document;

    // Verify init() completed without SecurityError and hydrated saved theme mode
    assert.equal(doc.documentElement.dataset.themeMode, 'dark', 'initTheme() must read hydrated "dark" mode');
    assert.equal(doc.documentElement.dataset.pdfLibReady, 'true', 'window.PDFLib must be loaded synchronously');
    assert.equal(
      doc.getElementById('summaryStatus')?.textContent,
      'INIT_COMPLETE:PDFLIB_OK:LISTENERS_OK',
      'init() must reach setupEventListeners() and updateSummary()'
    );

    // Verify duplicate CDN fallback scripts were NOT injected via document.write
    const externalFallbackScripts = doc.querySelectorAll('script[src^="https://"]');
    assert.equal(
      externalFallbackScripts.length,
      0,
      'Duplicate unpkg/cdnjs document.write fallbacks must not inject external CDN script tags'
    );

    // Verify upload button event listener is alive and persists state via postMessage
    const uploadBtn = doc.getElementById('uploadBtn') as HTMLElement;
    uploadBtn.click();
    assert.equal(
      doc.getElementById('summaryStatus')?.textContent,
      'UPLOAD_READY_PASS',
      'Upload button click listener must execute after init()'
    );
    assert.equal(win.localStorage.getItem('pdf_studio_last_action'), 'upload_clicked');

    const storageSyncMsgs = postedMessages.filter((m) => m.type === '__YUNZY_STORAGE_SYNC__');
    assert.ok(storageSyncMsgs.length >= 2, 'Must emit __YUNZY_STORAGE_SYNC__ messages on setItem');
    const lastSync = storageSyncMsgs[storageSyncMsgs.length - 1];
    assert.equal(lastSync.toolId, createdTool.id);
    assert.equal(lastSync.token, capToken);
    assert.equal(lastSync.op, 'set');
    assert.equal(lastSync.key, 'pdf_studio_last_action');
    assert.equal(lastSync.value, 'upload_clicked');

    // Verify PDF generation with local vendored PDFLib and export download trigger
    const exportBtn = doc.getElementById('exportBtn') as HTMLElement;
    exportBtn.click();

    // Wait briefly for async PDFDocument.create() & save() to complete
    await new Promise((resolve) => setTimeout(resolve, 150));

    const exportedPdfBytes = win.__EXPORTED_PDF_BYTES__ as Uint8Array;
    assert.ok(exportedPdfBytes && exportedPdfBytes.byteLength > 100, 'PDFLib must generate valid PDF bytes');
    const pdfHeader = new TextDecoder().decode(exportedPdfBytes.slice(0, 5));
    assert.equal(pdfHeader, '%PDF-', 'Generated PDF bytes must begin with %PDF- header');

    const downloadMsgs = postedMessages.filter((m) => m.type === '__YUNZY_DOWNLOAD_TRIGGERED__');
    assert.equal(downloadMsgs.length, 1, 'Clicking <a download> must trigger download notification');
    assert.equal(downloadMsgs[0].filename, 'pdf-studio-output.pdf');
    assert.equal(downloadMsgs[0].hrefScheme, 'blob');
  });

  await test('12. Per-Tool Storage Isolation, Escaped Snapshot Safety, Quota Bounds & Backup Persistence', async () => {
    const htmlBytes = new TextEncoder().encode('<!DOCTYPE html><title>Tool</title><p>Test</p>');
    const toolA = await toolRepository.createTool({
      name: 'Tool A',
      description: 'First isolated tool',
      type: 'html',
      category: 'Test',
      tags: [],
      files: [
        {
          path: 'index.html',
          mimeType: 'text/html',
          size: htmlBytes.byteLength,
          data: htmlBytes,
          isText: true,
          textContent: '<!DOCTYPE html><title>Tool</title><p>Test</p>',
        },
      ],
    });
    const toolB = await toolRepository.createTool({
      name: 'Tool B',
      description: 'Second isolated tool',
      type: 'html',
      category: 'Test',
      tags: [],
      files: [
        {
          path: 'index.html',
          mimeType: 'text/html',
          size: htmlBytes.byteLength,
          data: htmlBytes,
          isText: true,
          textContent: '<!DOCTYPE html><title>Tool</title><p>Test</p>',
        },
      ],
    });

    const dangerousValue = '</script><script>window.__BREAKOUT_XSS__ = true;</script>';
    await toolRepository.applyToolStorageMutation(toolA.id, {
      op: 'set',
      key: 'user_note',
      value: dangerousValue,
    });
    await toolRepository.applyToolStorageMutation(toolB.id, {
      op: 'set',
      key: 'user_note',
      value: 'tool_b_secret',
    });

    const storageA = await toolRepository.getToolStorage(toolA.id);
    const storageB = await toolRepository.getToolStorage(toolB.id);
    assert.equal(storageA.user_note, dangerousValue);
    assert.equal(storageB.user_note, 'tool_b_secret');

    // Compile Tool A with its storage containing "</script>" and verify it cannot break out of inline script
    const filesA = await toolRepository.getToolFiles(toolA.id);
    const compiledA = compilePackageToSrcDoc(filesA, 'index.html', {
      toolId: toolA.id,
      capabilityToken: 'tok-a',
      initialLocalStorage: storageA,
    });
    assert.ok(
      !compiledA.srcDoc.includes('</script><script>window.__BREAKOUT_XSS__'),
      'Snapshot serializer must unicode-escape </script> sequences'
    );

    const domA = new JSDOM(compiledA.srcDoc, {
      url: 'about:blank',
      runScripts: 'dangerously',
    });
    assert.equal(domA.window.__BREAKOUT_XSS__, undefined, 'Must not execute breakout script');
    assert.equal(
      domA.window.localStorage.getItem('user_note'),
      dangerousValue,
      'Hydrated localStorage must preserve exact original string including </script>'
    );

    // Verify sessionStorage is isolated in memory and does not leak to localStorage
    domA.window.sessionStorage.setItem('temp_session_key', 'session_val_123');
    assert.equal(domA.window.sessionStorage.getItem('temp_session_key'), 'session_val_123');
    assert.equal(domA.window.localStorage.getItem('temp_session_key'), null);

    // Enforce key length and byte size limits in repository
    const oversizedKey = 'k'.repeat(300);
    await assert.rejects(
      () =>
        toolRepository.applyToolStorageMutation(toolA.id, {
          op: 'set',
          key: oversizedKey,
          value: '1',
        }),
      /vượt quá/
    );

    const oversizedValue = 'v'.repeat(1024 * 1024 + 500); // > 2 MB in UTF-16 bytes
    await assert.rejects(
      () =>
        toolRepository.applyToolStorageMutation(toolA.id, {
          op: 'set',
          key: 'huge',
          value: oversizedValue,
        }),
      /2 MB/
    );

    // Verify backup export/import preserves toolStorage and deleteTool cascades toolStorage
    const backup = await toolRepository.exportVersionedBackup();
    assert.ok(Array.isArray(backup.toolStorage) && backup.toolStorage.length >= 2);

    await toolRepository.deleteTool(toolB.id);
    assert.deepEqual(await toolRepository.getToolStorage(toolB.id), {});
  });

  await test('13. Graceful Runtime Diagnostics for Uncaught Tool Errors', async () => {
    const brokenHtml = `<!DOCTYPE html><html><head><title>Broken</title></head><body>
      <script>
        throw new Error("Simulated uncaught tool failure");
      </script>
    </body></html>`;
    const brokenBytes = new TextEncoder().encode(brokenHtml);
    const compiled = compilePackageToSrcDoc(
      [
        {
          path: 'index.html',
          mimeType: 'text/html',
          size: brokenBytes.byteLength,
          data: brokenBytes,
          isText: true,
          textContent: brokenHtml,
        },
      ],
      'index.html',
      {
        toolId: 'diag-tool-1',
        capabilityToken: 'diag-token-999',
        initialLocalStorage: {},
      }
    );

    const diagnosticsReceived: Array<Record<string, unknown>> = [];
    new JSDOM(compiled.srcDoc, {
      url: 'about:blank',
      runScripts: 'dangerously',
      beforeParse(win: Window & typeof globalThis) {
        Object.defineProperty(win, 'parent', {
          configurable: true,
          value: {
            postMessage(payload: Record<string, unknown>) {
              if (payload && payload.type === '__YUNZY_RUNTIME_DIAGNOSTIC__') {
                diagnosticsReceived.push(payload);
              }
            },
          },
        });
      },
    });

    assert.equal(diagnosticsReceived.length, 1, 'Uncaught error in tool must emit diagnostic message');
    assert.equal(diagnosticsReceived[0].toolId, 'diag-tool-1');
    assert.equal(diagnosticsReceived[0].token, 'diag-token-999');
    assert.ok(
      String(diagnosticsReceived[0].message).includes('Simulated uncaught tool failure'),
      'Diagnostic message must include readable error cause'
    );
  });

  console.log(`\nALL ${passed} AUTOMATED INTEGRATION TEST SUITES PASSED SUCCESSFULLY!`);
}

runAllTests().catch((err) => {
  console.error(err);
  process.exit(1);
});

