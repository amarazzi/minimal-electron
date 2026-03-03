import { EditorState, Compartment, Extension, Transaction } from '@codemirror/state';
import {
  EditorView,
  keymap,
  ViewPlugin,
  ViewUpdate,
  Decoration,
  DecorationSet,
  WidgetType,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxTree } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { AppState } from './state';
import TurndownService from 'turndown';

// ── Compartments for dynamic reconfiguration ──────────────────────────

const themeCompartment = new Compartment();
const fontCompartment = new Compartment();

// ── Turndown service for paste conversion ─────────────────────────────

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  strongDelimiter: '**',
});

// ── Theme builders ────────────────────────────────────────────────────

function buildTheme(isDark: boolean): Extension {
  const bg = isDark ? '#1e1e1e' : '#ffffff';
  const fg = isDark ? '#e0e0e4' : '#1c1c1e';
  const muted = isDark ? '#555' : '#aaa';
  const cursor = isDark ? '#fff' : '#333';
  const selection = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
  const activeLine = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)';
  const codeBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const codeColor = isDark ? '#f5a0a0' : '#c44040';
  const linkColor = isDark ? '#6ba3d6' : '#0066cc';
  const headingColor = isDark ? '#f0f0f2' : '#111';
  const quoteColor = isDark ? '#888' : '#777';

  return EditorView.theme(
    {
      '&': {
        backgroundColor: bg,
        color: fg,
        fontSize: '16px',
        flex: '1',
      },
      '.cm-content': {
        caretColor: cursor,
        padding: '36px 0',
        maxWidth: '100%',
      },
      '.cm-line': {
        lineHeight: '1.75',
        padding: '1px 0',
      },
      '&.cm-focused .cm-cursor': {
        borderLeftColor: cursor,
        borderLeftWidth: '2px',
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
        backgroundColor: selection + ' !important',
      },
      '.cm-activeLine': {
        backgroundColor: activeLine,
      },
      '.cm-gutters': {
        display: 'none',
      },
      '.cm-scroller': {
        overflow: 'auto',
      },
      // ── Markdown decoration classes ──
      '.md-bold': {
        fontWeight: '700',
      },
      '.md-italic': {
        fontStyle: 'italic',
      },
      '.md-bold-italic': {
        fontWeight: '700',
        fontStyle: 'italic',
      },
      '.md-marker': {
        color: muted,
        fontWeight: 'normal',
        fontStyle: 'normal',
      },
      '.md-code': {
        fontFamily: '"Courier New", "Fira Code", monospace',
        fontSize: '0.9em',
        color: codeColor,
        backgroundColor: codeBg,
        borderRadius: '3px',
        padding: '1px 4px',
      },
      '.md-code-block': {
        fontFamily: '"Courier New", "Fira Code", monospace',
        fontSize: '0.9em',
        color: codeColor,
        backgroundColor: codeBg,
      },
      '.md-link-text': {
        color: linkColor,
      },
      '.md-link-url': {
        color: muted,
        fontSize: '0.9em',
      },
      '.md-heading': {
        fontWeight: '700',
        color: headingColor,
      },
      '.md-h1': { fontSize: '1.7em', lineHeight: '1.4' },
      '.md-h2': { fontSize: '1.45em', lineHeight: '1.4' },
      '.md-h3': { fontSize: '1.25em', lineHeight: '1.4' },
      '.md-h4': { fontSize: '1.1em', lineHeight: '1.4' },
      '.md-blockquote': {
        color: quoteColor,
        fontStyle: 'italic',
        borderLeft: `2px solid ${muted}`,
        paddingLeft: '12px',
      },
      '.md-hr': {
        color: muted,
      },
    },
    { dark: isDark }
  );
}

function buildFontExtension(fontFamily: string, fontSize: number): Extension {
  return EditorView.theme({
    '&': {
      fontSize: fontSize + 'px',
    },
    '.cm-content': {
      fontFamily: fontFamily,
    },
    '.cm-scroller': {
      fontFamily: fontFamily,
    },
  });
}

// ── Markdown Decorations Plugin ───────────────────────────────────────

const markerDeco = Decoration.mark({ class: 'md-marker' });
const boldDeco = Decoration.mark({ class: 'md-bold' });
const italicDeco = Decoration.mark({ class: 'md-italic' });
const boldItalicDeco = Decoration.mark({ class: 'md-bold-italic' });
const codeDeco = Decoration.mark({ class: 'md-code' });
const codeBlockDeco = Decoration.mark({ class: 'md-code-block' });
const linkTextDeco = Decoration.mark({ class: 'md-link-text' });
const linkUrlDeco = Decoration.mark({ class: 'md-link-url' });
const blockquoteDeco = Decoration.mark({ class: 'md-blockquote' });
const hrDeco = Decoration.mark({ class: 'md-hr' });
const h1Deco = Decoration.mark({ class: 'md-heading md-h1' });
const h2Deco = Decoration.mark({ class: 'md-heading md-h2' });
const h3Deco = Decoration.mark({ class: 'md-heading md-h3' });
const h4Deco = Decoration.mark({ class: 'md-heading md-h4' });

