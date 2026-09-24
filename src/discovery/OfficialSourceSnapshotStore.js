/**
 * TIKUM / ARGUS — Official Source Snapshot Store
 *
 * Reads the committed, machine-generated snapshot of official public event
 * channels (Live Nation Asia, LOKET, BBO) plus the Tier 3 social discovery
 * signal ledger (Instagram handles).
 *
 * ARCHITECTURAL INVARIANT:
 *   - ZERO live network scraping during homepage SSR / API requests.
 *   - The snapshot is produced out-of-band by
 *     `scripts/refresh_official_event_snapshot.js` and committed with
 *     `retrieved_at` + SHA-256 `evidence_hash` for every observation.
 *   - A missing or malformed snapshot fails closed (empty result), never throws.
 */

const fs = require('fs');
const path = require('path');

const SNAPSHOT_FILE = path.join(__dirname, 'fixtures', 'official_event_snapshot.json');
const DISCOVERY_SIGNALS_FILE = path.join(__dirname, 'fixtures', 'social_discovery_signals.json');

const SNAPSHOT_SCHEMA = 'tikum.official_event_snapshot.v1';

function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

class OfficialSourceSnapshotStore {
  /**
   * Loads the full snapshot document (or null when unavailable).
   */
  static loadSnapshot() {
    const doc = readJsonSafe(SNAPSHOT_FILE);
    if (!doc || !Array.isArray(doc.records)) return null;
    return doc;
  }

  static getSnapshotMeta() {
    const doc = this.loadSnapshot();
    if (!doc) {
      return {
        available: false,
        schema: SNAPSHOT_SCHEMA,
        generated_at: null,
        verified_records: 0,
        discovery_only_records: 0
      };
    }
    return {
      available: true,
      schema: doc.schema || SNAPSHOT_SCHEMA,
      generated_at: doc.generated_at || null,
      verified_records: (doc.records || []).length,
      discovery_only_records: (doc.discovery_only_records || []).length
    };
  }

  /**
   * All records that carry authoritative corroboration and may become public
   * once re-verified through the ingestion pipeline.
   */
  static getVerifiedRecords() {
    const doc = this.loadSnapshot();
    if (!doc) return [];
    return (doc.records || []).filter(r => r && r.verification_mode === 'AUTHORITATIVE_CORROBORATED');
  }

  /**
   * Observations that were captured but cannot yet be promoted (e.g. unresolvable
   * calendar year, no authoritative Indonesian corroborator). Kept for the
   * admin verification queue only — never public.
   */
  static getDiscoveryOnlyRecords() {
    const doc = this.loadSnapshot();
    if (!doc) return [];
    return (doc.discovery_only_records || []).filter(Boolean);
  }

  /**
   * Adapter-facing projection: every record that was discovered from a given
   * source_id (either as the discovery source or as a corroborating source).
   */
  static getRecordsBySource(sourceId) {
    const doc = this.loadSnapshot();
    if (!doc) return [];
    const all = [...(doc.records || []), ...(doc.discovery_only_records || [])];
    return all.filter(r => {
      if (!r) return false;
      const ids = [r.discovery_source_id, r.authoritative_source_id, ...(r.corroborating_source_ids || [])];
      return ids.filter(Boolean).includes(sourceId);
    });
  }

  /**
   * Tier 3 discovery signal ledger for the registered Instagram handles
   * (@infokonser, @livenationasia, @ticketmasterasia).
   * These records establish provenance only — they can NEVER verify an event.
   */
  static loadDiscoverySignals() {
    const doc = readJsonSafe(DISCOVERY_SIGNALS_FILE);
    if (!doc || !Array.isArray(doc.signals)) return [];
    return doc.signals.filter(Boolean);
  }

  static getDiscoverySignalsBySource(sourceId) {
    return this.loadDiscoverySignals().filter(s => s.source_id === sourceId);
  }
}

module.exports = {
  OfficialSourceSnapshotStore,
  SNAPSHOT_SCHEMA,
  SNAPSHOT_FILE,
  DISCOVERY_SIGNALS_FILE
};
