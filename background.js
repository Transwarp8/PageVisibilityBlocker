/**
 * Background service worker for Page Visibility API Blocker
 * Handles state initialization and messaging
 */

/**
 * Initialize extension state on install
 */
chrome.runtime.onInstalled.addListener(function () {
  chrome.storage.local.get(['enabled'], function (result) {
    if (result.enabled === undefined) {
      chrome.storage.local.set({ enabled: true });
    }
  });
});

/**
 * Handle messages from popup and content scripts
 */
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === 'stateChanged') {
    /* Notify all tabs about state change */
    chrome.tabs.query({}, function (tabs) {
      for (var i = 0; i < tabs.length; i++) {
        chrome.tabs.sendMessage(tabs[i].id, {
          action: 'stateChanged',
          enabled: request.enabled
        }).catch(function () {
          /* Ignore errors for tabs that cannot receive messages */
        });
      }
    });
    return;
  }
  if (request.action === 'getState') {
    chrome.storage.local.get(['enabled'], function (result) {
      sendResponse({ enabled: result.enabled !== false });
    });
    return true;
  }
});
