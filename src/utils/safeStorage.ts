/**
 * Resilient Web Storage Wrapper
 *
 * Provides safe, crash-proof access to localStorage and sessionStorage.
 * In restrictive environments (e.g. sandboxed iframes, cross-origin previews,
 * private browsing, or third-party cookie restrictions), direct access to
 * window.localStorage throws a DOMException / SecurityError.
 *
 * This utility catches any storage exception and gracefully falls back to an
 * in-memory Key-Value store, ensuring zero runtime crashes.
 */

const memoryStore = new Map<string, string>();

function isStorageAvailable(type: 'localStorage' | 'sessionStorage'): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const storage = window[type];
    if (!storage) return false;
    const testKey = '__cbe_storage_probe__';
    storage.setItem(testKey, '1');
    storage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

const localStorageAvailable = isStorageAvailable('localStorage');
const sessionStorageAvailable = isStorageAvailable('sessionStorage');

export const safeLocalStorage = {
  getItem(key: string): string | null {
    if (localStorageAvailable) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        // Fallback to memory
      }
    }
    return memoryStore.get(key) ?? null;
  },

  setItem(key: string, value: string): void {
    if (localStorageAvailable) {
      try {
        window.localStorage.setItem(key, value);
        return;
      } catch {
        // Fallback to memory
      }
    }
    memoryStore.set(key, String(value));
  },

  removeItem(key: string): void {
    if (localStorageAvailable) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Fallback to memory
      }
    }
    memoryStore.delete(key);
  },

  clear(): void {
    if (localStorageAvailable) {
      try {
        window.localStorage.clear();
      } catch {
        // Fallback to memory
      }
    }
    memoryStore.clear();
  },

  isAvailable(): boolean {
    return localStorageAvailable;
  },
};

export const safeSessionStorage = {
  getItem(key: string): string | null {
    if (sessionStorageAvailable) {
      try {
        return window.sessionStorage.getItem(key);
      } catch {
        // Fallback to memory
      }
    }
    return memoryStore.get(`__session_${key}`) ?? null;
  },

  setItem(key: string, value: string): void {
    if (sessionStorageAvailable) {
      try {
        window.sessionStorage.setItem(key, value);
        return;
      } catch {
        // Fallback to memory
      }
    }
    memoryStore.set(`__session_${key}`, String(value));
  },

  removeItem(key: string): void {
    if (sessionStorageAvailable) {
      try {
        window.sessionStorage.removeItem(key);
      } catch {
        // Fallback to memory
      }
    }
    memoryStore.delete(`__session_${key}`);
  },

  clear(): void {
    if (sessionStorageAvailable) {
      try {
        window.sessionStorage.clear();
      } catch {
        // Fallback to memory
      }
    }
    Array.from(memoryStore.keys()).forEach((k) => {
      if (k.startsWith('__session_')) {
        memoryStore.delete(k);
      }
    });
  },

  isAvailable(): boolean {
    return sessionStorageAvailable;
  },
};
