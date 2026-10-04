/**
 * Cron Scheduler Service for running Auto-Commit 3 times daily
 */
const cron = require('node-cron');
const { commitAgent } = require('./commitAgent');
const { addLog } = require('./logger');

// Default: 3 times daily at 09:00, 14:00, and 20:00
const DEFAULT_CRON_SCHEDULE = '0 9,14,20 * * *';

let scheduledTask = null;
let currentCronExpression = DEFAULT_CRON_SCHEDULE;

/**
 * Initializes and starts the cron scheduler
 */
function initScheduler() {
  const cronExpression = process.env.CRON_SCHEDULE || DEFAULT_CRON_SCHEDULE;
  const timezone = process.env.CRON_TIMEZONE || 'UTC';

  currentCronExpression = cronExpression;

  if (!cron.validate(cronExpression)) {
    addLog('ERROR', `Invalid CRON_SCHEDULE expression: "${cronExpression}". Using default: "${DEFAULT_CRON_SCHEDULE}"`);
    currentCronExpression = DEFAULT_CRON_SCHEDULE;
  }

  if (scheduledTask) {
    scheduledTask.stop();
  }

  addLog('INFO', `Starting Cron Scheduler [Schedule: "${currentCronExpression}", Timezone: "${timezone}"] (3 times daily)`);

  scheduledTask = cron.schedule(
    currentCronExpression,
    async () => {
      addLog('INFO', `Cron schedule triggered at ${new Date().toISOString()}`);
      try {
        await commitAgent.executeCycle('scheduled');
      } catch (err) {
        addLog('ERROR', `Error in scheduled auto-commit execution: ${err.message}`);
      }
    },
    {
      scheduled: true,
      timezone: timezone,
    }
  );

  return scheduledTask;
}

/**
 * Calculates an approximate next run time based on schedule for dashboard display
 */
function getNextScheduledTime() {
  const cronExpression = currentCronExpression;
  const parts = cronExpression.trim().split(/\s+/);
  
  if (parts.length >= 5) {
    const minutePart = parts[0];
    const hourPart = parts[1];

    const targetMinutes = minutePart === '*' ? [0] : minutePart.split(',').map(m => parseInt(m, 10)).filter(n => !isNaN(n));
    const targetHours = hourPart === '*' ? Array.from({ length: 24 }, (_, i) => i) : hourPart.split(',').map(h => parseInt(h, 10)).filter(n => !isNaN(n));

    if (targetHours.length > 0 && targetMinutes.length > 0) {
      const now = new Date();
      const candidates = [];

      // Check today and tomorrow
      for (let dayOffset = 0; dayOffset <= 2; dayOffset++) {
        for (const h of targetHours) {
          for (const m of targetMinutes) {
            const candidate = new Date(now);
            candidate.setDate(candidate.getDate() + dayOffset);
            candidate.setHours(h, m, 0, 0);

            if (candidate.getTime() > now.getTime()) {
              candidates.push(candidate);
            }
          }
        }
      }

      candidates.sort((a, b) => a.getTime() - b.getTime());
      if (candidates.length > 0) {
        return candidates[0].toISOString();
      }
    }
  }

  // Fallback: estimate 8 hours from now
  const fallback = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return fallback.toISOString();
}

function getSchedulerStatus() {
  return {
    active: scheduledTask !== null,
    expression: currentCronExpression,
    timezone: process.env.CRON_TIMEZONE || 'UTC',
    nextRun: getNextScheduledTime(),
  };
}

module.exports = {
  initScheduler,
  getSchedulerStatus,
  DEFAULT_CRON_SCHEDULE,
};
