import { runSettleClubsJob } from './settleClubs.js';
import { pool } from '../lib/db.js';

runSettleClubsJob()
  .then((result) => {
    console.log('[settle-clubs]', JSON.stringify(result));
  })
  .catch((err) => {
    console.error('[settle-clubs] failed', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
