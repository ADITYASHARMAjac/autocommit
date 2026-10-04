/**
 * In-memory circular buffer logger for tracking agent activity and displaying in dashboard
 */
const logs = [];
const MAX_LOGS = 100;

function addLog(level, message, meta = null) {
  const entry = {
    id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(), // INFO, SUCCESS, WARN, ERROR
    message,
    meta,
  };

  logs.unshift(entry);
  if (logs.length > MAX_LOGS) {
    logs.pop();
  }

  const prefix = `[${entry.timestamp}] [${entry.level}]`;
  if (level === 'ERROR') {
    console.error(prefix, message, meta || '');
  } else if (level === 'WARN') {
    console.warn(prefix, message, meta || '');
  } else {
    console.log(prefix, message, meta || '');
  }

  return entry;
}

function getLogs(limit = 50) {
  return logs.slice(0, limit);
}

module.exports = {
  addLog,
  getLogs,
};
