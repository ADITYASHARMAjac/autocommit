/**
 * Render Web Service Server
 * Provides Web Dashboard, Health Checks, API Endpoints, and runs background Scheduler
 */
require('dotenv').config();

const path = require('path');
const express = require('express');
const { commitAgent } = require('./commitAgent');
const { initScheduler, getSchedulerStatus } = require('./scheduler');
const { getLogs, addLog } = require('./logger');
const { DEFAULT_MODEL } = require('./aiService');
const { resolveGitIdentity, maskEmail } = require('./githubService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Root route serves dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Health check endpoint for Render and UptimeRobot keep-alive
app.get('/health', (req, res) => {
  const scheduler = getSchedulerStatus();
  const agent = commitAgent.getStatus();

  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    totalCommits: agent.totalCommits,
    nextScheduledRun: scheduler.nextRun,
    schedulerActive: scheduler.active,
  });
});

// API Status endpoint for dashboard telemetry
app.get('/api/status', async (req, res) => {
  const agentStatus = commitAgent.getStatus();
  const schedulerStatus = getSchedulerStatus();

  const apiKey = 
    process.env.NEMOTRON_API_KEY || 
    process.env.NEMOTRON3_API_KEY || 
    process.env.NEMOTRON_ULTRA_API_KEY || 
    process.env.AI_API_KEY || 
    process.env.NVIDIA_API_KEY;
  const githubToken = process.env.GITHUB_TOKEN;
  const githubRepo = process.env.GITHUB_REPO;

  let gitIdentity = { name: 'ADITYASHARMAjac', email: null };
  try {
    const owner = githubRepo ? githubRepo.split('/')[0] : 'ADITYASHARMAjac';
    gitIdentity = await resolveGitIdentity(githubToken, owner);
  } catch (_) {
    // Non-fatal if offline
  }

  const configHealth = {
    ai: {
      isConfigured: !!apiKey,
      provider: 'NVIDIA Nemotron-3 Ultra',
      model: process.env.AI_MODEL || process.env.NEMOTRON_MODEL || DEFAULT_MODEL,
      status: apiKey ? 'Connected (Nemotron-3 Ultra)' : 'Missing NEMOTRON_API_KEY (Using Fallback Generator)',
    },
    github: {
      isConfigured: !!(githubToken && githubRepo),
      repo: githubRepo || 'Not configured',
      branch: process.env.GITHUB_BRANCH || 'main',
      targetFile: process.env.TARGET_FILE_PATH || 'daily-log.md',
      status: (githubToken && githubRepo) ? 'Ready to Commit' : 'Missing GITHUB_TOKEN or GITHUB_REPO',
      authorName: gitIdentity.name,
      authorEmailMasked: gitIdentity.email ? maskEmail(gitIdentity.email) : null,
      isAttributionConfigured: !!(gitIdentity.name && gitIdentity.email),
    },
    schedule: {
      expression: schedulerStatus.expression,
      timezone: schedulerStatus.timezone,
      nextRun: schedulerStatus.nextRun,
      description: '3 times daily (Runs every 8 hours: 09:00, 14:00, 20:00)',
    },
  };

  res.json({
    agent: agentStatus,
    scheduler: schedulerStatus,
    config: configHealth,
    history: commitAgent.getHistory(15),
  });
});

// Trigger commit cycle manually
app.post('/api/trigger', async (req, res) => {
  addLog('INFO', 'Manual trigger received via dashboard API');
  try {
    const result = await commitAgent.executeCycle('manual-ui');
    res.json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// Retrieve system logs
app.get('/api/logs', (req, res) => {
  res.json(getLogs(40));
});

// Start listening and initialize scheduler
app.listen(PORT, '0.0.0.0', async () => {
  addLog('SUCCESS', `Auto-Commit Agent server listening on port ${PORT}`);
  addLog('INFO', `Render Web Service Ready: http://0.0.0.0:${PORT}`);
  
  // Auto-configure Git runtime & log attribution
  try {
    const repoInput = process.env.GITHUB_REPO;
    const owner = repoInput ? repoInput.split('/')[0] : 'ADITYASHARMAjac';
    const identity = await resolveGitIdentity(process.env.GITHUB_TOKEN, owner);
    if (identity.email) {
      addLog('SUCCESS', `Git Author Attribution configured: ${identity.name} <${maskEmail(identity.email)}>`);
    } else {
      addLog('WARN', 'Git Author Email not set. Set GIT_AUTHOR_EMAIL in Render Dashboard for contribution heatmap attribution.');
    }
  } catch (err) {
    addLog('WARN', `Git identity initialization notice: ${err.message}`);
  }

  // Start the 3x daily cron scheduler
  initScheduler();
});

module.exports = app;
