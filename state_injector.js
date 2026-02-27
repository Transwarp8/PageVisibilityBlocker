/**
 * State injector (ISOLATED world)
 * Communicates the enabled/disabled state to the MAIN world blocker
 * via a short data attribute on the document element.
 */
(function () {
  'use strict';

  var ATTR = 'data-pvb';

  /**
   * Set initial state synchronously (default: enabled).
   * The MAIN world blocker reads this attribute on every API call,
   * so setting it immediately ensures blocking is active before
   * any page scripts run.
   */
  if (document.documentElement) {
    document.documentElement.setAttribute(ATTR, '1');
  }

  /**
   * Update with the actual stored state.
   * If the user has disabled blocking, this async callback will
   * flip the attribute to '0'. The brief window where it reads '1'
   * while storage says disabled is acceptable (errs toward blocking).
   */
  chrome.storage.local.get(['enabled'], function (result) {
    var enabled = result.enabled !== false;
    if (document.documentElement) {
      document.documentElement.setAttribute(ATTR, enabled ? '1' : '0');
    }
  });

  /**
   * Listen for state changes from the popup/background and reload
   * the page so the new state takes effect cleanly.
   */
  chrome.runtime.onMessage.addListener(function (request) {
    if (request.action === 'stateChanged') {
      window.location.reload();
    }
  });
})();
