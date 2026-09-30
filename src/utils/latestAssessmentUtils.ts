import {
  Examination,
  EducationLevel,
  ClassStream,
  Student,
  Teacher,
  Mark,
  ALL_EDUCATION_LEVELS,
  getEducationLevelForGrade,
  extractGradeName,
} from '../types';
import { isClassInExamScope } from './filterUtils';
import { isExamApplicableToClassStream } from './teacherExamReminderUtils';
import { getDisplayExamName } from './examDisplayUtils';

export interface ExamScopeDetails {
  level: EducationLevel | 'All Levels';
  grade: string | null;
  scopeLabel: string;
  shortScopeBadge: string;
  isSpecificToGrade: boolean;
  isSpecificToLevel: boolean;
  targetClassName?: string;
}

const TERM_ORDER: Record<string, number> = {
  'Term 3': 3,
  'Term 2': 2,
  'Term 1': 1,
};

const STATUS_PRIORITY: Record<string, number> = {
  'Open': 6,
  'Provisional': 5,
  'Approved': 4,
  'Published': 3,
  'Draft': 2,
  'Archived': 1,
};

function extractExplicitGrade(text?: string | null): string | null {
  if (!text) return null;
  const match = text.match(/\b(Grade\s*\d+|PP[12]|Playgroup)\b/i);
  if (!match) return null;
  const raw = match[0].trim();
  if (raw.toLowerCase().startsWith('grade')) {
    const num = raw.replace(/\D/g, '');
    return `Grade ${num}`;
  }
  return raw.toUpperCase();
}

function extractExplicitLevel(text?: string | null): EducationLevel | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  if (lower.includes('junior school') || lower.includes('junior secondary')) return 'Junior School';
  if (lower.includes('upper primary')) return 'Upper Primary';
  if (lower.includes('lower primary')) return 'Lower Primary';
  if (lower.includes('pre-primary') || lower.includes('early years')) return 'Pre-Primary';
  return null;
}

/**
 * Resolves the education level, target grade, and descriptive human-readable scope
 * for any given examination entity.
 */
export function resolveExamScope(
  exam: Examination | null | undefined,
  classes: ClassStream[] = []
): ExamScopeDetails {
  if (!exam) {
    return {
      level: 'All Levels',
      grade: null,
      scopeLabel: 'School-Wide (PP1–Grade 9)',
      shortScopeBadge: 'School-Wide',
      isSpecificToGrade: false,
      isSpecificToLevel: false,
    };
  }

  // 1. Check if exam.class_id points to a specific ClassStream or Grade
  let targetGrade: string | null = null;
  let targetClassStream: ClassStream | undefined = undefined;

  if (exam.class_id && exam.class_id !== 'all') {
    targetClassStream = classes.find(
      (c) => c.id === exam.class_id || c.stream_id === exam.class_id
    );
    if (targetClassStream) {
      targetGrade = targetClassStream.class_name;
    } else {
      const extracted = extractExplicitGrade(exam.class_id);
      if (extracted) {
        targetGrade = extracted;
      }
    }
  }

  // 2. If no grade resolved yet, infer from exam_name (e.g. "Grade 9 Opener Assessment")
  if (!targetGrade && exam.exam_name) {
    const extractedFromTitle = extractExplicitGrade(exam.exam_name);
    if (extractedFromTitle) {
      targetGrade = extractedFromTitle;
    }
  }

  // 3. Resolve Education Level
  let resolvedLevel: EducationLevel | 'All Levels' = 'All Levels';

  if (targetGrade) {
    const lvl = getEducationLevelForGrade(targetGrade);
    if (lvl) {
      resolvedLevel = lvl;
    }
  } else if (
    exam.education_level &&
    (exam.education_level as string) !== 'all' &&
    (exam.education_level as string) !== 'All Levels'
  ) {
    resolvedLevel = exam.education_level;
  } else if (exam.exam_name) {
    const extractedLvl = extractExplicitLevel(exam.exam_name);
    if (extractedLvl) {
      resolvedLevel = extractedLvl;
    }
  }

  // 4. Construct human-readable scope labels
  const isSpecificToGrade = Boolean(targetGrade);
  const isSpecificToLevel = resolvedLevel !== 'All Levels' && !isSpecificToGrade;

  let scopeLabel = 'School-Wide (PP1–Grade 9)';
  let shortScopeBadge = 'School-Wide';

  // Check if exam is explicitly stream-specific (e.g. title mentions stream name or is_stream_specific flag)
  const streamInTitle = targetClassStream?.stream && exam.exam_name
    ? new RegExp(`\\b${targetClassStream.stream}\\b`, 'i').test(exam.exam_name)
    : false;
  const isExplicitlyStreamSpecific = Boolean((exam as any).is_stream_specific || streamInTitle);

  if (targetClassStream && targetClassStream.stream && isExplicitlyStreamSpecific) {
    scopeLabel = `${targetClassStream.class_name} ${targetClassStream.stream} (${resolvedLevel})`;
    shortScopeBadge = `${targetClassStream.class_name} ${targetClassStream.stream}`;
  } else if (targetGrade) {
    // Check if there are multiple streams for this grade in the school
    const gradeStreams = classes.filter(
      (c) => (c.class_name || '').toLowerCase() === targetGrade?.toLowerCase()
    );
    const hasMultipleStreams = gradeStreams.length > 1;

    if (hasMultipleStreams) {
      scopeLabel = `${resolvedLevel} • ${targetGrade} (All Streams)`;
      shortScopeBadge = `${targetGrade} (All Streams)`;
    } else {
      scopeLabel = `${resolvedLevel} • ${targetGrade}`;
      shortScopeBadge = `${targetGrade}`;
    }
  } else if (isSpecificToLevel) {
    const gradeRange =
      resolvedLevel === 'Junior School'
        ? 'Grades 7–9'
        : resolvedLevel === 'Upper Primary'
        ? 'Grades 4–6'
        : resolvedLevel === 'Lower Primary'
        ? 'Grades 1–3'
        : 'PP1–PP2';
    scopeLabel = `${resolvedLevel} (${gradeRange})`;
    shortScopeBadge = resolvedLevel;
  }

  return {
    level: resolvedLevel,
    grade: targetGrade,
    scopeLabel,
    shortScopeBadge,
    isSpecificToGrade,
    isSpecificToLevel,
    targetClassName: targetClassStream ? `${targetClassStream.class_name} ${targetClassStream.stream || ''}`.trim() : targetGrade || undefined,
  };
}

