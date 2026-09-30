/**
 * CBE Management System — GitHub Deployer Service (Deployment Layer)
 *
 * Implements safe, rate-limit resilient single-tree deployment to GitHub
 * via Git Data API while preserving application/APK source integrity.
 */

export interface DeploymentFile {
  path: string;
  content: string; // UTF-8 text string or base64 string for binary files
  isBinary?: boolean;
}

export interface DeployOptions {
  owner: string;
  repo: string;
  branch?: string;
  files: DeploymentFile[];
  commitMessage?: string;
  githubToken?: string;
  fetchFn?: typeof fetch;
  delayMsBetweenBlobs?: number;
}

export interface DeployResult {
  success: boolean;
  prevCommitSha?: string;
  newCommitSha?: string;
  treeSha?: string;
  filesProcessed: number;
  blobsCreatedSequentially: number;
  rateLimitHitsHandled: number;
  message: string;
}

// System Invocation Lock State
let isDeploymentInProgress = false;

/**
 * Gets the current lock status.
 */
export function isDeploying(): boolean {
  return isDeploymentInProgress;
}

/**
 * Resets the deployment lock (mainly for testing hygiene).
 */
export function resetDeploymentLock(): void {
  isDeploymentInProgress = false;
}

/**
 * Helper to pause execution for a given duration.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Inspects response headers or status for secondary rate limit signals.
 */
export function parseRetryAfterSeconds(headers?: Headers, bodyText?: string): number {
  if (headers) {
    const retryHeader = headers.get('Retry-After');
    if (retryHeader) {
      const parsed = parseInt(retryHeader, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        return parsed;
      }
    }
  }
  // Secondary rate limit default fallback delay (in seconds)
  return 60;
}

/**
 * Safe fetch wrapper handling GitHub secondary rate limits with bounded retries.
 */
export async function fetchWithSecondaryRateLimit(
  url: string,
  options: RequestInit,
  fetchFn: typeof fetch = fetch,
  maxRetries = 2
): Promise<Response> {
  let attempt = 0;
  let rateLimitHits = 0;

  while (attempt <= maxRetries) {
    const response = await fetchFn(url, options);

    if (response.status === 403 || response.status === 429) {
      const text = await response.clone().text().catch(() => '');
      const isSecondaryLimit =
        response.status === 429 ||
        text.toLowerCase().includes('secondary rate limit') ||
        text.toLowerCase().includes('exceeded a secondary rate limit') ||
        text.toLowerCase().includes('secondary rate limit hit');

      if (isSecondaryLimit) {
        if (attempt < maxRetries) {
          attempt++;
          rateLimitHits++;
          const waitSec = parseRetryAfterSeconds(response.headers, text);
          const backoffMs = Math.min(waitSec * 1000, 60000) + Math.random() * 500;
          console.warn(
            `[GitHub Deployer] Secondary rate limit (403/429) encountered on attempt ${attempt}. Pausing ${Math.round(backoffMs)}ms before retry.`
          );
          await sleep(backoffMs);
          continue;
        } else {
          break;
        }
      }
    }

    return response;
  }

  throw new Error(`Exceeded maximum rate-limit retries (${maxRetries}) for URL: ${url}`);
}

/**
 * Primary Git Data API Deployer.
 * Executes single-tree deployment with sequential binary blob creation.
 */
