import React from 'react';
import {
  Calendar,
  ChevronRight,
  LayoutDashboard,
  Users,
  UserCheck,
  Building2,
  BookMarked,
  FileSpreadsheet,
  CheckSquare,
  FileBarChart,
  Settings,
  TrendingUp,
  GraduationCap,
  BarChart3,
  Database,
  Layers,
  ShieldCheck,
  Award,
  FileCheck2,
  Activity,
  Sliders,
} from 'lucide-react';
import { TabType } from './Sidebar';
import { useAcademicSession } from '../contexts/AcademicSessionContext';

interface ModuleIndicatorProps {
  activeTab: TabType;
  className?: string;
}

interface TabMeta {
  title: string;
  category: string;
  icon: React.ReactNode;
}

const TAB_META_MAP: Record<TabType, TabMeta> = {
  dashboard: {
    title: 'Executive Dashboard',
    category: 'Overview',
    icon: <LayoutDashboard className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
  },
  'academic-session': {
    title: 'Academic Year & Term Setup',
    category: 'Academic Operations',
    icon: <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
  },
  students: {
    title: 'Learner Management',
    category: 'Learners',
    icon: <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
  },
  'student-promotion': {
    title: 'Learner Academic Progression',
    category: 'Learners',
    icon: <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
  },
  teachers: {
    title: 'Teacher Management',
    category: 'Staffing',
    icon: <UserCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
  },
  classes: {
    title: 'Classes & Stream Allocations',
    category: 'Structures',
    icon: <Building2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
  },
  subjects: {
    title: 'Learning Area Allocations',
    category: 'Curriculum',
    icon: <BookMarked className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
  },
  exams: {
    title: 'Assessment Setup & Governance',
    category: 'Assessments',
    icon: <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
  },
  'marks-entry': {
    title: 'Assessment Marks Entry',
    category: 'Assessments',
    icon: <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
  },
  'marks-monitoring': {
    title: 'School-wide Marks Monitoring',
    category: 'Quality Control',
    icon: <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
  },
  'class-marks-monitoring': {
    title: 'Class Marks Entry Progress',
    category: 'Quality Control',
    icon: <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
  },
  'stream-approval': {
    title: 'Class Teacher Verification',
    category: 'Quality Control',
    icon: <FileCheck2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
  },
  'results-approval': {
    title: 'HOD & Principal Results Approval',
    category: 'Quality Control',
    icon: <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
  },
  provisional: {
    title: 'Provisional Broad Sheets & Ranks',
    category: 'Reports & Analytics',
    icon: <FileBarChart className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
  },
  'exam-validation': {
    title: 'Score Range Validation',
    category: 'Quality Control',
    icon: <Sliders className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
  },
  reports: {
    title: 'Report Cards & Merit Lists',
    category: 'Reports & Analytics',
    icon: <FileBarChart className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
  },
  'school-analytics': {
    title: 'Institutional Performance Analytics',
    category: 'Reports & Analytics',
    icon: <BarChart3 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
  },
  grading: {
    title: 'CBE Assessment & Grading System',
    category: 'Academic Operations',
    icon: <Award className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
  },
  'school-profile': {
    title: 'Institutional Profile & Crest',
    category: 'System Admin',
    icon: <Building2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
  },
  'system-settings': {
    title: 'System Settings',
    category: 'System Admin',
    icon: <Settings className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
  },
  'developer-mode': {
    title: 'Database & System Diagnostics',
    category: 'System Admin',
    icon: <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
  },
  'learner-portal': {
    title: 'Learner Results Portal',
    category: 'Learner Workspace',
    icon: <GraduationCap className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
  },
};

export const ModuleIndicator: React.FC<ModuleIndicatorProps> = ({ activeTab, className }) => {
  const { viewingTerm, viewingYear, isViewingActiveSession } = useAcademicSession();
  const meta = TAB_META_MAP[activeTab] || {
    title: activeTab.replace('-', ' '),
    category: 'Workspace',
    icon: <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
  };

  return (
    <nav
      aria-label="Module Breadcrumb Context"
      className={`mb-4 bg-white dark:bg-slate-900/90 border border-slate-200/90 dark:border-slate-800 rounded-xl px-3.5 py-2.5 shadow-2xs flex flex-wrap items-center justify-between gap-2.5 transition-colors ${
        className || ''
      }`}
    >
      {/* Session + Module Trail */}
      <div className="flex items-center flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-300 min-w-0">
        {/* Term / Academic Session Chip */}
        <div className="inline-flex items-center space-x-1.5 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 px-2.5 py-1 rounded-lg border border-emerald-200/80 dark:border-emerald-800/60 font-semibold shrink-0">
          <Calendar className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
          <span>
            {viewingTerm?.term_name || 'Term'} • {viewingYear?.year || ''}
          </span>
          {isViewingActiveSession ? (
            <span className="text-[9px] bg-[#075E42] text-white px-1.5 py-0.2 rounded font-bold uppercase tracking-wider ml-1">
              Active
            </span>
          ) : (
            <span className="text-[9px] bg-amber-600 text-white px-1.5 py-0.2 rounded font-bold uppercase tracking-wider ml-1">
              Archive
            </span>
          )}
        </div>

        <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-600 shrink-0" />

        {/* Current Active Module Name */}
        <div className="inline-flex items-center space-x-1.5 text-slate-900 dark:text-slate-100 font-bold text-xs sm:text-sm min-w-0">
          <div className="p-1 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shrink-0">
            {meta.icon}
          </div>
          <span className="truncate">{meta.title}</span>
        </div>
      </div>

      {/* Module Group / Category Badge */}
      <div className="hidden sm:flex items-center space-x-1.5 text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
        <span className="bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 rounded-lg font-medium border border-slate-200/80 dark:border-slate-700/80">
          Module: <strong className="text-slate-800 dark:text-slate-200 font-bold">{meta.category}</strong>
        </span>
      </div>
    </nav>
  );
};
