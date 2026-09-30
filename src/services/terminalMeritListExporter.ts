import * as rawJsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { ensureSafeJsPdf } from '../utils/pdfSafeUtils';
import { savePdf } from '../utils/fileDownloader';

const jsPDFConstructor = (rawJsPDF as any).jsPDF || (rawJsPDF as any).default || rawJsPDF;
import {
  School,
  Student,
  Subject,
  ClassStream,
  Teacher,
  Grade,
  getEducationLevelForGrade,
} from '../types';
import {
  LearningAreaTerminalResult,
} from './terminalResultsEngine';
import {
  TerminalLearnerRanking,
  LearnerCohortEntry,
  calculateCohortTerminalRankings,
} from './terminalRankingEngine';
import { getGradeForMark, CBE_8_POINT_GRADES, getLearnerReportSubjects } from './analysisEngine';
import { formatTwoDecimalAverage } from '../utils/markUtils';
import { sortSubjectsByStandardOrder } from './meritListExporter';
import { resolveSubjectTeacher } from '../utils/teacherResolutionUtils';

// Helper to convert image URL to Base64 for school logo (max 240px asset optimization)
async function getBase64ImageFromUrl(imageUrl?: string | null): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.trim()) return null;

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 2500);
    try {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        clearTimeout(timer);
        try {
          const MAX_DIM = 240; // 240px maximum embedded image dimension
          let width = img.naturalWidth || img.width || 240;
          let height = img.naturalHeight || img.height || 240;

          if (width > MAX_DIM || height > MAX_DIM) {
            if (width >= height) {
              height = Math.round((height * MAX_DIM) / width);
              width = MAX_DIM;
            } else {
              width = Math.round((width * MAX_DIM) / height);
              height = MAX_DIM;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/png');
            resolve({ dataUrl, width, height });
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
      img.src = imageUrl;
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

function getLearnerFullName(student: Student): string {
  if (student.full_name && student.full_name.trim()) return student.full_name.trim();
  const combined = `${student.first_name || ''} ${student.last_name || ''}`.trim();
  return combined || '—';
}

export function getSubjectDisplayName(sb: Subject): string {
  return sb.subject_name || (sb as any).name || 'Unnamed Subject';
}

export function getSubjectDisplayCode(sb: Subject): string {
  return sb.subject_code || (sb as any).code || '';
}

export function formatSubjectResultCell(res?: LearningAreaTerminalResult | null): {
  pctText: string;
  lvlText: string;
  isSpecial: boolean;
  specialCode: string;
} {
  if (!res) {
    return { pctText: '', lvlText: '', isSpecial: false, specialCode: '' };
  }
  const pct = res.terminalPercentage ?? (res as any).percentage ?? null;
  const lvl = res.cbePerformanceLevel ?? (res as any).performanceLevel ?? '';

  if (res.status === 'INCOMPLETE (X)' || (res.status as any) === 'X') {
    return { pctText: 'X', lvlText: '', isSpecial: true, specialCode: 'X' };
  }
  if (res.status === 'INCOMPLETE (Y)' || (res as any) === 'Y') {
    const code = (res as any).irregularityReason === 'Absent' ? 'X' : 'Y';
    return { pctText: code, lvlText: '', isSpecial: true, specialCode: code };
  }
  if (res.status === 'INCOMPLETE (X/Y)' || (res as any) === 'X/Y') {
    return { pctText: 'X/Y', lvlText: '', isSpecial: true, specialCode: 'X/Y' };
  }
  if (pct !== null && pct !== undefined && Number.isFinite(pct)) {
    return { pctText: String(pct), lvlText: lvl, isSpecial: false, specialCode: '' };
  }
  return { pctText: '', lvlText: '', isSpecial: false, specialCode: '' };
}

export interface SubjectColumnStat {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  validCount: number;
  totalPercentageSum: number;
  averagePercentage: number;
  averagePoints: number;
  performanceLevel: string;
  assignedTeacherName: string;
}

export interface TerminalMeritLearnerRow {
  student: Student;
  ranking?: TerminalLearnerRanking;
  subjectResults: Map<string, LearningAreaTerminalResult>;
  displayPosition: string; // blank "" for unranked
  terminalTotalMarks: number | null;
  learnerAverageMarks: number | null;
  learnerAveragePoints: number | null;
  overallPerformanceLevel: string;
  isRankable: boolean;
}

export interface TerminalMeritGenderStat {
  boysCount: number;
  girlsCount: number;
  totalCount: number;
}

export interface TerminalMeritSummaryStats {
  enrolledCount: number;
  rankableCount: number;
  unrankableCount: number;
  classCurriculumMax: number;
  classAverageMarks: number;
  classMeanPercentage: number;
  classMeanPoints: number;
  overallPerformanceLevel: string;
  genderDistribution: TerminalMeritGenderStat;
  subjectStats: Map<string, SubjectColumnStat>;
}

export interface TerminalMeritListData {
  title: string;
  school: School;
  academicYear: number;
  term: string;
  educationLevel: string;
  grade: string;
  streamName: string;
  isStreamView: boolean;
  isProvisionalMode: boolean;
  activeSubjects: Subject[];
  learners: TerminalMeritLearnerRow[];
  summaryStats: TerminalMeritSummaryStats;
  generatedAt: string;
  classes?: ClassStream[];
  teachers?: Teacher[];
  examName?: string;
  examCode?: string;
  classTeachersStr?: string;
  logoBase64?: { dataUrl: string; width: number; height: number } | null;
}

/**
 * Resolve assigned subject teacher for a given class/stream and subject.
 * STRICT REQUIREMENT: If no subject teacher is assigned, return empty string "".
 * NEVER fallback to class teacher or placeholder.
 */
export function resolveSubjectTeacherName(
  subjectId: string,
  classId?: string,
  streamId?: string,
  teachers: Teacher[] = []
): string {
  const teacher = resolveSubjectTeacher(teachers, subjectId, classId, streamId);
  return teacher?.teacher_name || (teacher as any)?.full_name || (teacher as any)?.name || '';
}

/**
 * Strict stream isolation filter to ensure sibling stream learners never bleed into another stream's cohort.
 */
export function isLearnerInSelectedClassStream(student: Student, targetClassStream: ClassStream | null | undefined): boolean {
  if (!targetClassStream) return true;

  const targetStreamId = targetClassStream.stream_id || targetClassStream.id;
  const targetStreamName = (targetClassStream.stream || (targetClassStream as any).stream_name || '').trim().toLowerCase();
  const targetClassName = (targetClassStream.class_name || '').trim().toLowerCase();

  const studentStreamName = (((student as any).stream || (student as any).stream_name || '') as string).trim().toLowerCase();
  const studentClassName = (student.grade || (student as any).class_name || '').trim().toLowerCase();

  // 1. Authoritative Stream Matching when student has a specific stream_id set
  if (student.stream_id) {
    if (student.stream_id === targetStreamId || student.stream_id === targetClassStream.id) return true;
    // If student has a stream_id and it points to another stream, reject!
    return false;
  }

  // 2. Exact stream text name matching (e.g. "Blue" vs "Red")
  if (studentStreamName && targetStreamName) {
    if (studentStreamName === targetStreamName) {
      if (targetClassName && studentClassName) {
        return studentClassName === targetClassName;
      }
      return true;
    }
    return false;
  }

  // 3. Fallback to class_id matching ONLY if targetClassStream has no stream designation
  if (!targetStreamName && !targetClassStream.stream_id) {
    return student.class_id === targetClassStream.id;
  }

  return false;
}

export function getClassTeachersString(
  grade: string,
  classes: ClassStream[] = [],
  teachers: Teacher[] = []
): string {
  const gradeClasses = classes.filter(
    (c) => (c.class_name || '').toLowerCase() === grade.toLowerCase()
  );
  if (gradeClasses.length === 0) return '................';

  const parts: string[] = [];
  for (const cls of gradeClasses) {
    const streamName = cls.stream || cls.class_name || 'Stream';
    let teacherName = '.................';
    if (cls.class_teacher_id && teachers.length > 0) {
      const t = teachers.find((tch) => tch.id === cls.class_teacher_id);
      if (t) teacherName = t.teacher_name || (t as any).full_name || (t as any).name || '.................';
    }
    parts.push(`${streamName.toUpperCase()} — ${teacherName}`);
  }
  return parts.length > 0 ? parts.join(' | ') : '................';
}

export function getStreamNameForLearner(student: Student, classes: ClassStream[] = []): string {
  if (!student) return '—';

  // 1. Direct stream property on student if present
  const directStream = (student as any).stream || (student as any).stream_name || (student as any).stream_name_text;

  // 2. Lookup by student.stream_id or student.class_id in classes
  const targetId = student.stream_id || student.class_id;
  if (targetId && classes && classes.length > 0) {
    const matched = classes.find(
      (c) => c.stream_id === targetId || c.id === targetId
    );
    if (matched) {
      const stName = matched.stream || (matched as any).stream_name || (matched as any).name;
      if (stName && String(stName).trim() !== '') return String(stName).trim();
    }
  }

  // 3. Match by student.class_id in classes when class_id is different from stream_id
  if (student.class_id && classes && classes.length > 0) {
    const matched = classes.find((c) => c.id === student.class_id);
    if (matched) {
      const stName = matched.stream || (matched as any).stream_name || (matched as any).name;
      if (stName && String(stName).trim() !== '') return String(stName).trim();
    }
  }

  // 4. Direct student stream property fallback
  if (directStream && String(directStream).trim() !== '') {
    const raw = String(directStream).trim();
    if (student.grade && raw.toLowerCase().startsWith(student.grade.toLowerCase())) {
      const cleaned = raw.substring(student.grade.length).trim().replace(/^[-–—:]\s*/, '');
      if (cleaned) return cleaned;
    }
    return raw;
  }

  return '—';
}

/**
 * Pure generator creating the authoritative, normalized Terminal Merit List dataset.
 * Consumed identically by Web UI, PDF, Excel, and CSV.
 */
export function generateTerminalMeritDataset(params: {
  school: School;
  academicYear: number;
  term: string;
  grade: string;
  selectedStreamId?: string;
  classes: ClassStream[];
  students: Student[];
  subjects: Subject[];
  teachers?: Teacher[];
  grades?: Grade[];
  isProvisionalMode?: boolean;
  learnerResultsMap: Map<string, Map<string, LearningAreaTerminalResult>>;
}): TerminalMeritListData {
  const {
    school,
    academicYear,
    term,
    grade,
    selectedStreamId = 'all',
    classes = [],
    students = [],
    subjects = [],
    teachers = [],
    grades = CBE_8_POINT_GRADES,
    isProvisionalMode = false,
    learnerResultsMap,
  } = params;

  const isStreamView = Boolean(selectedStreamId && selectedStreamId !== 'all');

  // 1. Resolve Stream Name
  let streamName = 'All Streams (General Grade View)';
  let targetClassStream: ClassStream | undefined = undefined;

  if (isStreamView) {
    targetClassStream = classes.find(
      (c) => c.stream_id === selectedStreamId || c.id === selectedStreamId
    );
    if (targetClassStream) {
      streamName = targetClassStream.stream
        ? `${targetClassStream.class_name} - ${targetClassStream.stream}`
        : targetClassStream.class_name;
    }
  }

  const effectiveEduLevel =
    targetClassStream?.education_level || getEducationLevelForGrade(grade) || 'Junior School';

  // 2. Filter cohort students strictly
  const cohortStudents = students.filter((s) => {
    // Must match grade
    const sGrade = s.grade || (s as any).class_name || '';
    const matchGrade = sGrade.toLowerCase() === grade.toLowerCase();
    if (!matchGrade) return false;

    // If stream view, must match stream strictly
    if (isStreamView && targetClassStream) {
      return isLearnerInSelectedClassStream(s, targetClassStream);
    }

    return true;
  });

  // 3. Determine applicable subjects across cohort in standard CBE order
  const rawApplicableSet = new Map<string, Subject>();
  for (const st of cohortStudents) {
    const stClass = classes.find((c) => c.stream_id === st.stream_id || c.id === st.class_id);
    const stSubjs = getLearnerReportSubjects(st, stClass || targetClassStream, subjects, teachers);
    for (const sb of stSubjs) {
      if (sb && sb.id && !rawApplicableSet.has(sb.id)) {
        rawApplicableSet.set(sb.id, sb);
      }
    }
  }

  const unorderedSubjects = Array.from(rawApplicableSet.values());
  const activeSubjects =
    unorderedSubjects.length > 0
      ? sortSubjectsByStandardOrder(unorderedSubjects)
      : sortSubjectsByStandardOrder(
          subjects.filter(
            (s) =>
              !s.education_level ||
              s.education_level === effectiveEduLevel ||
              (s as any).level === effectiveEduLevel
          )
        );

  // 4. Build LearnerCohortEntry array for terminalRankingEngine
  const cohortEntries: LearnerCohortEntry[] = cohortStudents.map((st) => {
    const stClass = classes.find((c) => c.stream_id === st.stream_id || c.id === st.class_id);
    const stResults = learnerResultsMap.get(st.id) || new Map<string, LearningAreaTerminalResult>();
    return {
      student: st,
      classStream: stClass || targetClassStream,
      applicableSubjects: activeSubjects,
      resultsBySubject: stResults,
    };
  });

  // 5. Invoke Authoritative Terminal Ranking Engine
  const rankingsMap = calculateCohortTerminalRankings({
    learners: cohortEntries,
    isProvisionalMode,
  });

  // 6. Build Learner Rows
  const learnerRows: TerminalMeritLearnerRow[] = cohortStudents.map((st) => {
    const ranking = rankingsMap.get(st.id);
    const stResults = learnerResultsMap.get(st.id) || new Map<string, LearningAreaTerminalResult>();
    const isRankable = Boolean(ranking?.isRankable);

    // Position: Stream position for stream view, overall position for general grade view.
    // STRICT REQUIREMENT: Blank string "" for unranked learners.
    let displayPosition = '';
    if (isRankable && ranking) {
      const pos = isStreamView ? ranking.streamPosition : ranking.overallPosition;
      displayPosition = pos !== null ? String(pos) : '';
    }

    const terminalTotalMarks = isRankable && ranking ? ranking.terminalTotalMarks : null;

    // Learner Average Marks and Points
    let validSubjectCount = 0;
    let sumPercentages = 0;
    let sumPoints = 0;

    for (const sb of activeSubjects) {
      const res = stResults.get(sb.id);
      const pct = res?.terminalPercentage ?? (res as any)?.percentage ?? null;
      if (pct !== null && pct !== undefined && Number.isFinite(pct)) {
        validSubjectCount++;
        sumPercentages += pct;
        const gr = getGradeForMark(pct, grades, effectiveEduLevel, grade);
        sumPoints += gr.points;
      }
    }

    const learnerAverageMarks =
      validSubjectCount > 0 ? Math.round((sumPercentages / validSubjectCount) * 10) / 10 : null;
    const learnerAveragePoints =
      validSubjectCount > 0 ? Math.round((sumPoints / validSubjectCount) * 100) / 100 : null;

    const overallPerformanceLevel =
      learnerAverageMarks !== null
        ? getGradeForMark(Math.round(learnerAverageMarks), grades, effectiveEduLevel, grade).grade
        : 'INCOMPLETE';

    const augmentedRanking = ranking
      ? {
          ...ranking,
          status: (ranking as any).status || (!ranking.isRankable ? 'INC' : 'Complete'),
        }
      : undefined;

    return {
      student: st,
      ranking: augmentedRanking,
      subjectResults: stResults,
      displayPosition,
      terminalTotalMarks,
      learnerAverageMarks,
      learnerAveragePoints,
      overallPerformanceLevel,
      isRankable,
    };
  });

  // 7. Sort Rows: Ranked learners first (by numerical position), Unranked learners second (alphabetical)
  learnerRows.sort((a, b) => {
    if (a.isRankable && !b.isRankable) return -1;
    if (!a.isRankable && b.isRankable) return 1;

    if (a.isRankable && b.isRankable) {
      const posA = Number(a.displayPosition) || 999999;
      const posB = Number(b.displayPosition) || 999999;
      if (posA !== posB) return posA - posB;
      // Stable secondary tie-breaker for display ordering only (alphabetical)
      return (a.student.full_name || '').localeCompare(b.student.full_name || '');
    }

    // Both unranked: alphabetical
    return getLearnerFullName(a.student).localeCompare(getLearnerFullName(b.student));
  });

  // 8. Calculate Summary Statistics
  const enrolledCount = cohortStudents.length;
  const rankableLearners = learnerRows.filter((r) => r.isRankable);
  const rankableCount = rankableLearners.length;
  const unrankableCount = enrolledCount - rankableCount;

  // Dynamic Class Maximum = applicable subjects * 100
  const isUpperPrimaryTerminal = (effectiveEduLevel as string) === 'Upper Primary' || (effectiveEduLevel as string) === 'upper_primary' || Boolean(grade && ['Grade 4', 'Grade 5', 'Grade 6'].includes(grade));
  const classCurriculumMax = isUpperPrimaryTerminal ? 600 : activeSubjects.length * 100;

  // Class Average Marks = sum of rankable learner totals ÷ rankable count
  const totalAssessedMarksSum = rankableLearners.reduce(
    (acc, r) => acc + (r.terminalTotalMarks || 0),
    0
  );
  const classAverageMarks =
    rankableCount > 0
      ? parseFloat((totalAssessedMarksSum / rankableCount).toFixed(2))
      : 0;

  // Class Mean Percentage = sum of rankable learner averages ÷ rankable count
  const sumLearnerAverages = rankableLearners.reduce(
    (acc, r) => acc + (r.learnerAverageMarks || 0),
    0
  );
  const classMeanPercentage =
    rankableCount > 0
      ? parseFloat((sumLearnerAverages / rankableCount).toFixed(2))
      : 0;

  // Class Mean Points
  const sumLearnerPoints = rankableLearners.reduce(
    (acc, r) => acc + (r.learnerAveragePoints || 0),
    0
  );
  const classMeanPoints =
    rankableCount > 0
      ? parseFloat((sumLearnerPoints / rankableCount).toFixed(2))
      : 0;

  const overallClassGradeObj = getGradeForMark(
    Math.round(classMeanPercentage),
    grades,
    effectiveEduLevel,
    grade
  );
  const overallPerformanceLevel = overallClassGradeObj.grade;

  // 9. Calculate Per-Subject Summary Statistics
  const subjectStats = new Map<string, SubjectColumnStat>();

  for (const sb of activeSubjects) {
    let validCount = 0;
    let totalPct = 0;
    let totalPts = 0;

    for (const r of learnerRows) {
      const res = r.subjectResults.get(sb.id);
      const pct = res?.terminalPercentage ?? (res as any)?.percentage ?? null;
      if (pct !== null && pct !== undefined && Number.isFinite(pct)) {
        validCount++;
        totalPct += pct;
        const gr = getGradeForMark(pct, grades, effectiveEduLevel, grade);
        totalPts += gr.points;
      }
    }

    const avgPct = validCount > 0 ? parseFloat((totalPct / validCount).toFixed(2)) : 0;
    const avgPts = validCount > 0 ? parseFloat((totalPts / validCount).toFixed(2)) : 0;
    const perfLvl =
      validCount > 0
        ? getGradeForMark(Math.round(avgPct), grades, effectiveEduLevel, grade).grade
        : '—';

    const targetClassId = targetClassStream?.id;
    const targetStreamId = targetClassStream?.stream_id || (isStreamView ? selectedStreamId : undefined);

    const assignedTeacherName = resolveSubjectTeacherName(
      sb.id,
      targetClassId,
      targetStreamId,
      teachers
    );

    subjectStats.set(sb.id, {
      subjectId: sb.id,
      subjectCode: getSubjectDisplayCode(sb) || getSubjectDisplayName(sb).substring(0, 3).toUpperCase(),
      subjectName: getSubjectDisplayName(sb),
      validCount,
      totalPercentageSum: totalPct,
      averagePercentage: avgPct,
      averagePoints: avgPts,
      performanceLevel: perfLvl,
      assignedTeacherName,
    });
  }

  const boysCount = cohortStudents.filter(
    (s) => s.gender === 'M' || (s.gender as any) === 'Male'
  ).length;
  const girlsCount = cohortStudents.filter(
    (s) => s.gender === 'F' || (s.gender as any) === 'Female'
  ).length;
  const genderDistribution: TerminalMeritGenderStat = {
    boysCount,
    girlsCount,
    totalCount: cohortStudents.length,
  };

  return {
    title: 'TERMINAL MERIT LIST',
    school,
    academicYear,
    term,
    educationLevel: effectiveEduLevel,
    grade,
    streamName,
    isStreamView,
    isProvisionalMode,
    activeSubjects,
    learners: learnerRows,
    summaryStats: {
      enrolledCount,
      rankableCount,
      unrankableCount,
      classCurriculumMax,
      classAverageMarks,
      classMeanPercentage,
      classMeanPoints,
      overallPerformanceLevel,
      genderDistribution,
      subjectStats,
    },
    generatedAt: new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
    classes,
    teachers,
    examName: `${grade.toUpperCase()} TERMINAL ASSESSMENT ${term.toUpperCase()} ${academicYear}`,
    examCode: `${grade.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}-TRM-${academicYear}-${term.replace(/[^a-zA-Z0-9]/g, '').substring(0, 2).toUpperCase()}`,
  };
}

/**
 * Build Terminal Merit List PDF Document in STRICT BLACK-AND-WHITE.
 * Adheres strictly to:
 * - Pure monochrome: Black text [0, 0, 0], white fill [255, 255, 255], black borders.
 * - NO color badges, NO colored zebra stripes, NO blue/red/green text.
 * - Bold black text for X and Y attendance/irregularity codes.
 * - Blank position for unranked learners.
 * - Dynamic Maximum (e.g. OUT OF 900 or applicable * 100).
 */
export function generateTerminalMeritListPdfDoc(data: TerminalMeritListData): any {
  const doc = ensureSafeJsPdf(new jsPDFConstructor({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  }));

  const pageWidth = 297;
  const pageHeight = 210;
  const margin = 7;
  const usableWidth = pageWidth - margin * 2; // 283mm

  // 1. Header Block (Page 1 ONLY)
  const schoolName = (data.school?.school_name || '').trim().toUpperCase();
  const streamDisplay = data.isStreamView ? data.streamName.toUpperCase() : 'ALL STREAMS';
  const defaultExamName = `${data.grade.toUpperCase()} TERMINAL ASSESSMENT ${data.term.toUpperCase()} ${data.academicYear}`;
  const defaultExamCode = `${data.grade.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}-TRM-${data.academicYear}-${data.term.replace(/[^a-zA-Z0-9]/g, '').substring(0, 2).toUpperCase()}`;
  const examNameStr = (data.examName || defaultExamName).toUpperCase();
  const examCodeStr = (data.examCode || defaultExamCode).toUpperCase();
  const teachersStr = data.classTeachersStr || getClassTeachersString(data.grade, data.classes || [], data.teachers || []);

  const renderDocumentHeader = () => {
    let textLeft = margin;

    const logoObj = data.logoBase64 || (data.school?.logo_url && data.school.logo_url.startsWith('data:') ? { dataUrl: data.school.logo_url, width: 240, height: 240 } : null);

    if (logoObj) {
      const { dataUrl, width, height } = logoObj;
      let logoDisplayW = 16;
      let logoDisplayH = 16;
      if (width && height && height > 0) {
        const aspect = width / height;
        if (aspect >= 1) {
          logoDisplayW = 16;
          logoDisplayH = Math.min(16, 16 / aspect);
        } else {
          logoDisplayH = 16;
          logoDisplayW = Math.min(16, 16 * aspect);
        }
      }
      const logoX = margin;
      const logoY = 6.0 + (16 - logoDisplayH) / 2;
      try {
        doc.addImage(dataUrl, 'PNG', logoX, logoY, logoDisplayW, logoDisplayH);
      } catch (err) {
        console.warn('Failed to embed terminal merit list logo:', err);
      }
      textLeft = margin + logoDisplayW + 4;
    }

    // Line 1: School Name (Emerald Green #176B45 / rgb(0, 135, 103))
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 135, 103);
    doc.text(schoolName, textLeft, 9.5);

    // Line 2: Report Title (Black)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text("REPORT: LEARNERS' PERFORMANCE TERMINAL MERIT LIST", textLeft, 14.5);

    // Line 3: Metadata Items (Left Aligned, Values in Blue #0055CC)
    const metaY1 = 18.5;
    doc.setFontSize(7.5);
    let curX1 = textLeft;
    const itemGap = 4.0;

    const renderMetaItem = (label: string, value: string) => {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(label, curX1, metaY1);
      curX1 += doc.getTextWidth(label) + 1.0;

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 85, 204);
      doc.text(value, curX1, metaY1);
      curX1 += doc.getTextWidth(value) + itemGap;
    };

    renderMetaItem('CLASS:', data.grade.toUpperCase());
    renderMetaItem('STREAM:', streamDisplay);
    renderMetaItem('TERM:', data.term.toUpperCase());
    renderMetaItem('YEAR:', String(data.academicYear));
    renderMetaItem('EXAM NAME:', examNameStr);
    renderMetaItem('EXAM CODE:', examCodeStr);

    // Line 4: Class Teachers Metadata
    const metaY2 = 22.2;
    let curX2 = textLeft;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('CLASS TEACHERS:', curX2, metaY2);
    curX2 += doc.getTextWidth('CLASS TEACHERS:') + 1.2;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 85, 204);
    doc.text(teachersStr, curX2, metaY2);
  };

  // 2. Prepare Columns (24 Columns Total)
  const numSubjects = data.activeSubjects.length;
  const sumStartIdx = 8 + numSubjects;

  const tableHeaders: string[] = [
    'S.NO',
    'ADM NO.',
    'LEARNER NAME',
    'STREAM',
    '', // STR. POS. (drawn vertically)
    '', // OVR POS. (drawn vertically)
    '', // PRV STR POS. (drawn vertically)
    '', // PRV OVR POS. (drawn vertically)
    ...data.activeSubjects.map((s) => getSubjectDisplayCode(s) || getSubjectDisplayName(s).substring(0, 4).toUpperCase()),
    '', // SUB ENTRY (drawn vertically)
    '', // TOTAL MARKS (drawn vertically)
    '', // AVG MARKS (drawn vertically)
    '', // TOTAL PTS (drawn vertically)
    '', // AVG PTS (drawn vertically)
    '', // CBE LEVEL (drawn vertically)
  ];

  // 3. Prepare Learner Rows
  const learnerTableBody: any[][] = data.learners.map((lr, idx) => {
    const streamName = getStreamNameForLearner(lr.student, data.classes || []);

    // Position handling
    let strPos = '';
    let ovrPos = '';
    if (lr.isRankable && lr.ranking) {
      strPos = lr.ranking.streamPosition !== null && lr.ranking.streamPosition !== undefined ? String(lr.ranking.streamPosition) : '';
      ovrPos = lr.ranking.overallPosition !== null && lr.ranking.overallPosition !== undefined ? String(lr.ranking.overallPosition) : '';
    }

    const prvStrPos = (lr.ranking as any)?.previousStreamPosition !== undefined && (lr.ranking as any)?.previousStreamPosition !== null ? String((lr.ranking as any).previousStreamPosition) : '';
    const prvOvrPos = (lr.ranking as any)?.previousOverallPosition !== undefined && (lr.ranking as any)?.previousOverallPosition !== null ? String((lr.ranking as any).previousOverallPosition) : '';

    const row: any[] = [
      String(idx + 1),
      lr.student.admission_number || '—',
      getLearnerFullName(lr.student),
      streamName,
      strPos,
      ovrPos,
      prvStrPos,
      prvOvrPos,
    ];

    let validSubjCount = 0;
    let learnerPointsSum = 0;

    for (const sb of data.activeSubjects) {
      const res = lr.subjectResults.get(sb.id);
      const cell = formatSubjectResultCell(res);
      if (cell.isSpecial) {
        row.push(cell.specialCode);
      } else if (cell.pctText) {
        row.push(`${cell.pctText} ${cell.lvlText}`);
        validSubjCount++;
        const pctNum = Number(cell.pctText);
        if (Number.isFinite(pctNum)) {
          const gr = getGradeForMark(pctNum, [], data.educationLevel, data.grade);
          learnerPointsSum += gr.points;
        }
      } else {
        row.push('—');
      }
    }

    const totMarksStr = lr.terminalTotalMarks !== null ? String(lr.terminalTotalMarks) : '—';
    const avgMarksStr = lr.learnerAverageMarks !== null ? `${formatTwoDecimalAverage(lr.learnerAverageMarks)}` : '—';
    const totalPtsStr = lr.isRankable && learnerPointsSum > 0 ? String(learnerPointsSum) : (lr.learnerAveragePoints !== null ? formatTwoDecimalAverage(lr.learnerAveragePoints * validSubjCount) : '—');
    const avgPtsStr = lr.learnerAveragePoints !== null ? formatTwoDecimalAverage(lr.learnerAveragePoints) : '—';
    const levelDisplay = (lr.overallPerformanceLevel === 'INCOMPLETE' || !lr.overallPerformanceLevel || lr.overallPerformanceLevel === 'Pending' || !lr.isRankable)
      ? 'INC'
      : lr.overallPerformanceLevel;

    row.push(
      String(validSubjCount),
      totMarksStr,
      avgMarksStr,
      totalPtsStr,
      avgPtsStr,
      levelDisplay
    );

    return row;
  });

  // 4. Column Width Calculations (Total 283mm usable width)
  const sumMetaW = 89; // 6 + 11 + 38 + 9 + 6.25 + 6.25 + 6.25 + 6.25 = 89mm
  const sumSummaryW = 56; // 8 + 10.5 + 10 + 8.5 + 8.5 + 10.5 = 56mm
  const subjectColWidth = numSubjects > 0 ? (usableWidth - sumMetaW - sumSummaryW) / numSubjects : 15;

  const columnStyles: { [key: number]: any } = {
    0: { cellWidth: 6, halign: 'center' },   // S.NO
    1: { cellWidth: 11, halign: 'center' },  // ADM NO.
    2: { cellWidth: 38, halign: 'left', cellPadding: { top: 0.25, bottom: 0.25, left: 1.0, right: 0.5 } }, // LEARNER NAME (Left Indented)
    3: { cellWidth: 9, halign: 'center' },   // STREAM
    4: { cellWidth: 6.25, halign: 'center', fontStyle: 'bold' }, // STR. POS.
    5: { cellWidth: 6.25, halign: 'center', fontStyle: 'bold' }, // OVR POS.
    6: { cellWidth: 6.25, halign: 'center' }, // PRV STR POS.
    7: { cellWidth: 6.25, halign: 'center' }, // PRV OVR POS.
  };

  data.activeSubjects.forEach((_, idx) => {
    columnStyles[8 + idx] = { cellWidth: subjectColWidth, halign: 'center' };
  });

  columnStyles[sumStartIdx] = { cellWidth: 8, halign: 'center' };                        // SUB ENTRY
  columnStyles[sumStartIdx + 1] = { cellWidth: 10.5, halign: 'center', fontStyle: 'bold' }; // TOTAL MARKS
  columnStyles[sumStartIdx + 2] = { cellWidth: 10, halign: 'center', fontStyle: 'bold' };   // AVG MARKS
  columnStyles[sumStartIdx + 3] = { cellWidth: 8.5, halign: 'center' };                   // TOTAL PTS
  columnStyles[sumStartIdx + 4] = { cellWidth: 8.5, halign: 'center', fontStyle: 'bold' };  // AVG PTS
  columnStyles[sumStartIdx + 5] = { cellWidth: 10.5, halign: 'center', fontStyle: 'bold' }; // CBE LEVEL

  const rotatedHeaderIndices = [4, 5, 6, 7, sumStartIdx, sumStartIdx + 1, sumStartIdx + 2, sumStartIdx + 3, sumStartIdx + 4, sumStartIdx + 5];
  const subjectColIndices = Array.from({ length: numSubjects }, (_, i) => 8 + i);

  // 5. Render Learner Table with autoTable
  autoTable(doc, {
    startY: 25.5,
    margin: { top: 10, left: margin, right: margin, bottom: 10 },
    head: [tableHeaders],
    body: learnerTableBody,
    theme: 'grid',
    showHead: 'everyPage',
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      lineColor: [0, 0, 0],
      lineWidth: 0.18,
      halign: 'center',
      valign: 'middle',
      minCellHeight: 18,
      fontSize: 5.5,
      cellPadding: { top: 0.25, bottom: 0.25, left: 0.15, right: 0.15 },
    },
    styles: {
      fontSize: 5.5,
      cellPadding: { top: 0.25, bottom: 0.25, left: 0.2, right: 0.2 },
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.15,
      fillColor: [255, 255, 255],
      halign: 'center',
      valign: 'middle',
      minCellHeight: 3.5,
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],
    },
    columnStyles,
    didDrawPage: (hookData) => {
      if (hookData.pageNumber === 1) {
        renderDocumentHeader();
      } else {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(0, 0, 0);
        const contHeader = `${schoolName} — ${data.grade.toUpperCase()} (${streamDisplay}) TERMINAL MERIT LIST (Contd.)`;
        doc.text(contHeader, pageWidth / 2, 6, { align: 'center' });
      }
    },
    willDrawCell: (hookData) => {
      // Clear default text for rotated headers and subject cells so text doesn't double-render
      if (hookData.section === 'head' && rotatedHeaderIndices.includes(hookData.column.index)) {
        hookData.cell.text = [];
      }
      if (hookData.section === 'body' && subjectColIndices.includes(hookData.column.index)) {
        hookData.cell.text = [];
      }
    },
    didDrawCell: (hookData) => {
      // 1. Draw vertical rotated headers
      if (hookData.section === 'head' && rotatedHeaderIndices.includes(hookData.column.index)) {
        const titleMap: { [key: number]: string } = {
          4: 'STR. POS.',
          5: 'OVR POS.',
          6: 'PRV STR POS.',
          7: 'PRV OVR POS.',
          [sumStartIdx]: 'SUB ENTRY',
          [sumStartIdx + 1]: 'TOTAL MARKS',
          [sumStartIdx + 2]: 'AVG MARKS',
          [sumStartIdx + 3]: 'TOTAL PTS',
          [sumStartIdx + 4]: 'AVG PTS',
          [sumStartIdx + 5]: 'CBE LEVEL',
        };
        const title = titleMap[hookData.column.index];
        if (title) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(5.5);
          doc.setTextColor(0, 0, 0);
          const x = hookData.cell.x + hookData.cell.width / 2 + 0.6;
          const y = hookData.cell.y + hookData.cell.height - 1.5;
          doc.text(title, x, y, { angle: 90 });
        }
      }

      // 2. Render Single-Line Subject Cells: "84 EE2" (Mark in Black + Grade Code in Blue #0055CC)
      if (hookData.section === 'body' && subjectColIndices.includes(hookData.column.index)) {
        const cell = hookData.cell;
        const rowData = learnerTableBody[hookData.row.index];
        if (!rowData) return;
        const rawVal = String(rowData[hookData.column.index] || '').trim();
        const centerX = cell.x + cell.width / 2;
        const centerY = cell.y + cell.height / 2;

        if (!rawVal) return;

        let subjFontSize = 7.0;
        if (subjectColWidth < 10) {
          subjFontSize = Math.min(7.0, Math.max(4.2, (subjectColWidth - 0.4) / 1.15));
        }

        if (rawVal.includes(' ')) {
          const spaceIdx = rawVal.indexOf(' ');
          const markStr = rawVal.substring(0, spaceIdx);
          const gradeCodeStr = rawVal.substring(spaceIdx + 1);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(subjFontSize);

          let markW = doc.getTextWidth(markStr);
          let spaceW = doc.getTextWidth(' ');
          let gradeW = doc.getTextWidth(gradeCodeStr);
          let totalW = markW + spaceW + gradeW;

          if (totalW > cell.width - 0.4 && totalW > 0) {
            subjFontSize = Math.max(3.8, subjFontSize * ((cell.width - 0.4) / totalW));
            doc.setFontSize(subjFontSize);
            markW = doc.getTextWidth(markStr);
            spaceW = doc.getTextWidth(' ');
            gradeW = doc.getTextWidth(gradeCodeStr);
            totalW = markW + spaceW + gradeW;
          }

          const startX = centerX - totalW / 2;
          const yPos = centerY + 0.65;

          // Mark in black
          doc.setTextColor(0, 0, 0);
          doc.text(markStr, startX, yPos);

          // Grade code in blue #0055CC
          if (gradeCodeStr && gradeCodeStr !== '-') {
            doc.setTextColor(0, 85, 204);
            doc.text(gradeCodeStr, startX + markW + spaceW, yPos);
          } else if (gradeCodeStr === '-') {
            doc.setTextColor(140, 140, 140);
            doc.text('-', startX + markW + spaceW, yPos);
          }
        } else {
          if (rawVal === 'X' || rawVal === 'Y' || rawVal === 'X/Y') {
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(220, 38, 38);
          } else {
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(0, 0, 0);
          }
          doc.setFontSize(subjFontSize);
          let textW = doc.getTextWidth(rawVal);
          if (textW > cell.width - 0.4 && textW > 0) {
            subjFontSize = Math.max(3.8, subjFontSize * ((cell.width - 0.4) / textW));
            doc.setFontSize(subjFontSize);
          }
          doc.text(rawVal, centerX, centerY + 0.65, { align: 'center' });
        }
      }
    },
    didParseCell: (dataCell) => {
      const rawText = String(dataCell.cell.raw || '');
      if (rawText === 'X' || rawText === 'Y' || rawText === 'X/Y') {
        dataCell.cell.styles.fontStyle = 'bold';
        dataCell.cell.styles.textColor = [205, 25, 60];
      }
    },
  });

  const learnerTableFinalY = (doc as any).lastAutoTable?.finalY || 22;

  // 6. Statistics Table (Aligned perfectly with Standard Merit List layout)
  const summarySubjHeaders = data.activeSubjects.map((s) => {
    const code = (getSubjectDisplayCode(s) || getSubjectDisplayName(s)).toUpperCase().trim();
    if (code === 'MATH' || code === 'MATHEMATICS') return 'MAT';
    if (code === 'INT SCI' || code === 'INT-SCI' || code === 'INTEGRATED SCIENCE') return 'INT-SCI';
    if (code === 'CRE' || code === 'C.R.E') return 'C.R.E';
    if (code === 'PRE-TECH' || code === 'PRE TECH') return 'PRE-TECH';
    return code;
  });

  const summaryHead = [['LEARNING AREA', ...summarySubjHeaders, 'CLASS AVG']];

  // Row 1: AVG. MARKS
  const summaryMarksList = data.activeSubjects.map((s) => {
    const stat = data.summaryStats.subjectStats.get(s.id);
    return stat && stat.validCount > 0 ? `${formatTwoDecimalAverage(stat.averagePercentage)}%` : '—';
  });

  const overallAvgMarkStr = formatTwoDecimalAverage(data.summaryStats.classAverageMarks);
  const summaryRowMarks = ['AVG. MARKS', ...summaryMarksList, overallAvgMarkStr];

  // Row 2: AVG. POINTS (Numeric points only)
  const summaryPointsList = data.activeSubjects.map((s) => {
    const stat = data.summaryStats.subjectStats.get(s.id);
    return stat && stat.validCount > 0 ? stat.averagePoints.toFixed(2) : '—';
  });

  const overallMeanPointsStr = data.summaryStats.classMeanPoints.toFixed(2);
  const summaryRowPoints = ['AVG. POINTS', ...summaryPointsList, overallMeanPointsStr];

  // Row 3: PERFORMANCE LEVEL
  const summaryLevelList = data.activeSubjects.map((s) => {
    const stat = data.summaryStats.subjectStats.get(s.id);
    return stat && stat.validCount > 0 ? stat.performanceLevel : '—';
  });
  const summaryRowLevel = ['PERFORMANCE LEVEL', ...summaryLevelList, data.summaryStats.overallPerformanceLevel];

  const summaryColStyles: Record<number, any> = {
    0: { cellWidth: sumMetaW, fontStyle: 'bold', halign: 'left', cellPadding: { top: 0.3, bottom: 0.3, left: 1.0, right: 0.5 } },
  };
  for (let i = 0; i < numSubjects; i++) {
    summaryColStyles[i + 1] = { cellWidth: subjectColWidth, halign: 'center' };
  }
  summaryColStyles[numSubjects + 1] = { cellWidth: sumSummaryW, fontStyle: 'bold', halign: 'center' };

  const summarySpaceNeeded = 25;
  let summaryStartY = learnerTableFinalY + 3;
  if (summaryStartY + summarySpaceNeeded > pageHeight - 12) {
    doc.addPage();
    summaryStartY = 12;
  }

  autoTable(doc, {
    startY: summaryStartY,
    margin: { left: margin, right: margin },
    head: summaryHead,
    body: [summaryRowMarks, summaryRowPoints, summaryRowLevel],
    theme: 'grid',
    styles: {
      fontSize: 5.8,
      cellPadding: 0.6,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.18,
      halign: 'center',
      valign: 'middle',
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 5.8,
      lineColor: [0, 0, 0],
      lineWidth: 0.18,
      halign: 'center',
    },
    columnStyles: summaryColStyles,
    willDrawCell: (d) => {
      // Clear row 3 body text for custom rendering with blue color codes
      if (d.section === 'body' && d.row.index === 2 && d.column.index > 0) {
        d.cell.text = [];
      }
    },
    didDrawCell: (d) => {
      // Custom draw for PERFORMANCE LEVEL row
      if (d.section === 'body' && d.column.index > 0 && d.row.index === 2) {
        const cell = d.cell;
        const centerY = cell.y + cell.height / 2;
        const val = String(d.column.index <= numSubjects ? summaryLevelList[d.column.index - 1] : data.summaryStats.overallPerformanceLevel).trim();
        if (val && val !== '—') {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(5.5);
          doc.setTextColor(0, 85, 204);
          doc.text(val, cell.x + cell.width / 2, centerY + 0.6, { align: 'center' });
        } else if (val === '—') {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(5.5);
          doc.setTextColor(0, 0, 0);
          doc.text('—', cell.x + cell.width / 2, centerY + 0.6, { align: 'center' });
        }
      }
    },
  });

  // 7. Prominently Displayed Overall Metrics & Notes
  let summaryY = (doc as any).lastAutoTable.finalY + 5;
  const classCurriculumMax = data.summaryStats.classCurriculumMax > 0
    ? data.summaryStats.classCurriculumMax
    : numSubjects * 100;
  const outOfText = classCurriculumMax > 0 ? ` (OUT OF ${classCurriculumMax})` : '';

  if (summaryY + 8 > pageHeight - 8) {
    doc.addPage();
    summaryY = 12;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.0);
  doc.setTextColor(0, 0, 0);
  const prominentText = `CLASS AVERAGE MARKS: ${formatTwoDecimalAverage(data.summaryStats.classAverageMarks)}${outOfText}`;
  doc.text(prominentText, margin, summaryY);

  summaryY += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(60, 60, 60);
  doc.text('• Learner position is assigned using Total Marks', margin, summaryY);
  doc.text('• Learner performance level is calculated using Average Marks', margin, summaryY + 3.8);

  // 8. Page Footers across all pages
  const totalPages = doc.getNumberOfPages();
  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 100, 100);
    const footerText = `Report generated on: ${dateStr} at ${timeStr}   Page ${i}/${totalPages}`;
    doc.text(footerText, pageWidth - margin, pageHeight - 4.5, { align: 'right' });
  }

  return doc;
}

