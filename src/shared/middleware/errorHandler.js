const { captureError } = require('../../infra/observability');

// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
  if (err.name === 'ValidationError' && err.errors) {
    return res.status(400).json({ message: Object.values(err.errors).map((e) => e.message).join(', ') });
  }
  if (err.code === 11000 && err.keyValue) {
    return res.status(400).json({ message: `${Object.keys(err.keyValue)[0]} already exists` });
  }
  if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid ID format' });

  const status = err.status || err.statusCode || 500;
  if (status >= 500 && status !== 503) captureError(err, { requestId: req.id, path: req.originalUrl });
  res.status(status).json({
    message: status >= 500 && process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    ...(err.code && typeof err.code === 'string' ? { code: err.code } : {}),
    requestId: req.id,
  });
};
