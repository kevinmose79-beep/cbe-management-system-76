import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ThemeProvider } from './contexts/ThemeContext.tsx';
import { NotificationProvider } from './contexts/NotificationContext.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

// 1. Guard against broken or restricted window.localStorage / window.sessionStorage
try {
  if (typeof window !== 'undefined') {
    const testKey = '__cbe_sandbox_check__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
  }
} catch {
  // In sandboxed iframe environments where access to storage is denied,
  // provide a transparent in-memory fallback so libraries don't throw.
  try {
    const memoryStorage: Record<string, string> = {};
    const fakeStorage: Storage = {
      length: 0,
      clear: () => { Object.keys(memoryStorage).forEach(k => delete memoryStorage[k]); },
      getItem: (key: string) => memoryStorage[key] ?? null,
      key: (index: number) => Object.keys(memoryStorage)[index] ?? null,
      removeItem: (key: string) => { delete memoryStorage[key]; },
      setItem: (key: string, value: string) => { memoryStorage[key] = String(value); },
    };
    Object.defineProperty(window, 'localStorage', { value: fakeStorage, writable: true });
    Object.defineProperty(window, 'sessionStorage', { value: fakeStorage, writable: true });
  } catch {
    // If defineProperty is blocked, safeLocalStorage handles it
  }
}

// 2. Initialize OTA Service asynchronously after mounting begins to keep React render prioritized
setTimeout(async () => {
  try {
    const { otaUpdateService } = await import('./services/otaUpdateService.ts');
    await otaUpdateService.initialize().catch((err) => {
      console.warn('[OTA] Bootstrap initialization warning:', err);
    });
  } catch (err) {
    console.warn('[OTA] Deferred bootstrap warning:', err);
  }
}, 50);

// 3. Mount React Root with DOM readiness and error recovery
function mount() {
  const rootElement = document.getElementById('root') || (() => {
    const el = document.createElement('div');
    el.id = 'root';
    document.body.appendChild(el);
    return el;
  })();

  try {
    const root = createRoot(rootElement);
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <ThemeProvider>
            <NotificationProvider>
              <App />
            </NotificationProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </StrictMode>,
    );
  } catch (renderError: any) {
    console.error('[main.tsx] Critical React render failure:', renderError);
    rootElement.innerHTML = `
      <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f8fafc; font-family: system-ui, sans-serif; padding: 1rem;">
        <div style="max-width: 440px; width: 100%; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 1rem; padding: 2rem; box-shadow: 0 10px 25px rgba(0,0,0,0.05); text-align: center;">
          <div style="width: 48px; height: 48px; margin: 0 auto 1rem; background: #fee2e2; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #dc2626; font-size: 24px; font-weight: bold;">!</div>
          <h2 style="font-size: 1.25rem; font-weight: 700; color: #0f172a; margin-bottom: 0.5rem;">CBE Application Startup Notice</h2>
          <p style="font-size: 0.875rem; color: #64748b; line-height: 1.5; margin-bottom: 1.5rem;">An initialization error was caught during startup: ${renderError?.message || 'Unknown error'}.</p>
          <button onclick="window.location.reload()" style="background: #176B45; color: #ffffff; border: none; padding: 0.625rem 1.25rem; border-radius: 0.5rem; font-weight: 600; font-size: 0.875rem; cursor: pointer;">Reload Application</button>
        </div>
      </div>
    `;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}

