/**
 * Background service worker for Page Visibility API Blocker.
 *
 * The blocker is registered as a dynamic MAIN-world content script only while
 * the extension is enabled. This avoids injecting page-modifying code when the
 * user has disabled blocking and removes the old page-visible DOM state flag.
 */

var BLOCKER_SCRIPT_ID = 'pvb-main-world-blocker';

var BLOCKER_SCRIPT = {
  id: BLOCKER_SCRIPT_ID,
  matches: ['<all_urls>'],
  js: ['blocker.js'],
  runAt: 'document_start',
  allFrames: true,
  persistAcrossSessions: true,
  matchOriginAsFallback: true,
  world: 'MAIN'
};

var applyQueue = Promise.resolve();
var stateChangedThisWake = false;

function toErrorMessage(error) {
  return error && error.message ? error.message : String(error);
}

function getEnabled() {
  return chrome.storage.local.get(['enabled']).then(function (result) {
    return result.enabled !== false;
  });
}

function getOrCreateEnabled() {
  return chrome.storage.local.get(['enabled']).then(function (result) {
    if (result.enabled === undefined) {
      return chrome.storage.local.set({ enabled: true }).then(function () {
        return true;
      });
    }
    return result.enabled !== false;
  });
}

function getRegisteredBlockerScripts() {
  return chrome.scripting.getRegisteredContentScripts({
    ids: [BLOCKER_SCRIPT_ID]
  });
}

function unregisterBlockerScript() {
  return chrome.scripting.unregisterContentScripts({
    ids: [BLOCKER_SCRIPT_ID]
  });
}

function registerBlockerScript() {
  var script = Object.assign({}, BLOCKER_SCRIPT);

  return chrome.scripting.registerContentScripts([script]).catch(function (error) {
    /*
     * matchOriginAsFallback improves coverage for non-standard frame URLs, but
     * some Chromium builds may reject the property. Retry without it.
     */
    delete script.matchOriginAsFallback;
    return chrome.scripting.registerContentScripts([script]).catch(function () {
      throw error;
    });
  });
}

function reloadAllTabs() {
  return chrome.tabs.query({}).then(function (tabs) {
    return Promise.all(tabs.map(function (tab) {
      if (!tab || typeof tab.id !== 'number' || tab.discarded) {
        return Promise.resolve();
      }
      return chrome.tabs.reload(tab.id).catch(function () {
        /* Ignore tabs Chrome does not allow us to reload. */
      });
    }));
  });
}

function setBlockerRegistration(enabled, forceRegister) {
  return getRegisteredBlockerScripts().then(function (scripts) {
    var isRegistered = scripts.length > 0;

    if (!enabled) {
      if (!isRegistered) return;
      return unregisterBlockerScript();
    }

    if (isRegistered && !forceRegister) return;

    return (isRegistered ? unregisterBlockerScript() : Promise.resolve()).then(function () {
      return registerBlockerScript();
    });
  });
}

function applyEnabledState(enabled, reloadTabs, forceRegister) {
  applyQueue = applyQueue.catch(function () {
    /* Keep later state changes from being blocked by an earlier failure. */
  }).then(function () {
    return setBlockerRegistration(enabled, forceRegister).then(function () {
      return chrome.storage.local.set({ enabled: enabled });
    }).then(function () {
      if (reloadTabs) {
        return reloadAllTabs();
      }
    });
  });

  return applyQueue;
}

function syncStateFromStorage(forceRegister) {
  getOrCreateEnabled().then(function (enabled) {
    if (stateChangedThisWake) return;
    return applyEnabledState(enabled, false, forceRegister === true);
  }).catch(function (error) {
    console.error('Failed to synchronize Page Visibility API Blocker state:', error);
  });
}

/* Service workers are short-lived; verify registration whenever this one wakes. */
syncStateFromStorage();

chrome.runtime.onInstalled.addListener(function () {
  syncStateFromStorage(true);
});
chrome.runtime.onStartup.addListener(syncStateFromStorage);

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (!request || typeof request.action !== 'string') return;

  if (request.action === 'getState') {
    getEnabled().then(function (enabled) {
      sendResponse({ enabled: enabled });
    }).catch(function (error) {
      sendResponse({ enabled: true, error: toErrorMessage(error) });
    });
    return true;
  }

  if (request.action === 'setState' || request.action === 'stateChanged') {
    var enabled = request.enabled !== false;
    stateChangedThisWake = true;

    applyEnabledState(enabled, true, true).then(function () {
      sendResponse({ ok: true, enabled: enabled });
    }).catch(function (error) {
      sendResponse({ ok: false, error: toErrorMessage(error) });
    });

    return true;
  }
});