export async function executeGitHubDeployment(opts: DeployOptions): Promise<DeployResult> {
  if (isDeploymentInProgress) {
    throw new Error('DEPLOYMENT_LOCKED: A deployment operation is already in progress.');
  }

  const {
    owner,
    repo,
    branch = 'main',
    files,
    commitMessage = 'Deploy complete application update',
    githubToken = process.env.GITHUB_TOKEN || '',
    fetchFn = fetch,
    delayMsBetweenBlobs = 250,
  } = opts;

  isDeploymentInProgress = true;
  let rateLimitHitsHandled = 0;
  let blobsCreatedSequentially = 0;

  try {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      ...(githubToken ? { Authorization: `token ${githubToken}` } : {}),
    };

    // 1. Repository Existence Check
    const repoRes = await fetchWithSecondaryRateLimit(
      `https://api.github.com/repos/${owner}/${repo}`,
      { headers },
      fetchFn
    );
    if (!repoRes.ok) {
      throw new Error(`Repository check failed (${repoRes.status}): ${await repoRes.text()}`);
    }

    // 2. Branch Reference Lookup
    const refRes = await fetchWithSecondaryRateLimit(
      `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`,
      { headers },
      fetchFn
    );
    if (!refRes.ok) {
      throw new Error(`Branch ref lookup failed (${refRes.status}): ${await refRes.text()}`);
    }
    const refData = await refRes.json();
    const prevCommitSha = refData.object.sha;

    // 3. Parent Commit Lookup for base_tree SHA
    const commitRes = await fetchWithSecondaryRateLimit(
      `https://api.github.com/repos/${owner}/${repo}/git/commits/${prevCommitSha}`,
      { headers },
      fetchFn
    );
    if (!commitRes.ok) {
      throw new Error(`Commit lookup failed (${commitRes.status}): ${await commitRes.text()}`);
    }
    const commitData = await commitRes.json();
    const baseTreeSha = commitData.tree.sha;

    // 4. Sequential Binary Blob Uploads
    // Normal text files are inlined directly into tree nodes. Binary files are posted 1-by-1 sequentially.
    const treeItems: Array<{ path: string; mode: string; type: string; content?: string; sha?: string }> = [];

    for (const file of files) {
      // Use our safe local classification guard which takes precedence over caller-provided value
      const fileIsBinary = isBinaryContent(file.path, file.content);

      if (fileIsBinary) {
        // Create blob explicitly sequentially with delay
        const blobRes = await fetchWithSecondaryRateLimit(
          `https://api.github.com/repos/${owner}/${repo}/git/blobs`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              content: file.content,
              encoding: 'base64',
            }),
          },
          fetchFn
        );

        if (!blobRes.ok) {
          throw new Error(`Blob creation failed for ${file.path} (${blobRes.status}): ${await blobRes.text()}`);
        }

        const blobData = await blobRes.json();
        treeItems.push({
          path: file.path,
          mode: '100644',
          type: 'blob',
          sha: blobData.sha,
        });

        blobsCreatedSequentially++;
        if (delayMsBetweenBlobs > 0) {
          await sleep(delayMsBetweenBlobs);
        }
      } else {
        // Inlined text file
        // Ensure any base64 encoded text files are decoded to UTF-8 text for standard Git tree representation
        const textContent = getDecodedTextContent(file.content);
        treeItems.push({
          path: file.path,
          mode: '100644',
          type: 'blob',
          content: textContent,
        });
      }
    }

    // 5. Construct Single Git Tree payload with base_tree
    const treeRes = await fetchWithSecondaryRateLimit(
      `https://api.github.com/repos/${owner}/${repo}/git/trees`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          base_tree: baseTreeSha,
          tree: treeItems,
        }),
      },
      fetchFn
    );

    if (!treeRes.ok) {
      throw new Error(`Tree creation failed (${treeRes.status}): ${await treeRes.text()}`);
    }
    const treeData = await treeRes.json();
    const newTreeSha = treeData.sha;

    // 6. Create New Single Commit
    const newCommitRes = await fetchWithSecondaryRateLimit(
      `https://api.github.com/repos/${owner}/${repo}/git/commits`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: commitMessage,
          tree: newTreeSha,
          parents: [prevCommitSha],
        }),
      },
      fetchFn
    );

    if (!newCommitRes.ok) {
      throw new Error(`Commit creation failed (${newCommitRes.status}): ${await newCommitRes.text()}`);
    }
    const newCommitData = await newCommitRes.json();
    const newCommitSha = newCommitData.sha;

    // 7. Non-force Branch Pointer Update (`force: false`)
    const updateRefRes = await fetchWithSecondaryRateLimit(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          sha: newCommitSha,
          force: false,
        }),
      },
      fetchFn
    );

    if (!updateRefRes.ok) {
      throw new Error(`Ref update failed (${updateRefRes.status}): ${await updateRefRes.text()}`);
    }

    return {
      success: true,
      prevCommitSha,
      newCommitSha,
      treeSha: newTreeSha,
      filesProcessed: files.length,
      blobsCreatedSequentially,
      rateLimitHitsHandled,
      message: 'Deployment completed successfully via Git Data API.',
    };
  } finally {
    // Release system deployment lock in all cases
    isDeploymentInProgress = false;
  }
}

