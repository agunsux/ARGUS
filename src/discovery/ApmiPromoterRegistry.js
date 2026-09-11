/**
 * TIKUM — APMI (Asosiasi Promotor Musik Indonesia) Promoter Registry & Archive
 * 
 * Authoritative directory of Indonesia's accredited music festival and concert promoters.
 * Synchronized with https://apmi.co.id/#members
 * Trust Tier: TIER S (Official Industry Apex Association)
 */

const APMI_ASSOCIATION_METADATA = {
  association_id: 'assoc-apmi',
  name: 'Asosiasi Promotor Musik Indonesia (APMI)',
  short_name: 'APMI',
  official_website: 'https://apmi.co.id',
  members_url: 'https://apmi.co.id/#members',
  instagram: 'https://www.instagram.com/apmi.ind',
  description: 'Asosiasi resmi yang menaungi promotor konser dan festival musik di Indonesia untuk memajukan ekosistem pertunjukan musik langsung.',
  board: [
    { name: 'Dino Hamid', role: 'Chairman of the Board', company: 'New Live Entertainment' },
    { name: 'Novry Hetharia', role: 'Executive Board', company: 'APMI Secretariat' },
    { name: 'Fauzan Einil', role: 'Executive Board', company: 'APMI Regulatory & Operations' },
    { name: 'Sysan Ibrahim', role: 'Executive Board', company: 'Otello Asia' },
    { name: 'Ferry Dermawan', role: 'Head of Program & Product', company: 'Plainsong Live' },
    { name: 'Kimo Rizky', role: 'Head of Digital & Research', company: 'Double Deer Music' },
    { name: 'Budi Mulianto', role: 'Head of Public Relations', company: 'ALOKA' },
    { name: 'Arief Darussalam', role: 'Head of Education & Curation', company: 'Antarasuara' }
  ]
};

