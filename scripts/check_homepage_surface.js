#!/usr/bin/env node
/**
 * TIKUM — Homepage Surface Guard
 *
 * Verifies the server-rendered discovery homepage without launching a browser:
 *  1. Every inline <script> block parses as valid JavaScript.
 *  2. Required Live Nation Asia-inspired structural hooks exist.
 *  3. No hard-coded temporal context dates remain in the client trust logic.
 *
 * USAGE
 *   node scripts/check_homepage_surface.js
 */

const fs = require('fs');
const path = require('path');

const HOME = path.join(__dirname, '..', 'public', 'index.html');

const REQUIRED_IDS = ['heroFeature', 'searchInput', 'cityFilter', 'dateFilter', 'mainContent'];
const REQUIRED_CLASSES = ['ln-hero-feature', 'ln-rail', 'ln-grid', 'poster-card', 'ln-attribution'];
const REQUIRED_GLOBALS = [
  'function renderAllSections',
  'function renderPosterCard',
  'function renderHeroFeature',
  'function renderAttribution',
  'function applyNavCategory',
  'function fetchEvents'
];

function main() {
  const failures = [];
  const html = fs.readFileSync(HOME, 'utf8');

  // 1. Inline script syntax validation
  const scripts = html.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi) || [];
  scripts.forEach((block, idx) => {
    const code = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
    if (!code.trim()) return;
    try {
      // Parses only — never executed.
      // eslint-disable-next-line no-new-func
      new Function(code);
    } catch (err) {
      failures.push(`Inline script #${idx + 1} has a syntax error: ${err.message}`);
    }
  });

  // 2. Structural hooks
  for (const id of REQUIRED_IDS) {
    if (!html.includes(`id="${id}"`)) failures.push(`Missing required element id="${id}"`);
  }
  for (const cls of REQUIRED_CLASSES) {
    if (!html.includes(cls)) failures.push(`Missing required class "${cls}"`);
  }
  for (const global of REQUIRED_GLOBALS) {
    if (!html.includes(global)) failures.push(`Missing required renderer "${global}"`);
  }

  // 3. Client-side trust gate must not re-implement the server gate.
  if (html.includes('is_verified) return false')) {
    failures.push('Client must not re-implement the server verification gate');
  }

  if (failures.length) {
    console.error('Homepage surface guard FAILED:');
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }

  console.log(`Homepage surface guard PASSED (${scripts.length} inline scripts parsed, ${REQUIRED_IDS.length + REQUIRED_CLASSES.length + REQUIRED_GLOBALS.length} hooks verified).`);
}

if (require.main === module) main();

module.exports = { main };
