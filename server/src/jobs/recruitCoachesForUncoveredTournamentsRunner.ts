import { runRecruitCoachesForUncoveredTournamentsJob } from './recruitCoachesForUncoveredTournaments.js';
import { pool } from '../lib/db.js';

runRecruitCoachesForUncoveredTournamentsJob()
  .then((result) => {
    console.log('[recruit-coaches]', JSON.stringify(result));
  })
  .catch((err) => {
    console.error('[recruit-coaches] failed', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
