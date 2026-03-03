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
  const bg = isDark ? '#1c1c1e' : '#fafafa';
  const fg = isDark ? '#e0e0e4' : '#1c1c1e';
  const muted = isDark ? '#555' : '#aaa';
  const cursor = isDark ? '#fff' : '#333';
  const selection = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
  const activeLine = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)';
  const codeBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const codeColor = isDark ? '#f5a0a0' : '#c44040';
  const linkColor = isDark ? '#4da3ff' : '#0066cc';
  const headingColor = isDark ? '#f0f0f2' : '#111';
  const quoteColor = isDark ? '#888' : '#777';

  return EditorView.theme(
    {
      '&': {
        backgroundColor: bg,
        color: fg,
        flex: '1',
      },
      '.cm-content': {
        caretColor: cursor,
        fontFamily: 'inherit',
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
        fontFamily: 'inherit',
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
        textDecoration: 'underline',
        cursor: 'pointer',
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

  const hideDeco = Decoration.replace({});

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

      // Heading markers (# symbols + trailing space) – always hide
      if (name === 'HeaderMark') {
        const markText = doc.sliceString(from, to);
        if (markText[0] === '#') {
          let afterMark = to;
          if (to < doc.length && doc.sliceString(to, to + 1) === ' ') afterMark = to + 1;
          decorations.push({ from, to: afterMark, deco: hideDeco });
        } else {
          // Setext underlines – keep muted
          decorations.push({ from, to, deco: markerDeco });
        }
      }

      // Bold (**text**)
      if (name === 'StrongEmphasis') {
        decorations.push({ from, to, deco: boldDeco });
      }

      // Italic (*text*)
      if (name === 'Emphasis') {
        decorations.push({ from, to, deco: italicDeco });
      }

      // Emphasis markers (* or **) – always hide
      if (name === 'EmphasisMark') {
        decorations.push({ from, to, deco: hideDeco });
      }

      // Inline code
      if (name === 'InlineCode') {
        decorations.push({ from, to, deco: codeDeco });
      }

      // Code marks (backticks) – hide inline, keep fenced muted
      if (name === 'CodeMark') {
        const text = doc.sliceString(from, to);
        if (text.length >= 3) {
          decorations.push({ from, to, deco: markerDeco });
        } else {
          decorations.push({ from, to, deco: hideDeco });
        }
      }

      // Fenced code blocks
      if (name === 'FencedCode') {
        decorations.push({ from, to, deco: codeBlockDeco });
      }

      if (name === 'CodeInfo') {
        decorations.push({ from, to, deco: markerDeco });
      }

      // Links [text](url) – hide syntax, style link text
      if (name === 'Link') {
        // Walk children to find LinkMark and URL positions
        const linkNode = node.node;
        const c = linkNode.cursor();
        let firstMarkEnd = -1; // end of '['
        let secondMarkFrom = -1; // start of ']'
        let markCount = 0;
        if (c.firstChild()) {
          do {
            if (c.name === 'LinkMark') {
              markCount++;
              decorations.push({ from: c.from, to: c.to, deco: hideDeco });
              if (markCount === 1) firstMarkEnd = c.to;
              if (markCount === 2) secondMarkFrom = c.from;
            }
            if (c.name === 'URL') {
              decorations.push({ from: c.from, to: c.to, deco: hideDeco });
            }
          } while (c.nextSibling());
        }
        // Style the link text (between [ and ])
        if (firstMarkEnd >= 0 && secondMarkFrom > firstMarkEnd) {
          decorations.push({ from: firstMarkEnd, to: secondMarkFrom, deco: linkTextDeco });
        }
        return false; // don't descend into Link children again
      }
      if (name === 'LinkLabel') {
        if (to - from > 2) {
          decorations.push({ from: from + 1, to: to - 1, deco: linkTextDeco });
        }
      }

      // Blockquotes
      if (name === 'Blockquote') {
        decorations.push({ from, to, deco: blockquoteDeco });
      }
      if (name === 'QuoteMark') {
        let end = to;
        if (end < doc.length && doc.sliceString(end, end + 1) === ' ') end++;
        decorations.push({ from, to: end, deco: hideDeco });
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
      if (update.docChanged || update.viewportChanged ||
          update.startState.facet(EditorView.darkTheme) !== update.state.facet(EditorView.darkTheme)) {
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

  // No selection → insert markers and place cursor between
  if (from >= to) {
    view.dispatch({
      changes: { from, to: from, insert: marker + closing },
      selection: { anchor: from + marker.length },
    });
    return true;
  }

  // Try syntax-tree–based unwrap for symmetric markers (bold, italic, code, underline)
  if (!endMarker) {
    const nodeType = (marker === '**' || marker === '__') ? 'StrongEmphasis'
                   : marker === '*' ? 'Emphasis'
                   : marker === '`' ? 'InlineCode' : '';
    const markName = marker === '`' ? 'CodeMark' : 'EmphasisMark';

    if (nodeType) {
      const tree = syntaxTree(view.state);
      const fmtNodes: { from: number; to: number }[] = [];
      tree.iterate({ from, to, enter(node) {
        if (node.name === nodeType && node.to > from && node.from < to) {
          fmtNodes.push({ from: node.from, to: node.to });
        }
      }});

      if (fmtNodes.length > 0) {
        fmtNodes.sort((a, b) => a.from - b.from);
        // Check that all non-whitespace text in selection is covered by formatting nodes
        let covered = true;
        let pos = from;
        for (const fn of fmtNodes) {
          if (fn.from > pos) {
            const gap = view.state.sliceDoc(pos, Math.min(fn.from, to));
            if (gap.replace(/\s/g, '').length > 0) { covered = false; break; }
          }
          pos = Math.max(pos, fn.to);
        }
        if (covered && pos < to) {
          const gap = view.state.sliceDoc(pos, to);
          if (gap.replace(/\s/g, '').length > 0) covered = false;
        }

        if (covered) {
          // UNWRAP: remove all matching marker nodes from these formatting ranges
          const changes: { from: number; to: number; insert: string }[] = [];
          for (const fn of fmtNodes) {
            tree.iterate({ from: fn.from, to: fn.to, enter(child) {
              if (child.name === markName) {
                const text = view.state.sliceDoc(child.from, child.to);
                if (text === marker || text === closing) {
                  changes.push({ from: child.from, to: child.to, insert: '' });
                }
              }
            }});
          }
          changes.sort((a, b) => a.from - b.from);
          if (changes.length > 0) {
            view.dispatch({ changes });
            return true;
          }
        }
      }
    }
  }

  // WRAP the selection
  const selected = view.state.sliceDoc(from, to);

  // Multi-paragraph: wrap each paragraph individually so the parser recognises them
  if (!endMarker && selected.includes('\n\n')) {
    const parts = selected.split(/(\n\n+)/);
    let result = '';
    for (const part of parts) {
      if (/^\n\n+$/.test(part)) {
        result += part;
      } else if (part.trim()) {
        // Keep closing marker right after text, not after trailing newlines
        const trailingMatch = part.match(/(\n+)$/);
        const trailing = trailingMatch ? trailingMatch[1] : '';
        const content = trailing ? part.slice(0, -trailing.length) : part;
        result += marker + content + closing + trailing;
      } else {
        result += part;
      }
    }
    view.dispatch({
      changes: { from, to, insert: result },
      selection: { anchor: from, head: from + result.length },
    });
    return true;
  }

  // Single selection wrap
  const wrapped = marker + selected + closing;
  view.dispatch({
    changes: { from, to, insert: wrapped },
    selection: { anchor: from + marker.length, head: from + marker.length + selected.length },
  });
  return true;
}

// ── Link prompt (Cmd+K) ─────────────────────────────────────────────

let activeLinkPrompt: HTMLElement | null = null;

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return trimmed; // already has protocol
  return 'https://' + trimmed;
}

function dismissLinkPrompt(): void {
  if (activeLinkPrompt) {
    activeLinkPrompt.remove();
    activeLinkPrompt = null;
  }
}

/** Find Link node info at a given document position. Returns null if pos is not inside a Link. */
function findLinkAt(view: EditorView, pos: number): {
  linkFrom: number; linkTo: number;
  textFrom: number; textTo: number;
  urlFrom: number; urlTo: number;
} | null {
  const tree = syntaxTree(view.state);
  let result: ReturnType<typeof findLinkAt> = null;
  tree.iterate({ from: pos, to: pos + 1, enter(node) {
    if (node.name === 'Link') {
      let textFrom = node.from, textTo = node.from;
      let urlFrom = node.to, urlTo = node.to;
      let markCount = 0;
      const c = node.node.cursor();
      if (c.firstChild()) {
        do {
          if (c.name === 'LinkMark') {
            markCount++;
            if (markCount === 1) textFrom = c.to;   // after '['
            if (markCount === 2) textTo = c.from;    // before ']'
          }
          if (c.name === 'URL') {
            urlFrom = c.from;
            urlTo = c.to;
          }
        } while (c.nextSibling());
      }
      result = { linkFrom: node.from, linkTo: node.to, textFrom, textTo, urlFrom, urlTo };
    }
  }});
  return result;
}

function showLinkPrompt(view: EditorView): boolean {
  dismissLinkPrompt();

  const { from, to } = view.state.selection.main;
  const existing = findLinkAt(view, from);

  return showLinkPromptAt(view, from, to, existing);
}

function handleLinkDblClick(view: EditorView, event: MouseEvent): boolean {
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (pos === null) return false;

  const existing = findLinkAt(view, pos);
  if (!existing) return false;

  // Check the click is on the link text (between [ and ])
  if (pos < existing.textFrom || pos > existing.textTo) return false;

  event.preventDefault();
  dismissLinkPrompt();
  return showLinkPromptAt(view, pos, pos, existing);
}

function showLinkPromptAt(
  view: EditorView,
  from: number,
  to: number,
  existing: ReturnType<typeof findLinkAt>,
): boolean {
  const hasExistingLink = existing !== null;
  const linkFrom = existing?.linkFrom ?? -1;
  const linkTo = existing?.linkTo ?? -1;
  const linkTextFrom = existing?.textFrom ?? -1;
  const linkTextTo = existing?.textTo ?? -1;
  const linkUrlFrom = existing?.urlFrom ?? -1;
  const linkUrlTo = existing?.urlTo ?? -1;

  // Position the tooltip near the selection
  const posForCoords = hasExistingLink ? linkTextFrom : from;
  const coords = view.coordsAtPos(posForCoords);
  if (!coords) return true;

  const editorRect = view.dom.getBoundingClientRect();

  const prompt = document.createElement('div');
  prompt.className = 'link-prompt';

  const input = document.createElement('input');
  input.className = 'link-prompt-input';
  input.type = 'text';
  input.placeholder = 'Paste or type a link...';

  if (hasExistingLink) {
    input.value = view.state.sliceDoc(linkUrlFrom, linkUrlTo);
  }

  prompt.appendChild(input);

  // Add Open + Remove buttons if editing existing link
  if (hasExistingLink) {
    const openBtn = document.createElement('button');
    openBtn.className = 'link-prompt-remove';
    openBtn.textContent = 'Open';
    openBtn.addEventListener('click', () => {
      const currentUrl = normalizeUrl(input.value);
      if (currentUrl) {
        const api = (window as any).electronAPI;
        if (api?.openExternal) api.openExternal(currentUrl);
      }
    });
    prompt.appendChild(openBtn);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'link-prompt-remove';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      const linkText = view.state.sliceDoc(linkTextFrom, linkTextTo);
      view.dispatch({
        changes: { from: linkFrom, to: linkTo, insert: linkText },
      });
      dismissLinkPrompt();
      view.focus();
    });
    prompt.appendChild(removeBtn);
  }

  // Position
  const left = coords.left - editorRect.left;
  const top = coords.bottom - editorRect.top + 4;
  prompt.style.left = left + 'px';
  prompt.style.top = top + 'px';

  view.dom.style.position = 'relative';
  view.dom.appendChild(prompt);
  activeLinkPrompt = prompt;

  input.focus();

  const isEditing = hasExistingLink;
  const commit = () => {
    const url = normalizeUrl(input.value);
    if (!url) {
      // If editing existing link and cleared URL, remove the link
      if (isEditing) {
        const linkText = view.state.sliceDoc(linkTextFrom, linkTextTo);
        view.dispatch({
          changes: { from: linkFrom, to: linkTo, insert: linkText },
        });
      }
      dismissLinkPrompt();
      view.focus();
      return;
    }

    if (isEditing) {
      // Update URL of existing link
      view.dispatch({
        changes: { from: linkUrlFrom, to: linkUrlTo, insert: url },
      });
    } else if (from < to) {
      // Wrap selected text as link
      const selectedText = view.state.sliceDoc(from, to);
      view.dispatch({
        changes: { from, to, insert: '[' + selectedText + '](' + url + ')' },
      });
    } else {
      // No selection — insert link with URL as text
      const linkText = '[' + url + '](' + url + ')';
      view.dispatch({
        changes: { from, to: from, insert: linkText },
      });
    }
    dismissLinkPrompt();
    view.focus();
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      dismissLinkPrompt();
      view.focus();
    }
    e.stopPropagation();
  });

  // Close on click outside
  const outsideHandler = (e: MouseEvent) => {
    if (!prompt.contains(e.target as Node)) {
      dismissLinkPrompt();
      document.removeEventListener('mousedown', outsideHandler);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', outsideHandler), 0);

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

// ── Click-to-open links ───────────────────────────────────────────────

function handleLinkClick(view: EditorView, event: MouseEvent): boolean {
  // Only open on Cmd+click (Mac) or Ctrl+click (Windows/Linux)
  const isMac = navigator.platform.includes('Mac');
  if (!(isMac ? event.metaKey : event.ctrlKey)) return false;

  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (pos === null) return false;

  const tree = syntaxTree(view.state);
  let url: string | null = null;
  let linkTextFrom = -1;
  let linkTextTo = -1;

  // Walk all nodes at the click position to find a Link
  tree.iterate({
    from: pos,
    to: pos + 1,
    enter(node) {
      if (node.name === 'Link') {
        const c = node.node.cursor();
        let markCount = 0;
        if (c.firstChild()) {
          do {
            if (c.name === 'LinkMark') {
              markCount++;
              if (markCount === 1) linkTextFrom = c.to;
              if (markCount === 2) linkTextTo = c.from;
            }
            if (c.name === 'URL') {
              url = view.state.doc.sliceString(c.from, c.to);
            }
          } while (c.nextSibling());
        }
      }
    },
  });

  // Only open if the click was on the link text portion (between [ and ])
  if (url && linkTextFrom >= 0 && linkTextTo > linkTextFrom && pos >= linkTextFrom && pos <= linkTextTo) {
    const api = (window as any).electronAPI;
    if (api?.openExternal) {
      api.openExternal(normalizeUrl(url));
    }
    event.preventDefault();
    return true;
  }
  return false;
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
      run: (view) => showLinkPrompt(view),
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
      key: 'Mod-/',
      run: () => { state.toggleWelcome(); return true; },
    },
    {
      key: 'Mod-t',
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
    keymap.of([...defaultKeymap, ...historyKeymap]),
    buildFormattingKeymap(state),
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    markdownDecoPlugin,
    EditorView.lineWrapping,
    themeCompartment.of(buildTheme(state.isDarkMode)),
    fontCompartment.of(buildFontExtension(state.selectedFont.cssFontFamily, state.fontSize)),
    EditorView.domEventHandlers({
      paste: (event, view) => handlePaste(view, event),
      click: (event, view) => handleLinkClick(view, event),
      dblclick: (event, view) => handleLinkDblClick(view, event),
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
  const ext = tab.filePath?.split('.').pop() || 'txt';
  const defaultName = tab.title + '.' + ext;
  const result = await api.saveFileAs(defaultName, tab.content);
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
        state.markSaved(saveResult.filePath);
      }
    } else if (result === 'cancel') {
      return; // Don't close
    }
    // 'delete' continues
  }

  api.forceClose();
}
