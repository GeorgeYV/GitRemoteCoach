import { runExpireBookingsJob } from './expireBookings.js';
import { pool } from '../lib/db.js';

runExpireBookingsJob()
  .then((result) => {
    console.log('[expire-bookings]', JSON.stringify(result));
  })
  .catch((err) => {
    console.error('[expire-bookings] failed', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
