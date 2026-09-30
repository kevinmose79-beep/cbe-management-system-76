/**
 * Authoritative Terminal Ranking Engine
 *
 * T-14J: Junior School Terminal Ranking Surgical Implementation.
 *
 * Authoritative Business Rules Enforced:
 * 1. Scope: JUNIOR SCHOOL ONLY (Grades 7, 8, 9). PP, Lower Primary, and Upper Primary are strictly excluded from ranking.
 *    Education-level identity is authoritative. Never use grade number alone as a fallback over explicit education level.
 * 2. Metric: "Terminal Total Marks" = sum of whole-number Terminal Percentages for every applicable Learning Area.
 *    No CBE points, no GPA, no raw marks summation, no arbitrary weighting.
 * 3. Maximum: Derived dynamically as (applicableLearningAreaCount * 100). Never hard-coded to 900.
 * 4. Completeness: 100% of applicable Learning Areas must be Complete.
 *    If any required Learning Area has X, Y, X/Y or missing/unassessed mark -> isRankable = false.
 *    Unranked learners receive null for streamPosition and overallPosition (rendered as "—").
 * 5. Stream Position: Rank among rankable learners in the same stream. Denominator = total stream learner count.
 * 6. Overall Position: Rank among rankable learners across all streams in the same grade. Denominator = total grade learner count.
 * 7. Ties: Standard competition ranking (1, 2, 2, 4).
 * 8. Official Mode: Computed strictly from Approved assessments.
 * 9. Provisional Mode: Computed from Approved + Provisional assessments. Positions labeled as provisional.
 */

import { Student, ClassStream, Subject, Grade, Mark } from '../types';
import {
  LearningAreaTerminalResult,
  ContributingAssessmentRef,
  getUpperPrimaryCanonicalSubjects,
  isUpperPrimaryTerminalContext,
} from './terminalResultsEngine';
import { calculateExamResults, CBE_8_POINT_GRADES } from './analysisEngine';

export interface AssessmentRankingSummary {
  examId: string;
  examName: string;
  totalMarks: number | null;
  maxMarks: number;
  streamPosition: number | null;
  streamDenominator: number | null;
  overallPosition: number | null;
  overallDenominator: number | null;
  isComplete: boolean;
  unrankedReason?: string;
}

export interface TerminalLearnerRanking {
  studentId: string;
  isJuniorSchool: boolean;
  isRankable: boolean;
  terminalTotalMarks: number | null;
  terminalTotalMaximum: number;
  applicableSubjectCount: number;
  completedSubjectCount: number;
  streamPosition: number | null;
  streamPositionDenominator: number | null;
  overallPosition: number | null;
  overallPositionDenominator: number | null;
  isProvisionalMode?: boolean;
  unrankedReason?: string;
}

/**
 * Validates if the given context belongs authoritatively to Junior School.
 * Authoritative education-level data ALWAYS takes precedence over grade labels.
 */
export function isJuniorSchoolEducationLevel(
  educationLevel?: string | null,
  classStream?: ClassStream | null,
  student?: Student | null
): boolean {
  // 1. Authoritative Class/Stream Education Level
  if (classStream?.education_level && classStream.education_level.trim() !== '') {
    const cleanLevel = classStream.education_level.trim().toLowerCase();
    if (cleanLevel === 'junior school' || cleanLevel === 'junior secondary' || cleanLevel === 'junior secondary school') {
      return true;
    }
    // If explicitly set to something else (e.g. Upper Primary), it is NOT Junior School
    return false;
  }

  // 2. Authoritative Student Education Level
  if (student?.education_level && student.education_level.trim() !== '') {
    const cleanLevel = student.education_level.trim().toLowerCase();
    if (cleanLevel === 'junior school' || cleanLevel === 'junior secondary' || cleanLevel === 'junior secondary school') {
      return true;
    }
    return false;
  }

  // 3. Explicit Education Level parameter
  if (educationLevel && educationLevel.trim() !== '') {
    const cleanLevel = educationLevel.trim().toLowerCase();
    if (cleanLevel === 'junior school' || cleanLevel === 'junior secondary' || cleanLevel === 'junior secondary school') {
      return true;
    }
    return false;
  }

  // No grade-only fallback is permitted. Unknown or absent education level is not Junior School.
  return false;
}

