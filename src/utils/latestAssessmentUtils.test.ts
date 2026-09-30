import { describe, it, expect } from 'vitest';
import {
  resolveExamScope,
  sortExamsChronologically,
  getLatestAssessment,
  getActiveKeyingAssessments,
  getLatestAssessmentsByEducationLevel,
} from './latestAssessmentUtils';
import { Examination, ClassStream, Student, Teacher } from '../types';

const mockClasses: ClassStream[] = [
  { id: 'c_pp1_a', class_name: 'PP1', stream: 'A', stream_id: 's_pp1_a', education_level: 'Pre-Primary' },
  { id: 'c_g1_a', class_name: 'Grade 1', stream: 'A', stream_id: 's_g1_a', education_level: 'Lower Primary' },
  { id: 'c_g4_a', class_name: 'Grade 4', stream: 'A', stream_id: 's_g4_a', education_level: 'Upper Primary' },
  { id: 'c_g5_a', class_name: 'Grade 5', stream: 'A', stream_id: 's_g5_a', education_level: 'Upper Primary' },
  { id: 'c_g6_a', class_name: 'Grade 6', stream: 'A', stream_id: 's_g6_a', education_level: 'Upper Primary' },
  { id: 'c_g7_e', class_name: 'Grade 7', stream: 'East', stream_id: 's_g7_e', education_level: 'Junior School' },
  { id: 'c_g8_e', class_name: 'Grade 8', stream: 'East', stream_id: 's_g8_e', education_level: 'Junior School' },
  { id: 'c_g8_w', class_name: 'Grade 8', stream: 'West', stream_id: 's_g8_w', education_level: 'Junior School' },
  { id: 'c_g9_e', class_name: 'Grade 9', stream: 'East', stream_id: 's_g9_e', education_level: 'Junior School' },
];

const examSchoolWide2025: Examination = {
  id: 'ex_sw_2025_t3',
  exam_name: 'End-Term Assessment 2025',
  year: 2025,
  term: 'Term 3',
  status: 'Approved',
  exam_type: 'End-Term',
  max_marks: 100,
  created_at: '2025-11-01T08:00:00Z',
};

const examG9Opener2026: Examination = {
  id: 'ex_g9_op_2026_t3',
  exam_name: 'Grade 9 Opener Assessment',
  year: 2026,
  term: 'Term 3',
  status: 'Provisional',
  exam_type: 'Opener',
  class_id: 'c_g9_e',
  education_level: 'Junior School',
  max_marks: 100,
  created_at: '2026-09-01T10:00:00Z',
};

const examUPMidTerm2026: Examination = {
  id: 'ex_up_mt_2026_t3',
  exam_name: 'Upper Primary Mid-Term Assessment',
  year: 2026,
  term: 'Term 3',
  status: 'Open',
  exam_type: 'Mid-Term',
  education_level: 'Upper Primary',
  max_marks: 100,
  created_at: '2026-09-10T12:00:00Z',
};

const examLPOpener2026: Examination = {
  id: 'ex_lp_op_2026_t3',
  exam_name: 'Lower Primary Opener Assessment',
  year: 2026,
  term: 'Term 3',
  status: 'Approved',
  exam_type: 'Opener',
  education_level: 'Lower Primary',
  max_marks: 100,
  created_at: '2026-08-25T08:00:00Z',
};

const examG8MidTerm2026: Examination = {
  id: 'ex_g8_mt_2026_t3',
  exam_name: 'Grade 8 Mid-Term Assessment',
  year: 2026,
  term: 'Term 3',
  status: 'Open',
  exam_type: 'Mid-Term',
  class_id: 'Grade 8',
  education_level: 'Junior School',
  max_marks: 100,
  created_at: '2026-09-15T09:00:00Z',
};

