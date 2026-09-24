/**
 * TIKUM / ARGUS — Official Event Snapshot Builder
 *
 * Builds the evidence-backed snapshot of official public event channels that
 * powers the TIKUM upcoming-events surface, WITHOUT any live network access at
 * request time. Executed out-of-band via
 * `scripts/refresh_official_event_snapshot.js`.
 *
 * COMPLIANCE GUARANTEES
 *   1. Host allow-list: only audited, publicly documented channels are fetched.
 *   2. robots.txt honoured: every allow-listed host was audited first.
 *   3. Transparent User-Agent identifying the crawler and contact channel.
 *   4. >= 1.1s spacing between requests to the same host (per-domain polite bucket).
 *   5. No CAPTCHA/WAF circumvention, no login, no private/undocumented endpoints,
 *      no proxy rotation, no header masquerading.
 *   6. Factual fields only (name, date, venue, city, price, official links and
 *      official poster). No creative description scraping.
 *
 * EVIDENCE MODEL
 *   - Every record stores the discovery URL + retrieval timestamp + SHA-256 of the
 *     raw response that produced the claim.
 *   - A record is promoted to AUTHORITATIVE_CORROBORATED only when an official
 *     Indonesian authority channel (official event website / promoter) is fetched
 *     successfully AND every expected factual token appears in its response.
 *     Any failure fails closed to DISCOVERY_ONLY (never public).
 */

const crypto = require('crypto');

const { LoketAdapter } = require('./adapters/LoketAdapter');
const { LiveNationAdapter } = require('./adapters/LiveNationAdapter');
const { BboAdapter } = require('./adapters/BboAdapter');

const USER_AGENT = 'TikumEventBot/1.0 (+https://tikum.app/bot-info; ops@tikum.app)';
const MIN_HOST_INTERVAL_MS = 1100;
const REQUEST_TIMEOUT_MS = 20000;

const ALLOWED_HOSTS = new Set([
  'www.livenation.asia',
  'www.loket.com',
  'bbo.co.id',
  'www.pestapora.com',
  'www.djakartawarehouse.com',
  'djakartawarehouse.com',
  'dwpfest.com',
  'www.dwpfest.com',
  'www.lanyinjakarta2026.com',
  'www.theweekndinjakarta.com',
  'maroon5jakarta2027.com',
  'weverse.io',
  'www.weverse.io',
  'ygfamily.com',
  'www.ygfamily.com',
  'dyandraglobal.com',
  'www.dyandraglobal.com',
  'dyandraglobalstore.com',
  'www.synchronizefestival.com',
  'synchronizefestival.com',
  'bigbanginjakarta.com',
  'www.bigbanginjakarta.com',
  'hub.ekraf.go.id',
  'www.songkick.com',
  'songkick.com',
  'tickets.songkick.com',
  'labs.songkick.com',
  'www.bandsintown.com',
  'bandsintown.com'
]);

// Indonesian target market: Jabodetabek, Java, Sumatera, Sulawesi, Kalimantan, Bali.
const TARGET_CITIES = new Set([
  'jakarta', 'bogor', 'depok', 'tangerang', 'tangerang selatan', 'bekasi',
  'bandung', 'cimahi', 'cirebon', 'sukabumi', 'tasikmalaya',
  'semarang', 'solo', 'surakarta', 'purwokerto', 'tegal', 'salatiga',
  'yogyakarta', 'surabaya', 'sidoarjo', 'mojokerto', 'malang', 'madiun', 'batu',
  'banyuwangi', 'tulungagung', 'medan', 'palembang', 'padang', 'pekanbaru',
  'batam', 'bandar lampung', 'makassar', 'balikpapan', 'banjarmasin',
  'samarinda', 'pontianak', 'denpasar', 'bali', 'badung', 'gianyar', 'tabanan'
]);

const LOKET_DISCOVERY_URLS = [
  'https://www.loket.com/',
  'https://www.loket.com/discover?d_et=2',
  'https://www.loket.com/discover?d_et=3',
  'https://www.loket.com/discover?d_et=9',
  'https://www.loket.com/discover?d_et=18'
];

/**
 * Explicit corroboration rules. A rule is satisfied only when the official
 * Indonesian authority page is fetched successfully and contains every
 * `expect_tokens` entry. No fuzzy guessing, no fabrication.
 */
