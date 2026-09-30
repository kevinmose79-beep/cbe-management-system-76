/**
 * Terminal Results Engine
 *
 * Authoritative implementation for Terminal Results calculation.
 * T-09: Terminal Results X Handling & Equal Weighting Foundation.
 *
 * Business Rules Enforced:
 * - Dynamic assessment count (1, 2, 3, 4, 5+ assessments)
 * - Strictly equal weighting: arithmetic mean of normalized assessment percentages
 * - Normalized percentages: (rawScore / outOf) * 100 before averaging
 * - Whole-number official Terminal Percentage: Math.round(arithmeticMean)
 * - Genuine numerical 0 is valid and participates as 0%
 * - X means Missing Mark / Unassessed:
 *     If ANY required contributing assessment has X (or missing required mark row),
 *     Learning Area Terminal Result MUST be INCOMPLETE (X).
 *     terminalPercentage = null, cbePerformanceLevel = null, points = null, isComplete = false.
 * - Y is Absence / Examination Irregularity:
 *     If ANY required contributing assessment has Y (and no X), Learning Area Terminal Result MUST be INCOMPLETE (Y).
 *     If contributing assessments have both X (or missing row) and Y, status MUST be INCOMPLETE (X/Y).
 *     terminalPercentage = null, cbePerformanceLevel = null, points = null, isComplete = false.
 * - Isolated per Learning Area and Learner: no cross-subject or cross-learner contamination.
 */

import { Grade, MarkResolution, Subject, normalizeGradeName, getEducationLevelForGrade } from '../types';
import { initialSubjects } from '../data/seedData';
import { getGradeForMark } from './analysisEngine';
import {
  evaluateMark,
  isEnglishLanguage,
  isEnglishComposition,
  isKiswahiliLugha,
  isKiswahiliInsha,
  isMathematics,
  isIntegratedScience,
  isCreativeArts,
  isSocialStudies,
  isChristianReligiousEducation,
  isDirectSSCRE,
  getUpperPrimaryCompositeSubjectMarks,
} from '../utils/markUtils';

export type TerminalResultStatus =
  | 'Complete'
  | 'INCOMPLETE (X)'
  | 'INCOMPLETE (Y)'
  | 'INCOMPLETE (X/Y)';

export interface ContributingAssessmentRef {
  id: string;
  exam_name: string;
  max_marks?: number;
  out_of?: number;
  status?: string; // 'Draft' | 'Provisional' | 'Approved' | 'Archived'
}

export interface AssessmentComponentTrailEntry {
  code: string;
  name: string;
  rawScore: number | null;
  outOf: number;
  displayScore: string;
  status: 'Normal' | 'X' | 'Y' | 'Blank';
}

export interface AssessmentTrailEntry {
  examId: string;
  examName: string;
  status: 'Normal' | 'X' | 'Y' | 'Blank';
  rawScore: number | null;
  outOf: number;
  percentage: number | null; // Unrounded percentage for this assessment, null if X/Y/Blank
  displayScore: string;
  displayPercentage: string;
  irregularityReason?: string;
  resolution?: MarkResolution; // T-11 Authorised Y Resolution Provenance
  resolvedFromY?: boolean;
  resolutionReason?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  cbePerformanceLevel?: string | null;
  components?: AssessmentComponentTrailEntry[];
}

export interface LearningAreaTerminalResult {
  subjectId: string;
  isComplete: boolean;
  status: TerminalResultStatus;
  terminalPercentage: number | null; // Rounded whole number when Complete, null when incomplete
  unroundedTerminalPercentage: number | null; // Full unrounded arithmetic mean retained for precision
  displayPercentage?: string; // Optional display helper for consumers/tests (e.g. '29%', '0%', 'X', 'Y')
  cbePerformanceLevel: string | null; // e.g. "EE1", "ME2", "ME", null when incomplete
  points: number | null; // CBE grade points, null when incomplete
  assessmentTrail: AssessmentTrailEntry[];
}

export interface CalculateTerminalResultParams {
  subjectId: string;
  contributingAssessments: ContributingAssessmentRef[];
  marks?: Array<{
    exam_id?: string;
    subject_id?: string;
    student_id?: string;
    marks?: number | string | null;
    raw_score?: number | string | null;
    out_of?: number | null;
    special_status?: string | null;
    irregularity_reason?: string | null;
    [key: string]: any;
  }>;
  markResolver?: (examId: string, subjectId: string) => any;
  grades?: Grade[];
  educationLevel?: string | null;
  gradeName?: string | null;
  subjects?: Subject[];
}

/**
 * Detects whether the calculation context is Upper Primary (Grades 4, 5, 6).
 */
