import React, { useState, useEffect, useRef } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Database,
  RefreshCw,
  WifiOff,
  X,
  Terminal,
  GraduationCap,
} from 'lucide-react';
import {
  School,
  User,
  Teacher,
  ClassStream,
  Student,
  Subject,
  Examination,
  Mark,
  Grade,
  VerificationLog,
  Role,
  EducationLevel,
} from './types';
import {
  api,
  testSupabaseConnection,
  syncFromSupabase,
  resetSyncState,
  hasCompletedStartupSync,
  subscribeToMarksRealtime,
  unsubscribeFromMarksRealtime,
  RealtimeMarkCallback,
  ConnectionStatus,
  getSupabaseCredentials,
} from './lib/storage';
import { useConnectionStatus } from './utils/useConnectionStatus';
import { getActiveTeacher, getEffectiveRole, ROLE_ALLOWED_TABS, isTabAllowedForRole } from './utils/rbacUtils';
import { authService } from './services/authService';
import { AcademicSessionProvider } from './contexts/AcademicSessionContext';
import { sessionUpdateLock } from './utils/sessionUpdateLock';
import { safeLocalStorage } from './utils/safeStorage';

// Core & Shell Navigation Components
import { Header } from './components/Header';
import { Sidebar, TabType } from './components/Sidebar';
import { ModuleIndicator } from './components/ModuleIndicator';
import { MobileBottomNav } from './components/MobileBottomNav';
import { LoginPage } from './components/LoginPage';
import { UnauthorizedView } from './components/UnauthorizedView';
import { useInactivityMonitor } from './utils/useInactivityMonitor';
import { InactivityWarningToast } from './components/InactivityWarningToast';
import { setupHardwareBackNavigation } from './utils/backNavigationHandler';
import { LoadingIndicator } from './components/LoadingIndicator';
import { AssessmentContextualNav } from './components/AssessmentContextualNav';

// Application Views (Statically Loaded)
import { AdminDashboard } from './components/AdminDashboard';
import { TeacherDashboard } from './components/TeacherDashboard';
import { LearnerPortal } from './components/LearnerPortal';
import { StudentRegistration } from './components/StudentRegistration';
import { TeacherManagement } from './components/TeacherManagement';
import { ClassSubjectManagement } from './components/ClassSubjectManagement';
import { ExaminationManagement } from './components/ExaminationManagement';
import { MarksEntryTable } from './components/MarksEntryTable';
import { MarksMonitoringView } from './components/MarksMonitoringView';
import { ClassTeacherMarksMonitoringView } from './components/ClassTeacherMarksMonitoringView';
import { AssessmentStreamApprovalView } from './components/AssessmentStreamApprovalView';
import { ProvisionalResultsView } from './components/ProvisionalResultsView';
import { ExaminationAnalysisValidation } from './components/ExaminationAnalysisValidation';
import { ReportsView } from './components/ReportsView';
import { GradingSettings } from './components/GradingSettings';
import { SchoolPerformanceAnalytics } from './components/SchoolPerformanceAnalytics';
import { AcademicSessionManagement } from './components/AcademicSessionManagement';
import { StudentPromotionModule } from './components/StudentPromotionModule';
import { SchoolProfileView } from './components/SchoolProfileView';
import { SystemSettingsPage } from './components/SystemSettingsPage';
import { DeveloperSettingsPage } from './components/DeveloperSettingsPage';

// Modal Components (Statically Loaded)
import { SchoolProfileModal } from './components/SchoolProfileModal';
import { SupabaseModal } from './components/SupabaseModal';
import { LearnerProfileModal } from './components/LearnerProfileModal';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { SessionLockModal } from './components/SessionLockModal';

export { ROLE_ALLOWED_TABS, isTabAllowedForRole };

