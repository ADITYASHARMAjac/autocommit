/**
 * GitHub Service for committing and pushing 5 lines directly via GitHub REST API
 * Optimized for container/Render hosting with zero local git storage requirements.
 */
const { addLog } = require('./logger');

/**
 * Parses repo string into owner and repo name
 */
function parseRepo(repoString) {
  if (!repoString) return { owner: null, repo: null };
  const parts = repoString.trim().split('/');
  if (parts.length >= 2) {
    return { owner: parts[0], repo: parts[1] };
  }
  return { owner: null, repo: repoString };
}

/**
 * Commits and pushes 5 lines to the specified GitHub repository and file
 */
async function commitAndPushLines(lines, options = {}) {
  const token = process.env.GITHUB_TOKEN;
  const repoInput = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';
  const filePath = process.env.TARGET_FILE_PATH || 'daily-log.md';
  const committerName = process.env.COMMITTER_NAME || 'AutoCommit Agent';
  const committerEmail = process.env.COMMITTER_EMAIL || 'agent@autocommit.local';

  const { owner, repo } = parseRepo(repoInput);

  if (!token || !owner || !repo) {
    const missing = [];
    if (!token) missing.push('GITHUB_TOKEN');
    if (!owner || !repo) missing.push('GITHUB_REPO (e.g. username/repo-name)');
    const errorMsg = `GitHub credentials missing: ${missing.join(', ')}`;
    addLog('WARN', `${errorMsg}. Dry-run completed (not pushed).`);
    return {
      success: false,
      dryRun: true,
      reason: errorMsg,
      lines,
      filePath,
      branch,
    };
  }

  const cleanFilePath = filePath.replace(/^\//, '');
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${cleanFilePath}`;

  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'Authorization': `Bearer ${token}`,
    'User-Agent': 'AutoCommit-Agent-Service',
    'Content-Type': 'application/json',
  };

  try {
    addLog('INFO', `Checking target file '${cleanFilePath}' in ${owner}/${repo} on branch '${branch}'...`);

    // 1. Fetch current file content and SHA if it exists
    let existingContent = '';
    let existingSha = null;

    const getRes = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, {
      method: 'GET',
      headers,
    });

    if (getRes.status === 200) {
      const fileData = await getRes.json();
      existingSha = fileData.sha;
      if (fileData.content) {
        // GitHub API base64 has newlines, strip them before decoding
        existingContent = Buffer.from(fileData.content.replace(/\n/g, ''), 'base64').toString('utf-8');
      }
    } else if (getRes.status === 404) {
      addLog('INFO', `File '${cleanFilePath}' does not exist yet. It will be initialized.`);
    } else {
      const errText = await getRes.text();
      throw new Error(`Failed to check file (HTTP ${getRes.status}): ${errText}`);
    }

    // 2. Prepare the new content
    const now = new Date();
    const timestampStr = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    const dateFormatted = now.toISOString().split('T')[0];

    const linesFormatted = lines.map((l, idx) => `${idx + 1}. ${l}`).join('\n');
    const entryBlock = `\n### 🚀 [${timestampStr}] Auto-Commit Entry\n${linesFormatted}\n`;

    let finalContent = existingContent;
    if (!existingContent || existingContent.trim().length === 0) {
      finalContent = `# 📝 Automated Activity Log\n> Maintained by AutoCommit Agent on Render\n${entryBlock}`;
    } else {
      finalContent = existingContent.trimEnd() + '\n' + entryBlock;
    }

    const base64Content = Buffer.from(finalContent, 'utf-8').toString('base64');
    const commitMessage = options.commitMessage || `chore(log): auto-commit 5 lines [${dateFormatted}]`;

    // 3. Commit and push via GitHub Contents API
    addLog('INFO', `Committing and pushing to GitHub (${owner}/${repo}@${branch})...`);

    const putBody = {
      message: commitMessage,
      content: base64Content,
      branch: branch,
      committer: {
        name: committerName,
        email: committerEmail,
      },
    };

    if (existingSha) {
      putBody.sha = existingSha;
    }

    let putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify(putBody),
    });

    // If failed on a brand-new empty repository (0 commits, branch ref not created yet),
    // retry creating the root commit without specifying a branch to let GitHub initialize the default branch
    if (!putRes.ok && !existingSha && putBody.branch) {
      addLog('INFO', `Branch '${branch}' not found yet. Attempting root commit to initialize empty repository...`);
      const rootBody = { ...putBody };
      delete rootBody.branch;

      const retryRes = await fetch(apiUrl, {
        method: 'PUT',
        headers,
        body: JSON.stringify(rootBody),
      });

      if (retryRes.ok) {
        putRes = retryRes;
        addLog('SUCCESS', `Successfully initialized empty repository with root commit!`);
      }
    }

    if (!putRes.ok) {
      const errBody = await putRes.text();
      throw new Error(`GitHub API commit failed (HTTP ${putRes.status}): ${errBody}`);
    }

    const putData = await putRes.json();
    const commitSha = putData.commit?.sha;
    const commitUrl = putData.commit?.html_url || `https://github.com/${owner}/${repo}/commit/${commitSha}`;

    addLog('SUCCESS', `Pushed commit to ${owner}/${repo} (${commitSha?.substring(0, 7)})`, {
      commitUrl,
      linesCount: lines.length,
    });

    return {
      success: true,
      dryRun: false,
      commitSha,
      commitUrl,
      filePath: cleanFilePath,
      branch,
      repo: `${owner}/${repo}`,
      timestamp: timestampStr,
      lines,
    };
  } catch (error) {
    addLog('ERROR', `GitHub Push failed: ${error.message}`);
    throw error;
  }
}

/**
 * Validates connection to GitHub API with current token and repo
 */
async function testGitHubConnection() {
  const token = process.env.GITHUB_TOKEN;
  const repoInput = process.env.GITHUB_REPO;
  const { owner, repo } = parseRepo(repoInput);

  if (!token || !owner || !repo) {
    return {
      configured: false,
      message: 'GITHUB_TOKEN or GITHUB_REPO not configured in environment',
    };
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'AutoCommit-Agent-Service',
      },
    });

    if (res.status === 200) {
      const data = await res.json();
      return {
        configured: true,
        valid: true,
        repoFullName: data.full_name,
        isPrivate: data.private,
        defaultBranch: data.default_branch,
      };
    } else {
      const err = await res.json();
      return {
        configured: true,
        valid: false,
        status: res.status,
        message: err.message || 'Failed to authenticate with GitHub',
      };
    }
  } catch (error) {
    return {
      configured: true,
      valid: false,
      message: error.message,
    };
  }
}

module.exports = {
  commitAndPushLines,
  testGitHubConnection,
  parseRepo,
};
