import React from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { safeLocalStorage, safeSessionStorage } from '../utils/safeStorage';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  // @ts-ignore
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  // @ts-ignore
  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught application error:', error, errorInfo);
    // @ts-ignore
    this.setState({ error, errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetCache = () => {
    try {
      // Clear relevant local storage keys except critical settings
      const preserveKeys = ['cbe_supabase_url', 'cbe_supabase_anon_key'];
      const preserved: Record<string, string | null> = {};
      preserveKeys.forEach((key) => {
        preserved[key] = safeLocalStorage.getItem(key);
      });
      safeLocalStorage.clear();
      preserveKeys.forEach((key) => {
        if (preserved[key]) {
          safeLocalStorage.setItem(key, preserved[key]!);
        }
      });
      safeSessionStorage.clear();
    } catch (e) {
      console.warn('Could not clear storage:', e);
    }
    window.location.href = '/';
  };

  public render() {
    // @ts-ignore
    if (this.state.hasError) {
      // @ts-ignore
      if (this.props.fallback) {
        // @ts-ignore
        return this.props.fallback;
      }

      // @ts-ignore
      const errorMessage = this.state.error?.message || 'An unexpected runtime error occurred.';
      // @ts-ignore
      const componentStack = this.state.errorInfo?.componentStack || '';

      return (
        <div
          role="alert"
          aria-live="assertive"
          className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))] text-slate-900 dark:text-slate-100 font-sans"
        >
          <div className="max-w-lg w-full bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-200">
            {/* Header Icon & Title */}
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200/80 dark:border-amber-800/80 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-xs">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                  Application Encountered an Issue
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  CBE Management System recovered from a rendering error
                </p>
              </div>
            </div>

            {/* Error Message Details */}
            <div className="bg-slate-50 dark:bg-slate-950/80 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3.5 text-xs font-mono text-slate-700 dark:text-slate-300 break-all max-h-40 overflow-y-auto space-y-1">
              <div className="font-semibold text-rose-600 dark:text-rose-400">Error:</div>
              <div>{errorMessage}</div>
              {componentStack && (
                <details className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                  <summary className="cursor-pointer hover:underline">View component stack</summary>
                  <pre className="mt-1 whitespace-pre-wrap">{componentStack}</pre>
                </details>
              )}
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex items-center justify-center space-x-2 bg-[#075E42] hover:bg-[#054531] text-white font-bold text-xs sm:text-sm py-2.5 px-4 rounded-xl transition cursor-pointer shadow-sm active:scale-98"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reload App</span>
              </button>

              <button
                type="button"
                onClick={this.handleResetCache}
                className="flex items-center justify-center space-x-2 bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs sm:text-sm py-2.5 px-4 rounded-xl transition cursor-pointer border border-slate-200/80 dark:border-slate-700"
              >
                <Trash2 className="w-4 h-4 text-slate-500" />
                <span>Clear Cache & Reset</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    // @ts-ignore
    return this.props.children;
  }
}


