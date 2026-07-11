const express = require('express');
const path = require('path');
const { initializeDatabase } = require('./database');
const trustApi = require('./public/trust_api');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploads folder statically for evidence check debugging
const uploadsDir = process.env.VERCEL
  ? '/tmp/uploads'
  : path.resolve(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsDir));

// Serve front-end files
app.use(express.static(path.resolve(__dirname, '../public')));

// Mount Trust APIs
app.use(trustApi);

// Basic error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

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

// Start listener only when running standalone locally
if (require.main === module && !process.env.VERCEL) {
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
