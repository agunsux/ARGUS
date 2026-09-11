/**
 * TIKUM Content Engine — Content Model & Validation Schema
 * 
 * Strict Editorial Pillars:
 * PILLAR A: EVENT_DISCOVERY
 * PILLAR B: TICKET_BUYING
 * PILLAR C: SAFETY
 * PILLAR D: RESALE_EDUCATION
 * PILLAR E: EVENT_GUIDES
 */

const CONTENT_PILLARS = {
  EVENT_DISCOVERY: 'EVENT_DISCOVERY',
  TICKET_BUYING: 'TICKET_BUYING',
  SAFETY: 'SAFETY',
  RESALE_EDUCATION: 'RESALE_EDUCATION',
  EVENT_GUIDES: 'EVENT_GUIDES'
};

const CONTENT_STATUS = {
  DRAFT: 'draft',
  REVIEW: 'review',
  APPROVED: 'approved',
  SCHEDULED: 'scheduled',
  PUBLISHED: 'published',
  FAILED: 'failed',
  ARCHIVED: 'archived'
};

const SEARCH_INTENTS = {
  INFORMATIONAL: 'informational',
  COMMERCIAL: 'commercial',
  TRANSACTIONAL: 'transactional'
};

class ContentModel {
  /**
   * Validates and normalizes an article object
   */
  static validate(article) {
    const errors = [];

    if (!article.id) errors.push('Article id is required');
    if (!article.title || article.title.trim().length < 10) errors.push('Title must be at least 10 characters');
    if (!article.slug || !/^[a-z0-9-]+$/.test(article.slug)) errors.push('Slug must be valid lowercase alphanumeric hyphenated format');
    if (!article.description || article.description.trim().length < 40) errors.push('Description must be at least 40 characters');
    if (!Object.values(CONTENT_PILLARS).includes(article.category)) errors.push(`Category must be one of: ${Object.values(CONTENT_PILLARS).join(', ')}`);
    if (!article.content || article.content.trim().length < 100) errors.push('Content must be at least 100 characters');
    if (!Object.values(CONTENT_STATUS).includes(article.status)) errors.push(`Status must be one of: ${Object.values(CONTENT_STATUS).join(', ')}`);

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Creates a normalized article record
   */
  static create(data) {
    const now = new Date().toISOString();
    const slug = data.slug || (data.title ? data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : `art-${Date.now()}`);

    return {
      id: data.id || `art-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title: (data.title || '').trim(),
      slug: slug,
      description: (data.description || '').trim(),
      category: data.category || CONTENT_PILLARS.RESALE_EDUCATION,
      keywords: Array.isArray(data.keywords) ? data.keywords : [],
      search_intent: data.search_intent || SEARCH_INTENTS.INFORMATIONAL,
      content: data.content || '',
      author: data.author || 'Tim Editorial Tikum',
      status: data.status || CONTENT_STATUS.DRAFT,
      scheduled_at: data.scheduled_at || null,
      published_at: data.published_at || null,
      updated_at: now,
      canonical_url: data.canonical_url || `https://tikum.app/blog/${slug}`,
      source_references: Array.isArray(data.source_references) ? data.source_references : [],
      target_event_id: data.target_event_id || null,
      target_venue_id: data.target_venue_id || null,
      target_city: data.target_city || null,
      seo_score: typeof data.seo_score === 'number' ? data.seo_score : 0,
      quality_score: typeof data.quality_score === 'number' ? data.quality_score : 0,
      trust_score: typeof data.trust_score === 'number' ? data.trust_score : 0,
      readability_score: typeof data.readability_score === 'number' ? data.readability_score : 0,
      internal_links: Array.isArray(data.internal_links) ? data.internal_links : [],
      human_approved_by: data.human_approved_by || null,
      human_approved_at: data.human_approved_at || null,
      publish_error: data.publish_error || null,
      created_at: data.created_at || now
    };
  }
}

module.exports = {
  CONTENT_PILLARS,
  CONTENT_STATUS,
  SEARCH_INTENTS,
  ContentModel
};

