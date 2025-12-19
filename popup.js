/**
 * Popup script for Page Visibility API Blocker
 * Handles UI interactions and state management
 */

const toggleSwitch = document.getElementById('toggleSwitch');
const statusElement = document.getElementById('status');

/**
 * Update UI based on current state
 */
function updateUI(enabled) {
  toggleSwitch.checked = enabled;
  if (enabled) {
    statusElement.textContent = 'Blocking Enabled';
    statusElement.className = 'status enabled';
  } else {
    statusElement.textContent = 'Blocking Disabled';
    statusElement.className = 'status disabled';
  }
}

/**
 * Load current state from storage
 */
chrome.storage.local.get(['enabled'], function(result) {
  const enabled = result.enabled !== false;
  updateUI(enabled);
});

/**
 * Handle toggle switch changes
 */
toggleSwitch.addEventListener('change', function() {
  const enabled = toggleSwitch.checked;
  chrome.storage.local.set({ enabled: enabled }, function() {
    updateUI(enabled);
    chrome.runtime.sendMessage({ action: 'stateChanged', enabled: enabled });
  });
});

