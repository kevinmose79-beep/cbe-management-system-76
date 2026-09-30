import './setupLocalStorage';
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { generateExamAnalysisSummary, CBE_4_POINT_GRADES, CBE_8_POINT_GRADES } from '../services/analysisEngine';
import type { Student, Subject, Grade, Mark } from '../types';

describe('CBE Management System — Class-Aware & Level-Aware Teacher Dashboard Verification', () => {
  const teacherDashboardPath = path.resolve(process.cwd(), 'src/components/TeacherDashboard.tsx');
  const teacherDashboardCode = fs.readFileSync(teacherDashboardPath, 'utf-8');

  it('verifies TeacherDashboard.tsx includes is4PointScale and activeGradesSet logic', () => {
    expect(teacherDashboardCode).toContain('is4PointScale');
    expect(teacherDashboardCode).toContain('activeGradesSet');
    expect(teacherDashboardCode).toContain('CBE_8_POINT_GRADES');
    expect(teacherDashboardCode).toContain('CBE_4_POINT_GRADES');
  });

  it('verifies TeacherDashboard passes activeGradesSet to generateExamAnalysisSummary', () => {
    expect(teacherDashboardCode).toMatch(/generateExamAnalysisSummary\([\s\S]*?activeGradesSet[\s\S]*?\)/);
  });

  it('verifies performanceLevelData maps activeGradesSet dynamically', () => {
    expect(teacherDashboardCode).toContain('activeGradesSet.map(');
    expect(teacherDashboardCode).toContain('getCbeGradeColor(code, index)');
  });

  it('verifies 8 CBE levels are computed correctly for Junior School assessments', () => {
    const mockExamId = 'exam-js-test-8pt';
    const mockExamName = 'GRADE 9 KJSEA SECOND TRIAL TERM 3 2026';

    const mockStudents: Student[] = [
      { id: 's1', admission_number: '115', full_name: 'Faith Wamuguru', gender: 'F', grade: 'Grade 9', class_id: 'cls-9', stream_id: 'strm-9b', active: true },
      { id: 's2', admission_number: '118', full_name: 'Rey Maseno', gender: 'M', grade: 'Grade 9', class_id: 'cls-9', stream_id: 'strm-9b', active: true },
      { id: 's3', admission_number: '119', full_name: 'Brian Omondi', gender: 'M', grade: 'Grade 9', class_id: 'cls-9', stream_id: 'strm-9b', active: true },
      { id: 's4', admission_number: '120', full_name: 'Grace Wanjiru', gender: 'F', grade: 'Grade 9', class_id: 'cls-9', stream_id: 'strm-9b', active: true },
    ];

    const mockSubjects: Subject[] = [
      { id: 'sub-mat', subject_code: 'MATH', subject_name: 'Mathematics', education_level: 'Junior School', applicable_grades: ['Grade 9'], category: 'Core' },
      { id: 'sub-eng', subject_code: 'ENG', subject_name: 'English', education_level: 'Junior School', applicable_grades: ['Grade 9'], category: 'Core' },
    ];

    // s1: 95% average -> EE1 (>= 90)
    // s2: 78% average -> EE2 (75 - 89)
    // s3: 65% average -> ME1 (58 - 74)
    // s4: 48% average -> ME2 (41 - 57)
    const mockMarks: Mark[] = [
      { id: 'm1', exam_id: mockExamId, student_id: 's1', subject_id: 'sub-mat', marks: 95, raw_score: 95, out_of: 100, special_status: 'Normal' },
      { id: 'm2', exam_id: mockExamId, student_id: 's1', subject_id: 'sub-eng', marks: 95, raw_score: 95, out_of: 100, special_status: 'Normal' },
      { id: 'm3', exam_id: mockExamId, student_id: 's2', subject_id: 'sub-mat', marks: 78, raw_score: 78, out_of: 100, special_status: 'Normal' },
      { id: 'm4', exam_id: mockExamId, student_id: 's2', subject_id: 'sub-eng', marks: 78, raw_score: 78, out_of: 100, special_status: 'Normal' },
      { id: 'm5', exam_id: mockExamId, student_id: 's3', subject_id: 'sub-mat', marks: 65, raw_score: 65, out_of: 100, special_status: 'Normal' },
      { id: 'm6', exam_id: mockExamId, student_id: 's3', subject_id: 'sub-eng', marks: 65, raw_score: 65, out_of: 100, special_status: 'Normal' },
      { id: 'm7', exam_id: mockExamId, student_id: 's4', subject_id: 'sub-mat', marks: 48, raw_score: 48, out_of: 100, special_status: 'Normal' },
      { id: 'm8', exam_id: mockExamId, student_id: 's4', subject_id: 'sub-eng', marks: 48, raw_score: 48, out_of: 100, special_status: 'Normal' },
    ];

    const summary = generateExamAnalysisSummary(
      mockExamId,
      mockExamName,
      mockStudents,
      mockSubjects,
      mockMarks,
      CBE_8_POINT_GRADES
    );

    // Verify 8-point level breakdown
    expect(summary.grade_counts.EE1).toBe(1);
    expect(summary.grade_counts.EE2).toBe(1);
    expect(summary.grade_counts.ME1).toBe(1);
    expect(summary.grade_counts.ME2).toBe(1);
    expect(summary.grade_counts.AE1).toBe(0);
    expect(summary.grade_counts.AE2).toBe(0);
    expect(summary.grade_counts.BE1).toBe(0);
    expect(summary.grade_counts.BE2).toBe(0);

    // Verify individual top performers have their 8-point CBE grade code
    expect(summary.top_performers[0].grade_code).toBe('EE1');
    expect(summary.top_performers[1].grade_code).toBe('EE2');
    expect(summary.top_performers[2].grade_code).toBe('ME1');
    expect(summary.top_performers[3].grade_code).toBe('ME2');
  });

  it('verifies 4 CBE levels are used for Primary School assessments', () => {
    const mockExamId = 'exam-pri-test-4pt';
    const mockExamName = 'GRADE 5 OPENER EXAM 2026';

    const mockStudents: Student[] = [
      { id: 'sp1', admission_number: '201', full_name: 'Allan Mwangi', gender: 'M', grade: 'Grade 5', class_id: 'cls-5', stream_id: 'strm-5a', active: true },
      { id: 'sp2', admission_number: '202', full_name: 'Joyce Auma', gender: 'F', grade: 'Grade 5', class_id: 'cls-5', stream_id: 'strm-5a', active: true },
    ];

    const mockSubjects: Subject[] = [
      { id: 'sub-sci', subject_code: 'SCI', subject_name: 'Science & Technology', education_level: 'Upper Primary', applicable_grades: ['Grade 5'], category: 'Core' },
    ];

    const mockMarks: Mark[] = [
      { id: 'mp1', exam_id: mockExamId, student_id: 'sp1', subject_id: 'sub-sci', marks: 82, raw_score: 82, out_of: 100, special_status: 'Normal' },
      { id: 'mp2', exam_id: mockExamId, student_id: 'sp2', subject_id: 'sub-sci', marks: 60, raw_score: 60, out_of: 100, special_status: 'Normal' },
    ];

    const summary = generateExamAnalysisSummary(
      mockExamId,
      mockExamName,
      mockStudents,
      mockSubjects,
      mockMarks,
      CBE_4_POINT_GRADES
    );

    // Verify 4-point level breakdown
    expect(summary.grade_counts.EE).toBe(1);
    expect(summary.grade_counts.ME).toBe(1);
    expect(summary.grade_counts.AE).toBe(0);
    expect(summary.grade_counts.BE).toBe(0);
  });
});
