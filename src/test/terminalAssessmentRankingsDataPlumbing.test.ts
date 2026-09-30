import { describe, it, expect } from 'vitest';
import {
  calculateCohortAssessmentRankings,
  calculateSingleLearnerAssessmentRankings,
  calculateCohortTerminalRankings,
  LearnerCohortEntry,
} from '../services/terminalRankingEngine';
import {
  ContributingAssessmentRef,
  LearningAreaTerminalResult,
} from '../services/terminalResultsEngine';
import { Student, ClassStream, Subject } from '../types';

describe('Phase 2 Data Plumbing: Assessment-Specific Totals and Rankings', () => {
  const mockSubjects: Subject[] = [
    { id: 'sub_eng', subject_code: 'ENG', subject_name: 'English', category: 'Core', education_level: 'Upper Primary' },
    { id: 'sub_kis', subject_code: 'KIS', subject_name: 'Kiswahili', category: 'Core', education_level: 'Upper Primary' },
    { id: 'sub_mat', subject_code: 'MAT', subject_name: 'Mathematics', category: 'Core', education_level: 'Upper Primary' },
    { id: 'sub_sci', subject_code: 'SCI', subject_name: 'Integrated Science', category: 'Core', education_level: 'Upper Primary' },
    { id: 'sub_cas', subject_code: 'CAS', subject_name: 'Creative Arts & Sports', category: 'Core', education_level: 'Upper Primary' },
    { id: 'sub_ssc', subject_code: 'SSC', subject_name: 'Social Studies & C.R.E.', category: 'Core', education_level: 'Upper Primary' },
  ];

  const mockClassStreamBlue: ClassStream = {
    id: 'cls_g6_blue',
    class_name: 'Grade 6',
    stream: 'Blue',
    education_level: 'Upper Primary',
    allocated_subject_ids: mockSubjects.map((s) => s.id),
  };

  const mockClassStreamRed: ClassStream = {
    id: 'cls_g6_red',
    class_name: 'Grade 6',
    stream: 'Red',
    education_level: 'Upper Primary',
    allocated_subject_ids: mockSubjects.map((s) => s.id),
  };

  const contributingAssessments: ContributingAssessmentRef[] = [
    { id: 'exam_kpsea_trial', exam_name: 'KPSEA SECOND TRIAL', max_marks: 100 },
    { id: 'exam_opener', exam_name: 'OPENER ASSESSMENT', max_marks: 100 },
  ];

  // Helper to construct a LearningAreaTerminalResult for a subject
  function makeSubjectResult(
    subjectId: string,
    kpseaScore: number | null,
    openerScore: number | null,
    status: 'Normal' | 'X' | 'Y' = 'Normal'
  ): LearningAreaTerminalResult {
    const kpseaTrail = {
      examId: 'exam_kpsea_trial',
      examName: 'KPSEA SECOND TRIAL',
      status: kpseaScore === null ? ('X' as const) : status,
      rawScore: kpseaScore,
      outOf: 100,
      percentage: kpseaScore,
      displayScore: kpseaScore !== null ? `${kpseaScore}` : 'X',
      displayPercentage: kpseaScore !== null ? `${kpseaScore}%` : 'X',
    };

    const openerTrail = {
      examId: 'exam_opener',
      examName: 'OPENER ASSESSMENT',
      status: openerScore === null ? ('X' as const) : status,
      rawScore: openerScore,
      outOf: 100,
      percentage: openerScore,
      displayScore: openerScore !== null ? `${openerScore}` : 'X',
      displayPercentage: openerScore !== null ? `${openerScore}%` : 'X',
    };

    const isComplete = kpseaScore !== null && openerScore !== null && status === 'Normal';
    const termPct = isComplete ? Math.round(((kpseaScore ?? 0) + (openerScore ?? 0)) / 2) : null;

    return {
      subjectId,
      isComplete,
      status: isComplete ? 'Complete' : 'INCOMPLETE (X)',
      terminalPercentage: termPct,
      unroundedTerminalPercentage: termPct,
      cbePerformanceLevel: 'ME',
      points: 3,
      assessmentTrail: [kpseaTrail, openerTrail],
    };
  }

  // Learner 1 (Dorcas - Blue Stream): KPSEA 201/600, Opener 228/600, Terminal 215/600
  const studentDorcas: Student = {
    id: 'std_dorcas',
    admission_number: '058',
    full_name: 'DORCAS CHEPKOECH',
    grade: 'Grade 6',
    class_id: 'cls_g6_blue',
    gender: 'F',
    active: true,
  };

  const dorcasResults = new Map<string, LearningAreaTerminalResult>([
    ['sub_eng', makeSubjectResult('sub_eng', 48, 38)],
    ['sub_kis', makeSubjectResult('sub_kis', 50, 44)],
    ['sub_mat', makeSubjectResult('sub_mat', 40, 30)],
    ['sub_sci', makeSubjectResult('sub_sci', 44, 42)],
    ['sub_cas', makeSubjectResult('sub_cas', 9, 32)],
    ['sub_ssc', makeSubjectResult('sub_ssc', 10, 42)],
  ]);

  // Learner 2 (Top in Blue Stream): KPSEA 500/600, Opener 480/600, Terminal 490/600
  const studentTopBlue: Student = {
    id: 'std_top_blue',
    admission_number: '001',
    full_name: 'TOP BLUE LEARNER',
    grade: 'Grade 6',
    class_id: 'cls_g6_blue',
    gender: 'M',
    active: true,
  };

  const topBlueResults = new Map<string, LearningAreaTerminalResult>([
    ['sub_eng', makeSubjectResult('sub_eng', 85, 80)],
    ['sub_kis', makeSubjectResult('sub_kis', 80, 80)],
    ['sub_mat', makeSubjectResult('sub_mat', 90, 80)],
    ['sub_sci', makeSubjectResult('sub_sci', 85, 80)],
    ['sub_cas', makeSubjectResult('sub_cas', 80, 80)],
    ['sub_ssc', makeSubjectResult('sub_ssc', 80, 80)],
  ]);

  // Learner 3 (Red Stream): KPSEA 350/600, Opener 360/600
  const studentRed1: Student = {
    id: 'std_red_1',
    admission_number: '002',
    full_name: 'RED STREAM LEARNER',
    grade: 'Grade 6',
    class_id: 'cls_g6_red',
    gender: 'F',
    active: true,
  };

  const redResults = new Map<string, LearningAreaTerminalResult>([
    ['sub_eng', makeSubjectResult('sub_eng', 60, 60)],
    ['sub_kis', makeSubjectResult('sub_kis', 60, 60)],
    ['sub_mat', makeSubjectResult('sub_mat', 60, 60)],
    ['sub_sci', makeSubjectResult('sub_sci', 60, 60)],
    ['sub_cas', makeSubjectResult('sub_cas', 55, 60)],
    ['sub_ssc', makeSubjectResult('sub_ssc', 55, 60)],
  ]);

  // Learner 4 (Incomplete Learner): Missing KPSEA for sub_ssc
  const studentIncomplete: Student = {
    id: 'std_incomplete',
    admission_number: '099',
    full_name: 'INCOMPLETE LEARNER',
    grade: 'Grade 6',
    class_id: 'cls_g6_blue',
    gender: 'M',
    active: true,
  };

  const incompleteResults = new Map<string, LearningAreaTerminalResult>([
    ['sub_eng', makeSubjectResult('sub_eng', 50, 50)],
    ['sub_kis', makeSubjectResult('sub_kis', 50, 50)],
    ['sub_mat', makeSubjectResult('sub_mat', 50, 50)],
    ['sub_sci', makeSubjectResult('sub_sci', 50, 50)],
    ['sub_cas', makeSubjectResult('sub_cas', 50, 50)],
    ['sub_ssc', makeSubjectResult('sub_ssc', null, 50, 'X')],
  ]);

  const cohort: LearnerCohortEntry[] = [
    { student: studentDorcas, classStream: mockClassStreamBlue, applicableSubjects: mockSubjects, resultsBySubject: dorcasResults },
    { student: studentTopBlue, classStream: mockClassStreamBlue, applicableSubjects: mockSubjects, resultsBySubject: topBlueResults },
    { student: studentRed1, classStream: mockClassStreamRed, applicableSubjects: mockSubjects, resultsBySubject: redResults },
    { student: studentIncomplete, classStream: mockClassStreamBlue, applicableSubjects: mockSubjects, resultsBySubject: incompleteResults },
  ];

  it('1. Correctly calculates assessment totals and maximums for KPSEA Second Trial', () => {
    const rankingsMap = calculateCohortAssessmentRankings({
      contributingAssessments,
      applicableSubjects: mockSubjects,
      cohortLearners: cohort,
    });

    const dorcasAssessments = rankingsMap.get('std_dorcas')!;
    expect(dorcasAssessments).toBeDefined();

    const kpsea = dorcasAssessments['exam_kpsea_trial'];
    expect(kpsea).toBeDefined();
    // English (48) + Kiswahili (50) + Math (40) + Science (44) + Creative Arts (9) + SST/CRE (10/50 -> 30%) = 221
    expect(kpsea.totalMarks).toBe(221);
    expect(kpsea.maxMarks).toBe(600);
    expect(kpsea.isComplete).toBe(true);
  });

  it('2. Correctly calculates assessment totals and maximums for Opener Assessment', () => {
    const rankingsMap = calculateCohortAssessmentRankings({
      contributingAssessments,
      applicableSubjects: mockSubjects,
      cohortLearners: cohort,
    });

    const dorcasAssessments = rankingsMap.get('std_dorcas')!;
    const opener = dorcasAssessments['exam_opener'];
    expect(opener).toBeDefined();
    // English (38) + Kiswahili (44) + Math (30) + Science (42) + Creative Arts (32) + SST/CRE (42/50 -> 84%) = 312
    expect(opener.totalMarks).toBe(312);
    expect(opener.maxMarks).toBe(600);
    expect(opener.isComplete).toBe(true);
  });

  it('3. Correctly calculates Stream Rank and Overall Rank for contributing assessments', () => {
    const rankingsMap = calculateCohortAssessmentRankings({
      contributingAssessments,
      applicableSubjects: mockSubjects,
      cohortLearners: cohort,
    });

    const dorcasKpsea = rankingsMap.get('std_dorcas')!['exam_kpsea_trial'];
    expect(dorcasKpsea.streamPosition).toBe(2);
    expect(dorcasKpsea.streamDenominator).toBe(2); // 2 complete learners in Blue stream
    expect(dorcasKpsea.overallPosition).toBe(3);
    expect(dorcasKpsea.overallDenominator).toBe(3); // 3 complete learners across Grade 6

    const topBlueKpsea = rankingsMap.get('std_top_blue')!['exam_kpsea_trial'];
    expect(topBlueKpsea.streamPosition).toBe(1);
    expect(topBlueKpsea.overallPosition).toBe(1);

    const redKpsea = rankingsMap.get('std_red_1')!['exam_kpsea_trial'];
    expect(redKpsea.streamPosition).toBe(1);
    expect(redKpsea.streamDenominator).toBe(1);
    expect(redKpsea.overallPosition).toBe(2);
    expect(redKpsea.overallDenominator).toBe(3);
  });

  it('4. Correctly marks incomplete learners as unranked (null rank and denominator)', () => {
    const rankingsMap = calculateCohortAssessmentRankings({
      contributingAssessments,
      applicableSubjects: mockSubjects,
      cohortLearners: cohort,
    });

    const incompleteKpsea = rankingsMap.get('std_incomplete')!['exam_kpsea_trial'];
    expect(incompleteKpsea.isComplete).toBe(false);
    expect(incompleteKpsea.streamPosition).toBeNull();
    expect(incompleteKpsea.overallPosition).toBeNull();
    expect(incompleteKpsea.unrankedReason).toBeDefined();
  });

  it('5. Single learner fallback returns valid structure', () => {
    const singleRes = calculateSingleLearnerAssessmentRankings({
      student: studentDorcas,
      classStream: mockClassStreamBlue,
      resultsBySubject: dorcasResults,
      contributingAssessments,
      applicableSubjects: mockSubjects,
    });

    expect(singleRes['exam_kpsea_trial']).toBeDefined();
    expect(singleRes['exam_kpsea_trial'].totalMarks).toBe(221);
    expect(singleRes['exam_kpsea_trial'].maxMarks).toBe(600);
    expect(singleRes['exam_opener'].totalMarks).toBe(312);
  });

  it('6. Terminal ranking calculations remain completely independent and unchanged', () => {
    const terminalRankings = calculateCohortTerminalRankings({
      learners: cohort,
    });

    const dorcasTerminal = terminalRankings.get('std_dorcas')!;
    expect(dorcasTerminal).toBeDefined();
    expect(dorcasTerminal.isRankable).toBe(true);
    expect(dorcasTerminal.streamPosition).toBe(2);
    expect(dorcasTerminal.streamPositionDenominator).toBe(2);
    expect(dorcasTerminal.overallPosition).toBe(3);
    expect(dorcasTerminal.overallPositionDenominator).toBe(3);
  });
});
