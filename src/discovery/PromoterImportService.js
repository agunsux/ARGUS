/**
 * ARGUS / TIKUM Promoter Import Service
 * 
 * Ingests CSV / JSON lists of promoter candidates and Instagram handles.
 * Executes deterministic identity resolution against APMI and official domains,
 * flagging potential duplicates without destructive overwrites.
 */

const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { promoterRegistry, PROMOTER_STATUS } = require('./PromoterDiscoveryRegistry');
const { apmiPromoterRegistry } = require('./ApmiPromoterRegistry');
const { state, recordAuditLog } = require('../database');

// CSV upload constraints for the admin import workflow
const MAX_CSV_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_STAGED_PREVIEWS = 50;
const SUPPORTED_COLUMNS = ['promoter_name', 'instagram_handle', 'instagram_url', 'website_url', 'city', 'category', 'notes'];

// Transient staged previews awaiting explicit admin confirmation (never persisted to disk)
const stagedPreviews = new Map();

class PromoterImportService {
  /**
   * Low-level CSV row parser (shared by parseCSV and the validation workflow).
   * Handles quoted fields, BOM, and blank lines. Returns row_number as the
   * 1-based physical line number (header is line 1).
   */
  static _parseRows(csvContent) {
    if (!csvContent || typeof csvContent !== 'string') return { header: [], rows: [] };

    const lines = csvContent
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .filter(line => line.trim().length > 0);

    if (lines.length === 0) return { header: [], rows: [] };

    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

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

      rows.push({ row_number: i + 1, raw: line, values: rowObj });
    }

