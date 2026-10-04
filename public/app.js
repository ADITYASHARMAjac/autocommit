/**
 * AutoCommit Agent Frontend Controller
 * Handles real-time polling, countdown timers, manual trigger execution, and telemetry UI
 */

let nextRunTarget = null;
let serverStartTime = Date.now();
let isTriggering = false;

// DOM Elements
const agentStatusPill = document.getElementById('agentStatusPill');
const agentStatusText = document.getElementById('agentStatusText');
const manualTriggerBtn = document.getElementById('manualTriggerBtn');
const triggerSpinner = document.getElementById('triggerSpinner');
const nextRunCountdown = document.getElementById('nextRunCountdown');
const nextRunDetail = document.getElementById('nextRunDetail');
const totalCommitsCount = document.getElementById('totalCommitsCount');
const lastCommitDetail = document.getElementById('lastCommitDetail');
const targetBranchDisplay = document.getElementById('targetBranchDisplay');
const aiModelDisplay = document.getElementById('aiModelDisplay');
const aiKeyStatus = document.getElementById('aiKeyStatus');
const serverUptime = document.getElementById('serverUptime');
const latestResultBody = document.getElementById('latestResultBody');
const latestMetaPill = document.getElementById('latestMetaPill');
const latestResultFooter = document.getElementById('latestResultFooter');
const viewOnGithubBtn = document.getElementById('viewOnGithubBtn');
const historyListContainer = document.getElementById('historyListContainer');
const terminalLogsContainer = document.getElementById('terminalLogsContainer');

// Checklist Elements
const configOverallBadge = document.getElementById('configOverallBadge');
const itemAiKey = document.getElementById('itemAiKey');
const descAiKey = document.getElementById('descAiKey');
const itemGhToken = document.getElementById('itemGhToken');
const descGhToken = document.getElementById('descGhToken');

/**
 * Initializes the dashboard
 */
async function initDashboard() {
  await fetchStatus();
  await fetchLogs();

  // Set up intervals
  setInterval(fetchStatus, 6000);
  setInterval(fetchLogs, 8000);
  setInterval(updateCountdown, 1000);
  setInterval(updateUptime, 1000);

  // Event Listeners
  manualTriggerBtn.addEventListener('click', handleManualTrigger);
  document.getElementById('refreshHistoryBtn').addEventListener('click', fetchStatus);
  document.getElementById('refreshLogsBtn').addEventListener('click', fetchLogs);
}

/**
 * Fetches agent status and updates dashboard cards
 */
async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) throw new Error('Status endpoint failed');
    const data = await res.json();

    updateMetrics(data);
    updateChecklist(data.config);
    updateHistory(data.history);

    if (data.agent.lastResult && (!latestResultBody.dataset.lastId || latestResultBody.dataset.lastId !== data.agent.lastResult.id)) {
      renderLatestResult(data.agent.lastResult);
    }
  } catch (err) {
    console.error('Failed to poll status:', err);
    agentStatusText.textContent = 'Offline';
    agentStatusPill.style.borderColor = 'rgba(244, 63, 94, 0.4)';
  }
}

/**
 * Updates UI metrics from status payload
 */
function updateMetrics(data) {
  const { agent, scheduler, config } = data;

  // Status Pill
  if (agent.isRunning) {
    agentStatusText.textContent = 'Executing Cycle...';
    agentStatusPill.style.borderColor = 'rgba(0, 242, 254, 0.5)';
  } else {
    agentStatusText.textContent = 'Active (3x Daily)';
    agentStatusPill.style.borderColor = 'rgba(16, 185, 129, 0.4)';
  }

  // Next Run Target
  if (scheduler.nextRun) {
    nextRunTarget = new Date(scheduler.nextRun);
    nextRunDetail.textContent = `Scheduled at: ${nextRunTarget.toLocaleTimeString()} (${scheduler.timezone})`;
  }

  // Total Commits
  totalCommitsCount.textContent = agent.totalCommits;
  if (agent.lastRunTime) {
    const lastDate = new Date(agent.lastRunTime);
    lastCommitDetail.textContent = `Last run: ${timeAgo(lastDate)}`;
  } else {
    lastCommitDetail.textContent = 'Awaiting first run';
  }

  targetBranchDisplay.textContent = `Target: ${config.github.branch || 'main'} (${config.github.targetFile || 'daily-log.md'})`;

  // AI Engine
  aiModelDisplay.textContent = config.ai.model?.split('/').pop() || 'Nemotron-3 Ultra';
  aiKeyStatus.textContent = config.ai.isConfigured ? '✓ Nemotron-3 Ultra Connected' : '⚠ Fallback Generator Active';

  // Server Uptime anchor
  if (agent.uptimeSeconds) {
    serverStartTime = Date.now() - (agent.uptimeSeconds * 1000);
  }
}

/**
 * Updates Configuration Checklist
 */
function updateChecklist(config) {
  if (!config) return;

  // AI Key Check
  const aiIcon = itemAiKey.querySelector('.check-icon');
  if (config.ai.isConfigured) {
    aiIcon.className = 'check-icon status-ok';
    descAiKey.textContent = `Nemotron-3 Ultra Connected (${config.ai.model})`;
  } else {
    aiIcon.className = 'check-icon status-warn';
    descAiKey.textContent = 'NEMOTRON_API_KEY missing - Set in Render env';
  }

  // GitHub Check
  const ghIcon = itemGhToken.querySelector('.check-icon');
  if (config.github.isConfigured) {
    ghIcon.className = 'check-icon status-ok';
    descGhToken.textContent = `Push target: ${config.github.repo} (${config.github.branch})`;
  } else {
    ghIcon.className = 'check-icon status-warn';
    descGhToken.textContent = 'GITHUB_TOKEN or GITHUB_REPO missing';
  }

  // Overall Badge
  if (config.ai.isConfigured && config.github.isConfigured) {
    configOverallBadge.textContent = 'Production Ready';
    configOverallBadge.className = 'status-chip chip-green';
  } else {
    configOverallBadge.textContent = 'Configuration Needed';
    configOverallBadge.className = 'status-chip chip-amber';
  }
}

