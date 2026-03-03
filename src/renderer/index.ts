import './styles.css';
import { AppState, FONT_OPTIONS, EditorFontId } from './state';
import {
  createEditor,
  saveCurrentTab,
  saveCurrentTabAs,
  openFile,
  closeTabWithSaveCheck,
  handleBeforeClose,
} from './editor';
import { EditorView } from '@codemirror/view';

declare global {
  interface Window {
    electronAPI: {
      openFile(): Promise<{ filePath: string; content: string }[] | null>;
      saveFile(filePath: string, content: string): Promise<boolean>;
      saveFileAs(defaultName: string, content: string): Promise<{ filePath: string } | null>;
      readFile(filePath: string): Promise<{ filePath: string; content: string } | null>;
      showUnsavedDialog(fileName: string): Promise<'save' | 'delete' | 'cancel'>;
      forceClose(): void;
      minimizeWindow(): void;
      maximizeWindow(): void;
      onBeforeClose(callback: () => void): void;
      getFilePathFromDrop(file: File): string;
      platform: string;
    };
  }
}

// ── Initialize ────────────────────────────────────────────────────────

const state = new AppState();

// Set up the editor
const editorContainer = document.getElementById('editor-container')!;
const editorView = createEditor(editorContainer, state);

// Platform-specific setup
const isMac = window.electronAPI.platform === 'darwin';
const modKey = isMac ? '⌘' : 'Ctrl';

// Show/hide window controls based on platform
const windowControls = document.getElementById('window-controls')!;
const toolbarSpacer = document.getElementById('toolbar-spacer')!;
if (isMac) {
  windowControls.style.display = 'none';
} else {
  // No traffic lights on Linux/Windows, remove spacer
  toolbarSpacer.style.width = '16px';
  document.body.classList.add('has-window-controls');
}

// ── Theme ─────────────────────────────────────────────────────────────

function applyTheme(): void {
  document.documentElement.setAttribute('data-theme', state.isDarkMode ? 'dark' : 'light');

  // Update theme toggle icons
  const iconSun = document.getElementById('icon-sun')!;
  const iconMoon = document.getElementById('icon-moon')!;
  iconSun.style.display = state.isDarkMode ? '' : 'none';
  iconMoon.style.display = state.isDarkMode ? 'none' : '';

  // Update tooltip
  const btnTheme = document.getElementById('btn-theme')!;
  btnTheme.title = state.isDarkMode ? 'Light Mode' : 'Dark Mode';
}

applyTheme();
state.on('theme-changed', applyTheme);

// ── Tabs ──────────────────────────────────────────────────────────────

const tabsContainer = document.getElementById('tabs-container')!;
const btnScrollLeft = document.getElementById('btn-scroll-left')!;
const btnScrollRight = document.getElementById('btn-scroll-right')!;

function updateScrollArrows(): void {
  const { scrollLeft, scrollWidth, clientWidth } = tabsContainer;
  const hasOverflow = scrollWidth > clientWidth + 1;
  const atStart = scrollLeft <= 1;
  const atEnd = scrollLeft + clientWidth >= scrollWidth - 1;

  btnScrollLeft.classList.toggle('hidden', !hasOverflow || atStart);
  btnScrollRight.classList.toggle('hidden', !hasOverflow || atEnd);
}

function renderTabs(): void {
  tabsContainer.innerHTML = '';

  state.tabs.forEach((tab) => {
    const tabEl = document.createElement('div');
    tabEl.className = 'tab' + (tab.id === state.activeTabId ? ' active' : '');
    tabEl.dataset.tabId = tab.id;

    const titleEl = document.createElement('span');
    titleEl.className = 'tab-title';
    titleEl.textContent = tab.title;
    tabEl.appendChild(titleEl);

    const dot = document.createElement('span');
    dot.className = 'tab-save-dot';
    const isUnsaved = tab.content !== tab.savedContent;
    if (!isUnsaved) dot.classList.add('saved');
    tabEl.appendChild(dot);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTabWithSaveCheck(state, tab.id, editorView);
    });
    tabEl.appendChild(closeBtn);

    tabEl.addEventListener('click', () => {
      state.switchTab(tab.id);
    });

    tabsContainer.appendChild(tabEl);
  });

  // Update scroll arrows after rendering tabs
  requestAnimationFrame(updateScrollArrows);
}

// Scroll arrow click handlers
btnScrollLeft.addEventListener('click', () => {
  tabsContainer.scrollBy({ left: -150, behavior: 'smooth' });
});

btnScrollRight.addEventListener('click', () => {
  tabsContainer.scrollBy({ left: 150, behavior: 'smooth' });
});

// Update arrows on scroll
tabsContainer.addEventListener('scroll', updateScrollArrows);

// Update arrows on window resize
window.addEventListener('resize', updateScrollArrows);

renderTabs();
state.on('tabs-changed', renderTabs);
state.on('active-tab-changed', renderTabs);

