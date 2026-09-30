import './setupLocalStorage';
import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { api, setStorage, KEYS } from '../lib/storage';
import { generateExamAnalysisSummary } from '../services/analysisEngine';
import type { Teacher, ClassStream, Examination, Mark, Student, Subject, Grade } from '../types';

describe('Surgical Fix Verification — Teacher Dashboard Marks Hydration', () => {
  const teacherDashboardPath = path.resolve(process.cwd(), 'src/components/TeacherDashboard.tsx');
  const teacherDashboardCode = fs.readFileSync(teacherDashboardPath, 'utf-8');

  const appPath = path.resolve(process.cwd(), 'src/App.tsx');
  const appCode = fs.readFileSync(appPath, 'utf-8');

  it('verifies TeacherDashboard.tsx imports useEffect and has marks hydration effect', () => {
    expect(teacherDashboardCode).toMatch(/import\s+React,\s*\{[^}]*useEffect[^}]*\}\s+from\s+'react'/);
    expect(teacherDashboardCode).toContain('api.fetchMarksForExam(activeExam.id');
    expect(teacherDashboardCode).toContain('setDashboardMarks(api.getMarks())');
  });

  it('verifies TeacherDashboard.tsx uses dashboardMarks for analysis and applicability calculations', () => {
    expect(teacherDashboardCode).toContain('dashboardMarks');
    expect(teacherDashboardCode).toMatch(/generateExamAnalysisSummary\(\s*activeExam\.id,\s*activeExam\.exam_name,\s*classTeacherStudents,\s*classTeacherSubjects,\s*dashboardMarks,\s*(activeGradesSet|safeGrades)\s*\)/);
  });

  it('verifies App.tsx passes onMarksUpdated to TeacherDashboard', () => {
    expect(appCode).toMatch(/<TeacherDashboard[\s\S]*?onMarksUpdated=\{handleMarksUpdated\}/);
  });

  it('verifies SubjectTeacherCockpit.tsx also hydrates marks for pure subject teachers', () => {
    const cockpitPath = path.resolve(process.cwd(), 'src/components/SubjectTeacherCockpit.tsx');
    const cockpitCode = fs.readFileSync(cockpitPath, 'utf-8');
    expect(cockpitCode).toMatch(/import\s+React,\s*\{[^}]*useEffect[^}]*\}\s+from\s+'react'/);
    expect(cockpitCode).toContain('api.fetchMarksForExam(activeExam.id)');
    expect(cockpitCode).toContain('cockpitMarks');
  });

  it('verifies analytical calculations succeed and produce correct metrics when marks are populated', () => {
    const mockExamId = 'exam-g9-test-01';
    const mockExamName = 'GRADE 9 KJSEA SECOND TRIAL TERM 3 2026';

    const mockStudents: Student[] = [
      {
        id: 'std-1',
        admission_number: '115',
        full_name: 'Faith Wamuguru',
        gender: 'F',
        grade: 'Grade 9',
        class_id: 'cls-9',
        stream_id: 'strm-9-blue',
        active: true,
      },
      {
        id: 'std-2',
        admission_number: '118',
        full_name: 'Rey Maseno',
        gender: 'M',
        grade: 'Grade 9',
        class_id: 'cls-9',
        stream_id: 'strm-9-blue',
        active: true,
      },
    ];

    const mockSubjects: Subject[] = [
      { id: 'sub-math', subject_code: 'MATH', subject_name: 'Mathematics', education_level: 'Junior School', applicable_grades: ['Grade 9'], category: 'Core' },
      { id: 'sub-eng', subject_code: 'ENG', subject_name: 'English', education_level: 'Junior School', applicable_grades: ['Grade 9'], category: 'Core' },
    ];

    const mockGrades: Grade[] = [
      { id: 'g-ee', grade_code: 'EE1', performance_level: 'EE', minimum_score: 75, maximum_score: 100, points: 8, descriptor: 'Exceeding Expectations', remarks: 'Outstanding' },
      { id: 'g-me', grade_code: 'ME1', performance_level: 'ME', minimum_score: 50, maximum_score: 74, points: 6, descriptor: 'Meeting Expectations', remarks: 'Good' },
      { id: 'g-ae', grade_code: 'AE1', performance_level: 'AE', minimum_score: 30, maximum_score: 49, points: 4, descriptor: 'Approaching Expectations', remarks: 'Developing' },
      { id: 'g-be', grade_code: 'BE1', performance_level: 'BE', minimum_score: 0, maximum_score: 29, points: 2, descriptor: 'Below Expectations', remarks: 'Needs Support' },
    ];

    // Mock marks for students
    const mockMarks: Mark[] = [
      { id: 'm1', exam_id: mockExamId, student_id: 'std-1', subject_id: 'sub-math', marks: 80, raw_score: 80, out_of: 100, special_status: 'Normal' },
      { id: 'm2', exam_id: mockExamId, student_id: 'std-1', subject_id: 'sub-eng', marks: 76, raw_score: 76, out_of: 100, special_status: 'Normal' },
      { id: 'm3', exam_id: mockExamId, student_id: 'std-2', subject_id: 'sub-math', marks: 70, raw_score: 70, out_of: 100, special_status: 'Normal' },
      { id: 'm4', exam_id: mockExamId, student_id: 'std-2', subject_id: 'sub-eng', marks: 66, raw_score: 66, out_of: 100, special_status: 'Normal' },
    ];

    // When marks are provided to generateExamAnalysisSummary:
    const summary = generateExamAnalysisSummary(
      mockExamId,
      mockExamName,
      mockStudents,
      mockSubjects,
      mockMarks,
      mockGrades
    );

    // Assert mean score is calculated (> 0, not N/A)
    expect(summary.mean_score).toBeGreaterThan(0);
    expect(summary.mean_score).toBe(73); // Average of (78 + 68) / 2 = 73
    expect(summary.mean_performance_level).toBe('ME');

    // Assert distribution levels are populated
    expect(summary.level_counts.EE).toBe(1);
    expect(summary.level_counts.ME).toBe(1);
    expect(summary.level_counts.AE).toBe(0);
    expect(summary.level_counts.BE).toBe(0);

    // Assert top performers are populated
    expect(summary.top_performers.length).toBe(2);
    expect(summary.top_performers[0].student_name).toBe('Faith Wamuguru');
    expect(summary.top_performers[0].average).toBe(78);
    expect(summary.top_performers[1].student_name).toBe('Rey Maseno');
    expect(summary.top_performers[1].average).toBe(68);
  });
});
