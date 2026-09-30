import { describe, it, expect } from 'vitest';
import {
  calculateLearningAreaTerminalResult,
  calculateLearnerTerminalResults,
  isUpperPrimaryTerminalContext,
  getUpperPrimaryCanonicalSubjects,
  ContributingAssessmentRef,
} from '../services/terminalResultsEngine';
import { initialGrades, initialSubjects } from '../data/seedData';
import { getGradeForMark } from '../services/analysisEngine';

describe('Phase 1 Surgical Verification: Upper Primary Terminal Results Engine', () => {
  const mockUpperPrimaryAssessments: ContributingAssessmentRef[] = [
    {
      id: 'exam_up_opener_2026',
      exam_name: 'Grade 6 Opener Assessment Term 3 2026',
      max_marks: 100,
      out_of: 100,
      status: 'Approved',
    },
    {
      id: 'exam_up_mid_2026',
      exam_name: 'Grade 6 Mid Term Assessment Term 3 2026',
      max_marks: 100,
      out_of: 100,
      status: 'Approved',
    },
  ];

  describe('Fix 1 — Upper Primary 4-Point CBE Grading Scale & Boundaries', () => {
    it('strictly maps marks to the 4-point scale (EE: 4, ME: 3, AE: 2, BE: 1)', () => {
      // 0–25 -> BE / 1
      const g0 = getGradeForMark(0, initialGrades, 'Upper Primary', 'Grade 6');
      expect(g0.grade_code).toBe('BE');
      expect(g0.points).toBe(1);

      const g25 = getGradeForMark(25, initialGrades, 'Upper Primary', 'Grade 6');
      expect(g25.grade_code).toBe('BE');
      expect(g25.points).toBe(1);

      // 26–50 -> AE / 2
      const g26 = getGradeForMark(26, initialGrades, 'Upper Primary', 'Grade 6');
      expect(g26.grade_code).toBe('AE');
      expect(g26.points).toBe(2);

      const g50 = getGradeForMark(50, initialGrades, 'Upper Primary', 'Grade 6');
      expect(g50.grade_code).toBe('AE');
      expect(g50.points).toBe(2);

      // 51–75 -> ME / 3
      const g51 = getGradeForMark(51, initialGrades, 'Upper Primary', 'Grade 6');
      expect(g51.grade_code).toBe('ME');
      expect(g51.points).toBe(3);

      const g75 = getGradeForMark(75, initialGrades, 'Upper Primary', 'Grade 6');
      expect(g75.grade_code).toBe('ME');
      expect(g75.points).toBe(3);

      // 76–100 -> EE / 4
      const g76 = getGradeForMark(76, initialGrades, 'Upper Primary', 'Grade 6');
      expect(g76.grade_code).toBe('EE');
      expect(g76.points).toBe(4);

      const g100 = getGradeForMark(100, initialGrades, 'Upper Primary', 'Grade 6');
      expect(g100.grade_code).toBe('EE');
      expect(g100.points).toBe(4);
    });

    it('ensures calculateLearningAreaTerminalResult outputs 4-point CBE levels and points for Upper Primary', () => {
      const marks = [
        {
          exam_id: 'exam_up_opener_2026',
          subject_id: 'sb_up_mat',
          student_id: 'std_01',
          marks: 75,
          raw_score: 75,
          out_of: 100,
        },
        {
          exam_id: 'exam_up_mid_2026',
          subject_id: 'sb_up_mat',
          student_id: 'std_01',
          marks: 77,
          raw_score: 77,
          out_of: 100,
        },
      ];

      // Mean = (75 + 77) / 2 = 76 -> EE / 4 points
      const result = calculateLearningAreaTerminalResult({
        subjectId: 'sb_up_mat',
        contributingAssessments: mockUpperPrimaryAssessments,
        marks,
        grades: initialGrades,
        educationLevel: 'Upper Primary',
        gradeName: 'Grade 6',
      });

      expect(result.isComplete).toBe(true);
      expect(result.terminalPercentage).toBe(76);
      expect(result.cbePerformanceLevel).toBe('EE');
      expect(result.points).toBe(4);
    });

    it('infers Upper Primary context from contributing assessment name even when educationLevel is omitted', () => {
      const marks = [
        {
          exam_id: 'exam_up_opener_2026',
          subject_id: 'sb_up_mat',
          student_id: 'std_01',
          marks: 25,
          raw_score: 25,
          out_of: 100,
        },
        {
          exam_id: 'exam_up_mid_2026',
          subject_id: 'sb_up_mat',
          student_id: 'std_01',
          marks: 25,
          raw_score: 25,
          out_of: 100,
        },
      ];

      // Average 25% -> BE, 1 point
      const result = calculateLearningAreaTerminalResult({
        subjectId: 'sb_up_mat',
        contributingAssessments: mockUpperPrimaryAssessments,
        marks,
        grades: initialGrades,
        // educationLevel omitted deliberately to test inference
      });

      expect(result.isComplete).toBe(true);
      expect(result.terminalPercentage).toBe(25);
      expect(result.cbePerformanceLevel).toBe('BE');
      expect(result.points).toBe(1);
    });
  });

  describe('Fix 2 — Upper Primary English and Kiswahili Consolidation', () => {
    it('consolidates English Language /60 and English Composition /40 into ONE English /100 result', () => {
      const marks = [
        // Exam 1: Opener (Lang: 45/60, Comp: 30/40) -> Total 75/100
        {
          exam_id: 'exam_up_opener_2026',
          subject_id: 'sb_up_eng',
          student_id: 'std_01',
          marks: 45,
          raw_score: 45,
          out_of: 60,
        },
        {
          exam_id: 'exam_up_opener_2026',
          subject_id: 'sb_up_comp',
          student_id: 'std_01',
          marks: 30,
          raw_score: 30,
          out_of: 40,
        },
        // Exam 2: Mid Term (Lang: 48/60, Comp: 32/40) -> Total 80/100
        {
          exam_id: 'exam_up_mid_2026',
          subject_id: 'sb_up_eng',
          student_id: 'std_01',
          marks: 48,
          raw_score: 48,
          out_of: 60,
        },
        {
          exam_id: 'exam_up_mid_2026',
          subject_id: 'sb_up_comp',
          student_id: 'std_01',
          marks: 32,
          raw_score: 32,
          out_of: 40,
        },
      ];

      // Mean = (75 + 80) / 2 = 77.5 -> 78% (EE / 4 points)
      const result = calculateLearningAreaTerminalResult({
        subjectId: 'sb_up_eng',
        contributingAssessments: mockUpperPrimaryAssessments,
        marks,
        grades: initialGrades,
        educationLevel: 'Upper Primary',
        gradeName: 'Grade 6',
      });

      expect(result.isComplete).toBe(true);
      expect(result.terminalPercentage).toBe(78);
      expect(result.cbePerformanceLevel).toBe('EE');
      expect(result.points).toBe(4);

      // Verify assessment trail entries have rawScore out of 100
      expect(result.assessmentTrail.length).toBe(2);
      expect(result.assessmentTrail[0].rawScore).toBe(75);
      expect(result.assessmentTrail[0].outOf).toBe(100);
      expect(result.assessmentTrail[1].rawScore).toBe(80);
      expect(result.assessmentTrail[1].outOf).toBe(100);
    });

    it('consolidates Kiswahili Lugha /60 and Kiswahili Insha /40 into ONE Kiswahili /100 result', () => {
      const marks = [
        // Exam 1: Opener (Lugha: 30/60, Insha: 20/40) -> Total 50/100 (AE / 2)
        {
          exam_id: 'exam_up_opener_2026',
          subject_id: 'sb_up_kis',
          student_id: 'std_01',
          marks: 30,
          raw_score: 30,
          out_of: 60,
        },
        {
          exam_id: 'exam_up_opener_2026',
          subject_id: 'sb_up_insha',
          student_id: 'std_01',
          marks: 20,
          raw_score: 20,
          out_of: 40,
        },
        // Exam 2: Mid Term (Lugha: 33/60, Insha: 21/40) -> Total 54/100 (ME / 3)
        {
          exam_id: 'exam_up_mid_2026',
          subject_id: 'sb_up_kis',
          student_id: 'std_01',
          marks: 33,
          raw_score: 33,
          out_of: 60,
        },
        {
          exam_id: 'exam_up_mid_2026',
          subject_id: 'sb_up_insha',
          student_id: 'std_01',
          marks: 21,
          raw_score: 21,
          out_of: 40,
        },
      ];

      // Mean = (50 + 54) / 2 = 52% -> ME / 3 points
      const result = calculateLearningAreaTerminalResult({
        subjectId: 'sb_up_kis',
        contributingAssessments: mockUpperPrimaryAssessments,
        marks,
        grades: initialGrades,
        educationLevel: 'Upper Primary',
        gradeName: 'Grade 6',
      });

      expect(result.isComplete).toBe(true);
      expect(result.terminalPercentage).toBe(52);
      expect(result.cbePerformanceLevel).toBe('ME');
      expect(result.points).toBe(3);
    });

    it('returns INCOMPLETE (X) if a learner is missing composition or language mark in an assessment', () => {
      const marks = [
        // Exam 1: Has Lang 45/60, but missing Comp entirely
        {
          exam_id: 'exam_up_opener_2026',
          subject_id: 'sb_up_eng',
          student_id: 'std_01',
          marks: 45,
          raw_score: 45,
          out_of: 60,
        },
        // Exam 2: Complete
        {
          exam_id: 'exam_up_mid_2026',
          subject_id: 'sb_up_eng',
          student_id: 'std_01',
          marks: 48,
          raw_score: 48,
          out_of: 60,
        },
        {
          exam_id: 'exam_up_mid_2026',
          subject_id: 'sb_up_comp',
          student_id: 'std_01',
          marks: 32,
          raw_score: 32,
          out_of: 40,
        },
      ];

      const result = calculateLearningAreaTerminalResult({
        subjectId: 'sb_up_eng',
        contributingAssessments: mockUpperPrimaryAssessments,
        marks,
        grades: initialGrades,
        educationLevel: 'Upper Primary',
        gradeName: 'Grade 6',
      });

      expect(result.isComplete).toBe(false);
      expect(result.status).toBe('INCOMPLETE (X)');
      expect(result.terminalPercentage).toBe(null);
      expect(result.cbePerformanceLevel).toBe(null);
    });
  });

  describe('Fix 3 — Social Studies & C.R.E. Marks-Entry Structures Consolidation', () => {
    it('correctly consolidates SST /30 + CRE /20 (Structure A) into SS&CRE /100', () => {
      const assessments: ContributingAssessmentRef[] = [
        {
          id: 'exam_a1',
          exam_name: 'Grade 6 Opener Assessment',
          max_marks: 50,
          out_of: 50,
          status: 'Approved',
          ss_cre_structure: 'A',
        } as any,
      ];

      // Learner marks: SST 24/30, CRE 16/20 -> total 40/50 -> scaled to 80/100 (EE / 4)
      const marks = [
        {
          exam_id: 'exam_a1',
          subject_id: 'sb_sst',
          student_id: 'std_01',
          marks: 24,
          raw_score: 24,
          out_of: 30,
        },
        {
          exam_id: 'exam_a1',
          subject_id: 'sb_cre',
          student_id: 'std_01',
          marks: 16,
          raw_score: 16,
          out_of: 20,
        },
      ];

      const result = calculateLearningAreaTerminalResult({
        subjectId: 'sb_up_ss_cre',
        contributingAssessments: assessments,
        marks,
        grades: initialGrades,
        educationLevel: 'Upper Primary',
        gradeName: 'Grade 6',
      });

      expect(result.isComplete).toBe(true);
      expect(result.terminalPercentage).toBe(80);
      expect(result.cbePerformanceLevel).toBe('EE');
      expect(result.points).toBe(4);
    });

    it('correctly consolidates SST /10 + CRE /10 (Structure B) into SS&CRE /100', () => {
      const assessments: ContributingAssessmentRef[] = [
        {
          id: 'exam_b1',
          exam_name: 'Grade 5 Continuous Assessment',
          max_marks: 20,
          out_of: 20,
          status: 'Approved',
          ss_cre_structure: 'B',
        } as any,
      ];

      // Learner marks: SST 7/10, CRE 8/10 -> total 15/20 -> scaled to 75/100 (ME / 3)
      const marks = [
        {
          exam_id: 'exam_b1',
          subject_id: 'sb_sst',
          student_id: 'std_01',
          marks: 7,
          raw_score: 7,
          out_of: 10,
        },
        {
          exam_id: 'exam_b1',
          subject_id: 'sb_cre',
          student_id: 'std_01',
          marks: 8,
          raw_score: 8,
          out_of: 10,
        },
      ];

      const result = calculateLearningAreaTerminalResult({
        subjectId: 'sb_up_ss_cre',
        contributingAssessments: assessments,
        marks,
        grades: initialGrades,
        educationLevel: 'Upper Primary',
        gradeName: 'Grade 5',
      });

      expect(result.isComplete).toBe(true);
      expect(result.terminalPercentage).toBe(75);
      expect(result.cbePerformanceLevel).toBe('ME');
      expect(result.points).toBe(3);
    });

    it('correctly consolidates SST /20 + CRE /30 (Structure C) into SS&CRE /100', () => {
      const assessments: ContributingAssessmentRef[] = [
        {
          id: 'exam_c1',
          exam_name: 'Grade 6 End Term Assessment',
          max_marks: 50,
          out_of: 50,
          status: 'Approved',
          ss_cre_structure: 'C',
        } as any,
      ];

      // Learner marks: SST 10/20, CRE 15/30 -> total 25/50 -> scaled to 50/100 (AE / 2)
      const marks = [
        {
          exam_id: 'exam_c1',
          subject_id: 'sb_sst',
          student_id: 'std_01',
          marks: 10,
          raw_score: 10,
          out_of: 20,
        },
        {
          exam_id: 'exam_c1',
          subject_id: 'sb_cre',
          student_id: 'std_01',
          marks: 15,
          raw_score: 15,
          out_of: 30,
        },
      ];

      const result = calculateLearningAreaTerminalResult({
        subjectId: 'sb_up_ss_cre',
        contributingAssessments: assessments,
        marks,
        grades: initialGrades,
        educationLevel: 'Upper Primary',
        gradeName: 'Grade 6',
      });

      expect(result.isComplete).toBe(true);
      expect(result.terminalPercentage).toBe(50);
      expect(result.cbePerformanceLevel).toBe('AE');
      expect(result.points).toBe(2);
    });
  });

  describe('Full Cohort / calculateLearnerTerminalResults for Upper Primary', () => {
    it('produces exactly the 6 canonical learning areas with total /600', () => {
      // 8 allocated raw subjects for Grade 6 in database:
      // ['sb_up_eng', 'sb_up_comp', 'sb_up_kis', 'sb_up_insha', 'sb_up_mat', 'sb_sci', 'sb_up_cas', 'sb_up_ss_cre']
      const allocatedIds = [
        'sb_up_eng',
        'sb_up_comp',
        'sb_up_kis',
        'sb_up_insha',
        'sb_up_mat',
        'sb_sci',
        'sb_up_cas',
        'sb_up_ss_cre',
      ];

      const marks = [
        // English (45/60 + 35/40 = 80/100 -> EE / 4)
        { exam_id: 'exam_up_opener_2026', subject_id: 'sb_up_eng', student_id: 'std_01', marks: 45, raw_score: 45, out_of: 60 },
        { exam_id: 'exam_up_opener_2026', subject_id: 'sb_up_comp', student_id: 'std_01', marks: 35, raw_score: 35, out_of: 40 },
        // Kiswahili (40/60 + 30/40 = 70/100 -> ME / 3)
        { exam_id: 'exam_up_opener_2026', subject_id: 'sb_up_kis', student_id: 'std_01', marks: 40, raw_score: 40, out_of: 60 },
        { exam_id: 'exam_up_opener_2026', subject_id: 'sb_up_insha', student_id: 'std_01', marks: 30, raw_score: 30, out_of: 40 },
        // Math (85/100 -> EE / 4)
        { exam_id: 'exam_up_opener_2026', subject_id: 'sb_up_mat', student_id: 'std_01', marks: 85, raw_score: 85, out_of: 100 },
        // Science (90/100 -> EE / 4)
        { exam_id: 'exam_up_opener_2026', subject_id: 'sb_sci', student_id: 'std_01', marks: 90, raw_score: 90, out_of: 100 },
        // Creative Arts and Sports (75/100 -> ME / 3)
        { exam_id: 'exam_up_opener_2026', subject_id: 'sb_up_cas', student_id: 'std_01', marks: 75, raw_score: 75, out_of: 100 },
        // Social Studies & CRE (65/100 -> ME / 3)
        { exam_id: 'exam_up_opener_2026', subject_id: 'sb_up_ss_cre', student_id: 'std_01', marks: 65, raw_score: 65, out_of: 100 },
      ];

      const singleAssessment = [mockUpperPrimaryAssessments[0]];

      const resultsMap = calculateLearnerTerminalResults({
        learnerId: 'std_01',
        subjectIds: allocatedIds,
        contributingAssessments: singleAssessment,
        marks,
        grades: initialGrades,
        educationLevel: 'Upper Primary',
        gradeName: 'Grade 6',
      });

      // Verify the 6 canonical learning areas
      const canonicalSubs = getUpperPrimaryCanonicalSubjects();
      expect(canonicalSubs.length).toBe(6);

      const engRes = resultsMap.get('sb_up_eng');
      expect(engRes?.isComplete).toBe(true);
      expect(engRes?.terminalPercentage).toBe(80);
      expect(engRes?.cbePerformanceLevel).toBe('EE');
      expect(engRes?.points).toBe(4);

      const kiswRes = resultsMap.get('sb_up_kis');
      expect(kiswRes?.isComplete).toBe(true);
      expect(kiswRes?.terminalPercentage).toBe(70);
      expect(kiswRes?.cbePerformanceLevel).toBe('ME');
      expect(kiswRes?.points).toBe(3);

      const mathRes = resultsMap.get('sb_up_mat');
      expect(mathRes?.isComplete).toBe(true);
      expect(mathRes?.terminalPercentage).toBe(85);
      expect(mathRes?.cbePerformanceLevel).toBe('EE');
      expect(mathRes?.points).toBe(4);

      const sciRes = resultsMap.get('sb_sci');
      expect(sciRes?.isComplete).toBe(true);
      expect(sciRes?.terminalPercentage).toBe(90);
      expect(sciRes?.cbePerformanceLevel).toBe('EE');
      expect(sciRes?.points).toBe(4);

      const casRes = resultsMap.get('sb_up_cas');
      expect(casRes?.isComplete).toBe(true);
      expect(casRes?.terminalPercentage).toBe(75);
      expect(casRes?.cbePerformanceLevel).toBe('ME');
      expect(casRes?.points).toBe(3);

      const ssCreRes = resultsMap.get('sb_up_ss_cre');
      expect(ssCreRes?.isComplete).toBe(true);
      expect(ssCreRes?.terminalPercentage).toBe(65);
      expect(ssCreRes?.cbePerformanceLevel).toBe('ME');
      expect(ssCreRes?.points).toBe(3);

      // Verify aliased lookup: looking up component subjects resolves to their parent consolidated result
      expect(resultsMap.get('sb_up_comp')).toBe(engRes);
      expect(resultsMap.get('sb_up_insha')).toBe(kiswRes);

      // Verify 6 learning areas sum: 80 + 70 + 85 + 90 + 75 + 65 = 465 / 600
      const totalMarks =
        (engRes?.terminalPercentage ?? 0) +
        (kiswRes?.terminalPercentage ?? 0) +
        (mathRes?.terminalPercentage ?? 0) +
        (sciRes?.terminalPercentage ?? 0) +
        (casRes?.terminalPercentage ?? 0) +
        (ssCreRes?.terminalPercentage ?? 0);

      expect(totalMarks).toBe(465);

      // Total CBE points: 4 + 3 + 4 + 4 + 3 + 3 = 21 / 24
      const totalPoints =
        (engRes?.points ?? 0) +
        (kiswRes?.points ?? 0) +
        (mathRes?.points ?? 0) +
        (sciRes?.points ?? 0) +
        (casRes?.points ?? 0) +
        (ssCreRes?.points ?? 0);

      expect(totalPoints).toBe(21);
    });

    it('preserves Junior School isolation and 8-point scale for Grade 7, 8, 9', () => {
      const jsAssessments: ContributingAssessmentRef[] = [
        {
          id: 'exam_js_cat',
          exam_name: 'Grade 9 Opener Assessment Term 3 2026',
          max_marks: 100,
          out_of: 100,
          status: 'Approved',
        },
      ];

      const jsMarks = [
        {
          exam_id: 'exam_js_cat',
          subject_id: 'sb_mat',
          student_id: 'std_js_01',
          marks: 85,
          raw_score: 85,
          out_of: 100,
        },
      ];

      const jsResult = calculateLearningAreaTerminalResult({
        subjectId: 'sb_mat',
        contributingAssessments: jsAssessments,
        marks: jsMarks,
        grades: initialGrades,
        educationLevel: 'Junior School',
        gradeName: 'Grade 9',
      });

      expect(jsResult.isComplete).toBe(true);
      expect(jsResult.terminalPercentage).toBe(85);
      // Junior School uses 8-point scale (85 -> EE2, 7 points)
      expect(jsResult.cbePerformanceLevel).toBe('EE2');
      expect(jsResult.points).toBe(7);
    });
  });
});