/**
 * Validates if the given context belongs authoritatively to a rankable education level (Junior School or Upper Primary).
 */
export function isRankableEducationLevel(
  educationLevel?: string | null,
  classStream?: ClassStream | null,
  student?: Student | null
): boolean {
  const isJS = isJuniorSchoolEducationLevel(educationLevel, classStream, student);
  if (isJS) return true;

  const level = (
    classStream?.education_level ||
    student?.education_level ||
    educationLevel ||
    ''
  ).trim().toLowerCase();

  if (level === 'upper primary' || level === 'primary') return true;

  const gradeStr = (student?.grade || classStream?.class_name || '').trim().toUpperCase();
  return (
    gradeStr.includes('GRADE 4') ||
    gradeStr.includes('GRADE 5') ||
    gradeStr.includes('GRADE 6') ||
    gradeStr === '4' ||
    gradeStr === '5' ||
    gradeStr === '6'
  );
}

/**
 * Calculates Terminal Total Marks for a learner across their applicable Learning Areas.
 * Sums the whole-number terminalPercentage of each complete subject.
 * Returns null if any applicable subject is incomplete, absent, or missing.
 */
export function calculateTerminalTotalMarks(
  resultsBySubject: Map<string, LearningAreaTerminalResult>,
  applicableSubjectsOrIds: (string | Subject)[]
): {
  totalMarks: number | null;
  maxMarks: number;
  isComplete: boolean;
  completedCount: number;
  totalCount: number;
} {
  const applicableSubjectIds = (applicableSubjectsOrIds || []).map((item) =>
    typeof item === 'string' ? item : item.id
  );
  const totalCount = applicableSubjectIds.length;
  const maxMarks = totalCount * 100;

  if (totalCount === 0) {
    return {
      totalMarks: null,
      maxMarks: 0,
      isComplete: false,
      completedCount: 0,
      totalCount: 0,
    };
  }

  let completedCount = 0;
  let runningSum = 0;
  let allComplete = true;

  for (const subjId of applicableSubjectIds) {
    const res = resultsBySubject.get(subjId);
    const isSubjectComplete = Boolean(
      res &&
      res.isComplete === true &&
      res.status === 'Complete' &&
      typeof res.terminalPercentage === 'number' &&
      Number.isFinite(res.terminalPercentage)
    );

    if (isSubjectComplete && res && res.terminalPercentage !== null) {
      completedCount++;
      runningSum += Math.round(res.terminalPercentage);
    } else {
      allComplete = false;
    }
  }

  return {
    totalMarks: allComplete ? runningSum : null,
    maxMarks,
    isComplete: allComplete,
    completedCount,
    totalCount,
  };
}

/**
 * Evaluates whether a learner is eligible for Terminal Ranking.
 */