const EVIDENCE_RULES = [
  {
    id: 'pestapora-2026',
    discovery_source_id: 'src-loket',
    title_includes: ['pestapora'],
    authoritative_source_id: 'src-event-pestapora-web',
    evidence_url: 'https://www.pestapora.com/',
    expect_tokens: ['pestapora', '2026', 'september'],
    image_source_type: 'OFFICIAL_EVENT_WEB',
    image_credit: 'Pestapora / Boss Creator'
  },
  {
    id: 'dwp-2026',
    discovery_source_id: 'src-loket',
    title_includes: ['dwp', 'djakarta warehouse'],
    authoritative_source_id: 'src-event-dwp-web',
    evidence_url: 'https://djakartawarehouse.com/',
    expect_tokens: ['djakarta', 'warehouse'],
    image_source_type: 'OFFICIAL_EVENT_WEB',
    image_credit: 'Djakarta Warehouse Project / Ismaya Live'
  },
  {
    id: 'lany-jakarta-2026',
    discovery_source_id: 'src-livenation',
    title_includes: ['lany'],
    city_includes: 'jakarta',
    authoritative_source_id: 'src-event-lanyinjakarta-web',
    evidence_url: 'https://www.lanyinjakarta2026.com/',
    expect_tokens: ['lany', 'jakarta', '2026'],
    image_source_type: 'OFFICIAL_EVENT_WEB',
    image_credit: 'LANY in Jakarta 2026 (TEM Presents)'
  },
  {
    id: 'the-weeknd-jakarta-2026',
    discovery_source_id: 'src-livenation',
    title_includes: ['after hours', 'weeknd'],
    city_includes: 'jakarta',
    authoritative_source_id: 'src-event-theweekndinjakarta-web',
    evidence_url: 'https://www.theweekndinjakarta.com/',
    expect_tokens: ['weeknd', 'after hours'],
    image_source_type: 'OFFICIAL_EVENT_WEB',
    image_credit: 'The Weeknd in Jakarta (TEM Presents)'
  },
  {
    id: 'maroon-5-jakarta-2027',
    discovery_source_id: 'src-livenation',
    title_includes: ['maroon 5'],
    city_includes: 'jakarta',
    authoritative_source_id: 'src-event-maroon5jakarta-web',
    evidence_url: 'http://maroon5jakarta2027.com/',
    expect_tokens: ['maroon 5', 'jakarta'],
    image_source_type: 'OFFICIAL_EVENT_WEB',
    image_credit: 'Maroon 5 Asia 2027 in Jakarta (TEM Presents)'
  },
  {
    id: 'nct-127-jakarta-2026',
    discovery_source_id: 'src-weverse',
    title_includes: ['nct 127', 'the redline'],
    authoritative_source_id: 'src-weverse',
    evidence_url: 'https://weverse.io/nct127/notice/37278',
    expect_tokens: ['nct 127', 'jakarta', 'indonesia arena'],
    image_source_type: 'OFFICIAL_ARTIST_WEB',
    image_credit: 'SM Entertainment / Weverse / Dyandra Global'
  },
  {
    id: 'babymonster-jakarta-2026',
    discovery_source_id: 'src-weverse',
    title_includes: ['babymonster', 'choom'],
    authoritative_source_id: 'src-weverse',
    evidence_url: 'https://weverse.io/babymonster/notice/35647',
    expect_tokens: ['babymonster', 'jakarta', 'indonesia arena'],
    image_source_type: 'OFFICIAL_ARTIST_WEB',
    image_credit: 'YG Entertainment / Weverse'
  },
  {
    id: 'synchronize-2026',
    discovery_source_id: 'src-loket',
    title_includes: ['synchronize'],
    authoritative_source_id: 'src-event-synchronize-web',
    evidence_url: 'https://www.synchronizefestival.com/tickets',
    expect_tokens: ['synchronize', '2026'],
    image_source_type: 'OFFICIAL_EVENT_WEB',
    image_credit: 'Synchronize Festival / Demajors'
  },
  {
    id: 'bigbang-jakarta-2027',
    discovery_source_id: 'src-yg-entertainment',
    title_includes: ['bigbang'],
    city_includes: 'jakarta',
    authoritative_source_id: 'src-event-bigbangjakarta-web',
    evidence_url: 'https://bigbanginjakarta.com/',
    expect_tokens: ['bigbang', 'jakarta', '2027'],
    image_source_type: 'OFFICIAL_EVENT_WEB',
    image_credit: 'BIGBANG 2026-27 in Jakarta (YG Entertainment)'
  }
];