function buildDecorations(view: EditorView): DecorationSet {
  const decorations: { from: number; to: number; deco: Decoration }[] = [];
  const tree = syntaxTree(view.state);
  const doc = view.state.doc;

  tree.iterate({
    enter(node) {
      const { from, to, name } = node;

      // Headings
      if (name === 'ATXHeading1' || name === 'ATXHeading2' || name === 'ATXHeading3' || name === 'ATXHeading4') {
        const headingDeco =
          name === 'ATXHeading1' ? h1Deco :
          name === 'ATXHeading2' ? h2Deco :
          name === 'ATXHeading3' ? h3Deco : h4Deco;
        decorations.push({ from, to, deco: headingDeco });
      }

      // Heading markers (# symbols)
      if (name === 'HeaderMark') {
        // Include the space after the marker
        const afterMark = Math.min(to + 1, doc.length);
        decorations.push({ from, to: afterMark, deco: markerDeco });
      }

      // Bold (**text**)
      if (name === 'StrongEmphasis') {
        decorations.push({ from, to, deco: boldDeco });
      }

      // Italic (*text*)
      if (name === 'Emphasis') {
        decorations.push({ from, to, deco: italicDeco });
      }

      // Emphasis markers (* or **)
      if (name === 'EmphasisMark') {
        decorations.push({ from, to, deco: markerDeco });
      }

      // Inline code
      if (name === 'InlineCode') {
        decorations.push({ from, to, deco: codeDeco });
      }

      // Code marks (backticks)
      if (name === 'CodeMark') {
        decorations.push({ from, to, deco: markerDeco });
      }

      // Fenced code blocks
      if (name === 'FencedCode') {
        decorations.push({ from, to, deco: codeBlockDeco });
      }

      if (name === 'CodeInfo') {
        decorations.push({ from, to, deco: markerDeco });
      }

      // Links [text](url)
      if (name === 'Link') {
        // We'll style sub-parts individually
      }
      if (name === 'LinkMark') {
        decorations.push({ from, to, deco: markerDeco });
      }
      // Link label text gets link color
      if (name === 'LinkLabel') {
        // The content between [ and ] - skip the brackets themselves
        if (to - from > 2) {
          decorations.push({ from: from + 1, to: to - 1, deco: linkTextDeco });
        }
      }
      if (name === 'URL') {
        decorations.push({ from, to, deco: linkUrlDeco });
      }

      // Blockquotes
      if (name === 'Blockquote') {
        decorations.push({ from, to, deco: blockquoteDeco });
      }
      if (name === 'QuoteMark') {
        decorations.push({ from, to, deco: markerDeco });
      }

      // List markers
      if (name === 'ListMark') {
        decorations.push({ from, to, deco: markerDeco });
      }

      // Horizontal rules
      if (name === 'HorizontalRule') {
        decorations.push({ from, to, deco: hrDeco });
      }
    },
  });

  // Use Decoration.set with sort flag to handle ordering
  return Decoration.set(
    decorations.map((d) => d.deco.range(d.from, d.to)),
    true
  );
}

const markdownDecoPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.startState.facet(EditorView.darkTheme) !== update.state.facet(EditorView.darkTheme)) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

// ── Auto-continue lists extension ─────────────────────────────────────

function autoListContinuation(view: EditorView): boolean {
  const { state } = view;
  const { from } = state.selection.main;
  const line = state.doc.lineAt(from);
  const lineText = line.text;

  // Numbered list: "1. ", "2. ", "10. " etc.
  const numberedMatch = lineText.match(/^(\d+)\.\s/);
  if (numberedMatch) {
    const prefix = numberedMatch[0];
    // If line is only the prefix (empty item), remove it
    if (lineText.trim() === prefix.trim()) {
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: '' },
      });
      return true;
    }
    const nextNum = parseInt(numberedMatch[1], 10) + 1;
    view.dispatch({
      changes: { from, to: from, insert: '\n' + nextNum + '. ' },
      selection: { anchor: from + String(nextNum).length + 3 }, // \n + num + ". "
    });
    return true;
  }

  // Bullet list: "- " or "* "
  const bulletMatch = lineText.match(/^([-*])\s/);
  if (bulletMatch) {
    const prefix = bulletMatch[0];
    if (lineText.trim() === prefix.trim()) {
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: '' },
      });
      return true;
    }
    view.dispatch({
      changes: { from, to: from, insert: '\n' + prefix },
      selection: { anchor: from + 1 + prefix.length },
    });
    return true;
  }

  return false;
}

