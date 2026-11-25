'use strict';

function normalizeProviderKey(raw) {
  const key = String(raw || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#:]/)[0];
  const aliases = {
    loket: 'loket', 'loket.com': 'loket', tiket: 'tiket', 'tiket.com': 'tiket',
    tiptip: 'tiptip', 'tiptip.id': 'tiptip', goers: 'goers', 'goers.app': 'goers',
    'goersapp.com': 'goers', kiostix: 'kiostix', 'kiostix.com': 'kiostix',
    artatix: 'artatix', 'artatix.co.id': 'artatix', dewatiket: 'dewatiket',
    'dewatiket.id': 'dewatiket', yesplis: 'yesplis', 'yesplis.com': 'yesplis'
  };
  return aliases[key] || 'unknown';
}

function isUnverifiedLead(event) {
  return [event.status, event.verification_state].some(value =>
    String(value || '').toLowerCase() === 'unverified_lead');
}

function checkCatalogBatch(previousCount, incomingCount, source) {
  const tripped = incomingCount === 0 || incomingCount < previousCount * 0.5;
  const result = { circuit_breaker_tripped: tripped, admin_alert: tripped, source, previous_active_count: previousCount, incoming_active_count: incomingCount };
  if (tripped) console.warn('[CATALOG_CIRCUIT_BREAKER]', JSON.stringify(result));
  return result;
}

module.exports = { isUnverifiedLead, checkCatalogBatch, normalizeProviderKey };