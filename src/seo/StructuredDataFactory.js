/**
 * TIKUM Structured Data Factory
 * Generates verified, standard-compliant Schema.org JSON-LD structured data.
 *
 * Strict Principles:
 * - Visible page grounding: JSON-LD must reflect actual content.
 * - Zero hallucinated entities, prices, or dates.
 * - Distinguishes primary official tickets from Tikum verified resale inventory.
 */

const { businessProfile } = require('../config/businessProfile');

class StructuredDataFactory {
  /**
   * Organization Schema (TIKUM consumer brand by SHINERVA)
   */
  static createOrganizationSchema() {
    return {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      'name': businessProfile.brandName || 'Tikum',
      'alternateName': 'Tikum Verified Ticket Marketplace',
      'url': businessProfile.canonicalDomain || 'https://tikum.app',
      'logo': `${businessProfile.canonicalDomain || 'https://tikum.app'}/icons/icon-512x512.png`,
      'description': 'Marketplace tiket sekunder terverifikasi di Indonesia dengan perlindungan escrow dan verifikasi fisik di gerbang venue.',
      'parentOrganization': {
        '@type': 'Organization',
        'name': businessProfile.parentEntity || 'SHINERVA HQ',
        'url': businessProfile.canonicalDomain || 'https://tikum.app'
      },
      'contactPoint': {
        '@type': 'ContactPoint',
        'contactType': 'customer support',
        'email': businessProfile.supportEmail || 'support@tikum.app',
        'telephone': businessProfile.phone || '+6281299927378',
        'areaServed': 'ID',
        'availableLanguage': ['Indonesian', 'English']
      },
      'address': {
        '@type': 'PostalAddress',
        'streetAddress': businessProfile.address?.street || 'Jl. Pasirluyu No. 79',
        'addressLocality': businessProfile.address?.city || 'Bandung',
        'postalCode': businessProfile.address?.postalCode || '40254',
        'addressCountry': 'ID'
      }
    };
  }

  /**
   * WebSite Schema with Sitelinks SearchBox
   */
  static createWebSiteSchema() {
    const origin = businessProfile.canonicalDomain || 'https://tikum.app';
    return {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      'name': 'Tikum',
      'alternateName': 'Tikum Verified Tickets',
      'url': origin,
      'potentialAction': {
        '@type': 'SearchAction',
        'target': {
          '@type': 'EntryPoint',
          'urlTemplate': `${origin}/events?q={search_term_string}`
        },
        'query-input': 'required name=search_term_string'
      }
    };
  }

  /**
   * BreadcrumbList Schema
   * @param {Array<{ name: string, url: string }>} items
   */
  static createBreadcrumbSchema(items = []) {
    const origin = businessProfile.canonicalDomain || 'https://tikum.app';
    return {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      'itemListElement': items.map((item, index) => ({
        '@type': 'ListItem',
        'position': index + 1,
        'name': item.name,
        'item': item.url.startsWith('http') ? item.url : `${origin}${item.url}`
      }))
    };
  }

