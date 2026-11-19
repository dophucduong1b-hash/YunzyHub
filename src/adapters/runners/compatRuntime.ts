export const STORAGE_LIMITS = {
  MAX_KEYS_PER_TOOL: 200,
  MAX_KEY_LENGTH: 256,
  MAX_TOTAL_BYTES_PER_TOOL: 2 * 1024 * 1024, // 2 MB per tool
} as const;

export interface CompatBootstrapOptions {
  toolId: string;
  capabilityToken: string;
  initialLocalStorage: Record<string, string>;
}

export interface StorageSyncMessage {
  type: '__YUNZY_STORAGE_SYNC__';
  toolId: string;
  token: string;
  op: 'set' | 'remove' | 'clear';
  key?: string;
  value?: string;
}

export interface RuntimeDiagnosticMessage {
  type: '__YUNZY_RUNTIME_DIAGNOSTIC__';
  toolId: string;
  token: string;
  level: 'error' | 'warn';
  message: string;
  source?: string;
  lineno?: number;
}

export interface DownloadTriggeredMessage {
  type: '__YUNZY_DOWNLOAD_TRIGGERED__';
  toolId: string;
  token: string;
  filename: string;
  hrefScheme: 'blob' | 'data' | 'other';
}

/**
 * Safely serializes a JSON-compatible value for embedding inside an inline <script> tag.
 * Escapes <, >, &, U+2028, and U+2029 so stored strings like "</script>" cannot break out.
 */
export function escapeJsonForInlineScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Generates the self-contained compatibility bootstrap script injected at the top of <head>
 * right after the CSP <meta> tag and BEFORE any tool scripts execute.
 *
 * Provides:
 * 1. Synchronous per-tool `window.localStorage` hydrated from `initialLocalStorage` and
 *    persisted back to Hub IndexedDB via a token-authenticated postMessage bridge.
 * 2. Per-session `window.sessionStorage` isolated in memory for the current runner session.
 * 3. Safe fallback for `document.cookie` when opaque origin throws SecurityError.
 * 4. Prevention of duplicate external CDN `pdf-lib` fallback execution (e.g. document.write
 *    or dynamic script injection to unpkg/cdnjs/jsdelivr when window.PDFLib is already loaded).
 * 5. Safe delayed `URL.revokeObjectURL` so synchronous `a.click(); URL.revokeObjectURL(url);`
 *    PDF/file export flows do not revoke the Blob before the browser download begins.
 * 6. Uncaught runtime error & unhandled promise rejection diagnostics forwarded to the runner.
 */
