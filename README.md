# Page Visibility API Blocker

Chrome extension that comprehensively blocks the Page Visibility API and related detection vectors to prevent websites from detecting when the page is hidden or minimized.

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right corner
3. Click "Load unpacked"
4. Select this directory

## Usage

1. Click the extension icon in the Chrome toolbar
2. Toggle the "Block API" switch to enable or disable blocking
3. Pages will reload automatically when you change the state

## How It Works

When enabled, the extension blocks all known visibility detection vectors:

### Page Visibility API
- Overrides `Document.prototype.hidden` to always return `false`
- Overrides `Document.prototype.visibilityState` to always return `'visible'`
- Blocks `visibilitychange` event listeners via `addEventListener`
- Blocks `document.onvisibilitychange` handler property assignments

### Focus Detection
- Overrides `document.hasFocus()` to always return `true`
- Blocks `blur` and `focus` event listeners on `window`
- Blocks `window.onblur` and `window.onfocus` handler property assignments

### Anti-Detection
- All API overrides are applied at the **prototype level** (`Document.prototype`, `Window.prototype`) to prevent bypass via `Object.getOwnPropertyDescriptor`
- State communication uses a short, non-descriptive DOM attribute instead of a named `<meta>` tag
- Blocked listeners are tracked properly so `removeEventListener` behaves correctly

## Files

- `manifest.json` - Extension configuration (Manifest V3)
- `popup.html` - Extension popup interface
- `popup.js` - Popup logic and state management
- `background.js` - Background service worker
- `state_injector.js` - Sets blocking state in DOM for the MAIN world script (ISOLATED world)
- `blocker.js` - Comprehensive Page Visibility API blocking (MAIN world)
- `test.html` - Test suite to verify all blocking vectors
- `Icon.png` - Extension icon


## Limitations

- Websites may use `requestAnimationFrame` timing to infer tab backgrounding (extremely difficult to block from an extension)
- Page Lifecycle API events (`freeze`/`resume`) are not currently blocked
- Blocking may cause pages to continue resource-intensive operations when hidden
- Pages must be reloaded after changing the enabled/disabled state

