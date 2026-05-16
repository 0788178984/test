const crypto = require('crypto');

function newId(prefix) {
  return `${prefix}-${crypto.randomBytes(8).toString('hex')}`;
}

module.exports = { newId };