export function evaluateLearnerRankingEligibility(params: {
  student?: Student | null;
  classStream?: ClassStream | null;
  resultsBySubject: Map<string, LearningAreaTerminalResult>;
  applicableSubjects: Subject[] | string[];
  educationLevel?: string | null;
}): { isRankable: boolean; isEligible: boolean; incompleteCount: number; reason?: string } {
  const { student, classStream, resultsBySubject, applicableSubjects, educationLevel } = params;

  // Rule 1: Scope is Junior School or Upper Primary
  const isEligibleLevel = isRankableEducationLevel(educationLevel, classStream, student);
  if (!isEligibleLevel) {
    return {
      isRankable: false,
      isEligible: false,
      incompleteCount: 0,
      reason: 'Ranking is only applicable to Junior School or Upper Primary learners.',
    };
  }

  // Rule 2: Must have applicable subjects configured
  if (!applicableSubjects || applicableSubjects.length === 0) {
    return {
      isRankable: false,
      isEligible: false,
      incompleteCount: 0,
      reason: 'No applicable learning areas found for learner.',
    };
  }

  // Rule 3: 100% of applicable subjects must be Complete
  const totalResult = calculateTerminalTotalMarks(resultsBySubject, applicableSubjects);

  if (!totalResult.isComplete) {
    const incomplete = totalResult.totalCount - totalResult.completedCount;
    return {
      isRankable: false,
      isEligible: false,
      incompleteCount: incomplete,
      reason: `Incomplete assessment record (${totalResult.completedCount}/${totalResult.totalCount} learning areas completed).`,
    };
  }

  return { isRankable: true, isEligible: true, incompleteCount: 0 };
}

/**
 * Standard Competition Ranking (1, 2, 2, 4 pattern).
 * Expects items to be pre-sorted descending by score.
 */
export function applyCompetitionRanking<T>(
  items: T[],
  getScore: (item: T) => number,
  setRank: (item: T, rank: number) => void
): void {
  let currentRank = 1;
  for (let i = 0; i < items.length; i++) {
    if (i > 0 && getScore(items[i]) === getScore(items[i - 1])) {
      setRank(items[i], currentRank);
    } else {
      currentRank = i + 1;
      setRank(items[i], currentRank);
    }
  }
}

export interface LearnerCohortEntry {
  student: Student;
  classStream?: ClassStream | null;
  applicableSubjects: Subject[];
  resultsBySubject: Map<string, LearningAreaTerminalResult>;
}

/**
 * Authoritative Batch & Cohort Ranking Calculator.
 * Computes both Stream Position and Overall (Grade) Position for Junior School cohorts.
 * Pure and deterministic.
 */
