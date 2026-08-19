import { runPaymentRemindersJob } from './paymentReminders.js';
import { pool } from '../lib/db.js';

runPaymentRemindersJob()
  .then((result) => {
    console.log('[payment-reminders]', JSON.stringify(result));
  })
  .catch((err) => {
    console.error('[payment-reminders] failed', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
