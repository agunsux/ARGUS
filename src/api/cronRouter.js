'use strict';
/**
 * TIKUM / ARGUS — Authenticated Vercel Cron Router
 *
 * Exposes fail-closed daily cron endpoints protected by constant-time
 * Authorization: Bearer <CRON_SECRET> verification.
 */

const crypto = require('crypto');
const express = require('express');
const hygiene = require('../discovery/CatalogHygienePolicy');
const { getCatalogRepository } = require('../discovery/repository');

function verifyCronBearerAuth(req, secretOverride) {
  const rawSecret = secretOverride !== undefined ? secretOverride : process.env.CRON_SECRET;
  if (typeof rawSecret !== 'string' || rawSecret.trim().length < 16) {
    return {
      ok: false,
      status: 503,
      code: 'CRON_SECRET_NOT_CONFIGURED'
    };
  }

  const expectedHeader = `Bearer ${rawSecret.trim()}`;
  const providedHeader = typeof req.headers?.authorization === 'string' ? req.headers.authorization : '';
  const expectedBuf = Buffer.from(expectedHeader, 'utf8');
  const providedBuf = Buffer.from(providedHeader, 'utf8');

  if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return {
      ok: false,
      status: 401,
      code: 'UNAUTHORIZED'
    };
  }

  return { ok: true };
}

function defaultSyncInMemory(archivedRecords, { nowIso } = {}) {
  try {
    const { canonicalRegistry } = require('../discovery/CanonicalEventRegistry');
    const { state } = require('../database');
    return hygiene.syncArchivedEventsInMemory(archivedRecords, {
      canonicalRegistry,
      stateEvents: state?.events || null,
      nowIso
    });
  } catch (_) {
    return 0;
  }
}

function createCronRouter(deps = {}) {
  const router = express.Router();
  const getRepository = deps.getRepository || getCatalogRepository;
  const getTodayWib = deps.getTodayWib || (() => hygiene.getTodayWibIso());
  const syncInMemory = deps.syncInMemory || defaultSyncInMemory;

  router.get('/archive-past-events', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const auth = verifyCronBearerAuth(req, deps.cronSecret);
    if (!auth.ok) {
      return res.status(auth.status).json({
        ok: false,
        code: auth.code
      });
    }

    const startedAt = Date.now();
    const rawDryRun = String(req.query?.dryRun || '').trim().toLowerCase();
    const dryRun = rawDryRun === 'true' || rawDryRun === '1';
    const todayWib = getTodayWib();

    try {
      const repo = getRepository();
      if (repo && !repo.initialized && typeof repo.init === 'function') {
        await repo.init();
      }
      const result = await repo.archivePastEvents({ todayWib, dryRun });
      const nowIso = new Date().toISOString();

      if (!dryRun && result.archivedCount > 0) {
        syncInMemory(result.archivedRecords || result.archivedIds, { nowIso });
      }

      const payload = {
        ok: true,
        todayWib: result.todayWib || todayWib,
        dryRun: Boolean(result.dryRun),
        archivedCount: Number(result.archivedCount || 0),
        archivedIds: Array.isArray(result.archivedIds) ? result.archivedIds : [],
        durationMs: Date.now() - startedAt
      };
      if (dryRun) {
        payload.candidateCount = Number(result.candidateCount || 0);
        payload.candidateIds = Array.isArray(result.candidateIds) ? result.candidateIds : [];
      }

      return res.status(200).json(payload);
    } catch (err) {
      console.error('[CronRouter] archive-past-events failed:', err && err.code ? err.code : 'INTERNAL_ERROR');
      return res.status(500).json({
        ok: false,
        code: 'ARCHIVE_PAST_EVENTS_FAILED',
        durationMs: Date.now() - startedAt
      });
    }
  });

  return router;
}

const defaultRouter = createCronRouter();
defaultRouter.createCronRouter = createCronRouter;
defaultRouter.verifyCronBearerAuth = verifyCronBearerAuth;

module.exports = defaultRouter;