export function buildCompatibilityBootstrapScript(
  options: CompatBootstrapOptions
): string {
  const safeToolId = escapeJsonForInlineScript(options.toolId);
  const safeToken = escapeJsonForInlineScript(options.capabilityToken);
  const safeInitialStorage = escapeJsonForInlineScript(
    options.initialLocalStorage || {}
  );

  return `(function() {
  "use strict";
  var TOOL_ID = ${safeToolId};
  var CAP_TOKEN = ${safeToken};
  var INITIAL_LOCAL_STORAGE = ${safeInitialStorage};
  var MAX_KEYS = ${STORAGE_LIMITS.MAX_KEYS_PER_TOOL};
  var MAX_KEY_LEN = ${STORAGE_LIMITS.MAX_KEY_LENGTH};
  var MAX_TOTAL_BYTES = ${STORAGE_LIMITS.MAX_TOTAL_BYTES_PER_TOOL};

  function postToHub(payload) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(payload, "*");
      }
    } catch (_err) {
      // Ignore postMessage errors in detached contexts
    }
  }

  function reportDiagnostic(level, message, source, lineno) {
    postToHub({
      type: "__YUNZY_RUNTIME_DIAGNOSTIC__",
      toolId: TOOL_ID,
      token: CAP_TOKEN,
      level: level,
      message: String(message || "Runtime error"),
      source: source ? String(source) : undefined,
      lineno: typeof lineno === "number" ? lineno : undefined
    });
  }

  function createStorageSubstitute(initialEntries, isPersistent) {
    var map = new Map();
    var currentBytes = 0;

    if (initialEntries && typeof initialEntries === "object") {
      var initKeys = Object.keys(initialEntries);
      for (var i = 0; i < initKeys.length; i++) {
        var ik = String(initKeys[i]);
        var iv = String(initialEntries[ik]);
        if (map.size < MAX_KEYS && ik.length <= MAX_KEY_LEN) {
          var pairBytes = (ik.length + iv.length) * 2;
          if (currentBytes + pairBytes <= MAX_TOTAL_BYTES) {
            map.set(ik, iv);
            currentBytes += pairBytes;
          }
        }
      }
    }

    function recomputeBytes() {
      var total = 0;
      map.forEach(function(val, key) {
        total += (key.length + val.length) * 2;
      });
      currentBytes = total;
    }

    var api = {
      getItem: function(key) {
        var k = String(key);
        return map.has(k) ? map.get(k) : null;
      },
      setItem: function(key, value) {
        var k = String(key);
        var v = String(value);
        if (k.length > MAX_KEY_LEN) {
          reportDiagnostic("warn", "localStorage key vượt quá độ dài tối đa (" + MAX_KEY_LEN + " ký tự).");
          throw new DOMException("QuotaExceededError: Key length exceeds limit", "QuotaExceededError");
        }
        if (!map.has(k) && map.size >= MAX_KEYS) {
          reportDiagnostic("warn", "localStorage vượt quá số lượng khóa tối đa (" + MAX_KEYS + ").");
          throw new DOMException("QuotaExceededError: Maximum keys exceeded", "QuotaExceededError");
        }
        var existingVal = map.has(k) ? map.get(k) : "";
        var deltaBytes = ((map.has(k) ? 0 : k.length) + v.length - existingVal.length) * 2;
        if (currentBytes + deltaBytes > MAX_TOTAL_BYTES) {
          reportDiagnostic("warn", "localStorage vượt quá dung lượng tối đa cho công cụ (2 MB).");
          throw new DOMException("QuotaExceededError: Storage quota exceeded", "QuotaExceededError");
        }
        map.set(k, v);
        recomputeBytes();
        if (isPersistent) {
          postToHub({
            type: "__YUNZY_STORAGE_SYNC__",
            toolId: TOOL_ID,
            token: CAP_TOKEN,
            op: "set",
            key: k,
            value: v
          });
        }
      },
      removeItem: function(key) {
        var k = String(key);
        if (map.has(k)) {
          map.delete(k);
          recomputeBytes();
          if (isPersistent) {
            postToHub({
              type: "__YUNZY_STORAGE_SYNC__",
              toolId: TOOL_ID,
              token: CAP_TOKEN,
              op: "remove",
              key: k
            });
          }
        }
      },
      clear: function() {
        if (map.size > 0) {
          map.clear();
          currentBytes = 0;
          if (isPersistent) {
            postToHub({
              type: "__YUNZY_STORAGE_SYNC__",
              toolId: TOOL_ID,
              token: CAP_TOKEN,
              op: "clear"
            });
          }
        }
      },
      key: function(index) {
        var idx = index >>> 0;
        var keys = Array.from(map.keys());
        return idx < keys.length ? keys[idx] : null;
      }
    };

    var target = Object.create(
      typeof window.Storage === "function" && window.Storage.prototype
        ? window.Storage.prototype
        : Object.prototype
    );

    return new Proxy(target, {
      get: function(_obj, prop) {
        if (prop === "length") {
          return map.size;
        }
        if (prop === "getItem" || prop === "setItem" || prop === "removeItem" || prop === "clear" || prop === "key") {
          return api[prop];
        }
        if (prop === Symbol.toStringTag) {
          return "Storage";
        }
        if (typeof prop === "string" && map.has(prop)) {
          return map.get(prop);
        }
        return undefined;
      },
      set: function(_obj, prop, value) {
        if (typeof prop === "string" && prop !== "length" && !(prop in api)) {
          api.setItem(prop, String(value));
          return true;
        }
        return false;
      },
      deleteProperty: function(_obj, prop) {
        if (typeof prop === "string" && map.has(prop)) {
          api.removeItem(prop);
        }
        return true;
      },
      has: function(_obj, prop) {
        if (prop === "length" || prop in api) return true;
        return typeof prop === "string" && map.has(prop);
      },
      ownKeys: function() {
        return Array.from(map.keys());
      },
      getOwnPropertyDescriptor: function(_obj, prop) {
        if (typeof prop === "string" && map.has(prop)) {
          return {
            value: map.get(prop),
            writable: true,
            enumerable: true,
            configurable: true
          };
        }
        return undefined;
      }
    });
  }

  var localStore = createStorageSubstitute(INITIAL_LOCAL_STORAGE, true);
  var sessionStore = createStorageSubstitute({}, false);

  function installStorageProperty(propName, storeInstance) {
    var descriptor = {
      configurable: true,
      enumerable: true,
      get: function() {
        return storeInstance;
      }
    };
    try {
      Object.defineProperty(window, propName, descriptor);
    } catch (_e1) {}
    try {
      if (typeof Window !== "undefined" && Window.prototype) {
        Object.defineProperty(Window.prototype, propName, descriptor);
      }
    } catch (_e2) {}
  }

  installStorageProperty("localStorage", localStore);
  installStorageProperty("sessionStorage", sessionStore);

  // Safe in-memory document.cookie substitute if opaque origin blocks native cookie access
  try {
    void document.cookie;
  } catch (_cookieErr) {
    var memoryCookieStore = {};
    var cookieDescriptor = {
      configurable: true,
      enumerable: true,
      get: function() {
        return Object.keys(memoryCookieStore)
          .map(function(k) { return k + "=" + memoryCookieStore[k]; })
          .join("; ");
      },
      set: function(val) {
        var raw = String(val || "").split(";")[0].trim();
        if (!raw) return;
        var eqIdx = raw.indexOf("=");
        if (eqIdx === -1) return;
        var ck = raw.slice(0, eqIdx).trim();
        var cv = raw.slice(eqIdx + 1).trim();
        if (ck) memoryCookieStore[ck] = cv;
      }
    };
    try {
      Object.defineProperty(document, "cookie", cookieDescriptor);
    } catch (_e3) {}
    try {
      if (typeof Document !== "undefined" && Document.prototype) {
        Object.defineProperty(Document.prototype, "cookie", cookieDescriptor);
      }
    } catch (_e4) {}
  }

  // Prevent duplicate external CDN pdf-lib fallback requests when local vendored PDFLib is already active
  function isRecognizedPdfLibUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== "string") return false;
    var trimmed = rawUrl.trim();
    if (trimmed.indexOf("//") === 0) trimmed = "https:" + trimmed;
    try {
      var u = new URL(trimmed);
      var h = u.hostname.toLowerCase();
      var p = u.pathname;
      if (h === "cdn.jsdelivr.net") {
        return /^\\/npm\\/pdf-lib(?:@1(?:\\.\\d+\\.\\d+)?)?(?:\\/dist\\/pdf-lib(?:\\.min)?\\.js)?$/i.test(p);
      }
      if (h === "unpkg.com") {
        return /^\\/pdf-lib(?:@1(?:\\.\\d+\\.\\d+)?)?(?:\\/dist\\/pdf-lib(?:\\.min)?\\.js)?$/i.test(p);
      }
      if (h === "cdnjs.cloudflare.com") {
        return /^\\/ajax\\/libs\\/pdf-lib\\/1(?:\\.\\d+\\.\\d+)?\\/pdf-lib(?:\\.min)?\\.js$/i.test(p);
      }
    } catch (_uErr) {}
    return false;
  }

  function sanitizePdfLibFallbackHtml(markup) {
    if (!window.PDFLib || typeof markup !== "string") return markup;
    return markup.replace(/<script\\b[^>]*\\bsrc\\s*=\\s*(['"])([^'"]+)\\1[^>]*>[\\s\\S]*?<\\/script>/gi, function(fullMatch, _q, srcUrl) {
      if (isRecognizedPdfLibUrl(srcUrl)) {
        return "<!-- YunzyHub: skipped duplicate CDN pdf-lib fallback because local pdf-lib@1.17.1 is active -->";
      }
      return fullMatch;
    });
  }

  if (typeof document.write === "function") {
    var origDocWrite = document.write.bind(document);
    document.write = function() {
      var args = Array.prototype.slice.call(arguments).map(sanitizePdfLibFallbackHtml);
      return origDocWrite.apply(document, args);
    };
  }

  if (typeof document.writeln === "function") {
    var origDocWriteln = document.writeln.bind(document);
    document.writeln = function() {
      var args = Array.prototype.slice.call(arguments).map(sanitizePdfLibFallbackHtml);
      return origDocWriteln.apply(document, args);
    };
  }

  // Also intercept dynamic <script>.src assignment for recognized pdf-lib CDN URLs when PDFLib is already loaded
  if (typeof HTMLScriptElement !== "undefined" && HTMLScriptElement.prototype) {
    var origSetAttr = HTMLScriptElement.prototype.setAttribute;
    HTMLScriptElement.prototype.setAttribute = function(name, value) {
      if (
        window.PDFLib &&
        typeof name === "string" &&
        name.toLowerCase() === "src" &&
        isRecognizedPdfLibUrl(String(value))
      ) {
        return origSetAttr.call(this, name, "data:text/javascript;charset=utf-8,%2F*pdf-lib%20vendored*%2F");
      }
      return origSetAttr.call(this, name, value);
    };

    var srcDesc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, "src");
    if (srcDesc && srcDesc.set && srcDesc.get) {
      Object.defineProperty(HTMLScriptElement.prototype, "src", {
        configurable: true,
        enumerable: true,
        get: function() {
          return srcDesc.get.call(this);
        },
        set: function(val) {
          if (window.PDFLib && isRecognizedPdfLibUrl(String(val))) {
            srcDesc.set.call(this, "data:text/javascript;charset=utf-8,%2F*pdf-lib%20vendored*%2F");
            return;
          }
          srcDesc.set.call(this, val);
        }
      });
    }
  }

  // Safe delayed URL.revokeObjectURL so synchronous a.click() + URL.revokeObjectURL(url) exports succeed
  if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
    var origRevokeObjectURL = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = function(url) {
      setTimeout(function() {
        try {
          origRevokeObjectURL(url);
        } catch (_e) {}
      }, 5000);
    };
  }

  // Observe user-initiated or programmatic <a download> clicks to notify runner/tests
  var recentDownloadElements = typeof WeakSet === "function" ? new WeakSet() : null;
  function notifyIfDownloadAnchor(el) {
    try {
      if (!el || typeof el.tagName !== "string" || el.tagName.toUpperCase() !== "A") return;
      if (recentDownloadElements) {
        if (recentDownloadElements.has(el)) return;
        recentDownloadElements.add(el);
        setTimeout(function() {
          try { recentDownloadElements.delete(el); } catch (_e) {}
        }, 50);
      }
      var hasDownload = el.hasAttribute("download") || Boolean(el.download);
      var href = String(el.getAttribute("href") || el.href || "");
      if (!hasDownload && href.indexOf("blob:") !== 0 && href.indexOf("data:") !== 0) return;
      var scheme = href.indexOf("blob:") === 0 ? "blob" : href.indexOf("data:") === 0 ? "data" : "other";
      postToHub({
        type: "__YUNZY_DOWNLOAD_TRIGGERED__",
        toolId: TOOL_ID,
        token: CAP_TOKEN,
        filename: String(el.getAttribute("download") || el.download || "download"),
        hrefScheme: scheme
      });
    } catch (_e) {}
  }

  if (typeof HTMLElement !== "undefined" && HTMLElement.prototype && typeof HTMLElement.prototype.click === "function") {
    var origClick = HTMLElement.prototype.click;
    HTMLElement.prototype.click = function() {
      notifyIfDownloadAnchor(this);
      return origClick.apply(this, arguments);
    };
  }

  window.addEventListener("click", function(ev) {
    var target = ev.target;
    while (target && target !== document) {
      if (target.tagName && String(target.tagName).toUpperCase() === "A") {
        notifyIfDownloadAnchor(target);
        break;
      }
      target = target.parentNode;
    }
  }, true);

  // Runtime error and unhandledrejection diagnostics
  window.addEventListener("error", function(ev) {
    var msg = ev && ev.message ? ev.message : "Lỗi thực thi JavaScript trong công cụ";
    reportDiagnostic("error", msg, ev ? ev.filename : undefined, ev ? ev.lineno : undefined);
  });

  window.addEventListener("unhandledrejection", function(ev) {
    var reason = ev && ev.reason;
    var msg = reason instanceof Error ? reason.message : String(reason || "Lỗi bất đồng bộ (Unhandled Promise Rejection)");
    reportDiagnostic("error", msg);
  });
})();`;
}