/**
 * Helper to check if a string consists strictly of printable ASCII/UTF-8 characters.
 */
function isPrintableText(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // Standard control characters are < 32, except tab (9), LF (10), CR (13)
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      return false;
    }
  }
  return true;
}

/**
 * Safely inspects a file path and content to determine if it is a binary file.
 */
export function isBinaryContent(path: string, content: string): boolean {
  if (!content) return false;

  // Byte-level check takes absolute precedence: if it contains a null byte, it is binary
  if (hasNullByte(content)) {
    return true;
  }

  const normalizedPath = path.toLowerCase();
  const filename = normalizedPath.split('/').pop() || '';
  const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '';

  // 1. Safe Text Extensions List
  const knownTextExtensions = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.json', '.xml', '.gradle',
    '.sh', '.py', '.md', '.css', '.html', '.yml', '.yaml',
    '.properties', '.toml', '.txt', '.sql', '.dockerignore',
    '.bat', '.gradlew', 'gradlew', 'dockerfile'
  ]);
  const knownTextFilenames = new Set([
    'gradlew', 'dockerfile', 'jenkinsfile', 'procfile', '.dockerignore'
  ]);

  if (knownTextFilenames.has(filename) || knownTextExtensions.has(ext)) {
    return false;
  }

  // 2. Known Binary Extensions List
  const knownBinaryExtensions = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.jar', '.zip', '.tar', '.gz',
    '.xls', '.xlsx', '.doc', '.docx', '.ppt', '.pptx', '.class', '.so', '.dll', '.exe'
  ]);

  if (knownBinaryExtensions.has(ext)) {
    // If it has a binary extension, but contains spaces (whitespace indicators), printable characters,
    // and NO null bytes, it is a misleading file (text under a binary extension)
    if (/\s/.test(content)) {
      const decoded = getDecodedTextContent(content);
      if (isPrintableText(decoded)) {
        return false; // Override to text
      }
    }
    return true;
  }

  // Fallback for ambiguous/unknown extensions without null bytes:
  // Check if it consists of printable text
  const decoded = getDecodedTextContent(content);
  return !isPrintableText(decoded);
}

/**
 * Checks if a string (either raw or base64 encoded) contains null bytes.
 */
function hasNullByte(content: string): boolean {
  if (!content) return false;

  // Try to parse as base64 first
  let decoded: string;
  try {
    const trimmed = content.trim();
    if (/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed) && trimmed.length % 4 === 0) {
      decoded = atob(trimmed);
    } else {
      decoded = content;
    }
  } catch {
    decoded = content;
  }

  return decoded.includes('\x00');
}

/**
 * Safely decodes base64 content to a UTF-8 text string if it is base64 encoded.
 */
export function getDecodedTextContent(content: string): string {
  if (!content) return '';
  const trimmed = content.trim();

  // If it contains characters that cannot appear in base64, it's raw text
  if (/[\s;{}()\[\]#]/.test(content)) {
    return content;
  }

  // If it matches base64 pattern (characters and length multiple of 4)
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed) && trimmed.length % 4 === 0) {
    try {
      const decoded = atob(trimmed);
      // Verify that the decoded content looks like printable text
      if (isPrintableText(decoded)) {
        return decoded;
      }
    } catch {
      // ignore and fall back
    }
  }

  return content;
}