export function isUpperPrimaryTerminalContext(params: {
  educationLevel?: string | null;
  gradeName?: string | null;
  classStream?: any;
  student?: any;
  subjectId?: string | null;
  subjectIds?: string[];
  marks?: Array<{ subject_id?: string; [key: string]: any }>;
  subjects?: Array<{ id: string; education_level?: string; subject_code?: string; [key: string]: any }>;
  contributingAssessments?: ContributingAssessmentRef[];
}): boolean {
  const { educationLevel, gradeName, classStream, student, subjectId, subjectIds, marks, subjects, contributingAssessments } = params;

  const effLevel =
    educationLevel ||
    classStream?.education_level ||
    student?.education_level ||
    (classStream?.class_name ? getEducationLevelForGrade(classStream.class_name) : undefined) ||
    (student?.grade ? getEducationLevelForGrade(student.grade) : undefined);

  if (effLevel === 'Upper Primary') return true;
  if (
    effLevel === 'Junior School' ||
    effLevel === 'Pre-Primary' ||
    effLevel === 'Lower Primary'
  ) {
    return false;
  }

  const effGrade = gradeName || classStream?.class_name || student?.grade;
  if (effGrade) {
    const norm = normalizeGradeName(effGrade);
    if (['Grade 4', 'Grade 5', 'Grade 6'].includes(norm)) return true;
    if (['Grade 7', 'Grade 8', 'Grade 9'].includes(norm)) return false;
    if (['Grade 1', 'Grade 2', 'Grade 3', 'PP1', 'PP2', 'Playgroup'].includes(norm)) return false;
  }

  // Check contributing assessments for explicit education level or Grade 4/5/6
  if (Array.isArray(contributingAssessments) && contributingAssessments.length > 0) {
    if (
      contributingAssessments.some(
        (a) =>
          (a as any).education_level === 'Junior School' ||
          /Grade\s*[789]\b/i.test(a.exam_name || '') ||
          /Junior/i.test(a.exam_name || '')
      )
    ) {
      return false;
    }
    if (
      contributingAssessments.some(
        (a) =>
          (a as any).education_level === 'Upper Primary' ||
          /Grade\s*[456]\b/i.test(a.exam_name || '') ||
          /Upper\s*Primary/i.test(a.exam_name || '')
      )
    ) {
      return true;
    }
  }

  const subjectsList = subjects && subjects.length > 0 ? subjects : initialSubjects;

  if (subjectId) {
    if (
      subjectId.startsWith('sb_up_') ||
      subjectId === 'synth_english_composite' ||
      subjectId === 'synth_kiswahili_composite' ||
      subjectId === 'synth_mark_ss_cre'
    ) {
      return true;
    }
    const matchedSub = subjectsList.find(
      (s) => s.id === subjectId || (s.subject_code && s.subject_code === subjectId)
    );
    if (matchedSub?.education_level === 'Upper Primary') return true;
    if (matchedSub?.education_level === 'Junior School') return false;
    const code = (matchedSub?.subject_code || '').toUpperCase();
    if (code === 'COMP' || code === 'INSHA' || code === 'SS&CRE') return true;
  }

  if (Array.isArray(subjectIds) && subjectIds.length > 0) {
    if (
      subjectIds.some(
        (id) =>
          id.startsWith('sb_up_') ||
          id === 'synth_english_composite' ||
          id === 'synth_kiswahili_composite' ||
          id === 'synth_mark_ss_cre'
      )
    ) {
      return true;
    }
    const hasUpSub = subjectIds.some((id) => {
      const s = subjectsList.find((sub) => sub.id === id || sub.subject_code === id);
      return s?.education_level === 'Upper Primary' || s?.subject_code === 'COMP' || s?.subject_code === 'INSHA';
    });
    if (hasUpSub) return true;
  }

  if (Array.isArray(marks) && marks.length > 0) {
    if (
      marks.some(
        (m) =>
          typeof m.subject_id === 'string' &&
          (m.subject_id.startsWith('sb_up_') ||
            m.subject_id === 'synth_english_composite' ||
            m.subject_id === 'synth_kiswahili_composite' ||
            m.subject_id === 'synth_mark_ss_cre' ||
            m.education_level === 'Upper Primary')
      )
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Resolves a learner's mark for a specific contributing assessment and Learning Area.
 * If no mark row exists for a required assessment, resolves explicitly as 'Blank' / unassessed.
 */
export function resolveAssessmentMark(
  assessment: ContributingAssessmentRef,
  subjectId: string,
  marks?: any[],
  markResolver?: (examId: string, subjectId: string) => any,
  grades?: Grade[],
  educationLevel?: string | null,
  gradeName?: string | null
): AssessmentTrailEntry {
  const isUpContext = isUpperPrimaryTerminalContext({
    educationLevel,
    gradeName,
    subjectId,
    marks,
    contributingAssessments: [assessment],
  });
  const effectiveEduLevel = isUpContext ? 'Upper Primary' : (educationLevel || null);

  const defaultOutOf =
    typeof assessment.out_of === 'number' && assessment.out_of > 0
      ? assessment.out_of
      : typeof assessment.max_marks === 'number' && assessment.max_marks > 0
        ? assessment.max_marks
        : 100;

  let markRow: any = undefined;

  if (typeof markResolver === 'function') {
    markRow = markResolver(assessment.id, subjectId);
  } else if (Array.isArray(marks)) {
    markRow = marks.find(
      (m) =>
        (m.exam_id === assessment.id || m.id === assessment.id) &&
        (m.subject_id === subjectId || !m.subject_id)
    );
  }

  // 1. Missing required mark row (learner has no entry in database for this required assessment)
  if (markRow === undefined || markRow === null) {
    return {
      examId: assessment.id,
      examName: assessment.exam_name,
      status: 'Blank',
      rawScore: null,
      outOf: defaultOutOf,
      percentage: null,
      displayScore: 'X',
      displayPercentage: 'X',
    };
  }

  // Determine effective outOf for this mark
  const effectiveOutOf =
    typeof markRow.out_of === 'number' && markRow.out_of > 0
      ? markRow.out_of
      : defaultOutOf;

  const rawMarkStr =
    typeof markRow.marks === 'string'
      ? markRow.marks.trim().toUpperCase()
      : typeof markRow.raw_score === 'string'
        ? markRow.raw_score.trim().toUpperCase()
        : '';

  const specialStatus = markRow.special_status || markRow.status;

  // 1b. T-11 Authorised Y Resolution Check
  // If markRow contains an authorised formal resolution provenance, extract the replacement numerical mark.
  if (markRow.resolution) {
    const res = markRow.resolution;
    const repScore =
      typeof res.replacement_score === 'number' && Number.isFinite(res.replacement_score)
        ? res.replacement_score
        : typeof res.resolved_score === 'number' && Number.isFinite(res.resolved_score)
          ? res.resolved_score
          : typeof markRow.raw_score === 'number' && Number.isFinite(markRow.raw_score)
            ? markRow.raw_score
            : typeof markRow.marks === 'number' && Number.isFinite(markRow.marks)
              ? markRow.marks
              : typeof markRow.score === 'number' && Number.isFinite(markRow.score)
                ? markRow.score
                : null;

    if (repScore !== null && Number.isFinite(repScore)) {
      const unroundedPct = effectiveOutOf > 0 ? (repScore / effectiveOutOf) * 100 : 0;
      const clampedPct = Math.min(100, Math.max(0, unroundedPct));
      const gradeObj = getGradeForMark(Math.round(clampedPct), grades, effectiveEduLevel, gradeName);
      const cbeLevel = gradeObj?.grade_code || gradeObj?.performance_level || (isUpContext ? 'BE' : 'BE2');

      return {
        examId: assessment.id,
        examName: assessment.exam_name,
        status: 'Normal',
        rawScore: repScore,
        outOf: effectiveOutOf,
        percentage: clampedPct,
        displayScore: effectiveOutOf !== 100 ? `${repScore}/${effectiveOutOf}` : `${Math.round(clampedPct)}%`,
        displayPercentage: `${Math.round(clampedPct)}%`,
        cbePerformanceLevel: cbeLevel,
        resolution: res,
        resolvedFromY: true,
        resolutionReason: res.resolution_reason || (res as any).reason,
        resolvedBy: res.resolved_by || (res as any).authorized_by,
        resolvedAt: res.resolved_at || (res as any).created_at,
      };
    }
  }

  // 2. Explicit X check (Missing Mark / Unassessed)
  if (specialStatus === 'X' || rawMarkStr === 'X') {
    return {
      examId: assessment.id,
      examName: assessment.exam_name,
      status: 'X',
      rawScore: null,
      outOf: effectiveOutOf,
      percentage: null,
      displayScore: 'X',
      displayPercentage: 'X',
    };
  }

  // 3. Y check (Absence / Irregularity - preserved for T-10)
  if (specialStatus === 'Y' || rawMarkStr === 'Y') {
    const reason =
      typeof markRow.irregularity_reason === 'string' && markRow.irregularity_reason.trim() !== ''
        ? markRow.irregularity_reason
        : 'Absent';
    return {
      examId: assessment.id,
      examName: assessment.exam_name,
      status: 'Y',
      rawScore: null,
      outOf: effectiveOutOf,
      percentage: null,
      displayScore: 'Y',
      displayPercentage: 'Y',
      irregularityReason: reason,
    };
  }

  // 4. Blank / Unassessed marker
  if (
    specialStatus === 'Blank' ||
    rawMarkStr === 'BLANK' ||
    rawMarkStr === '-' ||
    rawMarkStr === 'UNASSESSED'
  ) {
    return {
      examId: assessment.id,
      examName: assessment.exam_name,
      status: 'Blank',
      rawScore: null,
      outOf: effectiveOutOf,
      percentage: null,
      displayScore: 'X',
      displayPercentage: 'X',
    };
  }

  // 5. Numerical Mark Extraction
  let numScore: number | null = null;

  if (typeof markRow.raw_score === 'number' && Number.isFinite(markRow.raw_score)) {
    numScore = markRow.raw_score;
  } else if (typeof markRow.marks === 'number' && Number.isFinite(markRow.marks)) {
    numScore = markRow.marks;
  } else if (typeof markRow.score === 'number' && Number.isFinite(markRow.score)) {
    numScore = markRow.score;
  } else if (
    typeof markRow.raw_score === 'string' &&
    markRow.raw_score.trim() !== '' &&
    !isNaN(Number(markRow.raw_score))
  ) {
    numScore = Number(markRow.raw_score);
  } else if (
    typeof markRow.marks === 'string' &&
    markRow.marks.trim() !== '' &&
    !isNaN(Number(markRow.marks))
  ) {
    numScore = Number(markRow.marks);
  } else if (
    typeof markRow.score === 'string' &&
    markRow.score.trim() !== '' &&
    !isNaN(Number(markRow.score))
  ) {
    numScore = Number(markRow.score);
  }

  // If no valid number could be extracted, treat as Blank/Unassessed
  if (numScore === null || !Number.isFinite(numScore)) {
    return {
      examId: assessment.id,
      examName: assessment.exam_name,
      status: 'Blank',
      rawScore: null,
      outOf: effectiveOutOf,
      percentage: null,
      displayScore: 'X',
      displayPercentage: 'X',
    };
  }

  // Compute normalized unrounded percentage
  const unroundedPct = effectiveOutOf > 0 ? (numScore / effectiveOutOf) * 100 : 0;
  const clampedPct = Math.min(100, Math.max(0, unroundedPct));
  const gradeObj = getGradeForMark(Math.round(clampedPct), grades, effectiveEduLevel, gradeName);
  const cbeLevel = gradeObj?.grade_code || gradeObj?.performance_level || (isUpContext ? 'BE' : 'BE2');

  return {
    examId: assessment.id,
    examName: assessment.exam_name,
    status: 'Normal',
    rawScore: numScore,
    outOf: effectiveOutOf,
    percentage: clampedPct,
    displayScore: effectiveOutOf !== 100 ? `${numScore}/${effectiveOutOf}` : `${Math.round(clampedPct)}%`,
    displayPercentage: `${Math.round(clampedPct)}%`,
    cbePerformanceLevel: cbeLevel,
  };
}

/**
 * Calculates the Terminal Result for a single Learning Area.
 *
 * Implements Locked Rule 9 & Rule 4:
 * - If ANY contributing assessment has status 'X' or 'Blank' (missing required assessment),
 *   returns status: 'INCOMPLETE (X)' with terminalPercentage = null, cbePerformanceLevel = null, points = null.
 * - If all assessments are Normal, calculates arithmetic mean of normalized percentages with equal weight.
 * - Official terminal percentage is rounded to nearest integer (Math.round).
 * - CBE performance level and points are derived from the rounded integer.
 * - Upper Primary grading uses 4-point scale (EE: 4, ME: 3, AE: 2, BE: 1).
 * - Upper Primary composite learning areas (ENG, KIS, SS&CRE) correctly consolidate component marks.
 */
export function calculateLearningAreaTerminalResult(
  params: CalculateTerminalResultParams
): LearningAreaTerminalResult {
  const {
    subjectId,
    contributingAssessments,
    marks,
    markResolver,
    grades,
    educationLevel,
    gradeName,
    subjects,
  } = params;

  // Empty contributing assessments check
  if (!contributingAssessments || contributingAssessments.length === 0) {
    return {
      subjectId,
      isComplete: false,
      status: 'INCOMPLETE (X)',
      terminalPercentage: null,
      unroundedTerminalPercentage: null,
      displayPercentage: 'X',
      cbePerformanceLevel: null,
      points: null,
      assessmentTrail: [],
    };
  }

  const isUpperPrimary = isUpperPrimaryTerminalContext({
    educationLevel,
    gradeName,
    subjectId,
    marks,
    subjects,
    contributingAssessments,
  });

  const effectiveEduLevel = isUpperPrimary ? 'Upper Primary' : (educationLevel || null);
  const subjectsList = subjects && subjects.length > 0
    ? [...subjects, ...initialSubjects.filter((initS) => !subjects.some((s) => s.id === initS.id))]
    : initialSubjects;

  let assessmentTrail: AssessmentTrailEntry[];

  if (isUpperPrimary) {
    const subObj = subjectsList.find((s) => s.id === subjectId);
    const isEng =
      subjectId === 'sb_up_eng' ||
      subjectId === 'sb_up_comp' ||
      subjectId === 'synth_english_composite' ||
      isEnglishLanguage({ id: subjectId, subject_code: subjectId }) ||
      isEnglishComposition({ id: subjectId, subject_code: subjectId }) ||
      (subObj && (isEnglishLanguage(subObj) || isEnglishComposition(subObj)));
    const isKisw =
      subjectId === 'sb_up_kis' ||
      subjectId === 'sb_up_insha' ||
      subjectId === 'synth_kiswahili_composite' ||
      isKiswahiliLugha({ id: subjectId, subject_code: subjectId }) ||
      isKiswahiliInsha({ id: subjectId, subject_code: subjectId }) ||
      (subObj && (isKiswahiliLugha(subObj) || isKiswahiliInsha(subObj)));
    const isSsCre =
      subjectId === 'sb_up_ss_cre' ||
      subjectId === 'synth_mark_ss_cre' ||
      subjectId === 'sb_sst' ||
      subjectId === 'sb_cre' ||
      isDirectSSCRE({ id: subjectId, subject_code: subjectId }) ||
      isSocialStudies({ id: subjectId, subject_code: subjectId }) ||
      isChristianReligiousEducation({ id: subjectId, subject_code: subjectId }) ||
      (subObj && (isDirectSSCRE(subObj) || isSocialStudies(subObj) || isChristianReligiousEducation(subObj)));

    if (isEng) {
      const engLangSub =
        subjectsList.find(
          (s) => (s.id === 'sb_up_eng' || isEnglishLanguage(s)) && !isEnglishComposition(s)
        ) ||
        ({ id: 'sb_up_eng', subject_code: 'ENG', subject_name: 'English Language', education_level: 'Upper Primary' } as Subject);
      const engCompSub =
        subjectsList.find((s) => s.id === 'sb_up_comp' || isEnglishComposition(s)) ||
        ({ id: 'sb_up_comp', subject_code: 'COMP', subject_name: 'English Composition', education_level: 'Upper Primary' } as Subject);

      assessmentTrail = contributingAssessments.map((assessment) => {
        const examMarks = Array.isArray(marks)
          ? marks.filter((m) => m.exam_id === assessment.id || m.id === assessment.id)
          : [];

        let langMark = typeof markResolver === 'function' ? markResolver(assessment.id, engLangSub.id) : undefined;
        let compMark = typeof markResolver === 'function' ? markResolver(assessment.id, engCompSub.id) : undefined;

        if (!langMark && examMarks.length > 0) {
          langMark = examMarks.find((m) => {
            if (m.subject_id === engLangSub.id || m.subject_id === 'sb_up_eng') return true;
            const sub = subjectsList.find((s) => s.id === m.subject_id);
            if (sub) {
              return isEnglishLanguage(sub) && !isEnglishComposition(sub);
            }
            return (
              isEnglishLanguage({ id: m.subject_id, subject_code: (m as any).subject_code || (m as any).code, subject_name: (m as any).subject_name || (m as any).name }) &&
              !isEnglishComposition({ id: m.subject_id, subject_code: (m as any).subject_code || (m as any).code, subject_name: (m as any).subject_name || (m as any).name })
            );
          });
        }
        if (!compMark && examMarks.length > 0) {
          compMark = examMarks.find((m) => {
            if (m.subject_id === engCompSub.id || m.subject_id === 'sb_up_comp') return true;
            const sub = subjectsList.find((s) => s.id === m.subject_id);
            if (sub) {
              return isEnglishComposition(sub);
            }
            return isEnglishComposition({ id: m.subject_id, subject_code: (m as any).subject_code || (m as any).code, subject_name: (m as any).subject_name || (m as any).name });
          });
        }

        // Direct English mark check (e.g. synth_english_composite or single direct 100-max mark)
        const directEngMark =
          (typeof markResolver === 'function' ? markResolver(assessment.id, 'synth_english_composite') : undefined) ||
          examMarks.find((m) => m.subject_id === 'synth_english_composite');

        if (directEngMark) {
          const evalDirect = evaluateMark(directEngMark, { educationLevel: 'Upper Primary' });
          if (evalDirect.status === 'Y') {
            return {
              examId: assessment.id,
              examName: assessment.exam_name,
              status: 'Y',
              rawScore: null,
              outOf: 100,
              percentage: null,
              displayScore: 'Y',
              displayPercentage: 'Y',
              irregularityReason: evalDirect.irregularityReason || 'Absent',
              cbePerformanceLevel: null,
            };
          }
          if (evalDirect.status === 'X' || evalDirect.status === 'Blank') {
            return {
              examId: assessment.id,
              examName: assessment.exam_name,
              status: 'X',
              rawScore: null,
              outOf: 100,
              percentage: null,
              displayScore: 'X',
              displayPercentage: 'X',
              cbePerformanceLevel: null,
            };
          }
          const rawScore = evalDirect.rawScore ?? 0;
          const clampedPct = Math.min(100, Math.max(0, rawScore));
          const gradeObj = getGradeForMark(Math.round(clampedPct), grades, 'Upper Primary', gradeName);
          return {
            examId: assessment.id,
            examName: assessment.exam_name,
            status: 'Normal',
            rawScore,
            outOf: 100,
            percentage: clampedPct,
            displayScore: `${rawScore}/100`,
            displayPercentage: `${Math.round(clampedPct)}%`,
            cbePerformanceLevel: gradeObj.grade_code,
          };
        }

        if (langMark !== undefined || compMark !== undefined) {
          const evalLang = evaluateMark(langMark, {
            subject: engLangSub,
            educationLevel: 'Upper Primary',
          });
          const evalComp = evaluateMark(compMark, {
            isUpperPrimaryCompOrInsha: true,
            subject: engCompSub,
            educationLevel: 'Upper Primary',
          });

          const engComponents: AssessmentComponentTrailEntry[] = [
            {
              code: 'ENG',
              name: 'English Language',
              rawScore: evalLang.rawScore,
              outOf: 60,
              displayScore:
                evalLang.status === 'Normal' && evalLang.rawScore !== null
                  ? `${evalLang.rawScore}/60`
                  : evalLang.status === 'Y'
                  ? 'Y'
                  : 'X',
              status: evalLang.status,
            },
            {
              code: 'COMP',
              name: 'English Composition',
              rawScore: evalComp.rawScore,
              outOf: 40,
              displayScore:
                evalComp.status === 'Normal' && evalComp.rawScore !== null
                  ? `${evalComp.rawScore}/40`
                  : evalComp.status === 'Y'
                  ? 'Y'
                  : 'X',
              status: evalComp.status,
            },
          ];

          if (evalLang.status === 'Y' || evalComp.status === 'Y') {
            return {
              examId: assessment.id,
              examName: assessment.exam_name,
              status: 'Y',
              rawScore: null,
              outOf: 100,
              percentage: null,
              displayScore: 'Y',
              displayPercentage: 'Y',
              irregularityReason:
                evalLang.irregularityReason || evalComp.irregularityReason || 'Absent',
              cbePerformanceLevel: null,
              components: engComponents,
            };
          }
          if (evalLang.status === 'X' && evalComp.status === 'X') {
            return {
              examId: assessment.id,
              examName: assessment.exam_name,
              status: 'X',
              rawScore: null,
              outOf: 100,
              percentage: null,
              displayScore: 'X',
              displayPercentage: 'X',
              cbePerformanceLevel: null,
              components: engComponents,
            };
          }
          if (evalLang.status === 'Blank' && evalComp.status === 'Blank') {
            return {
              examId: assessment.id,
              examName: assessment.exam_name,
              status: 'Blank',
              rawScore: null,
              outOf: 100,
              percentage: null,
              displayScore: 'X',
              displayPercentage: 'X',
              cbePerformanceLevel: null,
              components: engComponents,
            };
          }
          if (evalLang.status === 'Normal' || evalComp.status === 'Normal') {
            const rawScore = (evalLang.status === 'Normal' ? (evalLang.rawScore ?? 0) : 0) +
                             (evalComp.status === 'Normal' ? (evalComp.rawScore ?? 0) : 0);
            const clampedPct = Math.min(100, Math.max(0, rawScore));
            const gradeObj = getGradeForMark(
              Math.round(clampedPct),
              grades,
              'Upper Primary',
              gradeName
            );
            return {
              examId: assessment.id,
              examName: assessment.exam_name,
              status: 'Normal',
              rawScore,
              outOf: 100,
              percentage: clampedPct,
              displayScore: `${rawScore}/100`,
              displayPercentage: `${Math.round(clampedPct)}%`,
              cbePerformanceLevel: gradeObj.grade_code,
              components: engComponents,
            };
          }
        }

        return resolveAssessmentMark(
          assessment,
          subjectId,
          marks,
          markResolver,
          grades,
          'Upper Primary',
          gradeName
        );
      });
    } else if (isKisw) {
      const kiswLangSub =
        subjectsList.find(
          (s) => (s.id === 'sb_up_kis' || isKiswahiliLugha(s)) && !isKiswahiliInsha(s)
        ) ||
        ({ id: 'sb_up_kis', subject_code: 'KIS', subject_name: 'Kiswahili Lugha', education_level: 'Upper Primary' } as Subject);
      const kiswInshaSub =
        subjectsList.find((s) => s.id === 'sb_up_insha' || isKiswahiliInsha(s)) ||
        ({ id: 'sb_up_insha', subject_code: 'INSHA', subject_name: 'Kiswahili Insha', education_level: 'Upper Primary' } as Subject);

      assessmentTrail = contributingAssessments.map((assessment) => {
        const examMarks = Array.isArray(marks)
          ? marks.filter((m) => m.exam_id === assessment.id || m.id === assessment.id)
          : [];

        let lughaMark = typeof markResolver === 'function' ? markResolver(assessment.id, kiswLangSub.id) : undefined;
        let inshaMark = typeof markResolver === 'function' ? markResolver(assessment.id, kiswInshaSub.id) : undefined;

        if (!lughaMark && examMarks.length > 0) {
          lughaMark = examMarks.find((m) => {
            if (m.subject_id === kiswLangSub.id || m.subject_id === 'sb_up_kis') return true;
            const sub = subjectsList.find((s) => s.id === m.subject_id);
            if (sub) {
              return isKiswahiliLugha(sub) && !isKiswahiliInsha(sub);
            }
            return (
              isKiswahiliLugha({ id: m.subject_id, subject_code: (m as any).subject_code || (m as any).code, subject_name: (m as any).subject_name || (m as any).name }) &&
              !isKiswahiliInsha({ id: m.subject_id, subject_code: (m as any).subject_code || (m as any).code, subject_name: (m as any).subject_name || (m as any).name })
            );
          });
        }
        if (!inshaMark && examMarks.length > 0) {
          inshaMark = examMarks.find((m) => {
            if (m.subject_id === kiswInshaSub.id || m.subject_id === 'sb_up_insha') return true;
            const sub = subjectsList.find((s) => s.id === m.subject_id);
            if (sub) {
              return isKiswahiliInsha(sub);
            }
            return isKiswahiliInsha({ id: m.subject_id, subject_code: (m as any).subject_code || (m as any).code, subject_name: (m as any).subject_name || (m as any).name });
          });
        }

        // Direct Kiswahili mark check
        const directKiswMark =
          (typeof markResolver === 'function' ? markResolver(assessment.id, 'synth_kiswahili_composite') : undefined) ||
          examMarks.find((m) => m.subject_id === 'synth_kiswahili_composite');

        if (directKiswMark) {
          const evalDirect = evaluateMark(directKiswMark, { educationLevel: 'Upper Primary' });
          if (evalDirect.status === 'Y') {
            return {
              examId: assessment.id,
              examName: assessment.exam_name,
              status: 'Y',
              rawScore: null,
              outOf: 100,
              percentage: null,
              displayScore: 'Y',
              displayPercentage: 'Y',
              irregularityReason: evalDirect.irregularityReason || 'Absent',
              cbePerformanceLevel: null,
            };
          }
          if (evalDirect.status === 'X' || evalDirect.status === 'Blank') {
            return {
              examId: assessment.id,
              examName: assessment.exam_name,
              status: 'X',
              rawScore: null,
              outOf: 100,
              percentage: null,
              displayScore: 'X',
              displayPercentage: 'X',
              cbePerformanceLevel: null,
            };
          }
          const rawScore = evalDirect.rawScore ?? 0;
          const clampedPct = Math.min(100, Math.max(0, rawScore));
          const gradeObj = getGradeForMark(Math.round(clampedPct), grades, 'Upper Primary', gradeName);
          return {
            examId: assessment.id,
            examName: assessment.exam_name,
            status: 'Normal',
            rawScore,
            outOf: 100,
            percentage: clampedPct,
            displayScore: `${rawScore}/100`,
            displayPercentage: `${Math.round(clampedPct)}%`,
            cbePerformanceLevel: gradeObj.grade_code,
          };
        }

        if (lughaMark !== undefined || inshaMark !== undefined) {
          const evalLugha = evaluateMark(lughaMark, {
            subject: kiswLangSub,
            educationLevel: 'Upper Primary',
          });
          const evalInsha = evaluateMark(inshaMark, {
            isUpperPrimaryCompOrInsha: true,
            subject: kiswInshaSub,
            educationLevel: 'Upper Primary',
          });

          const kiswComponents: AssessmentComponentTrailEntry[] = [
            {
              code: 'KIS',
              name: 'Kiswahili Lugha',
              rawScore: evalLugha.rawScore,
              outOf: 60,
              displayScore:
                evalLugha.status === 'Normal' && evalLugha.rawScore !== null
                  ? `${evalLugha.rawScore}/60`
                  : evalLugha.status === 'Y'
                  ? 'Y'
                  : 'X',
              status: evalLugha.status,
            },
            {
              code: 'INSHA',
              name: 'Kiswahili Insha',
              rawScore: evalInsha.rawScore,
              outOf: 40,
              displayScore:
                evalInsha.status === 'Normal' && evalInsha.rawScore !== null
                  ? `${evalInsha.rawScore}/40`
                  : evalInsha.status === 'Y'
                  ? 'Y'
                  : 'X',
              status: evalInsha.status,
            },
          ];

          if (evalLugha.status === 'Y' || evalInsha.status === 'Y') {
            return {
              examId: assessment.id,
              examName: assessment.exam_name,
              status: 'Y',
              rawScore: null,
              outOf: 100,
              percentage: null,
              displayScore: 'Y',
              displayPercentage: 'Y',
              irregularityReason:
                evalLugha.irregularityReason || evalInsha.irregularityReason || 'Absent',
              cbePerformanceLevel: null,
              components: kiswComponents,
            };
          }
          if (evalLugha.status === 'X' && evalInsha.status === 'X') {
            return {
              examId: assessment.id,
              examName: assessment.exam_name,
              status: 'X',
              rawScore: null,
              outOf: 100,
              percentage: null,
              displayScore: 'X',
              displayPercentage: 'X',
              cbePerformanceLevel: null,
              components: kiswComponents,
            };
          }
          if (evalLugha.status === 'Blank' && evalInsha.status === 'Blank') {
            return {
              examId: assessment.id,
              examName: assessment.exam_name,
              status: 'Blank',
              rawScore: null,
              outOf: 100,
              percentage: null,
              displayScore: 'X',
              displayPercentage: 'X',
              cbePerformanceLevel: null,
              components: kiswComponents,
            };
          }
          if (evalLugha.status === 'Normal' || evalInsha.status === 'Normal') {
            const rawScore = (evalLugha.status === 'Normal' ? (evalLugha.rawScore ?? 0) : 0) +
                             (evalInsha.status === 'Normal' ? (evalInsha.rawScore ?? 0) : 0);
            const clampedPct = Math.min(100, Math.max(0, rawScore));
            const gradeObj = getGradeForMark(
              Math.round(clampedPct),
              grades,
              'Upper Primary',
              gradeName
            );
            return {
              examId: assessment.id,
              examName: assessment.exam_name,
              status: 'Normal',
              rawScore,
              outOf: 100,
              percentage: clampedPct,
              displayScore: `${rawScore}/100`,
              displayPercentage: `${Math.round(clampedPct)}%`,
              cbePerformanceLevel: gradeObj.grade_code,
              components: kiswComponents,
            };
          }
        }

        return resolveAssessmentMark(
          assessment,
          subjectId,
          marks,
          markResolver,
          grades,
          'Upper Primary',
          gradeName
        );
      });
    } else if (isSsCre) {
      assessmentTrail = contributingAssessments.map((assessment) => {
        let examMarks = Array.isArray(marks)
          ? marks.filter((m) => m.exam_id === assessment.id || m.id === assessment.id)
          : [];

        if (typeof markResolver === 'function') {
          const directRes =
            markResolver(assessment.id, 'sb_up_ss_cre') ||
            markResolver(assessment.id, 'synth_mark_ss_cre') ||
            markResolver(assessment.id, subjectId);
          const sstRes = markResolver(assessment.id, 'sb_sst');
          const creRes = markResolver(assessment.id, 'sb_cre');
          const additional = [directRes, sstRes, creRes].filter(Boolean);
          if (additional.length > 0) {
            examMarks = [...examMarks, ...additional];
          }
        }

        if (examMarks.length > 0) {
          const compRes = getUpperPrimaryCompositeSubjectMarks(
            examMarks as any,
            subjectsList as any,
            'Upper Primary',
            assessment as any
          );
          const ssCreMark = compRes.processedMarks.find(
            (m) =>
              m.subject_id === subjectId ||
              m.subject_id === 'sb_up_ss_cre' ||
              m.subject_id === 'synth_mark_ss_cre' ||
              isDirectSSCRE({ id: m.subject_id, subject_code: m.subject_id })
          );

          const sstMark = examMarks.find((m) => {
            if (m.subject_id === 'sb_sst' || m.subject_id === 'sb_up_sst') return true;
            const sub = subjectsList.find((s) => s.id === m.subject_id);
            if (sub) return isSocialStudies(sub);
            return isSocialStudies({ id: m.subject_id, subject_code: (m as any).subject_code || (m as any).code, subject_name: (m as any).subject_name || (m as any).name });
          });
          const creMark = examMarks.find((m) => {
            if (m.subject_id === 'sb_cre' || m.subject_id === 'sb_up_cre') return true;
            const sub = subjectsList.find((s) => s.id === m.subject_id);
            if (sub) return isChristianReligiousEducation(sub);
            return isChristianReligiousEducation({ id: m.subject_id, subject_code: (m as any).subject_code || (m as any).code, subject_name: (m as any).subject_name || (m as any).name });
          });
          const sstCreComponents: AssessmentComponentTrailEntry[] = [];
          if (sstMark && (sstMark.raw_score !== undefined || sstMark.marks !== undefined)) {
            const sc = sstMark.raw_score ?? sstMark.marks;
            sstCreComponents.push({
              code: 'SST',
              name: 'Social Studies',
              rawScore: typeof sc === 'number' ? sc : Number(sc) || null,
              outOf: sstMark.out_of || 30,
              displayScore: `${sc}/${sstMark.out_of || 30}`,
              status: sstMark.special_status === 'Y' ? 'Y' : sstMark.special_status === 'X' ? 'X' : 'Normal',
            });
          }
          if (creMark && (creMark.raw_score !== undefined || creMark.marks !== undefined)) {
            const sc = creMark.raw_score ?? creMark.marks;
            sstCreComponents.push({
              code: 'CRE',
              name: 'Christian Religious Education',
              rawScore: typeof sc === 'number' ? sc : Number(sc) || null,
              outOf: creMark.out_of || 20,
              displayScore: `${sc}/${creMark.out_of || 20}`,
              status: creMark.special_status === 'Y' ? 'Y' : creMark.special_status === 'X' ? 'X' : 'Normal',
            });
          }

          if (ssCreMark) {
            if (ssCreMark.special_status === 'Y') {
              return {
                examId: assessment.id,
                examName: assessment.exam_name,
                status: 'Y',
                rawScore: null,
                outOf: ssCreMark.out_of || 100,
                percentage: null,
                displayScore: 'Y',
                displayPercentage: 'Y',
                irregularityReason: ssCreMark.irregularity_reason || 'Absent',
                cbePerformanceLevel: null,
                components: sstCreComponents.length > 0 ? sstCreComponents : undefined,
              };
            }
            if (ssCreMark.special_status === 'X' || ssCreMark.special_status === 'Blank') {
              return {
                examId: assessment.id,
                examName: assessment.exam_name,
                status: 'X',
                rawScore: null,
                outOf: ssCreMark.out_of || 100,
                percentage: null,
                displayScore: 'X',
                displayPercentage: 'X',
                cbePerformanceLevel: null,
                components: sstCreComponents.length > 0 ? sstCreComponents : undefined,
              };
            }
            const rawScore = ssCreMark.raw_score ?? ssCreMark.score ?? ssCreMark.marks;
            if (rawScore !== null && rawScore !== undefined && !isNaN(Number(rawScore))) {
              const numScore = Number(rawScore);
              const outOf = ssCreMark.out_of || 100;
              const percentage =
                typeof ssCreMark.percentage === 'number'
                  ? ssCreMark.percentage
                  : outOf > 0
                    ? (numScore / outOf) * 100
                    : 0;
              const clampedPct = Math.min(100, Math.max(0, percentage));
              const gradeObj = getGradeForMark(
                Math.round(clampedPct),
                grades,
                'Upper Primary',
                gradeName
              );
              return {
                examId: assessment.id,
                examName: assessment.exam_name,
                status: 'Normal',
                rawScore: numScore,
                outOf,
                percentage: clampedPct,
                displayScore:
                  outOf !== 100 ? `${numScore}/${outOf}` : `${Math.round(clampedPct)}%`,
                displayPercentage: `${Math.round(clampedPct)}%`,
                cbePerformanceLevel: gradeObj?.grade_code || gradeObj?.performance_level || 'EE',
                components: sstCreComponents.length > 0 ? sstCreComponents : undefined,
              };
            }
          }

          if (sstMark || creMark) {
            const missing = !sstMark ? 'Social Studies (SST)' : 'Christian Religious Education (CRE)';
            return {
              examId: assessment.id,
              examName: assessment.exam_name,
              status: 'X',
              rawScore: null,
              outOf: 100,
              percentage: null,
              displayScore: 'X',
              displayPercentage: 'X',
              irregularityReason: `Incomplete record; missed contributing assessment (${missing})`,
              cbePerformanceLevel: null,
              components: sstCreComponents.length > 0 ? sstCreComponents : undefined,
            };
          }
        }

        return resolveAssessmentMark(
          assessment,
          subjectId,
          marks,
          markResolver,
          grades,
          'Upper Primary',
          gradeName
        );
      });
    } else {
      // Standard Upper Primary subjects (Mathematics, Science, CAS, etc.)
      assessmentTrail = contributingAssessments.map((assessment) =>
        resolveAssessmentMark(
          assessment,
          subjectId,
          marks,
          markResolver,
          grades,
          'Upper Primary',
          gradeName
        )
      );
    }
  } else {
    // Junior School / Default
    assessmentTrail = contributingAssessments.map((assessment) =>
      resolveAssessmentMark(
        assessment,
        subjectId,
        marks,
        markResolver,
        grades,
        educationLevel,
        gradeName
      )
    );
  }

  // Step C: Terminal Incomplete Validation (X, Y, Blank)
  const hasX = assessmentTrail.some((entry) => entry.status === 'X' || entry.status === 'Blank');
  const hasY = assessmentTrail.some((entry) => entry.status === 'Y');

  // Rule Y6: Mixed X + Y produces 'INCOMPLETE (X/Y)'
  if (hasX && hasY) {
    return {
      subjectId,
      isComplete: false,
      status: 'INCOMPLETE (X/Y)',
      terminalPercentage: null,
      unroundedTerminalPercentage: null,
      displayPercentage: 'X/Y',
      cbePerformanceLevel: null,
      points: null,
      assessmentTrail,
    };
  }

  // Rule Y7: X only (or missing mark row) produces 'INCOMPLETE (X)'
  if (hasX) {
    return {
      subjectId,
      isComplete: false,
      status: 'INCOMPLETE (X)',
      terminalPercentage: null,
      unroundedTerminalPercentage: null,
      displayPercentage: 'X',
      cbePerformanceLevel: null,
      points: null,
      assessmentTrail,
    };
  }

  // Rule Y8: Y only produces 'INCOMPLETE (Y)'
  if (hasY) {
    return {
      subjectId,
      isComplete: false,
      status: 'INCOMPLETE (Y)',
      terminalPercentage: null,
      unroundedTerminalPercentage: null,
      displayPercentage: 'Y',
      cbePerformanceLevel: null,
      points: null,
      assessmentTrail,
    };
  }

  // Step D: Numerical Aggregation (Strictly Equal Weighting)
  const validPercentages: number[] = [];
  for (const entry of assessmentTrail) {
    if (typeof entry.percentage === 'number' && Number.isFinite(entry.percentage)) {
      validPercentages.push(entry.percentage);
    }
  }

  if (validPercentages.length !== contributingAssessments.length || validPercentages.length === 0) {
    return {
      subjectId,
      isComplete: false,
      status: 'INCOMPLETE (X)',
      terminalPercentage: null,
      unroundedTerminalPercentage: null,
      displayPercentage: 'X',
      cbePerformanceLevel: null,
      points: null,
      assessmentTrail,
    };
  }

  // Arithmetic mean of normalized assessment percentages
  const sum = validPercentages.reduce((acc, pct) => acc + pct, 0);
  const unroundedMean = sum / validPercentages.length;

  // Authoritative whole-number official terminal percentage
  const roundedTerminalPercentage = Math.round(unroundedMean);

  // Derive CBE performance level and points using authoritative configuration
  const gradeObj = getGradeForMark(
    roundedTerminalPercentage,
    grades,
    effectiveEduLevel,
    gradeName
  );
  const cbePerformanceLevel =
    gradeObj?.grade_code || gradeObj?.performance_level || (isUpperPrimary ? 'BE' : 'BE2');
  const points = typeof gradeObj?.points === 'number' ? gradeObj.points : isUpperPrimary ? 1 : 0;

  return {
    subjectId,
    isComplete: true,
    status: 'Complete',
    terminalPercentage: roundedTerminalPercentage,
    unroundedTerminalPercentage: unroundedMean,
    displayPercentage: `${roundedTerminalPercentage}%`,
    cbePerformanceLevel,
    points,
    assessmentTrail,
  };
}

/**
 * Calculates Terminal Results across multiple Learning Areas for a learner.
 * Enforces strict Learning Area isolation: an X in one subject never affects another subject.
 * For Upper Primary, consolidates components into exactly the six canonical learning areas:
 * 1. English (ENG Language /60 + COMP Composition /40 -> English /100)
 * 2. Kiswahili (KIS Lugha /60 + INSHA Insha /40 -> Kiswahili /100)
 * 3. Mathematics (/100)
 * 4. Integrated Science (/100)
 * 5. Creative Arts and Sports (/100)
 * 6. Social Studies & C.R.E. (composite SST + CRE or direct SS&CRE -> /100)
 */
export function calculateLearnerTerminalResults(params: {
  learnerId: string;
  subjectIds: string[];
  contributingAssessments: ContributingAssessmentRef[];
  marks?: Array<{
    exam_id?: string;
    subject_id?: string;
    student_id?: string;
    [key: string]: any;
  }>;
  markResolver?: (examId: string, subjectId: string) => any;
  grades?: Grade[];
  educationLevel?: string | null;
  gradeName?: string | null;
  subjects?: Subject[];
}): Map<string, LearningAreaTerminalResult> {
  const {
    learnerId,
    subjectIds,
    contributingAssessments,
    marks,
    markResolver,
    grades,
    educationLevel,
    gradeName,
    subjects,
  } = params;

  // Filter marks for this specific learner to guarantee learner isolation
  const learnerMarks = Array.isArray(marks)
    ? marks.filter((m) => !m.student_id || m.student_id === learnerId)
    : undefined;

  const isUpperPrimary = isUpperPrimaryTerminalContext({
    educationLevel,
    gradeName,
    subjectIds,
    marks: learnerMarks,
    subjects,
    contributingAssessments,
  });

  const resultsBySubject = new Map<string, LearningAreaTerminalResult>();

  if (!isUpperPrimary) {
    // Junior School or other levels: execute original path with untouched isolation
    for (const subjectId of subjectIds) {
      const laResult = calculateLearningAreaTerminalResult({
        subjectId,
        contributingAssessments,
        marks: learnerMarks,
        markResolver,
        grades,
        educationLevel,
        gradeName,
        subjects,
      });
      resultsBySubject.set(subjectId, laResult);
    }
    return resultsBySubject;
  }

  // Upper Primary: Consolidate into exactly the canonical 6 learning areas
  const subjectsList = subjects && subjects.length > 0
    ? [...subjects, ...initialSubjects.filter((initS) => !subjects.some((s) => s.id === initS.id))]
    : initialSubjects;

  const engLangSub =
    (subjects && subjects.find((s) => (s.id === 'sb_up_eng' || isEnglishLanguage(s)) && !isEnglishComposition(s))) ||
    subjectsList.find(
      (s) => (s.id === 'sb_up_eng' || isEnglishLanguage(s)) && !isEnglishComposition(s)
    ) ||
    ({ id: 'sb_up_eng', subject_code: 'ENG', subject_name: 'English', education_level: 'Upper Primary' } as Subject);
  const kiswLangSub =
    (subjects && subjects.find((s) => (s.id === 'sb_up_kis' || isKiswahiliLugha(s)) && !isKiswahiliInsha(s))) ||
    subjectsList.find(
      (s) => (s.id === 'sb_up_kis' || isKiswahiliLugha(s)) && !isKiswahiliInsha(s)
    ) ||
    ({ id: 'sb_up_kis', subject_code: 'KIS', subject_name: 'Kiswahili', education_level: 'Upper Primary' } as Subject);
  const mathSub =
    (subjects && subjects.find((s) => isMathematics(s) || s.id === 'sb_up_mat' || s.id === 'sb_up_math')) ||
    subjectsList.find(
      (s) =>
        s.id === 'sb_up_mat' ||
        s.id === 'sb_up_math' ||
        s.id === 'sb_mat' ||
        s.subject_code === 'MATH' ||
        s.subject_name === 'Mathematics'
    ) || ({ id: 'sb_up_mat', subject_code: 'MATH', subject_name: 'Mathematics', education_level: 'Upper Primary' } as Subject);
  const sciSub =
    (subjects && subjects.find((s) => isIntegratedScience(s) || s.id === 'sb_sci' || s.id === 'sb_up_sci')) ||
    subjectsList.find(
      (s) =>
        s.id === 'sb_sci' ||
        s.id === 'sb_up_sci' ||
        s.id === 'sb_up_science' ||
        s.subject_code === 'INT-SCI' ||
        s.subject_name?.toLowerCase().includes('science')
    ) || ({ id: 'sb_sci', subject_code: 'INT-SCI', subject_name: 'Integrated Science', education_level: 'Upper Primary' } as Subject);
  const casSub =
    (subjects && subjects.find((s) => isCreativeArts(s) || s.id === 'sb_up_cas')) ||
    subjectsList.find(
      (s) =>
        s.id === 'sb_up_cas' ||
        s.id === 'sb_cas' ||
        s.id === 'sb_up_arts' ||
        s.subject_code === 'CAS' ||
        s.subject_name?.toLowerCase().includes('creative arts')
    ) ||
    ({
      id: 'sb_up_cas',
      subject_code: 'CAS',
      subject_name: 'Creative Arts and Sports',
      education_level: 'Upper Primary',
    } as Subject);
  const ssCreSub =
    (subjects && subjects.find((s) => isDirectSSCRE(s) || s.id === 'sb_up_ss_cre')) ||
    subjectsList.find((s) => s.id === 'sb_up_ss_cre' || isDirectSSCRE(s)) ||
    ({
      id: 'sb_up_ss_cre',
      subject_code: 'SS&CRE',
      subject_name: 'Social Studies & CRE',
      education_level: 'Upper Primary',
    } as Subject);

  const canonicalAreas = [
    {
      primaryId: engLangSub.id,
      aliases: ['synth_english_composite', 'sb_up_eng', 'sb_eng', 'ENG', 'sb_up_comp', 'COMP'],
    },
    {
      primaryId: kiswLangSub.id,
      aliases: ['synth_kiswahili_composite', 'sb_up_kis', 'sb_kis', 'KIS', 'sb_up_insha', 'INSHA'],
    },
    { primaryId: mathSub.id, aliases: ['sb_up_mat', 'sb_mat', 'MATH'] },
    { primaryId: sciSub.id, aliases: ['sb_sci', 'sb_up_sci', 'INT-SCI'] },
    { primaryId: casSub.id, aliases: ['sb_up_cas', 'sb_cas', 'CAS'] },
    {
      primaryId: ssCreSub.id,
      aliases: ['sb_up_ss_cre', 'synth_mark_ss_cre', 'SS&CRE', 'sb_sst', 'sb_cre', 'SST', 'CRE'],
    },
  ];

  // Helper to identify sub-component subjects that must NOT be separate learning areas
  const isComponentSubject = (id: string): boolean => {
    const sub = subjectsList.find((s) => s.id === id);
    if (!sub) {
      return (
        id === 'sb_up_comp' ||
        id === 'sb_up_insha' ||
        id === 'sb_sst' ||
        id === 'sb_cre' ||
        id.toUpperCase() === 'COMP' ||
        id.toUpperCase() === 'INSHA' ||
        id.toUpperCase() === 'SST' ||
        id.toUpperCase() === 'CRE'
      );
    }
    return (
      isEnglishComposition(sub) ||
      isKiswahiliInsha(sub) ||
      isSocialStudies(sub) ||
      isChristianReligiousEducation(sub)
    );
  };

  for (const area of canonicalAreas) {
    const laResult = calculateLearningAreaTerminalResult({
      subjectId: area.primaryId,
      contributingAssessments,
      marks: learnerMarks,
      markResolver,
      grades,
      educationLevel: 'Upper Primary',
      gradeName,
      subjects: subjectsList,
    });

    resultsBySubject.set(area.primaryId, laResult);
    for (const alias of area.aliases) {
      if (!resultsBySubject.has(alias)) {
        resultsBySubject.set(alias, laResult);
      }
    }
  }

  // Also handle any specific subjectIds requested that weren't in canonicalAreas
  for (const sid of subjectIds) {
    if (!resultsBySubject.has(sid)) {
      if (isComponentSubject(sid)) {
        if (sid === 'sb_up_comp' || sid.toUpperCase() === 'COMP') {
          const res = resultsBySubject.get(engLangSub.id);
          if (res) resultsBySubject.set(sid, res);
        } else if (sid === 'sb_up_insha' || sid.toUpperCase() === 'INSHA') {
          const res = resultsBySubject.get(kiswLangSub.id);
          if (res) resultsBySubject.set(sid, res);
        } else if (
          sid === 'sb_sst' ||
          sid === 'sb_cre' ||
          sid.toUpperCase() === 'SST' ||
          sid.toUpperCase() === 'CRE'
        ) {
          const res = resultsBySubject.get(ssCreSub.id);
          if (res) resultsBySubject.set(sid, res);
        }
      } else {
        const laResult = calculateLearningAreaTerminalResult({
          subjectId: sid,
          contributingAssessments,
          marks: learnerMarks,
          markResolver,
          grades,
          educationLevel: 'Upper Primary',
          gradeName,
          subjects: subjectsList,
        });
        resultsBySubject.set(sid, laResult);
      }
    }
  }

  return resultsBySubject;
}

/**
 * Returns the authoritative 6 canonical learning areas for Upper Primary.
 */
export function getUpperPrimaryCanonicalSubjects(subjects?: Subject[]): Subject[] {
  const subjectsList = subjects && subjects.length > 0 ? subjects : initialSubjects;
  const engLangSub =
    subjectsList.find((s) => (s.id === 'sb_up_eng' || isEnglishLanguage(s)) && !isEnglishComposition(s)) ||
    ({ id: 'sb_up_eng', subject_code: 'ENG', subject_name: 'English', education_level: 'Upper Primary', category: 'Core' } as Subject);
  const kiswLangSub =
    subjectsList.find((s) => (s.id === 'sb_up_kis' || isKiswahiliLugha(s)) && !isKiswahiliInsha(s)) ||
    ({ id: 'sb_up_kis', subject_code: 'KIS', subject_name: 'Kiswahili', education_level: 'Upper Primary', category: 'Core' } as Subject);
  const mathSub =
    subjectsList.find(
      (s) =>
        s.id === 'sb_up_mat' ||
        s.id === 'sb_up_math' ||
        s.id === 'sb_mat' ||
        s.subject_code === 'MATH' ||
        s.subject_name === 'Mathematics'
    ) || ({ id: 'sb_up_mat', subject_code: 'MATH', subject_name: 'Mathematics', education_level: 'Upper Primary', category: 'Core' } as Subject);
  const sciSub =
    subjectsList.find(
      (s) =>
        s.id === 'sb_sci' ||
        s.id === 'sb_up_sci' ||
        s.id === 'sb_up_science' ||
        s.subject_code === 'INT-SCI' ||
        s.subject_name?.toLowerCase().includes('science')
    ) || ({ id: 'sb_sci', subject_code: 'INT-SCI', subject_name: 'Integrated Science', education_level: 'Upper Primary', category: 'Core' } as Subject);
  const casSub =
    subjectsList.find(
      (s) =>
        s.id === 'sb_up_cas' ||
        s.id === 'sb_cas' ||
        s.id === 'sb_up_arts' ||
        s.subject_code === 'CAS' ||
        s.subject_name?.toLowerCase().includes('creative arts')
    ) ||
    ({
      id: 'sb_up_cas',
      subject_code: 'CAS',
      subject_name: 'Creative Arts and Sports',
      education_level: 'Upper Primary',
      category: 'Core',
    } as Subject);
  const ssCreSub =
    subjectsList.find((s) => s.id === 'sb_up_ss_cre' || isDirectSSCRE(s)) ||
    ({
      id: 'sb_up_ss_cre',
      subject_code: 'SS&CRE',
      subject_name: 'Social Studies & C.R.E.',
      education_level: 'Upper Primary',
      category: 'Core',
    } as Subject);

  return [
    { ...engLangSub, subject_name: 'English', subject_code: 'ENG' },
    { ...kiswLangSub, subject_name: 'Kiswahili', subject_code: 'KIS' },
    { ...mathSub, subject_name: 'Mathematics', subject_code: 'MATH' },
    { ...sciSub, subject_name: 'Integrated Science', subject_code: 'INT-SCI' },
    { ...casSub, subject_name: 'Creative Arts and Sports', subject_code: 'CAS' },
    { ...ssCreSub, subject_name: 'Social Studies & C.R.E.', subject_code: 'SS&CRE' },
  ];
}
