/**
 * ARGUS / TIKUM Promoter Import Service
 * 
 * Ingests CSV / JSON lists of promoter candidates and Instagram handles.
 * Executes deterministic identity resolution against APMI and official domains,
 * flagging potential duplicates without destructive overwrites.
 */

const fs = require('fs');
const { promoterRegistry, PROMOTER_STATUS } = require('./PromoterDiscoveryRegistry');
const { apmiPromoterRegistry } = require('./ApmiPromoterRegistry');

class PromoterImportService {
  /**
   * Parses CSV string into structured array of candidate objects.
   * Expected columns: promoter_name,instagram_handle,instagram_url,website_url,city,category,notes
   */
  static parseCSV(csvContent) {
    if (!csvContent || typeof csvContent !== 'string') return [];

    const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length <= 1) return [];

    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    const results = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Handle simple CSV parsing (supports basic commas and quoted strings)
      const values = [];
      let inQuote = false;
      let curVal = '';

      for (let c = 0; c < line.length; c++) {
        const char = line[c];
        if (char === '"') {
          inQuote = !inQuote;
        } else if (char === ',' && !inQuote) {
          values.push(curVal.trim());
          curVal = '';
        } else {
          curVal += char;
        }
      }
      values.push(curVal.trim());

      const rowObj = {};
      for (let h = 0; h < header.length; h++) {
        rowObj[header[h]] = values[h] !== undefined ? values[h] : '';
      }

      if (rowObj.promoter_name || rowObj.name) {
        results.push({
          canonical_name: rowObj.promoter_name || rowObj.name,
          instagram_handle: rowObj.instagram_handle || rowObj.handle || null,
          instagram_url: rowObj.instagram_url || null,
          website_url: rowObj.website_url || null,
          city: rowObj.city || 'Jakarta',
          category: rowObj.category || 'CONCERT',
          notes: rowObj.notes || ''
        });
      }
    }

    return results;
  }

  /**
   * Imports from file path (CSV or JSON).
   */
  static importFromFile(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Import file not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    if (filePath.endsWith('.json')) {
      const data = JSON.parse(content);
      return this.importCandidates(Array.isArray(data) ? data : [data]);
    } else {
      const parsed = this.parseCSV(content);
      return this.importCandidates(parsed);
    }
  }

  /**
   * Imports an array of candidate objects.
   */
  static importCandidates(candidates = []) {
    if (!Array.isArray(candidates)) {
      throw new Error('Candidates must be an array');
    }

    const report = {
      total_parsed: candidates.length,
      imported_count: 0,
      duplicate_count: 0,
      apmi_matched_count: 0,
      verified_count: 0,
      results: []
    };

    for (const candidate of candidates) {
      const res = promoterRegistry.registerCandidate(candidate);

      if (res.action === 'DUPLICATE_FLAGGED') {
        report.duplicate_count++;
        if (res.existing_promoter && res.existing_promoter.apmi_member) {
          report.apmi_matched_count++;
        }
        report.results.push({
          canonical_name: candidate.canonical_name || candidate.promoter_name,
          status: 'POSSIBLE_DUPLICATE',
          reason: res.duplicate_record.reason,
          existing_promoter_id: res.existing_promoter.promoter_id
        });
      } else {
        report.imported_count++;
        if (res.promoter.apmi_member) {
          report.apmi_matched_count++;
        }
        if (res.promoter.verification_status === PROMOTER_STATUS.VERIFIED_OFFICIAL_PROMOTER_ACCOUNT) {
          report.verified_count++;
        }
        report.results.push({
          promoter_id: res.promoter.promoter_id,
          canonical_name: res.promoter.canonical_name,
          status: res.promoter.verification_status,
          authority_level: res.promoter.authority_level,
          apmi_member: res.promoter.apmi_member
        });
      }
    }

    return report;
  }
}

module.exports = {
  PromoterImportService
};
