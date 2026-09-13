/**
 * TIKUM / ARGUS Event Source Observation Model
 * 
 * Immutable record capturing raw provenance of an event observation from an external source.
 * Answers: WHAT, WHEN, WHERE, FROM WHOM, and UNDER WHICH SOURCE was observed.
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const PARSER_VERSION = '1.0.0';

class EventSourceObservation {
  constructor(data = {}) {
    this.observation_id = data.observation_id || `obs-${uuidv4().substring(0, 12)}`;
    this.source_id = data.source_id || 'src-unknown';
    this.source_url = data.source_url || data.post_url || null;
    this.post_url = data.post_url || data.source_url || null;
    this.source_external_id = data.source_external_id || data.external_id || null;
    
    // Material factual fields (factual extraction only — copyright minimization)
    this.raw_title = data.raw_title || data.name || data.title || '';
    this.raw_description = data.raw_description || data.description || '';
    this.raw_artist = data.raw_artist || (Array.isArray(data.artists) ? data.artists.join(', ') : (data.artist || ''));
    this.raw_venue = data.raw_venue || data.venue_name || data.venue || '';
    this.raw_city = data.raw_city || data.city || data.venue_city || '';
    this.raw_country = data.raw_country || data.country || 'Indonesia';
    this.raw_start_at = data.raw_start_at || data.start_date || data.start_datetime || data.date || '';
    this.raw_end_at = data.raw_end_at || data.end_date || data.end_datetime || null;
    this.raw_ticket_url = data.raw_ticket_url || data.official_ticket_url || data.ticket_url || null;
    this.raw_status = data.raw_status || data.status || 'UPCOMING';
    
    this.observed_at = data.observed_at || new Date().toISOString();
    this.published_at = data.published_at || null;
    this.parser_version = data.parser_version || PARSER_VERSION;
    
    // Deterministic SHA-256 fingerprint of material factual claims
    this.content_hash = data.content_hash || this.computeContentHash();
    
    // Optional reference pointer to sanitized raw payload (never executable content)
    this.raw_payload_reference = data.raw_payload_reference || null;
  }

  /**
   * Computes SHA-256 over material factual fields.
   */
  computeContentHash() {
    const claims = {
      source_id: this.source_id,
      source_url: this.source_url || '',
      source_external_id: this.source_external_id,
      title: (this.raw_title || '').trim().toLowerCase(),
      artist: (this.raw_artist || '').trim().toLowerCase(),
      venue: (this.raw_venue || '').trim().toLowerCase(),
      city: (this.raw_city || '').trim().toLowerCase(),
      start_at: (this.raw_start_at || '').trim(),
      ticket_url: this.raw_ticket_url || '',
      status: this.raw_status || 'UPCOMING'
    };
    return crypto.createHash('sha256').update(JSON.stringify(claims)).digest('hex');
  }

  /**
   * Serializes immutable observation record for persistence or API delivery.
   */
  toJSON() {
    return {
      observation_id: this.observation_id,
      source_id: this.source_id,
      source_url: this.source_url,
      post_url: this.post_url || this.source_url,
      source_external_id: this.source_external_id,
      raw_title: this.raw_title,
      raw_description: this.raw_description,
      raw_artist: this.raw_artist,
      raw_venue: this.raw_venue,
      raw_city: this.raw_city,
      raw_country: this.raw_country,
      raw_start_at: this.raw_start_at,
      raw_end_at: this.raw_end_at,
      raw_ticket_url: this.raw_ticket_url,
      raw_status: this.raw_status,
      observed_at: this.observed_at,
      published_at: this.published_at,
      content_hash: this.content_hash,
      parser_version: this.parser_version,
      raw_payload_reference: this.raw_payload_reference
    };
  }
}

module.exports = {
  EventSourceObservation,
  PARSER_VERSION
};