describe('latestAssessmentUtils', () => {
  describe('resolveExamScope', () => {
    it('accurately resolves scope for grade-wide exam with class UUID when grade has single stream', () => {
      const scope = resolveExamScope(examG9Opener2026, mockClasses);
      expect(scope.level).toBe('Junior School');
      expect(scope.grade).toBe('Grade 9');
      expect(scope.scopeLabel).toBe('Junior School • Grade 9');
      expect(scope.shortScopeBadge).toBe('Grade 9');
      expect(scope.isSpecificToGrade).toBe(true);
    });

    it('accurately resolves scope for grade-wide exam when grade has multiple streams', () => {
      const scope = resolveExamScope(examG8MidTerm2026, mockClasses);
      expect(scope.level).toBe('Junior School');
      expect(scope.grade).toBe('Grade 8');
      expect(scope.scopeLabel).toBe('Junior School • Grade 8 (All Streams)');
      expect(scope.shortScopeBadge).toBe('Grade 8 (All Streams)');
      expect(scope.isSpecificToGrade).toBe(true);
    });

    it('accurately resolves stream-specific scope when exam title explicitly names stream', () => {
      const streamSpecificExam: Examination = {
        ...examG9Opener2026,
        exam_name: 'Grade 9 East Opener Assessment 2026',
      };
      const scope = resolveExamScope(streamSpecificExam, mockClasses);
      expect(scope.level).toBe('Junior School');
      expect(scope.grade).toBe('Grade 9');
      expect(scope.scopeLabel).toBe('Grade 9 East (Junior School)');
      expect(scope.shortScopeBadge).toBe('Grade 9 East');
      expect(scope.isSpecificToGrade).toBe(true);
    });

    it('accurately resolves scope for level-wide exam without specific grade', () => {
      const scope = resolveExamScope(examUPMidTerm2026, mockClasses);
      expect(scope.level).toBe('Upper Primary');
      expect(scope.grade).toBeNull();
      expect(scope.scopeLabel).toBe('Upper Primary (Grades 4–6)');
      expect(scope.shortScopeBadge).toBe('Upper Primary');
      expect(scope.isSpecificToGrade).toBe(false);
      expect(scope.isSpecificToLevel).toBe(true);
    });

    it('accurately resolves scope for school-wide exam', () => {
      const scope = resolveExamScope(examSchoolWide2025, mockClasses);
      expect(scope.level).toBe('All Levels');
      expect(scope.grade).toBeNull();
      expect(scope.scopeLabel).toBe('School-Wide (PP1–Grade 9)');
      expect(scope.shortScopeBadge).toBe('School-Wide');
      expect(scope.isSpecificToGrade).toBe(false);
      expect(scope.isSpecificToLevel).toBe(false);
    });
  });

  describe('sortExamsChronologically', () => {
    it('prioritizes active academic year and term above older sessions', () => {
      const allExams = [examSchoolWide2025, examG9Opener2026, examUPMidTerm2026, examLPOpener2026, examG8MidTerm2026];
      const sorted = sortExamsChronologically(allExams, 2026, 'Term 3');

      // 2026 Term 3 exams come first
      expect(sorted[sorted.length - 1].id).toBe('ex_sw_2025_t3');

      // Among 2026 Term 3 exams, examG8MidTerm2026 (created Sept 15) is latest
      expect(sorted[0].id).toBe('ex_g8_mt_2026_t3');
    });

    it('sorts correctly when comparing dates within same session', () => {
      const exams2026 = [examLPOpener2026, examUPMidTerm2026, examG9Opener2026, examG8MidTerm2026];
      const sorted = sortExamsChronologically(exams2026, 2026, 'Term 3');

      // Sept 15 > Sept 10 > Sept 1 > Aug 25
      expect(sorted[0].id).toBe('ex_g8_mt_2026_t3');
      expect(sorted[1].id).toBe('ex_up_mt_2026_t3');
      expect(sorted[2].id).toBe('ex_g9_op_2026_t3');
      expect(sorted[3].id).toBe('ex_lp_op_2026_t3');
    });
  });

  describe('getLatestAssessment with Education Level & Grade filtering', () => {
    const allExams = [examSchoolWide2025, examG9Opener2026, examUPMidTerm2026, examLPOpener2026, examG8MidTerm2026];

    it('returns overall latest assessment when viewing All Levels', () => {
      const latest = getLatestAssessment(allExams, {
        levelFilter: 'all',
        gradeFilter: 'all',
        classes: mockClasses,
        activeYear: 2026,
        activeTerm: 'Term 3',
      });
      expect(latest?.id).toBe('ex_g8_mt_2026_t3');
    });

    it('returns truthful latest assessment when filtered to Upper Primary', () => {
      const latest = getLatestAssessment(allExams, {
        levelFilter: 'Upper Primary',
        gradeFilter: 'all',
        classes: mockClasses,
        activeYear: 2026,
        activeTerm: 'Term 3',
      });
      expect(latest?.id).toBe('ex_up_mt_2026_t3');
      expect(latest?.exam_name).toBe('Upper Primary Mid-Term Assessment');
    });

    it('returns truthful latest assessment when filtered to Lower Primary', () => {
      const latest = getLatestAssessment(allExams, {
        levelFilter: 'Lower Primary',
        gradeFilter: 'all',
        classes: mockClasses,
        activeYear: 2026,
        activeTerm: 'Term 3',
      });
      expect(latest?.id).toBe('ex_lp_op_2026_t3');
      expect(latest?.exam_name).toBe('Lower Primary Opener Assessment');
    });

    it('returns truthful latest assessment when filtered to Grade 9 specifically', () => {
      const latest = getLatestAssessment(allExams, {
        levelFilter: 'Junior School',
        gradeFilter: 'Grade 9',
        classes: mockClasses,
        activeYear: 2026,
        activeTerm: 'Term 3',
      });
      expect(latest?.id).toBe('ex_g9_op_2026_t3');
    });

    it('returns null when filtered to Pre-Primary where no 2026 exam exists (and 2025 was not PP)', () => {
      const latest = getLatestAssessment([examG9Opener2026, examUPMidTerm2026], {
        levelFilter: 'Pre-Primary',
        gradeFilter: 'all',
        classes: mockClasses,
        activeYear: 2026,
        activeTerm: 'Term 3',
      });
      expect(latest).toBeNull();
    });
  });

  describe('getLatestAssessment for Learner Portal & Teacher Dashboard', () => {
    const allExams = [examSchoolWide2025, examG9Opener2026, examUPMidTerm2026, examLPOpener2026, examG8MidTerm2026];

    it('returns Grade 4 learner assessment (Upper Primary)', () => {
      const grade4Student = {
        id: 'std_g4_1',
        admission_number: 'ADM-G4-1',
        full_name: 'JOHN G4',
        gender: 'M',
        grade: 'Grade 4',
        class_id: 'c_g4_a',
        stream_id: 's_g4_a',
        education_level: 'Upper Primary',
        active: true,
      } as Student;

      const latest = getLatestAssessment(allExams, {
        student: grade4Student,
        classes: mockClasses,
        activeYear: 2026,
        activeTerm: 'Term 3',
      });

      expect(latest?.id).toBe('ex_up_mt_2026_t3');
      expect(latest?.education_level).toBe('Upper Primary');
    });

    it('returns Grade 8 Class Teacher assessment', () => {
      const grade8Teacher = {
        id: 'tr_g8',
        teacher_name: 'TR GRADE 8',
        email: 'tr8@school.com',
        phone: '0700000000',
        is_class_teacher: true,
        class_teacher_of_id: 's_g8_e',
        allocations: [],
      } as Teacher;

      const latest = getLatestAssessment(allExams, {
        teacher: grade8Teacher,
        classes: mockClasses,
        activeYear: 2026,
        activeTerm: 'Term 3',
      });

      expect(latest?.id).toBe('ex_g8_mt_2026_t3');
    });
  });

  describe('getLatestAssessmentsByEducationLevel', () => {
    it('returns map with each education level resolved accurately', () => {
      const allExams = [examG9Opener2026, examUPMidTerm2026, examLPOpener2026];
      const map = getLatestAssessmentsByEducationLevel(allExams, mockClasses, 2026, 'Term 3');

      expect(map['Junior School']?.id).toBe('ex_g9_op_2026_t3');
      expect(map['Upper Primary']?.id).toBe('ex_up_mt_2026_t3');
      expect(map['Lower Primary']?.id).toBe('ex_lp_op_2026_t3');
      expect(map['Pre-Primary']).toBeNull();
    });
  });

  describe('getActiveKeyingAssessments', () => {
    it('detects and returns ALL exams currently being keyed (even when there are two or more)', () => {
      const activeExams = [examG9Opener2026, examUPMidTerm2026, examLPOpener2026, examG8MidTerm2026];
      const activeKeying = getActiveKeyingAssessments(activeExams, {
        levelFilter: 'all',
        classes: mockClasses,
        activeYear: 2026,
        activeTerm: 'Term 3',
      });

      // Should return all open/provisional exams currently undergoing marks keying
      expect(activeKeying.length).toBeGreaterThanOrEqual(2);
      const ids = activeKeying.map((e) => e.id);
      expect(ids).toContain('ex_g9_op_2026_t3');
      expect(ids).toContain('ex_up_mt_2026_t3');
    });

    it('filters active keying exams strictly when level filter is specified', () => {
      const activeExams = [examG9Opener2026, examUPMidTerm2026, examLPOpener2026];
      const activeJS = getActiveKeyingAssessments(activeExams, {
        levelFilter: 'Junior School',
        classes: mockClasses,
        activeYear: 2026,
        activeTerm: 'Term 3',
      });

      expect(activeJS.length).toBe(1);
      expect(activeJS[0].id).toBe('ex_g9_op_2026_t3');
    });
  });
});
