import React from 'react';
import type { ToolManifest } from '../../types/models';
import { ExternalUrlRunner } from './ExternalUrlRunner';
import { FileDocumentRunner } from './FileDocumentRunner';
import { SandboxedHtmlRunner } from './SandboxedHtmlRunner';

interface ToolRunnerHostProps {
  tool: ToolManifest;
  reloadTrigger: number;
  onReloadRequest: () => void;
  onEditCode?: () => void;
}

/**
 * Modular Runner Adapter Dispatcher:
 * Routes execution based on ToolManifest.type without requiring UI changes.
 */
export const ToolRunnerHost: React.FC<ToolRunnerHostProps> = ({
  tool,
  reloadTrigger,
  onReloadRequest,
  onEditCode,
}) => {
  switch (tool.type) {
    case 'html':
    case 'zip':
      return (
        <SandboxedHtmlRunner
          tool={tool}
          reloadTrigger={reloadTrigger}
          onReloadRequest={onReloadRequest}
        />
      );
    case 'url':
      return (
        <ExternalUrlRunner
          tool={tool}
          reloadTrigger={reloadTrigger}
          onReloadRequest={onReloadRequest}
        />
      );
    case 'file':
      return (
        <FileDocumentRunner
          tool={tool}
          reloadTrigger={reloadTrigger}
          onEditCode={onEditCode}
        />
      );
    default:
      return null;
  }
};
