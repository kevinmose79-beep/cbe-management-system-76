import { describe, it, expect } from 'vitest';
import {
  hasSeparateSstAndCreMarks,
  isDirectSSCRE,
  isSocialStudies,
  isChristianReligiousEducation,
} from '../utils/markUtils';
import {
  getLearnerReportSubjectsForExam,
  generateUpperPrimaryReportPDF,
  PDFReportData,
} from '../services/pdfReportGenerator';
import { Student, Examination, Mark, Subject, Grade, School, ClassStream, Teacher } from '../types';

describe('Grade 6 Opener Assessment Term 3 2026 — Merged Marks Detection & Display', () => {
  const mockSchool: School = {
    id: 'school-1',
    school_name: 'St. Jude Primary School',
    principal_name: 'Headteacher',
    county: 'Nairobi',
    email: 'info@stjude.ke',
  };

  const mockGrades: Grade[] = [
    { id: 'g1', grade_code: 'EE1', minimum_score: 90, maximum_score: 100, points: 4, remarks: 'Exceeding Expectations', performance_level: 'EE', descriptor: 'Exceeding Expectations' },
    { id: 'g2', grade_code: 'EE2', minimum_score: 75, maximum_score: 89, points: 4, remarks: 'Exceeding Expectations', performance_level: 'EE', descriptor: 'Exceeding Expectations' },
    { id: 'g3', grade_code: 'ME1', minimum_score: 58, maximum_score: 74, points: 3, remarks: 'Meeting Expectations', performance_level: 'ME', descriptor: 'Meeting Expectations' },
    { id: 'g4', grade_code: 'ME2', minimum_score: 41, maximum_score: 57, points: 3, remarks: 'Meeting Expectations', performance_level: 'ME', descriptor: 'Meeting Expectations' },
    { id: 'g5', grade_code: 'AE1', minimum_score: 31, maximum_score: 40, points: 2, remarks: 'Approaching Expectations', performance_level: 'AE', descriptor: 'Approaching Expectations' },
    { id: 'g6', grade_code: 'BE1', minimum_score: 0, maximum_score: 30, points: 1, remarks: 'Below Expectations', performance_level: 'BE', descriptor: 'Below Expectations' },
  ];

  const mockSubjects: Subject[] = [
    { id: 'sb_mat', subject_name: 'Mathematics', subject_code: 'MATH', category: 'Core', education_level: 'Upper Primary' },
    { id: 'sb_eng', subject_name: 'English Language', subject_code: 'ENG', category: 'Core', education_level: 'Upper Primary' },
    { id: 'sb_kis', subject_name: 'Kiswahili', subject_code: 'KISW', category: 'Core', education_level: 'Upper Primary' },
    { id: 'sb_sci', subject_name: 'Science and Technology', subject_code: 'SCI', category: 'Core', education_level: 'Upper Primary' },
    { id: 'sb_agr', subject_name: 'Agriculture and Nutrition', subject_code: 'AGR', category: 'Core', education_level: 'Upper Primary' },
    { id: 'sb_ca', subject_name: 'Creative Arts', subject_code: 'CA', category: 'Core', education_level: 'Upper Primary' },
    { id: 'sb_sst', subject_name: 'Social Studies', subject_code: 'SST', category: 'Core', education_level: 'Upper Primary' },
    { id: 'sb_cre', subject_name: 'Christian Religious Education', subject_code: 'CRE', category: 'Core', education_level: 'Upper Primary' },
    { id: 'sb_up_ss_cre', subject_name: 'Social Studies&CRE', subject_code: 'SS&CRE', category: 'Core', education_level: 'Upper Primary' },
  ];

  const mockClass: ClassStream = {
    id: 'cls_g6',
    class_name: 'Grade 6',
    stream: 'Green',
    education_level: 'Upper Primary',
  };

  const mockStudent: Student = {
    id: 'std_kuria',
    admission_number: 'ADM-001',
    full_name: 'Samuel Kuria',
    first_name: 'Samuel',
    last_name: 'Kuria',
    grade: 'Grade 6',
    class_id: 'cls_g6',
    stream_id: 'cls_g6',
    gender: 'M',
    active: true,
  };

  const g6OpenerExam: Examination = {
    id: 'exam_g6_opn_t3_2026',
    exam_name: 'Grade 6 Opener Assessment Term 3 2026',
    term: 'Term 3',
    year: 2026,
    exam_type: 'Opener',
    status: 'Published',
    max_marks: 100,
    education_level: 'Upper Primary',
  };

  const otherExam: Examination = {
    id: 'exam_g5_mid_t2_2026',
    exam_name: 'Grade 5 Mid-Term Assessment Term 2 2026',
    term: 'Term 2',
    year: 2026,
    exam_type: 'Mid-Term',
    status: 'Published',
    max_marks: 100,
    education_level: 'Upper Primary',
  };

  it('detects when there are no marks for separate SST and CRE (merged mark only)', () => {
    const marksMergedOnly: Mark[] = [
      { id: 'm1', student_id: 'std_kuria', exam_id: 'exam_g6_opn_t3_2026', subject_id: 'sb_mat', score: 80, raw_score: 80, out_of: 100 },
      { id: 'm2', student_id: 'std_kuria', exam_id: 'exam_g6_opn_t3_2026', subject_id: 'sb_up_ss_cre', score: 76, raw_score: 76, out_of: 100 },
    ];

    const hasSeparate = hasSeparateSstAndCreMarks(mockStudent, g6OpenerExam, marksMergedOnly, mockSubjects);
    expect(hasSeparate).toBe(false);
  });

  it('detects when there ARE separate marks for SST and CRE', () => {
    const marksSeparate: Mark[] = [
      { id: 'm1', student_id: 'std_kuria', exam_id: 'exam_g6_opn_t3_2026', subject_id: 'sb_sst', score: 24, raw_score: 24, out_of: 30 },
      { id: 'm2', student_id: 'std_kuria', exam_id: 'exam_g6_opn_t3_2026', subject_id: 'sb_cre', score: 18, raw_score: 18, out_of: 20 },
    ];

    const hasSeparate = hasSeparateSstAndCreMarks(mockStudent, g6OpenerExam, marksSeparate, mockSubjects);
    expect(hasSeparate).toBe(true);
  });

  it('displays merged SS&CRE subject when no separate marks exist for Grade 6 Opener Term 3 2026', () => {
    const marksMergedOnly: Mark[] = [
      { id: 'm1', student_id: 'std_kuria', exam_id: 'exam_g6_opn_t3_2026', subject_id: 'sb_up_ss_cre', score: 76, raw_score: 76, out_of: 100 },
    ];

    const reportSubjects = getLearnerReportSubjectsForExam(
      mockStudent,
      mockClass,
      mockSubjects,
      [],
      g6OpenerExam,
      marksMergedOnly
    );

    const hasDirect = reportSubjects.some(isDirectSSCRE);
    const hasSst = reportSubjects.some(isSocialStudies);
    const hasCre = reportSubjects.some(isChristianReligiousEducation);

    expect(hasDirect).toBe(true);
    expect(hasSst).toBe(false);
    expect(hasCre).toBe(false);
  });

  it('displays calculated composite SS&CRE and hides SST and CRE when separate marks exist for Grade 6 Opener Term 3 2026', () => {
    const marksSeparate: Mark[] = [
      { id: 'm1', student_id: 'std_kuria', exam_id: 'exam_g6_opn_t3_2026', subject_id: 'sb_sst', score: 24, raw_score: 24, out_of: 30 },
      { id: 'm2', student_id: 'std_kuria', exam_id: 'exam_g6_opn_t3_2026', subject_id: 'sb_cre', score: 18, raw_score: 18, out_of: 20 },
    ];

    const reportSubjects = getLearnerReportSubjectsForExam(
      mockStudent,
      mockClass,
      mockSubjects,
      [],
      g6OpenerExam,
      marksSeparate
    );

    const hasDirect = reportSubjects.some(isDirectSSCRE);
    const hasSst = reportSubjects.some(isSocialStudies);
    const hasCre = reportSubjects.some(isChristianReligiousEducation);

    expect(hasDirect).toBe(true);
    expect(hasSst).toBe(false);
    expect(hasCre).toBe(false);
  });

  it('does not alter behavior for non-Grade 6 Opener Term 3 2026 exams', () => {
    const otherExamWithNoStructure: Examination = {
      ...otherExam,
      ss_cre_structure: undefined,
    };

    const reportSubjects = getLearnerReportSubjectsForExam(
      mockStudent,
      mockClass,
      mockSubjects,
      [],
      otherExamWithNoStructure,
      []
    );

    // Standard behavior for exam without ss_cre_structure: separate SST & CRE are excluded, merged SS&CRE is kept
    expect(reportSubjects.some(isSocialStudies)).toBe(false);
    expect(reportSubjects.some(isChristianReligiousEducation)).toBe(false);
    expect(reportSubjects.some(isDirectSSCRE)).toBe(true);
  });

  it('generates Upper Primary Report PDF with merged SS&CRE mark row for Grade 6 Opener Term 3 2026', async () => {
    const marksMergedOnly: Mark[] = [
      { id: 'm1', student_id: 'std_kuria', exam_id: 'exam_g6_opn_t3_2026', subject_id: 'sb_mat', score: 85, raw_score: 85, out_of: 100 },
      { id: 'm2', student_id: 'std_kuria', exam_id: 'exam_g6_opn_t3_2026', subject_id: 'sb_eng', score: 78, raw_score: 78, out_of: 100 },
      { id: 'm3', student_id: 'std_kuria', exam_id: 'exam_g6_opn_t3_2026', subject_id: 'sb_up_ss_cre', score: 76, raw_score: 76, out_of: 100 },
    ];

    const pdfData: PDFReportData = {
      student: mockStudent,
      school: mockSchool,
      exam: g6OpenerExam,
      classes: [mockClass],
      subjects: mockSubjects,
      marks: marksMergedOnly,
      grades: mockGrades,
      teachers: [],
      allStudents: [mockStudent],
      nextTermOpeningDate: '2026-10-05',
    };

    const doc = await generateUpperPrimaryReportPDF(pdfData);
    expect(doc).toBeDefined();
    expect(doc.getNumberOfPages()).toBeGreaterThan(0);
  });
});