    return { header, rows };
  }

  /**
   * Parses CSV string into structured array of candidate objects.
   * Expected columns: promoter_name,instagram_handle,instagram_url,website_url,city,category,notes
   */
  static parseCSV(csvContent) {
    const { rows } = PromoterImportService._parseRows(csvContent);
    const results = [];

    for (const r of rows) {
      const rowObj = r.values;
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

  // ==========================================================================
  // ADMIN CSV IMPORT WORKFLOW (validate → preview → confirm)
  // ==========================================================================

  /**
   * Validates raw CSV content WITHOUT mutating any registry state.
   * Returns structure errors plus per-row validation results.
   */
  static validateCSV(csvContent) {
    const structure_errors = [];
    const { header, rows } = PromoterImportService._parseRows(csvContent);

    if (!header.length) structure_errors.push('CSV is empty or missing a header row');
    if (!header.includes('promoter_name')) structure_errors.push('Missing required column: promoter_name');
    if (!header.includes('instagram_handle') && !header.includes('instagram_url') && !header.includes('website_url')) {
      structure_errors.push('CSV must contain at least one identity column: instagram_handle, instagram_url, or website_url');
    }

    const outRows = [];
    const seenRows = new Map();
    const seenHandles = new Map();
    const seenNames = new Map();
    let errorCount = 0;
    let warningCount = 0;

    if (structure_errors.length === 0) {
      for (const r of rows) {
        const v = r.values;
        const errors = [];
        const warnings = [];

        // Neutralize CSV formula injection for free-text fields.
        const cleanText = (field, value) => {
          let s = (value === undefined || value === null) ? '' : String(value).trim();
          if (/^[=+\-]/.test(s)) {
            warnings.push(`Field '${field}' began with a formula character and was neutralized`);
            s = `'${s}`;
          }
          return s;
        };

        const promoter_name = cleanText('promoter_name', v.promoter_name);
        const city = cleanText('city', v.city);
        const category = cleanText('category', v.category);
        const notes = cleanText('notes', v.notes);
        const rawHandle = (v.instagram_handle || v.handle || '').trim();
        const instagram_url = (v.instagram_url || '').trim();
        const website_url = (v.website_url || '').trim();

        if (!promoter_name) errors.push('promoter_name is empty');

        let instagram_handle = null;
        if (rawHandle) {
          const h = rawHandle.replace(/^@/, '').trim();
          // Instagram rules: 1-30 chars, letters/numbers/period/underscore, must
          // start alphanumeric, cannot end with a period, no consecutive periods.
          if (!/^[A-Za-z0-9](?:[A-Za-z0-9._]{0,28}[A-Za-z0-9_])?$/.test(h) || h.includes('..')) {
            errors.push(`Malformed Instagram handle: "${rawHandle}"`);
          } else {
            instagram_handle = `@${h.toLowerCase()}`;
          }
        }

        if (instagram_url && !/^(https?:\/\/)?(www\.)?instagram\.com\/[A-Za-z0-9._]{1,30}\/?$/i.test(instagram_url)) {
          errors.push(`Malformed Instagram URL: "${instagram_url}"`);
        }

        if (website_url) {
          try {
            const u = new URL(website_url);
            if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) throw new Error('bad');
          } catch {
            errors.push(`Malformed website URL: "${website_url}"`);
          }
        }

        if (!instagram_handle && !instagram_url && !website_url) {
          errors.push('Row has no Instagram handle, Instagram URL, or website URL');
        }

        // Duplicate detection within the CSV file
        const normalizedName = promoter_name.toLowerCase().replace(/\s+/g, ' ').trim();
        const normalizedHandle = instagram_handle ? instagram_handle.toLowerCase() : null;
        const rowSignature = [normalizedName, normalizedHandle || '', website_url.toLowerCase()].join('|');

        if (normalizedName && seenRows.has(rowSignature)) {
          errors.push(`Duplicate row (identical to row ${seenRows.get(rowSignature)})`);
        } else if (normalizedName) {
          seenRows.set(rowSignature, r.row_number);
        }

        if (normalizedHandle) {
          if (seenHandles.has(normalizedHandle)) {
            errors.push(`Duplicate Instagram handle ${instagram_handle} (already used in row ${seenHandles.get(normalizedHandle)})`);
          } else {
            seenHandles.set(normalizedHandle, r.row_number);
          }
        }

        if (normalizedName) {
          if (seenNames.has(normalizedName)) {
            errors.push(`Duplicate promoter name "${promoter_name}" (already used in row ${seenNames.get(normalizedName)})`);
          } else {
            seenNames.set(normalizedName, r.row_number);
          }
        }

        errorCount += errors.length;
        warningCount += warnings.length;

        outRows.push({
          row_number: r.row_number,
          values: { promoter_name, instagram_handle, instagram_url, website_url, city, category, notes },
          candidate: {
            promoter_name,
            canonical_name: promoter_name,
            instagram_handle,
            instagram_url: instagram_url || (instagram_handle ? `https://www.instagram.com/${instagram_handle.replace('@', '')}/` : null),
            website_url: website_url || null,
            city: city || null,
            category: category || null,
            notes: notes || null
          },
          errors,
          warnings
        });
      }
    }

    return {
      ok: structure_errors.length === 0,
      structure_errors,
      header,
      supported_columns: SUPPORTED_COLUMNS,
      // When the structure is invalid no row is eligible for processing.
      total_rows: structure_errors.length === 0 ? rows.length : 0,
      error_count: errorCount,
      warning_count: warningCount,
      rows: outRows
    };
  }

  /**
   * Read-only diff of what a non-destructive merge would change (powers preview).
   */
  static _previewChanges(promoter, candidate) {
    const changes = [];
    for (const field of ['website_url', 'city', 'category', 'instagram_url', 'legal_name', 'province']) {
      if (candidate[field] && !promoter[field]) changes.push(field);
    }
    const cleanH = candidate.instagram_handle ? candidate.instagram_handle.replace('@', '') : null;
    const socialUrl = candidate.instagram_url || (cleanH ? `https://www.instagram.com/${cleanH}/` : null);
    if (socialUrl && !(promoter.official_social_urls || []).includes(socialUrl)) changes.push('official_social_urls');
    if (!promoter.apmi_member && promoterRegistry.matchApmiMember({
      canonical_name: promoter.canonical_name,
      instagram_handle: candidate.instagram_handle || promoter.instagram_handle
    })) {
      changes.push('apmi_member');
    }
    return changes;
  }

  /**
   * Validates + classifies a CSV WITHOUT mutating the registry.
   * Stages the content for a subsequent explicit confirmation.
   */
  static previewImport(csvContent, { filename = null } = {}) {
    if (typeof csvContent !== 'string') {
      const err = new Error('csv_content must be a CSV string');
      err.code = 'INVALID_INPUT';
      err.status = 400;
      throw err;
    }
    if (Buffer.byteLength(csvContent, 'utf8') > MAX_CSV_BYTES) {
      const err = new Error(`CSV exceeds maximum size of ${MAX_CSV_BYTES} bytes`);
      err.code = 'FILE_TOO_LARGE';
      err.status = 413;
      throw err;
    }

    const validation = PromoterImportService.validateCSV(csvContent);
    const report = PromoterImportService._emptyReport(validation.total_rows);
    const previewRows = [];

    for (const row of validation.rows) {
      if (row.errors.length > 0) {
        report.VALIDATION_ERRORS++;
        if (row.errors.some(e => e.startsWith('Duplicate'))) report.DUPLICATES++;
        report.errors.push({ row_number: row.row_number, errors: row.errors });
        previewRows.push({
          row_number: row.row_number,
          action: 'VALIDATION_ERROR',
          canonical_name: row.candidate.canonical_name,
          errors: row.errors,
          warnings: row.warnings
        });
        continue;
      }

      const candidate = row.candidate;
      const match = promoterRegistry.resolveIdentity(candidate);
      let action;
      let detail = {};

      if (match) {
        const changes = PromoterImportService._previewChanges(match.promoter, candidate);
        action = changes.length ? 'UPDATED' : 'UNCHANGED';
        detail = { match_type: match.match_type, match_reason: match.reason, changes };
        if (match.promoter.verification_status === PROMOTER_STATUS.VERIFIED_OFFICIAL_PROMOTER_ACCOUNT) {
          report.ALREADY_VERIFIED++;
        }
        if (match.promoter.apmi_member) report.APMI_MATCHES++;
      } else {
        const possible = promoterRegistry.findPossibleDuplicates(candidate);
        if (possible.length > 0) {
          action = 'POSSIBLE_DUPLICATE';
          detail = { possible_matches: possible };
        } else {
          action = 'IMPORTED';
          const apmi = promoterRegistry.matchApmiMember(candidate);
          detail = { apmi_member: !!apmi, apmi_match: apmi ? apmi.name : null };
          if (apmi) report.APMI_MATCHES++;
          else report.NEW_DISCOVERED++;
        }
      }

      if (action === 'IMPORTED') report.IMPORTED++;
      else if (action === 'UPDATED') report.UPDATED++;
      else if (action === 'UNCHANGED') report.UNCHANGED++;
      else if (action === 'POSSIBLE_DUPLICATE') report.POSSIBLE_DUPLICATES++;

      previewRows.push({
        row_number: row.row_number,
        action,
        canonical_name: candidate.canonical_name,
        instagram_handle: candidate.instagram_handle,
        city: candidate.city,
        category: candidate.category,
        warnings: row.warnings,
        ...detail
      });
    }

    const preview_id = `preview-${uuidv4()}`;
    const generated_at = new Date().toISOString();
    stagedPreviews.set(preview_id, { csv_content: csvContent, filename, generated_at });
    while (stagedPreviews.size > MAX_STAGED_PREVIEWS) {
      stagedPreviews.delete(stagedPreviews.keys().next().value);
    }

    return {
      preview_id,
      filename: filename || 'inline.csv',
      generated_at,
      ok: validation.ok,
      structure_errors: validation.structure_errors,
      warnings: previewRows
        .filter(r => (r.warnings || []).length > 0)
        .map(r => ({ row_number: r.row_number, warnings: r.warnings })),
      summary: {
        TOTAL_ROWS: report.TOTAL_ROWS,
        IMPORTED: report.IMPORTED,
        UPDATED: report.UPDATED,
        UNCHANGED: report.UNCHANGED,
        DUPLICATES: report.DUPLICATES,
        POSSIBLE_DUPLICATES: report.POSSIBLE_DUPLICATES,
        VALIDATION_ERRORS: report.VALIDATION_ERRORS,
        APMI_MATCHES: report.APMI_MATCHES,
        ALREADY_VERIFIED: report.ALREADY_VERIFIED,
        NEW_DISCOVERED: report.NEW_DISCOVERED
      },
      rows: previewRows
    };
  }

  /**
   * Confirms a previously previewed (or freshly supplied) CSV and applies the
   * upserts to the PromoterDiscoveryRegistry (the system of record).
   * Idempotent: re-importing the same file yields UNCHANGED, never duplicates.
   */
  static confirmImport({ csv_content = null, preview_id = null, filename = null, admin_id = 'admin-1', source = 'ADMIN_CSV_IMPORT' } = {}) {
    let content = csv_content;
    let fname = filename;

    if (!content && preview_id) {
      const staged = stagedPreviews.get(preview_id);
      if (staged) {
        content = staged.csv_content;
        fname = fname || staged.filename;
      }
    }
    if (!content || typeof content !== 'string') {
      const err = new Error('No CSV content or valid preview_id supplied for confirmation');
      err.code = 'NO_CONTENT';
      err.status = 400;
      throw err;
    }
    if (Buffer.byteLength(content, 'utf8') > MAX_CSV_BYTES) {
      const err = new Error(`CSV exceeds maximum size of ${MAX_CSV_BYTES} bytes`);
      err.code = 'FILE_TOO_LARGE';
      err.status = 413;
      throw err;
    }

    const validation = PromoterImportService.validateCSV(content);
    if (validation.structure_errors.length > 0) {
      const err = new Error(validation.structure_errors.join('; '));
      err.code = 'INVALID_STRUCTURE';
      err.status = 400;
      err.structure_errors = validation.structure_errors;
      throw err;
    }

    const report = PromoterImportService._emptyReport(validation.total_rows);

    for (const row of validation.rows) {
      if (row.errors.length > 0) {
        report.VALIDATION_ERRORS++;
        if (row.errors.some(e => e.startsWith('Duplicate'))) report.DUPLICATES++;
        report.errors.push({ row_number: row.row_number, errors: row.errors });
        report.results.push({
          row_number: row.row_number,
          action: 'VALIDATION_ERROR',
          canonical_name: row.candidate.canonical_name,
          errors: row.errors
        });
        continue;
      }

      const res = promoterRegistry.upsertPromoter(row.candidate);

      if (res.action === 'CREATED') {
        report.IMPORTED++;
        if (res.promoter.verification_status !== PROMOTER_STATUS.VERIFIED_OFFICIAL_PROMOTER_ACCOUNT) report.NEW_DISCOVERED++;
      } else if (res.action === 'UPDATED') {
        report.UPDATED++;
      } else if (res.action === 'UNCHANGED') {
        report.UNCHANGED++;
      } else if (res.action === 'POSSIBLE_DUPLICATE_FLAGGED') {
        report.POSSIBLE_DUPLICATES++;
      } else if (res.action === 'INVALID') {
        report.VALIDATION_ERRORS++;
        report.errors.push({ row_number: row.row_number, errors: [res.reason] });
      }

      const promoter = res.promoter || res.existing_promoter || null;
      if (promoter && promoter.apmi_member) report.APMI_MATCHES++;
      if (res.already_verified) report.ALREADY_VERIFIED++;

      report.results.push({
        row_number: row.row_number,
        action: res.action,
        promoter_id: promoter ? promoter.promoter_id : null,
        canonical_name: promoter ? promoter.canonical_name : row.candidate.canonical_name,
        status: promoter ? promoter.verification_status : 'POSSIBLE_DUPLICATE',
        verification_preserved: !!res.verification_preserved,
        already_verified: !!res.already_verified,
        match_type: res.match_type || (res.action === 'POSSIBLE_DUPLICATE_FLAGGED' ? 'FUZZY_NAME' : 'NEW'),
        changes: res.changes || []
      });
    }

    const import_id = `pimp-${uuidv4()}`;
    const imported_at = new Date().toISOString();
    const success_count = report.IMPORTED + report.UPDATED + report.UNCHANGED + report.POSSIBLE_DUPLICATES;

    const historyEntry = {
      import_id,
      filename: fname || 'inline.csv',
      imported_at,
      admin_id,
      row_count: report.TOTAL_ROWS,
      success_count,
      error_count: report.VALIDATION_ERRORS,
      source,
      status: 'COMPLETED'
    };

    state.promoter_imports = state.promoter_imports || [];
    state.promoter_imports.push(historyEntry);
    if (state.promoter_imports.length > 500) {
      state.promoter_imports = state.promoter_imports.slice(-500);
    }

    if (preview_id) stagedPreviews.delete(preview_id);

    try {
      const audit = recordAuditLog('PROMOTER_REGISTRY', import_id, 'CSV_IMPORT_CONFIRMED', admin_id, {
        filename: historyEntry.filename,
        row_count: historyEntry.row_count,
        success_count,
        error_count: historyEntry.error_count,
        imported: report.IMPORTED,
        updated: report.UPDATED,
        unchanged: report.UNCHANGED,
        possible_duplicates: report.POSSIBLE_DUPLICATES,
        validation_errors: report.VALIDATION_ERRORS,
        apmi_matches: report.APMI_MATCHES
      });
      if (audit && typeof audit.catch === 'function') audit.catch(() => {});
    } catch {
      // Audit logging is best-effort and must never block the import workflow
    }

    return {
      import_id,
      filename: historyEntry.filename,
      imported_at,
      admin_id,
      source,
      status: 'COMPLETED',
      row_count: report.TOTAL_ROWS,
      success_count,
      error_count: report.VALIDATION_ERRORS,
      TOTAL_ROWS: report.TOTAL_ROWS,
      IMPORTED: report.IMPORTED,
      UPDATED: report.UPDATED,
      UNCHANGED: report.UNCHANGED,
      DUPLICATES: report.DUPLICATES,
      POSSIBLE_DUPLICATES: report.POSSIBLE_DUPLICATES,
      VALIDATION_ERRORS: report.VALIDATION_ERRORS,
      APMI_MATCHES: report.APMI_MATCHES,
      ALREADY_VERIFIED: report.ALREADY_VERIFIED,
      NEW_DISCOVERED: report.NEW_DISCOVERED,
      results: report.results,
      errors: report.errors,
      history: historyEntry
    };
  }

  /**
   * Returns recent admin import history records (most recent first).
   */
  static getImportHistory(limit = 50) {
    const list = (state.promoter_imports || []).slice();
    return list.slice(-limit).reverse();
  }

  static _emptyReport(totalRows = 0) {
    return {
      TOTAL_ROWS: totalRows,
      IMPORTED: 0,
      UPDATED: 0,
      UNCHANGED: 0,
      DUPLICATES: 0,
      POSSIBLE_DUPLICATES: 0,
      VALIDATION_ERRORS: 0,
      APMI_MATCHES: 0,
      ALREADY_VERIFIED: 0,
      NEW_DISCOVERED: 0,
      results: [],
      errors: []
    };
  }
}

module.exports = {
  PromoterImportService,
  MAX_CSV_BYTES,
  SUPPORTED_COLUMNS
};
