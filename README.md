# Page Visibility API Blocker

Chrome extension that blocks the Page Visibility API to prevent websites from detecting when the page is hidden or minimized.

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

When enabled, the extension:
- Overrides `document.hidden` to always return `false`
- Overrides `document.visibilityState` to always return `'visible'`
- Blocks all `visibilitychange` event listeners on `document` and `window`

## Files

- `manifest.json` - Extension configuration
- `popup.html` - Extension popup interface
- `popup.js` - Popup logic and state management
- `background.js` - Background service worker
- `content_script_wrapper.js` - Checks state and injects blocking script
- `content_script.js` - Page Visibility API blocking code
- `Icon.png` - Extension icon

## Limitations

- Websites may use alternative methods to detect tab visibility (focus events, requestAnimationFrame timing, etc.)
- Blocking the API may cause pages to continue resource-intensive operations when hidden
- Pages must be reloaded after changing the enabled/disabled state

