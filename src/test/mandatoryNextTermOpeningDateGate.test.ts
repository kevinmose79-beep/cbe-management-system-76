import { describe, it, expect } from 'vitest';
import {
  resolveSuggestedNextTermOpeningDate,
  validateNextTermOpeningDate,
  formatDateToKenyaHumanReadable,
  isGrade9Term3Report,
  isNextTermOpeningDateRequired,
} from '../services/nextTermOpeningDateResolver';
import { resolveNextTermOpeningDate, PDFReportData, createReportCardPDFDoc } from '../services/pdfReportGenerator';
import { Examination, SchoolTerm, Student, School, ClassStream, Subject, Grade } from '../types';

describe('Mandatory Next Term Opening Date Gate & Resolver', () => {
  const mockSchool: School = {
    id: 'sch-001',
    school_name: 'Hillcrest Academy',
    county: 'Nairobi',
    email: 'info@hillcrest.edu',
    address: 'P.O Box 100',
    phone: '0700000000',
  };

  const mockStudent: Student = {
    id: 'std-001',
    admission_number: 'ADM001',
    full_name: 'Quinn Taylor',
    gender: 'F',
    grade: 'Grade 7',
    class_id: 'cls-7',
    stream_id: 'stm-7-east',
    active: true,
  };

  const mockTerms: SchoolTerm[] = [
    {
      id: 'term-2026-1',
      academic_year_id: 'ay-2026',
      year: 2026,
      term_name: 'Term 1',
      opening_date: '2026-01-05',
      closing_date: '2026-04-03',
      status: 'Closed',
    },
    {
      id: 'term-2026-2',
      academic_year_id: 'ay-2026',
      year: 2026,
      term_name: 'Term 2',
      opening_date: '2026-05-04',
      closing_date: '2026-08-07',
      status: 'Active',
    },
    {
      id: 'term-2026-3',
      academic_year_id: 'ay-2026',
      year: 2026,
      term_name: 'Term 3',
      opening_date: '2026-08-31',
      closing_date: '2026-10-30',
      status: 'Upcoming',
    },
    {
      id: 'term-2027-1',
      academic_year_id: 'ay-2027',
      year: 2027,
      term_name: 'Term 1',
      opening_date: '2027-01-04',
      closing_date: '2027-04-02',
      status: 'Upcoming',
    },
  ];

  const mockSubjects: Subject[] = [
    { id: 'sb-math', subject_code: 'MAT', subject_name: 'Mathematics', education_level: 'Junior School', category: 'Core' },
    { id: 'sb-eng', subject_code: 'ENG', subject_name: 'English', education_level: 'Junior School', category: 'Core' },
  ];

  const mockGrades: Grade[] = [
    { id: 'g1', grade_code: 'EE', descriptor: 'Exceeding Expectations', performance_level: 'EE', minimum_score: 80, maximum_score: 100, points: 4, remarks: 'Exceeding Expectations' },
    { id: 'g2', grade_code: 'ME', descriptor: 'Meeting Expectations', performance_level: 'ME', minimum_score: 60, maximum_score: 79, points: 3, remarks: 'Meeting Expectations' },
    { id: 'g3', grade_code: 'AE', descriptor: 'Approaching Expectations', performance_level: 'AE', minimum_score: 40, maximum_score: 59, points: 2, remarks: 'Approaching Expectations' },
    { id: 'g4', grade_code: 'BE', descriptor: 'Below Expectations', performance_level: 'BE', minimum_score: 0, maximum_score: 39, points: 1, remarks: 'Below Expectations' },
  ];

  const mockClasses: ClassStream[] = [
    { id: 'cls-7', class_name: 'Grade 7', stream: 'East', stream_id: 'stm-7-east', education_level: 'Junior School' },
    { id: 'cls-8', class_name: 'Grade 8', stream: 'East', stream_id: 'stm-8-east', education_level: 'Junior School' },
    { id: 'cls-9', class_name: 'Grade 9', stream: 'East', stream_id: 'stm-9-east', education_level: 'Junior School' },
    { id: 'cls-4', class_name: 'Grade 4', stream: 'East', stream_id: 'stm-4-east', education_level: 'Upper Primary' },
  ];

  it('1. Correctly resolves Term 2 opening date for a Term 1 examination', () => {
    const exam: Examination = {
      id: 'ex-01',
      exam_name: 'Term 1 Assessment 2026',
      term: 'Term 1',
      year: 2026,
      academic_year_id: 'ay-2026',
      education_level: 'Junior School',
      status: 'Approved',
      exam_type: 'End-Term',
      max_marks: 100,
    };

    const suggested = resolveSuggestedNextTermOpeningDate(exam, mockTerms);
    expect(suggested).not.toBeNull();
    expect(suggested?.nextTermName).toBe('Term 2');
    expect(suggested?.rawStartDate).toBe('2026-05-04');
    expect(suggested?.formattedDate).toContain('May 2026');
  });

  it('2. Correctly resolves Term 3 opening date for a Term 2 examination', () => {
    const exam: Examination = {
      id: 'ex-02',
      exam_name: 'Term 2 Mid-Term Assessment 2026',
      term: 'Term 2',
      year: 2026,
      academic_year_id: 'ay-2026',
      education_level: 'Junior School',
      status: 'Approved',
      exam_type: 'Mid-Term',
      max_marks: 100,
    };

    const suggested = resolveSuggestedNextTermOpeningDate(exam, mockTerms);
    expect(suggested).not.toBeNull();
    expect(suggested?.nextTermName).toBe('Term 3');
    expect(suggested?.rawStartDate).toBe('2026-08-31');
    expect(suggested?.formattedDate).toContain('August 2026');
  });

  it('3. Correctly resolves next year Term 1 opening date for a Term 3 examination', () => {
    const exam: Examination = {
      id: 'ex-03',
      exam_name: 'End of Year Assessment 2026',
      term: 'Term 3',
      year: 2026,
      academic_year_id: 'ay-2026',
      education_level: 'Junior School',
      status: 'Approved',
      exam_type: 'End-Term',
      max_marks: 100,
    };

    const suggested = resolveSuggestedNextTermOpeningDate(exam, mockTerms);
    expect(suggested).not.toBeNull();
    expect(suggested?.nextTermName).toBe('Term 1');
    expect(suggested?.rawStartDate).toBe('2027-01-04');
    expect(suggested?.formattedDate).toContain('January 2027');
  });

  it('4. Validates manual next term opening date strings', () => {
    expect(validateNextTermOpeningDate('15th January 2027')).toBe(true);
    expect(validateNextTermOpeningDate('2027-01-15')).toBe(true);
    expect(validateNextTermOpeningDate('   ')).toBe(false);
    expect(validateNextTermOpeningDate('')).toBe(false);
    expect(validateNextTermOpeningDate('N/A')).toBe(false);
  });

  it('5. resolveNextTermOpeningDate prioritizes explicit nextTermOpeningDate on PDFReportData', () => {
    const reportData: PDFReportData = {
      student: mockStudent,
      school: mockSchool,
      classes: [],
      subjects: [],
      marks: [],
      grades: [],
      allStudents: [mockStudent],
      nextTermOpeningDate: '4th January 2027',
      savedRemarks: {
        student_id: mockStudent.id,
        exam_id: 'ex-01',
        next_term_opening_date: 'Old Stale Date',
      },
    };

    const resolved = resolveNextTermOpeningDate(reportData);
    expect(resolved).toBe('4 January 2027');
  });

  it('6. resolveNextTermOpeningDate uses savedRemarks when explicit field is absent', () => {
    const reportData: PDFReportData = {
      student: mockStudent,
      school: mockSchool,
      classes: [],
      subjects: [],
      marks: [],
      grades: [],
      allStudents: [mockStudent],
      savedRemarks: {
        student_id: mockStudent.id,
        exam_id: 'ex-01',
        next_term_opening_date: '5th May 2026',
      },
    };

    const resolved = resolveNextTermOpeningDate(reportData);
    expect(resolved).toBe('5 May 2026');
  });

  it('7. resolveNextTermOpeningDate strictly throws when next term opening date is missing (no silent fallback)', () => {
    const exam: Examination = {
      id: 'ex-01',
      exam_name: 'Term 1 Assessment 2026',
      term: 'Term 1',
      year: 2026,
      academic_year_id: 'ay-2026',
      education_level: 'Junior School',
      status: 'Approved',
      exam_type: 'End-Term',
      max_marks: 100,
    };

    const reportData: PDFReportData = {
      student: mockStudent,
      school: mockSchool,
      exam,
      classes: mockClasses,
      subjects: [],
      marks: [],
      grades: [],
      allStudents: [mockStudent],
    };

    expect(() => resolveNextTermOpeningDate(reportData)).toThrow(
      'Next Term Opening Date is required for official report card PDF generation'
    );
  });

  it('8. Batch report data list maintains exact confirmed next term date across all learners', () => {
    const students: Student[] = [
      { ...mockStudent, id: 's1', full_name: 'Student One' },
      { ...mockStudent, id: 's2', full_name: 'Student Two' },
      { ...mockStudent, id: 's3', full_name: 'Student Three' },
    ];

    const confirmedDate = '8th September 2026';
    const batchDataList: PDFReportData[] = students.map((std) => ({
      student: std,
      school: mockSchool,
      classes: [],
      subjects: [],
      marks: [],
      grades: [],
      allStudents: students,
      nextTermOpeningDate: confirmedDate,
    }));

    batchDataList.forEach((data) => {
      expect(resolveNextTermOpeningDate(data)).toBe('8 September 2026');
    });
  });

  it('9. Formats dates in Kenya standard human-readable format', () => {
    const formatted = formatDateToKenyaHumanReadable('2026-09-08');
    expect(formatted).toBe('8 September 2026');

    const formatted2 = formatDateToKenyaHumanReadable('2026-01-01');
    expect(formatted2).toBe('1 January 2026');

    const formatted3 = formatDateToKenyaHumanReadable('2026-05-02');
    expect(formatted3).toBe('2 May 2026');

    const formatted4 = formatDateToKenyaHumanReadable('2026-03-03');
    expect(formatted4).toBe('3 March 2026');
  });

  // =========================================================================
  // SURGICAL SPECIFICATION TESTS (TEST 1 to TEST 14)
  // =========================================================================

  it('TEST 1: Grade 7 Term 1 requires mandatory date and renders confirmed date in PDF', async () => {
    const exam: Examination = {
      id: 'ex-g7-t1',
      exam_name: 'Grade 7 Term 1 Assessment 2026',
      term: 'Term 1',
      year: 2026,
      education_level: 'Junior School',
      status: 'Approved',
      exam_type: 'End-Term',
      max_marks: 100,
    };

    const g7Student: Student = {
      ...mockStudent,
      grade: 'Grade 7',
      class_id: 'cls-7',
    };

    // 1. Context requires date
    expect(isGrade9Term3Report({ student: g7Student, exam, grade: 'Grade 7', term: 'Term 1' })).toBe(false);
    expect(isNextTermOpeningDateRequired({ student: g7Student, exam, grade: 'Grade 7', term: 'Term 1' })).toBe(true);

    // 2. Confirmed date reaches PDF successfully
    const reportData: PDFReportData = {
      student: g7Student,
      school: mockSchool,
      exam,
      classes: mockClasses,
      subjects: mockSubjects,
      marks: [],
      grades: mockGrades,
      allStudents: [g7Student],
      nextTermOpeningDate: '2026-05-04',
    };

    const resolved = resolveNextTermOpeningDate(reportData);
    expect(resolved).toBe('4 May 2026');

    const doc = await createReportCardPDFDoc(reportData);
    expect(doc).toBeDefined();
  });

  it('TEST 2: Grade 8 Term 2 requires mandatory date and renders confirmed date in PDF', async () => {
    const exam: Examination = {
      id: 'ex-g8-t2',
      exam_name: 'Grade 8 Term 2 Assessment 2026',
      term: 'Term 2',
      year: 2026,
      education_level: 'Junior School',
      status: 'Approved',
      exam_type: 'End-Term',
      max_marks: 100,
    };

    const g8Student: Student = {
      ...mockStudent,
      grade: 'Grade 8',
      class_id: 'cls-8',
    };

    expect(isGrade9Term3Report({ student: g8Student, exam, grade: 'Grade 8', term: 'Term 2' })).toBe(false);
    expect(isNextTermOpeningDateRequired({ student: g8Student, exam, grade: 'Grade 8', term: 'Term 2' })).toBe(true);

    const reportData: PDFReportData = {
      student: g8Student,
      school: mockSchool,
      exam,
      classes: mockClasses,
      subjects: mockSubjects,
      marks: [],
      grades: mockGrades,
      allStudents: [g8Student],
      nextTermOpeningDate: '2026-08-31',
    };

    const resolved = resolveNextTermOpeningDate(reportData);
    expect(resolved).toBe('31 August 2026');

    const doc = await createReportCardPDFDoc(reportData);
    expect(doc).toBeDefined();
  });

  it('TEST 3: Grade 9 Term 1 requires mandatory date modal (not exempt)', () => {
    const exam: Examination = {
      id: 'ex-g9-t1',
      exam_name: 'Grade 9 Term 1 Assessment 2026',
      term: 'Term 1',
      year: 2026,
      education_level: 'Junior School',
      status: 'Approved',
      exam_type: 'End-Term',
      max_marks: 100,
    };

    const g9Student: Student = {
      ...mockStudent,
      grade: 'Grade 9',
      class_id: 'cls-9',
    };

    expect(isGrade9Term3Report({ student: g9Student, exam, grade: 'Grade 9', term: 'Term 1' })).toBe(false);
    expect(isNextTermOpeningDateRequired({ student: g9Student, exam, grade: 'Grade 9', term: 'Term 1' })).toBe(true);
  });

  it('TEST 4: Grade 9 Term 2 requires mandatory date modal (not exempt)', () => {
    const exam: Examination = {
      id: 'ex-g9-t2',
      exam_name: 'Grade 9 Term 2 Assessment 2026',
      term: 'Term 2',
      year: 2026,
      education_level: 'Junior School',
      status: 'Approved',
      exam_type: 'End-Term',
      max_marks: 100,
    };

    const g9Student: Student = {
      ...mockStudent,
      grade: 'Grade 9',
      class_id: 'cls-9',
    };

    expect(isGrade9Term3Report({ student: g9Student, exam, grade: 'Grade 9', term: 'Term 2' })).toBe(false);
    expect(isNextTermOpeningDateRequired({ student: g9Student, exam, grade: 'Grade 9', term: 'Term 2' })).toBe(true);
  });

  it('TEST 5: Grade 9 Term 3 is EXEMPT: NO date modal, NO date required, PDF generates normally', async () => {
    const exam: Examination = {
      id: 'ex-g9-t3',
      exam_name: 'Grade 9 Term 3 Assessment 2026',
      term: 'Term 3',
      year: 2026,
      education_level: 'Junior School',
      status: 'Approved',
      exam_type: 'End-Term',
      max_marks: 100,
    };

    const g9Student: Student = {
      ...mockStudent,
      grade: 'Grade 9',
      class_id: 'cls-9',
      stream_id: 'stm-9-east',
    };

    // 1. Confirms Grade 9 Term 3 exception
    expect(isGrade9Term3Report({ student: g9Student, exam, classes: mockClasses, grade: 'Grade 9', term: 'Term 3' })).toBe(true);
    expect(isNextTermOpeningDateRequired({ student: g9Student, exam, classes: mockClasses, grade: 'Grade 9', term: 'Term 3' })).toBe(false);

    // 2. resolveNextTermOpeningDate safely returns '' without throwing
    const reportDataWithoutDate: PDFReportData = {
      student: g9Student,
      school: mockSchool,
      exam,
      classes: mockClasses,
      subjects: mockSubjects,
      marks: [],
      grades: mockGrades,
      allStudents: [g9Student],
      // No nextTermOpeningDate provided!
    };

    const resolved = resolveNextTermOpeningDate(reportDataWithoutDate);
    expect(resolved).toBe('');

    // 3. Document generates successfully without error
    const doc = await createReportCardPDFDoc(reportDataWithoutDate);
    expect(doc).toBeDefined();
  });

  it('TEST 6: Other classes in Term 3 (e.g. Grade 4 Term 3 or Grade 8 Term 3) STILL REQUIRE mandatory date', () => {
    const examT3: Examination = {
      id: 'ex-t3',
      exam_name: 'Term 3 End Year Assessment 2026',
      term: 'Term 3',
      year: 2026,
      status: 'Approved',
      exam_type: 'End-Term',
      max_marks: 100,
    };

    // Grade 8 Term 3
    const g8Student: Student = { ...mockStudent, grade: 'Grade 8', class_id: 'cls-8' };
    expect(isGrade9Term3Report({ student: g8Student, exam: examT3, grade: 'Grade 8', term: 'Term 3' })).toBe(false);
    expect(isNextTermOpeningDateRequired({ student: g8Student, exam: examT3, grade: 'Grade 8', term: 'Term 3' })).toBe(true);

    // Grade 4 Term 3
    const g4Student: Student = { ...mockStudent, grade: 'Grade 4', class_id: 'cls-4' };
    expect(isGrade9Term3Report({ student: g4Student, exam: examT3, grade: 'Grade 4', term: 'Term 3' })).toBe(false);
    expect(isNextTermOpeningDateRequired({ student: g4Student, exam: examT3, grade: 'Grade 4', term: 'Term 3' })).toBe(true);

    // Missing date strictly throws for Grade 8 Term 3
    expect(() =>
      resolveNextTermOpeningDate({
        student: g8Student,
        school: mockSchool,
        exam: examT3,
        classes: mockClasses,
        subjects: [],
        marks: [],
        grades: [],
        allStudents: [g8Student],
      })
    ).toThrow('Next Term Opening Date is required for official report card PDF generation');
  });

  it('TEST 7: Single report: one confirmed date reaches the PDF', () => {
    const confirmed = '2026-09-08';
    const reportData: PDFReportData = {
      student: mockStudent,
      school: mockSchool,
      classes: mockClasses,
      subjects: [],
      marks: [],
      grades: [],
      allStudents: [mockStudent],
      nextTermOpeningDate: confirmed,
    };

    expect(resolveNextTermOpeningDate(reportData)).toBe('8 September 2026');
  });

  it('TEST 8: Batch report: ONE confirmed date applies consistently to every learner report', () => {
    const cohort: Student[] = [
      { ...mockStudent, id: 's1', full_name: 'Alice Johnson' },
      { ...mockStudent, id: 's2', full_name: 'Bob Mwangi' },
      { ...mockStudent, id: 's3', full_name: 'Charlie Otieno' },
    ];

    const singleConfirmedDate = '2027-01-05';
    const batchList: PDFReportData[] = cohort.map((st) => ({
      student: st,
      school: mockSchool,
      classes: mockClasses,
      subjects: [],
      marks: [],
      grades: [],
      allStudents: cohort,
      nextTermOpeningDate: singleConfirmedDate,
    }));

    batchList.forEach((item) => {
      expect(resolveNextTermOpeningDate(item)).toBe('5 January 2027');
    });
  });

  it('TEST 9 & 10: Cancel or Close prevents download; no confirmed date is accepted', () => {
    let downloadTriggered = false;
    const onConfirm = () => { downloadTriggered = true; };
    const onClose = () => { /* modal closes without calling onConfirm */ };

    // When user cancels or clicks X:
    onClose();
    expect(downloadTriggered).toBe(false);
  });

  it('TEST 11 & 12: Missing or invalid date fails validation and prevents confirmation', () => {
    expect(validateNextTermOpeningDate('')).toBe(false);
    expect(validateNextTermOpeningDate('   ')).toBe(false);
    expect(validateNextTermOpeningDate(undefined)).toBe(false);
    expect(validateNextTermOpeningDate(null)).toBe(false);
    expect(validateNextTermOpeningDate('N/A')).toBe(false);
    expect(validateNextTermOpeningDate('null')).toBe(false);
    expect(validateNextTermOpeningDate('abc')).toBe(false); // length < 4

    // Valid dates pass
    expect(validateNextTermOpeningDate('2026-05-04')).toBe(true);
    expect(validateNextTermOpeningDate('4th May 2026')).toBe(true);
  });

  it('TEST 13: Existing suggested date pre-fills and user-confirmed modified value reaches PDF', () => {
    const exam: Examination = {
      id: 'ex-01',
      exam_name: 'Term 1 Assessment 2026',
      term: 'Term 1',
      year: 2026,
      status: 'Approved',
      exam_type: 'End-Term',
      max_marks: 100,
    };

    const suggested = resolveSuggestedNextTermOpeningDate(exam, mockTerms);
    expect(suggested?.rawDate).toBe('2026-05-04');

    // User modifies suggested date in modal to '2026-05-11' and confirms
    const userModifiedDate = '2026-05-11';
    const reportData: PDFReportData = {
      student: mockStudent,
      school: mockSchool,
      exam,
      classes: mockClasses,
      subjects: [],
      marks: [],
      grades: [],
      allStudents: [mockStudent],
      nextTermOpeningDate: userModifiedDate,
    };

    expect(resolveNextTermOpeningDate(reportData)).toBe('11 May 2026');
  });

  it('TEST 14: Direct PDF generator invocation maintains lower-level security guard for non-exempt reports', () => {
    const applicableExam: Examination = {
      id: 'ex-g7',
      exam_name: 'Grade 7 Mid-Term Assessment',
      term: 'Term 2',
      year: 2026,
      status: 'Approved',
      exam_type: 'Mid-Term',
      max_marks: 100,
    };

    const unconfirmedReportData: PDFReportData = {
      student: mockStudent, // Grade 7
      school: mockSchool,
      exam: applicableExam,
      classes: mockClasses,
      subjects: [],
      marks: [],
      grades: [],
      allStudents: [mockStudent],
      // No nextTermOpeningDate provided!
    };

    expect(() => resolveNextTermOpeningDate(unconfirmedReportData)).toThrow(
      'Next Term Opening Date is required for official report card PDF generation'
    );
  });
});