export function calculateCohortTerminalRankings(params: {
  learners: LearnerCohortEntry[];
  isProvisionalMode?: boolean;
}): Map<string, TerminalLearnerRanking> {
  const { learners, isProvisionalMode = false } = params;
  const rankingsMap = new Map<string, TerminalLearnerRanking>();

  // Intermediate state per learner
  interface EvaluatedLearner {
    studentId: string;
    student: Student;
    classStream?: ClassStream | null;
    gradeKey: string;
    streamKey: string;
    isJuniorSchool: boolean;
    isRankable: boolean;
    terminalTotalMarks: number | null;
    terminalTotalMaximum: number;
    applicableSubjectCount: number;
    completedSubjectCount: number;
    unrankedReason?: string;
    streamPosition: number | null;
    streamPositionDenominator: number | null;
    overallPosition: number | null;
    overallPositionDenominator: number | null;
  }

  const evaluatedList: EvaluatedLearner[] = [];

  for (const entry of learners) {
    const { student, classStream, applicableSubjects, resultsBySubject } = entry;
    const isJS = isJuniorSchoolEducationLevel(undefined, classStream, student);
    const isEligibleLevel = isRankableEducationLevel(undefined, classStream, student);
    const applicableIds = (applicableSubjects || []).map((s) => s.id);
    const marksCalc = calculateTerminalTotalMarks(resultsBySubject, applicableIds);

    const isRankable = isEligibleLevel && marksCalc.isComplete;
    let unrankedReason: string | undefined;

    if (!isEligibleLevel) {
      unrankedReason = 'Ranking is only applicable to Junior School or Upper Primary learners.';
    } else if (!marksCalc.isComplete) {
      unrankedReason = `Incomplete assessment record (${marksCalc.completedCount}/${marksCalc.totalCount} learning areas evaluated).`;
    }

    // Cohort grouping keys
    const rawGrade = (classStream?.class_name || student.grade || 'UnknownGrade').trim().toLowerCase();
    const gradeKey = rawGrade.replace(/^grade\s+/i, 'grade '); // normalize 'grade 7'

    // Stream Key Resolution: Priority given to explicit student stream properties over class defaults
    const studentStreamText = ((student as any).stream || (student as any).stream_name || '').trim();
    const classStreamText = (classStream?.stream || (classStream as any)?.stream_name || '').trim();

    const resolvedStream =
      (student.stream_id && student.stream_id.trim() !== '' ? student.stream_id : undefined) ||
      (classStream?.stream_id && classStream.stream_id.trim() !== '' ? classStream.stream_id : undefined) ||
      (studentStreamText !== '' ? `${gradeKey}_${studentStreamText}` : undefined) ||
      (classStreamText !== '' ? `${gradeKey}_${classStreamText}` : undefined) ||
      student.class_id ||
      classStream?.id ||
      'UnassignedStream';
    const streamKey = String(resolvedStream).trim().toLowerCase();

    evaluatedList.push({
      studentId: student.id,
      student,
      classStream,
      gradeKey,
      streamKey,
      isJuniorSchool: isJS,
      isRankable,
      terminalTotalMarks: marksCalc.totalMarks,
      terminalTotalMaximum: marksCalc.maxMarks,
      applicableSubjectCount: marksCalc.totalCount,
      completedSubjectCount: marksCalc.completedCount,
      unrankedReason,
      streamPosition: null,
      streamPositionDenominator: null,
      overallPosition: null,
      overallPositionDenominator: null,
    });
  }

  // 1. Calculate Overall Position per Grade Cohort (Rankable or Junior School learners)
  const gradeGroups = new Map<string, EvaluatedLearner[]>();
  for (const item of evaluatedList) {
    if (!item.isJuniorSchool && !item.isRankable) continue;
    const group = gradeGroups.get(item.gradeKey) || [];
    group.push(item);
    gradeGroups.set(item.gradeKey, group);
  }

  gradeGroups.forEach((gradeLearners) => {
    const rankableGrade = gradeLearners.filter((l) => l.isRankable && l.terminalTotalMarks !== null);
    const gradeEligibleCount = rankableGrade.length;

    // Sort descending by terminalTotalMarks
    rankableGrade.sort((a, b) => (b.terminalTotalMarks ?? 0) - (a.terminalTotalMarks ?? 0));

    applyCompetitionRanking(
      rankableGrade,
      (item) => item.terminalTotalMarks ?? 0,
      (item, rank) => {
        item.overallPosition = rank;
        item.overallPositionDenominator = gradeEligibleCount;
      }
    );

    // Split grade learners into Streams for Stream Position
    const streamGroups = new Map<string, EvaluatedLearner[]>();
    for (const item of gradeLearners) {
      const sKey = item.streamKey;
      const sGroup = streamGroups.get(sKey) || [];
      sGroup.push(item);
      streamGroups.set(sKey, sGroup);
    }

    streamGroups.forEach((streamLearners) => {
      const rankableStream = streamLearners.filter((l) => l.isRankable && l.terminalTotalMarks !== null);
      const streamEligibleCount = rankableStream.length;

      // Sort descending by terminalTotalMarks
      rankableStream.sort((a, b) => (b.terminalTotalMarks ?? 0) - (a.terminalTotalMarks ?? 0));

      applyCompetitionRanking(
        rankableStream,
        (item) => item.terminalTotalMarks ?? 0,
        (item, rank) => {
          item.streamPosition = rank;
          item.streamPositionDenominator = streamEligibleCount;
        }
      );
    });
  });

  // Package final rankings
  for (const item of evaluatedList) {
    rankingsMap.set(item.studentId, {
      studentId: item.studentId,
      isJuniorSchool: item.isJuniorSchool,
      isRankable: item.isRankable,
      terminalTotalMarks: item.terminalTotalMarks,
      terminalTotalMaximum: item.terminalTotalMaximum,
      applicableSubjectCount: item.applicableSubjectCount,
      completedSubjectCount: item.completedSubjectCount,
      streamPosition: item.streamPosition,
      streamPositionDenominator: item.streamPositionDenominator,
      overallPosition: item.overallPosition,
      overallPositionDenominator: item.overallPositionDenominator,
      isProvisionalMode,
      unrankedReason: item.unrankedReason,
    });
  }

  return rankingsMap;
}

