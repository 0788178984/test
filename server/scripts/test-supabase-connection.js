require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { ping, closePool } = require('../src/db/pool');

ping()
  .then(() => {
    console.log('Connected OK');
    return closePool();
  })
  .catch((err) => {
    console.error('Failed:', err.message);
    process.exit(1);
  });
