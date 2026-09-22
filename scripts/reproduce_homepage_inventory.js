const { state, resetDatabase } = require('../src/database');
resetDatabase();
const { EventTemporalLifecycleEngine } = require('../src/discovery/EventTemporalLifecycleEngine');
const { ListingService } = require('../src/services/listingService');

const NOW = new Date('2026-09-22T21:32:00+07:00');
console.log('=== EXACT CURRENT HOMEPAGE INVENTORY REPRODUCTION ===');
console.log('NOW (ISO):', NOW.toISOString());
console.log('NOW (Local WIB):', NOW.toString());

// 1. Listings Section (Homepage #marketplace -> GET /api/mvp/listings)
const listings = ListingService.getActiveListings();
console.log('\n--- HOMEPAGE SECTION 1: Active Listings (GET /api/mvp/listings) ---');
console.log('Total Listings:', listings.length);
listings.forEach(l => {
  console.log(JSON.stringify({
    listing_id: l.id,
    event_id: l.event_id,
    event_title: l.event_title,
    event_date: l.event_date,
    venue: l.venue_name,
    city: l.venue_city,
    price: l.price,
    status: l.verification_status
  }, null, 2));
});

// 2. Events Section (Homepage #events -> GET /api/mvp/events)
console.log('\n--- HOMEPAGE SECTION 2: Catalog Events (GET /api/mvp/events) ---');
const showAllOrPast = false;
let apiFiltered = state.events.filter(event => {
  if (event.status === 'DIBATALKAN' || event.status === 'CANCELLED' || event.lifecycle_status === 'CANCELLED') return false;
  if (!showAllOrPast && !EventTemporalLifecycleEngine.isEventUpcoming(event, NOW)) return false;
  return true;
});

console.log('Total Events Returned by API (/api/mvp/events):', apiFiltered.length);

// Frontend filter in public/index.html loadEvents()
const nowMs = NOW.getTime();
const frontendDisplayed = apiFiltered.filter(event => {
  if (event.lifecycle_status && ['COMPLETED', 'ARCHIVED', 'ARCHIVED_WITH_OPEN_OPERATIONS', 'CANCELLED'].includes(event.lifecycle_status)) {
    return false;
  }
  const endAt = event.event_end_at || event.end_datetime || (event.date ? event.date + 'T23:59:59+07:00' : null);
  if (endAt && new Date(endAt).getTime() <= nowMs) {
    return false;
  }
  return true;
});

console.log('Total Events Displayed by Homepage Frontend:', frontendDisplayed.length);
console.log('\nDETAILED EVENT INVENTORY:');
frontendDisplayed.forEach((e, idx) => {
  const temporal = EventTemporalLifecycleEngine.computeTemporalAttributes(e);
  const status = EventTemporalLifecycleEngine.resolveLifecycleStatus(e, NOW);
  console.log(`[${idx + 1}] ${e.id.padEnd(28)} | ${(e.name || '').padEnd(35)} | Date: ${e.date} | Start: ${temporal.event_start_at} | End: ${temporal.event_end_at} | Engine Status: ${status}`);
});

