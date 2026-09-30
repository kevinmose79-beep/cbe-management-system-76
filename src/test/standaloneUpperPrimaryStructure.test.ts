import './setupLocalStorage';
import { describe, it, expect } from 'vitest';
import { Examination, Student, ClassStream, Subject, Mark, Grade } from '../types';
import {
  evaluateMark,
  isUpperPrimaryCompOrInsha,
  isUpperPrimaryLanguage,
  getUpperPrimaryCompositeSubjectMarks,
  resolveLearnerReportSubjectsAndMarks,
} from '../utils/markUtils';
import { calculateExamResults } from '../services/analysisEngine';
import { resolveUpperPrimaryReportStructure } from '../utils/upperPrimaryReportUtils';
import { getApplicableSubjectsForGrade } from '../types';

describe('Phase 3: Standalone Upper Primary Assessment Implementation', () => {
  const grades: Grade[] = [
    { id: 'g1', grade_code: 'EE', grade: 'EE', performance_level: 'EE', points: 4, minimum_score: 76, maximum_score: 100, minimum_marks: 76, maximum_marks: 100, remarks: 'Exceeding Expectations', descriptor: 'Exceeding Expectations' },
    { id: 'g2', grade_code: 'ME', grade: 'ME', performance_level: 'ME', points: 3, minimum_score: 51, maximum_score: 75, minimum_marks: 51, maximum_marks: 75, remarks: 'Meeting Expectations', descriptor: 'Meeting Expectations' },
    { id: 'g3', grade_code: 'AE', grade: 'AE', performance_level: 'AE', points: 2, minimum_score: 26, maximum_score: 50, minimum_marks: 26, maximum_marks: 50, remarks: 'Approaching Expectations', descriptor: 'Approaching Expectations' },
    { id: 'g4', grade_code: 'BE', grade: 'BE', performance_level: 'BE', points: 1, minimum_score: 0, maximum_score: 25, minimum_marks: 0, maximum_marks: 25, remarks: 'Below Expectations', descriptor: 'Below Expectations' },
  ];

  const subjects: Subject[] = [
    { id: 'sb_up_eng', subject_code: 'ENG', subject_name: 'English', education_level: 'Grade 4–9', category: 'Core', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9'] },
    { id: 'sb_up_comp', subject_code: 'COMP', subject_name: 'English Composition', education_level: 'Upper Primary', category: 'Core', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'] },
    { id: 'sb_up_kis', subject_code: 'KIS', subject_name: 'Kiswahili', education_level: 'Grade 4–9', category: 'Core', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9'] },
    { id: 'sb_up_insha', subject_code: 'INSHA', subject_name: 'Kiswahili Insha', education_level: 'Upper Primary', category: 'Core', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'] },
    { id: 'sb_up_mat', subject_code: 'MATH', subject_name: 'Mathematics', education_level: 'Grade 4–9', category: 'Core', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9'] },
    { id: 'sb_up_sci', subject_code: 'INT-SCI', subject_name: 'Integrated Science', education_level: 'Upper Primary', category: 'Core', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'] },
    { id: 'sb_up_sst', subject_code: 'SST', subject_name: 'Social Studies', education_level: 'Upper Primary', category: 'Core', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'] },
    { id: 'sb_up_cre', subject_code: 'CRE', subject_name: 'Christian Religious Education', education_level: 'Grade 4–9', category: 'Core', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9'] },
    { id: 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f', subject_code: 'AGN', subject_name: 'Agriculture', education_level: 'Grade 4–9', category: 'Core', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9'] },
    { id: 'sb_up_cas', subject_code: 'CAS', subject_name: 'Creative Arts and Sports', education_level: 'Upper Primary', category: 'Core', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'] },
    { id: 'sb_up_ss_cre', subject_code: 'SS&CRE', subject_name: 'Social Studies & CRE', education_level: 'Upper Primary', category: 'Core', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'] },
  ];

  const student: Student = {
    id: 'std_up_001',
    admission_number: 'ADM-501',
    first_name: 'David',
    last_name: 'Ochieng',
    full_name: 'David Ochieng',
    grade: 'Grade 5',
    education_level: 'Upper Primary',
    class_id: 'cls_grade_5',
    stream_id: 'str_5a',
    gender: 'M',
    active: true,
  };

  const classObj: ClassStream = {
    id: 'cls_grade_5',
    class_name: 'Grade 5',
    stream: 'East',
    stream_id: 'str_5a',
    education_level: 'Upper Primary',
  };

  const standaloneExam: Examination = {
    id: 'exam_standalone_001',
    exam_name: 'Grade 5 SBA KNEC Assessment 2026',
    term: 'Term 3',
    year: 2026,
    education_level: 'Upper Primary',
    status: 'Published',
    exam_type: 'Custom',
    max_marks: 100,
    assessment_structure: 'Standalone',
  };

  const compositeExam: Examination = {
    id: 'exam_composite_001',
    exam_name: 'Grade 5 Mid-Term Composite 2026',
    term: 'Term 3',
    year: 2026,
    education_level: 'Upper Primary',
    status: 'Published',
    exam_type: 'Mid-Term',
    max_marks: 100,
    assessment_structure: 'Composite',
  };

  it('1. Standalone Mark Evaluator: English and Kiswahili are assessed out of 100, not 60', () => {
    const engSub = subjects.find(s => s.subject_code === 'ENG')!;
    const compSub = subjects.find(s => s.subject_code === 'COMP')!;

    // For Standalone: isUpperPrimaryLanguage is FALSE (out of 100)
    expect(isUpperPrimaryLanguage(engSub, classObj, 'Upper Primary', standaloneExam)).toBe(false);
    expect(isUpperPrimaryCompOrInsha(compSub, classObj, 'Upper Primary', standaloneExam)).toBe(false);

    // For Composite: isUpperPrimaryLanguage is TRUE (out of 60)
    expect(isUpperPrimaryLanguage(engSub, classObj, 'Upper Primary', compositeExam)).toBe(true);
    expect(isUpperPrimaryCompOrInsha(compSub, classObj, 'Upper Primary', compositeExam)).toBe(true);
  });

  it('2. Standalone Composite Processor: Returns raw marks without synthesis', () => {
    const rawMarks: Mark[] = [
      { id: 'm1', exam_id: standaloneExam.id, student_id: student.id, subject_id: 'sb_up_eng', marks: 80, raw_score: 80, out_of: 100, special_status: 'Normal' },
      { id: 'm2', exam_id: standaloneExam.id, student_id: student.id, subject_id: 'sb_up_kis', marks: 70, raw_score: 70, out_of: 100, special_status: 'Normal' },
      { id: 'm3', exam_id: standaloneExam.id, student_id: student.id, subject_id: 'sb_up_sst', marks: 65, raw_score: 65, out_of: 100, special_status: 'Normal' },
      { id: 'm4', exam_id: standaloneExam.id, student_id: student.id, subject_id: 'sb_up_cre', marks: 85, raw_score: 85, out_of: 100, special_status: 'Normal' },
    ];

    const result = getUpperPrimaryCompositeSubjectMarks(rawMarks, subjects, 'Upper Primary', standaloneExam);
    expect(result.syntheticSubjects).toHaveLength(0);
    expect(result.processedMarks).toHaveLength(4);
    expect(result.processedMarks.find(m => m.subject_id === 'sb_up_eng')?.marks).toBe(80);
  });

  it('3. Standalone Report Structure: Uses 8 learning areas, 800 max marks, and 32 max CBE points', () => {
    // 8 learner marks as in the user brief:
    // ENG: 80, KIS: 70, MATH: 90, INT-SCI: 75, SST: 65, CRE: 85, AGN: 72, CAS: 88
    const marks: Mark[] = [
      { id: 'm1', exam_id: standaloneExam.id, student_id: student.id, subject_id: 'sb_up_eng', marks: 80, raw_score: 80, out_of: 100, special_status: 'Normal' },
      { id: 'm2', exam_id: standaloneExam.id, student_id: student.id, subject_id: 'sb_up_kis', marks: 70, raw_score: 70, out_of: 100, special_status: 'Normal' },
      { id: 'm3', exam_id: standaloneExam.id, student_id: student.id, subject_id: 'sb_up_mat', marks: 90, raw_score: 90, out_of: 100, special_status: 'Normal' },
      { id: 'm4', exam_id: standaloneExam.id, student_id: student.id, subject_id: 'sb_up_sci', marks: 75, raw_score: 75, out_of: 100, special_status: 'Normal' },
      { id: 'm5', exam_id: standaloneExam.id, student_id: student.id, subject_id: 'sb_up_sst', marks: 65, raw_score: 65, out_of: 100, special_status: 'Normal' },
      { id: 'm6', exam_id: standaloneExam.id, student_id: student.id, subject_id: 'sb_up_cre', marks: 85, raw_score: 85, out_of: 100, special_status: 'Normal' },
      { id: 'm7', exam_id: standaloneExam.id, student_id: student.id, subject_id: 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f', marks: 72, raw_score: 72, out_of: 100, special_status: 'Normal' },
      { id: 'm8', exam_id: standaloneExam.id, student_id: student.id, subject_id: 'sb_up_cas', marks: 88, raw_score: 88, out_of: 100, special_status: 'Normal' },
    ];

    const report = resolveUpperPrimaryReportStructure({
      student,
      exam: standaloneExam,
      targetClass: classObj,
      subjects,
      marks,
      grades,
      teachers: [],
      allStudents: [student],
      classes: [classObj],
    });

    expect(report.isUpperPrimary).toBe(true);
    expect(report.isStandalone).toBe(true);
    expect(report.allReportAreas).toHaveLength(8);

    // Subject codes in order
    const codes = report.allReportAreas.map(a => a.code);
    expect(codes).toEqual(['ENG', 'KIS', 'MATH', 'INT-SCI', 'SST', 'CRE', 'AGN', 'CAS']);

    // Total Marks = 80 + 70 + 90 + 75 + 65 + 85 + 72 + 88 = 625
    expect(report.totalMarks).toBe(625);
    expect(report.maxPossibleMarks).toBe(800);

    // Total Points = 4 (80 EE) + 3 (70 ME) + 4 (90 EE) + 3 (75 ME) + 3 (65 ME) + 4 (85 EE) + 3 (72 ME) + 4 (88 EE) = 28
    expect(report.totalPoints).toBe(28);
    expect(report.maxPossiblePoints).toBe(32);

    // Average score = 625 / 8 = 78.125
    expect(report.averageScore).toBeCloseTo(78.125);
    expect(report.isComplete).toBe(true);
    expect(report.overallLevel).toBe('EE');
  });

  it('4. Analysis Engine: Calculates 8-subject results and 32-point maximum for Standalone exam', () => {
    const marks: Mark[] = [
      { id: 'm1', exam_id: standaloneExam.id, student_id: student.id, subject_id: 'sb_up_eng', marks: 80, raw_score: 80, out_of: 100, special_status: 'Normal' },
      { id: 'm2', exam_id: standaloneExam.id, student_id: student.id, subject_id: 'sb_up_kis', marks: 70, raw_score: 70, out_of: 100, special_status: 'Normal' },
      { id: 'm3', exam_id: standaloneExam.id, student_id: student.id, subject_id: 'sb_up_mat', marks: 90, raw_score: 90, out_of: 100, special_status: 'Normal' },
      { id: 'm4', exam_id: standaloneExam.id, student_id: student.id, subject_id: 'sb_up_sci', marks: 75, raw_score: 75, out_of: 100, special_status: 'Normal' },
      { id: 'm5', exam_id: standaloneExam.id, student_id: student.id, subject_id: 'sb_up_sst', marks: 65, raw_score: 65, out_of: 100, special_status: 'Normal' },
      { id: 'm6', exam_id: standaloneExam.id, student_id: student.id, subject_id: 'sb_up_cre', marks: 85, raw_score: 85, out_of: 100, special_status: 'Normal' },
      { id: 'm7', exam_id: standaloneExam.id, student_id: student.id, subject_id: 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f', marks: 72, raw_score: 72, out_of: 100, special_status: 'Normal' },
      { id: 'm8', exam_id: standaloneExam.id, student_id: student.id, subject_id: 'sb_up_cas', marks: 88, raw_score: 88, out_of: 100, special_status: 'Normal' },
    ];

    const results = calculateExamResults(
      standaloneExam.id,
      [student],
      marks,
      grades,
      [classObj],
      subjects,
      standaloneExam
    );

    expect(results).toHaveLength(1);
    const r = results[0];
    expect(r.total_marks).toBe(625);
    expect(r.total_points).toBe(28);
    expect(r.subject_count).toBe(8);
    expect(r.is_complete).toBe(true);
    expect(r.performance_level).toBe('EE');
  });

  it('5. Agriculture Resolution: Existing Agriculture ID a9bf02ee-5e4e-46fa-b7d5-39f77657821f resolves for Grades 4-9', () => {
    const agriSub = subjects.find(s => s.id === 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f')!;
    expect(agriSub).toBeDefined();
    expect(agriSub.subject_code).toBe('AGN');

    const g4Subjects = getApplicableSubjectsForGrade('Grade 4', subjects);
    const g5Subjects = getApplicableSubjectsForGrade('Grade 5', subjects);
    const g6Subjects = getApplicableSubjectsForGrade('Grade 6', subjects);
    const g7Subjects = getApplicableSubjectsForGrade('Grade 7', subjects);
    const g8Subjects = getApplicableSubjectsForGrade('Grade 8', subjects);
    const g9Subjects = getApplicableSubjectsForGrade('Grade 9', subjects);

    expect(g4Subjects.some(s => s.id === agriSub.id)).toBe(true);
    expect(g5Subjects.some(s => s.id === agriSub.id)).toBe(true);
    expect(g6Subjects.some(s => s.id === agriSub.id)).toBe(true);
    expect(g7Subjects.some(s => s.id === agriSub.id)).toBe(true);
    expect(g8Subjects.some(s => s.id === agriSub.id)).toBe(true);
    expect(g9Subjects.some(s => s.id === agriSub.id)).toBe(true);
  });

  it('6. Composite Preservation: Historical Composite examinations continue using 6-area 600-mark 24-point model', () => {
    const compositeMarks: Mark[] = [
      { id: 'cm1', exam_id: compositeExam.id, student_id: student.id, subject_id: 'sb_up_eng', marks: 45, raw_score: 45, out_of: 60, special_status: 'Normal' },
      { id: 'cm2', exam_id: compositeExam.id, student_id: student.id, subject_id: 'sb_up_comp', marks: 30, raw_score: 30, out_of: 40, special_status: 'Normal' },
      { id: 'cm3', exam_id: compositeExam.id, student_id: student.id, subject_id: 'sb_up_kis', marks: 40, raw_score: 40, out_of: 60, special_status: 'Normal' },
      { id: 'cm4', exam_id: compositeExam.id, student_id: student.id, subject_id: 'sb_up_insha', marks: 25, raw_score: 25, out_of: 40, special_status: 'Normal' },
      { id: 'cm5', exam_id: compositeExam.id, student_id: student.id, subject_id: 'sb_up_mat', marks: 80, raw_score: 80, out_of: 100, special_status: 'Normal' },
      { id: 'cm6', exam_id: compositeExam.id, student_id: student.id, subject_id: 'sb_up_sci', marks: 70, raw_score: 70, out_of: 100, special_status: 'Normal' },
      { id: 'cm7', exam_id: compositeExam.id, student_id: student.id, subject_id: 'sb_up_cas', marks: 75, raw_score: 75, out_of: 100, special_status: 'Normal' },
      { id: 'cm8', exam_id: compositeExam.id, student_id: student.id, subject_id: 'sb_up_ss_cre', marks: 40, raw_score: 40, out_of: 50, special_status: 'Normal' },
    ];

    const report = resolveUpperPrimaryReportStructure({
      student,
      exam: compositeExam,
      targetClass: classObj,
      subjects,
      marks: compositeMarks,
      grades,
      teachers: [],
      allStudents: [student],
      classes: [classObj],
    });

    expect(report.isUpperPrimary).toBe(true);
    expect(report.isStandalone).toBeUndefined();
    // 6 core composite areas: ENG (45+30=75), KIS (40+25=65), MATH (80), INT-SCI (70), CAS (75), SS&CRE (80%)
    expect(report.allReportAreas).toHaveLength(6);
    expect(report.maxPossibleMarks).toBe(600);
    expect(report.maxPossiblePoints).toBe(24);
  });
});
