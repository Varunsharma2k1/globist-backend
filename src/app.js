/**
 * Builds the Express app (no listening, no DB connect) so it can be used by
 * the long-running server, the Vercel function and tests alike.
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const env = require('./config/env');
const requestId = require('./shared/middleware/requestId');
const rateLimit = require('./shared/middleware/rateLimit');
const errorHandler = require('./shared/middleware/errorHandler');
const modules = require('./modules');
const { webhookRouter } = require('./modules/payments/payments.routes');

const app = express();
app.set('trust proxy', 1); // behind Cloudflare / ALB

app.use(requestId);
app.use(cors({ origin: env.corsOrigins, credentials: true }));

// Raw-body routes must come before the JSON parser.
app.use('/api/payments', webhookRouter);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use('/api', rateLimit({ name: 'api' }));

// Local media (dev / until R2 is configured). In prod the CDN serves these.
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), { maxAge: '1d' }));

for (const [mount, router] of modules) app.use(mount, router);

app.use('/api', (req, res) => res.status(404).json({ message: 'Not found', requestId: req.id }));
app.use(errorHandler);

module.exports = app;