/**
 * Pure function: Sorts examinations strictly by chronological recency:
 * 1. Current session alignment (activeYear + activeTerm first)
 * 2. Academic Year descending (2026 > 2025)
 * 3. School Term descending (Term 3 > Term 2 > Term 1)
 * 4. Timestamp / date created descending (most recent date first)
 * 5. Workflow status priority (Open > Provisional > Approved > Published > Draft > Archived)
 * 6. Deterministic exam_name alphabetical fallback
 */
export function sortExamsChronologically(
  exams: Examination[] = [],
  activeYear?: number,
  activeTerm?: string
): Examination[] {
  if (!Array.isArray(exams) || exams.length <= 1) return [...(exams || [])];

  return [...exams].sort((a, b) => {
    // 1. Session alignment
    const aIsCurrentSession =
      activeYear !== undefined &&
      activeTerm !== undefined &&
      a.year === activeYear &&
      a.term === activeTerm;
    const bIsCurrentSession =
      activeYear !== undefined &&
      activeTerm !== undefined &&
      b.year === activeYear &&
      b.term === activeTerm;

    if (aIsCurrentSession && !bIsCurrentSession) return -1;
    if (!aIsCurrentSession && bIsCurrentSession) return 1;

    // 2. Year descending
    const yearA = a.year || 0;
    const yearB = b.year || 0;
    if (yearA !== yearB) return yearB - yearA;

    // 3. Term descending
    const termValA = TERM_ORDER[a.term] || 0;
    const termValB = TERM_ORDER[b.term] || 0;
    if (termValA !== termValB) return termValB - termValA;

    // 4. Creation/Update date descending
    const rawDateA = a.created_at || a.date_created || a.updated_at || a.start_date || '';
    const rawDateB = b.created_at || b.date_created || b.updated_at || b.start_date || '';
    const timeA = rawDateA ? new Date(rawDateA).getTime() : 0;
    const timeB = rawDateB ? new Date(rawDateB).getTime() : 0;
    if (!isNaN(timeA) && !isNaN(timeB) && timeA !== timeB && timeA > 0 && timeB > 0) {
      return timeB - timeA;
    }

    // 5. Status Priority
    const statusValA = STATUS_PRIORITY[a.status] || 0;
    const statusValB = STATUS_PRIORITY[b.status] || 0;
    if (statusValA !== statusValB) return statusValB - statusValA;

    // 6. Deterministic string sort
    return (a.exam_name || '').localeCompare(b.exam_name || '');
  });
}

export interface GetLatestAssessmentOptions {
  levelFilter?: string; // 'all' or EducationLevel
  gradeFilter?: string; // 'all' or specific grade e.g. 'Grade 8'
  classId?: string; // specific class UUID or 'all'
  classes?: ClassStream[];
  student?: Student;
  teacher?: Teacher;
  marks?: Mark[];
  students?: Student[];
  activeYear?: number;
  activeTerm?: string;
  excludeDrafts?: boolean;
}