// New tab button
document.getElementById('btn-new-tab')!.addEventListener('click', () => {
  state.addTab();
});

// ── Status Bar ────────────────────────────────────────────────────────

const wordCountEl = document.getElementById('word-count')!;
const charCountEl = document.getElementById('char-count')!;

function updateStatusBar(): void {
  const wc = state.wordCount();
  const cc = state.charCount();
  wordCountEl.textContent = `${wc} word${wc !== 1 ? 's' : ''}`;
  charCountEl.textContent = `${cc} character${cc !== 1 ? 's' : ''}`;
}


updateStatusBar();
state.on('content-changed', () => {
  updateStatusBar();
  renderTabs();
});
state.on('active-tab-changed', updateStatusBar);
state.on('save-status-changed', renderTabs);

// ── Settings Panel ────────────────────────────────────────────────────

const settingsPanel = document.getElementById('settings-panel')!;
const btnSettings = document.getElementById('btn-settings')!;
const fontList = document.getElementById('font-list')!;
const fontSizeSlider = document.getElementById('font-size-slider') as HTMLInputElement;
const fontSizeValue = document.getElementById('font-size-value')!;

function renderFontList(): void {
  fontList.innerHTML = '';
  FONT_OPTIONS.forEach((font) => {
    const row = document.createElement('div');
    row.className = 'font-row' + (state.selectedFontId === font.id ? ' selected' : '');

    const info = document.createElement('div');
    info.className = 'font-row-info';

    const name = document.createElement('div');
    name.className = 'font-row-name';
    name.textContent = font.displayName;

    const category = document.createElement('div');
    category.className = 'font-row-category';
    category.textContent = font.category;

    info.appendChild(name);
    info.appendChild(category);
    row.appendChild(info);

    if (state.selectedFontId === font.id) {
      const check = document.createElement('span');
      check.className = 'font-row-check';
      check.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      row.appendChild(check);
    }

    row.addEventListener('click', () => {
      state.setFont(font.id);
      renderFontList();
    });

    fontList.appendChild(row);
  });
}

function updateFontSizeUI(): void {
  fontSizeSlider.value = String(state.fontSize);
  fontSizeValue.textContent = `${state.fontSize} pt`;
}

renderFontList();
updateFontSizeUI();

fontSizeSlider.addEventListener('input', () => {
  state.setFontSize(parseInt(fontSizeSlider.value, 10));
  updateFontSizeUI();
});

function toggleSettings(): void {
  state.toggleSettings();
}

function applySettingsVisibility(): void {
  settingsPanel.classList.toggle('hidden', !state.showSettings);
  btnSettings.classList.toggle('active', state.showSettings);
}

btnSettings.addEventListener('click', toggleSettings);
state.on('settings-panel-changed', applySettingsVisibility);
state.on('font-changed', () => {
  renderFontList();
  updateFontSizeUI();
});

// Close settings when clicking outside
document.addEventListener('click', (e) => {
  if (state.showSettings && !settingsPanel.contains(e.target as Node) && e.target !== btnSettings && !btnSettings.contains(e.target as Node)) {
    state.showSettings = false;
    applySettingsVisibility();
  }
});

// ── Welcome Modal ─────────────────────────────────────────────────────

const welcomeOverlay = document.getElementById('welcome-overlay')!;
const welcomeTitle = document.getElementById('welcome-title')!;
const welcomeSubtitle = document.getElementById('welcome-subtitle')!;
const shortcutsList = document.getElementById('shortcuts-list')!;
const dontShowAgain = document.getElementById('dont-show-again') as HTMLInputElement;
const welcomeToggle = document.getElementById('welcome-toggle')!;

const shortcuts = [
  {
    section: 'Formatting',
    items: [
      { keys: 'B', action: 'Bold' },
      { keys: 'I', action: 'Italic' },
      { keys: 'U', action: 'Underline' },
      { keys: 'E', action: 'Inline code' },
      { keys: 'K', action: 'Link' },
    ],
  },
  {
    section: 'Headings & Lists',
    items: [
      { keys: '1', action: 'Heading 1' },
      { keys: '2', action: 'Heading 2' },
      { keys: '3', action: 'Heading 3' },
      { keys: '4', action: 'Heading 4' },
      { keys: 'L', action: 'List' },
    ],
  },
  {
    section: 'File',
    items: [
      { keys: 'T', action: 'New tab' },
      { keys: 'N', action: 'New tab' },
      { keys: 'W', action: 'Close tab' },
      { keys: 'S', action: 'Save' },
      { keys: '⇧S', action: 'Save as' },
      { keys: 'O', action: 'Open' },
    ],
  },
  {
    section: 'Navigation',
    items: [
      { keys: '⌥←', action: 'Previous tab' },
      { keys: '⌥→', action: 'Next tab' },
    ],
  },
  {
    section: 'View',
    items: [
      { keys: '+', action: 'Increase font size' },
      { keys: '−', action: 'Decrease font size' },
      { keys: '⇧D', action: 'Toggle dark / light mode' },
      { keys: '⇧T', action: 'Typography settings' },
      { keys: '/', action: 'Show this window' },
    ],
  },
];