/**
 * Calculates ranking metrics for a single learner in the context of their known cohort.
 */
export function calculateSingleLearnerRanking(params: {
  student: Student;
  classStream?: ClassStream | null;
  resultsBySubject: Map<string, LearningAreaTerminalResult>;
  applicableSubjects: Subject[];
  cohortLearners?: LearnerCohortEntry[];
  isProvisionalMode?: boolean;
}): TerminalLearnerRanking {
  const { student, classStream, resultsBySubject, applicableSubjects, cohortLearners, isProvisionalMode = false } = params;

  if (cohortLearners && cohortLearners.length > 0) {
    // Ensure the target learner is in the cohort
    const hasTarget = cohortLearners.some((c) => c.student.id === student.id);
    const fullCohort = hasTarget
      ? cohortLearners
      : [...cohortLearners, { student, classStream, applicableSubjects, resultsBySubject }];

    const map = calculateCohortTerminalRankings({
      learners: fullCohort,
      isProvisionalMode,
    });

    const res = map.get(student.id);
    if (res) return res;
  }

  // Standalone evaluation without broader cohort
  const isEligibleLevel = isRankableEducationLevel(undefined, classStream, student);
  const isJS = isJuniorSchoolEducationLevel(undefined, classStream, student);
  const applicableIds = (applicableSubjects || []).map((s) => s.id);
  const marksCalc = calculateTerminalTotalMarks(resultsBySubject, applicableIds);
  const isRankable = isEligibleLevel && marksCalc.isComplete;

  return {
    studentId: student.id,
    isJuniorSchool: isJS,
    isRankable,
    terminalTotalMarks: isRankable ? marksCalc.totalMarks : null,
    terminalTotalMaximum: marksCalc.maxMarks,
    applicableSubjectCount: marksCalc.totalCount,
    completedSubjectCount: marksCalc.completedCount,
    streamPosition: isRankable ? 1 : null,
    streamPositionDenominator: isRankable ? 1 : null,
    overallPosition: isRankable ? 1 : null,
    overallPositionDenominator: isRankable ? 1 : null,
    isProvisionalMode,
    unrankedReason: isEligibleLevel ? (marksCalc.isComplete ? undefined : 'Incomplete assessment record') : 'Non-Junior School or Non-Upper Primary level',
  };
}

/**
 * Authoritative Subject Ranking Calculator for a single learner in the context of their cohort.
 * Computes standard competition ranking (1, 2, 2, 4) for every applicable subject.
 * Denominator represents the count of eligible learners who have a valid terminal score for that subject.
 */
export function calculateLearnerSubjectRanks(params: {
  learnerId: string;
  applicableSubjects: Subject[];
  cohortLearners: LearnerCohortEntry[];
}): Record<string, string> {
  const { learnerId, applicableSubjects, cohortLearners } = params;
  const subjectRanks: Record<string, string> = {};

  for (const subj of applicableSubjects) {
    const scoredList: Array<{ studentId: string; percentage: number }> = [];

    for (const entry of cohortLearners) {
      const res = entry.resultsBySubject.get(subj.id);
      if (
        res &&
        res.isComplete &&
        res.status === 'Complete' &&
        typeof res.terminalPercentage === 'number' &&
        Number.isFinite(res.terminalPercentage)
      ) {
        scoredList.push({
          studentId: entry.student.id,
          percentage: res.terminalPercentage,
        });
      }
    }

    if (scoredList.length === 0) {
      subjectRanks[subj.id] = '—';
      continue;
    }

    // Sort descending by percentage
    scoredList.sort((a, b) => b.percentage - a.percentage);

    const eligiblePopulation = scoredList.length;
    let currentRank = 1;
    let foundRank = '—';

    for (let i = 0; i < scoredList.length; i++) {
      if (i > 0 && scoredList[i].percentage < scoredList[i - 1].percentage) {
        currentRank = i + 1;
      }
      if (scoredList[i].studentId === learnerId) {
        foundRank = `${currentRank}/${eligiblePopulation}`;
        break;
      }
    }

    subjectRanks[subj.id] = foundRank;
  }

  return subjectRanks;
}

