/**
 * State injector (ISOLATED world)
 * Sets enabled state in DOM for blocker script to read
 */

(function() {
  /* Create meta tag for state communication - default to enabled */
  const meta = document.createElement('meta');
  meta.name = '__pageVisibilityBlockerEnabled';
  meta.content = 'true';
  
  /* Insert meta tag as early as possible */
  if (document.head) {
    document.head.insertBefore(meta, document.head.firstChild);
  } else if (document.documentElement) {
    document.documentElement.insertBefore(meta, document.documentElement.firstChild);
  }
  
  /* Update with actual stored state */
  chrome.storage.local.get(['enabled'], function(result) {
    const enabled = result.enabled !== false;
    meta.content = String(enabled);
  });
  
  /* Listen for state changes and reload page */
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'stateChanged') {
      window.location.reload();
    }
  });
})();

