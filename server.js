const express = require('express');
const path = require('path');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Optional proxy to FastAPI backend when BACKEND_URL is configured
const BACKEND_URL = process.env.BACKEND_URL;
if (BACKEND_URL) {
  app.use('/api/v1', (req, res) => {
    try {
      const targetUrl = new URL(req.originalUrl, BACKEND_URL);
      const client = targetUrl.protocol === 'https:' ? https : http;
      const proxyReq = client.request(
        targetUrl,
        {
          method: req.method,
          headers: { ...req.headers, host: targetUrl.host },
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          proxyRes.pipe(res, { end: true });
        }
      );
      proxyReq.on('error', (err) => {
        console.error('Proxy error to backend:', err.message);
        if (!res.headersSent) {
          res.status(502).json({ error: 'Backend service unavailable', detail: err.message });
        }
      });
      req.pipe(proxyReq, { end: true });
    } catch (e) {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Proxy routing error', detail: e.message });
      }
    }
  });
}

// Static files from frontend/dist
const distPath = path.join(__dirname, 'frontend', 'dist');
app.use(express.static(distPath));

// SPA catch-all: serve index.html for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Listen on process.env.PORT and 0.0.0.0
app.listen(PORT, HOST, () => {
  console.log(`MedTimeline AI Express server listening on http://${HOST}:${PORT}`);
});