// ── Formatting helpers ────────────────────────────────────────────────

function wrapSelection(view: EditorView, marker: string, endMarker?: string): boolean {
  const closing = endMarker || marker;
  const { from, to } = view.state.selection.main;

  if (from < to) {
    const selected = view.state.sliceDoc(from, to);

    // Check if already wrapped → unwrap
    if (!endMarker && selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= marker.length * 2) {
      const inner = selected.slice(marker.length, -marker.length);
      view.dispatch({
        changes: { from, to, insert: inner },
        selection: { anchor: from, head: from + inner.length },
      });
      return true;
    }

    const wrapped = marker + selected + closing;
    view.dispatch({
      changes: { from, to, insert: wrapped },
      selection: { anchor: from + marker.length, head: from + marker.length + selected.length },
    });
  } else {
    // No selection — insert markers and place cursor between
    const insertion = marker + closing;
    view.dispatch({
      changes: { from, to: from, insert: insertion },
      selection: { anchor: from + marker.length },
    });
  }
  return true;
}

function toggleLinePrefix(view: EditorView, prefix: string): boolean {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const lineText = line.text;

  const allPrefixes = ['#### ', '### ', '## ', '# ', '- ', '> '];
  let currentPrefix: string | null = null;
  for (const p of allPrefixes) {
    if (lineText.startsWith(p)) {
      currentPrefix = p;
      break;
    }
  }

  if (currentPrefix === prefix) {
    // Toggle off
    view.dispatch({
      changes: { from: line.from, to: line.from + prefix.length, insert: '' },
    });
  } else if (currentPrefix) {
    // Replace existing prefix
    view.dispatch({
      changes: { from: line.from, to: line.from + currentPrefix.length, insert: prefix },
    });
  } else {
    // Add prefix
    view.dispatch({
      changes: { from: line.from, to: line.from, insert: prefix },
    });
  }
  return true;
}

// ── Rich text paste handler ───────────────────────────────────────────

function handlePaste(view: EditorView, event: ClipboardEvent): boolean {
  const clipboardData = event.clipboardData;
  if (!clipboardData) return false;

  // Try HTML first
  const html = clipboardData.getData('text/html');
  if (html) {
    const md = turndown.turndown(html);
    if (md.trim()) {
      const { from, to } = view.state.selection.main;
      view.dispatch({
        changes: { from, to, insert: md },
      });
      return true;
    }
  }

  return false; // Let default paste handle plain text
}

// ── Build formatting keybindings ──────────────────────────────────────

function buildFormattingKeymap(state: AppState) {
  return keymap.of([
    {
      key: 'Mod-b',
      run: (view) => wrapSelection(view, '**'),
    },
    {
      key: 'Mod-i',
      run: (view) => wrapSelection(view, '*'),
    },
    {
      key: 'Mod-u',
      run: (view) => wrapSelection(view, '__'),
    },
    {
      key: 'Mod-e',
      run: (view) => wrapSelection(view, '`'),
    },
    {
      key: 'Mod-k',
      run: (view) => wrapSelection(view, '[', '](url)'),
    },
    {
      key: 'Mod-1',
      run: (view) => toggleLinePrefix(view, '# '),
    },
    {
      key: 'Mod-2',
      run: (view) => toggleLinePrefix(view, '## '),
    },
    {
      key: 'Mod-3',
      run: (view) => toggleLinePrefix(view, '### '),
    },
    {
      key: 'Mod-4',
      run: (view) => toggleLinePrefix(view, '#### '),
    },
    {
      key: 'Mod-l',
      run: (view) => toggleLinePrefix(view, '- '),
    },
    {
      key: 'Enter',
      run: (view) => autoListContinuation(view),
    },
    // Tab navigation
    {
      key: 'Mod-Alt-ArrowLeft',
      run: () => { state.selectPreviousTab(); return true; },
    },
    {
      key: 'Mod-Alt-ArrowRight',
      run: () => { state.selectNextTab(); return true; },
    },
    // File operations
    {
      key: 'Mod-n',
      run: () => { state.addTab(); return true; },
    },
    {
      key: 'Mod-t',
      run: () => { state.addTab(); return true; },
      preventDefault: true,
    },
    {
      key: 'Mod-/',
      run: () => { state.toggleWelcome(); return true; },
    },
    {
      key: 'Mod-Shift-t',
      run: () => { state.toggleSettings(); return true; },
      preventDefault: true,
    },
    {
      key: 'Mod-Shift-d',
      run: () => { state.toggleDarkMode(); return true; },
    },
    // Font size
    {
      key: 'Mod-=',
      run: () => { state.setFontSize(state.fontSize + 1); return true; },
    },
    {
      key: 'Mod--',
      run: () => { state.setFontSize(state.fontSize - 1); return true; },
    },
  ]);
}

