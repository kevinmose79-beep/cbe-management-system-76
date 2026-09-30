import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  executeGitHubDeployment,
  isDeploying,
  resetDeploymentLock,
  parseRetryAfterSeconds,
  fetchWithSecondaryRateLimit,
  isBinaryContent,
  getDecodedTextContent,
  DeployOptions,
} from '../services/githubDeployerService';

describe('GitHub Deployer Service — File Classification & Safety Verification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetDeploymentLock();
  });

  // --- CLASSIFICATION TESTS (1-9) ---

  it('1. Classifies .ts as text', () => {
    expect(isBinaryContent('src/utils/math.ts', 'export const x = 10;')).toBe(false);
  });

  it('2. Classifies .tsx as text', () => {
    expect(isBinaryContent('src/components/Header.tsx', 'export const Header = () => null;')).toBe(false);
  });

  it('3. Classifies .json as text', () => {
    expect(isBinaryContent('package.json', '{"name": "app"}')).toBe(false);
  });

  it('4. Classifies .gradle as text', () => {
    expect(isBinaryContent('android/build.gradle', 'plugins {}')).toBe(false);
  });

  it('5. Classifies .xml as text', () => {
    expect(isBinaryContent('android/app/src/main/AndroidManifest.xml', '<manifest></manifest>')).toBe(false);
  });

  it('6. Classifies .sh as text', () => {
    expect(isBinaryContent('scripts/deploy.sh', '#!/bin/bash\necho 1;')).toBe(false);
  });

  it('7. Classifies .png as binary', () => {
    expect(isBinaryContent('assets/logo.png', 'binary_data_here')).toBe(true);
  });

  it('8. Classifies .jar as binary', () => {
    expect(isBinaryContent('android/gradle/wrapper/gradle-wrapper.jar', 'some_jar_data')).toBe(true);
  });

  it('9. Misleading extension classified correctly via byte-level inspection', () => {
    // Tricky file: .ts extension but contains binary null byte
    const trickyBinary = 'export const x = 1;\x00';
    expect(isBinaryContent('src/utils/math.ts', trickyBinary)).toBe(true);

    // Tricky file: .png extension but is actually a text file
    // Let's pass printable text
    const trickyText = 'This is actually a markdown readme but named as a image file for testing';
    expect(isBinaryContent('docs/README.png', trickyText)).toBe(false);
  });

  // --- GIT TREE AND BLOB INVARIANT TESTS (10-15) ---

  it('10. Text files are inlined in the Git Tree and correctly base64-decoded if necessary', async () => {
    const treePayloads: any[] = [];
    const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/git/ref/heads/main')) {
        return new Response(JSON.stringify({ object: { sha: 'parent-sha' } }), { status: 200 });
      }
      if (url.includes('/git/commits/parent-sha')) {
        return new Response(JSON.stringify({ tree: { sha: 'base-tree-sha' } }), { status: 200 });
      }
      if (url.endsWith('/git/trees')) {
        treePayloads.push(JSON.parse(init?.body as string));
        return new Response(JSON.stringify({ sha: 'new-tree-sha' }), { status: 200 });
      }
      if (url.endsWith('/git/commits')) {
        return new Response(JSON.stringify({ sha: 'new-commit-sha' }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const opts: DeployOptions = {
      owner: 'kevinmose79-beep',
      repo: 'CBE-MANAGEMENT-SYSTEM-2026-',
      files: [
        { path: 'src/App.tsx', content: 'export const App = () => null;', isBinary: true }, // caller says binary, but we override to text!
        { path: 'src/types.ts', content: btoa('export type User = {};'), isBinary: true }, // base64 encoded text
      ],
      fetchFn: mockFetch,
    };

    const result = await executeGitHubDeployment(opts);
    expect(result.success).toBe(true);
    expect(result.blobsCreatedSequentially).toBe(0); // Both files inlined!

    expect(treePayloads.length).toBe(1);
    const tree = treePayloads[0];

    const appItem = tree.tree.find((item: any) => item.path === 'src/App.tsx');
    expect(appItem.content).toBe('export const App = () => null;');

    const typesItem = tree.tree.find((item: any) => item.path === 'src/types.ts');
    expect(typesItem.content).toBe('export type User = {};');
  });

  it('11. Binary files use Git blobs and maintain their base64 content', async () => {
    const blobPayloads: any[] = [];
    const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/git/ref/heads/main')) {
        return new Response(JSON.stringify({ object: { sha: 'parent-sha' } }), { status: 200 });
      }
      if (url.includes('/git/commits/parent-sha')) {
        return new Response(JSON.stringify({ tree: { sha: 'base-tree-sha' } }), { status: 200 });
      }
      if (url.endsWith('/git/blobs')) {
        blobPayloads.push(JSON.parse(init?.body as string));
        return new Response(JSON.stringify({ sha: 'blob-sha' }), { status: 200 });
      }
      if (url.endsWith('/git/trees')) {
        return new Response(JSON.stringify({ sha: 'new-tree-sha' }), { status: 200 });
      }
      if (url.endsWith('/git/commits')) {
        return new Response(JSON.stringify({ sha: 'new-commit-sha' }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const opts: DeployOptions = {
      owner: 'kevinmose79-beep',
      repo: 'CBE-MANAGEMENT-SYSTEM-2026-',
      files: [
        { path: 'assets/logo.png', content: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB', isBinary: false }, // caller says text, but we override to binary!
      ],
      fetchFn: mockFetch,
    };

    const result = await executeGitHubDeployment(opts);
    expect(result.success).toBe(true);
    expect(result.blobsCreatedSequentially).toBe(1);

    expect(blobPayloads.length).toBe(1);
    expect(blobPayloads[0].content).toBe('iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB');
    expect(blobPayloads[0].encoding).toBe('base64');
  });

  it('12. Binary blob concurrency remains exactly 1', async () => {
    let activeBlobRequests = 0;
    let maxConcurrency = 0;

    const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/git/ref/heads/main')) {
        return new Response(JSON.stringify({ object: { sha: 'parent-sha' } }), { status: 200 });
      }
      if (url.includes('/git/commits/parent-sha')) {
        return new Response(JSON.stringify({ tree: { sha: 'base-tree-sha' } }), { status: 200 });
      }
      if (url.endsWith('/git/blobs')) {
        activeBlobRequests++;
        if (activeBlobRequests > maxConcurrency) {
          maxConcurrency = activeBlobRequests;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
        activeBlobRequests--;
        return new Response(JSON.stringify({ sha: 'blob-sha' }), { status: 200 });
      }
      if (url.endsWith('/git/trees')) {
        return new Response(JSON.stringify({ sha: 'new-tree-sha' }), { status: 200 });
      }
      if (url.endsWith('/git/commits')) {
        return new Response(JSON.stringify({ sha: 'new-commit-sha' }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const opts: DeployOptions = {
      owner: 'kevinmose79-beep',
      repo: 'CBE-MANAGEMENT-SYSTEM-2026-',
      delayMsBetweenBlobs: 1,
      files: [
        { path: 'assets/logo1.png', content: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB', isBinary: true },
        { path: 'assets/logo2.png', content: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB', isBinary: true },
      ],
      fetchFn: mockFetch,
    };

    await executeGitHubDeployment(opts);
    expect(maxConcurrency).toBe(1); // Strict serialization check
  });

  it('13. Deployment lock prevents concurrent overlapping executions', async () => {
    let resolveDelay: () => void;
    const delayPromise = new Promise<void>((resolve) => {
      resolveDelay = resolve;
    });

    const mockFetch = vi.fn().mockImplementation(async () => {
      await delayPromise;
      return new Response(JSON.stringify({ object: { sha: '123' }, tree: { sha: '456' }, sha: '789' }), {
        status: 200,
      });
    });

    const opts: DeployOptions = {
      owner: 'kevinmose79-beep',
      repo: 'CBE-MANAGEMENT-SYSTEM-2026-',
      files: [{ path: 'src/App.tsx', content: 'export const x = 1;' }],
      fetchFn: mockFetch,
    };

    const firstRun = executeGitHubDeployment(opts);
    expect(isDeploying()).toBe(true);

    // Second run must reject
    await expect(executeGitHubDeployment(opts)).rejects.toThrow('DEPLOYMENT_LOCKED');

    resolveDelay!();
    await firstRun;
    expect(isDeploying()).toBe(false);
  });

  it('14. Secondary rate limit handling is correctly bounded', async () => {
    let fetchCount = 0;
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      fetchCount++;
      if (url.includes('/git/ref/heads/main') || url.includes('/git/refs/heads/main')) {
        return new Response(JSON.stringify({ message: 'Secondary Rate Limit Hit' }), {
          status: 403,
          headers: { 'Retry-After': '0' },
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const opts: DeployOptions = {
      owner: 'kevinmose79-beep',
      repo: 'CBE-MANAGEMENT-SYSTEM-2026-',
      files: [{ path: 'src/App.tsx', content: 'export const x = 1;' }],
      fetchFn: mockFetch,
    };

    // Bounded retry should throw after max retries exceeded
    await expect(executeGitHubDeployment(opts)).rejects.toThrow('Exceeded maximum rate-limit retries');
    expect(fetchCount).toBe(4); // 1 repo check + 1 initial ref lookup + 2 retries
  });

  it('15. Enforces force: false on reference pointer updates', async () => {
    let patchPayload: any = null;
    const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/git/ref/heads/main') || url.includes('/git/refs/heads/main')) {
        if (init?.method === 'PATCH') {
          patchPayload = JSON.parse(init.body as string);
          return new Response(JSON.stringify({ object: { sha: 'new-commit-sha' } }), { status: 200 });
        }
        return new Response(JSON.stringify({ object: { sha: 'parent-sha' } }), { status: 200 });
      }
      if (url.includes('/git/commits/parent-sha')) {
        return new Response(JSON.stringify({ tree: { sha: 'base-tree-sha' } }), { status: 200 });
      }
      if (url.endsWith('/git/trees')) {
        return new Response(JSON.stringify({ sha: 'new-tree-sha' }), { status: 200 });
      }
      if (url.endsWith('/git/commits')) {
        return new Response(JSON.stringify({ sha: 'new-commit-sha' }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const opts: DeployOptions = {
      owner: 'kevinmose79-beep',
      repo: 'CBE-MANAGEMENT-SYSTEM-2026-',
      files: [{ path: 'src/App.tsx', content: 'export const x = 1;' }],
      fetchFn: mockFetch,
    };

    await executeGitHubDeployment(opts);
    expect(patchPayload).not.toBeNull();
    expect(patchPayload.force).toBe(false); // Force is false check
  });
});