const APMI_MEMBERS = [
  {
    slug: 'boss-creator',
    name: 'Boss Creator',
    legal_name: 'PT Boss Kreator Indonesia',
    source_id: 'src-promoter-boss-creator',
    website: 'https://bosscreator.id',
    instagram: 'https://www.instagram.com/boss.creator/',
    youtube: 'https://www.youtube.com/@bosshow_creator',
    signature_events: ['Pestapora', 'Pestapora Showcase', 'Boss Creator Intimate Concerts'],
    event_keywords: ['pestapora', 'boss creator'],
    primary_cities: ['Jakarta', 'Bandung', 'Yogyakarta'],
    trust_tier: 'TIER_S',
    verified: true,
    bio: 'Promotor di balik festival multi-genre terbesar Pestapora dan berbagai konser festival ikonik di Indonesia.'
  },
  {
    slug: 'antarasuara',
    name: 'Antarasuara',
    legal_name: 'PT Antara Suara Bersama',
    source_id: 'src-promoter-antarasuara',
    website: 'https://antarasuara.com',
    instagram: 'https://www.instagram.com/antara.suara/',
    youtube: 'https://www.youtube.com/@antarasuara',
    signature_events: ['Sheila on 7 "Tunggu Aku Di" Stadium Tour', 'Hindia Menari dengan Bayangan', 'Kunto Aji Konser'],
    event_keywords: ['sheila on 7', 'tunggu aku di', 'antarasuara'],
    primary_cities: ['Jakarta', 'Bandung', 'Medan', 'Makassar', 'Samarinda', 'Pekanbaru'],
    trust_tier: 'TIER_S',
    verified: true,
    bio: 'Promotor spesialis tur stadion dan konser tunggal musisi legendaris Indonesia dengan fokus pengalaman penonton.'
  },
  {
    slug: 'otello-asia',
    name: 'Otello Asia',
    legal_name: 'PT Otello Asia Pratama',
    source_id: 'src-promoter-otello-asia',
    website: 'https://www.otelloasia.com',
    instagram: 'https://www.instagram.com/otelloasia',
    signature_events: ['Dewa 19 All Stars Stadium Tour', 'Westlife The Wild Dreams Tour', 'Michael Learns to Rock'],
    event_keywords: ['dewa 19', 'all stars', 'otello asia'],
    primary_cities: ['Jakarta', 'Bandung', 'Surakarta', 'Surabaya', 'Bali'],
    trust_tier: 'TIER_S',
    verified: true,
    bio: 'Promotor konser internasional dan konser stadion megah Dewa 19 All Stars di stadion Gelora Bung Karno dan kota-kota besar.'
  },
  {
    slug: 'aloka',
    name: 'ALOKA',
    legal_name: 'PT Aloka Creative Indonesia',
    source_id: 'src-promoter-aloka',
    website: 'https://aloka.co.id',
    instagram: 'https://www.instagram.com/aloka.id',
    tiktok: 'https://www.tiktok.com/@aloka.id',
    youtube: 'https://www.youtube.com/@alokamedia',
    signature_events: ['Asian Pop Concerts', 'K-Pop Fan Meetings', 'International Orchestras'],
    event_keywords: ['aloka', 'k-pop', 'fan meeting'],
    primary_cities: ['Jakarta', 'Tangerang'],
    trust_tier: 'TIER_S',
    verified: true,
    bio: 'Promotor terkemuka untuk tur artis Asia, konser K-Pop, fan meeting resmi, serta pertunjukan orkestra skala arena.'
  },
  {
    slug: 'doubledeer',
    name: 'DOUBLEDEER',
    legal_name: 'PT Rusa Dua Indonesia',
    source_id: 'src-promoter-doubledeer',
    website: 'https://doubledeer.co',
    instagram: 'https://www.instagram.com/doubledeer.co/',
    tiktok: 'https://www.tiktok.com/@_doubledeer',
    youtube: 'https://www.youtube.com/c/DoubleDeerCo',
    signature_events: ['Double Deer Electronic Music Showcase', 'Indie & Beatmaker Nights'],
    event_keywords: ['doubledeer', 'double deer'],
    primary_cities: ['Jakarta', 'Bandung', 'Bali'],
    trust_tier: 'TIER_S',
    verified: true,
    bio: 'Kolektif dan promotor musik elektronik, kurasi musisi indie progresif, serta aktivasi kreatif skena musik alternatif.'
  },
  {
    slug: 'plainsong-live',
    name: 'Plainsong Live',
    legal_name: 'PT Plainsong Live Kreasi',
    source_id: 'src-promoter-plainsong',
    website: 'https://joylandfest.com',
    instagram: 'https://www.instagram.com/joylandfest/',
    signature_events: ['Joyland Festival Bali', 'Joyland Festival Jakarta'],
    event_keywords: ['joyland', 'joyland festival', 'plainsong live'],
    primary_cities: ['Bali', 'Jakarta'],
    trust_tier: 'TIER_S',
    verified: true,
    bio: 'Promotor di balik Joyland Festival, perayaan musik internasional, komedi, seni rupa, dan bioskop luar ruang di Bali dan Jakarta.'
  },
  {
    slug: 'pk-entertainment',
    name: 'PK Entertainment',
    legal_name: 'PT Prima Kreatif Entertainment',
    source_id: 'src-promoter-pk-ent',
    website: 'https://pk-ent.com',
    instagram: 'https://www.instagram.com/pkentertainment.id/',
    signature_events: ['Coldplay Music of the Spheres Jakarta', 'Ed Sheeran + - = ÷ x Tour Jakarta', 'Justin Bieber Justice Tour'],
    event_keywords: ['coldplay', 'ed sheeran', 'pk entertainment'],
    primary_cities: ['Jakarta'],
    trust_tier: 'TIER_S',
    verified: true,
    bio: 'Promotor konser artis internasional kelas A-list dunia di Gelora Bung Karno, JIS, dan venue arena nasional.'
  },
  {
    slug: 'ismaya-live',
    name: 'Ismaya Live',
    legal_name: 'PT Ismaya Live',
    source_id: 'src-promoter-isb-live',
    website: 'https://ismayalive.com',
    instagram: 'https://www.instagram.com/ismayalive/',
    signature_events: ['Djakarta Warehouse Project (DWP)', 'We The Fest (WTF)'],
    event_keywords: ['dwp', 'djakarta warehouse project', 'we the fest', 'ismaya live'],
    primary_cities: ['Jakarta', 'Bali'],
    trust_tier: 'TIER_S',
    verified: true,
    bio: 'Divisi hiburan live Ismaya Group penyelenggara festival musik terbesar Asia Tenggara DWP dan festival gaya hidup We The Fest.'
  },
  {
    slug: 'sound-rhythm',
    name: 'Sound Rhythm',
    legal_name: 'PT Sound Rhythm Kreasi',
    source_id: 'src-promoter-sound-rh',
    website: 'https://soundrhythm.id',
    instagram: 'https://www.instagram.com/soundrhythm/',
    signature_events: ['OneRepublic The Artificial Paradise Tour', 'Kygo Live in Jakarta', 'Charlie Puth'],
    event_keywords: ['sound rhythm', 'onerepublic', 'kygo'],
    primary_cities: ['Jakarta', 'Bali'],
    trust_tier: 'TIER_S',
    verified: true,
    bio: 'Promotor konser musik pop, R&B, dan rock internasional terkemuka di Indonesia sejak era 2000-an.'
  },
  {
    slug: 'new-live-entertainment',
    name: 'New Live Entertainment',
    legal_name: 'PT New Live Entertainment',
    source_id: 'src-promoter-new-live',
    website: 'https://newliveentertainment.com',
    instagram: 'https://www.instagram.com/newliveentertainment/',
    signature_events: ['Kahitna 36 Tahun Anniversary Concert', 'Romantic Valentine Series'],
    event_keywords: ['kahitna', 'new live entertainment', 'berlian entertainment'],
    primary_cities: ['Jakarta', 'Bandung'],
    trust_tier: 'TIER_S',
    verified: true,
    bio: 'Didirikan oleh Dino Hamid (Ketua APMI), memelopori konser tematik, drive-in festival, dan pertunjukan arena musisi papan atas.'
  },
  {
    slug: 'rajawali-indonesia',
    name: 'Rajawali Indonesia',
    legal_name: 'PT Rajawali Indonesia Komunika',
    source_id: 'src-promoter-rajawali',
    website: 'https://rajawaliindonesia.com',
    instagram: 'https://www.instagram.com/rajawaliindonesia/',
    signature_events: ['Prambanan Jazz Festival', 'JogjaROCKarta Festival'],
    event_keywords: ['prambanan jazz', 'jogjarockarta', 'rajawali indonesia'],
    primary_cities: ['Yogyakarta', 'Surakarta', 'Semarang'],
    trust_tier: 'TIER_S',
    verified: true,
    bio: 'Promotor festival berlatar warisan budaya Candi Prambanan dan panggung rock internasional terbesar di Jawa Tengah/Yogyakarta.'
  },
  {
    slug: 'pt-tujuh-karya-sinergi',
    name: 'PT. Tujuh Karya Sinergi',
    legal_name: 'PT Tujuh Karya Sinergi (TKS)',
    source_id: 'src-promoter-tks',
    instagram: 'https://www.instagram.com/tujuhkaryasinergi/',
    signature_events: ['Regional Cultural Music Showcases', 'Corporate & Live Entertainment'],
    event_keywords: ['tujuh karya sinergi', 'tks'],
    primary_cities: ['Jakarta', 'Bandung'],
    trust_tier: 'TIER_S',
    verified: true,
    bio: 'Penyelenggara pertunjukan musik regional, aktivasi pertunjukan panggung, dan konser musik korporat terakreditasi APMI.'
  },
  {
    slug: 'raw-vision-collective',
    name: 'Raw Vision Collective',
    legal_name: 'PT Raw Vision Kolektif',
    source_id: 'src-promoter-raw-vision',
    website: 'https://rawvision.id',
    instagram: 'https://www.instagram.com/rawvision.collective/',
    tiktok: 'https://www.tiktok.com/@rawvision.collective',
    youtube: 'https://www.youtube.com/@RawVisionCollective',
    signature_events: ['Underground Music Showcases', 'Alternative Culture Tours'],
    event_keywords: ['raw vision', 'raw vision collective'],
    primary_cities: ['Jakarta', 'Bandung', 'Bali'],
    trust_tier: 'TIER_S',
    verified: true,
    bio: 'Kolektif promotor skena musik urban, hip-hop, underground, dan kultur pemuda kontemporer di Indonesia.'
  },
  {
    slug: 'the-goodwill-creators',
    name: 'The GoodWill Creators',
    legal_name: 'PT Goodwill Kreator Indonesia',
    source_id: 'src-promoter-goodwill',
    instagram: 'https://www.instagram.com/thegoodwill.creators/',
    signature_events: ['Collaborative Brand Festivals', 'Art & Music Exhibitions'],
    event_keywords: ['goodwill creators', 'the goodwill creators'],
    primary_cities: ['Jakarta'],
    trust_tier: 'TIER_S',
    verified: true,
    bio: 'Promotor kreatif yang mengintegrasikan festival musik, eksibisi seni, dan aktivasi kolaborasi brand berskala nasional.'
  }
];

