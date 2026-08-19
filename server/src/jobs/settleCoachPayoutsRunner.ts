import { runSettleCoachPayoutsJob } from './settleCoachPayouts.js';
import { pool } from '../lib/db.js';

runSettleCoachPayoutsJob()
  .then((result) => {
    console.log('[settle-coach-payouts]', JSON.stringify(result));
  })
  .catch((err) => {
    console.error('[settle-coach-payouts] failed', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
