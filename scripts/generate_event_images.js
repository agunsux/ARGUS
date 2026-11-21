/**
 * TIKUM / ARGUS — Local High-Contrast Event Image Generator
 * Generates crisp, branded, high-contrast SVG cover art in public/images/events/
 */

const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'public', 'images', 'events');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

function createSvg({ title, subtitle, category, badge, icon, bgGradient, accentColor }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${bgGradient[0]}" />
      <stop offset="100%" stop-color="${bgGradient[1]}" />
    </linearGradient>
    <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${accentColor}" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.2" />
    </linearGradient>
    <radialGradient id="spotlight" cx="50%" cy="30%" r="60%">
      <stop offset="0%" stop-color="${accentColor}" stop-opacity="0.25" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </radialGradient>
    <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
      <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="800" height="450" fill="url(#bg)" />
  <rect width="800" height="450" fill="url(#spotlight)" />
  <rect width="800" height="450" fill="url(#grid)" />

  <g transform="translate(50, 60)">
    <rect x="0" y="0" width="130" height="28" rx="14" fill="rgba(255,255,255,0.08)" stroke="${accentColor}" stroke-width="1.5" />
    <text x="65" y="18" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="800" fill="${accentColor}" text-anchor="middle" letter-spacing="1.5">${category.toUpperCase()}</text>
  </g>

  <g transform="translate(620, 60)">
    <rect x="0" y="0" width="130" height="28" rx="14" fill="rgba(16,185,129,0.15)" stroke="#10b981" stroke-width="1" />
    <text x="65" y="18" font-family="system-ui, -apple-system, sans-serif" font-size="10" font-weight="700" fill="#34d399" text-anchor="middle">${badge}</text>
  </g>

  <circle cx="400" cy="210" r="60" fill="rgba(255,255,255,0.03)" stroke="url(#glow)" stroke-width="2" />
  <text x="400" y="226" font-family="system-ui, -apple-system, sans-serif" font-size="42" text-anchor="middle" fill="${accentColor}">${icon}</text>

  <text x="400" y="320" font-family="system-ui, -apple-system, sans-serif" font-size="26" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="0.5">${title}</text>
  <text x="400" y="352" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="500" fill="#94a3b8" text-anchor="middle">${subtitle}</text>

  <g transform="translate(250, 390)">
    <rect x="0" y="0" width="300" height="32" rx="6" fill="rgba(15,23,42,0.8)" stroke="rgba(255,255,255,0.1)" stroke-width="1" />
    <text x="150" y="20" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="600" fill="#cbd5e1" text-anchor="middle">TIKUM.APP • TRANSAKSI TERVERIFIKASI</text>
  </g>
</svg>`;
}

const templates = [
  // Defaults
  { file: 'concert-default.svg', title: 'Live Concert &amp; Music Festival', subtitle: 'Panggung Musik Resmi • Indonesia', category: 'Concert', badge: 'VERIFIED EVENT', icon: '&#9835;', bgGradient: ['#090d16', '#1e1b4b'], accentColor: '#ec4899' },
  { file: 'sports-default.svg', title: 'Official Sports Championship', subtitle: 'Pertandingan Olahraga Resmi • Indonesia', category: 'Sports', badge: 'VERIFIED EVENT', icon: '&#9917;', bgGradient: ['#090d16', '#064e3b'], accentColor: '#10b981' },
  { file: 'standup-default.svg', title: 'Stand-Up Comedy Special', subtitle: 'Tur Komedi Tunggal Resmi • Indonesia', category: 'Comedy', badge: 'VERIFIED EVENT', icon: '&#127908;', bgGradient: ['#090d16', '#78350f'], accentColor: '#f59e0b' },
  { file: 'festival-default.svg', title: 'Arts &amp; Cultural Festival', subtitle: 'Festival Seni &amp; Budaya • Indonesia', category: 'Festival', badge: 'VERIFIED EVENT', icon: '&#10024;', bgGradient: ['#090d16', '#312e81'], accentColor: '#6366f1' },

  // Featured Concerts
  { file: 'bts-arirang-world-tour-jakarta-2026.svg', title: "BTS WORLD TOUR 'ARIRANG' 2026", subtitle: 'Gelora Bung Karno Main Stadium, Jakarta', category: 'Concert', badge: 'SOLD OUT', icon: '&#9733;', bgGradient: ['#0f051d', '#3b0764'], accentColor: '#c084fc' },
  { file: 'bigbang-world-tour-jakarta-2026.svg', title: 'BIGBANG 2026–27 WORLD TOUR', subtitle: 'Jakarta International Stadium (JIS), Jakarta', category: 'Concert', badge: 'OFFICIAL SALE', icon: '&#10070;', bgGradient: ['#030712', '#1f2937'], accentColor: '#fbbf24' },
  { file: 'morgan-jay-goofy-guy-jakarta-2026.svg', title: 'Morgan Jay: The Goofy Guy Tour', subtitle: 'Nafiri Convention Hall, Jakarta', category: 'Comedy', badge: 'SOLD OUT', icon: '&#9836;', bgGradient: ['#0f172a', '#1e293b'], accentColor: '#38bdf8' },
  { file: 'mcr-live-in-jakarta-2026.svg', title: 'My Chemical Romance — Live in Jakarta', subtitle: 'Jakarta International Stadium (JIS), Jakarta', category: 'Concert', badge: 'RAVEL PROMOTER', icon: '&#10017;', bgGradient: ['#050505', '#1c1917'], accentColor: '#ef4444' },
  { file: 'guns-n-roses-jakarta-2026.svg', title: "Guns N' Roses — Jakarta 2026", subtitle: 'Gelora Bung Karno Main Stadium, Jakarta', category: 'Concert', badge: 'STADIUM TOUR', icon: '&#9874;', bgGradient: ['#0a0a0a', '#292524'], accentColor: '#eab308' },
  { file: 'king-nassar-lost-in-the-jungle-2026.svg', title: 'King Nassar: Lost In The Jungle', subtitle: 'Istora Senayan, Jakarta', category: 'Concert', badge: 'SOLD OUT', icon: '&#128081;', bgGradient: ['#052e16', '#14532d'], accentColor: '#4ade80' },
  { file: 'the-15th-efestaphoria-surabaya-2026.svg', title: 'The 15th Efestaphoria', subtitle: 'Jatim Expo, Surabaya', category: 'Festival', badge: 'OFFICIAL EVENT', icon: '&#9835;', bgGradient: ['#172554', '#1e3a8a'], accentColor: '#60a5fa' },
  { file: 'lany-beautiful-blur-jakarta-2026.svg', title: "LANY: 'a beautiful blur' Tour", subtitle: 'Beach City International Stadium, Jakarta', category: 'Concert', badge: 'ARENA TOUR', icon: '&#9729;', bgGradient: ['#09090b', '#27272a'], accentColor: '#a1a1aa' },
  { file: 'dwp-2026-jakarta.svg', title: 'Djakarta Warehouse Project 2026', subtitle: 'JIExpo Kemayoran, Jakarta', category: 'Festival', badge: '3-DAY PASS', icon: '&#9889;', bgGradient: ['#1e1b4b', '#431407'], accentColor: '#f97316' },

  // Sports
  { file: 'ibl-finals-jakarta-2026.svg', title: 'IBL Finals 2026', subtitle: 'Indonesia Arena, Senayan, Jakarta', category: 'Sports', badge: 'CHAMPIONSHIP', icon: '&#127936;', bgGradient: ['#0c1a2e', '#1e3a8a'], accentColor: '#38bdf8' },
  { file: 'indonesia-open-badminton-2026.svg', title: 'POLYTRON Indonesia Open 2026', subtitle: 'Istora Senayan, Jakarta', category: 'Sports', badge: 'BWF SUPER 1000', icon: '&#127992;', bgGradient: ['#022c22', '#064e3b'], accentColor: '#34d399' },
  { file: 'tora-fight-series-2026.svg', title: 'Tora Fight Series 2026 (MMA)', subtitle: 'Tennis Indoor Senayan, Jakarta', category: 'Sports', badge: 'FIGHT NIGHT', icon: '&#9876;', bgGradient: ['#1c1917', '#450a0a'], accentColor: '#f87171' },

  // Stand-up Comedy
  { file: 'suci-fest-2026-jakarta.svg', title: 'SUCI FEST 2026', subtitle: 'Batek Theater, Balai Kartini, Jakarta', category: 'Comedy', badge: 'KOMPAS TV', icon: '&#127908;', bgGradient: ['#1e1b4b', '#312e81'], accentColor: '#a78bfa' },
  { file: 'abdel-achrian-menolak-muda.svg', title: 'Abdel Achrian: Menolak Muda', subtitle: 'Teater Jakarta, TIM, Jakarta', category: 'Comedy', badge: 'SPECIAL SHOW', icon: '&#128514;', bgGradient: ['#2e1065', '#3b0764'], accentColor: '#e879f9' },
  { file: 'abdur-arsyad-kontras-special.svg', title: 'Abdur Arsyad: Kontras', subtitle: 'Usmar Ismail Hall, Jakarta', category: 'Comedy', badge: 'SOLO SPECIAL', icon: '&#128172;', bgGradient: ['#18181b', '#27272a'], accentColor: '#fbbf24' },
  { file: 'pandji-mens-rea-standup-tour.svg', title: 'Pandji Pragiwaksono: Mens Rea Tour', subtitle: 'Grand Pacific Hall, Yogyakarta', category: 'Comedy', badge: 'WORLD TOUR', icon: '&#9878;', bgGradient: ['#1c1917', '#292524'], accentColor: '#f59e0b' },

  // Festivals & Partner Tickets
  { file: 'ultraverse-festival-2026.svg', title: 'Ultraverse Festival 2026', subtitle: 'JIExpo Kemayoran, Jakarta', category: 'Festival', badge: 'GOERS TICKET', icon: '&#10024;', bgGradient: ['#1e1b4b', '#065f46'], accentColor: '#2dd4bf' },
  { file: 'soundrenaline-sana-sini-2026.svg', title: 'Soundrenaline Sana Sini 2026', subtitle: 'Carnival Circuit Ancol, Jakarta', category: 'Festival', badge: 'GOERS TICKET', icon: '&#127928;', bgGradient: ['#450a0a', '#1e1b4b'], accentColor: '#fb7185' },
  { file: 'boomfest-bandung-2026.svg', title: 'BOOMFEST BANDUNG 2026', subtitle: 'Lapangan PPI Pussenif, Bandung', category: 'Festival', badge: 'KIOSTIX PARTNER', icon: '&#127931;', bgGradient: ['#172554', '#1e293b'], accentColor: '#38bdf8' },
  { file: 'nyanyian-riang-gembira-2026.svg', title: 'Nyanyian Riang Gembira Tour 2026', subtitle: 'Gambir Expo JIExpo, Jakarta', category: 'Concert', badge: 'DEWATIKET', icon: '&#9836;', bgGradient: ['#0f172a', '#164e63'], accentColor: '#22d3ee' },
  { file: 'spectra-fest-2026.svg', title: 'Spectra Fest 2026', subtitle: 'Stadion Madya GBK, Jakarta', category: 'Festival', badge: 'DEWATIKET', icon: '&#9733;', bgGradient: ['#3b0764', '#1e1b4b'], accentColor: '#d946ef' },
  { file: 'jogja-rockarta-festival-2026.svg', title: 'Jogja Rockarta Festival 2026', subtitle: 'Kridosono Stadium, Yogyakarta', category: 'Festival', badge: 'ARTATIX PARTNER', icon: '&#129304;', bgGradient: ['#18181b', '#450a0a'], accentColor: '#ef4444' }
];

let count = 0;
for (const t of templates) {
  const content = createSvg(t);
  fs.writeFileSync(path.join(outDir, t.file), content, 'utf8');
  count++;
}
console.log(`Successfully created ${count} event SVGs in ${outDir}`);
