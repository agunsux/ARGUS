const express = require('express');
const path = require('path');
const { initializeDatabase } = require('./database');
const trustApi = require('./public/trust_api');

const app = express();
const PORT = process.env.PORT || 3000;

// Admin CSV promoter import accepts larger JSON payloads (CSV up to 2 MB).
// Scoped parser must run BEFORE the default 100kb json parser so it wins.
const csvJsonParser = express.json({ limit: '3mb' });
app.use('/api/discovery/promoters/import', (req, res, next) => {
  csvJsonParser(req, res, (err) => {
    if (err) {
      const tooLarge = err.type === 'entity.too.large';
      return res.status(tooLarge ? 413 : (err.status || err.statusCode || 400)).json({
        error: tooLarge ? 'CSV payload exceeds the maximum allowed size' : 'Invalid JSON request body',
        code: tooLarge ? 'FILE_TOO_LARGE' : 'INVALID_BODY'
      });
    }
    next();
  });
});

// Configure body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize DB
const dbPromise = initializeDatabase().catch(err => {
  console.error('Failed to initialize database:', err);
});

// Ensure database tables are created before handling any request
app.use(async (req, res, next) => {
  try {
    await dbPromise;
    next();
  } catch (e) {
    next(e);
  }
});

// Serve uploads folder statically for evidence check debugging
const uploadsDir = process.env.VERCEL
  ? '/tmp/uploads'
  : path.resolve(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsDir));

// Canonical Host Enforcement: Redirect legacy public Vercel hostnames to https://tikum.app
const LEGACY_PUBLIC_HOSTS = new Set([
  'argus-trust-infrastructure.vercel.app',
  'argus-trust-infrastructure-shinerva.vercel.app',
  'argus-trust-infrastructure-git-main-shinerva.vercel.app'
]);

app.use((req, res, next) => {
  const rawHost = req.headers['x-forwarded-host'] || req.headers.host || '';
  const host = rawHost.split(':')[0].toLowerCase();
  if (LEGACY_PUBLIC_HOSTS.has(host)) {
    const targetUrl = `https://tikum.app${req.originalUrl || req.url || '/'}`;
    return res.redirect(301, targetUrl);
  }
  next();
});

// Dynamic SEO Endpoints (Robots.txt & Sitemap.xml)
const { TechnicalSEOService } = require('./seo/TechnicalSEOService');
const { VenueRegistry } = require('./discovery/VenueRegistry');
const { CityRegistry } = require('./discovery/CityRegistry');
const { articleRepository } = require('./content/ArticleRepository');

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(TechnicalSEOService.generateRobotsTxt());
});

app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml').send(TechnicalSEOService.generateSitemapXml({
    getVenues: () => VenueRegistry.getAllVenues(),
    getCities: () => CityRegistry.getAllCities(),
    getPublishedArticles: () => articleRepository.getPublishedArticles()
  }));
});

const { resolveUser, isAdminRole } = require('./middleware/auth');

// Institutional and static file delivery
const publicDir = path.resolve(__dirname, '../public');
const sendFileOpts = { dotfiles: 'allow' };

function wantsHtml(req) {
  const accept = req.headers.accept || '';
  return accept.includes('text/html') || accept.includes('application/xhtml+xml');
}

// Dedicated admin login surface (public)
app.get('/admin/login', (req, res) => {
  const user = resolveUser(req);
  if (user && isAdminRole(user.role) && (user.status || 'ACTIVE').toUpperCase() !== 'SUSPENDED') {
    return res.redirect(302, '/admin');
  }
  return res.sendFile(path.join(publicDir, 'admin-login.html'), sendFileOpts);
});

// Enforce admin authorization boundary before static handler.
// Browser navigation (Accept: text/html) is redirected to /admin/login;
// API clients receive explicit 401/403 JSON.
app.get(['/admin', '/admin.html'], (req, res) => {
  const user = resolveUser(req);

  if (!user) {
    if (wantsHtml(req)) return res.redirect(302, '/admin/login');
    return res.status(401).json({
      error: 'Authentication required. Invalid or missing session.',
      code: 'AUTH_REQUIRED'
    });
  }

  if ((user.status || '').toUpperCase() === 'SUSPENDED') {
    if (wantsHtml(req)) return res.redirect(302, '/admin/login?error=USER_SUSPENDED');
    return res.status(403).json({
      error: 'Account is suspended. Access denied.',
      code: 'USER_SUSPENDED'
    });
  }

  if (!isAdminRole(user.role)) {
    if (wantsHtml(req)) return res.redirect(302, '/admin/login?error=ADMIN_ACCESS_REQUIRED');
    return res.status(403).json({
      error: `Forbidden: role '${user.role}' not permitted for this action`,
      code: 'FORBIDDEN'
    });
  }

  return res.sendFile(path.join(publicDir, 'admin.html'), sendFileOpts);
});

// Serve front-end files
app.use(express.static(publicDir, sendFileOpts));

// Mount Trust APIs
app.use(trustApi);

// Mount MVP Transaction Trust Loop APIs
const mvpRouter = require('./api/mvpRouter');
app.use('/api/mvp', mvpRouter);