function renderShortcuts(): void {
  shortcutsList.innerHTML = '';
  shortcuts.forEach((section) => {
    const sectionEl = document.createElement('div');
    sectionEl.className = 'shortcut-section';

    const header = document.createElement('div');
    header.className = 'shortcut-section-header';
    header.textContent = section.section;
    sectionEl.appendChild(header);

    section.items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'shortcut-row';

      const badge = document.createElement('span');
      badge.className = 'shortcut-badge';
      badge.innerHTML = `<span class="shortcut-mod">${modKey}</span><span>${item.keys}</span>`;
      row.appendChild(badge);

      const action = document.createElement('span');
      action.className = 'shortcut-action';
      action.textContent = item.action;
      row.appendChild(action);

      sectionEl.appendChild(row);
    });

    shortcutsList.appendChild(sectionEl);
  });
}

renderShortcuts();

function applyWelcomeVisibility(): void {
  welcomeOverlay.classList.toggle('hidden', !state.showWelcome);
  if (state.showWelcome) {
    welcomeTitle.textContent = state.welcomeIsStartup ? 'Welcome to minimal' : 'minimal';
    welcomeSubtitle.textContent = state.welcomeIsStartup
      ? 'A minimalist text editor where formatting lives in keyboard shortcuts.'
      : 'A guide to your minimalist editor';
    welcomeToggle.style.display = state.welcomeIsStartup ? '' : 'none';
    dontShowAgain.checked = state.dontShowWelcome;
  }
}

applyWelcomeVisibility();
state.on('welcome-changed', applyWelcomeVisibility);

// Welcome interactions
document.getElementById('btn-welcome-done')!.addEventListener('click', () => {
  state.showWelcome = false;
  state.emit_welcome();
});

welcomeOverlay.addEventListener('click', (e) => {
  if (e.target === welcomeOverlay) {
    state.showWelcome = false;
    state.emit_welcome();
  }
});

dontShowAgain.addEventListener('change', () => {
  state.setDontShowWelcome(dontShowAgain.checked);
});

// ── Theme toggle button ───────────────────────────────────────────────

document.getElementById('btn-theme')!.addEventListener('click', () => {
  state.toggleDarkMode();
});

// ── Help button ───────────────────────────────────────────────────────

document.getElementById('btn-help')!.addEventListener('click', () => {
  state.welcomeIsStartup = false;
  state.showWelcome = true;
  state.emit_welcome();
});

// ── Window controls ───────────────────────────────────────────────────

document.getElementById('btn-minimize')?.addEventListener('click', () => {
  window.electronAPI.minimizeWindow();
});

document.getElementById('btn-maximize')?.addEventListener('click', () => {
  window.electronAPI.maximizeWindow();
});

document.getElementById('btn-close')?.addEventListener('click', () => {
  handleBeforeClose(state, editorView);
});

// ── Keyboard shortcuts (global, outside CodeMirror) ───────────────────

document.addEventListener('keydown', (e) => {
  const mod = isMac ? e.metaKey : e.ctrlKey;

  if (mod && e.key === 's' && !e.shiftKey) {
    e.preventDefault();
    saveCurrentTab(state, editorView);
  }
  if (mod && e.key === 's' && e.shiftKey) {
    e.preventDefault();
    saveCurrentTabAs(state, editorView);
  }
  if (mod && e.key === 'o') {
    e.preventDefault();
    openFile(state);
  }
  if (mod && e.key === 'w') {
    e.preventDefault();
    closeTabWithSaveCheck(state, state.activeTabId, editorView);
  }
  // Escape closes modals
  if (e.key === 'Escape') {
    if (state.showWelcome) {
      state.showWelcome = false;
      state.emit_welcome();
    }
    if (state.showSettings) {
      state.showSettings = false;
      applySettingsVisibility();
    }
  }
});

// ── Before-close handler from main process ────────────────────────────

window.electronAPI.onBeforeClose(() => {
  handleBeforeClose(state, editorView);
});

// ── Drag and drop ─────────────────────────────────────────────────────

document.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
});

document.addEventListener('drop', async (e) => {
  e.preventDefault();
  e.stopPropagation();

  const files = e.dataTransfer?.files;
  if (!files) return;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['txt', 'md', 'markdown', 'mdown', 'text'].includes(ext)) continue;

    const filePath = window.electronAPI.getFilePathFromDrop(file);
    if (!filePath) continue;

    const result = await window.electronAPI.readFile(filePath);
    if (result) {
      state.openFileIntoTab(result.filePath, result.content);
    }
  }
});

// ── Focus editor on start ─────────────────────────────────────────────

editorView.focus();
