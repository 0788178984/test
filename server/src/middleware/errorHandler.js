const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Database constraint errors
  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(400).json({ 
      error: 'Duplicate entry. This record already exists.' 
    });
  }

  if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    return res.status(400).json({ 
      error: 'Referenced record does not exist.' 
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid authentication token.' });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Authentication token expired.' });
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }

  // Default error
  res.status(500).json({ 
    error: 'Internal server error. Please try again.' 
  });
};

module.exports = errorHandler;
