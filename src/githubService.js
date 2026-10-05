/**
 * GitHub Service for committing and pushing 5 lines directly via GitHub REST API
 * Optimized for container/Render hosting with zero local git storage requirements.
 */
const { execSync } = require('child_process');
const { addLog } = require('./logger');

let cachedGitIdentity = null;
let lastEnvSignature = '';

/**
 * Masks email address for display in logs and telemetry
 */
function maskEmail(email) {
  if (!email || typeof email !== 'string') return '';
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  const name = parts[0];
  const domain = parts[1];
  const maskedName = name.length > 3 ? `${name.substring(0, 3)}***` : `${name.substring(0, 1)}***`;
  return `${maskedName}@${domain}`;
}

/**
 * Configures git globally inside the runtime container if git CLI is present
 */
function applyGitConfig(name, email) {
  try {
    if (name) {
      execSync(`git config --global user.name "${name.replace(/"/g, '\\"')}"`, { stdio: 'ignore' });
    }
    if (email) {
      execSync(`git config --global user.email "${email.replace(/"/g, '\\"')}"`, { stdio: 'ignore' });
    }
    return true;
  } catch (_) {
    // Non-fatal if git CLI is absent or filesystem is read-only
    return false;
  }
}

/**
 * Resolves Git author and committer identity.
 * Prioritizes Render environment variables, falling back to GitHub token user discovery.
 */
async function resolveGitIdentity(token, owner) {
  const envName = process.env.GIT_AUTHOR_NAME || process.env.COMMITTER_NAME || process.env.GITHUB_USER;
  const envEmail = process.env.GIT_AUTHOR_EMAIL || process.env.COMMITTER_EMAIL || process.env.GITHUB_EMAIL;
  const currentSignature = `${envName || ''}:${envEmail || ''}:${token ? 'hasToken' : 'noToken'}:${owner || ''}`;

  if (cachedGitIdentity && lastEnvSignature === currentSignature) {
    return cachedGitIdentity;
  }

  let name = envName;
  let email = envEmail;

  if (!name && owner) {
    name = owner;
  }

  // If email or name is missing, attempt to auto-fetch the authenticated user profile via GitHub API
  if (token && (!name || !email)) {
    try {
      const headers = {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'AutoCommit-Agent-Service',
      };

      const userRes = await fetch('https://api.github.com/user', { headers });
      if (userRes.ok) {
        const userData = await userRes.json();
        if (!name) {
          name = userData.name || userData.login;
        }
        if (!email && userData.email) {
          email = userData.email;
        }
      }

      // If email is still missing (e.g. email set to private in GitHub profile), check /user/emails
      if (!email) {
        const emailsRes = await fetch('https://api.github.com/user/emails', { headers });
        if (emailsRes.ok) {
          const emails = await emailsRes.json();
          if (Array.isArray(emails) && emails.length > 0) {
            const primary = emails.find(e => e.primary && e.verified) || emails.find(e => e.verified) || emails[0];
            if (primary && primary.email) {
              email = primary.email;
            }
          }
        }
      }
    } catch (err) {
      addLog('WARN', `Could not auto-fetch GitHub user email: ${err.message}`);
    }
  }

  // Fallback default name if still empty
  if (!name) {
    name = 'ADITYASHARMAjac';
  }

  // Ensure git CLI in container environment matches this identity
  applyGitConfig(name, email);

  cachedGitIdentity = { name, email: email || null };
  lastEnvSignature = currentSignature;
  return cachedGitIdentity;
}

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

  // Resolve author & committer identity
  const identity = await resolveGitIdentity(token, owner);
  const authorName = identity.name;
  const authorEmail = identity.email;
  const committerName = process.env.GIT_COMMITTER_NAME || process.env.COMMITTER_NAME || authorName;
  const committerEmail = process.env.GIT_COMMITTER_EMAIL || process.env.COMMITTER_EMAIL || authorEmail;

  if (authorEmail) {
    addLog('INFO', `Git attribution configured: ${authorName} <${maskEmail(authorEmail)}>`);
  } else {
    addLog('WARN', 'Git author email missing! Set GIT_AUTHOR_EMAIL in Render Dashboard to ensure commits appear on your GitHub contribution graph.');
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
    };

    // Explicitly configure author and committer so GitHub links the commit to the user account
    if (authorName && authorEmail) {
      putBody.author = {
        name: authorName,
        email: authorEmail,
      };
    }

    if (committerName && committerEmail) {
      putBody.committer = {
        name: committerName,
        email: committerEmail,
      };
    }

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

    addLog('SUCCESS', `Pushed commit to ${owner}/${repo} (${commitSha?.substring(0, 7)}) attributed to ${authorName}`, {
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
      author: authorName,
      authorEmail: authorEmail ? maskEmail(authorEmail) : null,
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
  const targetBranch = process.env.GITHUB_BRANCH || 'main';
  const { owner, repo } = parseRepo(repoInput);

  if (!token || !owner || !repo) {
    return {
      configured: false,
      message: 'GITHUB_TOKEN or GITHUB_REPO not configured in environment',
    };
  }

  try {
    const identity = await resolveGitIdentity(token, owner);

    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'AutoCommit-Agent-Service',
      },
    });

    if (res.status === 200) {
      const data = await res.json();
      const isDefaultBranch = targetBranch === data.default_branch;
      return {
        configured: true,
        valid: true,
        repoFullName: data.full_name,
        isPrivate: data.private,
        defaultBranch: data.default_branch,
        targetBranch,
        isDefaultBranch,
        authorName: identity.name,
        authorEmailMasked: identity.email ? maskEmail(identity.email) : null,
        isAttributionConfigured: !!(identity.name && identity.email),
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
  resolveGitIdentity,
  applyGitConfig,
  maskEmail,
  parseRepo,
};
