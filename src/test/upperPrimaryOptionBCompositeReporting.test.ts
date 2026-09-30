import { describe, it, expect } from 'vitest';
import {
  resolveLearnerReportSubjectsAndMarks,
  getUpperPrimaryCompositeSubjectMarks,
  evaluateMark,
  isDirectSSCRE,
  isSocialStudies,
  isChristianReligiousEducation,
} from '../utils/markUtils';
import { Student, Examination, Mark, Subject, ClassStream, Grade, School, Teacher } from '../types';
import { generateUpperPrimaryReportPDF, PDFReportData } from '../services/pdfReportGenerator';

describe('Option B: Upper Primary SST + CRE Composite Reporting & Resolution', () => {
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

  const mockUpperPrimarySubjects: Subject[] = [
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

  const mockJuniorSchoolSubjects: Subject[] = [
    { id: 'sb_js_mat', subject_name: 'Mathematics', subject_code: 'MATH', category: 'Core', education_level: 'Junior School' },
    { id: 'sb_js_sst', subject_name: 'Social Studies', subject_code: 'SST', category: 'Core', education_level: 'Junior School' },
    { id: 'sb_js_cre', subject_name: 'Christian Religious Education', subject_code: 'CRE', category: 'Core', education_level: 'Junior School' },
  ];

  const mockG6Class: ClassStream = {
    id: 'cls_g6',
    class_name: 'Grade 6',
    stream: 'Green',
    education_level: 'Upper Primary',
  };

  const mockG7Class: ClassStream = {
    id: 'cls_g7',
    class_name: 'Grade 7',
    stream: 'Blue',
    education_level: 'Junior School',
  };

  const mockStudentG6: Student = {
    id: 'std_001',
    admission_number: 'ADM-001',
    full_name: 'Jane Wambui',
    first_name: 'Jane',
    last_name: 'Wambui',
    grade: 'Grade 6',
    class_id: 'cls_g6',
    stream_id: 'cls_g6',
    gender: 'F',
    active: true,
  };

  const mockStudentG7: Student = {
    id: 'std_002',
    admission_number: 'ADM-002',
    full_name: 'John Otieno',
    first_name: 'John',
    last_name: 'Otieno',
    grade: 'Grade 7',
    class_id: 'cls_g7',
    stream_id: 'cls_g7',
    gender: 'M',
    active: true,
  };

  const mockExamG6: Examination = {
    id: 'exam_g6_mid_2026',
    exam_name: 'Grade 6 Mid-Term Assessment Term 2 2026',
    term: 'Term 2',
    year: 2026,
    exam_type: 'Mid-Term',
    status: 'Published',
    max_marks: 100,
    education_level: 'Upper Primary',
  };

  it('calculates SS&CRE composite correctly from SST (2/10) and CRE (7/10)', () => {
    const rawMarks: Mark[] = [
      { id: 'm1', student_id: 'std_001', exam_id: 'exam_g6_mid_2026', subject_id: 'sb_sst', score: 2, raw_score: 2, out_of: 10 },
      { id: 'm2', student_id: 'std_001', exam_id: 'exam_g6_mid_2026', subject_id: 'sb_cre', score: 7, raw_score: 7, out_of: 10 },
    ];

    const { reportSubjects, reportMarks } = resolveLearnerReportSubjectsAndMarks(
      mockStudentG6,
      mockG6Class,
      mockUpperPrimarySubjects,
      [],
      mockExamG6,
      rawMarks
    );

    // 1. Check report subjects
    expect(reportSubjects.some(isSocialStudies)).toBe(false);
    expect(reportSubjects.some(isChristianReligiousEducation)).toBe(false);
    expect(reportSubjects.some(isDirectSSCRE)).toBe(true);

    // 2. Check resolved marks
    const ssCreSub = reportSubjects.find(isDirectSSCRE)!;
    const ssCreMark = reportMarks.find((m) => m.subject_id === ssCreSub.id || isDirectSSCRE({ id: m.subject_id }));

    expect(ssCreMark).toBeDefined();
    expect(ssCreMark?.raw_score).toBe(9); // 2 + 7 = 9
    expect(ssCreMark?.out_of).toBe(20);   // Structure B default: 10 + 10 = 20
    expect(ssCreMark?.percentage).toBe(45); // (9/20) * 100 = 45%

    // 3. Evaluate mark
    const evaluation = evaluateMark(ssCreMark);
    expect(evaluation.status).toBe('Normal');
    expect(evaluation.rawScore).toBe(9);
    expect(evaluation.percentage).toBe(45);
  });

  it('preserves separate SST and CRE for Junior School (Grade 7)', () => {
    const rawMarks: Mark[] = [
      { id: 'm1', student_id: 'std_002', exam_id: 'exam_g7_mid_2026', subject_id: 'sb_js_sst', score: 35, raw_score: 35, out_of: 50 },
      { id: 'm2', student_id: 'std_002', exam_id: 'exam_g7_mid_2026', subject_id: 'sb_js_cre', score: 40, raw_score: 40, out_of: 50 },
    ];

    const { reportSubjects, reportMarks } = resolveLearnerReportSubjectsAndMarks(
      mockStudentG7,
      mockG7Class,
      mockJuniorSchoolSubjects,
      [],
      undefined,
      rawMarks
    );

    expect(reportSubjects.some(isSocialStudies)).toBe(true);
    expect(reportSubjects.some(isChristianReligiousEducation)).toBe(true);
    expect(reportSubjects.some(isDirectSSCRE)).toBe(false);
    expect(reportMarks).toHaveLength(2);
  });

  it('generates PDF with calculated SS&CRE composite without missing assessment X', async () => {
    const rawMarks: Mark[] = [
      { id: 'm1', student_id: 'std_001', exam_id: 'exam_g6_mid_2026', subject_id: 'sb_mat', score: 80, raw_score: 80, out_of: 100 },
      { id: 'm2', student_id: 'std_001', exam_id: 'exam_g6_mid_2026', subject_id: 'sb_eng', score: 75, raw_score: 75, out_of: 100 },
      { id: 'm3', student_id: 'std_001', exam_id: 'exam_g6_mid_2026', subject_id: 'sb_sst', score: 2, raw_score: 2, out_of: 10 },
      { id: 'm4', student_id: 'std_001', exam_id: 'exam_g6_mid_2026', subject_id: 'sb_cre', score: 7, raw_score: 7, out_of: 10 },
    ];

    const pdfData: PDFReportData = {
      student: mockStudentG6,
      school: mockSchool,
      exam: mockExamG6,
      classes: [mockG6Class],
      subjects: mockUpperPrimarySubjects,
      marks: rawMarks,
      grades: mockGrades,
      teachers: [],
      allStudents: [mockStudentG6],
      nextTermOpeningDate: '2026-10-05',
    };

    const doc = await generateUpperPrimaryReportPDF(pdfData);
    expect(doc).toBeDefined();
    expect(doc.getNumberOfPages()).toBeGreaterThan(0);
  });
});