/**
 * Pure function: Resolves the single truthful latest assessment matching the specified
 * educational level, grade, class, or teacher/student scope.
 */
export function getLatestAssessment(
  exams: Examination[] = [],
  options: GetLatestAssessmentOptions = {}
): Examination | null {
  if (!Array.isArray(exams) || exams.length === 0) return null;

  const {
    levelFilter = 'all',
    gradeFilter = 'all',
    classId = 'all',
    classes = [],
    student,
    teacher,
    marks = [],
    students = [],
    activeYear,
    activeTerm,
    excludeDrafts = false,
  } = options;

  let candidates = [...exams];

  if (excludeDrafts) {
    candidates = candidates.filter((e) => e.status !== 'Draft');
  }

  // 1. If scoped to a specific student
  if (student) {
    const studentGrade = student.grade;
    const stdClass = classes.find((c) => c.id === student.class_id || c.stream_id === student.stream_id);
    const resolvedGrade = studentGrade || stdClass?.class_name;
    const resolvedLevel = student.education_level || stdClass?.education_level || (resolvedGrade ? getEducationLevelForGrade(resolvedGrade) : undefined);

    candidates = candidates.filter((e) => {
      if (stdClass && !isClassInExamScope(stdClass, e)) return false;
      if (resolvedGrade) {
        const scope = resolveExamScope(e, classes);
        if (scope.grade && scope.grade.toLowerCase() !== resolvedGrade.toLowerCase()) return false;
        if (scope.level !== 'All Levels' && resolvedLevel && scope.level !== resolvedLevel) return false;
      }
      return true;
    });
  }
  // 2. If scoped to a specific teacher
  else if (teacher) {
    const teacherClassStreams = classes.filter(
      (c) =>
        c.class_teacher_id === teacher.id ||
        (teacher.user_id && c.class_teacher_id === teacher.user_id) ||
        (teacher.tsc_number && c.class_teacher_id === teacher.tsc_number) ||
        (teacher.is_class_teacher &&
          teacher.class_teacher_of_id &&
          ((c.stream_id && c.stream_id === teacher.class_teacher_of_id) ||
            c.id === teacher.class_teacher_of_id)) ||
        (Array.isArray(teacher.allocations) &&
          teacher.allocations.some(
            (a) => a.class_id === c.id || a.stream_id === c.stream_id || a.class_id === c.stream_id
          ))
    );

    if (teacherClassStreams.length > 0) {
      candidates = candidates.filter((e) =>
        teacherClassStreams.some((cs) =>
          isExamApplicableToClassStream(e, cs, marks, students, classes)
        )
      );
    }
  }
  // 3. If filtered by grade
  else if (gradeFilter && gradeFilter !== 'all') {
    candidates = candidates.filter((e) => {
      const scope = resolveExamScope(e, classes);
      if (scope.grade) {
        return scope.grade.toLowerCase() === gradeFilter.toLowerCase();
      }
      // If exam is level-wide, check if grade belongs to that level
      if (scope.level !== 'All Levels') {
        const gradeLevel = getEducationLevelForGrade(gradeFilter);
        return gradeLevel === scope.level;
      }
      // School-wide exam applies to all grades
      return true;
    });
  }
  // 4. If filtered by level
  else if (levelFilter && levelFilter !== 'all') {
    candidates = candidates.filter((e) => {
      const scope = resolveExamScope(e, classes);
      if (scope.level !== 'All Levels') {
        return scope.level === levelFilter;
      }
      // If exam has a specific grade, verify grade's level
      if (scope.grade) {
        const gradeLevel = getEducationLevelForGrade(scope.grade);
        return gradeLevel === levelFilter;
      }
      // School-wide exam is included
      return true;
    });
  }
  // 5. If filtered by classId
  else if (classId && classId !== 'all') {
    const cls = classes.find((c) => c.id === classId || c.stream_id === classId);
    if (cls) {
      candidates = candidates.filter((e) => isClassInExamScope(cls, e));
    }
  }

  if (candidates.length === 0) return null;

  const sorted = sortExamsChronologically(candidates, activeYear, activeTerm);
  return sorted[0] || null;
}

/**
 * Resolves the latest assessment for each of the 4 standard CBE education levels.
 */
export function getLatestAssessmentsByEducationLevel(
  exams: Examination[] = [],
  classes: ClassStream[] = [],
  activeYear?: number,
  activeTerm?: string
): Record<EducationLevel, Examination | null> {
  const result: Record<EducationLevel, Examination | null> = {
    'Pre-Primary': null,
    'Lower Primary': null,
    'Upper Primary': null,
    'Junior School': null,
  };

  ALL_EDUCATION_LEVELS.forEach((level) => {
    result[level] = getLatestAssessment(exams, {
      levelFilter: level,
      classes,
      activeYear,
      activeTerm,
    });
  });

  return result;
}

