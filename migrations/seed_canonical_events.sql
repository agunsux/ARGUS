BEGIN;

      INSERT INTO canonical_events (
        id, slug, canonical_name, event_type, category,
        start_date, start_datetime, end_date, end_datetime, timezone,
        venue_name, venue_city, city, province, country,
        organizer_name, official_event_url, official_ticket_url, official_ticketing_provider,
        min_price, max_price, is_verified, verification_status,
        lifecycle_status, archive_status, public_visibility, homepage_visibility,
        metadata, created_at, updated_at
      ) VALUES (
        'evt_pestapora-2026_kbgT', 'pestapora-2026_kbgT', 'Pestapora 2026', 'CONCERT', 'FESTIVAL',
        '2026-09-25', '2026-09-25T15:00:00+07:00', '2026-09-27', '2026-09-27T23:59:00+07:00', 'Asia/Jakarta',
        'Gambir Expo & Hall D2 Jiexpo', 'Jakarta', 'Jakarta', 'Pademangan', 'Indonesia',
        'Boss Creator', 'https://www.loket.com/event/pestapora-2026_kbgT', 'https://www.loket.com/event/pestapora-2026_kbgT', 'loket',
        225000, 650000, TRUE, 'VERIFIED',
        'COMPLETED', 'ARCHIVED', TRUE, FALSE,
        '{"artists":["Pestapora 2026"],"image_url":"https://www.pestapora.com/thumbnail-pestapora.jpg","image_credit":"Pestapora / Boss Creator","verification_score":94,"sources":[],"seeded_at":"2026-10-25T21:44:24.387Z"}'::jsonb, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        canonical_name = EXCLUDED.canonical_name,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        is_verified = EXCLUDED.is_verified,
        verification_status = EXCLUDED.verification_status,
        lifecycle_status = EXCLUDED.lifecycle_status,
        archive_status = EXCLUDED.archive_status,
        public_visibility = EXCLUDED.public_visibility,
        homepage_visibility = EXCLUDED.homepage_visibility,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
    

      INSERT INTO canonical_events (
        id, slug, canonical_name, event_type, category,
        start_date, start_datetime, end_date, end_datetime, timezone,
        venue_name, venue_city, city, province, country,
        organizer_name, official_event_url, official_ticket_url, official_ticketing_provider,
        min_price, max_price, is_verified, verification_status,
        lifecycle_status, archive_status, public_visibility, homepage_visibility,
        metadata, created_at, updated_at
      ) VALUES (
        'evt_dwp-2026_wVb9', 'dwp-2026_wVb9', 'DWP 2026', 'CONCERT', 'FESTIVAL',
        '2026-12-11', '2026-12-11T19:00:00+07:00', '2026-12-13', '2026-12-13T23:59:00+07:00', 'Asia/Jakarta',
        'JIExpo Kemayoran', 'Jakarta', 'Jakarta', 'Kemayoran', 'Indonesia',
        'Ismaya Live', 'https://www.loket.com/event/dwp-2026_wVb9', 'https://www.loket.com/event/dwp-2026_wVb9', 'loket',
        850000, 21800000, TRUE, 'VERIFIED',
        'UPCOMING', 'ACTIVE', TRUE, TRUE,
        '{"artists":["DWP 2026"],"image_url":"https://dwpfest.com/icons/richlink.jpg","image_credit":"DWP 2026 Official","verification_score":94,"sources":[],"seeded_at":"2026-10-25T21:44:24.402Z"}'::jsonb, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        canonical_name = EXCLUDED.canonical_name,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        is_verified = EXCLUDED.is_verified,
        verification_status = EXCLUDED.verification_status,
        lifecycle_status = EXCLUDED.lifecycle_status,
        archive_status = EXCLUDED.archive_status,
        public_visibility = EXCLUDED.public_visibility,
        homepage_visibility = EXCLUDED.homepage_visibility,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
    

      INSERT INTO canonical_events (
        id, slug, canonical_name, event_type, category,
        start_date, start_datetime, end_date, end_datetime, timezone,
        venue_name, venue_city, city, province, country,
        organizer_name, official_event_url, official_ticket_url, official_ticketing_provider,
        min_price, max_price, is_verified, verification_status,
        lifecycle_status, archive_status, public_visibility, homepage_visibility,
        metadata, created_at, updated_at
      ) VALUES (
        'evt_edp1666528', 'evt_edp1666528', 'LANY: soft world tour – Night 1 (2026-10-29)', 'CONCERT', 'CONCERT',
        '2026-10-29', '2026-10-29T19:00:00+07:00', '2026-10-29', '2026-10-29T23:00:00+07:00', 'Asia/Jakarta',
        'Indonesia Arena - Senayan', 'Jakarta', 'Jakarta', NULL, 'Indonesia',
        NULL, 'https://www.livenation.asia/event/lany-soft-world-tour-jakarta-ticket-edp1666528', 'https://www.livenation.asia/event/lany-soft-world-tour-jakarta-ticket-edp1666528', 'livenation',
        NULL, NULL, TRUE, 'VERIFIED',
        'UPCOMING', 'ACTIVE', TRUE, TRUE,
        '{"artists":["LANY"],"image_url":"https://cdn.ruangevent.id/temgmt/lany/lany-main-banner-add.jpg","image_credit":"Authorized Ticketing Partner (LOKET / Live Nation / TEM)","verification_score":95,"sources":[],"seeded_at":"2026-10-25T21:44:24.402Z"}'::jsonb, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        canonical_name = EXCLUDED.canonical_name,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        is_verified = EXCLUDED.is_verified,
        verification_status = EXCLUDED.verification_status,
        lifecycle_status = EXCLUDED.lifecycle_status,
        archive_status = EXCLUDED.archive_status,
        public_visibility = EXCLUDED.public_visibility,
        homepage_visibility = EXCLUDED.homepage_visibility,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
    

      INSERT INTO canonical_events (
        id, slug, canonical_name, event_type, category,
        start_date, start_datetime, end_date, end_datetime, timezone,
        venue_name, venue_city, city, province, country,
        organizer_name, official_event_url, official_ticket_url, official_ticketing_provider,
        min_price, max_price, is_verified, verification_status,
        lifecycle_status, archive_status, public_visibility, homepage_visibility,
        metadata, created_at, updated_at
      ) VALUES (
        'evt_edp1660313', 'evt_edp1660313', 'LANY: soft world tour – Night 2 (2026-10-30)', 'CONCERT', 'CONCERT',
        '2026-10-30', '2026-10-30T19:00:00+07:00', '2026-10-30', '2026-10-30T23:00:00+07:00', 'Asia/Jakarta',
        'Indonesia Arena - Senayan', 'Jakarta', 'Jakarta', NULL, 'Indonesia',
        NULL, 'https://www.livenation.asia/event/lany-soft-world-tour-jakarta-ticket-edp1660313', 'https://www.livenation.asia/event/lany-soft-world-tour-jakarta-ticket-edp1660313', 'livenation',
        NULL, NULL, TRUE, 'VERIFIED',
        'UPCOMING', 'ACTIVE', TRUE, TRUE,
        '{"artists":["LANY"],"image_url":"https://cdn.ruangevent.id/temgmt/lany/lany-main-banner-add.jpg","image_credit":"Authorized Ticketing Partner (LOKET / Live Nation / TEM)","verification_score":95,"sources":[],"seeded_at":"2026-10-25T21:44:24.402Z"}'::jsonb, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        canonical_name = EXCLUDED.canonical_name,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        is_verified = EXCLUDED.is_verified,
        verification_status = EXCLUDED.verification_status,
        lifecycle_status = EXCLUDED.lifecycle_status,
        archive_status = EXCLUDED.archive_status,
        public_visibility = EXCLUDED.public_visibility,
        homepage_visibility = EXCLUDED.homepage_visibility,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
    

      INSERT INTO canonical_events (
        id, slug, canonical_name, event_type, category,
        start_date, start_datetime, end_date, end_datetime, timezone,
        venue_name, venue_city, city, province, country,
        organizer_name, official_event_url, official_ticket_url, official_ticketing_provider,
        min_price, max_price, is_verified, verification_status,
        lifecycle_status, archive_status, public_visibility, homepage_visibility,
        metadata, created_at, updated_at
      ) VALUES (
        'evt_edp1672880', 'evt_edp1672880', 'The Weeknd: After Hours Til Dawn Tour', 'CONCERT', 'CONCERT',
        '2026-09-26', '2026-09-26T19:00:00+07:00', '2026-09-26', '2026-09-26T23:00:00+07:00', 'Asia/Jakarta',
        'Jakarta International Stadium', 'Jakarta', 'Jakarta', NULL, 'Indonesia',
        NULL, 'https://www.livenation.asia/event/the-weeknd-after-hours-til-dawn-tour-jakarta-ticket-edp1672880', 'https://www.livenation.asia/event/the-weeknd-after-hours-til-dawn-tour-jakarta-ticket-edp1672880', 'livenation',
        NULL, NULL, TRUE, 'VERIFIED',
        'COMPLETED', 'ARCHIVED', TRUE, FALSE,
        '{"artists":["The Weeknd"],"image_url":"https://cdn.ruangevent.id/temgmt/theweeknd/theweeknd-cover.jpeg","image_credit":"The Weeknd in Jakarta (TEM Presents)","verification_score":96,"sources":[],"seeded_at":"2026-10-25T21:44:24.403Z"}'::jsonb, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        canonical_name = EXCLUDED.canonical_name,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        is_verified = EXCLUDED.is_verified,
        verification_status = EXCLUDED.verification_status,
        lifecycle_status = EXCLUDED.lifecycle_status,
        archive_status = EXCLUDED.archive_status,
        public_visibility = EXCLUDED.public_visibility,
        homepage_visibility = EXCLUDED.homepage_visibility,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
    

      INSERT INTO canonical_events (
        id, slug, canonical_name, event_type, category,
        start_date, start_datetime, end_date, end_datetime, timezone,
        venue_name, venue_city, city, province, country,
        organizer_name, official_event_url, official_ticket_url, official_ticketing_provider,
        min_price, max_price, is_verified, verification_status,
        lifecycle_status, archive_status, public_visibility, homepage_visibility,
        metadata, created_at, updated_at
      ) VALUES (
        'evt_edp1690841', 'evt_edp1690841', 'Maroon 5 Asia 2027 in Jakarta', 'CONCERT', 'CONCERT',
        '2027-02-05', '2027-02-05T19:00:00+07:00', '2027-02-05', '2027-02-05T23:00:00+07:00', 'Asia/Jakarta',
        'Jakarta International Stadium', 'Jakarta', 'Jakarta', NULL, 'Indonesia',
        NULL, 'https://www.livenation.asia/event/maroon-5-asia-2027-in-jakarta-jakarta-ticket-edp1690841', 'https://www.livenation.asia/event/maroon-5-asia-2027-in-jakarta-jakarta-ticket-edp1690841', 'livenation',
        NULL, NULL, TRUE, 'VERIFIED',
        'UPCOMING', 'ACTIVE', TRUE, TRUE,
        '{"artists":["Maroon 5 Asia 2027 in Jakarta"],"image_url":"https://cdn.ruangevent.id/temgmt/maroon5/main-cover-maroon5.webp","image_credit":"Authorized Ticketing Partner (LOKET / Live Nation / TEM)","verification_score":95,"sources":[],"seeded_at":"2026-10-25T21:44:24.403Z"}'::jsonb, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        canonical_name = EXCLUDED.canonical_name,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        is_verified = EXCLUDED.is_verified,
        verification_status = EXCLUDED.verification_status,
        lifecycle_status = EXCLUDED.lifecycle_status,
        archive_status = EXCLUDED.archive_status,
        public_visibility = EXCLUDED.public_visibility,
        homepage_visibility = EXCLUDED.homepage_visibility,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
    

      INSERT INTO canonical_events (
        id, slug, canonical_name, event_type, category,
        start_date, start_datetime, end_date, end_datetime, timezone,
        venue_name, venue_city, city, province, country,
        organizer_name, official_event_url, official_ticket_url, official_ticketing_provider,
        min_price, max_price, is_verified, verification_status,
        lifecycle_status, archive_status, public_visibility, homepage_visibility,
        metadata, created_at, updated_at
      ) VALUES (
        'evt_weverse-nct127-37278', 'evt_weverse-nct127-37278', 'NCT 127 — NEO CITY: THE REDLINE Jakarta', 'CONCERT', 'CONCERT',
        '2026-10-03', '2026-10-03T19:00:00+07:00', '2026-10-03', '2026-10-03T22:30:00+07:00', 'Asia/Jakarta',
        'Indonesia Arena - Senayan', 'Jakarta', 'Jakarta', 'DKI Jakarta', 'Indonesia',
        'Dyandra Global Edutainment', 'https://weverse.io/nct127/notice/37278', 'https://dyandraglobalstore.com/', 'weverse',
        1500000, 4500000, TRUE, 'VERIFIED',
        'COMPLETED', 'ARCHIVED', TRUE, FALSE,
        '{"artists":["NCT 127"],"image_url":"https://cdn.ruangevent.id/dyandra/nct127/nct127-the-redline-jakarta.jpg","image_credit":"SM Entertainment / Weverse / Dyandra Global","verification_score":96,"sources":[],"seeded_at":"2026-10-25T21:44:24.403Z"}'::jsonb, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        canonical_name = EXCLUDED.canonical_name,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        is_verified = EXCLUDED.is_verified,
        verification_status = EXCLUDED.verification_status,
        lifecycle_status = EXCLUDED.lifecycle_status,
        archive_status = EXCLUDED.archive_status,
        public_visibility = EXCLUDED.public_visibility,
        homepage_visibility = EXCLUDED.homepage_visibility,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
    

      INSERT INTO canonical_events (
        id, slug, canonical_name, event_type, category,
        start_date, start_datetime, end_date, end_datetime, timezone,
        venue_name, venue_city, city, province, country,
        organizer_name, official_event_url, official_ticket_url, official_ticketing_provider,
        min_price, max_price, is_verified, verification_status,
        lifecycle_status, archive_status, public_visibility, homepage_visibility,
        metadata, created_at, updated_at
      ) VALUES (
        'evt_weverse-babymonster-35647', 'evt_weverse-babymonster-35647', 'BABYMONSTER — 2026-27 WORLD TOUR [춤 (CHOOM)] Jakarta', 'CONCERT', 'CONCERT',
        '2026-10-17', '2026-10-17T19:00:00+07:00', '2026-10-17', '2026-10-17T22:00:00+07:00', 'Asia/Jakarta',
        'Indonesia Arena - Senayan', 'Jakarta', 'Jakarta', 'DKI Jakarta', 'Indonesia',
        'PK Entertainment & TEM Presents', 'https://weverse.io/babymonster/notice/35647', 'https://www.tiket.com/to-do/babymonster-jakarta-2026', 'weverse',
        1350000, 3850000, TRUE, 'VERIFIED',
        'COMPLETED', 'ARCHIVED', TRUE, FALSE,
        '{"artists":["BABYMONSTER"],"image_url":"https://cdn.ruangevent.id/temgmt/babymonster/babymonster-choom-jakarta-banner.jpg","image_credit":"YG Entertainment / Weverse / PK Entertainment","verification_score":95,"sources":[],"seeded_at":"2026-10-25T21:44:24.403Z"}'::jsonb, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        canonical_name = EXCLUDED.canonical_name,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        is_verified = EXCLUDED.is_verified,
        verification_status = EXCLUDED.verification_status,
        lifecycle_status = EXCLUDED.lifecycle_status,
        archive_status = EXCLUDED.archive_status,
        public_visibility = EXCLUDED.public_visibility,
        homepage_visibility = EXCLUDED.homepage_visibility,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
    

      INSERT INTO canonical_events (
        id, slug, canonical_name, event_type, category,
        start_date, start_datetime, end_date, end_datetime, timezone,
        venue_name, venue_city, city, province, country,
        organizer_name, official_event_url, official_ticket_url, official_ticketing_provider,
        min_price, max_price, is_verified, verification_status,
        lifecycle_status, archive_status, public_visibility, homepage_visibility,
        metadata, created_at, updated_at
      ) VALUES (
        'evt_synchronize-2026', 'evt_synchronize-2026', 'Synchronize Festival 2026', 'CONCERT', 'FESTIVAL',
        '2026-10-16', '2026-10-16T14:00:00+07:00', '2026-10-18', '2026-10-18T23:59:00+07:00', 'Asia/Jakarta',
        'Gambir Expo & Hall D2 Jiexpo', 'Jakarta', 'Jakarta', 'DKI Jakarta', 'Indonesia',
        'Demajors & Pus Kes Mas', 'https://www.synchronizefestival.com/tickets', 'https://www.synchronizefestival.com/tickets', 'loket',
        350000, 900000, TRUE, 'VERIFIED',
        'COMPLETED', 'ARCHIVED', TRUE, FALSE,
        '{"artists":["Synchronize Festival 2026 Lineup"],"image_url":"https://synchronizefestival.com/assets/images/main.png","image_credit":"Synchronize Festival / Demajors","verification_score":92,"sources":[],"seeded_at":"2026-10-25T21:44:24.403Z"}'::jsonb, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        canonical_name = EXCLUDED.canonical_name,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        is_verified = EXCLUDED.is_verified,
        verification_status = EXCLUDED.verification_status,
        lifecycle_status = EXCLUDED.lifecycle_status,
        archive_status = EXCLUDED.archive_status,
        public_visibility = EXCLUDED.public_visibility,
        homepage_visibility = EXCLUDED.homepage_visibility,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
    

      INSERT INTO canonical_events (
        id, slug, canonical_name, event_type, category,
        start_date, start_datetime, end_date, end_datetime, timezone,
        venue_name, venue_city, city, province, country,
        organizer_name, official_event_url, official_ticket_url, official_ticketing_provider,
        min_price, max_price, is_verified, verification_status,
        lifecycle_status, archive_status, public_visibility, homepage_visibility,
        metadata, created_at, updated_at
      ) VALUES (
        'evt_bigbang-jakarta-2027', 'evt_bigbang-jakarta-2027', 'BIGBANG 2026–27 WORLD TOUR in Jakarta', 'CONCERT', 'CONCERT',
        '2027-01-16', '2027-01-16T19:00:00+07:00', '2027-01-17', '2027-01-17T22:30:00+07:00', 'Asia/Jakarta',
        'Jakarta International Stadium', 'Jakarta', 'Jakarta', 'DKI Jakarta', 'Indonesia',
        'YG Entertainment & Official Promoter', 'https://bigbanginjakarta.com/', 'https://bigbanginjakarta.com/', 'yg-entertainment',
        1800000, 6500000, TRUE, 'VERIFIED',
        'UPCOMING', 'ACTIVE', TRUE, TRUE,
        '{"artists":["BIGBANG"],"image_url":"https://cdn.ruangevent.id/yg/bigbang/bigbang-world-tour-jakarta-banner.jpg","image_credit":"BIGBANG 2026-27 in Jakarta (YG Entertainment)","verification_score":96,"sources":[],"seeded_at":"2026-10-25T21:44:24.403Z"}'::jsonb, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        canonical_name = EXCLUDED.canonical_name,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        is_verified = EXCLUDED.is_verified,
        verification_status = EXCLUDED.verification_status,
        lifecycle_status = EXCLUDED.lifecycle_status,
        archive_status = EXCLUDED.archive_status,
        public_visibility = EXCLUDED.public_visibility,
        homepage_visibility = EXCLUDED.homepage_visibility,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
    

      INSERT INTO canonical_events (
        id, slug, canonical_name, event_type, category,
        start_date, start_datetime, end_date, end_datetime, timezone,
        venue_name, venue_city, city, province, country,
        organizer_name, official_event_url, official_ticket_url, official_ticketing_provider,
        min_price, max_price, is_verified, verification_status,
        lifecycle_status, archive_status, public_visibility, homepage_visibility,
        metadata, created_at, updated_at
      ) VALUES (
        'evt_songkick-thescript-jakarta-2026', 'evt_songkick-thescript-jakarta-2026', 'The Script — Satellites World Tour Jakarta 2026', 'CONCERT', 'CONCERT',
        '2026-10-10', '2026-10-10T20:00:00+07:00', '2026-10-10', '2026-10-10T23:00:00+07:00', 'Asia/Jakarta',
        'Indonesia Arena - Senayan', 'Jakarta', 'Jakarta', 'DKI Jakarta', 'Indonesia',
        'Color Asia Live & PK Entertainment', 'https://www.thescriptindonesia2026.com/', 'https://www.thescriptindonesia2026.com/', 'songkick-jakarta',
        1150000, 3250000, TRUE, 'VERIFIED',
        'COMPLETED', 'ARCHIVED', TRUE, FALSE,
        '{"artists":["The Script"],"image_url":"https://cdn.ruangevent.id/colorasia/thescript/thescript-satellites-jakarta-banner.jpg","image_credit":"The Script Satellites Tour (Color Asia Live & PK Entertainment)","verification_score":96,"sources":[],"seeded_at":"2026-10-25T21:44:24.403Z"}'::jsonb, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        canonical_name = EXCLUDED.canonical_name,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        is_verified = EXCLUDED.is_verified,
        verification_status = EXCLUDED.verification_status,
        lifecycle_status = EXCLUDED.lifecycle_status,
        archive_status = EXCLUDED.archive_status,
        public_visibility = EXCLUDED.public_visibility,
        homepage_visibility = EXCLUDED.homepage_visibility,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
    

      INSERT INTO canonical_events (
        id, slug, canonical_name, event_type, category,
        start_date, start_datetime, end_date, end_datetime, timezone,
        venue_name, venue_city, city, province, country,
        organizer_name, official_event_url, official_ticket_url, official_ticketing_provider,
        min_price, max_price, is_verified, verification_status,
        lifecycle_status, archive_status, public_visibility, homepage_visibility,
        metadata, created_at, updated_at
      ) VALUES (
        'evt_bandsintown-menitrust-jakarta-2026', 'evt_bandsintown-menitrust-jakarta-2026', 'Men I Trust — Live in Jakarta 2026', 'CONCERT', 'CONCERT',
        '2026-10-20', '2026-10-20T19:30:00+07:00', '2026-10-20', '2026-10-20T22:30:00+07:00', 'Asia/Jakarta',
        'Tennis Indoor Senayan', 'Jakarta', 'Jakarta', 'DKI Jakarta', 'Indonesia',
        'Plainsong Live', 'https://plainsonglive.com/', 'https://www.loket.com/event/men-i-trust-jakarta-2026', 'bandsintown-jakarta',
        650000, 1250000, TRUE, 'VERIFIED',
        'COMPLETED', 'ARCHIVED', TRUE, FALSE,
        '{"artists":["Men I Trust"],"image_url":"https://assets.loket.com/neo/production/images/banner/20260517111454_6a0940bed96d2.jpeg","image_credit":"Plainsong Live via LOKET","verification_score":95,"sources":[],"seeded_at":"2026-10-25T21:44:24.403Z"}'::jsonb, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        canonical_name = EXCLUDED.canonical_name,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        is_verified = EXCLUDED.is_verified,
        verification_status = EXCLUDED.verification_status,
        lifecycle_status = EXCLUDED.lifecycle_status,
        archive_status = EXCLUDED.archive_status,
        public_visibility = EXCLUDED.public_visibility,
        homepage_visibility = EXCLUDED.homepage_visibility,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
    

      INSERT INTO canonical_events (
        id, slug, canonical_name, event_type, category,
        start_date, start_datetime, end_date, end_datetime, timezone,
        venue_name, venue_city, city, province, country,
        organizer_name, official_event_url, official_ticket_url, official_ticketing_provider,
        min_price, max_price, is_verified, verification_status,
        lifecycle_status, archive_status, public_visibility, homepage_visibility,
        metadata, created_at, updated_at
      ) VALUES (
        'evt_songkick-toucheamore-jakarta-2026', 'evt_songkick-toucheamore-jakarta-2026', 'Touché Amoré — Asia Tour Jakarta 2026', 'CONCERT', 'CONCERT',
        '2026-11-06', '2026-11-06T19:00:00+07:00', '2026-11-06', '2026-11-06T22:00:00+07:00', 'Asia/Jakarta',
        'Basket Hall Senayan', 'Jakarta', 'Jakarta', 'DKI Jakarta', 'Indonesia',
        'Color Asia Live', 'https://colorasialive.com/', 'https://www.loket.com/event/touche-amore-jakarta-2026', 'songkick-jakarta',
        550000, 950000, TRUE, 'VERIFIED',
        'UPCOMING', 'ACTIVE', TRUE, TRUE,
        '{"artists":["Touché Amoré"],"image_url":null,"image_credit":"Touché Amoré Asia Tour Jakarta (Color Asia Live)","verification_score":95,"sources":[],"seeded_at":"2026-10-25T21:44:24.404Z"}'::jsonb, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        canonical_name = EXCLUDED.canonical_name,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        is_verified = EXCLUDED.is_verified,
        verification_status = EXCLUDED.verification_status,
        lifecycle_status = EXCLUDED.lifecycle_status,
        archive_status = EXCLUDED.archive_status,
        public_visibility = EXCLUDED.public_visibility,
        homepage_visibility = EXCLUDED.homepage_visibility,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
    

      INSERT INTO canonical_events (
        id, slug, canonical_name, event_type, category,
        start_date, start_datetime, end_date, end_datetime, timezone,
        venue_name, venue_city, city, province, country,
        organizer_name, official_event_url, official_ticket_url, official_ticketing_provider,
        min_price, max_price, is_verified, verification_status,
        lifecycle_status, archive_status, public_visibility, homepage_visibility,
        metadata, created_at, updated_at
      ) VALUES (
        'evt_bandsintown-maddix-tangerang-2026', 'evt_bandsintown-maddix-tangerang-2026', 'Maddix — Live in Tangerang 2026', 'CONCERT', 'CONCERT',
        '2026-11-14', '2026-11-14T21:00:00+07:00', '2026-11-15', '2026-11-15T03:00:00+07:00', 'Asia/Jakarta',
        'ICE BSD City (Hall 1)', 'Tangerang', 'Tangerang', 'Banten', 'Indonesia',
        'Ismaya Live', 'https://ismaya.com/', 'https://www.loket.com/event/maddix-tangerang-2026', 'bandsintown-jakarta',
        450000, 950000, TRUE, 'VERIFIED',
        'UPCOMING', 'ACTIVE', TRUE, TRUE,
        '{"artists":["Maddix"],"image_url":"https://cdn.ruangevent.id/ismaya/maddix/maddix-live-tangerang-banner.jpg","image_credit":"Maddix Live in Tangerang (Ismaya Live)","verification_score":95,"sources":[],"seeded_at":"2026-10-25T21:44:24.404Z"}'::jsonb, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        canonical_name = EXCLUDED.canonical_name,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        is_verified = EXCLUDED.is_verified,
        verification_status = EXCLUDED.verification_status,
        lifecycle_status = EXCLUDED.lifecycle_status,
        archive_status = EXCLUDED.archive_status,
        public_visibility = EXCLUDED.public_visibility,
        homepage_visibility = EXCLUDED.homepage_visibility,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
    

      INSERT INTO canonical_events (
        id, slug, canonical_name, event_type, category,
        start_date, start_datetime, end_date, end_datetime, timezone,
        venue_name, venue_city, city, province, country,
        organizer_name, official_event_url, official_ticket_url, official_ticketing_provider,
        min_price, max_price, is_verified, verification_status,
        lifecycle_status, archive_status, public_visibility, homepage_visibility,
        metadata, created_at, updated_at
      ) VALUES (
        'evt_yeezy-tour-kanye-west-jakarta-2026', 'evt_yeezy-tour-kanye-west-jakarta-2026', 'Kanye West — Ye Tour 2026 in Jakarta', 'CONCERT', 'CONCERT',
        '2026-10-24', '2026-10-24T20:00:00+07:00', '2026-10-24', '2026-10-24T23:30:00+07:00', 'Asia/Jakarta',
        'Gelora Bung Karno (Main Stadium)', 'Jakarta', 'Jakarta', 'DKI Jakarta', 'Indonesia',
        'Raw Vision Collective & Yeezy', 'https://yejakarta.com/', 'https://yejakarta.com/', 'yeezy-tour',
        1250000, 5500000, TRUE, 'VERIFIED',
        'COMPLETED', 'ARCHIVED', TRUE, FALSE,
        '{"artists":["Kanye West","Ye"],"image_url":"https://assets.loket.com/lp/sdk/prod/assets/banner/banner_1788163846_6a953706d288e.jpg","image_credit":"Authorized Ticketing Partner (LOKET / Live Nation / TEM)","verification_score":96,"sources":[],"seeded_at":"2026-10-25T21:44:24.404Z"}'::jsonb, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        canonical_name = EXCLUDED.canonical_name,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        is_verified = EXCLUDED.is_verified,
        verification_status = EXCLUDED.verification_status,
        lifecycle_status = EXCLUDED.lifecycle_status,
        archive_status = EXCLUDED.archive_status,
        public_visibility = EXCLUDED.public_visibility,
        homepage_visibility = EXCLUDED.homepage_visibility,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
    

      INSERT INTO canonical_events (
        id, slug, canonical_name, event_type, category,
        start_date, start_datetime, end_date, end_datetime, timezone,
        venue_name, venue_city, city, province, country,
        organizer_name, official_event_url, official_ticket_url, official_ticketing_provider,
        min_price, max_price, is_verified, verification_status,
        lifecycle_status, archive_status, public_visibility, homepage_visibility,
        metadata, created_at, updated_at
      ) VALUES (
        'evt_381', 'evt_381', 'Kunjungan Brothe ... jeki)', 'CONCERT', 'OTHER',
        NULL, NULL, NULL, NULL, 'Asia/Jakarta',
        'Venue TBA', 'Jakarta', 'Jakarta', NULL, 'Indonesia',
        NULL, 'https://bbo.co.id/bbo/kunjungan-brothersphere-yogyakarta-tour-bapak-ntrl-x-anak-sukses-lancar-rejeki-evnt381', NULL, 'bbo',
        NULL, NULL, FALSE, 'DISCOVERY',
        'SCHEDULE_PENDING', 'PENDING', FALSE, FALSE,
        '{"artists":[],"image_url":null,"image_credit":"BBO Events","verification_score":null,"sources":[],"seeded_at":"2026-10-25T21:44:24.404Z"}'::jsonb, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        canonical_name = EXCLUDED.canonical_name,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        is_verified = EXCLUDED.is_verified,
        verification_status = EXCLUDED.verification_status,
        lifecycle_status = EXCLUDED.lifecycle_status,
        archive_status = EXCLUDED.archive_status,
        public_visibility = EXCLUDED.public_visibility,
        homepage_visibility = EXCLUDED.homepage_visibility,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
    

      INSERT INTO canonical_events (
        id, slug, canonical_name, event_type, category,
        start_date, start_datetime, end_date, end_datetime, timezone,
        venue_name, venue_city, city, province, country,
        organizer_name, official_event_url, official_ticket_url, official_ticketing_provider,
        min_price, max_price, is_verified, verification_status,
        lifecycle_status, archive_status, public_visibility, homepage_visibility,
        metadata, created_at, updated_at
      ) VALUES (
        'evt_379', 'evt_379', 'Kunjungan Brothe ... anya!', 'CONCERT', 'OTHER',
        NULL, NULL, NULL, NULL, 'Asia/Jakarta',
        'Venue TBA', 'Jakarta', 'Jakarta', NULL, 'Indonesia',
        NULL, 'https://bbo.co.id/bbo/kunjungan-brothersphere-jakarta-tribute-showcase-in-memoriam-dadi-yudistira-kemarin-hari-ini-selamanya-evnt379', NULL, 'bbo',
        NULL, NULL, FALSE, 'DISCOVERY',
        'SCHEDULE_PENDING', 'PENDING', FALSE, FALSE,
        '{"artists":[],"image_url":"https://storage.googleapis.com/bbo-images/bbo.co.id/images/modules/bigbang/event/379/bbo-event-banner-_-kunjungan-brothersphere-jakarta.png","image_credit":"BBO Events","verification_score":null,"sources":[],"seeded_at":"2026-10-25T21:44:24.404Z"}'::jsonb, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        canonical_name = EXCLUDED.canonical_name,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        is_verified = EXCLUDED.is_verified,
        verification_status = EXCLUDED.verification_status,
        lifecycle_status = EXCLUDED.lifecycle_status,
        archive_status = EXCLUDED.archive_status,
        public_visibility = EXCLUDED.public_visibility,
        homepage_visibility = EXCLUDED.homepage_visibility,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
    

      INSERT INTO canonical_events (
        id, slug, canonical_name, event_type, category,
        start_date, start_datetime, end_date, end_datetime, timezone,
        venue_name, venue_city, city, province, country,
        organizer_name, official_event_url, official_ticket_url, official_ticketing_provider,
        min_price, max_price, is_verified, verification_status,
        lifecycle_status, archive_status, public_visibility, homepage_visibility,
        metadata, created_at, updated_at
      ) VALUES (
        'evt_378', 'evt_378', 'ASTON Kemayoran  ...  2026', 'CONCERT', 'OTHER',
        NULL, NULL, NULL, NULL, 'Asia/Jakarta',
        'Venue TBA', 'Jakarta', 'Jakarta', NULL, 'Indonesia',
        NULL, 'https://bbo.co.id/bbo/aston-kemayoran-city-hotel-official-hotel-partner-of-62-coffee-r-i-fest-2026-evnt378', NULL, 'bbo',
        NULL, NULL, FALSE, 'DISCOVERY',
        'SCHEDULE_PENDING', 'PENDING', FALSE, FALSE,
        '{"artists":[],"image_url":"https://storage.googleapis.com/bbo-images/bbo.co.id/images/modules/bigbang/event/378/logo-aston-fix.jpg","image_credit":"BBO Events","verification_score":null,"sources":[],"seeded_at":"2026-10-25T21:44:24.404Z"}'::jsonb, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        canonical_name = EXCLUDED.canonical_name,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        is_verified = EXCLUDED.is_verified,
        verification_status = EXCLUDED.verification_status,
        lifecycle_status = EXCLUDED.lifecycle_status,
        archive_status = EXCLUDED.archive_status,
        public_visibility = EXCLUDED.public_visibility,
        homepage_visibility = EXCLUDED.homepage_visibility,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
    

      INSERT INTO canonical_events (
        id, slug, canonical_name, event_type, category,
        start_date, start_datetime, end_date, end_datetime, timezone,
        venue_name, venue_city, city, province, country,
        organizer_name, official_event_url, official_ticket_url, official_ticketing_provider,
        min_price, max_price, is_verified, verification_status,
        lifecycle_status, archive_status, public_visibility, homepage_visibility,
        metadata, created_at, updated_at
      ) VALUES (
        'evt_377', 'evt_377', 'Holiday Inn Expr ...  2026', 'CONCERT', 'OTHER',
        NULL, NULL, NULL, NULL, 'Asia/Jakarta',
        'Venue TBA', 'Jakarta', 'Jakarta', NULL, 'Indonesia',
        NULL, 'https://bbo.co.id/bbo/holiday-inn-express-jakarta-international-expo-official-hotel-partner-of-62-coffee-r-i-fest-2026-evnt377', NULL, 'bbo',
        NULL, NULL, FALSE, 'DISCOVERY',
        'SCHEDULE_PENDING', 'PENDING', FALSE, FALSE,
        '{"artists":[],"image_url":"https://storage.googleapis.com/bbo-images/bbo.co.id/images/modules/bigbang/event/377/logo-holiday-fix.png","image_credit":"BBO Events","verification_score":null,"sources":[],"seeded_at":"2026-10-25T21:44:24.404Z"}'::jsonb, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        canonical_name = EXCLUDED.canonical_name,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        is_verified = EXCLUDED.is_verified,
        verification_status = EXCLUDED.verification_status,
        lifecycle_status = EXCLUDED.lifecycle_status,
        archive_status = EXCLUDED.archive_status,
        public_visibility = EXCLUDED.public_visibility,
        homepage_visibility = EXCLUDED.homepage_visibility,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
    

      INSERT INTO canonical_events (
        id, slug, canonical_name, event_type, category,
        start_date, start_datetime, end_date, end_datetime, timezone,
        venue_name, venue_city, city, province, country,
        organizer_name, official_event_url, official_ticket_url, official_ticketing_provider,
        min_price, max_price, is_verified, verification_status,
        lifecycle_status, archive_status, public_visibility, homepage_visibility,
        metadata, created_at, updated_at
      ) VALUES (
        'evt_363', 'evt_363', 'Layanan Shuttle  ...  2026', 'CONCERT', 'OTHER',
        NULL, NULL, NULL, NULL, 'Asia/Jakarta',
        'Venue TBA', 'Jakarta', 'Jakarta', NULL, 'Indonesia',
        NULL, 'https://bbo.co.id/bbo/layanan-shuttle-ke-jiexpo-14-16-agustus-2026-evnt363', NULL, 'bbo',
        NULL, NULL, FALSE, 'DISCOVERY',
        'SCHEDULE_PENDING', 'PENDING', FALSE, FALSE,
        '{"artists":[],"image_url":"https://storage.googleapis.com/bbo-images/bbo.co.id/images/modules/bigbang/event/363/title-banner-62-coffee-r-i-fest-2026-03.png","image_credit":"BBO Events","verification_score":null,"sources":[],"seeded_at":"2026-10-25T21:44:24.404Z"}'::jsonb, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        canonical_name = EXCLUDED.canonical_name,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        is_verified = EXCLUDED.is_verified,
        verification_status = EXCLUDED.verification_status,
        lifecycle_status = EXCLUDED.lifecycle_status,
        archive_status = EXCLUDED.archive_status,
        public_visibility = EXCLUDED.public_visibility,
        homepage_visibility = EXCLUDED.homepage_visibility,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
    

      INSERT INTO canonical_events (
        id, slug, canonical_name, event_type, category,
        start_date, start_datetime, end_date, end_datetime, timezone,
        venue_name, venue_city, city, province, country,
        organizer_name, official_event_url, official_ticket_url, official_ticketing_provider,
        min_price, max_price, is_verified, verification_status,
        lifecycle_status, archive_status, public_visibility, homepage_visibility,
        metadata, created_at, updated_at
      ) VALUES (
        'evt_338', 'evt_338', '+62 Coffee R-I F ...  2026', 'CONCERT', 'OTHER',
        NULL, NULL, NULL, NULL, 'Asia/Jakarta',
        'Venue TBA', 'Jakarta', 'Jakarta', NULL, 'Indonesia',
        NULL, 'https://bbo.co.id/bbo/62-coffee-r-i-fest-2026-evnt338', NULL, 'bbo',
        NULL, NULL, FALSE, 'DISCOVERY',
        'SCHEDULE_PENDING', 'PENDING', FALSE, FALSE,
        '{"artists":[],"image_url":"https://storage.googleapis.com/bbo-images/bbo.co.id/images/modules/bigbang/event/338/title-banner-62-image-gallery-utama-r-i-fest-2026.png","image_credit":"BBO Events","verification_score":null,"sources":[],"seeded_at":"2026-10-25T21:44:24.404Z"}'::jsonb, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        canonical_name = EXCLUDED.canonical_name,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        is_verified = EXCLUDED.is_verified,
        verification_status = EXCLUDED.verification_status,
        lifecycle_status = EXCLUDED.lifecycle_status,
        archive_status = EXCLUDED.archive_status,
        public_visibility = EXCLUDED.public_visibility,
        homepage_visibility = EXCLUDED.homepage_visibility,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
    

      INSERT INTO canonical_events (
        id, slug, canonical_name, event_type, category,
        start_date, start_datetime, end_date, end_datetime, timezone,
        venue_name, venue_city, city, province, country,
        organizer_name, official_event_url, official_ticket_url, official_ticketing_provider,
        min_price, max_price, is_verified, verification_status,
        lifecycle_status, archive_status, public_visibility, homepage_visibility,
        metadata, created_at, updated_at
      ) VALUES (
        'evt_371', 'evt_371', 'Illuminar Faire', 'CONCERT', 'OTHER',
        NULL, NULL, NULL, NULL, 'Asia/Jakarta',
        'Venue TBA', 'Jakarta', 'Jakarta', NULL, 'Indonesia',
        NULL, 'https://bbo.co.id/bbo/illuminar-faire-evnt371', NULL, 'bbo',
        NULL, NULL, FALSE, 'DISCOVERY',
        'SCHEDULE_PENDING', 'PENDING', FALSE, FALSE,
        '{"artists":[],"image_url":"https://storage.googleapis.com/bbo-images/bbo.co.id/images/modules/bigbang/event/371/illuminar-3-0-bbo-image-gallery-1366-x-768-px-jpg.jpg","image_credit":"BBO Events","verification_score":null,"sources":[],"seeded_at":"2026-10-25T21:44:24.404Z"}'::jsonb, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        canonical_name = EXCLUDED.canonical_name,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        is_verified = EXCLUDED.is_verified,
        verification_status = EXCLUDED.verification_status,
        lifecycle_status = EXCLUDED.lifecycle_status,
        archive_status = EXCLUDED.archive_status,
        public_visibility = EXCLUDED.public_visibility,
        homepage_visibility = EXCLUDED.homepage_visibility,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
    

      INSERT INTO canonical_events (
        id, slug, canonical_name, event_type, category,
        start_date, start_datetime, end_date, end_datetime, timezone,
        venue_name, venue_city, city, province, country,
        organizer_name, official_event_url, official_ticket_url, official_ticketing_provider,
        min_price, max_price, is_verified, verification_status,
        lifecycle_status, archive_status, public_visibility, homepage_visibility,
        metadata, created_at, updated_at
      ) VALUES (
        'evt_374', 'evt_374', 'Jakarta Fair Kem ...  2026', 'CONCERT', 'OTHER',
        NULL, NULL, NULL, NULL, 'Asia/Jakarta',
        'Venue TBA', 'Jakarta', 'Jakarta', NULL, 'Indonesia',
        NULL, 'https://bbo.co.id/bbo/jakarta-fair-kemayoran-2026-evnt374', NULL, 'bbo',
        NULL, NULL, FALSE, 'DISCOVERY',
        'SCHEDULE_PENDING', 'PENDING', FALSE, FALSE,
        '{"artists":[],"image_url":"https://storage.googleapis.com/bbo-images/bbo.co.id/images/modules/bigbang/event/374/20260518173313_6a0aeae95043a.png","image_credit":"BBO Events","verification_score":null,"sources":[],"seeded_at":"2026-10-25T21:44:24.404Z"}'::jsonb, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        canonical_name = EXCLUDED.canonical_name,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        is_verified = EXCLUDED.is_verified,
        verification_status = EXCLUDED.verification_status,
        lifecycle_status = EXCLUDED.lifecycle_status,
        archive_status = EXCLUDED.archive_status,
        public_visibility = EXCLUDED.public_visibility,
        homepage_visibility = EXCLUDED.homepage_visibility,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
    

      INSERT INTO canonical_events (
        id, slug, canonical_name, event_type, category,
        start_date, start_datetime, end_date, end_datetime, timezone,
        venue_name, venue_city, city, province, country,
        organizer_name, official_event_url, official_ticket_url, official_ticketing_provider,
        min_price, max_price, is_verified, verification_status,
        lifecycle_status, archive_status, public_visibility, homepage_visibility,
        metadata, created_at, updated_at
      ) VALUES (
        'evt_368', 'evt_368', 'Coma Fest by Asi ...  Coma', 'CONCERT', 'OTHER',
        NULL, NULL, NULL, NULL, 'Asia/Jakarta',
        'Venue TBA', 'Jakarta', 'Jakarta', NULL, 'Indonesia',
        NULL, 'https://bbo.co.id/bbo/coma-fest-by-asia-food-coma-evnt368', NULL, 'bbo',
        NULL, NULL, FALSE, 'DISCOVERY',
        'SCHEDULE_PENDING', 'PENDING', FALSE, FALSE,
        '{"artists":[],"image_url":"https://storage.googleapis.com/bbo-images/bbo.co.id/images/modules/bigbang/event/368/1366x768.png","image_credit":"BBO Events","verification_score":null,"sources":[],"seeded_at":"2026-10-25T21:44:24.404Z"}'::jsonb, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        canonical_name = EXCLUDED.canonical_name,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        is_verified = EXCLUDED.is_verified,
        verification_status = EXCLUDED.verification_status,
        lifecycle_status = EXCLUDED.lifecycle_status,
        archive_status = EXCLUDED.archive_status,
        public_visibility = EXCLUDED.public_visibility,
        homepage_visibility = EXCLUDED.homepage_visibility,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
    

      INSERT INTO canonical_events (
        id, slug, canonical_name, event_type, category,
        start_date, start_datetime, end_date, end_datetime, timezone,
        venue_name, venue_city, city, province, country,
        organizer_name, official_event_url, official_ticket_url, official_ticketing_provider,
        min_price, max_price, is_verified, verification_status,
        lifecycle_status, archive_status, public_visibility, homepage_visibility,
        metadata, created_at, updated_at
      ) VALUES (
        'evt_barcode-gokart_wkUg', 'barcode-gokart_wkUg', 'BARCODE GOKART', 'CONCERT', 'FESTIVAL',
        '2026-07-30', '2026-07-30T10:00:00+07:00', '2026-12-31', '2026-12-31T23:59:00+07:00', 'Asia/Jakarta',
        'MALL OF INDONESIA (MOI)', 'Jakarta', 'Jakarta', 'Kelapa Gading', 'Indonesia',
        'BARCODE GOKART', 'https://www.loket.com/event/barcode-gokart_wkUg', 'https://www.loket.com/event/barcode-gokart_wkUg', 'loket',
        60000, 590000, FALSE, 'DISCOVERY',
        'UPCOMING', 'ACTIVE', TRUE, FALSE,
        '{"artists":["BARCODE GOKART"],"image_url":"https://assets.loket.com/neo/production/images/banner/20260722110758_6a60421e6e332.png","image_credit":"LOKET","verification_score":null,"sources":[],"seeded_at":"2026-10-25T21:44:24.404Z"}'::jsonb, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        canonical_name = EXCLUDED.canonical_name,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        is_verified = EXCLUDED.is_verified,
        verification_status = EXCLUDED.verification_status,
        lifecycle_status = EXCLUDED.lifecycle_status,
        archive_status = EXCLUDED.archive_status,
        public_visibility = EXCLUDED.public_visibility,
        homepage_visibility = EXCLUDED.homepage_visibility,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
    

      INSERT INTO canonical_events (
        id, slug, canonical_name, event_type, category,
        start_date, start_datetime, end_date, end_datetime, timezone,
        venue_name, venue_city, city, province, country,
        organizer_name, official_event_url, official_ticket_url, official_ticketing_provider,
        min_price, max_price, is_verified, verification_status,
        lifecycle_status, archive_status, public_visibility, homepage_visibility,
        metadata, created_at, updated_at
      ) VALUES (
        'evt_kejurnas-round-4-passion-drift_wwbU', 'kejurnas-round-4-passion-drift_wwbU', 'Kejurnas Round 4 Passion Drift', 'CONCERT', 'FESTIVAL',
        '2026-10-02', '2026-10-02T09:00:00+07:00', '2026-10-04', '2026-10-04T17:00:00+07:00', 'Asia/Jakarta',
        'Sirkuit Mijen', 'Semarang', 'Semarang', 'Semarang', 'Indonesia',
        'Passion Drift', 'https://www.loket.com/event/kejurnas-round-4-passion-drift_wwbU', 'https://www.loket.com/event/kejurnas-round-4-passion-drift_wwbU', 'loket',
        100000, 250000, FALSE, 'DISCOVERY',
        'COMPLETED', 'ARCHIVED', TRUE, FALSE,
        '{"artists":["Kejurnas Round 4 Passion Drift"],"image_url":"https://assets.loket.com/neo/production/images/banner/20260813155041_6a7d85617cfc9.jpeg","image_credit":"LOKET","verification_score":null,"sources":[],"seeded_at":"2026-10-25T21:44:24.404Z"}'::jsonb, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        canonical_name = EXCLUDED.canonical_name,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        is_verified = EXCLUDED.is_verified,
        verification_status = EXCLUDED.verification_status,
        lifecycle_status = EXCLUDED.lifecycle_status,
        archive_status = EXCLUDED.archive_status,
        public_visibility = EXCLUDED.public_visibility,
        homepage_visibility = EXCLUDED.homepage_visibility,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
    

      INSERT INTO canonical_events (
        id, slug, canonical_name, event_type, category,
        start_date, start_datetime, end_date, end_datetime, timezone,
        venue_name, venue_city, city, province, country,
        organizer_name, official_event_url, official_ticket_url, official_ticketing_provider,
        min_price, max_price, is_verified, verification_status,
        lifecycle_status, archive_status, public_visibility, homepage_visibility,
        metadata, created_at, updated_at
      ) VALUES (
        'evt_ice-skating-bx-rink-bintaro-jaya_419UU', 'ice-skating-bx-rink-bintaro-jaya_419UU', 'Ice Skating @BX Rink Bintaro Jaya', 'CONCERT', 'FESTIVAL',
        '2025-06-01', '2025-06-01T10:00:00+07:00', '2026-12-31', '2026-12-31T23:00:00+07:00', 'Asia/Jakarta',
        'BX Rink BIntaro Jaya Xchange', 'Tangerang Selatan', 'Tangerang Selatan', 'Pondok Aren / Jurang Mangu', 'Indonesia',
        'Powered by Loket.com for BX Rink', 'https://www.loket.com/event/ice-skating-bx-rink-bintaro-jaya_419UU', 'https://www.loket.com/event/ice-skating-bx-rink-bintaro-jaya_419UU', 'loket',
        102000, 123250, FALSE, 'DISCOVERY',
        'UPCOMING', 'ACTIVE', TRUE, FALSE,
        '{"artists":["Ice Skating @BX Rink Bintaro Jaya"],"image_url":"https://assets.loket.com/neo/production/images/banner/20211029070059.jpg","image_credit":"LOKET","verification_score":null,"sources":[],"seeded_at":"2026-10-25T21:44:24.404Z"}'::jsonb, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        canonical_name = EXCLUDED.canonical_name,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        is_verified = EXCLUDED.is_verified,
        verification_status = EXCLUDED.verification_status,
        lifecycle_status = EXCLUDED.lifecycle_status,
        archive_status = EXCLUDED.archive_status,
        public_visibility = EXCLUDED.public_visibility,
        homepage_visibility = EXCLUDED.homepage_visibility,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
    

      INSERT INTO canonical_events (
        id, slug, canonical_name, event_type, category,
        start_date, start_datetime, end_date, end_datetime, timezone,
        venue_name, venue_city, city, province, country,
        organizer_name, official_event_url, official_ticket_url, official_ticketing_provider,
        min_price, max_price, is_verified, verification_status,
        lifecycle_status, archive_status, public_visibility, homepage_visibility,
        metadata, created_at, updated_at
      ) VALUES (
        'evt_songkick-mcr-jakarta-2026', 'evt_songkick-mcr-jakarta-2026', 'My Chemical Romance — Jakarta International Stadium', 'CONCERT', 'CONCERT',
        '2026-11-28', '2026-11-28T19:00:00+07:00', '2026-11-28', '2026-11-28T23:00:00+07:00', 'Asia/Jakarta',
        'Jakarta International Stadium', 'Jakarta', 'Jakarta', NULL, 'Indonesia',
        'Songkick Concert Radar (Jakarta & Greater Jakarta)', NULL, NULL, 'songkick-jakarta',
        NULL, NULL, FALSE, 'DISCOVERY',
        'UPCOMING', 'ACTIVE', TRUE, FALSE,
        '{"artists":["My Chemical Romance"],"image_url":null,"image_credit":null,"verification_score":45,"sources":[],"seeded_at":"2026-10-25T21:44:24.405Z"}'::jsonb, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        canonical_name = EXCLUDED.canonical_name,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        is_verified = EXCLUDED.is_verified,
        verification_status = EXCLUDED.verification_status,
        lifecycle_status = EXCLUDED.lifecycle_status,
        archive_status = EXCLUDED.archive_status,
        public_visibility = EXCLUDED.public_visibility,
        homepage_visibility = EXCLUDED.homepage_visibility,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
    

      INSERT INTO canonical_events (
        id, slug, canonical_name, event_type, category,
        start_date, start_datetime, end_date, end_datetime, timezone,
        venue_name, venue_city, city, province, country,
        organizer_name, official_event_url, official_ticket_url, official_ticketing_provider,
        min_price, max_price, is_verified, verification_status,
        lifecycle_status, archive_status, public_visibility, homepage_visibility,
        metadata, created_at, updated_at
      ) VALUES (
        'ev-can-fd86cf7d', 'morgan-jay-the-goofy-guy-tour-jakarta-2026', 'Morgan Jay: The Goofy Guy Tour Jakarta', 'COMEDY', 'COMEDY',
        '2026-11-11', '2026-11-11T20:00:00+07:00', '2026-11-11', '2026-11-11T21:30:00+07:00', 'Asia/Jakarta',
        'Nafiri Convention Hall', 'Jakarta Barat', 'Jakarta', 'DKI Jakarta', 'Indonesia',
        'Mad About Comedy', 'https://morganjay.com', 'https://megatix.co.id/events/MorganJay2026A', 'Megatix',
        650000, 1250000, TRUE, 'PRIMARY_SOURCE_VERIFIED',
        'UPCOMING', 'ACTIVE', TRUE, TRUE,
        '{"artist":"Morgan Jay","artists":["Morgan Jay"],"age_restriction":"16+","official_ticket_availability":"SOLD_OUT","primary_ticket_status":"SOLD_OUT","has_venue_assist":false,"has_pic":false,"venue_assist_status":"NOT_SCHEDULED","seo_title":"Morgan Jay Jakarta 2026: Jadwal, Venue & Info Tiket | TIKUM","seo_description":"Cari informasi Morgan Jay: The Goofy Guy Tour Jakarta pada 11 November 2026 di Nafiri Convention Hall. Cek detail event dan status tiket dari sumber resmi.","description":"Tur stand-up comedy musikal perdana Morgan Jay di Jakarta dalam rangkaian The Goofy Guy Tour pada Rabu, 11 November 2026 di Nafiri Convention Hall, Central Park Mall. Seluruh penjualan tiket resmi di Megatix saat ini telah sold out dan pengunjung diarahkan ke waiting list pembatalan tiket.","image_url":"/assets/posters/morgan-jay-the-goofy-guy-tour-jakarta-2026.jpg","poster_url":"/assets/posters/morgan-jay-the-goofy-guy-tour-jakarta-2026.jpg","thumbnail_url":"/assets/posters/morgan-jay-the-goofy-guy-tour-jakarta-2026.jpg","image_source_url":"https://megatix.co.id/events/MorganJay2026A","image_source_type":"OFFICIAL_TICKETING_PORTAL","image_status":"VERIFIED_OFFICIAL","image_credit":"Morgan Jay: The Goofy Guy Tour Jakarta / Megatix / Mad About Comedy","image_verified":true,"admission_protocol":{"type":"E-TICKET_WAITLIST_MEGATIX","description":"Tiket resmi diterbitkan secara elektronik melalui portal Megatix. Syarat penukaran dan transfer tiket tunduk pada ketentuan resmi promotor Mad About Comedy dan Megatix.","verification_disclaimer":"Layanan PIC lapangan TIKUM belum dijadwalkan untuk event ini. TIKUM tidak membuka pemrosesan transaksi sekunder sebelum inventaris dan verifikasi resmi siap.","age_restriction":"16+"},"price_tiers":[{"name":"General Admission","price":650000,"status":"SOLD_OUT","face_value":650000,"currency":"IDR"},{"name":"VIP Meet & Greet","price":1250000,"status":"SOLD_OUT","face_value":1250000,"currency":"IDR"}],"provenance":{"official_source":"https://morganjay.com","ticket_source":"https://megatix.co.id/events/MorganJay2026A","promoter_source":"Mad About Comedy","venue_source":"Nafiri Convention Hall, Central Park Mall","discovery_source":"src-official-comedy","notes":["Verified via official Megatix portal (https://megatix.co.id/events/MorganJay2026A)","Tickets marked ALL TICKETS SOLD OUT! Waiting list enabled on Megatix","Presenter confirmed: Mad About Comedy"]}}'::jsonb, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        canonical_name = EXCLUDED.canonical_name,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        is_verified = EXCLUDED.is_verified,
        verification_status = EXCLUDED.verification_status,
        lifecycle_status = EXCLUDED.lifecycle_status,
        archive_status = EXCLUDED.archive_status,
        public_visibility = EXCLUDED.public_visibility,
        homepage_visibility = EXCLUDED.homepage_visibility,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();

COMMIT;