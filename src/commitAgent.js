/**
 * Commit Agent Coordinator
 * Orchestrates AI generation -> GitHub commit & push -> Metrics & Telemetry
 */
const { generateFiveLines } = require('./aiService');
const { commitAndPushLines } = require('./githubService');
const { addLog } = require('./logger');

class CommitAgent {
  constructor() {
    this.totalCommits = 0;
    this.lastRunTime = null;
    this.lastResult = null;
    this.isRunning = false;
    this.history = [];
    this.startTime = new Date().toISOString();
  }

  /**
   * Executes one full auto-commit cycle
   * @param {string} triggerSource - 'scheduled' | 'manual'
   */
  async executeCycle(triggerSource = 'manual') {
    if (this.isRunning) {
      addLog('WARN', `Agent cycle already in progress. Skipping trigger (${triggerSource}).`);
      return {
        status: 'skipped',
        message: 'Cycle already in progress',
      };
    }

    this.isRunning = true;
    const cycleStart = Date.now();
    addLog('INFO', `Starting Auto-Commit cycle [Trigger: ${triggerSource}]`);

    try {
      // 1. Generate 5 lines using AI (NVIDIA Nemotron or fallback)
      const lines = await generateFiveLines();

      // 2. Commit and push to target GitHub repository
      const commitResult = await commitAndPushLines(lines, {
        commitMessage: `chore(daily-log): update 5 AI lines [trigger: ${triggerSource}]`,
      });

      const durationMs = Date.now() - cycleStart;
      this.lastRunTime = new Date().toISOString();

      if (commitResult.success) {
        this.totalCommits += 1;
      }

      const cycleSummary = {
        id: 'cycle-' + Date.now(),
        timestamp: this.lastRunTime,
        durationMs,
        triggerSource,
        success: commitResult.success,
        dryRun: commitResult.dryRun || false,
        reason: commitResult.reason || null,
        commitSha: commitResult.commitSha || null,
        commitUrl: commitResult.commitUrl || null,
        filePath: commitResult.filePath,
        branch: commitResult.branch,
        repo: commitResult.repo,
        lines: lines,
      };

      this.lastResult = cycleSummary;
      this.history.unshift(cycleSummary);
      if (this.history.length > 30) {
        this.history.pop();
      }

      addLog(
        commitResult.success ? 'SUCCESS' : 'WARN',
        `Auto-Commit cycle finished in ${durationMs}ms: ${
          commitResult.success
            ? `Pushed to GitHub (${commitResult.commitSha?.substring(0, 7)})`
            : commitResult.reason || 'Dry run completed'
        }`
      );

      return cycleSummary;
    } catch (error) {
      addLog('ERROR', `Auto-Commit cycle encountered fatal error: ${error.message}`);
      const failureSummary = {
        id: 'cycle-' + Date.now(),
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - cycleStart,
        triggerSource,
        success: false,
        error: error.message,
      };
      this.lastResult = failureSummary;
      return failureSummary;
    } finally {
      this.isRunning = false;
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      totalCommits: this.totalCommits,
      lastRunTime: this.lastRunTime,
      lastResult: this.lastResult,
      uptimeSeconds: Math.floor(process.uptime()),
      startTime: this.startTime,
      historyCount: this.history.length,
    };
  }

  getHistory(limit = 10) {
    return this.history.slice(0, limit);
  }
}

const agentInstance = new CommitAgent();

module.exports = {
  commitAgent: agentInstance,
};
