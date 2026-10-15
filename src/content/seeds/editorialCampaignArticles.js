/**
 * TIKUM 30-Article Authority Campaign Seed Data
 * Comprehensive Indonesian Concert, Festival, and Ticketing Guides
 * 
 * Strict Editorial Standards:
 * - 30 complete, substantive, original Indonesian articles across 5 Editorial Pillars
 * - Cadence: 2x/week (Tuesday & Friday at 10:00 WIB, Article 1 on Thursday, 15 Oct 2026 10:00 WIB)
 * - Final Article: Friday, 22 January 2027 at 10:00 WIB
 * - Non-negotiable claim discipline: zero unsupported first-in-Indonesia, zero 100% scam-free
 * - OJK PayLater balanced guidelines in Article 07
 * - Durable announcement tracking guide without unverified dates in Article 30
 * - Technical SEO optimized: Title 35-75 chars, Meta desc 100-165 chars, H2 & H3 hierarchy
 */

const { pillarAArticles } = require('./pillarAArticles');
const { pillarBArticles } = require('./pillarBArticles');
const { pillarCArticles } = require('./pillarCArticles');
const { pillarDArticles } = require('./pillarDArticles');
const { pillarEArticles } = require('./pillarEArticles');

const EDITORIAL_ARTICLES = [
  ...pillarAArticles,
  ...pillarBArticles,
  ...pillarCArticles,
  ...pillarDArticles,
  ...pillarEArticles
];

module.exports = {
  EDITORIAL_ARTICLES
};
