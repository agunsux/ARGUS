/**
 * TIKUM — Safe Client-Side Draft Store (Deliverable D1)
 *
 * Persists non-sensitive form inputs (event selection, ticket category, quantity,
 * price, notes) to localStorage/sessionStorage with 24-hour TTL.
 *
 * UU PDP Privacy Safeguard:
 * STRICTLY filters out all sensitive data: passwords, OTPs, raw NIK/KTP,
 * full bank account numbers, file binaries, and QR/barcodes.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TikumDraftStore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  var STORAGE_PREFIX = 'tikum_draft_';

  var SENSITIVE_PATTERNS = [
    /pass/i,
    /pwd/i,
    /otp/i,
    /token/i,
    /secret/i,
    /nik/i,
    /ktp/i,
    /identity/i,
    /rekening/i,
    /account.*num/i,
    /bank.*acct/i,
    /barcode/i,
    /qr/i,
    /file/i,
    /binary/i,
    /image/i,
    /evidence/i
  ];

  function isSensitiveKey(key) {
    if (!key || typeof key !== 'string') return true;
    for (var i = 0; i < SENSITIVE_PATTERNS.length; i++) {
      if (SENSITIVE_PATTERNS[i].test(key)) return true;
    }
    return false;
  }

  function isBinaryOrDataUrl(value) {
    if (!value) return false;
    if (typeof value === 'string' && (value.indexOf('data:') === 0 || value.indexOf('blob:') === 0)) {
      return true;
    }
    if (typeof File !== 'undefined' && value instanceof File) return true;
    if (typeof Blob !== 'undefined' && value instanceof Blob) return true;
    return false;
  }

  function sanitizePayload(rawObj) {
    if (!rawObj || typeof rawObj !== 'object') return {};
    var clean = {};
    var keys = Object.keys(rawObj);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = rawObj[k];
      if (isSensitiveKey(k)) continue;
      if (isBinaryOrDataUrl(v)) continue;
      if (typeof v === 'string' && v.length > 5000) continue; // safety clamp
      clean[k] = v;
    }
    return clean;
  }

  var DraftStore = {
    saveDraft: function (key, data, ttlMs) {
      if (!key || !data) return false;
      try {
        var clean = sanitizePayload(data);
        var envelope = {
          timestamp: Date.now(),
          expiresAt: Date.now() + (ttlMs || DEFAULT_TTL_MS),
          data: clean
        };
        var serialized = JSON.stringify(envelope);
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(STORAGE_PREFIX + key, serialized);
        }
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(STORAGE_PREFIX + key, serialized);
        }
        return true;
      } catch (e) {
        return false;
      }
    },

    getDraft: function (key) {
      if (!key) return null;
      try {
        var raw = null;
        if (typeof sessionStorage !== 'undefined') {
          raw = sessionStorage.getItem(STORAGE_PREFIX + key);
        }
        if (!raw && typeof localStorage !== 'undefined') {
          raw = localStorage.getItem(STORAGE_PREFIX + key);
        }
        if (!raw) return null;

        var envelope = JSON.parse(raw);
        if (!envelope || !envelope.expiresAt) return null;
        if (Date.now() > envelope.expiresAt) {
          DraftStore.clearDraft(key);
          return null;
        }
        return envelope.data || null;
      } catch (e) {
        return null;
      }
    },

    clearDraft: function (key) {
      if (!key) return;
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem(STORAGE_PREFIX + key);
        }
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(STORAGE_PREFIX + key);
        }
      } catch (e) {}
    },

    isSensitiveKey: isSensitiveKey,
    sanitizePayload: sanitizePayload
  };

  return DraftStore;
});
