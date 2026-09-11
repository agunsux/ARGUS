/**
 * ARGUS / TIKUM Promoter Discovery Registry
 * 
 * Centralized, authoritative directory of Indonesian concert promoters,
 * music festival organizers, and entertainment producers.
 * 
 * Strategic Model: "Follow the Promoter, Not the Ticketing Platform"
 * - Account-level verification: DISCOVERED -> IDENTITY_MATCHED -> VERIFIED_OFFICIAL_PROMOTER_ACCOUNT
 * - When verified, promoter official social handles become Tier S Primary Event Sources
 * - Preserves immutable provenance and duplicate candidate tracking
 */

const { v4: uuidv4 } = require('uuid');
const { sourceRegistry, TRUST_LEVELS } = require('./SourceRegistry');
const { apmiPromoterRegistry } = require('./ApmiPromoterRegistry');

const PROMOTER_STATUS = {
  DISCOVERED: 'DISCOVERED',
  IDENTITY_MATCHED: 'IDENTITY_MATCHED',
  PARTIALLY_VERIFIED: 'PARTIALLY_VERIFIED',
  VERIFIED_OFFICIAL_PROMOTER_ACCOUNT: 'VERIFIED_OFFICIAL_PROMOTER_ACCOUNT',
  VERIFIED: 'VERIFIED_OFFICIAL_PROMOTER_ACCOUNT', // standard alias
  REJECTED: 'REJECTED',
  INACTIVE: 'INACTIVE'
};

const PROMOTER_AUTHORITY = {
  UNKNOWN: 'UNKNOWN',
  DISCOVERY: 'DISCOVERY',
  VERIFIED_PROMOTER: 'VERIFIED_PROMOTER',
  OFFICIAL_AUTHORITY: 'OFFICIAL_AUTHORITY' // Tier S
};

class PromoterDiscoveryRegistry {
  constructor() {
    this.promoters = new Map(); // promoter_id -> record
    this.slugMap = new Map(); // slug -> promoter_id
    this.handleMap = new Map(); // normalized handle -> promoter_id
    this._initializeCuratedPromoters();
  }

  _cleanHandle(handle) {
    if (!handle) return '';
    return handle.trim().toLowerCase().replace(/^@/, '');
  }

