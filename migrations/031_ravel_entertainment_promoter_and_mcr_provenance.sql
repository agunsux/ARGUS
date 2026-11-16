-- 031_ravel_entertainment_promoter_and_mcr_provenance.sql
-- TIKUM: Update MCR Jakarta 2026 Provenance with Trusted Primary Promoter Ravel Entertainment
-- Primary Promoter: Ravel Entertainment (https://www.ravelentertainment.com/)
-- Event Microsite: https://mcrjakarta.com/
-- Official Ticketing: https://www.tiket.com/id-id/to-do/my-chemical-romance-live-in-jakarta-2026

UPDATE canonical_events SET
  organizer_name = 'Ravel Entertainment',
  official_event_url = 'https://mcrjakarta.com/',
  official_ticket_url = 'https://www.tiket.com/id-id/to-do/my-chemical-romance-live-in-jakarta-2026',
  official_ticketing_provider = 'Tiket.com',
  metadata = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{primary_promoter}', '"Ravel Entertainment"'
          ),
          '{promoter_website}', '"https://www.ravelentertainment.com/"'
        ),
        '{event_microsite}', '"https://mcrjakarta.com/"'
      ),
      '{ticketing_reference}', '"https://www.tiket.com/id-id/to-do/my-chemical-romance-live-in-jakarta-2026"'
    ),
    '{source_id}', '"src-promoter-ravel"'
  ),
  updated_at = NOW()
WHERE id = 'event-mcr-jakarta-2026';
