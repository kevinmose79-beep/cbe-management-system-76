import { describe, it, expect } from 'vitest';
import { generatePersonalizedLearnerComment } from '../services/learnerCommentGenerator';
import { Student, Subject, Grade, Mark } from '../types';

describe('Upper Primary Learner Comments Fix', () => {
  it('generates personalized non-provisional comments for a fully assessed Upper Primary learner', () => {
    const student: Student = {
      id: 'std_001',
      admission_number: '001',
      first_name: 'SAMUEL',
      last_name: 'KURIA',
      full_name: 'SAMUEL KURIA',
      grade: 'Grade 6',
      gender: 'M',
      class_id: 'class_6a',
      active: true,
    };

    const upReportAreas: any[] = [
      { id: 'up_ENG', name: 'English', code: 'ENG', percentage: 74, status: 'Normal' },
      { id: 'up_KIS', name: 'Kiswahili', code: 'KIS', percentage: 74, status: 'Normal' },
      { id: 'up_MATH', name: 'Mathematics', code: 'MATH', percentage: 87, status: 'Normal' },
      { id: 'up_SCI', name: 'Integrated Science', code: 'INT-SCI', percentage: 74, status: 'Normal' },
      { id: 'up_CAS', name: 'Creative Arts and Sports', code: 'CAS', percentage: 68, status: 'Normal' },
      { id: 'up_SS_CRE', name: 'Social Studies & CRE', code: 'SS&CRE', percentage: 76, status: 'Normal' },
    ];

    const grades: Grade[] = [];

    // Class Teacher Comment
    const ctComment = generatePersonalizedLearnerComment({
      student,
      examId: 'exam_2026_t3',
      marks: [],
      subjects: upReportAreas as Subject[],
      grades,
      averageScore: 76,
      commentType: 'class_teacher',
      isProvisional: false,
    });

    // HOI Comment
    const hoiComment = generatePersonalizedLearnerComment({
      student,
      examId: 'exam_2026_t3',
      marks: [],
      subjects: upReportAreas as Subject[],
      grades,
      averageScore: 76,
      commentType: 'hoi',
      isProvisional: false,
    });

    // Must NOT contain provisional placeholder strings
    expect(ctComment).not.toContain('Full pedagogical evaluation across all competencies');
    expect(ctComment).not.toContain('incomplete');
    expect(ctComment).not.toContain('pending');

    expect(hoiComment).not.toContain('Official institutional approval remains pending');
    expect(hoiComment).not.toContain('provisional');

    // Should reflect completed academic achievement
    expect(ctComment.length).toBeGreaterThan(20);
    expect(hoiComment.length).toBeGreaterThan(15);
    expect(ctComment).toContain('Mathematics'); // Highlighted strongest subject
    expect(hoiComment.toLowerCase()).toContain('approval'); // Official approval
  });
});