export default function App() {

  // Authentication & Session State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [isDataSyncing, setIsDataSyncing] = useState<boolean>(false);

  // Network & Offline Detection State
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isOfflineModeForced, setIsOfflineModeForced] = useState<boolean>(false);

  // Database State
  const [school, setSchool] = useState<School>(api.getSchool());
  const [teachers, setTeachers] = useState<Teacher[]>(api.getTeachers());
  const [classes, setClasses] = useState<ClassStream[]>(api.getClasses());
  const [students, setStudents] = useState<Student[]>(api.getStudents());
  const [marksStudents, setMarksStudents] = useState<Student[]>(api.getAllStudentsForMarks());
  const [subjects, setSubjects] = useState<Subject[]>(api.getSubjects());
  const [exams, setExams] = useState<Examination[]>(api.getExaminations());
  const [marks, setMarks] = useState<Mark[]>(api.getMarks());
  const [grades, setGrades] = useState<Grade[]>(api.getGrades());
  const [verificationLogs, setVerificationLogs] = useState<VerificationLog[]>(
    api.getVerificationLogs()
  );

  const activeTeacher = getActiveTeacher(currentUser || null, teachers || []);

  // Supabase Connection Status & Priority 2 Connectivity Status
  const connectionStatus = useConnectionStatus();
  const [showRestoredToast, setShowRestoredToast] = useState(false);
  const [showRealtimeUnavailableToast, setShowRealtimeUnavailableToast] = useState(false);
  const prevStatusRef = useRef<ConnectionStatus>(connectionStatus);
  const connectionToastTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Inactivity & Non-Destructive 8-Hour Maximum Session Lock Monitor
  const {
    isWarningVisible,
    warningType,
    isSessionLocked,
    lockReason,
    resetActivity,
    dismissWarning,
    unlockSession,
  } = useInactivityMonitor({
    enabled: isAuthenticated && currentUser !== null,
    getLastActivityTime: () => authService.getLastActivityTime(),
    onActivityRecord: (timestamp) => authService.recordLastActivity(timestamp),
    getSessionStartTime: () => authService.getSessionStartTime(),
    onSessionRenew: () => authService.recordSessionStart(Date.now()),
  });

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = connectionStatus;

    if (
      (prev === 'offline' || prev === 'reconnecting' || prev === 'syncing' || prev === 'realtime_unavailable') &&
      connectionStatus === 'online'
    ) {
      if (connectionToastTimerRef.current) {
        clearTimeout(connectionToastTimerRef.current);
      }
      setShowRestoredToast(true);
      setShowRealtimeUnavailableToast(false);
      connectionToastTimerRef.current = setTimeout(() => {
        setShowRestoredToast(false);
        connectionToastTimerRef.current = null;
      }, 3500);
    } else if (prev !== 'realtime_unavailable' && connectionStatus === 'realtime_unavailable') {
      if (connectionToastTimerRef.current) {
        clearTimeout(connectionToastTimerRef.current);
      }
      setShowRealtimeUnavailableToast(true);
      setShowRestoredToast(false);
      connectionToastTimerRef.current = setTimeout(() => {
        setShowRealtimeUnavailableToast(false);
        connectionToastTimerRef.current = null;
      }, 3500);
    }
  }, [connectionStatus]);

  useEffect(() => {
    return () => {
      if (connectionToastTimerRef.current) {
        clearTimeout(connectionToastTimerRef.current);
      }
    };
  }, []);

  const [dbStatus, setDbStatus] = useState<{
    checking: boolean;
    success: boolean;
    message: string;
    url?: string;
    error?: string;
    fixInstructions?: string;
    records?: any[];
  }>({
    checking: true,
    success: false,
    message: 'Testing connection to Supabase project...',
  });
  const [dismissBanner, setDismissBanner] = useState(false);

  // UI State
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');

  // Synchronize navigation context into SessionUpdateLock to protect sensitive views (e.g., marks-entry)
  useEffect(() => {
    sessionUpdateLock.setNavigationTab(activeTab);
  }, [activeTab]);
  const [isOpenMobileSidebar, setIsOpenMobileSidebar] = useState(false);
  const [isOpenSchoolProfileModal, setIsOpenSchoolProfileModal] = useState(false);
  const [isOpenSupabaseModal, setIsOpenSupabaseModal] = useState(false);
  const [isOpenSearchModal, setIsOpenSearchModal] = useState(false);
  const [profileStudent, setProfileStudent] = useState<Student | null>(null);

  // Global Ctrl+K / Cmd+K Search Shortcut
  useEffect(() => {
    const handleGlobalSearchKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpenSearchModal((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalSearchKey);
    return () => window.removeEventListener('keydown', handleGlobalSearchKey);
  }, []);

  // Android Hardware Back Button Navigation Handler
  useEffect(() => {
    const cleanupBackNavigation = setupHardwareBackNavigation(() => {
      const defaultTab: TabType = currentUser?.role === 'learner' ? 'learner-portal' : 'dashboard';
      const isModalOpen = isOpenSchoolProfileModal || isOpenSupabaseModal || isOpenSearchModal || profileStudent !== null;
      const isDrawerOpen = isOpenMobileSidebar;
      const canGoBack = activeTab !== defaultTab;

      return {
        isSessionLocked,
        isModalOpen,
        onCloseModal: () => {
          if (profileStudent !== null) setProfileStudent(null);
          else if (isOpenSearchModal) setIsOpenSearchModal(false);
          else if (isOpenSchoolProfileModal) setIsOpenSchoolProfileModal(false);
          else if (isOpenSupabaseModal) setIsOpenSupabaseModal(false);
        },
        isDrawerOpen,
        onCloseDrawer: () => setIsOpenMobileSidebar(false),
        canGoBack,
        onGoBack: () => {
          setActiveTab(defaultTab);
          window.location.hash = defaultTab;
        },
        isRootView: !canGoBack,
      };
    });

    return () => cleanupBackNavigation();
  }, [
    isSessionLocked,
    isOpenSchoolProfileModal,
    isOpenSupabaseModal,
    isOpenSearchModal,
    profileStudent,
    isOpenMobileSidebar,
    activeTab,
    currentUser,
  ]);

  // Browser/Device Online & Offline State Sync
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setIsOfflineModeForced(false);
      setIsAuthChecking(true);
      verifyAndSyncSupabase({ checkConnectivityOnly: true }).finally(() => {
        setIsAuthChecking(false);
      });
    };
    const handleOffline = () => {
      setIsOnline(false);
      setIsAuthChecking(false);
      setIsDataSyncing(false);
      setDbStatus((prev) => ({
        ...prev,
        checking: false,
        success: false,
        message: 'You are currently offline. Please check your internet connection.',
      }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Initial authentication check & session listener
  useEffect(() => {
    let isMounted = true;

    const initAuthSession = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (isMounted) {
          setIsOnline(false);
          setIsAuthChecking(false);
          setDbStatus({
            checking: false,
            success: false,
            message: 'Offline Mode: No internet connection detected.',
            error: 'Offline',
          });
        }
        return;
      }

      setIsAuthChecking(true);
      try {
        const user = await authService.getSession();
        if (isMounted) {
          if (user && user.id && user.role) {
            setCurrentUser(user);
            setIsAuthenticated(true);
            api.setCurrentUser(user);

            // Synchronise authenticated Supabase data on session recovery
            let syncSucceeded = false;
            try {
              syncSucceeded = await syncFromSupabase();
              if (isMounted) refreshData();
            } catch (syncErr) {
              console.warn('Session recovery sync error:', syncErr);
            }

            const hash = window.location.hash.replace('#', '') as TabType;
            const tch = getActiveTeacher(user, api.getTeachers());
            const currentClasses = api.getClasses();
            if (hash && isTabAllowedForRole(user, hash, tch, currentClasses)) {
              setActiveTab(hash);
            } else {
              const defaultTab: TabType = user.role === 'learner' ? 'learner-portal' : 'dashboard';
              setActiveTab(defaultTab);
              window.location.hash = defaultTab;
            }

            if (syncSucceeded) {
              // Successful syncFromSupabase proves database connectivity; bypass redundant testSupabaseConnection check
              setIsOnline(true);
              setIsOfflineModeForced(false);
              safeLocalStorage.setItem('cbe_system_configured', 'true');
              setDbStatus({
                checking: false,
                success: true,
                url: getSupabaseCredentials().url,
                message: 'Supabase connection successful',
              });
            } else {
              await verifyAndSyncSupabase({ checkConnectivityOnly: true });
            }
          } else {
            setCurrentUser(null);
            setIsAuthenticated(false);
            api.setCurrentUser(null);
            // Connectivity check for dbStatus reporting for unauthenticated visitors
            await verifyAndSyncSupabase({ checkConnectivityOnly: true });
          }
        }
      } catch (err) {
        console.error('Error verifying auth session:', err);
        if (isMounted) {
          setCurrentUser(null);
          setIsAuthenticated(false);
          api.setCurrentUser(null);
        }
      } finally {
        if (isMounted) {
          setIsAuthChecking(false);
        }
      }
    };

    initAuthSession();

    const unsubscribe = authService.onAuthStateChange((user) => {
      if (!isMounted) return;
      if (user && user.id && user.role) {
        setCurrentUser(user);
        setIsAuthenticated(true);
        api.setCurrentUser(user);
      } else {
        resetSyncState();
        setCurrentUser(null);
        setIsAuthenticated(false);
        api.setCurrentUser(null);
        window.location.hash = '';
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Sync activeTab with URL hash changes
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '') as TabType;
      if (hash && isAuthenticated && currentUser) {
        if (!isTabAllowedForRole(currentUser, hash, activeTeacher, classes)) {
          const defaultTab: TabType = currentUser.role === 'learner' ? 'learner-portal' : 'dashboard';
          setActiveTab(defaultTab);
          window.location.hash = defaultTab;
          return;
        }
        setActiveTab(hash);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [isAuthenticated, currentUser, activeTeacher, classes]);

  // Stage 8B: Realtime Marks State Synchronization
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleRealtimeMarkEvent: RealtimeMarkCallback = () => {
      setMarks(api.getMarks());
    };

    subscribeToMarksRealtime(handleRealtimeMarkEvent);

    return () => {
      unsubscribeFromMarksRealtime(handleRealtimeMarkEvent);
    };
  }, [isAuthenticated]);

  // Connection test & data sync
  const verifyAndSyncSupabase = async (options?: { forceSync?: boolean; checkConnectivityOnly?: boolean }) => {
    setDbStatus((prev) => ({ ...prev, checking: true }));
    const result = await testSupabaseConnection();
    if (result.success) {
      setIsOnline(true);
      setIsOfflineModeForced(false);
      safeLocalStorage.setItem('cbe_system_configured', 'true');

      // Trigger sync ONLY if forceSync is explicitly requested AND checkConnectivityOnly is NOT set
      if (options?.forceSync && !options?.checkConnectivityOnly) {
        const sessionUser = await authService.getSession();
        if (sessionUser && sessionUser.id && sessionUser.role) {
          await syncFromSupabase({ force: true });
          refreshData();
        }
      }

      setDbStatus({
        checking: false,
        success: true,
        url: result.url,
        message: 'Supabase connection successful',
        records: result.records,
      });
    } else {
      setDbStatus({
        checking: false,
        success: false,
        url: result.url,
        message: result.message,
        error: result.error,
        fixInstructions: result.fixInstructions,
      });

      // If we failed to connect, check if the browser/device itself is offline
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setIsOnline(false);
      }

      // If system has never been configured and user is admin, prompt for first-time database setup
      const isConfigured = safeLocalStorage.getItem('cbe_system_configured');
      if (!isConfigured && currentUser?.role === 'admin') {
        setIsOpenSupabaseModal(true);
      }
    }
  };

  // Sync state whenever data updates
  const refreshData = () => {
    setSchool(api.getSchool());
    setTeachers(api.getTeachers());
    setClasses(api.getClasses());
    setStudents(api.getStudents());
    setMarksStudents(api.getAllStudentsForMarks());
    setSubjects(api.getSubjects());
    setExams(api.getExaminations());
    setMarks(api.getMarks());
    setGrades(api.getGrades());
    setVerificationLogs(api.getVerificationLogs());
  };

  const handleMarksUpdated = () => {
    setMarks(api.getMarks());
    setExams(api.getExaminations());
  };

  // Select tab with URL hash update
  const handleSelectTab = (tab: TabType) => {
    if (!isTabAllowedForRole(currentUser, tab, activeTeacher, classes)) {
      const defaultTab: TabType = currentUser?.role === 'learner' ? 'learner-portal' : 'dashboard';
      setActiveTab(defaultTab);
      window.location.hash = defaultTab;
      return;
    }
    setActiveTab(tab);
    window.location.hash = tab;
    setMarks(api.getMarks());
  };

  // Secure logout handler with instant UI transition
  const handleLogout = () => {
    // 1. Instantly transition UI to Login screen (0ms delay)
    setIsAuthenticated(false);
    setCurrentUser(null);
    api.setCurrentUser(null);
    resetSyncState();
    window.location.hash = '';

    // 2. Invalidate cloud authentication session asynchronously in background
    authService.signOut().catch((err) => {
      console.warn('Background sign out error:', err);
    });
  };

  // Successful login callback from LoginPage
  const handleLoginSuccess = async (user: User) => {
    resetSyncState();
    setIsDataSyncing(true);
    try {
      setCurrentUser(user);
      setIsAuthenticated(true);
      api.setCurrentUser(user);

      // Perform authoritative post-login synchronisation using the authenticated Supabase session
      await syncFromSupabase({ force: true });
      refreshData();

      const hash = window.location.hash.replace('#', '') as TabType;
      const tch = getActiveTeacher(user, api.getTeachers());
      const currentClasses = api.getClasses();
      if (hash && isTabAllowedForRole(user, hash, tch, currentClasses)) {
        setActiveTab(hash);
      } else {
        const defaultTab: TabType = user.role === 'learner' ? 'learner-portal' : 'dashboard';
        setActiveTab(defaultTab);
        window.location.hash = defaultTab;
      }
    } catch (syncErr) {
      console.error('Post-login data synchronisation failed:', syncErr);
    } finally {
      setIsDataSyncing(false);
    }
  };

  // CRUD Actions
  const handleUpdateSchool = async (updated: School) => {
    const saved = await api.updateSchool(updated);
    setSchool(saved);
  };

  const handleAddStudent = async (std: Student) => {
    try {
      await api.addStudent(std);
      await refreshData();
    } catch (err: any) {
      console.error('Error adding student:', err);
      throw err;
    }
  };

  const handleBatchAddStudents = async (batch: Student[]) => {
    try {
      await api.batchAddStudents(batch);
      await refreshData();
    } catch (err: any) {
      console.error('Error batch registering learners:', err);
      throw err;
    }
  };

  const handleUpdateStudent = async (std: Student) => {
    try {
      await api.updateStudent(std);
      await refreshData();
    } catch (err: any) {
      console.error('Failed to update learner:', err);
      throw err;
    }
  };

  const handleDeleteStudent = async (id: string) => {
    try {
      await api.deleteStudent(id);
      await refreshData();
    } catch (err: any) {
      console.error('Failed to delete learner:', err);
      throw err;
    }
  };

  const handleAddTeacher = (tch: Teacher, authUserId?: string) => {
    api.addTeacher(tch, authUserId);
    refreshData();
  };

  const handleUpdateTeacher = async (tch: Teacher) => {
    await api.updateTeacher(tch);
    setTeachers((prev) => prev.map((t) => (t.id === tch.id || (t.email && tch.email && t.email.trim().toLowerCase() === tch.email.trim().toLowerCase()) ? { ...t, ...tch } : t)));
    await refreshData();
  };

  const handleDeleteTeacher = async (id: string) => {
    const targetTeacher = teachers.find((t) => t.id === id);
    const res = await authService.adminDeleteTeacher(id, targetTeacher?.email);
    if (!res.success) {
      throw new Error(res.error || 'Failed to delete teacher account.');
    }
    await refreshData();
  };

  const handleAddClass = async (cls: ClassStream) => {
    try {
      await api.addClass(cls);
      await refreshData();
    } catch (err: any) {
      console.error('Failed to add class/stream:', err);
      throw err;
    }
  };

  const handleUpdateClass = async (cls: ClassStream) => {
    try {
      await api.updateClass(cls);
      await refreshData();
    } catch (err: any) {
      console.error('Failed to update class/stream:', err);
      throw err;
    }
  };

  const handleDeleteClass = async (id: string) => {
    try {
      await api.deleteClass(id);
      await refreshData();
    } catch (err: any) {
      console.error('Failed to delete class from database:', err);
      throw err;
    }
  };

  const handleDeleteStream = async (streamId: string) => {
    try {
      await api.deleteStream(streamId);
      await refreshData();
    } catch (err: any) {
      console.error('Failed to delete stream from database:', err);
      throw err;
    }
  };

  const handleAddSubject = async (sb: Subject) => {
    try {
      await api.addSubject(sb);
      await refreshData();
    } catch (err: any) {
      console.error('Failed to add learning area:', err);
      throw err;
    }
  };

  const handleUpdateSubject = async (sb: Subject) => {
    try {
      await api.updateSubject(sb);
      await refreshData();
    } catch (err: any) {
      console.error('Failed to update learning area:', err);
      throw err;
    }
  };

  const handleDeleteSubject = async (id: string) => {
    await api.deleteSubject(id);
    await refreshData();
  };

  const handleAddExamination = async (ex: Examination) => {
    await api.addExamination(ex);
    await refreshData();
  };

  const handleUpdateExamination = async (ex: Examination) => {
    await api.updateExamination(ex, currentUser);
    await refreshData();
  };

  const handleUpdateExamStatus = async (examId: string, status: Examination['status']) => {
    await api.updateExaminationStatus(examId, status, currentUser);
    await refreshData();
  };

  const handleUpdateExamLevelApproval = async (
    examId: string,
    level: EducationLevel,
    approved: boolean
  ) => {
    await api.updateExaminationLevelApproval(examId, level, approved, currentUser);
    await refreshData();
  };

  const handleUpdateExamClassApproval = async (
    examId: string,
    classStreamId: string,
    approved: boolean
  ) => {
    await api.updateExaminationClassApproval(examId, classStreamId, approved, currentUser);
    await refreshData();
  };

  const handleDeleteExamination = async (examId: string) => {
    const res = await api.deleteExamination(examId, currentUser);
    await refreshData();
    return res;
  };

  const handleSaveMarks = async (newMarks: Mark[]) => {
    try {
      await api.saveBulkMarks(newMarks, currentUser);
      await refreshData();
    } catch (err: any) {
      console.error('Failed to save marks:', err);
      throw err;
    }
  };

  const handleUpdateGrades = async (newGrades: Grade[]) => {
    try {
      await api.updateGrades(newGrades);
      await refreshData();
    } catch (err: any) {
      console.error('Failed to update grading boundaries:', err);
      throw err;
    }
  };

  const handleAddVerificationLog = (log: VerificationLog) => {
    api.addVerificationLog(log);
    refreshData();
  };

  const handleResetDemoData = () => {
    if (window.confirm('Are you sure you want to reset all data to the clean default seed?')) {
      api.resetToDefaultSeed();
      refreshData();
    }
  };

  // Render Offline Screen strictly when device is offline
  if (!isOnline && !isOfflineModeForced) {
    const cachedUser = api.getCurrentUser();
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))] pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] text-slate-900 dark:text-slate-100 transition-colors duration-200"
      >
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-xl p-6 sm:p-8 text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
          {/* Offline Badge Icon */}
          <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200/80 dark:border-amber-800/80 text-amber-600 dark:text-amber-400 flex items-center justify-center shadow-xs">
            <WifiOff className="w-8 h-8" />
          </div>

          {/* Offline Header & Status Badge */}
          <div className="space-y-2">
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300/60 dark:border-amber-800/80">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span>No Internet Connection</span>
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
              You Are Currently Offline
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">
              No active internet connection was detected on your device or mobile app. Please enable Wi-Fi or cellular data.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2.5 pt-2">
            <button
              onClick={() => {
                const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
                setIsOnline(online);
                if (online) {
                  setIsAuthChecking(true);
                  verifyAndSyncSupabase({ checkConnectivityOnly: true }).finally(() => {
                    setIsAuthChecking(false);
                  });
                }
              }}
              className="w-full flex items-center justify-center space-x-2 bg-[#075E42] hover:bg-[#054531] text-white font-bold text-xs sm:text-sm py-2.5 px-4 rounded-xl transition cursor-pointer shadow-sm active:scale-98"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Retry Connection</span>
            </button>

            {cachedUser ? (
              <button
                onClick={() => {
                  setCurrentUser(cachedUser);
                  setIsAuthenticated(true);
                  setIsAuthChecking(false);
                  setIsDataSyncing(false);
                  setDbStatus((prev) => ({ ...prev, checking: false }));
                  setIsOfflineModeForced(true);
                }}
                className="w-full flex items-center justify-center space-x-2 bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs sm:text-sm py-2.5 px-4 rounded-xl transition cursor-pointer border border-slate-200/80 dark:border-slate-700"
              >
                <span>Continue in Offline Mode ({cachedUser.name})</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  setIsAuthChecking(false);
                  setIsDataSyncing(false);
                  setDbStatus((prev) => ({ ...prev, checking: false }));
                  setIsOfflineModeForced(true);
                }}
                className="w-full flex items-center justify-center space-x-2 bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs sm:text-sm py-2.5 px-4 rounded-xl transition cursor-pointer border border-slate-200/80 dark:border-slate-700"
              >
                <span>Go to Login Screen</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Render Loading / Synchronising Screen during initial startup session verification, post-login hydration, or connectivity checks
  if (isDataSyncing || isAuthChecking || dbStatus.checking) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))] pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] text-slate-900 dark:text-slate-100 transition-colors duration-200"
      >
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#176B45] to-[#0F5132] text-white shadow-xl shadow-[#0F5132]/30 dark:shadow-[#0F5132]/40 flex items-center justify-center mb-5 animate-pulse motion-reduce:animate-none">
          <GraduationCap className="w-9 h-9" />
        </div>

        <div className="flex flex-col items-center justify-center space-y-2 text-center">
          <p className="text-base font-bold text-black dark:text-white tracking-wide">
            Please Wait
          </p>
          <div className="flex items-center space-x-2 justify-center pt-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[#176B45] dark:bg-[#2E7D5B] animate-bounce motion-reduce:animate-none [animation-delay:-0.3s]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#176B45] dark:bg-[#2E7D5B] animate-bounce motion-reduce:animate-none [animation-delay:-0.15s]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#176B45] dark:bg-[#2E7D5B] animate-bounce motion-reduce:animate-none" />
          </div>
        </div>
      </div>
    );
  }

  // Render Login Page if not authenticated or no active user
  if (!isAuthenticated || !currentUser) {
    return (
      <LoginPage
        school={school}
        onLoginSuccess={handleLoginSuccess}
        dbStatusSuccess={dbStatus.success}
      />
    );
  }

  // Mandatory First Login Password Change Guard
  if (currentUser.force_password_change) {
    return (
      <ChangePasswordModal
        user={currentUser}
        onPasswordChanged={(updatedUser) => {
          setCurrentUser(updatedUser);
          api.setCurrentUser(updatedUser);
        }}
        onLogout={handleLogout}
      />
    );
  }

  // Active Teacher / Student context
  const effectiveRole = getEffectiveRole(currentUser, activeTeacher, classes);
  const effectiveUser =
    currentUser && effectiveRole !== currentUser.role
      ? { ...currentUser, role: effectiveRole }
      : currentUser;

  const activeStudent =
    currentUser.role === 'student'
      ? students.find((s) => s.id === currentUser.student_id) || students[0]
      : null;

  // Check role authorization for activeTab
  const isTabAllowed = isTabAllowedForRole(currentUser, activeTab, activeTeacher, classes);

  const handleSelectSearchResult = (category: string, item: any, targetTab: TabType) => {
    if (category === 'Learners' && item) {
      setProfileStudent(item);
      if (isTabAllowedForRole(currentUser, 'students', activeTeacher, classes)) {
        handleSelectTab('students');
      }
      return;
    }

    if (targetTab && isTabAllowedForRole(currentUser, targetTab, activeTeacher, classes)) {
      handleSelectTab(targetTab);
    } else if (category === 'Classes & Streams' && isTabAllowedForRole(currentUser, 'students', activeTeacher, classes)) {
      handleSelectTab('students');
    } else if (
      (category === 'Learning Areas' || category === 'Assessments') &&
      isTabAllowedForRole(currentUser, 'marks-entry', activeTeacher, classes)
    ) {
      handleSelectTab('marks-entry');
    }
  };

  return (
    <AcademicSessionProvider currentUser={effectiveUser || currentUser}>
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col font-sans text-slate-800 dark:text-slate-100 antialiased transition-colors duration-200">
      {/* Navbar Header */}
      <Header
        school={school}
        currentUser={effectiveUser || currentUser}
        onLogout={handleLogout}
        onOpenSchoolProfile={() => setIsOpenSchoolProfileModal(true)}
        onOpenSupabaseModal={() => setIsOpenSupabaseModal(true)}
        onNavigateToSystem={() => handleSelectTab('system-settings')}
        onNavigateToDiagnostics={() => handleSelectTab('developer-mode')}
        onToggleSidebar={() => setIsOpenMobileSidebar(!isOpenMobileSidebar)}
        onOpenSearch={() => setIsOpenSearchModal(true)}
        connectionStatus={connectionStatus}
        dbStatus={dbStatus}
        onRetryConnection={() => verifyAndSyncSupabase({ checkConnectivityOnly: true })}
      />

      {/* Floating Brief Pop-up Toasts (Samsung One UI Inspired) */}
      {showRealtimeUnavailableToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-[calc(1rem+env(safe-area-inset-top,0px))] left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-6 sm:top-[calc(1.25rem+env(safe-area-inset-top,0px))] z-50 flex items-center bg-white/95 dark:bg-slate-900/95 text-slate-900 dark:text-slate-100 border border-amber-300 dark:border-amber-700/80 shadow-lg shadow-black/10 dark:shadow-black/30 rounded-2xl px-3.5 py-2 sm:px-4 sm:py-2.5 backdrop-blur-md space-x-2.5 max-w-[calc(100vw-2rem)] sm:max-w-md transition-all duration-300 animate-in fade-in slide-in-from-top-2"
        >
          <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-bold leading-tight break-words">Live updates unavailable</span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight break-words">Changes may be delayed.</span>
          </div>
          <button
            onClick={() => {
              if (connectionToastTimerRef.current) {
                clearTimeout(connectionToastTimerRef.current);
                connectionToastTimerRef.current = null;
              }
              setShowRealtimeUnavailableToast(false);
            }}
            className="ml-1 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {showRestoredToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-[calc(1rem+env(safe-area-inset-top,0px))] left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-6 sm:top-[calc(1.25rem+env(safe-area-inset-top,0px))] z-50 flex items-center bg-white/95 dark:bg-slate-900/95 text-slate-900 dark:text-slate-100 border border-emerald-300 dark:border-emerald-700/80 shadow-lg shadow-black/10 dark:shadow-black/30 rounded-2xl px-3.5 py-2 sm:px-4 sm:py-2.5 backdrop-blur-md space-x-2.5 max-w-[calc(100vw-2rem)] sm:max-w-md transition-all duration-300 animate-in fade-in slide-in-from-top-2"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-bold leading-tight break-words">Live updates restored</span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight break-words">Syncing latest changes…</span>
          </div>
          <button
            onClick={() => {
              if (connectionToastTimerRef.current) {
                clearTimeout(connectionToastTimerRef.current);
                connectionToastTimerRef.current = null;
              }
              setShowRestoredToast(false);
            }}
            className="ml-1 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Body */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 gap-6">
        {/* Navigation Sidebar (hidden for learner role) */}
        {(effectiveUser || currentUser).role !== 'learner' && (
          <Sidebar
            currentRole={(effectiveUser || currentUser).role}
            activeTab={activeTab}
            onSelectTab={handleSelectTab}
            isOpenMobile={isOpenMobileSidebar}
            onCloseMobile={() => setIsOpenMobileSidebar(false)}
            onLogout={handleLogout}
          />
        )}

        {/* Dynamic Workspace Container with mobile bottom clearance for MobileBottomNav */}
        <main className="flex-1 overflow-x-hidden pb-20 md:pb-0">
          {/* Module Indicator Breadcrumb (outside header) */}
          <ModuleIndicator activeTab={activeTab} />

          {/* Handle Role Route Authorization Protection */}
          {!isTabAllowed ? (
            <UnauthorizedView
              currentRole={(effectiveUser || currentUser).role}
              onReturnToDashboard={() =>
                handleSelectTab((effectiveUser || currentUser).role === 'learner' ? 'learner-portal' : 'dashboard')
              }
            />
          ) : (
            <>
              {/* TAB: LEARNER PORTAL */}
              {activeTab === 'learner-portal' && (effectiveUser || currentUser).role === 'learner' && (
                <LearnerPortal
                  currentUser={effectiveUser || currentUser}
                  classes={classes}
                  subjects={subjects}
                  teachers={teachers}
                  exams={exams}
                  school={school}
                  marks={marks}
                  students={marksStudents}
                  allStudents={students}
                  onLogout={handleLogout}
                  onMarksUpdated={handleMarksUpdated}
                />
              )}
              {/* TAB: DASHBOARD */}
              {activeTab === 'dashboard' && (
                <>
                  {(effectiveUser || currentUser).role === 'admin' && (
                    <AdminDashboard
                      userName={currentUser.name}
                      school={school}
                      students={students}
                      teachers={teachers}
                      classes={classes}
                      exams={exams}
                      marks={marks}
                      grades={grades}
                      subjects={subjects}
                      onNavigate={handleSelectTab}
                      onResetData={handleResetDemoData}
                      onMarksUpdated={handleMarksUpdated}
                    />
                  )}

                  {((effectiveRole === 'class_teacher' || (effectiveUser || currentUser).role === 'class_teacher') || (effectiveRole === 'subject_teacher' || (effectiveUser || currentUser).role === 'subject_teacher')) && activeTeacher && (
                    <TeacherDashboard
                      teacher={activeTeacher}
                      classes={classes}
                      subjects={subjects}
                      exams={exams}
                      marks={marks}
                      students={marksStudents}
                      grades={grades}
                      onNavigate={handleSelectTab}
                      currentUser={effectiveUser || currentUser}
                      onMarksUpdated={handleMarksUpdated}
                      onTeacherUpdated={handleUpdateTeacher}
                    />
                  )}
                </>
              )}

              {/* TAB: STUDENTS */}
              {activeTab === 'students' && (
                <StudentRegistration
                  students={students}
                  classes={classes}
                  teachers={teachers}
                  subjects={subjects}
                  currentUser={currentUser}
                  onAddStudent={handleAddStudent}
                  onBatchAddStudents={handleBatchAddStudents}
                  onUpdateStudent={handleUpdateStudent}
                  onDeleteStudent={handleDeleteStudent}
                  onViewProfile={(std) => setProfileStudent(std)}
                />
              )}

              {/* TAB: STUDENT PROMOTION */}
              {activeTab === 'student-promotion' && (
                <StudentPromotionModule
                  students={students}
                  classes={classes}
                  onRefreshData={refreshData}
                />
              )}

              {/* TAB: TEACHERS */}
              {activeTab === 'teachers' && (
                <TeacherManagement
                  teachers={teachers}
                  subjects={subjects}
                  classes={classes}
                  onAddTeacher={handleAddTeacher}
                  onUpdateTeacher={handleUpdateTeacher}
                  onDeleteTeacher={handleDeleteTeacher}
                />
              )}

              {/* TAB: CLASSES & SUBJECTS */}
              {activeTab === 'classes' && (
                <ClassSubjectManagement
                  classes={classes}
                  subjects={subjects}
                  teachers={teachers}
                  initialTab="classes"
                  onAddClass={handleAddClass}
                  onUpdateClass={handleUpdateClass}
                  onDeleteClass={handleDeleteClass}
                  onDeleteStream={handleDeleteStream}
                  onAddSubject={handleAddSubject}
                  onUpdateSubject={handleUpdateSubject}
                  onDeleteSubject={handleDeleteSubject}
                />
              )}

              {/* TAB: LEARNING AREAS */}
              {activeTab === 'subjects' && (
                <ClassSubjectManagement
                  classes={classes}
                  subjects={subjects}
                  teachers={teachers}
                  initialTab="subjects"
                  onAddClass={handleAddClass}
                  onUpdateClass={handleUpdateClass}
                  onDeleteClass={handleDeleteClass}
                  onDeleteStream={handleDeleteStream}
                  onAddSubject={handleAddSubject}
                  onUpdateSubject={handleUpdateSubject}
                  onDeleteSubject={handleDeleteSubject}
                />
              )}

              {/* TAB: ACADEMIC SESSION MANAGEMENT */}
              {activeTab === 'academic-session' && (
                <AcademicSessionManagement
                  userRole={(effectiveUser || currentUser).role}
                  onSessionUpdated={refreshData}
                />
              )}

              {/* CONTEXTUAL ASSESSMENT NAVIGATION BAR */}
              {['exams', 'marks-entry', 'marks-monitoring', 'class-marks-monitoring', 'stream-approval', 'results-approval', 'provisional', 'exam-validation', 'reports'].includes(activeTab) && (
                <AssessmentContextualNav
                  activeTab={activeTab}
                  onSelectTab={handleSelectTab}
                  userRole={(effectiveUser || currentUser).role}
                />
              )}

              {/* TAB: EXAMINATIONS */}
              {activeTab === 'exams' && (
                <ExaminationManagement
                  exams={exams}
                  classes={classes}
                  userRole={(effectiveUser || currentUser).role}
                  currentUser={effectiveUser || currentUser}
                  onAddExamination={handleAddExamination}
                  onUpdateExamination={handleUpdateExamination}
                  onUpdateStatus={handleUpdateExamStatus}
                  onDeleteExamination={handleDeleteExamination}
                />
              )}

              {/* TAB: MARKS ENTRY GRID */}
              {activeTab === 'marks-entry' && (
                <MarksEntryTable
                  exams={exams}
                  classes={classes}
                  subjects={subjects}
                  students={marksStudents}
                  marks={marks}
                  grades={grades}
                  teachers={teachers}
                  currentUser={effectiveUser || currentUser}
                  userRole={(effectiveUser || currentUser).role}
                  onSaveMarks={handleSaveMarks}
                  onUpdateExamStatus={handleUpdateExamStatus}
                  onUpdateExamClassApproval={handleUpdateExamClassApproval}
                />
              )}

              {/* TAB: MARKS MONITORING (ADMIN) */}
              {activeTab === 'marks-monitoring' && (
                <MarksMonitoringView
                  exams={exams}
                  classes={classes}
                  subjects={subjects}
                  students={marksStudents}
                  marks={marks}
                  grades={grades}
                  teachers={teachers}
                  currentUser={effectiveUser || currentUser}
                  onNavigateToTab={handleSelectTab}
                />
              )}

              {/* TAB: CLASS TEACHER INDIVIDUAL MARKS MONITORING */}
              {activeTab === 'class-marks-monitoring' && (effectiveRole === 'class_teacher' || (effectiveUser || currentUser)?.role === 'class_teacher') && (
                <ClassTeacherMarksMonitoringView
                  exams={exams}
                  classes={classes}
                  subjects={subjects}
                  students={marksStudents}
                  marks={marks}
                  grades={grades}
                  teachers={teachers}
                  currentUser={effectiveUser || currentUser}
                  onNavigateToTab={handleSelectTab}
                  onMarksUpdated={handleMarksUpdated}
                />
              )}

              {/* TAB: ASSESSMENT STREAM APPROVAL (LEGACY COMPATIBILITY) */}
              {activeTab === 'stream-approval' && (
                <AssessmentStreamApprovalView
                  exams={exams}
                  classes={classes}
                  subjects={subjects}
                  students={marksStudents}
                  marks={marks}
                  grades={grades}
                  teachers={teachers}
                  currentUser={effectiveUser || currentUser}
                  onNavigateToTab={handleSelectTab}
                  onMarksUpdated={handleMarksUpdated}
                  onUpdateExamClassApproval={handleUpdateExamClassApproval}
                />
              )}

              {/* TAB: PROVISIONAL RESULTS VERIFICATION */}
              {activeTab === 'provisional' && (
                <ProvisionalResultsView
                  school={school}
                  exams={exams}
                  students={marksStudents}
                  subjects={subjects}
                  marks={marks}
                  grades={grades}
                  classes={classes}
                  teachers={teachers}
                  currentUser={effectiveUser || currentUser}
                  verificationLogs={verificationLogs}
                  onUpdateStatus={handleUpdateExamStatus}
                  onAddLog={handleAddVerificationLog}
                  onNavigateToTab={handleSelectTab}
                  onMarksUpdated={handleMarksUpdated}
                />
              )}

              {/* TAB: EXAMINATION ANALYSIS & VALIDATION */}
              {activeTab === 'exam-validation' && (effectiveUser || currentUser)?.role === 'admin' && (
                <ExaminationAnalysisValidation
                  exams={exams}
                  students={marksStudents}
                  classes={classes}
                  subjects={subjects}
                  marks={marks}
                  grades={grades}
                  teachers={teachers}
                  currentUser={effectiveUser || currentUser}
                  initialAdminViewMode="analysis"
                  onUpdateExamStatus={handleUpdateExamStatus}
                  onUpdateExamLevelApproval={handleUpdateExamLevelApproval}
                  onUpdateExamClassApproval={handleUpdateExamClassApproval}
                  onNavigateToTab={handleSelectTab}
                  onMarksUpdated={handleMarksUpdated}
                />
              )}

              {/* TAB: RESULTS APPROVAL */}
              {activeTab === 'results-approval' && (
                <>
                  {(effectiveUser || currentUser)?.role === 'admin' && (
                    <ExaminationAnalysisValidation
                      exams={exams}
                      students={marksStudents}
                      classes={classes}
                      subjects={subjects}
                      marks={marks}
                      grades={grades}
                      teachers={teachers}
                      currentUser={effectiveUser || currentUser}
                      initialAdminViewMode="stream-approvals"
                      onUpdateExamStatus={handleUpdateExamStatus}
                      onUpdateExamLevelApproval={handleUpdateExamLevelApproval}
                      onUpdateExamClassApproval={handleUpdateExamClassApproval}
                      onNavigateToTab={handleSelectTab}
                      onMarksUpdated={handleMarksUpdated}
                    />
                  )}
                  {(effectiveRole === 'class_teacher' || (effectiveUser || currentUser)?.role === 'class_teacher') && (
                    <AssessmentStreamApprovalView
                      exams={exams}
                      classes={classes}
                      subjects={subjects}
                      students={marksStudents}
                      marks={marks}
                      grades={grades}
                      teachers={teachers}
                      currentUser={effectiveUser || currentUser}
                      onNavigateToTab={handleSelectTab}
                      onMarksUpdated={handleMarksUpdated}
                      onUpdateExamClassApproval={handleUpdateExamClassApproval}
                    />
                  )}
                </>
              )}

              {/* TAB: REPORTS & MERIT LISTS */}
              {activeTab === 'reports' && (
                <ReportsView
                  school={school}
                  students={marksStudents}
                  subjects={subjects}
                  exams={exams}
                  marks={marks}
                  grades={grades}
                  classes={classes}
                  teachers={teachers}
                  currentUser={effectiveUser || currentUser}
                  onNavigateToTab={handleSelectTab}
                  onMarksUpdated={handleMarksUpdated}
                  onUpdateExamClassApproval={handleUpdateExamClassApproval}
                />
              )}

              {/* TAB: SCHOOL PERFORMANCE ANALYTICS & RANKINGS */}
              {activeTab === 'school-analytics' && (
                <SchoolPerformanceAnalytics
                  school={school}
                  exams={exams}
                  students={students}
                  classes={classes}
                  subjects={subjects}
                  marks={marks}
                  grades={grades}
                  teachers={teachers}
                  currentUser={effectiveUser || currentUser}
                  onMarksUpdated={handleMarksUpdated}
                />
              )}

              {/* TAB: GRADING SETTINGS */}
              {activeTab === 'grading' && (
                <GradingSettings grades={grades} onUpdateGrades={handleUpdateGrades} />
              )}

              {/* TAB: SCHOOL PROFILE */}
              {activeTab === 'school-profile' && (
                <SchoolProfileView
                  school={school}
                  onSave={handleUpdateSchool}
                  readOnly={currentUser.role !== 'admin'}
                />
              )}

              {/* TAB: SYSTEM SETTINGS (ADMIN ONLY) */}
              {activeTab === 'system-settings' && currentUser.role === 'admin' && (
                <SystemSettingsPage
                  onNavigate={handleSelectTab}
                  school={school}
                  onSave={handleUpdateSchool}
                  grades={grades}
                  onUpdateGrades={handleUpdateGrades}
                  dbStatus={dbStatus}
                  onVerifyAndSync={verifyAndSyncSupabase}
                  students={students}
                  teachers={teachers}
                  classes={classes}
                  subjects={subjects}
                  exams={exams}
                  marks={marks}
                  onResetData={handleResetDemoData}
                />
              )}

              {/* TAB: DEVELOPER MODE (HIDDEN) */}
              {activeTab === 'developer-mode' && currentUser.role === 'admin' && (
                <DeveloperSettingsPage
                  dbStatus={dbStatus}
                  onVerifyAndSync={verifyAndSyncSupabase}
                  school={school}
                  students={students}
                  teachers={teachers}
                  classes={classes}
                  subjects={subjects}
                  exams={exams}
                  marks={marks}
                  grades={grades}
                  onResetData={handleResetDemoData}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation (Hidden for learner role & desktop screens) */}
      {(effectiveUser || currentUser).role !== 'learner' && (
        <MobileBottomNav
          currentRole={(effectiveUser || currentUser).role}
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          onOpenMore={() => setIsOpenMobileSidebar(true)}
        />
      )}
    

      {/* Modals */}
      {currentUser.role === 'admin' && isOpenSchoolProfileModal && (
        <SchoolProfileModal
          isOpen={isOpenSchoolProfileModal}
          school={school}
          onSave={handleUpdateSchool}
          onClose={() => setIsOpenSchoolProfileModal(false)}
        />
      )}

      {isOpenSupabaseModal && (
        <SupabaseModal
          isOpen={isOpenSupabaseModal}
          onClose={() => setIsOpenSupabaseModal(false)}
        />
      )}

      {profileStudent && (
        <LearnerProfileModal
          student={profileStudent}
          classes={classes}
          subjects={subjects}
          exams={exams}
          marks={marks}
          grades={grades}
          teachers={teachers}
          currentUser={currentUser}
          onClose={() => setProfileStudent(null)}
        />
      )}

      {isOpenSearchModal && (
        <GlobalSearchModal
          isOpen={isOpenSearchModal}
          onClose={() => setIsOpenSearchModal(false)}
          currentUser={currentUser}
          activeTeacher={activeTeacher}
          students={students}
          teachers={teachers}
          classes={classes}
          subjects={subjects}
          exams={exams}
          academicYears={api.getAcademicYears()}
          schoolTerms={api.getSchoolTerms()}
          onSelectResult={handleSelectSearchResult}
        />
      )}

      {/* Non-blocking Warning Toast (25-min Inactivity or 7h45m 8-Hour Session Limit) */}
      <InactivityWarningToast
        isOpen={isWarningVisible && !isSessionLocked}
        warningType={warningType}
        onStaySignedIn={resetActivity}
        onDismiss={dismissWarning}
        minutesRemaining={warningType === 'max_session' ? 15 : 5}
      />

      {/* Non-Destructive Workspace Lock & Re-Authentication Modal (30-min idle or 8-hour max session) */}
      <SessionLockModal
        isOpen={isSessionLocked}
        lockReason={lockReason}
        currentUser={currentUser}
        school={school}
        onUnlock={(updatedUser) => {
          const isMax = lockReason === 'max_session';
          if (isMax) {
            authService.recordSessionStart(Date.now());
          }
          setCurrentUser(updatedUser);
          unlockSession(isMax);
        }}
        onSignOut={handleLogout}
      />
    </div>
    </AcademicSessionProvider>
  );
}
