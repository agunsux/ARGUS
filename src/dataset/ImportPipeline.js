/**
 * ImportPipeline — Phase 24 Production Dataset Platform
 * 
 * Normalizes, deduplicates, canonicalizes, and scores data feeds 
 * (community reports, verified investigations, licensed feeds, historical fixtures).
 */
class ImportPipeline {
  constructor() {
    this.datasetStore = new Map();
  }

  /**
   * Imports a batch of raw logs from a specified source.
   */
  importData(rawRecords, source) {
    const normalizedList = [];
    const duplicates = [];

    for (const raw of rawRecords) {
      // 1. Normalization
      const normalized = this._normalize(raw, source);

      // 2. Canonicalization
      const canonical = this._canonicalize(normalized);

      // 3. Deduplication
      if (this._isDuplicate(canonical)) {
        duplicates.push(canonical);
        continue;
      }

      // 4. Entity Linking
      const linked = this._linkEntity(canonical);

      // 5. Confidence Scoring
      linked.importConfidence = this._scoreConfidence(linked, source);

      this.datasetStore.set(linked.id, linked);
      normalizedList.push(linked);
    }

    return {
      imported: normalizedList,
      duplicatesCount: duplicates.length,
      totalCount: normalizedList.length
    };
  }

  _normalize(raw, source) {
    return {
      id: raw.id || raw.reportId || `imp-${Math.random().toString(36).substr(2, 9)}`,
      entityId: raw.entityId || raw.target || 'unknown',
      type: raw.type || raw.label || 'REPORT',
      timestamp: raw.timestamp || raw.createdAt || new Date().toISOString(),
      rawScore: typeof raw.rawScore === 'number' ? raw.rawScore : 50,
      source
    };
  }

  _isDuplicate(record) {
    // Deduplicate on unique identifier or identical entity-type combination
    if (this.datasetStore.has(record.id)) return true;
    for (const existing of this.datasetStore.values()) {
      if (existing.entityId === record.entityId && existing.type === record.type && existing.source === record.source) {
        return true;
      }
    }
    return false;
  }

  _canonicalize(record) {
    return {
      ...record,
      entityId: typeof record.entityId === 'string' ? record.entityId.toLowerCase().trim() : record.entityId,
      type: typeof record.type === 'string' ? record.type.toUpperCase().replace(/\s+/g, '_') : record.type
    };
  }

  _linkEntity(record) {
    // Resolves links into Graph entity patterns
    return {
      ...record,
      linkedNode: record.entityId !== 'unknown' ? `node:${record.entityId}` : null
    };
  }

  _scoreConfidence(record, source) {
    let sourceWeight = 0.5;

    switch (source) {
      case 'verified_investigations':
        sourceWeight = 0.95;
        break;
      case 'licensed_feeds':
        sourceWeight = 0.85;
        break;
      case 'historical_fixtures':
        sourceWeight = 0.75;
        break;
      case 'community_reports':
        sourceWeight = 0.55;
        break;
    }

    return parseFloat(sourceWeight.toFixed(4));
  }

  clear() {
    this.datasetStore.clear();
  }
}

module.exports = ImportPipeline;
