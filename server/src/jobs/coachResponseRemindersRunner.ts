import { runCoachResponseRemindersJob } from './coachResponseReminders.js';
import { pool } from '../lib/db.js';

runCoachResponseRemindersJob()
  .then((result) => {
    console.log('[coach-response-reminders]', JSON.stringify(result));
  })
  .catch((err) => {
    console.error('[coach-response-reminders] failed', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
