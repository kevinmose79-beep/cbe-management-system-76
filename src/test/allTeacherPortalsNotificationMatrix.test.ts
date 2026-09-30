import { describe, it, expect } from 'vitest';
import { computeTeacherExamReminder } from '../utils/teacherExamReminderUtils';
import { Teacher, Examination, ClassStream, Subject, Student, Mark } from '../types';

describe('All Teacher Portals Notification Matrix & RBAC Isolation Verification', () => {
  // 1. Classes across levels
  const mockClasses: ClassStream[] = [
    { id: 'cls_pp1', stream_id: 'str_pp1_a', class_name: 'PP1', stream: 'A', education_level: 'Pre-Primary' },
    { id: 'cls_g1', stream_id: 'str_g1_a', class_name: 'Grade 1', stream: 'A', education_level: 'Lower Primary' },
    { id: 'cls_g6', stream_id: 'str_g6_blue', class_name: 'Grade 6', stream: 'Blue', education_level: 'Upper Primary' },
    { id: 'cls_g7', stream_id: 'str_g7_red', class_name: 'Grade 7', stream: 'Red', education_level: 'Junior School' },
    { id: 'cls_g8', stream_id: 'str_g8_blue', class_name: 'Grade 8', stream: 'Blue', education_level: 'Junior School' },
    { id: 'cls_g9', stream_id: 'str_g9_gold', class_name: 'Grade 9', stream: 'Gold', education_level: 'Junior School' },
  ];

  // 2. Subjects
  const mockSubjects: Subject[] = [
    { id: 'sb_pp_lang', subject_name: 'Language Activities', subject_code: 'LANG', category: 'Core', education_level: 'Pre-Primary' },
    { id: 'sb_lp_lit', subject_name: 'Literacy Activities', subject_code: 'LIT', category: 'Core', education_level: 'Lower Primary' },
    { id: 'sb_up_eng', subject_name: 'English', subject_code: 'ENG', category: 'Core', education_level: 'Upper Primary' },
    { id: 'sb_js_math', subject_name: 'Mathematics', subject_code: 'MATH', category: 'Core', education_level: 'Junior School' },
    { id: 'sb_js_eng', subject_name: 'English', subject_code: 'ENG', category: 'Core', education_level: 'Junior School' },
  ];

  // 3. Students
  const mockStudents: Student[] = [
    { id: 'std_pp1_1', admission_number: 'PP001', full_name: 'Learner PP1', grade: 'PP1', class_id: 'cls_pp1', stream_id: 'str_pp1_a', gender: 'F', active: true },
    { id: 'std_g1_1', admission_number: 'G1001', full_name: 'Learner G1', grade: 'Grade 1', class_id: 'cls_g1', stream_id: 'str_g1_a', gender: 'M', active: true },
    { id: 'std_g6_1', admission_number: 'G6001', full_name: 'Learner G6', grade: 'Grade 6', class_id: 'cls_g6', stream_id: 'str_g6_blue', gender: 'F', active: true },
    { id: 'std_g7_1', admission_number: 'G7001', full_name: 'Learner G7', grade: 'Grade 7', class_id: 'cls_g7', stream_id: 'str_g7_red', gender: 'M', active: true },
    { id: 'std_g8_1', admission_number: 'G8001', full_name: 'Learner G8', grade: 'Grade 8', class_id: 'cls_g8', stream_id: 'str_g8_blue', gender: 'F', active: true },
    { id: 'std_g9_1', admission_number: 'G9001', full_name: 'Learner G9', grade: 'Grade 9', class_id: 'cls_g9', stream_id: 'str_g9_gold', gender: 'M', active: true },
  ];

  // 4. Exams
  const examG6Concluded: Examination = {
    id: 'ex_g6_t3_2026',
    exam_name: 'Grade 6 Opener Assessment Term 3 2026',
    term: 'Term 3',
    year: 2026,
    academic_year: '2026',
    education_level: 'Upper Primary',
    applicable_grades: ['Grade 6'],
    status: 'Approved',
    exam_type: 'Opener',
    max_marks: 100,
  };

  const examG7Active: Examination = {
    id: 'ex_g7_t3_2026',
    exam_name: 'Grade 7 Mid Term Assessment Term 3 2026',
    term: 'Term 3',
    year: 2026,
    academic_year: '2026',
    education_level: 'Junior School',
    applicable_grades: ['Grade 7'],
    status: 'Provisional',
    exam_type: 'Opener',
    max_marks: 100,
  };

  const examPP1Active: Examination = {
    id: 'ex_pp1_t3_2026',
    exam_name: 'PP1 Assessment Term 3 2026',
    term: 'Term 3',
    year: 2026,
    academic_year: '2026',
    education_level: 'Pre-Primary',
    applicable_grades: ['PP1'],
    status: 'Draft',
    exam_type: 'Opener',
    max_marks: 100,
  };

  // --------------------------------------------------------------------------
  // TEST 1: Grade 8 Teacher with ONLY Grade 6 Concluded Exam in DB
  // --------------------------------------------------------------------------
  it('Portal 1 (Grade 8 Class Teacher): Suppresses notification when only Grade 6 exam is in database', () => {
    const brianTeacher: Teacher = {
      id: 'tch_brian',
      teacher_name: 'Brian Omondi',
      email: 'brian@school.com',
      phone: '0711000000',
      is_class_teacher: true,
      class_teacher_of_id: 'str_g8_blue',
      allocations: [
        { id: 'al_1', subject_id: 'sb_js_eng', class_id: 'cls_g8', stream_id: 'str_g8_blue', class_name: 'Grade 8', stream: 'Blue', education_level: 'Junior School' },
      ],
    };

    const reminder = computeTeacherExamReminder({
      teacher: brianTeacher,
      exams: [examG6Concluded],
      classes: mockClasses,
      subjects: mockSubjects,
      students: mockStudents,
      marks: [],
      activeYear: { year: 2026 } as any,
      activeTerm: { term_name: 'Term 3' } as any,
    });

    expect(reminder.hasActiveExam).toBe(false);
    expect(reminder.reminderPriority).toBe('none');
  });

  // --------------------------------------------------------------------------
  // TEST 2: Grade 6 Class Teacher with Grade 6 Concluded Exam
  // --------------------------------------------------------------------------
  it('Portal 2 (Grade 6 Class Teacher): Shows "Examination Concluded" for own Grade 6 exam', () => {
    const grade6Teacher: Teacher = {
      id: 'tch_g6',
      teacher_name: 'Mrs. Chebet',
      email: 'chebet@school.com',
      phone: '0722000000',
      is_class_teacher: true,
      class_teacher_of_id: 'str_g6_blue',
      allocations: [
        { id: 'al_g6', subject_id: 'sb_up_eng', class_id: 'cls_g6', stream_id: 'str_g6_blue', class_name: 'Grade 6', stream: 'Blue', education_level: 'Upper Primary' },
      ],
    };

    const reminder = computeTeacherExamReminder({
      teacher: grade6Teacher,
      exams: [examG6Concluded],
      classes: mockClasses,
      subjects: mockSubjects,
      students: mockStudents,
      marks: [],
      activeYear: { year: 2026 } as any,
      activeTerm: { term_name: 'Term 3' } as any,
    });

    expect(reminder.hasActiveExam).toBe(true);
    expect(reminder.title).toBe('Examination Concluded');
    expect(reminder.badgeLabel).toBe('Results Released');
    expect(reminder.primaryAction).toBe('view_reports');
  });

  // --------------------------------------------------------------------------
  // TEST 3: Grade 7 Subject Teacher with Missing Marks
  // --------------------------------------------------------------------------
  it('Portal 3 (Grade 7 Subject Teacher): Shows "Marks Entry Required" with actionable enter_marks navigation', () => {
    const grade7SubjectTeacher: Teacher = {
      id: 'tch_g7_math',
      teacher_name: 'Mr. Korir',
      email: 'korir@school.com',
      phone: '0733000000',
      is_class_teacher: false,
      allocations: [
        { id: 'al_g7_math', subject_id: 'sb_js_math', class_id: 'cls_g7', stream_id: 'str_g7_red', class_name: 'Grade 7', stream: 'Red', education_level: 'Junior School' },
      ],
    };

    const reminder = computeTeacherExamReminder({
      teacher: grade7SubjectTeacher,
      exams: [examG7Active, examG6Concluded],
      classes: mockClasses,
      subjects: mockSubjects,
      students: mockStudents,
      marks: [], // 0 marks entered -> missing
      activeYear: { year: 2026 } as any,
      activeTerm: { term_name: 'Term 3' } as any,
    });

    expect(reminder.hasActiveExam).toBe(true);
    expect(reminder.badgeType).toBe('urgent');
    expect(reminder.badgeLabel).toBe('Action Required');
    expect(reminder.primaryAction).toBe('enter_marks');
    expect(reminder.primaryActionContext?.subjectId).toBe('sb_js_math');
    expect(reminder.primaryActionContext?.streamId).toBe('str_g7_red');
  });

  // --------------------------------------------------------------------------
  // TEST 4: Grade 7 Subject Teacher with 100% Marks Entered
  // --------------------------------------------------------------------------
  it('Portal 4 (Grade 7 Subject Teacher): Shows "Marks Entry Complete" when all allocated marks are in', () => {
    const grade7SubjectTeacher: Teacher = {
      id: 'tch_g7_math',
      teacher_name: 'Mr. Korir',
      email: 'korir@school.com',
      phone: '0733000000',
      is_class_teacher: false,
      allocations: [
        { id: 'al_g7_math', subject_id: 'sb_js_math', class_id: 'cls_g7', stream_id: 'str_g7_red', class_name: 'Grade 7', stream: 'Red', education_level: 'Junior School' },
      ],
    };

    const marksComplete: Mark[] = [
      {
        id: 'm_1',
        exam_id: 'ex_g7_t3_2026',
        student_id: 'std_g7_1',
        subject_id: 'sb_js_math',
        raw_score: 82,
        out_of: 100,
        percentage: 82,
      },
    ];

    const reminder = computeTeacherExamReminder({
      teacher: grade7SubjectTeacher,
      exams: [examG7Active],
      classes: mockClasses,
      subjects: mockSubjects,
      students: mockStudents,
      marks: marksComplete,
      activeYear: { year: 2026 } as any,
      activeTerm: { term_name: 'Term 3' } as any,
    });

    expect(reminder.hasActiveExam).toBe(true);
    expect(reminder.title).toBe('Your Examination Marks Are Complete');
    expect(reminder.badgeType).toBe('success');
    expect(reminder.primaryAction).toBe('none');
  });

  // --------------------------------------------------------------------------
  // TEST 5: Pre-Primary Teacher with Active PP1 Exam
  // --------------------------------------------------------------------------
  it('Portal 5 (PP1 Class Teacher): Isolated to PP1 and does not receive Junior School or Upper Primary notifications', () => {
    const examPP1Provisional: Examination = {
      id: 'ex_pp1_t3_2026',
      exam_name: 'PP1 Assessment Term 3 2026',
      term: 'Term 3',
      year: 2026,
      academic_year: '2026',
      education_level: 'Pre-Primary',
      applicable_grades: ['PP1'],
      status: 'Provisional',
      exam_type: 'Opener',
      max_marks: 100,
    };

    const pp1Teacher: Teacher = {
      id: 'tch_pp1',
      teacher_name: 'Teacher Rose',
      email: 'rose@school.com',
      phone: '0744000000',
      is_class_teacher: true,
      class_teacher_of_id: 'str_pp1_a',
      allocations: [
        { id: 'al_pp1', subject_id: 'sb_pp_lang', class_id: 'cls_pp1', stream_id: 'str_pp1_a', class_name: 'PP1', stream: 'A', education_level: 'Pre-Primary' },
      ],
    };

    const reminder = computeTeacherExamReminder({
      teacher: pp1Teacher,
      exams: [examPP1Provisional, examG7Active, examG6Concluded],
      classes: mockClasses,
      subjects: mockSubjects,
      students: mockStudents,
      marks: [],
      activeYear: { year: 2026 } as any,
      activeTerm: { term_name: 'Term 3' } as any,
    });

    expect(reminder.hasActiveExam).toBe(true);
    expect(reminder.primaryActionContext?.examId).toBe('ex_pp1_t3_2026');
  });
});
