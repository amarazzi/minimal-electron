# minimal

A distraction-free text editor with live Markdown formatting, built with Electron.

Inspired by editors like uFocus and AI Writer. Originally a macOS SwiftUI app, rebuilt from the ground up as a cross-platform Electron application.

---

## Features

- **Live Markdown highlighting** -- headings, bold, italic, code, links, blockquotes, and lists are styled inline as you type (non-destructive, your raw Markdown is always preserved)
- **Tab system** -- open multiple documents side by side, auto-titled from the first line
- **Dark & light mode** -- toggle with a shortcut or the toolbar button
- **Typography settings** -- pick from Courier New, Merriweather, Inter, or System Sans; adjust size from 12 to 28 pt
- **Rich paste** -- paste HTML or RTF and it converts to Markdown automatically (via Turndown)
- **Drag and drop** -- drop `.txt` or `.md` files onto the window to open them
- **Auto-continue lists** -- press Enter on a bullet or numbered list item and the next line continues the pattern
- **Save protection** -- prompted before closing unsaved documents
- **Keyboard-first workflow** -- 20+ shortcuts for formatting, navigation, and file operations
- **Cross-platform** -- runs on macOS, Windows, and Linux

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + B` | Bold |
| `Cmd/Ctrl + I` | Italic |
| `Cmd/Ctrl + U` | Underline |
| `Cmd/Ctrl + E` | Inline code |
| `Cmd/Ctrl + K` | Link |
| `Cmd/Ctrl + 1-4` | Heading 1--4 |
| `Cmd/Ctrl + L` | Bullet list |
| `Cmd/Ctrl + N` | New tab |
| `Cmd/Ctrl + W` | Close tab |
| `Cmd/Ctrl + S` | Save |
| `Cmd/Ctrl + Shift + S` | Save as |
| `Cmd/Ctrl + O` | Open file |
| `Cmd/Ctrl + Alt + Left/Right` | Switch tabs |
| `Cmd/Ctrl + +/-` | Increase / decrease font size |
| `Cmd/Ctrl + Shift + D` | Toggle dark / light mode |
| `Cmd/Ctrl + T` | Typography settings |
| `Cmd/Ctrl + /` | Show shortcuts |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- npm (comes with Node.js)

### Install dependencies

```bash
npm install
```

### Run in development mode

```bash
npm run dev
```

This builds the project with webpack (development mode) and launches Electron.

### Run with production build

```bash
npm start
```

Builds with webpack in production mode, then launches Electron.

### Build only (no launch)

```bash
# Production
npm run build

# Development (with source maps)
npm run build:dev
```

---

## Release Builds

Release builds are generated with [electron-builder](https://www.electron.build/). Distributable files are written to the `release/` directory.

### Build for the current platform

```bash
npm run dist
```

### Build for a specific platform

```bash
# macOS  (dmg + zip for current arch)
npm run dist:mac

# macOS  (universal binary -- x64 + arm64)
npm run dist:mac:universal

# Windows  (NSIS installer + portable exe, x64)
npm run dist:win

# Linux  (AppImage + deb, x64)
npm run dist:linux
```

### Build for all platforms at once

```bash
npm run dist:all
```

> **Note:** Cross-compilation has limitations. Building macOS `.dmg` files requires a Mac. Building Windows `.exe` on Linux requires Wine. For best results, build each platform on its native OS or use CI (see below).

### CI example (GitHub Actions)

A typical matrix strategy:

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags: ['v*']

jobs:
  build:
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run dist
      - uses: actions/upload-artifact@v4
        with:
          name: release-${{ matrix.os }}
          path: release/*
```

---

## Project Structure

```
minimal-editor/
  assets/
    fonts/            # Bundled typefaces (Merriweather, Inter, CrimsonPro)
  src/
    main/
      main.ts         # Electron main process (window, IPC, menus, file dialogs)
      preload.ts      # Context bridge (secure API exposed to renderer)
    renderer/
      index.html      # App shell / DOM structure
      index.ts        # UI wiring (tabs, toolbar, settings, welcome, drag-drop)
      editor.ts       # CodeMirror 6 setup, markdown decorations, formatting, paste
      state.ts        # Reactive app state (tabs, theme, font, persistence)
      styles.css      # Full stylesheet with CSS variable theming
  webpack.config.js   # Builds main, preload, and renderer bundles
  tsconfig.json
  package.json
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Electron 40 |
| Editor | CodeMirror 6 |
| Language | TypeScript 5 |
| Bundler | Webpack 5 |
| Paste conversion | Turndown |
| Packaging | electron-builder |

## License

MIT
