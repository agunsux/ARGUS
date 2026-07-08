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
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

// Serve front-end files
app.use(express.static(path.resolve(__dirname, '../public')));

// Mount Trust APIs
app.use(trustApi);

// Basic error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// Initialize DB and start listening
initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`==================================================`);
      console.log(`  ARGUS Trust Infrastructure running on port ${PORT}`);
      console.log(`  Database loaded: src/database.js`);
      console.log(`==================================================`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize database on startup:', err);
    process.exit(1);
  });

module.exports = app;