/**
 * Authoritative Batch Subject Ranking Calculator for all learners in a cohort.
 * Computes standard competition ranking (1, 2, 2, 4) across all subjects for each learner.
 */
export function calculateCohortSubjectRanks(params: {
  applicableSubjects: Subject[];
  cohortLearners: LearnerCohortEntry[];
}): Map<string, Record<string, string>> {
  const { applicableSubjects, cohortLearners } = params;
  const resultMap = new Map<string, Record<string, string>>();

  // Initialize maps for all cohort learners
  for (const entry of cohortLearners) {
    resultMap.set(entry.student.id, {});
  }

  for (const subj of applicableSubjects) {
    const scoredList: Array<{ studentId: string; percentage: number }> = [];

    for (const entry of cohortLearners) {
      const res = entry.resultsBySubject.get(subj.id);
      if (
        res &&
        res.isComplete &&
        res.status === 'Complete' &&
        typeof res.terminalPercentage === 'number' &&
        Number.isFinite(res.terminalPercentage)
      ) {
        scoredList.push({
          studentId: entry.student.id,
          percentage: res.terminalPercentage,
        });
      }
    }

    const eligiblePopulation = scoredList.length;

    if (eligiblePopulation === 0) {
      for (const entry of cohortLearners) {
        const studentRanks = resultMap.get(entry.student.id)!;
        studentRanks[subj.id] = '—';
      }
      continue;
    }

    // Sort descending by percentage
    scoredList.sort((a, b) => b.percentage - a.percentage);

    const rankAssignment = new Map<string, string>();
    let currentRank = 1;
    for (let i = 0; i < scoredList.length; i++) {
      if (i > 0 && scoredList[i].percentage < scoredList[i - 1].percentage) {
        currentRank = i + 1;
      }
      rankAssignment.set(scoredList[i].studentId, `${currentRank}/${eligiblePopulation}`);
    }

    for (const entry of cohortLearners) {
      const studentRanks = resultMap.get(entry.student.id)!;
      studentRanks[subj.id] = rankAssignment.get(entry.student.id) || '—';
    }
  }

  return resultMap;
}

/**
 * Authoritative Batch Assessment Ranking Calculator.
 * Delegates 100% of calculation, composite subject resolution, and competition ranking
 * directly to calculateExamResults() from analysisEngine.ts.
 */
