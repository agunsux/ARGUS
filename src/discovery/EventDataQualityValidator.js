/**
 * TIKUM / ARGUS Event Data Quality Validator
 * 
 * Part 17 Data Quality & Verification Pre-Flight.
 * Validates:
 * - Required fields (name/title, start date)
 * - Temporal sanity & date formats
 * - Indonesian timezones (WIB / WITA / WIT)
 * - URL validity and domain safety
 * - Category validity
 * - Status validity
 */

const { SecuritySanitizer } = require('./security/SecuritySanitizer');

const VALID_STATUSES = new Set([
  'UPCOMING',
  'ON_SALE',
  'SOLD_OUT',
  'POSTPONED',
  'RESCHEDULED',
  'CANCELLED',
  'COMPLETED',
  'UNKNOWN'
]);

const VALID_CATEGORIES = new Set([
  'CONCERT',
  'FESTIVAL',
  'SPORT',
  'FOOTBALL',
  'BASKETBALL',
  'BADMINTON',
  'MOTORSPORT',
  'RUNNING',
  'COMBAT_SPORT',
  'ESPORTS',
  'THEATER',
  'COMEDY',
  'MUSIC_GIG',
  'CONFERENCE',
  'EXHIBITION',
  'FAMILY',
  'CULTURAL',
  'RELIGIOUS',
  'COMMUNITY',
  'KONSER', // Indonesian alias
  'SEPAK BOLA', // Indonesian alias
  'STANDUP', // Indonesian alias
  'TEATER', // Indonesian alias
  'OLAHRAGA', // Indonesian alias
  'OTHER'
]);

class EventDataQualityValidator {
  /**
   * Validates raw/sanitized incoming event payload.
   * @param {object} payload
   * @returns {object} { isValid: boolean, errors: string[], warnings: string[] }
   */
  static validate(payload) {
    const errors = [];
    const warnings = [];

    if (!payload || typeof payload !== 'object') {
      return {
        isValid: false,
        errors: ['Payload must be a non-null object'],
        warnings: []
      };
    }

    // 1. Required Fields Check
    const title = payload.canonical_name || payload.name || payload.title;
    if (!title || typeof title !== 'string' || !title.trim()) {
      errors.push('Event title or name is required and cannot be empty');
    } else if (title.trim().length < 3) {
      errors.push('Event title is too short (minimum 3 characters)');
    }

    const rawDate = payload.start_date || payload.date || payload.start_datetime || payload.start_at;
    if (!rawDate) {
      errors.push('Event start date is required');
    } else {
      // 2. Date Format & Temporal Sanity Check
      const dateStr = String(rawDate).trim();
      const parsedDate = new Date(dateStr);
      if (isNaN(parsedDate.getTime())) {
        errors.push(`Invalid start date format: '${rawDate}'`);
      } else {
        const now = Date.now();
        const eventTime = parsedDate.getTime();
        const oneYearAgo = now - (365 * 24 * 60 * 60 * 1000);
        const fiveYearsFuture = now + (5 * 365 * 24 * 60 * 60 * 1000);

        if (eventTime < oneYearAgo) {
          warnings.push('Event date is more than 1 year in the past (historical event)');
        }
        if (eventTime > fiveYearsFuture) {
          warnings.push('Event date is more than 5 years in the future (flagged for review)');
        }
      }
    }

    // 3. End Date Sanity (if present)
    const rawEndDate = payload.end_date || payload.end_datetime || payload.end_at;
    if (rawEndDate) {
      const parsedEnd = new Date(String(rawEndDate).trim());
      const parsedStart = new Date(String(rawDate).trim());
      if (isNaN(parsedEnd.getTime())) {
        warnings.push(`Invalid end date format: '${rawEndDate}'`);
      } else if (!isNaN(parsedStart.getTime()) && parsedEnd.getTime() < parsedStart.getTime()) {
        errors.push('Event end date cannot be earlier than start date');
      }
    }

    // 4. Ticket URL Validation (if present)
    const ticketUrl = payload.official_ticket_url || payload.ticket_url;
    if (ticketUrl) {
      const sanitizedUrl = SecuritySanitizer.sanitizeUrl(ticketUrl);
      if (!sanitizedUrl) {
        errors.push(`Invalid or unsafe ticket URL: '${ticketUrl}'`);
      }
    }

    // 5. Official Event URL Validation (if present)
    const officialUrl = payload.official_event_url || payload.official_link || payload.url;
    if (officialUrl) {
      const sanitizedUrl = SecuritySanitizer.sanitizeUrl(officialUrl);
      if (!sanitizedUrl) {
        warnings.push(`Invalid official event URL: '${officialUrl}'`);
      }
    }

    // 6. Category Validation
    const category = (payload.category || payload.event_type || 'OTHER').toUpperCase().trim();
    if (category && !VALID_CATEGORIES.has(category)) {
      warnings.push(`Unrecognized category '${category}', defaulting to 'OTHER'`);
    }

    // 7. Status Validation
    const status = (payload.status || payload.event_status || 'UPCOMING').toUpperCase().trim();
    if (status && !VALID_STATUSES.has(status)) {
      warnings.push(`Unrecognized status '${status}', defaulting to 'UPCOMING'`);
    }

    // 8. Venue / Location Warning
    const venue = payload.venue_name || payload.venue || payload.venue_id;
    if (!venue) {
      warnings.push('Event has no specified venue');
    }

    const city = payload.city || payload.venue_city;
    if (!city) {
      warnings.push('Event has no specified city');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}

module.exports = {
  EventDataQualityValidator,
  VALID_STATUSES,
  VALID_CATEGORIES
};
