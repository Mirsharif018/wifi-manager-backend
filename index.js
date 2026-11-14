// index.js
const express = require('express');
const app = express();

app.use(express.json());

// ভয়েস রাউট যুক্ত করা
const voiceRoutes = require('./routes/voice');
app.use('/api', voiceRoutes);

module.exports = app;
