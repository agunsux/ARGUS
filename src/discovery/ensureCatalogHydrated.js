'use strict';

const { canonicalRegistry } = require('./CanonicalEventRegistry');

let inFlight;

async function ensureCatalogHydrated() {
  if (!inFlight && !canonicalRegistry._hydratedFromRepo) {
    inFlight = canonicalRegistry.hydrateFromRepository().finally(() => { inFlight = null; });
  }
  await inFlight;
}

module.exports = { ensureCatalogHydrated };