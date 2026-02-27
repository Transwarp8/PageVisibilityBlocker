/**
 * Page Visibility API Blocker (MAIN world)
 * Comprehensive blocking of all visibility detection vectors:
 *   - Document.prototype.hidden
 *   - Document.prototype.visibilityState
 *   - Document.prototype.onvisibilitychange (handler property)
 *   - Document.prototype.hasFocus()
 *   - visibilitychange event listeners
 *   - window blur/focus event listeners
 *   - window.onblur / window.onfocus handler properties
 */
(function () {
  'use strict';

  /**
   * State attribute set by the isolated-world injector.
   * Uses a short, non-descriptive name to avoid easy fingerprinting.
   */
  var ATTR = 'data-pvb';

  /**
   * Check whether blocking is currently enabled.
   * Reads from a DOM attribute set by state_injector.js (ISOLATED world).
   * Defaults to enabled if the attribute is absent (safe fallback).
   */
  function isEnabled() {
    var root = document.documentElement;
    if (!root) return true;
    var val = root.getAttribute(ATTR);
    return val === null || val === '1';
  }

  /* =========================================================
   * 1. Document.prototype.hidden
   * Override at the PROTOTYPE level so that pages cannot bypass
   * via Object.getOwnPropertyDescriptor(Document.prototype, 'hidden')
   * ========================================================= */
  var origHidden = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');

  Object.defineProperty(Document.prototype, 'hidden', {
    configurable: true,
    enumerable: true,
    get: function () {
      if (isEnabled()) return false;
      return origHidden && origHidden.get ? origHidden.get.call(this) : false;
    }
  });

  /* =========================================================
   * 2. Document.prototype.visibilityState
   * Override at the PROTOTYPE level.
   * ========================================================= */
  var origVisState = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');

  Object.defineProperty(Document.prototype, 'visibilityState', {
    configurable: true,
    enumerable: true,
    get: function () {
      if (isEnabled()) return 'visible';
      return origVisState && origVisState.get ? origVisState.get.call(this) : 'visible';
    }
  });

  /* =========================================================
   * 3. Document.prototype.onvisibilitychange
   * Block the handler property so that pages using
   * document.onvisibilitychange = fn  are also intercepted.
   * ========================================================= */
  var origOnVisChange = Object.getOwnPropertyDescriptor(Document.prototype, 'onvisibilitychange');
  var storedOnVisChange = null;

  Object.defineProperty(Document.prototype, 'onvisibilitychange', {
    configurable: true,
    enumerable: true,
    get: function () {
      if (isEnabled()) return storedOnVisChange;
      return origOnVisChange && origOnVisChange.get ? origOnVisChange.get.call(this) : null;
    },
    set: function (handler) {
      if (isEnabled()) {
        storedOnVisChange = handler;
        return;
      }
      if (origOnVisChange && origOnVisChange.set) {
        origOnVisChange.set.call(this, handler);
      }
    }
  });

  /* =========================================================
   * 4. Document.prototype.hasFocus
   * Override to always return true when blocking is enabled.
   * ========================================================= */
  var origHasFocus = Document.prototype.hasFocus;

  Object.defineProperty(Document.prototype, 'hasFocus', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: function () {
      if (isEnabled()) return true;
      return origHasFocus.call(this);
    }
  });

  /* =========================================================
   * 5. EventTarget.prototype.addEventListener / removeEventListener
   * Block visibilitychange on any target (it only fires on
   * document but bubbles to window).
   * Block blur/focus on window only (to avoid breaking
   * in-page focus management on form elements).
   * Track blocked listeners in a WeakMap so removeEventListener
   * can properly handle them.
   * ========================================================= */
  var origAddEvent = EventTarget.prototype.addEventListener;
  var origRemoveEvent = EventTarget.prototype.removeEventListener;
  var blockedListeners = new WeakMap();

  function storeBlocked(target, type, listener) {
    if (!blockedListeners.has(target)) {
      blockedListeners.set(target, Object.create(null));
    }
    var map = blockedListeners.get(target);
    if (!map[type]) map[type] = [];
    map[type].push(listener);
  }

  function removeBlocked(target, type, listener) {
    if (!blockedListeners.has(target)) return false;
    var map = blockedListeners.get(target);
    if (!map[type]) return false;
    var idx = map[type].indexOf(listener);
    if (idx === -1) return false;
    map[type].splice(idx, 1);
    return true;
  }

  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (isEnabled()) {
      /* Block visibilitychange on any target */
      if (type === 'visibilitychange') {
        storeBlocked(this, type, listener);
        return;
      }
      /* Block blur/focus only on window */
      if ((type === 'blur' || type === 'focus') && this === window) {
        storeBlocked(this, type, listener);
        return;
      }
    }
    return origAddEvent.call(this, type, listener, options);
  };

  EventTarget.prototype.removeEventListener = function (type, listener, options) {
    /* If this listener was previously blocked, just remove from tracking */
    if (isEnabled() && removeBlocked(this, type, listener)) {
      return;
    }
    return origRemoveEvent.call(this, type, listener, options);
  };

  /* =========================================================
   * Helper: find a property descriptor anywhere in the
   * prototype chain. Chrome may place onblur/onfocus on an
   * intermediate prototype rather than Window.prototype.
   * ========================================================= */
  function findDescriptor(obj, prop) {
    var current = obj;
    while (current) {
      var desc = Object.getOwnPropertyDescriptor(current, prop);
      if (desc) return desc;
      current = Object.getPrototypeOf(current);
    }
    return null;
  }

  /* =========================================================
   * 6. window.onblur
   * Block the handler property so that pages using
   * window.onblur = fn  are also intercepted.
   * Walks the prototype chain to find the original descriptor,
   * then overrides on the window instance directly.
   * ========================================================= */
  var origOnBlur = findDescriptor(window, 'onblur');
  if (origOnBlur) {
    var storedOnBlur = null;
    Object.defineProperty(window, 'onblur', {
      configurable: true,
      enumerable: true,
      get: function () {
        if (isEnabled()) return storedOnBlur;
        return origOnBlur.get ? origOnBlur.get.call(this) : null;
      },
      set: function (handler) {
        if (isEnabled()) {
          storedOnBlur = handler;
          return;
        }
        if (origOnBlur.set) origOnBlur.set.call(this, handler);
      }
    });
  }

  /* =========================================================
   * 7. window.onfocus
   * Block the handler property so that pages using
   * window.onfocus = fn  are also intercepted.
   * ========================================================= */
  var origOnFocus = findDescriptor(window, 'onfocus');
  if (origOnFocus) {
    var storedOnFocus = null;
    Object.defineProperty(window, 'onfocus', {
      configurable: true,
      enumerable: true,
      get: function () {
        if (isEnabled()) return storedOnFocus;
        return origOnFocus.get ? origOnFocus.get.call(this) : null;
      },
      set: function (handler) {
        if (isEnabled()) {
          storedOnFocus = handler;
          return;
        }
        if (origOnFocus.set) origOnFocus.set.call(this, handler);
      }
    });
  }

  /* =========================================================
   * 8. Event interception safety net
   * Use the ORIGINAL addEventListener (bypassing our override)
   * to register capturing listeners that stop blur/focus events
   * on window via stopImmediatePropagation. This catches cases
   * where onblur/onfocus handlers were set through mechanisms
   * our property override didn't anticipate.
   * ========================================================= */
  origAddEvent.call(window, 'blur', function (e) {
    if (isEnabled()) {
      e.stopImmediatePropagation();
    }
  }, true);

  origAddEvent.call(window, 'focus', function (e) {
    if (isEnabled()) {
      e.stopImmediatePropagation();
    }
  }, true);

})();