/**
 * Handles manual trigger button click
 */
async function handleManualTrigger() {
  if (isTriggering) return;
  isTriggering = true;

  manualTriggerBtn.disabled = true;
  triggerSpinner.classList.remove('hidden');
  const btnText = manualTriggerBtn.querySelector('.btn-text');
  btnText.textContent = 'Generating 5 Lines & Pushing...';

  try {
    const res = await fetch('/api/trigger', { method: 'POST' });
    const result = await res.json();

    renderLatestResult(result);
    await fetchStatus();
    await fetchLogs();
  } catch (err) {
    console.error('Trigger failed:', err);
    alert('Execution failed: ' + err.message);
  } finally {
    isTriggering = false;
    manualTriggerBtn.disabled = false;
    triggerSpinner.classList.add('hidden');
    btnText.textContent = 'Commit & Push Now';
  }
}

/**
 * Renders the latest 5 lines and commit status
 */
function renderLatestResult(result) {
  if (!result || !result.lines) return;

  latestResultBody.dataset.lastId = result.id;

  if (result.success) {
    latestMetaPill.textContent = `✓ Pushed to GitHub (${result.commitSha?.substring(0, 7) || 'OK'})`;
    latestMetaPill.className = 'tag-pill tag-success';
  } else if (result.dryRun) {
    latestMetaPill.textContent = '⚠ Dry-Run (GitHub Token Not Set)';
    latestMetaPill.className = 'tag-pill tag-warn';
  } else {
    latestMetaPill.textContent = '✕ Error in Push';
    latestMetaPill.className = 'tag-pill tag-warn';
  }

  const linesHtml = result.lines.map((line, idx) => `
    <div class="line-item">
      <span class="line-num">L${idx + 1}</span>
      <span class="line-text">${escapeHtml(line)}</span>
    </div>
  `).join('');

  latestResultBody.innerHTML = `<div class="lines-container">${linesHtml}</div>`;

  if (result.commitUrl) {
    viewOnGithubBtn.href = result.commitUrl;
    latestResultFooter.classList.remove('hidden');
  } else {
    latestResultFooter.classList.add('hidden');
  }
}

/**
 * Updates commit history list
 */
function updateHistory(history) {
  if (!history || history.length === 0) {
    historyListContainer.innerHTML = `
      <div class="empty-state" style="padding: 16px;">
        <p class="empty-subtitle">No history records yet. Trigger your first commit!</p>
      </div>`;
    return;
  }

  historyListContainer.innerHTML = history.map(item => {
    const isSuccess = item.success;
    const timeFormatted = timeAgo(new Date(item.timestamp));
    const linesPreview = item.lines ? `${item.lines.length} AI lines` : '5 lines';

    return `
      <div class="history-item">
        <div class="history-left">
          <div class="history-status-icon ${isSuccess ? 'icon-success' : 'icon-dry'}">
            ${isSuccess ? '✓' : '⚡'}
          </div>
          <div class="history-info">
            <div class="history-title">${isSuccess ? 'Committed & Pushed' : (item.dryRun ? 'Dry-Run Generated' : 'Run Attempted')}</div>
            <div class="history-meta">
              <span>${linesPreview}</span>
              <span>•</span>
              <span class="history-time">${timeFormatted}</span>
              ${item.commitSha ? `<span>•</span><span class="history-sha">${item.commitSha.substring(0, 7)}</span>` : ''}
            </div>
          </div>
        </div>
        ${item.commitUrl ? `
          <div class="history-action">
            <a href="${item.commitUrl}" target="_blank" rel="noopener noreferrer">
              <span>View</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
            </a>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

/**
 * Fetches real-time log lines for terminal feed
 */
async function fetchLogs() {
  try {
    const res = await fetch('/api/logs');
    if (!res.ok) return;
    const logs = await res.json();

    if (!logs || logs.length === 0) return;

    terminalLogsContainer.innerHTML = logs.map(l => {
      let colorClass = 'log-info';
      if (l.level === 'SUCCESS') colorClass = 'log-success';
      if (l.level === 'WARN') colorClass = 'log-warn';
      if (l.level === 'ERROR') colorClass = 'log-error';

      const time = l.timestamp.split('T')[1].substring(0, 8);
      return `<div class="log-line ${colorClass}">[${time}] [${l.level}] ${escapeHtml(l.message)}</div>`;
    }).join('');
  } catch (e) {
    console.warn('Log fetch failed', e);
  }
}

/**
 * Computes countdown to next scheduled execution
 */
function updateCountdown() {
  if (!nextRunTarget) return;

  const now = new Date();
  const diff = nextRunTarget.getTime() - now.getTime();

  if (diff <= 0) {
    nextRunCountdown.textContent = 'RUNNING...';
    return;
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  nextRunCountdown.textContent = 
    `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Uptime counter
 */
function updateUptime() {
  const diffSec = Math.floor((Date.now() - serverStartTime) / 1000);
  const hours = Math.floor(diffSec / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);
  const secs = diffSec % 60;

  serverUptime.textContent = `${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
}

/**
 * Relative time helper
 */
function timeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function escapeHtml(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

// Start
initDashboard();