/**
 * Download Terminal Merit List PDF in browser.
 */
export async function downloadTerminalMeritListPDF(data: TerminalMeritListData): Promise<void> {
  if (data.school?.logo_url && !data.logoBase64) {
    data.logoBase64 = await getBase64ImageFromUrl(data.school.logo_url);
  }
  const doc = generateTerminalMeritListPdfDoc(data);
  const cleanFilename = `Terminal_Merit_List_${data.grade.replace(/\s+/g, '_')}_${data.isStreamView ? data.streamName.replace(/[^a-zA-Z0-9]/g, '_') : 'All_Streams'}_${data.academicYear}_${data.term.replace(/\s+/g, '_')}.pdf`;
  await savePdf(doc, cleanFilename);
}

/**
 * Build Terminal Merit List in Excel Workbook format (.xlsx).
 * Uses exact normalized dataset values.
 */
export function generateTerminalMeritListWorkbook(data: TerminalMeritListData): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const titleRow = [
    `${data.school.school_name || 'CBE MANAGEMENT SYSTEM'} - TERMINAL MERIT LIST`,
  ];
  const metaRow = [
    `Grade: ${data.grade}`,
    `Stream: ${data.streamName}`,
    `Academic Year: ${data.academicYear}`,
    `Term: ${data.term}`,
    `Mode: ${data.isProvisionalMode ? 'Provisional' : 'Official'}`,
    `Date: ${data.generatedAt}`,
  ];
  const summaryRow = [
    `Class Average Marks: ${formatTwoDecimalAverage(data.summaryStats.classAverageMarks)} / ${data.summaryStats.classCurriculumMax}`,
    `Class Mean: ${formatTwoDecimalAverage(data.summaryStats.classMeanPercentage)}%`,
    `Rankable: ${data.summaryStats.rankableCount} of ${data.summaryStats.enrolledCount}`,
  ];

  const headers = [
    'Position',
    'Admission No',
    'Learner Name',
    ...data.activeSubjects.map((s) => `${getSubjectDisplayName(s)} (${getSubjectDisplayCode(s)})`),
    `Total Marks (Out of ${data.summaryStats.classCurriculumMax})`,
    'Average Marks (%)',
    'Average Points',
    'Overall Level',
  ];

  const rows: any[][] = [];

  for (const lr of data.learners) {
    const row: any[] = [
      lr.displayPosition, // blank for unranked
      lr.student.admission_number || '',
      getLearnerFullName(lr.student),
    ];

    for (const sb of data.activeSubjects) {
      const res = lr.subjectResults.get(sb.id);
      const cell = formatSubjectResultCell(res);
      if (cell.isSpecial) {
        row.push(cell.specialCode);
      } else if (cell.pctText) {
        row.push(`${cell.pctText} (${cell.lvlText})`);
      } else {
        row.push('');
      }
    }

    row.push(
      lr.terminalTotalMarks !== null ? lr.terminalTotalMarks : '',
      lr.learnerAverageMarks !== null ? lr.learnerAverageMarks : '',
      lr.learnerAveragePoints !== null ? lr.learnerAveragePoints : '',
      lr.overallPerformanceLevel
    );

    rows.push(row);
  }

  // Summary rows in Excel
  const avgMarksRow: any[] = ['', '', 'Learning Area Average Marks (%)'];
  for (const sb of data.activeSubjects) {
    const stat = data.summaryStats.subjectStats.get(sb.id);
    avgMarksRow.push(stat && stat.validCount > 0 ? stat.averagePercentage : '');
  }
  avgMarksRow.push(
    data.summaryStats.classAverageMarks,
    data.summaryStats.classMeanPercentage,
    data.summaryStats.classMeanPoints,
    data.summaryStats.overallPerformanceLevel
  );

  const avgPointsRow: any[] = ['', '', 'Learning Area Average Points'];
  for (const sb of data.activeSubjects) {
    const stat = data.summaryStats.subjectStats.get(sb.id);
    avgPointsRow.push(stat && stat.validCount > 0 ? stat.averagePoints : '');
  }
  avgPointsRow.push('', '', data.summaryStats.classMeanPoints, '');

  const teacherRow: any[] = ['', '', 'Assigned Subject Teacher'];
  for (const sb of data.activeSubjects) {
    const stat = data.summaryStats.subjectStats.get(sb.id);
    teacherRow.push(stat?.assignedTeacherName || '');
  }
  teacherRow.push('', '', '', '');

  const sheetData = [
    titleRow,
    metaRow,
    summaryRow,
    [],
    headers,
    ...rows,
    [],
    avgMarksRow,
    avgPointsRow,
    teacherRow,
  ];

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  XLSX.utils.book_append_sheet(wb, ws, 'Terminal Merit List');

  return wb;
}