  /**
   * Event Schema (MusicEvent, SportsEvent, TheaterEvent, Event)
   */
  static createEventSchema(event, activeListings = []) {
    let schemaType = 'Event';
    const evType = (event.event_type || event.category || '').toUpperCase();

    if (evType.includes('SPORT') || evType.includes('FOOTBALL') || evType.includes('BASKETBALL') || evType.includes('BADMINTON') || evType.includes('RUNNING')) {
      schemaType = 'SportsEvent';
    } else if (evType.includes('CONCERT') || evType.includes('MUSIC') || evType.includes('FESTIVAL')) {
      schemaType = 'MusicEvent';
    } else if (evType.includes('THEATER') || evType.includes('COMEDY')) {
      schemaType = 'TheaterEvent';
    }

    let schemaStatus = 'https://schema.org/EventScheduled';
    if (event.status === 'CANCELLED') {
      schemaStatus = 'https://schema.org/EventCancelled';
    } else if (event.status === 'POSTPONED') {
      schemaStatus = 'https://schema.org/EventPostponed';
    }

    const startDateIso = event.start_datetime || (event.start_date || event.date ? `${event.start_date || event.date}T19:00:00+07:00` : new Date().toISOString());
    const endDateIso = event.end_datetime || (event.end_date ? `${event.end_date}T23:00:00+07:00` : null);

    const schema = {
      '@context': 'https://schema.org',
      '@type': schemaType,
      'name': event.canonical_name || event.name || event.title,
      'description': event.description || `${event.canonical_name || event.name} diselenggarakan di ${event.venue_name || 'Venue'}, ${event.city || 'Jakarta'}. Dapatkan informasi resmi dan tiket terverifikasi di Tikum.`,
      'startDate': startDateIso,
      'eventStatus': schemaStatus,
      'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
      'location': {
        '@type': 'Place',
        'name': event.venue_name || 'Venue TBA',
        'address': {
          '@type': 'PostalAddress',
          'addressLocality': event.city || event.venue_city || 'Jakarta',
          'addressRegion': event.province || 'DKI Jakarta',
          'addressCountry': 'ID'
        }
      },
      'organizer': {
        '@type': 'Organization',
        'name': event.organizer_name || 'Promoter',
        'url': event.official_event_url || undefined
      }
    };

    if (endDateIso) {
      schema.endDate = endDateIso;
    }

    if (event.event_image || event.poster_url) {
      schema.image = [event.event_image || event.poster_url];
    }

    // Offers
    const offers = [];
    if (event.official_ticket_url) {
      offers.push({
        '@type': 'Offer',
        'name': `Tiket Resmi (${event.official_ticketing_provider || 'Primary Official Provider'})`,
        'url': event.official_ticket_url,
        'availability': event.status === 'SOLD_OUT' ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
        'priceCurrency': 'IDR',
        'validFrom': event.created_at || '2026-01-01'
      });
    }

    if (Array.isArray(activeListings) && activeListings.length > 0) {
      const minPrice = Math.min(...activeListings.map(l => l.price));
      offers.push({
        '@type': 'AggregateOffer',
        'name': 'Tikum Verified Resale Inventory',
        'url': `https://tikum.app/events/${event.slug}`,
        'priceCurrency': 'IDR',
        'lowPrice': minPrice,
        'offerCount': activeListings.length,
        'availability': 'https://schema.org/InStock'
      });
    }

    if (offers.length > 0) {
      schema.offers = offers;
    }

    return schema;
  }

  /**
   * Place Schema for Venues
   */
  static createPlaceSchema(venue, events = []) {
    return {
      '@context': 'https://schema.org',
      '@type': 'Place',
      'name': venue.canonical_name || venue.name,
      'description': `${venue.canonical_name || venue.name} berlokasi di ${venue.city}, ${venue.province || 'Indonesia'}. Tempat penyelenggaraan konser, festival, dan acara terverifikasi.`,
      'address': {
        '@type': 'PostalAddress',
        'addressLocality': venue.city,
        'addressRegion': venue.province || 'Indonesia',
        'addressCountry': 'ID'
      },
      'url': `https://tikum.app/venues/${venue.slug || venue.id}`
    };
  }

  /**
   * Article / BlogPosting Schema
   */
  static createArticleSchema(article) {
    const origin = businessProfile.canonicalDomain || 'https://tikum.app';
    const canonicalUrl = article.canonical_url || `${origin}/blog/${article.slug}`;

    return {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      'mainEntityOfPage': {
        '@type': 'WebPage',
        '@id': canonicalUrl
      },
      'headline': article.title,
      'description': article.description,
      'image': article.image ? [article.image] : [`${origin}/images/og-default.jpg`],
      'datePublished': article.published_at || article.created_at || new Date().toISOString(),
      'dateModified': article.updated_at || article.published_at || new Date().toISOString(),
      'author': {
        '@type': 'Organization',
        'name': article.author || 'Tim Editorial Tikum',
        'url': origin
      },
      'publisher': {
        '@type': 'Organization',
        'name': 'Tikum',
        'logo': {
          '@type': 'ImageObject',
          'url': `${origin}/icons/icon-512x512.png`
        }
      },
      'articleSection': article.category || 'Panduan Tiket',
      'keywords': Array.isArray(article.keywords) ? article.keywords.join(', ') : article.keywords
    };
  }

  /**
   * FAQPage Schema
   * @param {Array<{ q: string, a: string }>} qaPairs
   */
  static createFAQSchema(qaPairs = []) {
    return {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      'mainEntity': qaPairs.map(pair => ({
        '@type': 'Question',
        'name': pair.q || pair.question,
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': pair.a || pair.answer
        }
      }))
    };
  }
}

module.exports = {
  StructuredDataFactory
};

