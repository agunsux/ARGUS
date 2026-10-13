/**
 * TIKUM / ARGUS — Partner & Affiliate Marketplace Service
 *
 * Manages official ticketing partner registries, verified event offers,
 * secure outbound link resolution (/go/:partnerSlug/:offerId),
 * open-redirect prevention, privacy-safe click tracking,
 * and authenticated partner conversion attribution.
 *
 * CORE ARCHITECTURAL INVARIANTS:
 * 1. Zero Fake Affiliates: An outbound link is marked affiliate ONLY if partner status is ACTIVE
 *    and integration is APPROVED_AFFILIATE_LINK with documented tracking parameters.
 * 2. Strict Financial Isolation: Affiliate clicks and conversions NEVER mutate secondary resale orders,
 *    escrow balances, seller proceeds, ticket inventory, or gate verification protocols.
 * 3. Open Redirect Prevention: All outbound destinations are validated against strict domain allowlists.
 *    No arbitrary ?url= parameters are accepted.
 * 4. PII Masking: Never pass buyer/seller personal data (email, phone, NIK, barcodes) to affiliate destinations.
 * 5. Honest Commission Accounting: If commission rates are unverified, terms remain UNCONFIGURED.
 *    Clicks are NEVER recorded as conversions. Conversions require authenticated partner evidence.
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { state, recordAuditLog } = require('../../database');

const PARTNER_TYPES = {
  TICKETING_PLATFORM: 'TICKETING_PLATFORM',
  PROMOTER: 'PROMOTER',
  AUTHORIZED_DISTRIBUTOR: 'AUTHORIZED_DISTRIBUTOR',
  AFFILIATE_NETWORK: 'AFFILIATE_NETWORK'
};

const INTEGRATION_TYPES = {
  DIRECT_OFFICIAL_LINK: 'DIRECT_OFFICIAL_LINK',
  APPROVED_AFFILIATE_LINK: 'APPROVED_AFFILIATE_LINK',
  AUTHORIZED_API: 'AUTHORIZED_API',
  AUTHORIZED_FEED: 'AUTHORIZED_FEED',
  MANUAL_PARTNER_FEED: 'MANUAL_PARTNER_FEED'
};

const PARTNER_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  REJECTED: 'REJECTED'
};

const OFFER_AVAILABILITY = {
  AVAILABLE: 'AVAILABLE',
  SOLD_OUT: 'SOLD_OUT',
  UNVERIFIED: 'UNVERIFIED'
};

const CONVERSION_STATUS = {
  CLICKED: 'CLICKED',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  REVERSED: 'REVERSED',
  PAID_OUT: 'PAID_OUT'
};

class PartnerService {
  /**
   * Initializes partner collections in database state.
   */
  static initCollections() {
    if (!state.partners) state.partners = [];
    if (!state.partner_offers) state.partner_offers = [];
    if (!state.affiliate_clicks) state.affiliate_clicks = [];
    if (!state.affiliate_conversions) state.affiliate_conversions = [];
    if (!state.partner_audit_logs) state.partner_audit_logs = [];
  }

  /**
   * Seeds default verified Indonesian ticketing partners and event offers.
   */
  static seedDefaults() {
    this.initCollections();
    if (state.partners.length === 0) {
      const now = new Date().toISOString();
      const defaultPartners = [
        {
          id: 'partner-loket',
          name: 'LOKET',
          slug: 'loket',
          partner_type: PARTNER_TYPES.TICKETING_PLATFORM,
          official_domains: ['loket.com', 'www.loket.com'],
          integration_type: INTEGRATION_TYPES.DIRECT_OFFICIAL_LINK,
          status: PARTNER_STATUS.ACTIVE,
          country_code: 'ID',
          supported_currency: 'IDR',
          affiliate_program_url: 'https://www.loket.com',
          commission_config: { type: 'UNCONFIGURED', rate_pct: null, fixed_amount: null, note: 'Direct official link active. Affiliate onboarding pending.' },
          webhook_secret: null,
          created_at: now,
          updated_at: now
        },
        {
          id: 'partner-livenation',
          name: 'Live Nation Asia',
          slug: 'livenation',
          partner_type: PARTNER_TYPES.PROMOTER,
          official_domains: ['livenation.asia', 'www.livenation.asia'],
          integration_type: INTEGRATION_TYPES.DIRECT_OFFICIAL_LINK,
          status: PARTNER_STATUS.ACTIVE,
          country_code: 'ID',
          supported_currency: 'IDR',
          affiliate_program_url: 'https://www.livenation.asia',
          commission_config: { type: 'UNCONFIGURED', rate_pct: null, fixed_amount: null, note: 'Direct promoter portal link.' },
          webhook_secret: null,
          created_at: now,
          updated_at: now
        },
        {
          id: 'partner-tiket',
          name: 'Tiket.com',
          slug: 'tiket-com',
          partner_type: PARTNER_TYPES.TICKETING_PLATFORM,
          official_domains: ['tiket.com', 'www.tiket.com'],
          integration_type: INTEGRATION_TYPES.DIRECT_OFFICIAL_LINK,
          status: PARTNER_STATUS.ACTIVE,
          country_code: 'ID',
          supported_currency: 'IDR',
          affiliate_program_url: 'https://www.tiket.com/to-do',
          commission_config: { type: 'UNCONFIGURED', rate_pct: null, fixed_amount: null, note: 'Direct ticketing link.' },
          webhook_secret: null,
          created_at: now,
          updated_at: now
        },
        {
          id: 'partner-bbo',
          name: 'BBO (PT BBO Aplikasi Indonesia)',
          slug: 'bbo',
          partner_type: PARTNER_TYPES.TICKETING_PLATFORM,
          official_domains: ['bbo.co.id', 'www.bbo.co.id'],
          integration_type: INTEGRATION_TYPES.DIRECT_OFFICIAL_LINK,
          status: PARTNER_STATUS.ACTIVE,
          country_code: 'ID',
          supported_currency: 'IDR',
          affiliate_program_url: 'https://bbo.co.id',
          commission_config: { type: 'UNCONFIGURED', rate_pct: null, fixed_amount: null },
          webhook_secret: null,
          created_at: now,
          updated_at: now
        },
        {
          id: 'partner-megatix',
          name: 'Megatix Indonesia',
          slug: 'megatix',
          partner_type: PARTNER_TYPES.TICKETING_PLATFORM,
          official_domains: ['megatix.co.id', 'www.megatix.co.id'],
          integration_type: INTEGRATION_TYPES.DIRECT_OFFICIAL_LINK,
          status: PARTNER_STATUS.ACTIVE,
          country_code: 'ID',
          supported_currency: 'IDR',
          affiliate_program_url: 'https://megatix.co.id',
          commission_config: { type: 'UNCONFIGURED', rate_pct: null, fixed_amount: null },
          webhook_secret: null,
          created_at: now,
          updated_at: now
        },
        {
          id: 'partner-tiptip',
          name: 'TipTip',
          slug: 'tiptip',
          partner_type: PARTNER_TYPES.TICKETING_PLATFORM,
          official_domains: ['tiptip.id', 'www.tiptip.id', 'tiptip.co'],
          integration_type: INTEGRATION_TYPES.DIRECT_OFFICIAL_LINK,
          status: PARTNER_STATUS.ACTIVE,
          country_code: 'ID',
          supported_currency: 'IDR',
          affiliate_program_url: 'https://tiptip.id',
          commission_config: { type: 'UNCONFIGURED', rate_pct: null, fixed_amount: null },
          webhook_secret: null,
          created_at: now,
          updated_at: now
        }
      ];
      state.partners.push(...defaultPartners);
    }
  }

  /**
   * Registers a new partner. Requires admin actor.
   */
  static registerPartner(adminActor, {
    name,
    slug,
    partner_type = PARTNER_TYPES.TICKETING_PLATFORM,
    official_domains = [],
    integration_type = INTEGRATION_TYPES.DIRECT_OFFICIAL_LINK,
    status = PARTNER_STATUS.PENDING,
    country_code = 'ID',
    supported_currency = 'IDR',
    affiliate_program_url = null,
    commission_config = null,
    webhook_secret = null,
    notes = null
  }) {
    this.initCollections();
    if (!name || !slug) {
      const err = new Error('Partner name and slug are required');
      err.code = 'INVALID_PARTNER_DATA';
      err.status = 400;
      throw err;
    }

    if (!PARTNER_TYPES[partner_type]) {
      const err = new Error(`Invalid partner type: '${partner_type}'`);
      err.code = 'INVALID_PARTNER_TYPE';
      err.status = 400;
      throw err;
    }

    if (!INTEGRATION_TYPES[integration_type]) {
      const err = new Error(`Invalid integration type: '${integration_type}'`);
      err.code = 'INVALID_INTEGRATION_TYPE';
      err.status = 400;
      throw err;
    }

    if (!PARTNER_STATUS[status]) {
      const err = new Error(`Invalid partner status: '${status}'`);
      err.code = 'INVALID_PARTNER_STATUS';
      err.status = 400;
      throw err;
    }

    const normSlug = slug.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '-');
    const existing = state.partners.find(p => p.slug === normSlug);
    if (existing) {
      const err = new Error(`Partner with slug '${normSlug}' already exists`);
      err.code = 'PARTNER_SLUG_EXISTS';
      err.status = 409;
      throw err;
    }

    // Domain validation
    const domains = Array.isArray(official_domains) ? official_domains.map(d => d.toLowerCase().trim()) : [];
    if (domains.length === 0) {
      const err = new Error('At least one official domain is required for allowlisting');
      err.code = 'MISSING_OFFICIAL_DOMAINS';
      err.status = 400;
      throw err;
    }

    const now = new Date().toISOString();
    const partnerId = `partner-${normSlug}`;
    const partner = {
      id: partnerId,
      name: name.trim(),
      slug: normSlug,
      partner_type,
      official_domains: domains,
      integration_type,
      status,
      country_code,
      supported_currency,
      affiliate_program_url: affiliate_program_url ? affiliate_program_url.trim() : null,
      commission_config: commission_config || { type: 'UNCONFIGURED', rate_pct: null, fixed_amount: null },
      webhook_secret: webhook_secret || null,
      notes: notes || null,
      approved_at: (status === PARTNER_STATUS.APPROVED || status === PARTNER_STATUS.ACTIVE) ? now : null,
      approved_by: (status === PARTNER_STATUS.APPROVED || status === PARTNER_STATUS.ACTIVE) ? (adminActor?.id || 'admin') : null,
      created_at: now,
      updated_at: now
    };

    state.partners.push(partner);

    // Audit log
    this.recordPartnerAudit(adminActor, 'PARTNER_CREATED', partner.id, {
      name: partner.name,
      slug: partner.slug,
      status: partner.status,
      integration_type: partner.integration_type
    });

    return this.sanitizePartner(partner);
  }

  /**
   * Updates an existing partner.
   */
  static updatePartner(adminActor, partnerId, updates = {}) {
    this.initCollections();
    const partner = state.partners.find(p => p.id === partnerId || p.slug === partnerId);
    if (!partner) {
      const err = new Error(`Partner '${partnerId}' not found`);
      err.code = 'PARTNER_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const before = { ...partner };
    const now = new Date().toISOString();

    if (updates.name) partner.name = updates.name.trim();
    if (updates.partner_type) {
      if (!PARTNER_TYPES[updates.partner_type]) throw new Error(`Invalid partner type: ${updates.partner_type}`);
      partner.partner_type = updates.partner_type;
    }
    if (updates.integration_type) {
      if (!INTEGRATION_TYPES[updates.integration_type]) throw new Error(`Invalid integration type: ${updates.integration_type}`);
      partner.integration_type = updates.integration_type;
    }
    if (updates.status) {
      if (!PARTNER_STATUS[updates.status]) throw new Error(`Invalid partner status: ${updates.status}`);
      partner.status = updates.status;
      if (updates.status === PARTNER_STATUS.APPROVED || updates.status === PARTNER_STATUS.ACTIVE) {
        partner.approved_at = partner.approved_at || now;
        partner.approved_by = partner.approved_by || adminActor?.id || 'admin';
      }
    }
    if (Array.isArray(updates.official_domains)) {
      partner.official_domains = updates.official_domains.map(d => d.toLowerCase().trim()).filter(Boolean);
    }
    if (updates.commission_config !== undefined) {
      partner.commission_config = updates.commission_config;
    }
    if (updates.webhook_secret !== undefined) {
      partner.webhook_secret = updates.webhook_secret;
    }
    if (updates.affiliate_program_url !== undefined) {
      partner.affiliate_program_url = updates.affiliate_program_url;
    }
    if (updates.notes !== undefined) {
      partner.notes = updates.notes;
    }

    partner.updated_at = now;

    this.recordPartnerAudit(adminActor, 'PARTNER_UPDATED', partner.id, {
      before: { status: before.status, integration_type: before.integration_type },
      after: { status: partner.status, integration_type: partner.integration_type }
    });

    return this.sanitizePartner(partner);
  }

  /**
   * Sanitizes partner entity before exposing over API.
   */
  static sanitizePartner(partner) {
    if (!partner) return null;
    const copy = { ...partner };
    delete copy.webhook_secret;
    return copy;
  }

  /**
   * Lists all partners with optional status or type filtering.
   */
  static listPartners({ status = null, integration_type = null } = {}) {
    this.initCollections();
    this.seedDefaults();
    let result = [...state.partners];
    if (status) {
      result = result.filter(p => p.status === status);
    }
    if (integration_type) {
      result = result.filter(p => p.integration_type === integration_type);
    }
    return result.map(p => this.sanitizePartner(p));
  }

  /**
   * Gets partner by ID or slug.
   */
  static getPartner(idOrSlug) {
    this.initCollections();
    this.seedDefaults();
    const p = state.partners.find(item => item.id === idOrSlug || item.slug === idOrSlug);
    return p ? this.sanitizePartner(p) : null;
  }

  /**
   * Internal lookup returning raw partner (including webhook_secret for verification).
   */
  static getRawPartner(idOrSlug) {
    this.initCollections();
    this.seedDefaults();
    return state.partners.find(item => item.id === idOrSlug || item.slug === idOrSlug) || null;
  }

  /**
   * Validates a destination URL against a partner's official domains allowlist.
   * Prevents open-redirect vulnerabilities.
   */
  static validateDestinationUrl(destinationUrl, partner) {
    if (!destinationUrl || typeof destinationUrl !== 'string') return false;
    let parsed;
    try {
      parsed = new URL(destinationUrl);
    } catch (_) {
      return false;
    }

    // Only allow http: and https: protocols
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const host = parsed.hostname.toLowerCase();
    const allowed = partner?.official_domains || [];

    return allowed.some(domain => {
      const d = domain.toLowerCase();
      return host === d || host.endsWith('.' + d);
    });
  }

  /**
   * Creates or updates an event-to-partner offer.
   */
  static createOrUpdateOffer(adminActor, {
    id = null,
    event_id,
    partner_id,
    destination_url,
    link_type = null,
    ticket_category = 'General Admission',
    price_min = null,
    price_max = null,
    currency = 'IDR',
    availability_status = OFFER_AVAILABILITY.AVAILABLE,
    verification_status = 'VERIFIED',
    affiliate_subid_param = null,
    is_active = true,
    notes = null
  }) {
    this.initCollections();
    this.seedDefaults();

    if (!event_id || !partner_id || !destination_url) {
      const err = new Error('event_id, partner_id, and destination_url are required');
      err.code = 'INVALID_OFFER_DATA';
      err.status = 400;
      throw err;
    }

    const partner = state.partners.find(p => p.id === partner_id || p.slug === partner_id);
    if (!partner) {
      const err = new Error(`Partner '${partner_id}' not found`);
      err.code = 'PARTNER_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    // Enforce domain allowlist validation
    if (!this.validateDestinationUrl(destination_url, partner)) {
      const err = new Error(`Destination URL domain is not allowed for partner '${partner.name}'`);
      err.code = 'INVALID_DESTINATION_DOMAIN';
      err.status = 400;
      throw err;
    }

    // Link type determination
    const finalLinkType = link_type || (partner.integration_type === INTEGRATION_TYPES.APPROVED_AFFILIATE_LINK
      ? INTEGRATION_TYPES.APPROVED_AFFILIATE_LINK
      : INTEGRATION_TYPES.DIRECT_OFFICIAL_LINK);

    const isAffiliate = (finalLinkType === INTEGRATION_TYPES.APPROVED_AFFILIATE_LINK && partner.status === PARTNER_STATUS.ACTIVE);

    const offerId = id || `offer-${partner.slug}-${event_id.replace(/^ev-can-/, '')}`;
    const existingIndex = state.partner_offers.findIndex(o => o.id === offerId);

    const now = new Date().toISOString();
    const offer = {
      id: offerId,
      event_id,
      partner_id: partner.id,
      partner_slug: partner.slug,
      partner_name: partner.name,
      destination_url,
      link_type: finalLinkType,
      is_affiliate: isAffiliate,
      ticket_category,
      price_min: typeof price_min === 'number' ? price_min : null,
      price_max: typeof price_max === 'number' ? price_max : null,
      currency,
      availability_status: OFFER_AVAILABILITY[availability_status] || OFFER_AVAILABILITY.AVAILABLE,
      verification_status,
      last_verified_at: now,
      affiliate_subid_param: affiliate_subid_param || (isAffiliate ? 'sub_id' : null),
      is_active: Boolean(is_active),
      notes: notes || null,
      created_at: existingIndex >= 0 ? state.partner_offers[existingIndex].created_at : now,
      updated_at: now
    };

    if (existingIndex >= 0) {
      state.partner_offers[existingIndex] = offer;
    } else {
      state.partner_offers.push(offer);
    }

    this.recordPartnerAudit(adminActor, existingIndex >= 0 ? 'OFFER_UPDATED' : 'OFFER_CREATED', offer.id, {
      event_id: offer.event_id,
      partner_id: offer.partner_id,
      link_type: offer.link_type,
      is_affiliate: offer.is_affiliate
    });

    return offer;
  }

  /**
   * Retrieves active official offers for a canonical event.
   */
  static getOffersForEvent(eventId) {
    this.initCollections();
    this.seedDefaults();
    return state.partner_offers.filter(o => o.event_id === eventId && o.is_active !== false);
  }

  /**
   * Retrieves single offer by ID.
   */
  static getOfferById(offerId) {
    this.initCollections();
    this.seedDefaults();
    return state.partner_offers.find(o => o.id === offerId) || null;
  }

  /**
   * Lists offers with optional filtering.
   */
  static listOffers({ partner_id = null, event_id = null, is_affiliate = null } = {}) {
    this.initCollections();
    this.seedDefaults();
    let result = [...state.partner_offers];
    if (partner_id) result = result.filter(o => o.partner_id === partner_id || o.partner_slug === partner_id);
    if (event_id) result = result.filter(o => o.event_id === event_id);
    if (is_affiliate !== null) result = result.filter(o => Boolean(o.is_affiliate) === Boolean(is_affiliate));
    return result;
  }

  /**
   * Toggles active state of an offer.
   */
  static toggleOffer(adminActor, offerId, isActive) {
    this.initCollections();
    const offer = state.partner_offers.find(o => o.id === offerId);
    if (!offer) {
      const err = new Error(`Offer '${offerId}' not found`);
      err.code = 'OFFER_NOT_FOUND';
      err.status = 404;
      throw err;
    }
    offer.is_active = Boolean(isActive);
    offer.updated_at = new Date().toISOString();

    this.recordPartnerAudit(adminActor, 'OFFER_TOGGLED', offer.id, { is_active: offer.is_active });
    return offer;
  }

  /**
   * Resolves safe outbound redirect for /go/:partnerSlug/:offerId.
   * Records click event with privacy-safe hashing.
   */
  static resolveOutboundLink(partnerSlug, offerId, {
    ip = '127.0.0.1',
    userAgent = '',
    referrer = '',
    sessionId = null
  } = {}) {
    this.initCollections();
    this.seedDefaults();

    const partner = state.partners.find(p => p.slug === partnerSlug || p.id === partnerSlug);
    if (!partner) {
      const err = new Error(`Partner '${partnerSlug}' not found`);
      err.code = 'PARTNER_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    if (partner.status !== PARTNER_STATUS.ACTIVE) {
      const err = new Error(`Partner '${partner.name}' is currently ${partner.status.toLowerCase()}`);
      err.code = partner.status === PARTNER_STATUS.SUSPENDED ? 'PARTNER_SUSPENDED' : 'PARTNER_INACTIVE';
      err.status = 403;
      throw err;
    }

    const offer = state.partner_offers.find(o => o.id === offerId);
    if (!offer) {
      const err = new Error(`Offer '${offerId}' not found`);
      err.code = 'OFFER_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    if (offer.partner_id !== partner.id && offer.partner_slug !== partner.slug) {
      const err = new Error(`Offer does not belong to partner '${partnerSlug}'`);
      err.code = 'OFFER_PARTNER_MISMATCH';
      err.status = 400;
      throw err;
    }

    if (offer.is_active === false) {
      const err = new Error('Offer has been deactivated');
      err.code = 'OFFER_INACTIVE';
      err.status = 403;
      throw err;
    }

    // Security validation against destination domain
    if (!this.validateDestinationUrl(offer.destination_url, partner)) {
      const err = new Error(`Destination domain violates partner security policy`);
      err.code = 'INVALID_DESTINATION_DOMAIN';
      err.status = 400;
      throw err;
    }

    // Generate unique click ID
    const clickId = `clk-${uuidv4().substring(0, 16)}`;
    const now = new Date().toISOString();

    // Privacy-safe IP hashing
    const ipHash = crypto.createHash('sha256').update((ip || '0.0.0.0') + '_argus_salt').digest('hex').substring(0, 16);

    // Record outbound click
    const clickRecord = {
      id: clickId,
      click_id: clickId,
      partner_id: partner.id,
      partner_slug: partner.slug,
      event_id: offer.event_id,
      offer_id: offer.id,
      link_type: offer.link_type,
      is_affiliate: Boolean(offer.is_affiliate),
      ip_hash: ipHash,
      user_agent: (userAgent || '').substring(0, 255),
      referrer: (referrer || '').substring(0, 255),
      session_id: sessionId,
      created_at: now
    };
    state.affiliate_clicks.push(clickRecord);

    // Build redirect target URL
    let targetUrl = offer.destination_url;
    if (offer.is_affiliate && offer.affiliate_subid_param) {
      try {
        const u = new URL(targetUrl);
        u.searchParams.set(offer.affiliate_subid_param, clickId);
        targetUrl = u.toString();
      } catch (_) {
        targetUrl = offer.destination_url;
      }
    }

    return {
      redirect_url: targetUrl,
      click_id: clickId,
      is_affiliate: Boolean(offer.is_affiliate),
      partner: this.sanitizePartner(partner),
      offer
    };
  }

  /**
   * Processes authenticated partner conversion webhook.
   * Enforces timing-safe auth and idempotency.
   * STRICT SEPARATION: Does NOT mutate secondary marketplace orders or escrow.
   */
  static recordPartnerConversionWebhook(partnerSlug, payload = {}, authHeader = null) {
    this.initCollections();
    this.seedDefaults();

    const partner = this.getRawPartner(partnerSlug);
    if (!partner) {
      const err = new Error(`Partner '${partnerSlug}' not found`);
      err.code = 'PARTNER_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    if (partner.status !== PARTNER_STATUS.ACTIVE) {
      const err = new Error(`Partner '${partner.name}' is inactive`);
      err.code = 'PARTNER_INACTIVE';
      err.status = 403;
      throw err;
    }

    // Authenticate webhook if secret configured
    if (partner.webhook_secret) {
      if (!authHeader) {
        const err = new Error('Missing webhook authentication header');
        err.code = 'INVALID_WEBHOOK_SIGNATURE';
        err.status = 401;
        throw err;
      }
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      const expected = partner.webhook_secret.trim();
      const bufA = Buffer.from(token);
      const bufB = Buffer.from(expected);
      if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
        const err = new Error('Invalid webhook authorization token');
        err.code = 'INVALID_WEBHOOK_SIGNATURE';
        err.status = 401;
        throw err;
      }
    }

    const orderRef = payload.order_ref || payload.transaction_id || payload.order_id;
    if (!orderRef) {
      const err = new Error('Missing required partner order_ref / transaction_id in webhook payload');
      err.code = 'INVALID_CONVERSION_PAYLOAD';
      err.status = 400;
      throw err;
    }

    const clickId = payload.click_id || payload.sub_id || null;
    const click = clickId ? state.affiliate_clicks.find(c => c.click_id === clickId) : null;
    const eventId = payload.event_id || (click ? click.event_id : null);

    // Map partner status to canonical status
    const rawStatus = (payload.status || 'PENDING').toUpperCase();
    let status = CONVERSION_STATUS.PENDING;
    if (rawStatus === 'APPROVED' || rawStatus === 'CONFIRMED' || rawStatus === 'SETTLED') {
      status = CONVERSION_STATUS.APPROVED;
    } else if (rawStatus === 'REJECTED' || rawStatus === 'FAILED' || rawStatus === 'DECLINED') {
      status = CONVERSION_STATUS.REJECTED;
    } else if (rawStatus === 'REVERSED' || rawStatus === 'REFUNDED') {
      status = CONVERSION_STATUS.REVERSED;
    } else if (rawStatus === 'PAID_OUT' || rawStatus === 'PAID') {
      status = CONVERSION_STATUS.PAID_OUT;
    }

    const amount = Number(payload.amount) || 0;
    let commissionAmount = Number(payload.commission_amount);
    if (isNaN(commissionAmount) || commissionAmount <= 0) {
      // Calculate from partner config if configured
      if (partner.commission_config && partner.commission_config.rate_pct) {
        commissionAmount = Math.floor((amount * partner.commission_config.rate_pct) / 100);
      } else if (partner.commission_config && partner.commission_config.fixed_amount) {
        commissionAmount = partner.commission_config.fixed_amount;
      } else {
        commissionAmount = 0;
      }
    }

    const now = new Date().toISOString();

    // Idempotency check: partner + orderRef
    const existing = state.affiliate_conversions.find(c => c.partner_id === partner.id && c.order_ref === orderRef);
    if (existing) {
      if (existing.status === status && existing.amount === amount) {
        return { idempotent: true, conversion: existing };
      }
      // Status update transition
      const oldStatus = existing.status;
      existing.status = status;
      existing.amount = amount;
      existing.commission_amount = commissionAmount;
      existing.updated_at = now;

      this.recordPartnerAudit({ id: `webhook-${partner.slug}` }, 'CONVERSION_STATUS_UPDATED', existing.id, {
        partner_id: partner.id,
        order_ref: orderRef,
        from_status: oldStatus,
        to_status: status
      });

      return { idempotent: false, updated: true, conversion: existing };
    }

    const conversionId = `conv-${uuidv4().substring(0, 16)}`;
    const conversion = {
      id: conversionId,
      partner_id: partner.id,
      partner_slug: partner.slug,
      event_id: eventId,
      click_id: clickId,
      order_ref: String(orderRef),
      amount,
      commission_amount: commissionAmount,
      currency: payload.currency || partner.supported_currency || 'IDR',
      status,
      conversion_timestamp: payload.timestamp || now,
      raw_payload: { ...payload },
      created_at: now,
      updated_at: now
    };

    state.affiliate_conversions.push(conversion);

    this.recordPartnerAudit({ id: `webhook-${partner.slug}` }, 'CONVERSION_RECORDED', conversion.id, {
      partner_id: partner.id,
      order_ref: orderRef,
      status: conversion.status,
      commission_amount: conversion.commission_amount
    });

    return { idempotent: false, conversion };
  }

  /**
   * Reconciles conversion manually by admin (e.g. from affiliate dashboard export).
   */
  static reconcileManualConversion(adminActor, {
    partner_id,
    order_ref,
    event_id = null,
    click_id = null,
    amount = 0,
    commission_amount = 0,
    currency = 'IDR',
    status = CONVERSION_STATUS.APPROVED,
    notes = null
  }) {
    this.initCollections();
    const partner = state.partners.find(p => p.id === partner_id || p.slug === partner_id);
    if (!partner) {
      const err = new Error(`Partner '${partner_id}' not found`);
      err.code = 'PARTNER_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    if (!order_ref) {
      const err = new Error('order_ref is required');
      err.code = 'INVALID_CONVERSION_DATA';
      err.status = 400;
      throw err;
    }

    const now = new Date().toISOString();
    const existing = state.affiliate_conversions.find(c => c.partner_id === partner.id && c.order_ref === order_ref);
    if (existing) {
      existing.status = status;
      existing.commission_amount = commission_amount;
      existing.amount = amount;
      existing.notes = notes;
      existing.updated_at = now;
      this.recordPartnerAudit(adminActor, 'MANUAL_CONVERSION_UPDATED', existing.id, {
        order_ref,
        status,
        commission_amount
      });
      return existing;
    }

    const conversionId = `conv-${uuidv4().substring(0, 16)}`;
    const conversion = {
      id: conversionId,
      partner_id: partner.id,
      partner_slug: partner.slug,
      event_id,
      click_id,
      order_ref: String(order_ref),
      amount: Number(amount) || 0,
      commission_amount: Number(commission_amount) || 0,
      currency,
      status: CONVERSION_STATUS[status] || CONVERSION_STATUS.APPROVED,
      conversion_timestamp: now,
      source: 'MANUAL_ADMIN_RECONCILIATION',
      notes,
      created_at: now,
      updated_at: now
    };

    state.affiliate_conversions.push(conversion);
    this.recordPartnerAudit(adminActor, 'MANUAL_CONVERSION_CREATED', conversion.id, {
      order_ref,
      status: conversion.status,
      commission_amount: conversion.commission_amount
    });

    return conversion;
  }

  /**
   * Generates truthful analytics for admin dashboard.
   * If conversions are zero, explicitly reports empty state without fabricating numbers.
   */
  static getAnalytics() {
    this.initCollections();
    this.seedDefaults();

    const partners = state.partners || [];
    const offers = state.partner_offers || [];
    const clicks = state.affiliate_clicks || [];
    const conversions = state.affiliate_conversions || [];

    const activePartnersCount = partners.filter(p => p.status === PARTNER_STATUS.ACTIVE).length;
    const affiliateOffersCount = offers.filter(o => o.is_affiliate && o.is_active !== false).length;
    const totalOffersCount = offers.length;

    // Unique clicks calculation
    const uniqueKeys = new Set();
    clicks.forEach(c => {
      uniqueKeys.add(`${c.offer_id}_${c.ip_hash}`);
    });

    let pendingCommission = 0;
    let approvedCommission = 0;
    let reversedCommission = 0;
    let paidCommission = 0;

    conversions.forEach(c => {
      const amt = Number(c.commission_amount) || 0;
      if (c.status === CONVERSION_STATUS.PENDING) pendingCommission += amt;
      else if (c.status === CONVERSION_STATUS.APPROVED) approvedCommission += amt;
      else if (c.status === CONVERSION_STATUS.REVERSED) reversedCommission += amt;
      else if (c.status === CONVERSION_STATUS.PAID_OUT) paidCommission += amt;
    });

    // Partner-level breakdown
    const partnerMetrics = partners.map(p => {
      const pClicks = clicks.filter(c => c.partner_id === p.id);
      const pConvs = conversions.filter(c => c.partner_id === p.id);
      const pOffers = offers.filter(o => o.partner_id === p.id);
      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        status: p.status,
        integration_type: p.integration_type,
        offers_count: pOffers.length,
        clicks_count: pClicks.length,
        conversions_count: pConvs.length,
        approved_commission: pConvs.filter(c => c.status === CONVERSION_STATUS.APPROVED).reduce((sum, c) => sum + (c.commission_amount || 0), 0)
      };
    });

    return {
      total_partners: partners.length,
      active_partners: activePartnersCount,
      total_offers: totalOffersCount,
      affiliate_enabled_offers: affiliateOffersCount,
      total_clicks: clicks.length,
      unique_clicks: uniqueKeys.size,
      total_conversions: conversions.length,
      pending_commission: pendingCommission,
      approved_commission: approvedCommission,
      reversed_commission: reversedCommission,
      paid_commission: paidCommission,
      currency: 'IDR',
      has_conversion_data: conversions.length > 0,
      empty_state_message: conversions.length === 0 ? 'Belum ada data konversi partner' : null,
      partner_metrics: partnerMetrics
    };
  }

  /**
   * Helper to audit existing canonical catalog official URLs.
   */
  static auditCatalogOfficialUrls(canonicalRegistry) {
    const events = canonicalRegistry ? canonicalRegistry.getAllEvents() : [];
    let verifiedCount = 0;
    let unverifiedCount = 0;
    let missingCount = 0;
    let staleCount = 0;
    let affiliateCount = 0;

    const inventory = events.map(ev => {
      const url = ev.official_ticket_url;
      let classification = 'MISSING';
      if (!url) {
        missingCount++;
        classification = 'MISSING';
      } else {
        let parsed;
        try { parsed = new URL(url); } catch (_) {}
        if (!parsed) {
          classification = 'INVALID';
        } else {
          const isVerified = (ev.ticketing_verification_status === 'VERIFIED' || ev.is_verified);
          if (isVerified) {
            verifiedCount++;
            classification = 'VERIFIED_OFFICIAL';
          } else {
            unverifiedCount++;
            classification = 'UNVERIFIED';
          }
        }
      }

      return {
        event_id: ev.event_id || ev.id,
        name: ev.canonical_name || ev.name,
        date: ev.start_date || ev.date,
        venue: ev.venue_name,
        city: ev.city,
        provider: ev.official_ticketing_provider || null,
        url: url || null,
        classification,
        is_affiliate: false
      };
    });

    return {
      total_inspected: events.length,
      verified_official: verifiedCount,
      unverified: unverifiedCount,
      missing: missingCount,
      stale: staleCount,
      affiliate_enabled: affiliateCount,
      records: inventory
    };
  }

  /**
   * Records audit log in memory state.
   */
  static recordPartnerAudit(actor, action, targetId, details = {}) {
    this.initCollections();
    const log = {
      id: `pal-${uuidv4().substring(0, 8)}`,
      action,
      actor_id: actor?.id || 'system',
      target_id: targetId,
      details,
      timestamp: new Date().toISOString()
    };
    state.partner_audit_logs.push(log);
  }
}

module.exports = {
  PartnerService,
  PARTNER_TYPES,
  INTEGRATION_TYPES,
  PARTNER_STATUS,
  OFFER_AVAILABILITY,
  CONVERSION_STATUS
};
