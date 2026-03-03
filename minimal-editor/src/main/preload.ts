import { contextBridge, ipcRenderer, webUtils } from 'electron';

export interface ElectronAPI {
  // File operations
  openFile(): Promise<{ filePath: string; content: string }[] | null>;
  saveFile(filePath: string, content: string): Promise<boolean>;
  saveFileAs(defaultName: string, content: string): Promise<{ filePath: string } | null>;
  readFile(filePath: string): Promise<{ filePath: string; content: string } | null>;

  // Dialogs
  showUnsavedDialog(fileName: string): Promise<'save' | 'delete' | 'cancel'>;

  // Window controls
  forceClose(): void;
  minimizeWindow(): void;
  maximizeWindow(): void;

  // Events from main
  onBeforeClose(callback: () => void): void;

  // Utilities
  getFilePathFromDrop(file: File): string;

  // Platform
  platform: string;
}

contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  openFile: () => ipcRenderer.invoke('file:open'),
  saveFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('file:save', filePath, content),
  saveFileAs: (defaultName: string, content: string) =>
    ipcRenderer.invoke('file:save-as', defaultName, content),
  readFile: (filePath: string) => ipcRenderer.invoke('file:read', filePath),

  // Dialogs
  showUnsavedDialog: (fileName: string) =>
    ipcRenderer.invoke('dialog:unsaved', fileName),

  // Window controls
  forceClose: () => ipcRenderer.send('window:force-close'),
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),

  // Events from main
  onBeforeClose: (callback: () => void) => {
    ipcRenderer.on('app:before-close', () => callback());
  },

  // Utilities
  getFilePathFromDrop: (file: File) => webUtils.getPathForFile(file),

  // Platform
  platform: process.platform,
} satisfies ElectronAPI);