function sha256(text) {
  return crypto.createHash('sha256').update(text || '', 'utf8').digest('hex');
}

const lastHostRequest = new Map();

/**
 * Polite, transparent, allow-listed fetch: per-host spacing + hard timeout.
 */
async function fetchPolite(url) {
  const target = new URL(url);
  if (!ALLOWED_HOSTS.has(target.hostname.toLowerCase())) {
    throw new Error(`Host not in audited allow-list: ${target.hostname}`);
  }

  const now = Date.now();
  const last = lastHostRequest.get(target.hostname) || 0;
  const wait = MIN_HOST_INTERVAL_MS - (now - last);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastHostRequest.set(target.hostname, Date.now());

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const body = await res.text();
    lastHostRequest.set(target.hostname, Date.now());
    return { url, finalUrl: res.url || url, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function isTargetCity(city) {
  if (!city) return false;
  return TARGET_CITIES.has(String(city).trim().toLowerCase());
}

function extractOgImage(html) {
  if (!html || typeof html !== 'string') return null;
  const a = html.match(/property="og:image"[^>]*content="([^"]+)"/i);
  const b = html.match(/content="([^"]+)"[^>]*property="og:image"/i);
  const url = a ? a[1] : (b ? b[1] : null);
  return url && /^https?:\/\//i.test(url) ? url : null;
}

function tokensPresent(html, tokens) {
  const hay = String(html || '').toLowerCase();
  return (tokens || []).every(t => hay.includes(String(t).toLowerCase()));
}

/**
 * Finds the explicit corroboration rule for a discovered record.
 * Returns null when no authoritative Indonesian authority can be evidenced.
 */
function matchEvidenceRule(record) {
  for (const rule of EVIDENCE_RULES) {
    if (rule.discovery_source_id !== record.discovery_source_id) continue;

    if (Array.isArray(rule.title_includes)) {
      const t = String(record.title || '').toLowerCase();
      if (!rule.title_includes.some(k => t.includes(String(k).toLowerCase()))) continue;
    }

    if (rule.info_host_includes) {
      if (!record.official_info_url) continue;
      let host = '';
      try {
        host = new URL(record.official_info_url).hostname.replace(/^www\./i, '').toLowerCase();
      } catch (_) {
        continue;
      }
      if (!host.includes(String(rule.info_host_includes).replace(/^www\./i, '').toLowerCase())) continue;
    }

    if (rule.city_includes) {
      const city = String(record.city || '').toLowerCase();
      if (!city.includes(String(rule.city_includes).toLowerCase())) continue;
    }

    return rule;
  }
  return null;
}

// ============================================================================
// COLLECTORS
// ============================================================================

