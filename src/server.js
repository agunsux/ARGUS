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

// Serve front-end files
const sendFileOpts = { dotfiles: 'allow' };
app.use(express.static(path.resolve(__dirname, '../public'), sendFileOpts));

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

// Explicit Institutional Frontend Page Delivery
const publicDir = path.resolve(__dirname, '../public');
const { businessProfile } = require('./config/businessProfile');
app.get('/api/business-profile', (req, res) => res.json(businessProfile));

app.get('/create', (req, res) => res.sendFile(path.join(publicDir, 'create.html'), sendFileOpts));
app.get('/pay/:id', (req, res) => res.sendFile(path.join(publicDir, 'pay.html'), sendFileOpts));
app.get('/pay', (req, res) => res.sendFile(path.join(publicDir, 'pay.html'), sendFileOpts));
app.get('/offers', (req, res) => res.sendFile(path.join(publicDir, 'offers.html'), sendFileOpts));
app.get('/track/:id', (req, res) => res.sendFile(path.join(publicDir, 'track.html'), sendFileOpts));
app.get('/track', (req, res) => res.sendFile(path.join(publicDir, 'track.html'), sendFileOpts));
app.get('/admin', (req, res) => res.sendFile(path.join(publicDir, 'admin.html'), sendFileOpts));
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
  startOfferExpiryJob();
  dbPromise.then(() => {
    app.listen(PORT, () => {
      console.log(`==================================================`);
      console.log(`  ARGUS Trust Infrastructure running on port ${PORT}`);
      console.log(`  Database loaded: src/database.js`);
      console.log(`==================================================`);
    });
  });
}

module.exports = app;