/**
 * Download Terminal Merit List in Excel format in browser.
 */
export function downloadTerminalMeritListExcel(data: TerminalMeritListData): void {
  const wb = generateTerminalMeritListWorkbook(data);
  const cleanFilename = `Terminal_Merit_List_${data.grade.replace(/\s+/g, '_')}_${data.isStreamView ? data.streamName.replace(/[^a-zA-Z0-9]/g, '_') : 'All_Streams'}_${data.academicYear}_${data.term.replace(/\s+/g, '_')}.xlsx`;
  XLSX.writeFile(wb, cleanFilename);
}

/**
 * Build Terminal Merit List in CSV text format.
 * Strict parity with screen, PDF, and Excel.
 */
export function generateTerminalMeritListCsvContent(data: TerminalMeritListData): string {
  const headers = [
    'Position',
    'Admission No',
    'Learner Name',
    ...data.activeSubjects.map((s) => `${getSubjectDisplayName(s)} (${getSubjectDisplayCode(s)})`),
    `Total Marks (Out of ${data.summaryStats.classCurriculumMax})`,
    'Average Marks (%)',
    'Average Points',
    'Overall Level',
  ];

  const rows: any[][] = [];

  for (const lr of data.learners) {
    const row: any[] = [
      lr.displayPosition, // blank for unranked
      lr.student.admission_number || '',
      getLearnerFullName(lr.student),
    ];

    for (const sb of data.activeSubjects) {
      const res = lr.subjectResults.get(sb.id);
      const cell = formatSubjectResultCell(res);
      if (cell.isSpecial) {
        row.push(cell.specialCode);
      } else if (cell.pctText) {
        row.push(`${cell.pctText} (${cell.lvlText})`);
      } else {
        row.push('');
      }
    }

    row.push(
      lr.terminalTotalMarks !== null ? lr.terminalTotalMarks : '',
      lr.learnerAverageMarks !== null ? lr.learnerAverageMarks : '',
      lr.learnerAveragePoints !== null ? lr.learnerAveragePoints : '',
      lr.overallPerformanceLevel
    );

    rows.push(row);
  }

  // Summary rows in CSV
  const avgMarksRow: any[] = ['', '', 'Learning Area Average Marks (%)'];
  for (const sb of data.activeSubjects) {
    const stat = data.summaryStats.subjectStats.get(sb.id);
    avgMarksRow.push(stat && stat.validCount > 0 ? stat.averagePercentage : '');
  }
  avgMarksRow.push(
    data.summaryStats.classAverageMarks,
    data.summaryStats.classMeanPercentage,
    data.summaryStats.classMeanPoints,
    data.summaryStats.overallPerformanceLevel
  );

  const avgPointsRow: any[] = ['', '', 'Learning Area Average Points'];
  for (const sb of data.activeSubjects) {
    const stat = data.summaryStats.subjectStats.get(sb.id);
    avgPointsRow.push(stat && stat.validCount > 0 ? stat.averagePoints : '');
  }
  avgPointsRow.push('', '', data.summaryStats.classMeanPoints, '');

  const teacherRow: any[] = ['', '', 'Assigned Subject Teacher'];
  for (const sb of data.activeSubjects) {
    const stat = data.summaryStats.subjectStats.get(sb.id);
    teacherRow.push(stat?.assignedTeacherName || '');
  }
  teacherRow.push('', '', '', '');

  return Papa.unparse({
    fields: headers,
    data: [...rows, [], avgMarksRow, avgPointsRow, teacherRow],
  });
}

/**
 * Download Terminal Merit List in CSV format (.csv).
 * Strict parity with screen, PDF, and Excel.
 */
export function downloadTerminalMeritListCSV(data: TerminalMeritListData): void {
  const csvContent = generateTerminalMeritListCsvContent(data);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const cleanFilename = `Terminal_Merit_List_${data.grade.replace(/\s+/g, '_')}_${data.isStreamView ? data.streamName.replace(/[^a-zA-Z0-9]/g, '_') : 'All_Streams'}_${data.academicYear}_${data.term.replace(/\s+/g, '_')}.csv`;
  link.setAttribute('download', cleanFilename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Export aliases for testing & backward compatibility
export const exportTerminalMeritListToPdf = generateTerminalMeritListPdfDoc;
export const exportTerminalMeritListToExcel = generateTerminalMeritListWorkbook;
export const exportTerminalMeritListToCsv = generateTerminalMeritListCsvContent;
