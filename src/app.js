const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const commentRoutes = require('./routes/commentRoutes');
const reportRoutes = require('./routes/reportRoutes');

const app = express();

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Register API Routes
app.use('/auth', authRoutes);
app.use('/tickets', ticketRoutes);
app.use('/comments', commentRoutes);
app.use('/reports', reportRoutes);

const { getMetrics, resetPeakMetrics } = require('./utils/telemetry');

// Simple health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Telemetry & Resource Utilization Metrics (CPU, Memory, DB Connection Pool)
app.get('/metrics', (req, res) => {
  res.json(getMetrics());
});

app.post('/metrics/reset', (req, res) => {
  res.json(resetPeakMetrics());
});

// Handle 404
app.use((req, res, next) => {
  res.status(404).json({ message: 'Resource not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Server Error', error: err.message });
});

module.exports = app;