// ── Create Editor ─────────────────────────────────────────────────────

export function createEditor(container: HTMLElement, state: AppState): EditorView {
  const extensions: Extension[] = [
    history(),
    buildFormattingKeymap(state),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    markdownDecoPlugin,
    EditorView.lineWrapping,
    themeCompartment.of(buildTheme(state.isDarkMode)),
    fontCompartment.of(buildFontExtension(state.selectedFont.cssFontFamily, state.fontSize)),
    EditorView.domEventHandlers({
      paste: (event, view) => handlePaste(view, event),
    }),
    EditorView.updateListener.of((update: ViewUpdate) => {
      if (update.docChanged) {
        state.updateContent(update.state.doc.toString());
      }
    }),
  ];

  const view = new EditorView({
    state: EditorState.create({
      doc: state.activeTab?.content || '',
      extensions,
    }),
    parent: container,
  });

  // React to state changes
  state.on('theme-changed', () => {
    view.dispatch({
      effects: themeCompartment.reconfigure(buildTheme(state.isDarkMode)),
    });
  });

  state.on('font-changed', () => {
    view.dispatch({
      effects: fontCompartment.reconfigure(
        buildFontExtension(state.selectedFont.cssFontFamily, state.fontSize)
      ),
    });
  });

  state.on('active-tab-changed', () => {
    const tab = state.activeTab;
    if (!tab) return;
    const currentContent = view.state.doc.toString();
    if (currentContent !== tab.content) {
      view.dispatch({
        changes: { from: 0, to: currentContent.length, insert: tab.content },
      });
    }
    view.focus();
  });

  return view;
}

// ── Save / close helpers (use electron API) ───────────────────────────

export async function saveCurrentTab(state: AppState, view: EditorView): Promise<boolean> {
  const api = (window as any).electronAPI;
  const tab = state.activeTab;
  if (!tab) return false;

  // Sync content from editor
  tab.content = view.state.doc.toString();

  if (tab.filePath) {
    const ok = await api.saveFile(tab.filePath, tab.content);
    if (ok) {
      state.markSaved();
      return true;
    }
  } else {
    return saveCurrentTabAs(state, view);
  }
  return false;
}

export async function saveCurrentTabAs(state: AppState, view: EditorView): Promise<boolean> {
  const api = (window as any).electronAPI;
  const tab = state.activeTab;
  if (!tab) return false;

  tab.content = view.state.doc.toString();
  const result = await api.saveFileAs(tab.title + '.txt', tab.content);
  if (result) {
    state.markSaved(result.filePath);
    return true;
  }
  return false;
}

export async function openFile(state: AppState): Promise<void> {
  const api = (window as any).electronAPI;
  const files = await api.openFile();
  if (!files) return;
  for (const file of files) {
    state.openFileIntoTab(file.filePath, file.content);
  }
}

export async function closeTabWithSaveCheck(state: AppState, tabId: string, view: EditorView): Promise<boolean> {
  const api = (window as any).electronAPI;
  const tab = state.tabs.find((t) => t.id === tabId);
  if (!tab) return false;

  if (tab.content !== tab.savedContent) {
    const result = await api.showUnsavedDialog(tab.title);
    if (result === 'save') {
      // Save first
      const prevActive = state.activeTabId;
      state.switchTab(tabId);
      const saved = await saveCurrentTab(state, view);
      if (!saved) {
        state.switchTab(prevActive);
        return false;
      }
    } else if (result === 'cancel') {
      return false;
    }
    // 'delete' falls through to close
  }

  state.closeTab(tabId);
  return true;
}

export async function handleBeforeClose(state: AppState, view: EditorView): Promise<void> {
  const api = (window as any).electronAPI;
  const unsavedTabs = state.tabs.filter((t) => t.content !== t.savedContent);

  if (unsavedTabs.length === 0) {
    api.forceClose();
    return;
  }

  // For each unsaved tab, ask
  for (const tab of unsavedTabs) {
    const result = await api.showUnsavedDialog(tab.title);
    if (result === 'save') {
      state.switchTab(tab.id);
      // Sync editor content
      tab.content = view.state.doc.toString();
      if (tab.filePath) {
        await api.saveFile(tab.filePath, tab.content);
      } else {
        const saveResult = await api.saveFileAs(tab.title + '.txt', tab.content);
        if (!saveResult) return; // User cancelled
      }
    } else if (result === 'cancel') {
      return; // Don't close
    }
    // 'delete' continues
  }

  api.forceClose();
}
