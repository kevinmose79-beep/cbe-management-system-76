import { describe, it, expect } from 'vitest';
import {
  resolveTerminalReportRemarks,
  TerminalReportPDFData,
} from '../services/terminalReportPdfGenerator';
import { resolveClassTeacher } from '../utils/teacherResolutionUtils';
import { Student, School, ClassStream, Teacher, Subject } from '../types';
import { LearningAreaTerminalResult } from '../services/terminalResultsEngine';

describe('Terminal Report Data Pipeline - Class Teacher, Head Teacher & Remarks Resolution', () => {
  const mockSchool: School = {
    id: 'sch-1',
    school_name: 'Muchorwe Comprehensive School',
    county: 'Nandi',
    email: 'info@muchorwe.ac.ke',
    principal_name: 'Dr. Jane Kimani',
  };

  const mockTeacher1: Teacher = {
    id: 'tch-ct-1',
    teacher_name: 'Mr. Peter Omondi',
    phone: '0711111111',
    email: 'peter@test.com',
  };

  const mockTeacher2: Teacher = {
    id: 'tch-ct-2',
    teacher_name: 'Mrs. Mary Wanjiku',
    phone: '0722222222',
    email: 'mary@test.com',
  };

  const mockClassStream: ClassStream = {
    id: 'cls-grade-7',
    stream_id: 'stream-7-east',
    class_name: 'Grade 7',
    stream: 'East',
    class_teacher_id: 'tch-ct-1',
  };

  const mockStudent1: Student = {
    id: 'std-1',
    first_name: 'John',
    last_name: 'Doe',
    full_name: 'John Doe',
    admission_number: 'ADM-001',
    gender: 'M',
    grade: 'Grade 7',
    class_id: 'cls-grade-7',
    stream_id: 'stream-7-east',
    active: true,
  };

  const mockStudent2: Student = {
    id: 'std-2',
    first_name: 'Alice',
    last_name: 'Smith',
    full_name: 'Alice Smith',
    admission_number: 'ADM-002',
    gender: 'F',
    grade: 'Grade 7',
    class_id: 'cls-grade-7',
    stream_id: 'stream-7-east',
    active: true,
  };

  const mockSubjects: Subject[] = [
    { id: 'sb-math', subject_name: 'Mathematics', subject_code: 'MATH', category: 'Core' },
    { id: 'sb-eng', subject_name: 'English', subject_code: 'ENG', category: 'Core' },
  ];

  const resultsMap1 = new Map<string, LearningAreaTerminalResult>();
  resultsMap1.set('sb-math', {
    subjectId: 'sb-math',
    terminalPercentage: 82,
    unroundedTerminalPercentage: 82,
    cbePerformanceLevel: 'EE1',
    points: 8,
    isComplete: true,
    status: 'Complete',
    assessmentTrail: [],
  });
  resultsMap1.set('sb-eng', {
    subjectId: 'sb-eng',
    terminalPercentage: 78,
    unroundedTerminalPercentage: 78,
    cbePerformanceLevel: 'EE2',
    points: 7,
    isComplete: true,
    status: 'Complete',
    assessmentTrail: [],
  });

  const resultsMap2 = new Map<string, LearningAreaTerminalResult>();
  resultsMap2.set('sb-math', {
    subjectId: 'sb-math',
    terminalPercentage: 45,
    unroundedTerminalPercentage: 45,
    cbePerformanceLevel: 'AE1',
    points: 4,
    isComplete: true,
    status: 'Complete',
    assessmentTrail: [],
  });
  resultsMap2.set('sb-eng', {
    subjectId: 'sb-eng',
    terminalPercentage: 52,
    unroundedTerminalPercentage: 52,
    cbePerformanceLevel: 'ME2',
    points: 5,
    isComplete: true,
    status: 'Complete',
    assessmentTrail: [],
  });

  it('1. Resolves Class Teacher name authoritatively from classStream.class_teacher_id and teachers list', () => {
    const teacher = resolveClassTeacher([mockTeacher1, mockTeacher2], mockClassStream);
    expect(teacher).toBeDefined();
    expect(teacher?.teacher_name).toBe('Mr. Peter Omondi');

    const resolved = resolveTerminalReportRemarks({
      student: mockStudent1,
      school: mockSchool,
      classStream: mockClassStream,
      teachers: [mockTeacher1, mockTeacher2],
      subjects: mockSubjects,
      resultsBySubject: resultsMap1,
    });

    expect(resolved.class_teacher_name).toBe('Mr. Peter Omondi');
  });

  it('2. Resolves Head Teacher name authoritatively from school.principal_name', () => {
    const resolved = resolveTerminalReportRemarks({
      student: mockStudent1,
      school: mockSchool,
      classStream: mockClassStream,
      teachers: [mockTeacher1],
      subjects: mockSubjects,
      resultsBySubject: resultsMap1,
    });

    expect(resolved.headteacher_name).toBe('Dr. Jane Kimani');
  });

  it('3. Generates personalized pedagogical comments when no saved custom remarks exist', () => {
    const resolved = resolveTerminalReportRemarks({
      student: mockStudent1,
      school: mockSchool,
      classStream: mockClassStream,
      teachers: [mockTeacher1],
      subjects: mockSubjects,
      resultsBySubject: resultsMap1,
    });

    // Student 1 has 82% & 78% (high performance)
    expect(resolved.class_teacher_comment).toBeTruthy();
    expect(resolved.class_teacher_comment.length).toBeGreaterThan(10);
    expect(resolved.headteacher_comment).toBeTruthy();
    expect(resolved.headteacher_comment.length).toBeGreaterThan(10);
  });

  it('4. Saved custom remarks take precedence over generated comments', () => {
    const customRemarks = {
      class_teacher_comment: 'Custom CT comment for John: Outstanding effort in all areas.',
      headteacher_comment: 'Custom Head Teacher comment: Highly recommended for regional competition.',
      class_teacher_name: 'Mr. Custom Teacher',
      headteacher_name: 'Prof. Custom Principal',
    };

    const resolved = resolveTerminalReportRemarks({
      student: mockStudent1,
      school: mockSchool,
      classStream: mockClassStream,
      teachers: [mockTeacher1],
      savedRemarks: customRemarks,
      subjects: mockSubjects,
      resultsBySubject: resultsMap1,
    });

    expect(resolved.class_teacher_comment).toBe('Custom CT comment for John: Outstanding effort in all areas.');
    expect(resolved.headteacher_comment).toBe('Custom Head Teacher comment: Highly recommended for regional competition.');
    expect(resolved.class_teacher_name).toBe('Mr. Custom Teacher');
    expect(resolved.headteacher_name).toBe('Prof. Custom Principal');
  });

  it('5. Dynamic behavior: Updating school.principal_name immediately reflects in resolved report data', () => {
    const updatedSchool: School = {
      ...mockSchool,
      principal_name: 'Rev. Samuel Maina',
    };

    const resolved = resolveTerminalReportRemarks({
      student: mockStudent1,
      school: updatedSchool,
      classStream: mockClassStream,
      teachers: [mockTeacher1],
      subjects: mockSubjects,
      resultsBySubject: resultsMap1,
    });

    expect(resolved.headteacher_name).toBe('Rev. Samuel Maina');
  });

  it('6. Dynamic behavior: Reassigning Class Teacher in classStream reflects in resolved report data', () => {
    const updatedClassStream: ClassStream = {
      ...mockClassStream,
      class_teacher_id: 'tch-ct-2',
    };

    const resolved = resolveTerminalReportRemarks({
      student: mockStudent1,
      school: mockSchool,
      classStream: updatedClassStream,
      teachers: [mockTeacher1, mockTeacher2],
      subjects: mockSubjects,
      resultsBySubject: resultsMap1,
    });

    expect(resolved.class_teacher_name).toBe('Mrs. Mary Wanjiku');
  });

  it('7. Batch report isolation: Each learner in a cohort gets independent, learner-specific comments', () => {
    const resolved1 = resolveTerminalReportRemarks({
      student: mockStudent1,
      school: mockSchool,
      classStream: mockClassStream,
      teachers: [mockTeacher1],
      subjects: mockSubjects,
      resultsBySubject: resultsMap1,
    });

    const resolved2 = resolveTerminalReportRemarks({
      student: mockStudent2,
      school: mockSchool,
      classStream: mockClassStream,
      teachers: [mockTeacher1],
      subjects: mockSubjects,
      resultsBySubject: resultsMap2,
    });

    // Both get same Class Teacher and Head Teacher
    expect(resolved1.class_teacher_name).toBe('Mr. Peter Omondi');
    expect(resolved2.class_teacher_name).toBe('Mr. Peter Omondi');
    expect(resolved1.headteacher_name).toBe('Dr. Jane Kimani');
    expect(resolved2.headteacher_name).toBe('Dr. Jane Kimani');

    // But comments are tailored to their distinct performance data
    expect(resolved1.class_teacher_comment).not.toBe(resolved2.class_teacher_comment);
    expect(resolved1.headteacher_comment).not.toBe(resolved2.headteacher_comment);
  });
});
