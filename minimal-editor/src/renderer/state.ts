// ── Types ─────────────────────────────────────────────────────────────

export interface Tab {
  id: string;
  title: string;
  content: string;
  filePath: string | null;
  savedContent: string;
  customTitle?: boolean;
}

export type EditorFontId = 'courier-new' | 'merriweather' | 'inter' | 'system-sans';

export interface EditorFontInfo {
  id: EditorFontId;
  displayName: string;
  category: string;
  cssFontFamily: string;
}

export const FONT_OPTIONS: EditorFontInfo[] = [
  { id: 'courier-new', displayName: 'Courier New', category: 'Mono, classic', cssFontFamily: '"Courier New", "Courier", monospace' },
  { id: 'merriweather', displayName: 'Merriweather', category: 'Serif, literary', cssFontFamily: '"Merriweather", "Georgia", serif' },
  { id: 'inter', displayName: 'Inter', category: 'Sans, clean', cssFontFamily: '"Inter", "Helvetica Neue", sans-serif' },
  { id: 'system-sans', displayName: 'System Sans', category: 'Sans, native', cssFontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
];

export type AppEvent =
  | 'tabs-changed'
  | 'active-tab-changed'
  | 'content-changed'
  | 'theme-changed'
  | 'font-changed'
  | 'welcome-changed'
  | 'settings-panel-changed';

// ── App State ─────────────────────────────────────────────────────────

export class AppState {
  tabs: Tab[] = [];
  activeTabId: string = '';
  isDarkMode: boolean = true;
  selectedFontId: EditorFontId = 'courier-new';
  fontSize: number = 16;
  showWelcome: boolean = false;
  welcomeIsStartup: boolean = false;
  dontShowWelcome: boolean = false;
  showSettings: boolean = false;

  private listeners: Map<AppEvent, Set<() => void>> = new Map();

  constructor() {
    // Restore persisted settings
    this.isDarkMode = localStorage.getItem('isDarkMode') !== 'false';
    const savedFont = localStorage.getItem('selectedFont') as EditorFontId | null;
    if (savedFont && FONT_OPTIONS.some((f) => f.id === savedFont)) {
      this.selectedFontId = savedFont;
    }
    const savedSize = localStorage.getItem('fontSize');
    if (savedSize) {
      const size = parseInt(savedSize, 10);
      if (size >= 12 && size <= 28) this.fontSize = size;
    }
    this.dontShowWelcome = localStorage.getItem('dontShowWelcome') === 'true';

    // Create first tab
    const first = this.createTab();
    this.tabs = [first];
    this.activeTabId = first.id;

    // Show welcome on startup
    if (!this.dontShowWelcome) {
      this.showWelcome = true;
      this.welcomeIsStartup = true;
    }
  }

  // ── Events ──────────────────────────────────────────────────────────

  on(event: AppEvent, callback: () => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  emit(event: AppEvent): void {
    this.listeners.get(event)?.forEach((cb) => cb());
  }

  emit_welcome(): void {
    this.emit('welcome-changed');
  }

  // ── Tab helpers ─────────────────────────────────────────────────────

  private createTab(title = 'Untitled', content = '', filePath: string | null = null): Tab {
    return {
      id: crypto.randomUUID(),
      title,
      content,
      filePath,
      savedContent: content,
    };
  }

  get activeTab(): Tab | undefined {
    return this.tabs.find((t) => t.id === this.activeTabId);
  }

  get selectedFont(): EditorFontInfo {
    return FONT_OPTIONS.find((f) => f.id === this.selectedFontId) || FONT_OPTIONS[0];
  }

  // ── Tab operations ──────────────────────────────────────────────────

  addTab(): void {
    const tab = this.createTab();
    this.tabs.push(tab);
    this.activeTabId = tab.id;
    this.emit('tabs-changed');
    this.emit('active-tab-changed');
  }

  switchTab(id: string): void {
    if (id === this.activeTabId) return;
    this.activeTabId = id;
    this.emit('active-tab-changed');
  }

  closeTab(id: string): void {
    if (this.tabs.length <= 1) return;
    const index = this.tabs.findIndex((t) => t.id === id);
    if (index === -1) return;

    const wasActive = id === this.activeTabId;
    this.tabs.splice(index, 1);

    if (wasActive) {
      const newIndex = Math.min(index, this.tabs.length - 1);
      this.activeTabId = this.tabs[newIndex].id;
      this.emit('active-tab-changed');
    }
    this.emit('tabs-changed');
  }

  selectPreviousTab(): void {
    if (this.tabs.length <= 1) return;
    const index = this.tabs.findIndex((t) => t.id === this.activeTabId);
    const prev = index > 0 ? index - 1 : this.tabs.length - 1;
    this.activeTabId = this.tabs[prev].id;
    this.emit('active-tab-changed');
  }

  selectNextTab(): void {
    if (this.tabs.length <= 1) return;
    const index = this.tabs.findIndex((t) => t.id === this.activeTabId);
    const next = index < this.tabs.length - 1 ? index + 1 : 0;
    this.activeTabId = this.tabs[next].id;
    this.emit('active-tab-changed');
  }

  // ── Content ─────────────────────────────────────────────────────────

  updateContent(content: string): void {
    const tab = this.activeTab;
    if (!tab) return;
    tab.content = content;

    // Auto-derive title for unsaved documents
    if (!tab.filePath && !tab.customTitle) {
      const firstLine = content.split('\n')[0] || '';
      let clean = firstLine.replace(/^#+\s*/, '').trim();
      if (!clean) {
        tab.title = 'Untitled';
      } else {
        const words = clean.split(/\s+/).slice(0, 5).join(' ');
        tab.title = words.substring(0, 30);
      }
    }

    this.emit('content-changed');
    this.emit('tabs-changed');
  }

  // ── File operations ─────────────────────────────────────────────────

  openFileIntoTab(filePath: string, content: string): void {
    // Check if already open
    const existing = this.tabs.find((t) => t.filePath === filePath);
    if (existing) {
      this.activeTabId = existing.id;
      this.emit('active-tab-changed');
      return;
    }

    const name = filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'Untitled';
    const tab = this.createTab(name, content, filePath);
    this.tabs.push(tab);
    this.activeTabId = tab.id;
    this.emit('tabs-changed');
    this.emit('active-tab-changed');
  }

  markSaved(filePath?: string): void {
    const tab = this.activeTab;
    if (!tab) return;
    if (filePath) {
      tab.filePath = filePath;
      tab.title = filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || tab.title;
    }
    tab.savedContent = tab.content;
    this.emit('tabs-changed');
  }

  // ── Settings ────────────────────────────────────────────────────────

  setDarkMode(value: boolean): void {
    this.isDarkMode = value;
    localStorage.setItem('isDarkMode', String(value));
    this.emit('theme-changed');
  }

  toggleDarkMode(): void {
    this.setDarkMode(!this.isDarkMode);
  }

  setFont(fontId: EditorFontId): void {
    this.selectedFontId = fontId;
    localStorage.setItem('selectedFont', fontId);
    this.emit('font-changed');
  }

  setFontSize(size: number): void {
    this.fontSize = Math.max(12, Math.min(28, size));
    localStorage.setItem('fontSize', String(this.fontSize));
    this.emit('font-changed');
  }

  toggleWelcome(): void {
    this.showWelcome = !this.showWelcome;
    if (this.showWelcome) this.welcomeIsStartup = false;
    this.emit('welcome-changed');
  }

  setDontShowWelcome(value: boolean): void {
    this.dontShowWelcome = value;
    localStorage.setItem('dontShowWelcome', String(value));
  }

  renameTab(tabId: string, newTitle: string): void {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    tab.title = newTitle || 'Untitled';
    tab.customTitle = true;
    this.emit('tabs-changed');
  }

  toggleSettings(): void {
    this.showSettings = !this.showSettings;
    this.emit('settings-panel-changed');
  }

  // ── Computed ────────────────────────────────────────────────────────

  wordCount(): number {
    const content = this.activeTab?.content || '';
    if (!content.trim()) return 0;
    return content.split(/\s+/).filter((w) => w.length > 0).length;
  }

  charCount(): number {
    return this.activeTab?.content.length || 0;
  }

  hasUnsavedTabs(): boolean {
    return this.tabs.some((t) => t.content !== t.savedContent);
  }
}
