import { describe, it, expect } from 'vitest';
import {
  calculateCohortAssessmentRankings,
  LearnerCohortEntry,
} from '../services/terminalRankingEngine';
import {
  ContributingAssessmentRef,
  LearningAreaTerminalResult,
} from '../services/terminalResultsEngine';
import { Student, ClassStream, Subject } from '../types';

describe('Terminal Report Form: Stream Rank vs Grade Rank Invariant', () => {
  const mockSubjects: Subject[] = [
    { id: 'sub_eng', subject_code: 'ENG', subject_name: 'English', category: 'Core', education_level: 'Junior School' },
    { id: 'sub_mat', subject_code: 'MAT', subject_name: 'Mathematics', category: 'Core', education_level: 'Junior School' },
  ];

  // In Supabase, streams share the parent class_id
  const PARENT_CLASS_ID = '0e49e9b0-0a82-4f4b-9109-685b0103a54c';
  const STREAM_RED_ID = '3d0ecb00-3e0f-425a-8d69-59f6c9f18b40';
  const STREAM_BLUE_ID = '95e8ff02-6d67-433f-a417-2d74e2012793';

  const classRed: ClassStream = {
    id: PARENT_CLASS_ID,
    stream_id: STREAM_RED_ID,
    class_name: 'Grade 9',
    stream: 'Red',
    capacity: 40,
    education_level: 'Junior School',
  };

  const classBlue: ClassStream = {
    id: PARENT_CLASS_ID,
    stream_id: STREAM_BLUE_ID,
    class_name: 'Grade 9',
    stream: 'Blue',
    capacity: 40,
    education_level: 'Junior School',
  };

  const classes: ClassStream[] = [classRed, classBlue];

  const contributingAssessments: ContributingAssessmentRef[] = [
    { id: 'exam_opener', exam_name: 'Grade 9 Opener Assessment Term 3 2026', max_marks: 100 },
    { id: 'exam_kjsea', exam_name: 'GRADE 9 KJSEA SECOND TRIAL TERM 3 2026', max_marks: 100 },
  ];

  function makeSubjectResult(subjectId: string, scoreOpener: number, scoreKjsea: number): LearningAreaTerminalResult {
    const avg = (scoreOpener + scoreKjsea) / 2;
    return {
      subjectId,
      isComplete: true,
      status: 'Complete',
      terminalPercentage: avg,
      unroundedTerminalPercentage: avg,
      cbePerformanceLevel: 'EE1',
      points: 8,
      assessmentTrail: [
        { examId: 'exam_opener', examName: 'Grade 9 Opener Assessment Term 3 2026', status: 'Normal', rawScore: scoreOpener, outOf: 100, percentage: scoreOpener, displayScore: `${scoreOpener}`, displayPercentage: `${scoreOpener}%` },
        { examId: 'exam_kjsea', examName: 'GRADE 9 KJSEA SECOND TRIAL TERM 3 2026', status: 'Normal', rawScore: scoreKjsea, outOf: 100, percentage: scoreKjsea, displayScore: `${scoreKjsea}`, displayPercentage: `${scoreKjsea}%` },
      ],
    };
  }

  it('correctly calculates Stream Rank (/ 38) and Overall Grade Rank (/ 76) for shared parent class_id', () => {
    const cohort: LearnerCohortEntry[] = [];

    // 38 learners in Blue stream
    for (let i = 1; i <= 38; i++) {
      const student: Student = {
        id: `std_blue_${i}`,
        admission_number: `ADM-B-${i}`,
        full_name: `Blue Learner ${i}`,
        gender: i % 2 === 0 ? 'M' : 'F',
        class_id: PARENT_CLASS_ID,
        stream_id: STREAM_BLUE_ID,
        grade: 'Grade 9',
        active: true,
      };
      const resultsBySubject = new Map<string, LearningAreaTerminalResult>();
      resultsBySubject.set('sub_eng', makeSubjectResult('sub_eng', 96 - i, 96 - i));
      resultsBySubject.set('sub_mat', makeSubjectResult('sub_mat', 90 - i, 90 - i));
      cohort.push({
        student,
        classStream: classBlue,
        applicableSubjects: mockSubjects,
        resultsBySubject,
      });
    }

    // 38 learners in Red stream (all scoring 90 - i)
    for (let i = 1; i <= 38; i++) {
      const student: Student = {
        id: `std_red_${i}`,
        admission_number: `ADM-R-${i}`,
        full_name: `Red Learner ${i}`,
        gender: i % 2 === 0 ? 'M' : 'F',
        class_id: PARENT_CLASS_ID,
        stream_id: STREAM_RED_ID,
        grade: 'Grade 9',
        active: true,
      };
      const resultsBySubject = new Map<string, LearningAreaTerminalResult>();
      resultsBySubject.set('sub_eng', makeSubjectResult('sub_eng', 90 - i, 90 - i));
      resultsBySubject.set('sub_mat', makeSubjectResult('sub_mat', 80 - i, 80 - i));
      cohort.push({
        student,
        classStream: classRed,
        applicableSubjects: mockSubjects,
        resultsBySubject,
      });
    }

    const rankingsMap = calculateCohortAssessmentRankings({
      contributingAssessments,
      applicableSubjects: mockSubjects,
      cohortLearners: cohort,
      classes,
    });

    // Check Blue Learner 2 (score 94)
    const b2Ranking = rankingsMap.get('std_blue_2')!['exam_opener'];
    expect(b2Ranking).toBeDefined();
    expect(b2Ranking.isComplete).toBe(true);

    // Stream rank must be 2 / 38 (out of the 38 learners in Blue)
    expect(b2Ranking.streamPosition).toBe(2);
    expect(b2Ranking.streamDenominator).toBe(38);

    // Overall grade rank must be 2 / 76 (out of the 76 learners across all of Grade 9)
    expect(b2Ranking.overallPosition).toBe(2);
    expect(b2Ranking.overallDenominator).toBe(76);

    // Check Red Learner 1 (score 89)
    const r1Ranking = rankingsMap.get('std_red_1')!['exam_opener'];
    expect(r1Ranking).toBeDefined();

    // Red Learner 1 is #1 in Red stream out of 38
    expect(r1Ranking.streamPosition).toBe(1);
    expect(r1Ranking.streamDenominator).toBe(38);

    // But overall in Grade 9, all Blue learners 1-7 scored higher than 89
    // Blue 1: 95, Blue 2: 94, Blue 3: 93, Blue 4: 92, Blue 5: 91, Blue 6: 90, Red 1: 89, Blue 7: 89 (tied at pos 7)
    expect(r1Ranking.overallDenominator).toBe(76);
  });

  it('strictly ensures a learner with an X is unranked and NEVER given stream or overall position', () => {
    const studentWithX: Student = {
      id: 'std_susan_wangari',
      admission_number: '140',
      full_name: 'SUSAN WANGARI',
      gender: 'F',
      class_id: PARENT_CLASS_ID,
      stream_id: STREAM_BLUE_ID,
      grade: 'Grade 9',
      active: true,
    };

    // Susan sat English, but has an 'X' (missing mark) in Mathematics
    const resultsBySubject = new Map<string, LearningAreaTerminalResult>();
    resultsBySubject.set('sub_eng', makeSubjectResult('sub_eng', 70, 70));
    resultsBySubject.set('sub_mat', {
      subjectId: 'sub_mat',
      isComplete: false,
      status: 'INCOMPLETE (X)',
      terminalPercentage: null,
      unroundedTerminalPercentage: null,
      cbePerformanceLevel: 'BE1',
      points: 0,
      assessmentTrail: [
        { examId: 'exam_opener', examName: 'Grade 9 Opener Assessment Term 3 2026', status: 'X', rawScore: null, outOf: 100, percentage: null, displayScore: 'X', displayPercentage: 'X' },
      ],
    });

    const cohort: LearnerCohortEntry[] = [
      {
        student: studentWithX,
        classStream: classBlue,
        applicableSubjects: mockSubjects,
        resultsBySubject,
      },
    ];

    const rankingsMap = calculateCohortAssessmentRankings({
      contributingAssessments,
      applicableSubjects: mockSubjects,
      cohortLearners: cohort,
      classes,
    });

    const susanRanking = rankingsMap.get('std_susan_wangari')!['exam_opener'];
    expect(susanRanking).toBeDefined();
    expect(susanRanking.isComplete).toBe(false);
    expect(susanRanking.streamPosition).toBeNull();
    expect(susanRanking.streamDenominator).toBeNull();
    expect(susanRanking.overallPosition).toBeNull();
    expect(susanRanking.overallDenominator).toBeNull();
  });
});
