import { describe, it, expect } from 'vitest';
import {
  resolveTopPerformersReportData,
  generateTopPerformersPDFDoc,
  TopPerformersPDFOptions,
} from '../services/topPerformersPdfExporter';
import { School, Examination, ClassStream, Subject, Mark, Grade, Student } from '../types';

describe('Top Performers PDF Exporter — Forensic Invariants & Design Rules', () => {
  const mockSchool: School = {
    id: 'sch-1',
    school_name: 'St. Teresa Academy',
    motto: 'Excellence in Education',
    address: 'P.O. Box 1234, Nairobi',
    phone: '+254 700 000000',
    email: 'info@stteresa.ac.ke',
    county: 'Nairobi',
  };

  const mockExam: Examination = {
    id: 'exam-1',
    exam_name: 'Mid Term Assessment',
    term: 'Term 2',
    year: 2026,
    education_level: 'Junior School',
    status: 'Published',
    exam_type: 'Mid-Term',
    max_marks: 100,
  };

  const mockClasses: ClassStream[] = [
    {
      id: 'class-g7-a',
      class_name: 'Grade 7',
      stream: 'East',
      stream_id: 'stream-east',
      education_level: 'Junior School',
    },
    {
      id: 'class-g7-b',
      class_name: 'Grade 7',
      stream: 'West',
      stream_id: 'stream-west',
      education_level: 'Junior School',
    },
  ];

  const mockSubjects: Subject[] = [
    { id: 'sub-eng', subject_name: 'English', subject_code: 'ENG', category: 'Core', education_level: 'Junior School' },
    { id: 'sub-kis', subject_name: 'Kiswahili', subject_code: 'KIS', category: 'Core', education_level: 'Junior School' },
    { id: 'sub-mat', subject_name: 'Mathematics', subject_code: 'MAT', category: 'Core', education_level: 'Junior School' },
    { id: 'sub-sci', subject_name: 'Integrated Science', subject_code: 'SCI', category: 'Core', education_level: 'Junior School' },
  ];

  const mockGrades: Grade[] = [
    { id: 'g-ee1', grade_code: 'EE1', performance_level: 'EE', minimum_score: 90, maximum_score: 100, points: 8, remarks: 'Exceeding', descriptor: 'Exceeding Expectations' },
    { id: 'g-ee2', grade_code: 'EE2', performance_level: 'EE', minimum_score: 80, maximum_score: 89, points: 7, remarks: 'Exceeding', descriptor: 'Exceeding Expectations' },
    { id: 'g-me1', grade_code: 'ME1', performance_level: 'ME', minimum_score: 70, maximum_score: 79, points: 6, remarks: 'Meeting', descriptor: 'Meeting Expectations' },
    { id: 'g-me2', grade_code: 'ME2', performance_level: 'ME', minimum_score: 60, maximum_score: 69, points: 5, remarks: 'Meeting', descriptor: 'Meeting Expectations' },
    { id: 'g-ae1', grade_code: 'AE1', performance_level: 'AE', minimum_score: 50, maximum_score: 59, points: 4, remarks: 'Approaching', descriptor: 'Approaching Expectations' },
    { id: 'g-ae2', grade_code: 'AE2', performance_level: 'AE', minimum_score: 40, maximum_score: 49, points: 3, remarks: 'Approaching', descriptor: 'Approaching Expectations' },
    { id: 'g-be1', grade_code: 'BE1', performance_level: 'BE', minimum_score: 20, maximum_score: 39, points: 2, remarks: 'Below', descriptor: 'Below Expectations' },
    { id: 'g-be2', grade_code: 'BE2', performance_level: 'BE', minimum_score: 0, maximum_score: 19, points: 1, remarks: 'Below', descriptor: 'Below Expectations' },
  ];

  // 12 students in Grade 7 East
  const mockStudents: Student[] = Array.from({ length: 12 }, (_, i) => ({
    id: `std-${i + 1}`,
    admission_number: `ADM00${i + 1}`,
    full_name: `Learner ${i + 1}`,
    class_id: 'class-g7-a',
    stream_id: 'stream-east',
    grade: 'Grade 7',
    stream: 'East',
    gender: 'M' as const,
    active: true,
  }));

  it('correctly ranks learners using competition ranking (1, 1, 3 method) and slices exactly to Top-N', () => {
    // English marks with a tie at rank 1, and another tie at rank 5/6
    const marks: Mark[] = [
      { id: 'm-1', exam_id: 'exam-1', student_id: 'std-1', subject_id: 'sub-eng', marks: 95 }, // Rank 1 (tied)
      { id: 'm-2', exam_id: 'exam-1', student_id: 'std-2', subject_id: 'sub-eng', marks: 95 }, // Rank 1 (tied)
      { id: 'm-3', exam_id: 'exam-1', student_id: 'std-3', subject_id: 'sub-eng', marks: 88 }, // Rank 3
      { id: 'm-4', exam_id: 'exam-1', student_id: 'std-4', subject_id: 'sub-eng', marks: 82 }, // Rank 4
      { id: 'm-5', exam_id: 'exam-1', student_id: 'std-5', subject_id: 'sub-eng', marks: 75 }, // Rank 5 (tied)
      { id: 'm-6', exam_id: 'exam-1', student_id: 'std-6', subject_id: 'sub-eng', marks: 75 }, // Rank 5 (tied, 6th student)
      { id: 'm-7', exam_id: 'exam-1', student_id: 'std-7', subject_id: 'sub-eng', marks: 70 }, // Rank 7
    ];

    const options: TopPerformersPDFOptions = {
      school: mockSchool,
      exam: mockExam,
      classes: mockClasses,
      subjects: mockSubjects,
      marks,
      grades: mockGrades,
      students: mockStudents,
      selectedClassId: 'Grade 7',
      selectedStreamId: 'stream-east',
      topN: 5,
    };

    const data = resolveTopPerformersReportData(options);
    expect(data.top_n).toBe(5);

    const engArea = data.learning_areas.find((la) => la.subject_code === 'ENG');
    expect(engArea).toBeDefined();
    // Invariant: Top 5 must slice to exactly 5 learners
    expect(engArea!.learners.length).toBe(5);

    // Verify competition ranking
    expect(engArea!.learners[0].rank).toBe(1);
    expect(engArea!.learners[1].rank).toBe(1);
    expect(engArea!.learners[2].rank).toBe(3); // Skipped 2
    expect(engArea!.learners[3].rank).toBe(4);
    expect(engArea!.learners[4].rank).toBe(5);

    // Verify stream is populated
    expect(engArea!.learners[0].stream).toBe('East');
  });

  it('supports all valid Top-N values: 5, 6, 7, 8, 9, 10', () => {
    // Generate 12 distinct marks
    const marks: Mark[] = mockStudents.map((std, idx) => ({
      id: `m-mat-${std.id}`,
      exam_id: 'exam-1',
      student_id: std.id,
      subject_id: 'sub-mat',
      marks: 90 - idx * 2,
    }));

    for (const n of [5, 6, 7, 8, 9, 10]) {
      const data = resolveTopPerformersReportData({
        school: mockSchool,
        exam: mockExam,
        classes: mockClasses,
        subjects: mockSubjects,
        marks,
        grades: mockGrades,
        students: mockStudents,
        selectedClassId: 'Grade 7',
        selectedStreamId: 'stream-east',
        topN: n,
      });

      const matArea = data.learning_areas.find((la) => la.subject_code === 'MATH' || la.subject_code === 'MAT' || la.subject_name === 'Mathematics');
      expect(matArea).toBeDefined();
      expect(matArea!.learners.length).toBe(n);
      expect(matArea!.learners[0].score).toBe(90);
      expect(matArea!.learners[n - 1].score).toBe(90 - (n - 1) * 2);
    }
  });

  it('strictly excludes X, Y, Blank, null, and invalid marks', () => {
    const marks: Mark[] = [
      { id: 'm-1', exam_id: 'exam-1', student_id: 'std-1', subject_id: 'sub-sci', marks: 85 },
      { id: 'm-2', exam_id: 'exam-1', student_id: 'std-2', subject_id: 'sub-sci', marks: 'X' as any, status: 'Absent' as any }, // Excluded
      { id: 'm-3', exam_id: 'exam-1', student_id: 'std-3', subject_id: 'sub-sci', marks: 'Y' as any, status: 'Exempt' as any }, // Excluded
      { id: 'm-4', exam_id: 'exam-1', student_id: 'std-4', subject_id: 'sub-sci', marks: null as any },                          // Excluded
      { id: 'm-5', exam_id: 'exam-1', student_id: 'std-5', subject_id: 'sub-sci', marks: 78 },
      // std-6 has no mark record -> blank/unassessed -> excluded
    ];

    const data = resolveTopPerformersReportData({
      school: mockSchool,
      exam: mockExam,
      classes: mockClasses,
      subjects: mockSubjects,
      marks,
      grades: mockGrades,
      students: mockStudents,
      selectedClassId: 'Grade 7',
      selectedStreamId: 'stream-east',
      topN: 5,
    });

    const sciArea = data.learning_areas.find((la) => la.subject_code === 'SCI' || la.subject_name.includes('Science'));
    expect(sciArea).toBeDefined();
    // Only 2 learners had valid assessed numeric marks
    expect(sciArea!.learners.length).toBe(2);
    expect(sciArea!.learners.map((l) => l.admission_number)).toEqual(['ADM001', 'ADM005']);
  });

  it('generates a jsPDF document with Page 1 header and pagination without crashing', async () => {
    const marks: Mark[] = [
      { id: 'm-1', exam_id: 'exam-1', student_id: 'std-1', subject_id: 'sub-eng', marks: 92 },
      { id: 'm-2', exam_id: 'exam-1', student_id: 'std-2', subject_id: 'sub-mat', marks: 88 },
      { id: 'm-3', exam_id: 'exam-1', student_id: 'std-3', subject_id: 'sub-sci', marks: 84 },
    ];

    const doc = await generateTopPerformersPDFDoc({
      school: mockSchool,
      exam: mockExam,
      classes: mockClasses,
      subjects: mockSubjects,
      marks,
      grades: mockGrades,
      students: mockStudents,
      selectedClassId: 'Grade 7',
      selectedStreamId: 'stream-east',
      topN: 5,
    });

    expect(doc).toBeDefined();
    expect(typeof doc.getNumberOfPages).toBe('function');
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it('generates a compact jsPDF document when school has a logo', async () => {
    // 1x1 transparent PNG data url
    const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const schoolWithLogo = {
      ...mockSchool,
      logo_url: tinyPng,
    };

    const doc = await generateTopPerformersPDFDoc({
      school: schoolWithLogo,
      exam: mockExam,
      classes: mockClasses,
      subjects: mockSubjects,
      marks: [],
      grades: mockGrades,
      students: mockStudents,
      selectedClassId: 'Grade 7',
      selectedStreamId: 'stream-east',
      topN: 5,
    });

    expect(doc).toBeDefined();
    const pdfData = doc.output();
    expect(pdfData.length).toBeGreaterThan(0);
    // Should be well under 100 KB
    expect(pdfData.length).toBeLessThan(100 * 1024);
  });
});
