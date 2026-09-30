import { describe, it, expect } from 'vitest';
import { initialSubjects } from '../data/seedData';
import {
  getApplicableSubjectsForGrade,
  Examination,
  Mark,
} from '../types';
import {
  getUpperPrimaryCompositeSubjectMarks,
} from '../utils/markUtils';

describe('Authoritative SS&CRE Runtime Resolution Test Suite (Tests 1-7)', () => {
  const upSubjects = getApplicableSubjectsForGrade('Grade 6', initialSubjects);

  // Test 1: Historical direct SS&CRE
  it('Test 1: Historical direct SS&CRE - preserves direct mark as authoritative when model is direct SS&CRE', () => {
    const historicalExam: Examination = {
      id: 'exam_hist_1',
      exam_name: 'Grade 6 Opener Assessment Term 3 2026',
      term: 'Term 3',
      year: 2026,
      academic_year_id: 'ay_2026',
      education_level: 'Upper Primary',
      status: 'Published',
      exam_type: 'Opener' as any,
      max_marks: 50,
      // Historical model: no ss_cre_structure
    };

    const directMark: Mark = {
      id: 'm_naomi_direct',
      student_id: 'std_naomi',
      subject_id: 'sb_up_ss_cre',
      exam_id: 'exam_hist_1',
      score: 48,
      raw_score: 48,
      out_of: 50,
      percentage: 96,
      special_status: 'Normal',
    };

    const result = getUpperPrimaryCompositeSubjectMarks([directMark], upSubjects, 'Upper Primary', historicalExam);
    const ssCreMark = result.processedMarks.find((m) => m.subject_id === 'sb_up_ss_cre');

    expect(ssCreMark).toBeDefined();
    expect(ssCreMark?.raw_score).toBe(48);
    expect(ssCreMark?.out_of).toBe(50);
    expect(ssCreMark?.percentage).toBe(96);
    expect(ssCreMark?.special_status).toBe('Normal');
  });

  // Test 2: Option B
  it('Test 2: Option B - SST + CRE component marks produce correct SS&CRE composite without requiring direct mark', () => {
    const optionBExam: Examination = {
      id: 'exam_opt_b',
      exam_name: 'Grade 6 Mid Term 2026',
      term: 'Term 2',
      year: 2026,
      academic_year_id: 'ay_2026',
      education_level: 'Upper Primary',
      status: 'Published',
      exam_type: 'Mid-Term' as any,
      max_marks: 100,
      ss_cre_structure: 'B', // 10 + 10 = 20
    };

    const componentMarks: Mark[] = [
      {
        id: 'm_sst',
        student_id: 'std_jane',
        subject_id: 'sb_sst',
        exam_id: 'exam_opt_b',
        score: 2,
        raw_score: 2,
        out_of: 10,
        percentage: 20,
      },
      {
        id: 'm_cre',
        student_id: 'std_jane',
        subject_id: 'sb_cre',
        exam_id: 'exam_opt_b',
        score: 7,
        raw_score: 7,
        out_of: 10,
        percentage: 70,
      },
    ];

    const result = getUpperPrimaryCompositeSubjectMarks(componentMarks, upSubjects, 'Upper Primary', optionBExam);
    const compositeMark = result.processedMarks.find((m) => m.subject_id === 'sb_up_ss_cre');

    expect(compositeMark).toBeDefined();
    expect(compositeMark?.raw_score).toBe(9); // 2 + 7 = 9
    expect(compositeMark?.out_of).toBe(20);   // Structure B: 10 + 10 = 20
    expect(compositeMark?.percentage).toBe(45); // (9/20) * 100 = 45%
    expect(compositeMark?.is_synthetic).toBe(true);
  });

  // Test 3: Mixed in-memory historical representation
  it('Test 3: Mixed in-memory historical representation - direct SS&CRE remains authoritative, Naomi 48/50 preserved, no conflict', () => {
    const historicalExam: Examination = {
      id: 'e33680c9-e071-493e-9a4a-a49bce6c1742',
      exam_name: 'Grade 6 Opener Assessment Term 3 2026',
      term: 'Term 3',
      year: 2026,
      academic_year_id: 'ay_2026',
      education_level: 'Upper Primary',
      status: 'Published',
      exam_type: 'Opener' as any,
      max_marks: 50,
      // No ss_cre_structure in database
    };

    const mixedMarks: Mark[] = [
      // Authoritative direct mark
      {
        id: 'm_naomi_direct',
        student_id: '2c5ceb79-a21a-4fcb-a04d-1db2d878addd',
        subject_id: 'sb_up_ss_cre',
        exam_id: 'e33680c9-e071-493e-9a4a-a49bce6c1742',
        score: 48,
        raw_score: 48,
        out_of: 50,
        percentage: 96,
        special_status: 'Normal',
      },
      // Stale / test artifact component marks present in memory
      {
        id: 'm_naomi_sst',
        student_id: '2c5ceb79-a21a-4fcb-a04d-1db2d878addd',
        subject_id: 'sb_sst',
        exam_id: 'e33680c9-e071-493e-9a4a-a49bce6c1742',
        score: 25,
        raw_score: 25,
        out_of: 30,
        percentage: 83.33,
      },
      {
        id: 'm_naomi_cre',
        student_id: '2c5ceb79-a21a-4fcb-a04d-1db2d878addd',
        subject_id: 'sb_cre',
        exam_id: 'e33680c9-e071-493e-9a4a-a49bce6c1742',
        score: 18,
        raw_score: 18,
        out_of: 20,
        percentage: 90,
      },
    ];

    const result = getUpperPrimaryCompositeSubjectMarks(mixedMarks, upSubjects, 'Upper Primary', historicalExam);
    const ssCreMark = result.processedMarks.find((m) => m.subject_id === 'sb_up_ss_cre');

    // Direct mark 48/50 must be preserved as authoritative
    expect(ssCreMark).toBeDefined();
    expect(ssCreMark?.raw_score).toBe(48);
    expect(ssCreMark?.out_of).toBe(50);
    expect(ssCreMark?.percentage).toBe(96);
  });

  // Test 4: Mixed in-memory Option B representation
  it('Test 4: Mixed in-memory Option B representation - SST + CRE component marks remain authoritative, no conflict', () => {
    const optionBExam: Examination = {
      id: 'exam_opt_a',
      exam_name: 'Grade 5 End Term 2026',
      term: 'Term 1',
      year: 2026,
      academic_year_id: 'ay_2026',
      education_level: 'Upper Primary',
      status: 'Published',
      exam_type: 'End-Term' as any,
      max_marks: 100,
      ss_cre_structure: 'A', // 30 + 20 = 50
    };

    const mixedMarks: Mark[] = [
      // Direct mark in memory (e.g. from cached expansion)
      {
        id: 'm_direct_stale',
        student_id: 'std_kevin',
        subject_id: 'sb_up_ss_cre',
        exam_id: 'exam_opt_a',
        score: 75,
        raw_score: 75,
        out_of: 100,
        percentage: 75,
      },
      // Authoritative components
      {
        id: 'm_sst',
        student_id: 'std_kevin',
        subject_id: 'sb_sst',
        exam_id: 'exam_opt_a',
        score: 25,
        raw_score: 25,
        out_of: 30,
        percentage: 83.33,
      },
      {
        id: 'm_cre',
        student_id: 'std_kevin',
        subject_id: 'sb_cre',
        exam_id: 'exam_opt_a',
        score: 18,
        raw_score: 18,
        out_of: 20,
        percentage: 90,
      },
    ];

    const result = getUpperPrimaryCompositeSubjectMarks(mixedMarks, upSubjects, 'Upper Primary', optionBExam);
    const ssCreMark = result.processedMarks.find((m) => m.subject_id === 'sb_up_ss_cre');

    // Dynamic composite 25 + 18 = 43 out of 50 = 86%
    expect(ssCreMark).toBeDefined();
    expect(ssCreMark?.raw_score).toBe(43);
    expect(ssCreMark?.out_of).toBe(50);
    expect(ssCreMark?.percentage).toBe(86);
  });

  // Test 5: Missing component
  it('Test 5: Missing component - does not manufacture composite when required SST/CRE data is genuinely incomplete', () => {
    const optionBExam: Examination = {
      id: 'exam_opt_b',
      exam_name: 'Grade 4 Mid Term 2026',
      term: 'Term 1',
      year: 2026,
      academic_year_id: 'ay_2026',
      education_level: 'Upper Primary',
      status: 'Published',
      exam_type: 'Mid-Term' as any,
      max_marks: 100,
      ss_cre_structure: 'A',
    };

    // Only SST mark exists, CRE mark has NOT been entered at all
    const incompleteMarks: Mark[] = [
      {
        id: 'm_sst_only',
        student_id: 'std_incomplete',
        subject_id: 'sb_sst',
        exam_id: 'exam_opt_b',
        score: 25,
        raw_score: 25,
        out_of: 30,
        percentage: 83.33,
      },
    ];

    const result = getUpperPrimaryCompositeSubjectMarks(incompleteMarks, upSubjects, 'Upper Primary', optionBExam);
    const ssCreMark = result.processedMarks.find((m) => m.subject_id === 'sb_up_ss_cre');

    // Incomplete component data must not manufacture a valid composite
    expect(ssCreMark).toBeUndefined();
  });

  // Test 6: Special statuses
  describe('Test 6: Special statuses validation across all combinations', () => {
    const examA: Examination = {
      id: 'exam_spec',
      exam_name: 'Special Status Exam',
      term: 'Term 1',
      year: 2026,
      academic_year_id: 'ay_2026',
      education_level: 'Upper Primary',
      status: 'Published',
      exam_type: 'Regular' as any,
      max_marks: 100,
      ss_cre_structure: 'A', // 30 + 20 = 50
    };

    it('Normal + Normal: calculates composite score', () => {
      const marks: Mark[] = [
        { id: '1', student_id: 's1', subject_id: 'sb_sst', exam_id: 'exam_spec', score: 24, raw_score: 24, out_of: 30, percentage: 80 },
        { id: '2', student_id: 's1', subject_id: 'sb_cre', exam_id: 'exam_spec', score: 16, raw_score: 16, out_of: 20, percentage: 80 },
      ];
      const res = getUpperPrimaryCompositeSubjectMarks(marks, upSubjects, 'Upper Primary', examA);
      const m = res.processedMarks.find((x) => x.subject_id === 'sb_up_ss_cre');
      expect(m?.raw_score).toBe(40);
      expect(m?.special_status).toBeUndefined();
    });

    it('Normal + X: partial attendance -> raw score out of total max, status not X', () => {
      const marks: Mark[] = [
        { id: '1', student_id: 's2', subject_id: 'sb_sst', exam_id: 'exam_spec', score: 21, raw_score: 21, out_of: 30, percentage: 70 },
        { id: '2', student_id: 's2', subject_id: 'sb_cre', exam_id: 'exam_spec', score: 0, raw_score: 0, out_of: 20, percentage: 0, special_status: 'X' },
      ];
      const res = getUpperPrimaryCompositeSubjectMarks(marks, upSubjects, 'Upper Primary', examA);
      const m = res.processedMarks.find((x) => x.subject_id === 'sb_up_ss_cre');
      expect(m?.raw_score).toBe(21);
      expect(m?.out_of).toBe(50);
      expect(m?.percentage).toBe(42);
      expect(m?.special_status).toBeUndefined();
    });

    it('X + Normal: partial attendance -> raw score out of total max, status not X', () => {
      const marks: Mark[] = [
        { id: '1', student_id: 's3', subject_id: 'sb_sst', exam_id: 'exam_spec', score: 0, raw_score: 0, out_of: 30, percentage: 0, special_status: 'X' },
        { id: '2', student_id: 's3', subject_id: 'sb_cre', exam_id: 'exam_spec', score: 15, raw_score: 15, out_of: 20, percentage: 75 },
      ];
      const res = getUpperPrimaryCompositeSubjectMarks(marks, upSubjects, 'Upper Primary', examA);
      const m = res.processedMarks.find((x) => x.subject_id === 'sb_up_ss_cre');
      expect(m?.raw_score).toBe(15);
      expect(m?.out_of).toBe(50);
      expect(m?.percentage).toBe(30);
      expect(m?.special_status).toBeUndefined();
    });

    it('X + X: both absent -> composite special_status is X', () => {
      const marks: Mark[] = [
        { id: '1', student_id: 's4', subject_id: 'sb_sst', exam_id: 'exam_spec', score: 0, raw_score: 0, out_of: 30, percentage: 0, special_status: 'X' },
        { id: '2', student_id: 's4', subject_id: 'sb_cre', exam_id: 'exam_spec', score: 0, raw_score: 0, out_of: 20, percentage: 0, special_status: 'X' },
      ];
      const res = getUpperPrimaryCompositeSubjectMarks(marks, upSubjects, 'Upper Primary', examA);
      const m = res.processedMarks.find((x) => x.subject_id === 'sb_up_ss_cre');
      expect(m?.special_status).toBe('X');
    });

    it('Y + any: irregularity in SST -> composite special_status is Y', () => {
      const marks: Mark[] = [
        { id: '1', student_id: 's5', subject_id: 'sb_sst', exam_id: 'exam_spec', score: 0, raw_score: 0, out_of: 30, percentage: 0, special_status: 'Y', irregularity_reason: 'Cheating' },
        { id: '2', student_id: 's5', subject_id: 'sb_cre', exam_id: 'exam_spec', score: 18, raw_score: 18, out_of: 20, percentage: 90 },
      ];
      const res = getUpperPrimaryCompositeSubjectMarks(marks, upSubjects, 'Upper Primary', examA);
      const m = res.processedMarks.find((x) => x.subject_id === 'sb_up_ss_cre');
      expect(m?.special_status).toBe('Y');
    });

    it('any + Y: irregularity in CRE -> composite special_status is Y', () => {
      const marks: Mark[] = [
        { id: '1', student_id: 's6', subject_id: 'sb_sst', exam_id: 'exam_spec', score: 25, raw_score: 25, out_of: 30, percentage: 83.33 },
        { id: '2', student_id: 's6', subject_id: 'sb_cre', exam_id: 'exam_spec', score: 0, raw_score: 0, out_of: 20, percentage: 0, special_status: 'Y' },
      ];
      const res = getUpperPrimaryCompositeSubjectMarks(marks, upSubjects, 'Upper Primary', examA);
      const m = res.processedMarks.find((x) => x.subject_id === 'sb_up_ss_cre');
      expect(m?.special_status).toBe('Y');
    });

    it('Direct X: historical direct mark absent -> preserved as X', () => {
      const histExam: Examination = {
        id: 'exam_hist_x',
        exam_name: 'Historical Exam X',
        term: 'Term 1',
        year: 2025,
        academic_year_id: 'ay_2025',
        education_level: 'Upper Primary',
        status: 'Approved',
        exam_type: 'Regular' as any,
        max_marks: 50,
      };
      const mark: Mark = {
        id: '1',
        student_id: 's7',
        subject_id: 'sb_up_ss_cre',
        exam_id: 'exam_hist_x',
        score: 0,
        raw_score: 0,
        out_of: 50,
        percentage: 0,
        special_status: 'X',
      };
      const res = getUpperPrimaryCompositeSubjectMarks([mark], upSubjects, 'Upper Primary', histExam);
      const m = res.processedMarks.find((x) => x.subject_id === 'sb_up_ss_cre');
      expect(m?.special_status).toBe('X');
    });

    it('Direct Y: historical direct mark irregularity -> preserved as Y', () => {
      const histExam: Examination = {
        id: 'exam_hist_y',
        exam_name: 'Historical Exam Y',
        term: 'Term 1',
        year: 2025,
        academic_year_id: 'ay_2025',
        education_level: 'Upper Primary',
        status: 'Approved',
        exam_type: 'Regular' as any,
        max_marks: 50,
      };
      const mark: Mark = {
        id: '1',
        student_id: 's8',
        subject_id: 'sb_up_ss_cre',
        exam_id: 'exam_hist_y',
        score: 0,
        raw_score: 0,
        out_of: 50,
        percentage: 0,
        special_status: 'Y',
      };
      const res = getUpperPrimaryCompositeSubjectMarks([mark], upSubjects, 'Upper Primary', histExam);
      const m = res.processedMarks.find((x) => x.subject_id === 'sb_up_ss_cre');
      expect(m?.special_status).toBe('Y');
    });
  });

  // Test 7: Cross-assessment isolation
  it('Test 7: Cross-assessment isolation - historical and Option B exams evaluated in the same session do not cross-contaminate', () => {
    const historicalExam: Examination = {
      id: 'exam_iso_hist',
      exam_name: 'Historical Exam 2025',
      term: 'Term 3',
      year: 2025,
      academic_year_id: 'ay_2025',
      education_level: 'Upper Primary',
      status: 'Approved',
      exam_type: 'Regular' as any,
      max_marks: 50,
      // No ss_cre_structure
    };

    const optionBExam: Examination = {
      id: 'exam_iso_opt_b',
      exam_name: 'Option B Exam 2026',
      term: 'Term 1',
      year: 2026,
      academic_year_id: 'ay_2026',
      education_level: 'Upper Primary',
      status: 'Published',
      exam_type: 'Regular' as any,
      max_marks: 100,
      ss_cre_structure: 'B', // 10 + 10 = 20
    };

    const histMarks: Mark[] = [
      {
        id: 'm_h1',
        student_id: 'std_iso',
        subject_id: 'sb_up_ss_cre',
        exam_id: 'exam_iso_hist',
        score: 42,
        raw_score: 42,
        out_of: 50,
        percentage: 84,
      },
    ];

    const optBMarks: Mark[] = [
      {
        id: 'm_b1',
        student_id: 'std_iso',
        subject_id: 'sb_sst',
        exam_id: 'exam_iso_opt_b',
        score: 8,
        raw_score: 8,
        out_of: 10,
        percentage: 80,
      },
      {
        id: 'm_b2',
        student_id: 'std_iso',
        subject_id: 'sb_cre',
        exam_id: 'exam_iso_opt_b',
        score: 9,
        raw_score: 9,
        out_of: 10,
        percentage: 90,
      },
    ];

    const histResult = getUpperPrimaryCompositeSubjectMarks(histMarks, upSubjects, 'Upper Primary', historicalExam);
    const optBResult = getUpperPrimaryCompositeSubjectMarks(optBMarks, upSubjects, 'Upper Primary', optionBExam);

    const histSSCRE = histResult.processedMarks.find((m) => m.subject_id === 'sb_up_ss_cre');
    const optBSSCRE = optBResult.processedMarks.find((m) => m.subject_id === 'sb_up_ss_cre');

    // Historical resolution preserved 42/50
    expect(histSSCRE?.raw_score).toBe(42);
    expect(histSSCRE?.out_of).toBe(50);
    expect(histSSCRE?.percentage).toBe(84);

    // Option B resolution calculated 17/20 (85%)
    expect(optBSSCRE?.raw_score).toBe(17);
    expect(optBSSCRE?.out_of).toBe(20);
    expect(optBSSCRE?.percentage).toBe(85);
  });
});