  _generateSlug(name) {
    return (name || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  _extractHandle(member) {
    if (member.instagram_handle) return member.instagram_handle;
    if (member.social_instagram) return `@${member.social_instagram.replace(/^@/, '')}`;
    const url = member.instagram || member.instagram_url;
    if (url) {
      const m = url.match(/instagram\.com\/([a-zA-Z0-9._]+)/i);
      if (m) return `@${m[1].replace(/\/$/, '')}`;
    }
    return null;
  }

  _initializeCuratedPromoters() {
    // Seed with APMI Accredited Promoters
    const apmiMembers = apmiPromoterRegistry.getAllMembers();
    for (const member of apmiMembers) {
      const handle = this._extractHandle(member);
      const cleanH = this._cleanHandle(handle);
      const promoterId = `prm-${member.slug}`;
      const canonicalName = member.name || member.canonical_name;
      const now = new Date().toISOString();

      const record = {
        promoter_id: promoterId,
        canonical_name: canonicalName,
        legal_name: member.legal_name || member.legal_entity || canonicalName,
        slug: member.slug,
        instagram_handle: handle,
        instagram_url: member.instagram || member.instagram_url || (cleanH ? `https://www.instagram.com/${cleanH}/` : null),
        website_url: member.website || member.website_url,
        city: (member.primary_cities && member.primary_cities[0]) || member.city || 'Jakarta',
        province: member.province || 'DKI Jakarta',
        country: 'Indonesia',
        category: member.focus_area || 'CONCERT',
        apmi_member: true,
        apmi_member_source: 'src-assoc-apmi',
        verification_status: PROMOTER_STATUS.VERIFIED_OFFICIAL_PROMOTER_ACCOUNT,
        authority_level: PROMOTER_AUTHORITY.OFFICIAL_AUTHORITY,
        source_id: cleanH ? `src-promoter-${member.slug}-instagram` : null,
        source_ids: cleanH ? [`src-promoter-${member.slug}-instagram`, 'src-assoc-apmi'] : ['src-assoc-apmi'],
        official_social_urls: cleanH ? [`https://www.instagram.com/${cleanH}/`] : [],
        provenance_records: [
          {
            source: 'src-assoc-apmi',
            source_url: 'https://apmi.co.id/#members',
            claim: 'Official APMI Accredited Member Promoter',
            authority_scope: 'PROMOTER_IDENTITY',
            confidence: 'HIGH',
            evidence: 'Published in APMI official member registry',
            retrieved_at: now
          }
        ],
        duplicate_candidates: [],
        account_verified_at: '2026-09-01T00:00:00Z',
        created_at: now,
        updated_at: now,
        last_verified_at: now,
        notes: member.signature_events ? `APMI member: ${member.signature_events.join(', ')}` : (member.key_productions || 'Official APMI Member')
      };

      if (cleanH) {
        record.provenance_records.push({
          source: record.source_id,
          source_url: record.instagram_url,
          claim: 'Official Promoter Instagram Account (Tier S Primary Source)',
          authority_scope: 'EVENT',
          confidence: 'HIGH',
          evidence: 'Cross-referenced with official promoter website and APMI membership',
          retrieved_at: now
        });
        
        // Register into sourceRegistry
        sourceRegistry.registerVerifiedPromoterSocial(
          promoterId,
          canonicalName,
          handle,
          record.instagram_url
        );
      }

      this.promoters.set(promoterId, record);
      this.slugMap.set(member.slug, promoterId);
      if (cleanH) {
        this.handleMap.set(cleanH, promoterId);
      }
    }
  }

  /**
   * Registers a new promoter candidate.
   * Performs duplicate candidate detection.
   */
  registerCandidate(candidateData) {
    const canonicalName = candidateData.canonical_name || candidateData.promoter_name || candidateData.name;
    if (!canonicalName) {
      throw new Error('Promoter name is required');
    }

    const slug = candidateData.slug || this._generateSlug(canonicalName);
    const rawHandle = candidateData.instagram_handle || candidateData.handle;
    const cleanH = this._cleanHandle(rawHandle);
    const handleWithAt = cleanH ? `@${cleanH}` : null;

    // Check for existing duplicates
    let existing = null;
    let duplicateReason = null;

    if (cleanH && this.handleMap.has(cleanH)) {
      existing = this.promoters.get(this.handleMap.get(cleanH));
      duplicateReason = `Exact Instagram handle collision: @${cleanH}`;
    } else if (this.slugMap.has(slug)) {
      existing = this.promoters.get(this.slugMap.get(slug));
      duplicateReason = `Exact slug collision: ${slug}`;
    } else {
      // Check website collision if provided
      if (candidateData.website_url) {
        const cleanWeb = candidateData.website_url.replace(/\/$/, '').toLowerCase();
        for (const p of this.promoters.values()) {
          if (p.website_url && p.website_url.replace(/\/$/, '').toLowerCase() === cleanWeb) {
            existing = p;
            duplicateReason = `Official website domain match: ${cleanWeb}`;
            break;
          }
        }
      }
    }

    const now = new Date().toISOString();

    if (existing) {
      // Flag duplicate candidate on existing promoter without destructive overwrite
      const duplicateRecord = {
        incoming_candidate: candidateData,
        reason: duplicateReason,
        flagged_at: now,
        status: 'POSSIBLE_DUPLICATE'
      };
      existing.duplicate_candidates = existing.duplicate_candidates || [];
      existing.duplicate_candidates.push(duplicateRecord);
      existing.updated_at = now;

      return {
        action: 'DUPLICATE_FLAGGED',
        status: 'POSSIBLE_DUPLICATE',
        existing_promoter: existing,
        duplicate_record: duplicateRecord
      };
    }

    // Determine initial verification status
    let status = candidateData.verification_status || PROMOTER_STATUS.DISCOVERED;
    let authority = PROMOTER_AUTHORITY.UNKNOWN;
    const provenanceRecords = candidateData.provenance_records || [];

    // Check against APMI
    const apmiMatch = apmiPromoterRegistry.getMemberBySlug(slug) || 
                      (cleanH ? apmiPromoterRegistry.getAllMembers().find(m => this._cleanHandle(m.social_instagram) === cleanH) : null);

    let isApmi = Boolean(candidateData.apmi_member || apmiMatch);
    if (apmiMatch) {
      status = PROMOTER_STATUS.VERIFIED_OFFICIAL_PROMOTER_ACCOUNT;
      authority = PROMOTER_AUTHORITY.OFFICIAL_AUTHORITY;
      isApmi = true;
      provenanceRecords.push({
        source: 'src-assoc-apmi',
        source_url: 'https://apmi.co.id/#members',
        claim: 'APMI Member Match during import',
        authority_scope: 'PROMOTER_IDENTITY',
        confidence: 'HIGH',
        evidence: `Matched APMI Member: ${apmiMatch.canonical_name}`,
        retrieved_at: now
      });
    }

    const promoterId = candidateData.promoter_id || `prm-${slug || uuidv4().substring(0, 8)}`;
    const sourceId = cleanH ? `src-promoter-${slug}-instagram` : null;

    const newRecord = {
      promoter_id: promoterId,
      canonical_name: canonicalName,
      legal_name: candidateData.legal_name || canonicalName,
      slug: slug,
      instagram_handle: handleWithAt,
      instagram_url: candidateData.instagram_url || (cleanH ? `https://www.instagram.com/${cleanH}/` : null),
      website_url: candidateData.website_url || null,
      city: candidateData.city || 'Jakarta',
      province: candidateData.province || 'DKI Jakarta',
      country: 'Indonesia',
      category: candidateData.category || 'CONCERT',
      apmi_member: isApmi,
      apmi_member_source: isApmi ? 'src-assoc-apmi' : null,
      verification_status: status,
      authority_level: authority,
      source_id: sourceId,
      source_ids: sourceId ? [sourceId] : [],
      official_social_urls: candidateData.official_social_urls || (cleanH ? [`https://www.instagram.com/${cleanH}/`] : []),
      provenance_records: provenanceRecords,
      duplicate_candidates: [],
      account_verified_at: status === PROMOTER_STATUS.VERIFIED_OFFICIAL_PROMOTER_ACCOUNT ? now : null,
      created_at: now,
      updated_at: now,
      last_verified_at: now,
      notes: candidateData.notes || 'Imported promoter candidate'
    };

    if (cleanH) {
      newRecord.provenance_records.push({
        source: 'DISCOVERY_IMPORT',
        source_url: newRecord.instagram_url,
        claim: `Social handle candidate @${cleanH}`,
        authority_scope: 'SOCIAL_IDENTITY',
        confidence: isApmi ? 'HIGH' : 'MEDIUM',
        evidence: candidateData.notes || 'Curated candidate import',
        retrieved_at: now
      });
    }

    // If verified immediately (e.g. APMI match), register in SourceRegistry as Tier S
    if (status === PROMOTER_STATUS.VERIFIED_OFFICIAL_PROMOTER_ACCOUNT && cleanH) {
      sourceRegistry.registerVerifiedPromoterSocial(
        promoterId,
        canonicalName,
        handleWithAt,
        newRecord.instagram_url
      );
    }

    this.promoters.set(promoterId, newRecord);
    this.slugMap.set(slug, promoterId);
    if (cleanH) {
      this.handleMap.set(cleanH, promoterId);
    }

    return {
      action: 'CREATED',
      status: newRecord.verification_status,
      promoter: newRecord
    };
  }

  /**
   * Promotes candidate through verification stages.
   * DISCOVERED -> IDENTITY_MATCHED -> VERIFIED_OFFICIAL_PROMOTER_ACCOUNT
   */
  verifyPromoter(promoterId, { evidence = '', verified_by = 'admin', website_match = false } = {}) {
    const promoter = this.getPromoterById(promoterId);
    if (!promoter) {
      throw new Error(`Promoter ${promoterId} not found`);
    }

    const now = new Date().toISOString();

    promoter.verification_status = PROMOTER_STATUS.VERIFIED_OFFICIAL_PROMOTER_ACCOUNT;
    promoter.authority_level = PROMOTER_AUTHORITY.OFFICIAL_AUTHORITY;
    promoter.account_verified_at = now;
    promoter.last_verified_at = now;
    promoter.updated_at = now;

    promoter.provenance_records.push({
      source: 'ADMIN_VERIFICATION',
      source_url: promoter.website_url || promoter.instagram_url,
      claim: 'Verified Official Promoter Account (Tier S Primary Event Source)',
      authority_scope: 'EVENT',
      confidence: 'HIGH',
      evidence: evidence || `Identity verified by ${verified_by} (website match: ${website_match})`,
      retrieved_at: now
    });

    // Register social handle in SourceRegistry as Tier S Primary Event Source
    if (promoter.instagram_handle) {
      sourceRegistry.registerVerifiedPromoterSocial(
        promoter.promoter_id,
        promoter.canonical_name,
        promoter.instagram_handle,
        promoter.instagram_url
      );
    }

    return promoter;
  }

  /**
   * Matches candidate identity against official website or corporate registry.
   * Moves status from DISCOVERED to IDENTITY_MATCHED.
   */
  matchIdentity(promoterId, { website_url, evidence = '' } = {}) {
    const promoter = this.getPromoterById(promoterId);
    if (!promoter) throw new Error(`Promoter ${promoterId} not found`);

    const now = new Date().toISOString();
    if (website_url) promoter.website_url = website_url;
    promoter.verification_status = PROMOTER_STATUS.IDENTITY_MATCHED;
    promoter.authority_level = PROMOTER_AUTHORITY.VERIFIED_PROMOTER;
    promoter.updated_at = now;

    promoter.provenance_records.push({
      source: 'IDENTITY_MATCH',
      source_url: website_url || promoter.website_url,
      claim: 'Identity Matched with official promoter entity',
      authority_scope: 'PROMOTER_IDENTITY',
      confidence: 'MEDIUM',
      evidence: evidence || 'Official website backlink or business match confirmed',
      retrieved_at: now
    });

    return promoter;
  }

  /**
   * Rejects promoter candidate (e.g. scalper, parody, fraudulent, unverified).
   */
  rejectPromoter(promoterId, reason = 'Failed official identity verification') {
    const promoter = this.getPromoterById(promoterId);
    if (!promoter) throw new Error(`Promoter ${promoterId} not found`);

    const now = new Date().toISOString();
    promoter.verification_status = PROMOTER_STATUS.REJECTED;
    promoter.authority_level = PROMOTER_AUTHORITY.DISCOVERY;
    promoter.updated_at = now;
    promoter.provenance_records.push({
      source: 'ADMIN_ACTION',
      claim: 'Promoter Rejected',
      authority_scope: 'PROMOTER_IDENTITY',
      confidence: 'HIGH',
      evidence: reason,
      retrieved_at: now
    });

    return promoter;
  }

  /**
   * Marks promoter as inactive.
   */
  inactivatePromoter(promoterId, reason = 'Ceased live event production') {
    const promoter = this.getPromoterById(promoterId);
    if (!promoter) throw new Error(`Promoter ${promoterId} not found`);

    const now = new Date().toISOString();
    promoter.verification_status = PROMOTER_STATUS.INACTIVE;
    promoter.updated_at = now;
    promoter.provenance_records.push({
      source: 'ADMIN_ACTION',
      claim: 'Promoter Inactivated',
      authority_scope: 'PROMOTER_IDENTITY',
      confidence: 'HIGH',
      evidence: reason,
      retrieved_at: now
    });

    return promoter;
  }

  /**
   * Merges duplicate candidate into primary promoter record.
   */
  mergePromoters(targetId, duplicateId, reason = 'Consolidated duplicate account') {
    const target = this.getPromoterById(targetId);
    const duplicate = this.getPromoterById(duplicateId);
    if (!target || !duplicate) throw new Error('Both target and duplicate promoter must exist');

    const now = new Date().toISOString();

    // Copy provenance records
    target.provenance_records.push(...(duplicate.provenance_records || []));
    target.provenance_records.push({
      source: 'ADMIN_MERGE',
      claim: `Merged duplicate candidate ${duplicate.canonical_name} (${duplicate.promoter_id})`,
      authority_scope: 'PROMOTER_IDENTITY',
      confidence: 'HIGH',
      evidence: reason,
      retrieved_at: now
    });

    // Merge social urls
    const socials = new Set([...(target.official_social_urls || []), ...(duplicate.official_social_urls || [])]);
    target.official_social_urls = Array.from(socials);

    // Remove duplicate
    this.promoters.delete(duplicate.promoter_id);
    if (duplicate.slug && this.slugMap.get(duplicate.slug) === duplicate.promoter_id) {
      this.slugMap.delete(duplicate.slug);
    }
    const cleanD = this._cleanHandle(duplicate.instagram_handle);
    if (cleanD && this.handleMap.get(cleanD) === duplicate.promoter_id) {
      this.handleMap.delete(cleanD);
    }

    target.updated_at = now;
    return target;
  }

  // ==========================================================================
  // CSV IMPORT WORKFLOW PRIMITIVES (identity resolution + non-destructive upsert)
  // ==========================================================================

  /**
   * Derives a canonical website domain (hostname only, no protocol/www/path).
   * Returns null for empty values. Instagram domains are excluded by callers
   * because they are identity handles, not corporate website identity.
   */
  _canonicalDomain(url) {
    if (!url || typeof url !== 'string') return null;
    let u = url.trim().toLowerCase();
    u = u.replace(/^https?:\/\//, '').replace(/^www\./, '');
    u = u.split('/')[0].split('?')[0].split('#')[0];
    return u || null;
  }

  /**
   * Deterministic APMI cross-reference (exact slug, exact name, or exact handle).
   * Read-only: does not mutate registry state.
   */
  matchApmiMember(candidateData = {}) {
    const name = candidateData.canonical_name || candidateData.promoter_name || candidateData.name;
    const slug = candidateData.slug || this._generateSlug(name);
    const members = apmiPromoterRegistry.getAllMembers();

    if (slug) {
      const bySlug = members.find(m => m.slug === slug);
      if (bySlug) return bySlug;
    }
    if (name) {
      const cleanName = String(name).toLowerCase().trim();
      const byName = members.find(m => (m.name || '').toLowerCase().trim() === cleanName);
      if (byName) return byName;
    }
    const cleanH = this._cleanHandle(candidateData.instagram_handle || candidateData.handle);
    if (cleanH) {
      const byHandle = members.find(m => this._cleanHandle(this._extractHandle(m)) === cleanH);
      if (byHandle) return byHandle;
    }
    return null;
  }

  /**
   * Deterministic identity resolution for an incoming candidate.
   * Priority (per TIKUM CSV import policy):
   *   1. promoter_id (if supplied)
   *   2. normalized Instagram handle
   *   3. canonical website domain
   *   4. deterministic promoter identity (slug) match
   * Returns { promoter, match_type, reason } or null. Never merges fuzzy names.
   */
  resolveIdentity(candidateData = {}) {
    // 1. promoter_id if supplied
    if (candidateData.promoter_id) {
      const byId = this.getPromoterById(candidateData.promoter_id);
      if (byId) {
        return { promoter: byId, match_type: 'PROMOTER_ID', reason: `promoter_id match: ${candidateData.promoter_id}` };
      }
    }

    // 2. normalized Instagram handle
    const cleanH = this._cleanHandle(candidateData.instagram_handle || candidateData.handle);
    if (cleanH && this.handleMap.has(cleanH)) {
      return {
        promoter: this.promoters.get(this.handleMap.get(cleanH)),
        match_type: 'INSTAGRAM_HANDLE',
        reason: `Normalized Instagram handle match: @${cleanH}`
      };
    }

    // 3. canonical website domain (ignore instagram domains)
    const domain = this._canonicalDomain(candidateData.website_url);
    if (domain && !domain.endsWith('instagram.com')) {
      for (const p of this.promoters.values()) {
        const pd = this._canonicalDomain(p.website_url);
        if (pd && pd === domain) {
          return { promoter: p, match_type: 'WEBSITE_DOMAIN', reason: `Canonical website domain match: ${domain}` };
        }
      }
    }

    // 4. deterministic promoter slug / identity match
    const name = candidateData.canonical_name || candidateData.promoter_name || candidateData.name;
    const slug = candidateData.slug || this._generateSlug(name);
    if (slug && this.slugMap.has(slug)) {
      return {
        promoter: this.promoters.get(this.slugMap.get(slug)),
        match_type: 'SLUG',
        reason: `Deterministic promoter identity match: ${slug}`
      };
    }

    return null;
  }

  _normalizedNameTokens(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1);
  }

  /**
   * Token-Jaccard name similarity. Deterministic, no external dependencies.
   */
  _nameSimilarity(a, b) {
    const rawA = String(a || '').toLowerCase().trim();
    const rawB = String(b || '').toLowerCase().trim();
    if (!rawA || !rawB) return 0;
    if (rawA === rawB) return 1;

    const ta = new Set(this._normalizedNameTokens(rawA));
    const tb = new Set(this._normalizedNameTokens(rawB));
    if (ta.size === 0 || tb.size === 0) return 0;

    let intersection = 0;
    for (const t of ta) if (tb.has(t)) intersection++;
    const union = new Set([...ta, ...tb]).size;
    return union === 0 ? 0 : intersection / union;
  }

  /**
   * Fuzzy name proximity → POSSIBLE_DUPLICATE review only. Never auto-merges.
   */
  findPossibleDuplicates(candidateData = {}, threshold = 0.6) {
    const name = candidateData.canonical_name || candidateData.promoter_name || candidateData.name;
    if (!name) return [];

    const results = [];
    for (const p of this.promoters.values()) {
      const score = this._nameSimilarity(name, p.canonical_name);
      if (score >= threshold) {
        results.push({
          promoter_id: p.promoter_id,
          canonical_name: p.canonical_name,
          verification_status: p.verification_status,
          similarity: Number(score.toFixed(3)),
          reason: `Possible duplicate: name similarity ${(score * 100).toFixed(0)}% with "${p.canonical_name}"`
        });
      }
    }
    return results.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Non-destructive merge of CSV row data into an existing promoter record.
   * CRITICAL: NEVER downgrades an already-verified promoter. Only fills missing
   * fields and appends provenance when meaningful changes occur.
   */
  _mergeNonDestructive(target, candidateData, match) {
    const now = new Date().toISOString();
    const VERIFIED = PROMOTER_STATUS.VERIFIED_OFFICIAL_PROMOTER_ACCOUNT;
    const wasVerified = target.verification_status === VERIFIED;
    const changes = [];

    const fill = (field, incoming) => {
      if (incoming === undefined || incoming === null || incoming === '') return;
      if (!target[field]) {
        target[field] = incoming;
        changes.push(field);
      }
    };

    fill('website_url', candidateData.website_url);
    fill('city', candidateData.city);
    fill('category', candidateData.category);
    fill('instagram_url', candidateData.instagram_url);
    fill('legal_name', candidateData.legal_name);
    fill('province', candidateData.province);

    // Append newly discovered official social URL (never remove existing ones)
    const cleanH = this._cleanHandle(candidateData.instagram_handle || candidateData.handle);
    const socialUrl = candidateData.instagram_url || (cleanH ? `https://www.instagram.com/${cleanH}/` : null);
    if (socialUrl && !(target.official_social_urls || []).includes(socialUrl)) {
      target.official_social_urls = [...(target.official_social_urls || []), socialUrl];
      changes.push('official_social_urls');
    }

    // APMI cross-reference: only ever upgrades to true, never downgrades
    if (!target.apmi_member) {
      const apmiMatch = this.matchApmiMember({
        canonical_name: target.canonical_name,
        instagram_handle: candidateData.instagram_handle || target.instagram_handle,
        promoter_id: target.promoter_id
      });
      if (apmiMatch || candidateData.apmi_member === true) {
        target.apmi_member = true;
        target.apmi_member_source = 'src-assoc-apmi';
        changes.push('apmi_member');
      }
    }

    // Record non-destructive CSV provenance only when something meaningfully changed
    if (changes.length > 0) {
      target.provenance_records = target.provenance_records || [];
      target.provenance_records.push({
        source: 'CSV_IMPORT',
        source_url: candidateData.website_url || candidateData.instagram_url || null,
        claim: `Admin CSV import refresh (${match.match_type})`,
        authority_scope: 'PROMOTER_IDENTITY',
        confidence: 'MEDIUM',
        evidence: candidateData.notes || match.reason,
        retrieved_at: now
      });
    }

    // CRITICAL: preserve verification state — never downgrade a verified promoter
    if (wasVerified) {
      target.last_verified_at = target.last_verified_at || target.account_verified_at || now;
    }
    target.updated_at = now;

    return {
      action: changes.length > 0 ? 'UPDATED' : 'UNCHANGED',
      status: target.verification_status,
      promoter: target,
      changes,
      match_type: match.match_type,
      match_reason: match.reason,
      already_verified: wasVerified,
      verification_preserved: wasVerified,
      apmi_member: !!target.apmi_member
    };
  }

  /**
   * Idempotent, non-destructive upsert used by the admin CSV import workflow.
   * - Deterministic identity match → merge non-destructively (UPDATED/UNCHANGED)
   * - Fuzzy name proximity       → flag as POSSIBLE_DUPLICATE (no auto-merge)
   * - Genuinely new              → create as DISCOVERED (never auto-verified,
   *                                except when the existing APMI registry
   *                                deterministically establishes membership)
   */
  upsertPromoter(candidateData = {}) {
    const canonicalName = candidateData.canonical_name || candidateData.promoter_name || candidateData.name;
    if (!canonicalName || !String(canonicalName).trim()) {
      return { action: 'INVALID', validation_error: true, reason: 'Promoter name is required' };
    }

    const match = this.resolveIdentity(candidateData);
    if (match) {
      return this._mergeNonDestructive(match.promoter, candidateData, match);
    }

    const possible = this.findPossibleDuplicates(candidateData);
    if (possible.length > 0) {
      const target = this.getPromoterById(possible[0].promoter_id);
      const now = new Date().toISOString();
      target.duplicate_candidates = target.duplicate_candidates || [];
      const normalizedName = String(canonicalName).toLowerCase().trim();
      const alreadyFlagged = target.duplicate_candidates.some(
        d => (d.incoming_candidate?.canonical_name || '').toLowerCase().trim() === normalizedName
      );
      if (!alreadyFlagged) {
        target.duplicate_candidates.push({
          incoming_candidate: {
            canonical_name: canonicalName,
            instagram_handle: candidateData.instagram_handle || null,
            website_url: candidateData.website_url || null,
            city: candidateData.city || null
          },
          reason: possible[0].reason,
          flagged_at: now,
          status: 'POSSIBLE_DUPLICATE',
          match_type: 'FUZZY_NAME'
        });
        target.updated_at = now;
      }
      return {
        action: 'POSSIBLE_DUPLICATE_FLAGGED',
        status: 'POSSIBLE_DUPLICATE',
        existing_promoter: target,
        possible_matches: possible,
        already_flagged: alreadyFlagged
      };
    }

    // Brand-new promoter: normal creation path (APMI deterministic match may verify)
    return this.registerCandidate(candidateData);
  }

  /**
   * Admin registry view query supporting TIKUM filter tokens.
   * Tokens: ALL | DISCOVERED | IDENTITY_MATCHED | VERIFIED | REJECTED | INACTIVE | APMI | NON-APMI | POSSIBLE_DUPLICATE
   */
  queryPromoters(filter = {}) {
    let list = Array.from(this.promoters.values());
    const token = String(filter.status || filter.verification_status || 'ALL').toUpperCase();

    if (token && token !== 'ALL') {
      if (token === 'VERIFIED' || token === 'VERIFIED_OFFICIAL_PROMOTER_ACCOUNT') {
        list = list.filter(p => p.verification_status === PROMOTER_STATUS.VERIFIED_OFFICIAL_PROMOTER_ACCOUNT);
      } else if (token === 'APMI') {
        list = list.filter(p => p.apmi_member === true);
      } else if (token === 'NON-APMI') {
        list = list.filter(p => p.apmi_member !== true);
      } else if (token === 'POSSIBLE_DUPLICATE') {
        list = list.filter(p => (p.duplicate_candidates || []).length > 0);
      } else {
        list = list.filter(p => p.verification_status === token);
      }
    }

    if (filter.category) {
      list = list.filter(p => p.category && p.category.toUpperCase() === String(filter.category).toUpperCase());
    }
    if (filter.city) {
      list = list.filter(p => p.city && p.city.toLowerCase() === String(filter.city).toLowerCase());
    }

    return list;
  }

  /**
   * Bulk verification queue: promoters awaiting action, with evidence/source links
   * the admin needs in order to verify or reject. Never auto-verifies.
   */
  getVerificationQueue() {
    const queue = [];
    for (const p of this.promoters.values()) {
      const isPending =
        p.verification_status === PROMOTER_STATUS.DISCOVERED ||
        p.verification_status === PROMOTER_STATUS.IDENTITY_MATCHED ||
        p.verification_status === PROMOTER_STATUS.PARTIALLY_VERIFIED;
      const duplicates = (p.duplicate_candidates || []);
      if (!isPending && duplicates.length === 0) continue;

      queue.push({
        promoter_id: p.promoter_id,
        canonical_name: p.canonical_name,
        instagram_handle: p.instagram_handle,
        instagram_url: p.instagram_url,
        website_url: p.website_url,
        city: p.city,
        category: p.category,
        apmi_member: !!p.apmi_member,
        verification_status: p.verification_status,
        authority_level: p.authority_level,
        queue_bucket: duplicates.length > 0 ? 'POSSIBLE_DUPLICATE' : p.verification_status,
        evidence: (p.provenance_records || []).map(r => ({
          source: r.source,
          source_url: r.source_url || null,
          claim: r.claim,
          confidence: r.confidence || null
        })),
        possible_duplicates: duplicates.map(d => ({
          reason: d.reason,
          flagged_at: d.flagged_at,
          incoming_candidate: d.incoming_candidate
        }))
      });
    }
    return queue;
  }

  getPromoterById(id) {
    return this.promoters.get(id) || null;
  }

  getPromoterBySlug(slug) {
    const id = this.slugMap.get(slug);
    if (id) return this.promoters.get(id) || null;
    return this.promoters.get(slug) || null;
  }

  getPromoterByHandle(handle) {
    const clean = this._cleanHandle(handle);
    const id = this.handleMap.get(clean);
    if (id) return this.promoters.get(id) || null;
    return null;
  }

  getAllPromoters(filter = {}) {
    let list = Array.from(this.promoters.values());

    if (filter.verification_status) {
      const matchStatus = filter.verification_status.toUpperCase();
      list = list.filter(p => p.verification_status === matchStatus);
    }
    if (filter.category) {
      list = list.filter(p => p.category && p.category.toUpperCase() === filter.category.toUpperCase());
    }
    if (filter.city) {
      list = list.filter(p => p.city && p.city.toLowerCase() === filter.city.toLowerCase());
    }
    if (filter.apmi_only === true || filter.apmi_member === true) {
      list = list.filter(p => p.apmi_member === true);
    }

    return list;
  }

  getDashboardStats() {
    const all = Array.from(this.promoters.values());
    const stats = {
      total_promoters: all.length,
      verified_official_promoters: 0,
      identity_matched: 0,
      discovered_candidates: 0,
      rejected_promoters: 0,
      inactive_promoters: 0,
      apmi_accredited_members: 0,
      non_apmi_promoters: 0,
      categories: {},
      cities: {},
      potential_duplicates_count: 0
    };

    for (const p of all) {
      if (p.verification_status === PROMOTER_STATUS.VERIFIED_OFFICIAL_PROMOTER_ACCOUNT) {
        stats.verified_official_promoters++;
      } else if (p.verification_status === PROMOTER_STATUS.IDENTITY_MATCHED) {
        stats.identity_matched++;
      } else if (p.verification_status === PROMOTER_STATUS.DISCOVERED) {
        stats.discovered_candidates++;
      } else if (p.verification_status === PROMOTER_STATUS.REJECTED) {
        stats.rejected_promoters++;
      } else if (p.verification_status === PROMOTER_STATUS.INACTIVE) {
        stats.inactive_promoters++;
      }

      if (p.apmi_member) {
        stats.apmi_accredited_members++;
      } else {
        stats.non_apmi_promoters++;
      }

      const cat = p.category || 'OTHER';
      stats.categories[cat] = (stats.categories[cat] || 0) + 1;

      const city = p.city || 'Indonesia';
      stats.cities[city] = (stats.cities[city] || 0) + 1;

      if (p.duplicate_candidates && p.duplicate_candidates.length > 0) {
        stats.potential_duplicates_count += p.duplicate_candidates.length;
      }
    }

    return stats;
  }

  reset() {
    this.promoters.clear();
    this.slugMap.clear();
    this.handleMap.clear();
    this._initializeCuratedPromoters();
  }
}

const promoterRegistryInstance = new PromoterDiscoveryRegistry();

module.exports = {
  PromoterDiscoveryRegistry,
  promoterRegistry: promoterRegistryInstance,
  PROMOTER_STATUS,
  PROMOTER_AUTHORITY
};
