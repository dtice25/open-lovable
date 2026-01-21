// Global types for sandbox file management
import type { Sandbox } from 'computesdk';

export interface SandboxFile {
  content: string;
  lastModified: number;
}

export interface SandboxFileCache {
  files: Record<string, SandboxFile>;
  lastSync: number;
  sandboxId: string;
  manifest?: any; // FileManifest type from file-manifest.ts
}

export interface SandboxState {
  fileCache: SandboxFileCache | null;
  sandboxData: {
    sandboxId: string;
    url: string;
  } | null;
}

// Declare global types
declare global {
  var activeSandbox: Sandbox | null;
  var sandboxState: SandboxState;
  var existingFiles: Set<string>;
}

export {};