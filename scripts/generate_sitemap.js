#!/usr/bin/env node
/**
 * TIKUM — Static Sitemap Generation Script
 * Syncs public/sitemap.xml with TechnicalSEOService during build.
 */

const fs = require('fs');
const path = require('path');
const { TechnicalSEOService } = require('../src/seo/TechnicalSEOService');
const { VenueRegistry } = require('../src/discovery/VenueRegistry');
const { CityRegistry } = require('../src/discovery/CityRegistry');
const { articleRepository } = require('../src/content/ArticleRepository');

function generate() {
  const xml = TechnicalSEOService.generateSitemapXml({
    getVenues: () => VenueRegistry.getAllVenues(),
    getCities: () => CityRegistry.getAllCities(),
    getPublishedArticles: () => articleRepository.getPublishedArticles()
  });

  const targetPath = path.resolve(__dirname, '../public/sitemap.xml');
  fs.writeFileSync(targetPath, xml, 'utf8');
  console.log(`Generated public/sitemap.xml (${xml.length} bytes).`);
}

if (require.main === module) {
  generate();
}

module.exports = { generate };