// Mount Epic 4.0 Structured Offer APIs
const offerRouter = require('./api/offerRouter');
app.use('/api', offerRouter);
app.use('/api/mvp', offerRouter);

// Mount Epic: Event Discovery & SEO Engine
const discoveryRouter = require('./discovery/discoveryRouter');
app.use(discoveryRouter);

// Mount Entity SEO Router (Venues, Artists, Cities, Categories)
const entityRouter = require('./discovery/entityRouter');
app.use(entityRouter);

// Mount Trust Authority Pages (/how-it-works, /buyer-protection, /seller-protection, /ticket-verification, /escrow, /disputes)
const trustPagesRouter = require('./trust/trustPagesRouter');
app.use(trustPagesRouter);

// Mount Editorial Blog Engine (/blog, /blog/:slug, /guides)
const blogRouter = require('./content/blogRouter');
app.use(blogRouter);

// Mount Content Admin Control Center
const contentAdminRouter = require('./api/contentAdminRouter');
app.use(contentAdminRouter);

// Mount Admin Trust Control Center (Epics M & N)
const adminTrustRouter = require('./api/adminTrustRouter');
app.use('/api/admin/trust', adminTrustRouter);

// Mount Admin Control Plane APIs (Epic 5.1)
const adminRouter = require('./api/adminRouter');
app.use('/api/admin', adminRouter);

// Mount Canonical Authentication APIs (Magic Link, Sessions)
const authRouter = require('./api/authRouter');
app.use('/api/auth', authRouter);

// Explicit Institutional Frontend Page Delivery
const { businessProfile } = require('./config/businessProfile');
app.get('/api/business-profile', (req, res) => res.json(businessProfile));

app.get('/signup', (req, res) => res.sendFile(path.join(publicDir, 'signup.html'), sendFileOpts));
app.get('/login', (req, res) => res.sendFile(path.join(publicDir, 'login.html'), sendFileOpts));
app.get('/create', (req, res) => res.sendFile(path.join(publicDir, 'create.html'), sendFileOpts));
app.get('/pay/:id', (req, res) => res.sendFile(path.join(publicDir, 'pay.html'), sendFileOpts));
app.get('/pay', (req, res) => res.sendFile(path.join(publicDir, 'pay.html'), sendFileOpts));
app.get('/offers', (req, res) => res.sendFile(path.join(publicDir, 'offers.html'), sendFileOpts));
app.get('/track/:id', (req, res) => res.sendFile(path.join(publicDir, 'track.html'), sendFileOpts));
app.get('/track', (req, res) => res.sendFile(path.join(publicDir, 'track.html'), sendFileOpts));
app.get('/terms', (req, res) => res.sendFile(path.join(publicDir, 'terms.html'), sendFileOpts));
app.get('/privacy', (req, res) => res.sendFile(path.join(publicDir, 'privacy.html'), sendFileOpts));
app.get('/faq', (req, res) => res.sendFile(path.join(publicDir, 'faq.html'), sendFileOpts));
app.get('/contact', (req, res) => res.sendFile(path.join(publicDir, 'contact.html'), sendFileOpts));
app.get('/refund-policy', (req, res) => res.sendFile(path.join(publicDir, 'refund-policy.html'), sendFileOpts));
app.get('/refund', (req, res) => res.redirect('/refund-policy'));
app.get('/baton', (req, res) => res.sendFile(path.join(publicDir, 'baton.html'), sendFileOpts));

// Root and health endpoints for API health check (local + Vercel rewrite)
app.get('/', (req, res, next) => {
  if (req.accepts('html')) {
    return res.sendFile(path.join(publicDir, 'index.html'), sendFileOpts);
  }
  res.json({
    service: "ARGUS Trust Infrastructure",
    status: "healthy",
    version: "1.0.0",
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({
    service: "ARGUS Trust Infrastructure",
    status: "healthy",
    version: "1.0.0",
    timestamp: new Date().toISOString()
  });
});

// Basic error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// Start listener only when running standalone locally
if (require.main === module && !process.env.VERCEL) {
  const { startOfferExpiryJob } = require('./jobs/offerExpiryJob');
  const { EventTemporalLifecycleEngine } = require('./discovery/EventTemporalLifecycleEngine');
  startOfferExpiryJob();
  dbPromise.then(async () => {
    try {
      await EventTemporalLifecycleEngine.reconcileAllEvents();
      // Periodic temporal lifecycle reconciliation (every 10 minutes)
      setInterval(() => {
        EventTemporalLifecycleEngine.reconcileAllEvents().catch(err => {
          console.error('[EventTemporalLifecycleEngine] Periodic reconciliation error:', err);
        });
      }, 10 * 60 * 1000).unref();
    } catch (e) {
      console.error('Initial event lifecycle reconciliation error:', e);
    }
    app.listen(PORT, () => {
      console.log(`==================================================`);
      console.log(`  ARGUS Trust Infrastructure running on port ${PORT}`);
      console.log(`  Database loaded: src/database.js`);
      console.log(`==================================================`);
    });
  });
}

module.exports = app;
