/**
 * TIKUM Artist Registry
 * Discovers and indexes artists strictly grounded in existing canonical event records.
 * Non-negotiable: Never hallucinates artists or biographies.
 */

const { canonicalRegistry } = require('./CanonicalEventRegistry');
const { EventTemporalLifecycleEngine } = require('./EventTemporalLifecycleEngine');

class ArtistRegistry {
  /**
   * Discovers all artists with active or past events in the canonical registry
   */
  static getAllArtists() {
    const events = canonicalRegistry.getAllEvents();
    const artistMap = new Map();

    for (const ev of events) {
      let artistList = Array.isArray(ev.artists) && ev.artists.length > 0 ? ev.artists : [];
      if (artistList.length === 0 && ev.artist) {
        artistList = [ev.artist];
      }
      if (artistList.length === 0 && ev.metadata?.artists) {
        artistList = Array.isArray(ev.metadata.artists) ? ev.metadata.artists : [ev.metadata.artists];
      }
      if (artistList.length === 0 && ev.metadata?.artist) {
        artistList = [ev.metadata.artist];
      }
      if (artistList.length === 0 && (ev.canonical_name || ev.title || ev.name)) {
        const title = ev.canonical_name || ev.title || ev.name;
        if (/^Coldplay\b/i.test(title)) artistList = ['Coldplay'];
        else if (/^Sheila On 7\b/i.test(title)) artistList = ['Sheila On 7'];
        else if (/^The Weeknd\b/i.test(title)) artistList = ['The Weeknd'];
        else if (/^Dewa 19\b/i.test(title)) artistList = ['Dewa 19'];
        else if (/^LANY\b/i.test(title)) artistList = ['LANY'];
        else if (/^NCT\b/i.test(title)) artistList = ['NCT 127'];
        else if (/^The Script\b/i.test(title)) artistList = ['The Script'];
        else if (/^Raditya Dika\b/i.test(title)) artistList = ['Raditya Dika'];
        else if (/^Pandji Pragiwaksono\b/i.test(title)) artistList = ['Pandji Pragiwaksono'];
        else if (/^Guns N Roses\b/i.test(title)) artistList = ['Guns N Roses'];
        else if (/^MAMAMOO\b/i.test(title)) artistList = ['MAMAMOO'];
        else if (/^TWICE\b/i.test(title)) artistList = ['TWICE'];
        else if (/^Bruno Mars\b/i.test(title)) artistList = ['Bruno Mars'];
        else if (/^Hindia\b/i.test(title)) artistList = ['Hindia'];
        else if (/^Tulus\b/i.test(title)) artistList = ['Tulus'];
        else if (/^Maliq & D'Essentials\b/i.test(title)) artistList = ["Maliq & D'Essentials"];
        else if (/^BABYMONSTER\b/i.test(title)) artistList = ['BABYMONSTER'];
        else if (/^Men I Trust\b/i.test(title)) artistList = ['Men I Trust'];
        else if (/^Kanye West\b/i.test(title)) artistList = ['Kanye West'];
        else if (/^Maroon 5\b/i.test(title)) artistList = ['Maroon 5'];
      }
      for (const rawName of artistList) {
        if (!rawName || typeof rawName !== 'string') continue;
        const name = rawName.trim();
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        if (!artistMap.has(slug)) {
          artistMap.set(slug, {
            name,
            slug,
            events: []
          });
        }
        artistMap.get(slug).events.push(ev);
      }
    }

    return Array.from(artistMap.values()).map(artist => {
      const upcoming = artist.events.filter(e => EventTemporalLifecycleEngine.isEventUpcoming(e));
      const past = artist.events.filter(e => !EventTemporalLifecycleEngine.isEventUpcoming(e));
      return {
        ...artist,
        event_count: artist.events.length,
        upcoming_events: upcoming,
        past_events: past
      };
    });
  }

  /**
   * Finds an artist by slug
   */
  static getArtistBySlug(slug) {
    if (!slug) return null;
    const clean = slug.toLowerCase().trim();
    const all = this.getAllArtists();
    return all.find(a => a.slug === clean) || null;
  }
}

module.exports = {
  ArtistRegistry
};