/**
 * Detects and returns ALL examinations whose marks are currently being keyed / active
 * for marks entry in the current academic session and filter scope.
 * 
 * An assessment is "currently being keyed" if:
 * 1. Its status is 'Open', 'Provisional', or 'Draft' (i.e. active for marks keying or stream verification).
 * 2. It matches the active academic session (year & term) and filter scope (level/grade/class/teacher).
 * 
 * If multiple exams are currently active (e.g. Grade 9 Opener AND Upper Primary Mid-Term),
 * this function returns ALL of them (e.g. 2 or more exams) so the dashboard can display all of them truthful to each level/class.
 */
export function getActiveKeyingAssessments(
  exams: Examination[] = [],
  options: GetLatestAssessmentOptions = {}
): Examination[] {
  if (!Array.isArray(exams) || exams.length === 0) return [];

  const {
    levelFilter = 'all',
    gradeFilter = 'all',
    classId = 'all',
    classes = [],
    student,
    teacher,
    marks = [],
    students = [],
    activeYear,
    activeTerm,
  } = options;

  let candidates = [...exams];

  // 1. Filter by student/teacher/grade/level/class scope
  if (student) {
    const studentGrade = student.grade;
    const stdClass = classes.find((c) => c.id === student.class_id || c.stream_id === student.stream_id);
    const resolvedGrade = studentGrade || stdClass?.class_name;
    const resolvedLevel = student.education_level || stdClass?.education_level || (resolvedGrade ? getEducationLevelForGrade(resolvedGrade) : undefined);

    candidates = candidates.filter((e) => {
      if (stdClass && !isClassInExamScope(stdClass, e)) return false;
      if (resolvedGrade) {
        const scope = resolveExamScope(e, classes);
        if (scope.grade && scope.grade.toLowerCase() !== resolvedGrade.toLowerCase()) return false;
        if (scope.level !== 'All Levels' && resolvedLevel && scope.level !== resolvedLevel) return false;
      }
      return true;
    });
  } else if (teacher) {
    const teacherClassStreams = classes.filter(
      (c) =>
        c.class_teacher_id === teacher.id ||
        (teacher.user_id && c.class_teacher_id === teacher.user_id) ||
        (teacher.tsc_number && c.class_teacher_id === teacher.tsc_number) ||
        (teacher.is_class_teacher &&
          teacher.class_teacher_of_id &&
          ((c.stream_id && c.stream_id === teacher.class_teacher_of_id) ||
            c.id === teacher.class_teacher_of_id)) ||
        (Array.isArray(teacher.allocations) &&
          teacher.allocations.some(
            (a) => a.class_id === c.id || a.stream_id === c.stream_id || a.class_id === c.stream_id
          ))
    );

    if (teacherClassStreams.length > 0) {
      candidates = candidates.filter((e) =>
        teacherClassStreams.some((cs) =>
          isExamApplicableToClassStream(e, cs, marks, students, classes)
        )
      );
    }
  } else if (gradeFilter && gradeFilter !== 'all') {
    candidates = candidates.filter((e) => {
      const scope = resolveExamScope(e, classes);
      if (scope.grade) {
        return scope.grade.toLowerCase() === gradeFilter.toLowerCase();
      }
      if (scope.level !== 'All Levels') {
        const gradeLevel = getEducationLevelForGrade(gradeFilter);
        return gradeLevel === scope.level;
      }
      return true;
    });
  } else if (levelFilter && levelFilter !== 'all') {
    candidates = candidates.filter((e) => {
      const scope = resolveExamScope(e, classes);
      if (scope.level !== 'All Levels') {
        return scope.level === levelFilter;
      }
      if (scope.grade) {
        const gradeLevel = getEducationLevelForGrade(scope.grade);
        return gradeLevel === levelFilter;
      }
      return true;
    });
  } else if (classId && classId !== 'all') {
    const cls = classes.find((c) => c.id === classId || c.stream_id === classId);
    if (cls) {
      candidates = candidates.filter((e) => isClassInExamScope(cls, e));
    }
  }

  // 2. Identify exams whose marks are currently being keyed (status: 'Open', 'Provisional', or 'Draft')
  const activeKeyingExams = candidates.filter(
    (e) => e.status === 'Open' || e.status === 'Provisional' || e.status === 'Draft'
  );

  if (activeKeyingExams.length > 0) {
    return sortExamsChronologically(activeKeyingExams, activeYear, activeTerm);
  }

  // Fallback: If no exam is currently open/provisional/draft for keying, return latest completed exam(s)
  const latest = getLatestAssessment(candidates, { ...options, excludeDrafts: false });
  return latest ? [latest] : [];
}