async function collectLiveNation(options = {}) {
  const records = [];
  const explicitPaths = Array.isArray(options.pagePaths) && options.pagePaths.length ? options.pagePaths : null;
  let paths = explicitPaths;

  if (!paths) {
    let homepage;
    try {
      homepage = await fetchPolite('https://www.livenation.asia/');
    } catch (err) {
      console.warn(`  [LN] homepage fetch failed: ${err.message}`);
      return records;
    }
    paths = LiveNationAdapter.extractCalendarPagePaths(homepage.body);
    console.log(`  [LN] audited calendar pages linked from homepage: ${paths.length}`);
  } else {
    console.log(`  [LN] explicit calendar pages requested: ${paths.length}`);
  }

  for (const p of paths) {
    const pageUrl = `https://www.livenation.asia/${p}`;
    try {
      const page = await fetchPolite(pageUrl);
      const events = LiveNationAdapter.parseTourHtml(page.body, 'https://www.livenation.asia');
      const poster = LiveNationAdapter.extractPosterUrl(page.body);
      const pageHash = sha256(page.body);
      const pageRecords = [];

      for (const ev of events) {
        if (!isTargetCity(ev.city)) continue;
        if (!ev.start_date) continue;
        pageRecords.push({
          discovery_source_id: 'src-livenation',
          discovery_source_url: pageUrl,
          discovery_retrieved_at: new Date().toISOString(),
          discovery_evidence_hash: pageHash,
          source_event_id: ev.source_event_id,
          title: ev.name,
          name: ev.name,
          artists: ev.name ? [ev.name.split(':')[0].trim()] : [],
          city: ev.city,
          venue_name: ev.venue_name,
          province: null,
          country: 'Indonesia',
          start_date: ev.start_date,
          start_time: null,
          start_datetime: `${ev.start_date}T19:00:00+07:00`,
          category: 'CONCERT',
          official_event_url: ev.official_event_url,
          official_ticket_url: ev.official_ticket_url,
          official_info_url: ev.official_info_url,
          organizer_name: 'Live Nation Asia',
          image_url: poster,
          image_source_type: 'OFFICIAL_PROMOTER_WEB',
          image_source_url: pageUrl,
          image_credit: 'Live Nation Asia'
        });
      }

      // Multi-night residency disambiguation: identical (title, venue) pairs on the
      // same calendar page are distinct nights and MUST remain distinct canonical
      // events, otherwise the ingestion deduplication correctly flags a date conflict.
      const groups = new Map();
      for (const rec of pageRecords) {
        const key = `${rec.title}||${rec.venue_name}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(rec);
      }
      for (const list of groups.values()) {
        if (list.length > 1) {
          list.sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
          list.forEach((rec, idx) => {
            const suffix = ` – Night ${idx + 1} (${rec.start_date})`;
            rec.title = `${rec.title}${suffix}`;
            rec.name = rec.title;
            rec.artists = [rec.title.split(':')[0].trim()];
          });
        }
      }

      records.push(...pageRecords);
    } catch (err) {
      console.warn(`  [LN] ${pageUrl} failed: ${err.message}`);
    }
  }

  console.log(`  [LN] in-scope Indonesian events collected: ${records.length}`);
  return records;
}

async function collectLoket() {
  const records = [];
  const eventUrls = new Set();

  for (const listUrl of LOKET_DISCOVERY_URLS) {
    try {
      const res = await fetchPolite(listUrl);
      for (const u of LoketAdapter.extractEventUrls(res.body)) eventUrls.add(u);
    } catch (err) {
      console.warn(`  [LOKET] ${listUrl} failed: ${err.message}`);
    }
  }

  console.log(`  [LOKET] publicly linked event pages discovered: ${eventUrls.size}`);

  for (const url of eventUrls) {
    try {
      const page = await fetchPolite(url);
      const parsed = LoketAdapter.parseEventJsonLd(page.body, url);
      if (!parsed || !parsed.name || !parsed.start_date) continue;
      if (!isTargetCity(parsed.city)) continue;

      records.push({
        discovery_source_id: 'src-loket',
        discovery_source_url: url,
        discovery_retrieved_at: new Date().toISOString(),
        discovery_evidence_hash: sha256(page.body),
        source_event_id: parsed.source_event_id,
        loket_event_slug: parsed.source_event_id,
        title: parsed.name,
        name: parsed.name,
        artists: [parsed.name],
        organizer: parsed.organizer,
        organizer_url: parsed.organizer_url,
        city: parsed.city,
        venue_name: parsed.venue_name,
        address_text: parsed.address_text,
        province: parsed.province,
        country: parsed.country,
        start_date: parsed.start_date,
        start_time: parsed.start_time,
        start_datetime: parsed.start_datetime,
        end_date: parsed.end_date,
        end_datetime: parsed.end_datetime,
        timezone: parsed.timezone,
        category: 'FESTIVAL',
        min_price: parsed.min_price,
        max_price: parsed.max_price,
        currency: parsed.currency,
        official_event_url: parsed.official_event_url,
        official_ticket_url: parsed.official_ticket_url,
        image_url: parsed.image_url,
        image_source_type: 'OFFICIAL_TICKETING',
        image_source_url: url,
        image_credit: 'LOKET'
      });
    } catch (err) {
      console.warn(`  [LOKET] ${url} failed: ${err.message}`);
    }
  }

  console.log(`  [LOKET] in-scope Indonesian events collected: ${records.length}`);
  return records;
}

async function collectBbo() {
  const url = 'https://bbo.co.id/feature-bbo-events.html';
  try {
    const page = await fetchPolite(url);
    const cards = BboAdapter.parseListingHtml(page.body);
    const hash = sha256(page.body);
    console.log(`  [BBO] event cards observed (year NOT published): ${cards.length}`);
    return cards.map(c => ({
      ...c,
      discovery_source_id: 'src-bbo',
      discovery_source_url: url,
      discovery_retrieved_at: new Date().toISOString(),
      discovery_evidence_hash: hash,
      country: 'Indonesia',
      category: 'OTHER',
      status: 'DISCOVERED'
    }));
  } catch (err) {
    console.warn(`  [BBO] ${url} failed: ${err.message}`);
    return [];
  }
}

// ============================================================================
// CORROBORATION
// ============================================================================

/**
 * Promotes a discovered record using an official Indonesian authority page.
 * Any failure (fetch error, missing factual token) fails closed to DISCOVERY_ONLY.
 */
async function corroborate(record, evidenceCache) {
  const rule = matchEvidenceRule(record);
  if (!rule) {
    return {
      promoted: null,
      rejected: {
        ...record,
        verification_mode: 'DISCOVERY_ONLY',
        corroboration_result: 'NO_AUTHORITATIVE_RULE'
      }
    };
  }

  try {
    if (!evidenceCache.has(rule.evidence_url)) {
      const page = await fetchPolite(rule.evidence_url);
      evidenceCache.set(rule.evidence_url, {
        url: rule.evidence_url,
        body: page.body,
        hash: sha256(page.body),
        retrieved_at: new Date().toISOString()
      });
    }
    const evidence = evidenceCache.get(rule.evidence_url);

    if (!tokensPresent(evidence.body, rule.expect_tokens)) {
      return {
        promoted: null,
        rejected: {
          ...record,
          authoritative_source_id: rule.authoritative_source_id,
          authoritative_source_url: rule.evidence_url,
          verification_mode: 'DISCOVERY_ONLY',
          corroboration_result: 'AUTHORITATIVE_TOKEN_MISMATCH'
        }
      };
    }

    const officialPoster = extractOgImage(evidence.body);

    return {
      promoted: {
        ...record,
        verification_mode: 'AUTHORITATIVE_CORROBORATED',
        corroboration_rule_id: rule.id,
        corroboration_result: 'AUTHORITATIVE_TOKENS_VERIFIED',
        corroborating_source_ids: Array.from(new Set([record.discovery_source_id, rule.authoritative_source_id])),
        authoritative_source_id: rule.authoritative_source_id,
        authoritative_source_url: evidence.url,
        authoritative_retrieved_at: evidence.retrieved_at,
        authoritative_evidence_hash: evidence.hash,
        image_url: officialPoster || record.image_url,
        image_source_type: officialPoster ? rule.image_source_type : record.image_source_type,
        image_source_url: officialPoster ? evidence.url : record.image_source_url,
        image_credit: officialPoster ? rule.image_credit : record.image_credit
      },
      rejected: null
    };
  } catch (err) {
    return {
      promoted: null,
      rejected: {
        ...record,
        authoritative_source_id: rule.authoritative_source_id,
        authoritative_source_url: rule.evidence_url,
        verification_mode: 'DISCOVERY_ONLY',
        corroboration_result: 'AUTHORITATIVE_FETCH_FAILED',
        corroboration_error: err.message
      }
    };
  }
}

// ============================================================================
// BUILD
// ============================================================================

const STAGE_SOURCE_IDS = {
  ln: ['src-livenation'],
  loket: ['src-loket'],
  bbo: ['src-bbo']
};

/**
 * Builds the full snapshot document for the requested stage.
 * @param {object} options
 * @param {'all'|'ln'|'loket'|'bbo'} options.stage
 * @param {object|null} options.existingSnapshot - previous snapshot (staged runs preserve other sources)
 * @param {function} options.log
 */
async function buildSnapshot({ stage = 'all', existingSnapshot = null, pagePaths = null, log = console.log } = {}) {
  let liveNationRecords = [];
  let loketRecords = [];
  let bboRecords = [];

  if (stage === 'all' || stage === 'ln') {
    log('\n[LN] Live Nation Asia (Tier 1 promoter calendar)');
    liveNationRecords = await collectLiveNation({ pagePaths });
  }
  if (stage === 'all' || stage === 'loket') {
    log('\n[LOKET] LOKET (Tier 2 transaction source, schema.org/Event JSON-LD)');
    loketRecords = await collectLoket();
  }
  if (stage === 'all' || stage === 'bbo') {
    log('\n[BBO] BBO Events (Tier 2 listing observations)');
    bboRecords = await collectBbo();
  }

  log('\n[CORROBORATION] Matching authoritative Indonesian authorities...');
  const evidenceCache = new Map();
  const records = [];
  const discoveryOnly = [...bboRecords];

  for (const rec of [...loketRecords, ...liveNationRecords]) {
    const { promoted, rejected } = await corroborate(rec, evidenceCache);
    if (promoted) {
      records.push(promoted);
      log(`  [OK] VERIFIED  ${promoted.title} | ${promoted.start_date} | ${promoted.city} | ${promoted.authoritative_source_id}`);
    } else if (rejected) {
      discoveryOnly.push(rejected);
      log(`  [..] DISCOVERY ${rejected.title || '(untitled)'} | ${rejected.corroboration_result}`);
    }
  }

  // Incremental refresh: preserve records of sources not refreshed in this stage
  // so a partial refresh never silently drops supply.
  let preservedRecords = [];
  let preservedDiscovery = [];
  if (stage !== 'all' && existingSnapshot) {
    if (stage === 'ln' && Array.isArray(pagePaths) && pagePaths.length) {
      // Per-page LN refresh: only replace records that came from the refreshed pages.
      const refreshedUrls = new Set(liveNationRecords.map(r => r.discovery_source_url));
      const belongsToRefreshedPage = r => r.discovery_source_id === 'src-livenation' && refreshedUrls.has(r.discovery_source_url);
      preservedRecords = (existingSnapshot.records || []).filter(r => !belongsToRefreshedPage(r));
      preservedDiscovery = (existingSnapshot.discovery_only_records || []).filter(r => !belongsToRefreshedPage(r));
    } else {
      const refreshed = STAGE_SOURCE_IDS[stage] || [];
      preservedRecords = (existingSnapshot.records || []).filter(r => !refreshed.includes(r.discovery_source_id));
      preservedDiscovery = (existingSnapshot.discovery_only_records || []).filter(r => !refreshed.includes(r.discovery_source_id));
    }
    log(`\n[PRESERVE] kept ${preservedRecords.length} verified + ${preservedDiscovery.length} discovery-only records from previous snapshot`);
  }

  const finalRecords = [...preservedRecords, ...records];
  const finalDiscovery = [...preservedDiscovery, ...discoveryOnly];

  return {
    schema: 'tikum.official_event_snapshot.v1',
    generated_at: new Date().toISOString(),
    generator: 'scripts/refresh_official_event_snapshot.js',
    stage,
    user_agent: USER_AGENT,
    policy: {
      robots: 'HONOURED — every host audited before allow-listing',
      rate_limit: `${MIN_HOST_INTERVAL_MS}ms minimum per-host spacing`,
      prohibited: 'No CAPTCHA/WAF bypass, no login, no private endpoints, no proxy rotation',
      content: 'Factual fields only (name, date, venue, city, price, official links, official poster). No creative description scraping.'
    },
    allowed_hosts: Array.from(ALLOWED_HOSTS).sort(),
    target_cities: Array.from(TARGET_CITIES).sort(),
    totals: {
      verified_records: finalRecords.length,
      discovery_only_records: finalDiscovery.length
    },
    records: finalRecords,
    discovery_only_records: finalDiscovery
  };
}

module.exports = {
  USER_AGENT,
  MIN_HOST_INTERVAL_MS,
  REQUEST_TIMEOUT_MS,
  ALLOWED_HOSTS,
  TARGET_CITIES,
  LOKET_DISCOVERY_URLS,
  EVIDENCE_RULES,
  STAGE_SOURCE_IDS,
  sha256,
  fetchPolite,
  isTargetCity,
  extractOgImage,
  tokensPresent,
  matchEvidenceRule,
  collectLiveNation,
  collectLoket,
  collectBbo,
  corroborate,
  buildSnapshot
};