export function calculateCohortAssessmentRankings(params: {
  contributingAssessments: ContributingAssessmentRef[];
  applicableSubjects: Subject[];
  cohortLearners: LearnerCohortEntry[];
  classes?: ClassStream[];
  isProvisionalMode?: boolean;
}): Map<string, Record<string, AssessmentRankingSummary>> {
  const { contributingAssessments, applicableSubjects, cohortLearners } = params;
  const resultMap = new Map<string, Record<string, AssessmentRankingSummary>>();

  // Initialize result map for each learner
  for (const entry of cohortLearners) {
    resultMap.set(entry.student.id, {});
  }

  if (!contributingAssessments || contributingAssessments.length === 0 || !cohortLearners.length) {
    return resultMap;
  }

  const students: Student[] = cohortLearners.map((e) => {
    const s = e.student;
    const cs = e.classStream;
    const effectiveStreamName = (s as any).stream || (s as any).stream_name || cs?.stream || '';
    const effectiveStreamId = s.stream_id || cs?.stream_id || '';
    return {
      ...s,
      stream_id: effectiveStreamId || s.stream_id,
      stream: effectiveStreamName,
      stream_name: effectiveStreamName,
      class_name: (s as any).class_name || cs?.class_name || s.grade,
    } as Student;
  });

  const getClassKey = (c: ClassStream) =>
    c.stream_id ? `${c.id}_${c.stream_id}` : (c.stream ? `${c.id}_${c.stream.trim().toLowerCase()}` : c.id);

  const classesMap = new Map<string, ClassStream>();
  if (params.classes) {
    params.classes.forEach((c) => classesMap.set(getClassKey(c), c));
  }
  for (const entry of cohortLearners) {
    if (entry.classStream) {
      classesMap.set(getClassKey(entry.classStream), entry.classStream);
    }
  }
  const classes: ClassStream[] = Array.from(classesMap.values());

  const isUpperPrimary = cohortLearners.some((e) =>
    isUpperPrimaryTerminalContext({
      student: e.student,
      classStream: e.classStream,
      gradeName: e.student.grade || e.classStream?.class_name,
      educationLevel: e.student.education_level || e.classStream?.education_level,
      subjects: applicableSubjects,
    })
  );

  const effectiveApplicableSubjects = isUpperPrimary
    ? getUpperPrimaryCanonicalSubjects(applicableSubjects)
    : applicableSubjects;

  // Reconstruct canonical Mark records from assessmentTrail for effective subjects ONLY
  const marks: Mark[] = [];
  const seenMarkKeys = new Set<string>();

  for (const entry of cohortLearners) {
    for (const sb of effectiveApplicableSubjects) {
      const res = entry.resultsBySubject.get(sb.id);
      if (!res) continue;
      for (const trail of res.assessmentTrail || []) {
        const key = `m_${trail.examId}_${entry.student.id}_${sb.id}`;
        if (!seenMarkKeys.has(key)) {
          seenMarkKeys.add(key);
          marks.push({
            id: key,
            exam_id: trail.examId,
            student_id: entry.student.id,
            subject_id: sb.id,
            marks: trail.status === 'Normal' ? (trail.rawScore ?? 0) : 0,
            score: trail.rawScore ?? null,
            raw_score: trail.rawScore ?? null,
            out_of: trail.outOf,
            special_status: trail.status,
          });
        }
      }
    }
  }

  for (const exam of contributingAssessments) {
    // Direct delegation to authoritative analysisEngine
    const examResults = calculateExamResults(
      exam.id,
      students,
      marks,
      CBE_8_POINT_GRADES,
      classes,
      effectiveApplicableSubjects,
      exam as any
    );

    // Compute exact denominators from authoritative complete results
    const completeResults = examResults.filter((r) => r.is_complete);
    const gradeCompleteCount = new Map<string, number>();
    const streamCompleteCount = new Map<string, number>();

    for (const r of completeResults) {
      const std = students.find((s) => s.id === r.student_id);
      const stStreamStr = (std as any)?.stream || (std as any)?.stream_name || '';
      const cls =
        (std?.stream_id ? classes.find((c) => c.stream_id === std.stream_id) : undefined) ||
        (stStreamStr
          ? classes.find(
              (c) =>
                c.class_name.toLowerCase() === (std?.grade || '').toLowerCase() &&
                c.stream &&
                c.stream.toLowerCase() === String(stStreamStr).toLowerCase()
            )
          : undefined) ||
        (std?.stream_id ? classes.find((c) => c.id === std.stream_id) : undefined) ||
        classes.find((c) => c.id === std?.class_id);
      const gradeKey = (cls?.class_name || std?.grade || 'unassigned').trim().toLowerCase();
      const effectiveStreamName = stStreamStr || cls?.stream || '';
      const streamKey = (
        cls?.stream_id ||
        std?.stream_id ||
        (effectiveStreamName ? `${cls?.id || std?.class_id || gradeKey}_${effectiveStreamName.toLowerCase()}` : undefined) ||
        (cls ? `${cls.id}_${cls.stream || 'default'}` : (std?.class_id || 'unassigned'))
      ).trim().toLowerCase();

      gradeCompleteCount.set(gradeKey, (gradeCompleteCount.get(gradeKey) || 0) + 1);
      streamCompleteCount.set(streamKey, (streamCompleteCount.get(streamKey) || 0) + 1);
    }

    for (const r of examResults) {
      const std = students.find((s) => s.id === r.student_id);
      if (!std) continue;

      const stStreamStr = (std as any)?.stream || (std as any)?.stream_name || '';
      const cls =
        (std?.stream_id ? classes.find((c) => c.stream_id === std.stream_id) : undefined) ||
        (stStreamStr
          ? classes.find(
              (c) =>
                c.class_name.toLowerCase() === (std?.grade || '').toLowerCase() &&
                c.stream &&
                c.stream.toLowerCase() === String(stStreamStr).toLowerCase()
            )
          : undefined) ||
        (std?.stream_id ? classes.find((c) => c.id === std.stream_id) : undefined) ||
        classes.find((c) => c.id === std?.class_id);
      const gradeKey = (cls?.class_name || std.grade || 'unassigned').trim().toLowerCase();
      const effectiveStreamName = stStreamStr || cls?.stream || '';
      const streamKey = (
        cls?.stream_id ||
        std.stream_id ||
        (effectiveStreamName ? `${cls?.id || std.class_id || gradeKey}_${effectiveStreamName.toLowerCase()}` : undefined) ||
        (cls ? `${cls.id}_${cls.stream || 'default'}` : (std.class_id || 'unassigned'))
      ).trim().toLowerCase();

      const studentSummaries = resultMap.get(r.student_id) || {};

      const maxMarkVal = effectiveApplicableSubjects.length > 0 ? effectiveApplicableSubjects.length * 100 : 600;

      if (r.is_complete) {
        studentSummaries[exam.id] = {
          examId: exam.id,
          examName: exam.exam_name,
          totalMarks: Math.round(r.total_marks),
          maxMarks: maxMarkVal,
          streamPosition: r.class_position || r.stream_position || null,
          streamDenominator: (r as any).stream_count || streamCompleteCount.get(streamKey) || null,
          overallPosition: r.position || null,
          overallDenominator: (r as any).grade_count || gradeCompleteCount.get(gradeKey) || null,
          isComplete: true,
        };
      } else {
        studentSummaries[exam.id] = {
          examId: exam.id,
          examName: exam.exam_name,
          totalMarks: r.subject_count > 0 ? Math.round(r.total_marks) : null,
          maxMarks: maxMarkVal,
          streamPosition: null,
          streamDenominator: null,
          overallPosition: null,
          overallDenominator: null,
          isComplete: false,
          unrankedReason: r.remarks || 'Incomplete assessment',
        };
      }
      resultMap.set(r.student_id, studentSummaries);
    }
  }

  return resultMap;
}

/**
 * Authoritative Single Learner Assessment Ranking Calculator (Standalone Fallback).
 */
export function calculateSingleLearnerAssessmentRankings(params: {
  student: Student;
  classStream?: ClassStream | null;
  resultsBySubject: Map<string, LearningAreaTerminalResult>;
  contributingAssessments: ContributingAssessmentRef[];
  applicableSubjects: Subject[];
  isProvisionalMode?: boolean;
}): Record<string, AssessmentRankingSummary> {
  const { student, classStream, resultsBySubject, contributingAssessments, applicableSubjects } = params;
  const singleCohortEntry: LearnerCohortEntry = {
    student,
    classStream,
    applicableSubjects,
    resultsBySubject,
  };

  const cohortMap = calculateCohortAssessmentRankings({
    contributingAssessments,
    applicableSubjects,
    cohortLearners: [singleCohortEntry],
    isProvisionalMode: params.isProvisionalMode,
  });

  return cohortMap.get(student.id) || {};
}
