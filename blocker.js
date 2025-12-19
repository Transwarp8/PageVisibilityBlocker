(function() {
  'use strict';
  function isEnabled() {
    const meta = document.querySelector('meta[name="__pageVisibilityBlockerEnabled"]');
    if (!meta) {
      return true;
    }
    return meta.content === 'true';
  }
  
  const originalHiddenDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
  const originalVisibilityStateDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
  
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    enumerable: true,
    get: function() {
      if (isEnabled()) {
        return false;
      }
      if (originalHiddenDescriptor && originalHiddenDescriptor.get) {
        return originalHiddenDescriptor.get.call(this);
      }
      return false;
    }
  });

  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    enumerable: true,
    get: function() {
      if (isEnabled()) {
        return 'visible';
      }
      if (originalVisibilityStateDescriptor && originalVisibilityStateDescriptor.get) {
        return originalVisibilityStateDescriptor.get.call(this);
      }
      return 'visible';
    }
  });

  const originalAddEventListener = EventTarget.prototype.addEventListener;
  const originalRemoveEventListener = EventTarget.prototype.removeEventListener;

  EventTarget.prototype.addEventListener = function(type, listener, options) {
    if (type === 'visibilitychange' && isEnabled()) {
      return;
    }
    return originalAddEventListener.call(this, type, listener, options);
  };

  EventTarget.prototype.removeEventListener = function(type, listener, options) {
    if (type === 'visibilitychange' && isEnabled()) {
      return;
    }
    return originalRemoveEventListener.call(this, type, listener, options);
  };

})();

