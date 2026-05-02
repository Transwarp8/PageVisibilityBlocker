/**
 * Page Visibility API Blocker (MAIN world)
 *
 * This file is registered dynamically by background.js only while blocking is
 * enabled. There is intentionally no DOM attribute or other page-writable state
 * toggle here: disabling the extension unregisters this script and reloads tabs.
 */
(function () {
  'use strict';

  function normalizeEventHandler(handler) {
    return typeof handler === 'function' ? handler : null;
  }

  function getOwnDescriptor(obj, prop) {
    return Object.getOwnPropertyDescriptor(obj, prop);
  }

  function overrideGetter(proto, prop, value) {
    var original = getOwnDescriptor(proto, prop);

    /* Avoid creating non-standard fingerprintable properties. */
    if (!original || original.configurable === false) return;

    Object.defineProperty(proto, prop, {
      configurable: original.configurable,
      enumerable: original.enumerable,
      get: function () {
        return value;
      }
    });
  }

  function findDescriptor(obj, prop) {
    var current = obj;
    while (current) {
      var desc = Object.getOwnPropertyDescriptor(current, prop);
      if (desc) return desc;
      current = Object.getPrototypeOf(current);
    }
    return null;
  }

  function overrideDocumentEventHandler(prop) {
    var original = getOwnDescriptor(Document.prototype, prop);
    var handlers = new WeakMap();

    if (!original || original.configurable === false) return;

    Object.defineProperty(Document.prototype, prop, {
      configurable: original.configurable,
      enumerable: original.enumerable,
      get: function () {
        return handlers.has(this) ? handlers.get(this) : null;
      },
      set: function (handler) {
        handlers.set(this, normalizeEventHandler(handler));
      }
    });
  }

  function overrideWindowEventHandler(prop) {
    var original = findDescriptor(window, prop);
    var stored = null;

    if (!original || original.configurable === false) return;

    Object.defineProperty(window, prop, {
      configurable: true,
      enumerable: original.enumerable,
      get: function () {
        return stored;
      },
      set: function (handler) {
        stored = normalizeEventHandler(handler);
      }
    });
  }

  /* Page Visibility API */
  overrideGetter(Document.prototype, 'hidden', false);
  overrideGetter(Document.prototype, 'visibilityState', 'visible');

  /* Historical prefixed aliases still exposed by some Chromium builds. */
  overrideGetter(Document.prototype, 'webkitHidden', false);
  overrideGetter(Document.prototype, 'webkitVisibilityState', 'visible');

  /* document.onvisibilitychange = fn */
  overrideDocumentEventHandler('onvisibilitychange');

  /* document.hasFocus() */
  var originalHasFocus = Document.prototype.hasFocus;
  var originalHasFocusDescriptor = getOwnDescriptor(Document.prototype, 'hasFocus');
  if (typeof originalHasFocus === 'function' && (!originalHasFocusDescriptor || originalHasFocusDescriptor.configurable !== false)) {
    Object.defineProperty(Document.prototype, 'hasFocus', {
      configurable: originalHasFocusDescriptor ? originalHasFocusDescriptor.configurable : true,
      enumerable: originalHasFocusDescriptor ? originalHasFocusDescriptor.enumerable : true,
      writable: originalHasFocusDescriptor ? originalHasFocusDescriptor.writable : true,
      value: function hasFocus() {
        return true;
      }
    });
  }

  /* EventTarget.prototype.addEventListener */
  var originalAddEvent = EventTarget.prototype.addEventListener;
  var originalAddEventDescriptor = getOwnDescriptor(EventTarget.prototype, 'addEventListener');

  function shouldBlockEventListener(target, type) {
    if (type === 'visibilitychange') {
      return target === document || target === window;
    }
    if (type === 'blur' || type === 'focus') {
      return target === window;
    }
    return false;
  }

  if (typeof originalAddEvent === 'function' && (!originalAddEventDescriptor || originalAddEventDescriptor.configurable !== false)) {
    Object.defineProperty(EventTarget.prototype, 'addEventListener', {
      configurable: originalAddEventDescriptor ? originalAddEventDescriptor.configurable : true,
      enumerable: originalAddEventDescriptor ? originalAddEventDescriptor.enumerable : true,
      writable: originalAddEventDescriptor ? originalAddEventDescriptor.writable : true,
      value: function addEventListener(type, listener, options) {
        if (shouldBlockEventListener(this, type)) return;
        return originalAddEvent.call(this, type, listener, options);
      }
    });
  }

  /* window.onvisibilitychange / window.onblur / window.onfocus */
  overrideWindowEventHandler('onvisibilitychange');
  overrideWindowEventHandler('onblur');
  overrideWindowEventHandler('onfocus');

  /*
   * Event interception safety net. These listeners are registered through the
   * original addEventListener before page scripts run, so they still suppress
   * listeners installed via a clean-realm/bypassed addEventListener reference.
   */
  originalAddEvent.call(window, 'visibilitychange', function (event) {
    event.stopImmediatePropagation();
  }, true);

  originalAddEvent.call(document, 'visibilitychange', function (event) {
    event.stopImmediatePropagation();
  }, true);

  originalAddEvent.call(window, 'blur', function (event) {
    event.stopImmediatePropagation();
  }, true);

  originalAddEvent.call(window, 'focus', function (event) {
    event.stopImmediatePropagation();
  }, true);
})();
