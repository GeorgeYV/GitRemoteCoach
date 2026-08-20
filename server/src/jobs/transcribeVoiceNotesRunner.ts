import { runTranscribeVoiceNotesJob } from './transcribeVoiceNotes.js';
import { pool } from '../lib/db.js';

runTranscribeVoiceNotesJob()
  .then((result) => {
    console.log('[transcribe-voice-notes]', JSON.stringify(result));
  })
  .catch((err) => {
    console.error('[transcribe-voice-notes] failed', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
