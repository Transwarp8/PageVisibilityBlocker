# Page Visibility API Blocker

Chrome extension that blocks the Page Visibility API and related focus/blur detection vectors to reduce websites' ability to detect when the page is hidden or minimized.

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right corner
3. Click "Load unpacked"
4. Select this directory

## Usage

1. Click the extension icon in the Chrome toolbar
2. Toggle the "Block API" switch to enable or disable blocking
3. Open tabs reload automatically when you change the state

## How It Works

When enabled, the background service worker dynamically registers `blocker.js` as a `document_start` MAIN-world content script. When disabled, that dynamic content script is unregistered and tabs are reloaded, so page-modifying overrides are not injected into newly loaded pages.

### Page Visibility API

- Overrides `Document.prototype.hidden` to return `false`
- Overrides `Document.prototype.visibilityState` to return `'visible'`
- Overrides Chromium's prefixed `webkitHidden` / `webkitVisibilityState` aliases when present
- Blocks `visibilitychange` listeners on `document` and `window`
- Blocks `document.onvisibilitychange` and `window.onvisibilitychange` handler property assignments where exposed

### Focus Detection

- Overrides `document.hasFocus()` to return `true`
- Blocks `blur` and `focus` event listeners on `window`
- Blocks `window.onblur` and `window.onfocus` handler property assignments

### Frame Coverage

The dynamic content script is registered for all frames with `matchOriginAsFallback` enabled where supported, improving coverage for `data:`, `blob:`, and similar child-frame URLs that inherit origin context.

## Files

- `manifest.json` - Extension configuration (Manifest V3)
- `popup.html` - Extension popup interface
- `popup.js` - Popup logic and state management
- `background.js` - Dynamic content-script registration and state management
- `blocker.js` - Page Visibility API blocking logic (MAIN world)
- `test.html` - Manual test suite to verify common blocking vectors
- `icon-16.png`, `icon-48.png`, `icon-128.png` - Extension icons

## Limitations

- Any MAIN-world JavaScript override can be detected by a sufficiently motivated page. This extension reduces common visibility/focus detection but cannot provide perfect anti-fingerprinting.
- Websites may use timing side channels such as `requestAnimationFrame`, timers, media playback, networking behavior, or CPU throttling to infer backgrounding.
- Some pages may use Page Lifecycle API events (`freeze` / `resume`) or other browser signals not currently blocked.
- Existing tabs must reload after changing the enabled/disabled state; tabs that Chrome refuses to reload keep their previous state until manually reloaded.
- Blocking may cause pages to continue resource-intensive operations while hidden.
