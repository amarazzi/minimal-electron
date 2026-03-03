import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;
let isForceClosing = false;

function createWindow(): void {
  isForceClosing = false;
  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 400,
    frame: isMac,
    titleBarStyle: isMac ? 'hiddenInset' : undefined,
    trafficLightPosition: isMac ? { x: 16, y: 16 } : undefined,
    transparent: !isMac,
    backgroundColor: isMac ? '#1c1c1e' : undefined,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Intercept Cmd/Ctrl +/- to prevent Chromium zoom and forward to renderer for font size
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const mod = process.platform === 'darwin' ? input.meta : input.control;
    if (mod && !input.shift && !input.alt) {
      if (input.key === '-' || input.key === '=' || input.key === '+') {
        event.preventDefault();
        mainWindow?.webContents.send('font-size-shortcut', input.key);
      }
    }
  });

  mainWindow.on('close', (e) => {
    if (!isForceClosing) {
      e.preventDefault();
      mainWindow?.webContents.send('app:before-close');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── IPC: File operations ──────────────────────────────────────────────

ipcMain.handle('file:open', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Document',
    filters: [
      { name: 'Text Files', extensions: ['txt', 'md', 'markdown', 'mdown', 'text'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile', 'multiSelections'],
  });

  if (result.canceled) return null;

  const files = result.filePaths.map((filePath) => {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { filePath, content };
  });

  return files;
});

ipcMain.handle('file:save', async (_event, filePath: string, content: string) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('file:save-as', async (_event, defaultName: string, content: string) => {
  if (!mainWindow) return null;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Document',
    defaultPath: defaultName,
    filters: [
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'Markdown', extensions: ['md'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (result.canceled || !result.filePath) return null;

  try {
    fs.writeFileSync(result.filePath, content, 'utf-8');
    return { filePath: result.filePath };
  } catch {
    return null;
  }
});

ipcMain.handle('file:read', async (_event, filePath: string) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { filePath, content };
  } catch {
    return null;
  }
});

// ── IPC: Dialogs ──────────────────────────────────────────────────────

ipcMain.handle('dialog:unsaved', async (_event, fileName: string) => {
  if (!mainWindow) return 'cancel';
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Unsaved Changes',
    message: `Do you want to save "${fileName}"?`,
    detail: 'Your changes will be lost if you don\'t save them.',
    buttons: ['Save', 'Delete', 'Cancel'],
    defaultId: 0,
    cancelId: 2,
  });

  return (['save', 'delete', 'cancel'] as const)[result.response];
});

// ── IPC: Window controls ──────────────────────────────────────────────

ipcMain.on('window:force-close', () => {
  isForceClosing = true;
  mainWindow?.close();
});

ipcMain.on('shell:open-external', (_event, url: string) => {
  shell.openExternal(url);
});

ipcMain.on('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

// ── App lifecycle ─────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();

  const isMac = process.platform === 'darwin';
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