class ApmiPromoterRegistry {
  constructor() {
    this.association = APMI_ASSOCIATION_METADATA;
    this.members = new Map();
    for (const m of APMI_MEMBERS) {
      this.members.set(m.slug, m);
    }
  }

  /**
   * Returns APMI association metadata and leadership.
   */
  getAssociationInfo() {
    return { ...this.association };
  }

  /**
   * Returns all accredited APMI member promoters.
   */
  getAllMembers() {
    return Array.from(this.members.values());
  }

  /**
   * Finds a member by slug (e.g. 'boss-creator') or name.
   */
  getMemberBySlug(slugOrName) {
    if (!slugOrName) return null;
    const clean = String(slugOrName).toLowerCase().trim();
    if (this.members.has(clean)) return this.members.get(clean);

    // Search by name match or alias
    for (const m of this.members.values()) {
      if (m.name.toLowerCase() === clean || m.legal_name.toLowerCase() === clean) {
        return m;
      }
      if (clean.includes(m.slug) || m.slug.includes(clean)) {
        return m;
      }
    }
    return null;
  }

  /**
   * Retrieves all canonical events associated with an APMI member promoter.
   * Cross-references CanonicalEventRegistry events by promoter_id, organizer_name, or event keywords.
   * 
   * @param {string} slugOrName - APMI member slug or name
   * @param {object} canonicalRegistry - CanonicalEventRegistry instance
   * @returns {object} { promoter, events: { upcoming: [], completed: [], all: [] }, count }
   */
  getEventsForPromoter(slugOrName, canonicalRegistry) {
    const member = this.getMemberBySlug(slugOrName);
    if (!member) return null;

    const allEvents = canonicalRegistry ? canonicalRegistry.getAllEvents() : [];
    const matchedEvents = [];

    for (const ev of allEvents) {
      const orgStr = (ev.organizer_name || ev.promoter_name || '').toLowerCase();
      const titleStr = (ev.canonical_name || ev.name || '').toLowerCase();
      const descStr = (ev.description || '').toLowerCase();
      const srcIds = (ev.sources || []).map(s => s.source_id);

      let isMatch = false;

      // 1. Direct promoter ID or source ID match
      if (ev.promoter_id === member.source_id || srcIds.includes(member.source_id)) {
        isMatch = true;
      }
      // 2. Organizer name matches
      else if (orgStr && (orgStr.includes(member.name.toLowerCase()) || member.name.toLowerCase().includes(orgStr))) {
        isMatch = true;
      }
      // 3. Keyword / signature event match
      else if (member.event_keywords && member.event_keywords.some(kw => titleStr.includes(kw) || descStr.includes(kw))) {
        isMatch = true;
      }

      if (isMatch) {
        matchedEvents.push(ev);
      }
    }

    const now = new Date().toISOString();
    const upcoming = matchedEvents.filter(e => e.status !== 'CANCELLED' && (e.start_date || e.date) >= now.substring(0, 10));
    const completed = matchedEvents.filter(e => e.status === 'COMPLETED' || e.status === 'ARCHIVED' || ((e.start_date || e.date) < now.substring(0, 10) && e.status !== 'CANCELLED'));
    const cancelled = matchedEvents.filter(e => e.status === 'CANCELLED');

    return {
      promoter: member,
      events: {
        total: matchedEvents.length,
        upcoming_count: upcoming.length,
        completed_count: completed.length,
        cancelled_count: cancelled.length,
        upcoming,
        completed,
        cancelled,
        all: matchedEvents
      }
    };
  }

  /**
   * Compiles complete APMI directory with aggregated event counts across Indonesia.
   * 
   * @param {object} canonicalRegistry - CanonicalEventRegistry instance
   */
  getAllPromotersWithEvents(canonicalRegistry) {
    const results = [];
    for (const member of this.members.values()) {
      const data = this.getEventsForPromoter(member.slug, canonicalRegistry);
      results.push({
        ...member,
        event_metrics: {
          total_events: data.events.total,
          upcoming_events: data.events.upcoming_count,
          completed_events: data.events.completed_count
        },
        sample_events: data.events.upcoming.slice(0, 3)
      });
    }

    return {
      association: this.association,
      total_members: this.members.size,
      members: results
    };
  }
}

const apmiPromoterRegistryInstance = new ApmiPromoterRegistry();

module.exports = {
  ApmiPromoterRegistry,
  apmiPromoterRegistry: apmiPromoterRegistryInstance,
  APMI_ASSOCIATION_METADATA,
  APMI_MEMBERS
};
