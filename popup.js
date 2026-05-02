/**
 * Popup script for Page Visibility API Blocker
 * Handles UI interactions and state management
 */

const toggleSwitch = document.getElementById('toggleSwitch');
const statusElement = document.getElementById('status');

/**
 * Update UI based on current state
 */
function updateUI(enabled, message) {
  toggleSwitch.checked = enabled;
  if (message) {
    statusElement.textContent = message;
    statusElement.className = 'status';
  } else if (enabled) {
    statusElement.textContent = 'Blocking Enabled';
    statusElement.className = 'status enabled';
  } else {
    statusElement.textContent = 'Blocking Disabled';
    statusElement.className = 'status disabled';
  }
}

function setControlsDisabled(disabled) {
  toggleSwitch.disabled = disabled;
}

function showError(previousEnabled, message) {
  updateUI(previousEnabled, message || 'Failed to update');
  statusElement.className = 'status disabled';
}

/**
 * Load current state from the background service worker.
 */
chrome.runtime.sendMessage({ action: 'getState' }, function (response) {
  if (chrome.runtime.lastError || !response) {
    /* Safe fallback: storage defaults to enabled unless explicitly false. */
    chrome.storage.local.get(['enabled'], function (result) {
      updateUI(result.enabled !== false);
    });
    return;
  }
  updateUI(response.enabled !== false);
});

/**
 * Handle toggle switch changes.
 */
toggleSwitch.addEventListener('change', function () {
  const previousEnabled = !toggleSwitch.checked;
  const enabled = toggleSwitch.checked;

  setControlsDisabled(true);
  updateUI(enabled, 'Applying…');

  chrome.runtime.sendMessage({ action: 'setState', enabled: enabled }, function (response) {
    setControlsDisabled(false);

    if (chrome.runtime.lastError || !response || response.ok !== true) {
      const error = chrome.runtime.lastError ? chrome.runtime.lastError.message : response && response.error;
      showError(previousEnabled, error || 'Failed to update');
      return;
    }

    updateUI(response.enabled !== false);
  });
});
