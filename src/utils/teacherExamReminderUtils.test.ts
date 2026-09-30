import { describe, it, expect } from 'vitest';
import {
  Examination,
  Teacher,
  ClassStream,
  Subject,
  Student,
  Mark,
  User,
} from '../types';
import {
  computeTeacherExamReminder,
  resolveActiveExamination,
  isExamApplicableToClassStream,
} from './teacherExamReminderUtils';

describe('Intelligent Teacher Examination Reminders (Deterministic Pure Logic)', () => {
  // Common Mock Fixtures
  const mockExamOpen: Examination = {
    id: 'exam-open-uuid',
    exam_name: 'Term 2 End Term Assessment',
    exam_type: 'End-Term',
    year: 2026,
    term: 'Term 2',
    status: 'Open',
    max_marks: 100,
    academic_year_id: 'ay-2026',
    term_id: 'term-2',
    approved_classes: [],
    approved_levels: [],
  };

  const mockExamApproved: Examination = {
    id: 'exam-approved-uuid',
    exam_name: 'Term 1 End Term Assessment',
    exam_type: 'End-Term',
    year: 2026,
    term: 'Term 1',
    status: 'Approved',
    max_marks: 100,
    academic_year_id: 'ay-2026',
    term_id: 'term-1',
    approved_classes: ['stream-g7e', 'stream-g7w'],
    approved_levels: ['Junior School'],
  };

  const mockExamDraft: Examination = {
    id: 'exam-draft-uuid',
    exam_name: 'Term 3 Mock Assessment',
    exam_type: 'Mid-Term',
    year: 2026,
    term: 'Term 3',
    status: 'Draft',
    max_marks: 100,
    academic_year_id: 'ay-2026',
    term_id: 'term-3',
    approved_classes: [],
  };

  const mockClassGrade7East: ClassStream = {
    id: 'class-g7',
    stream_id: 'stream-g7e',
    class_name: 'Grade 7',
    stream: 'East',
    education_level: 'Junior School',
    status: 'Active',
    class_teacher_id: 'teacher-class-uuid',
  };

  const mockClassGrade7West: ClassStream = {
    id: 'class-g7-w',
    stream_id: 'stream-g7w',
    class_name: 'Grade 7',
    stream: 'West',
    education_level: 'Junior School',
    status: 'Active',
    class_teacher_id: 'other-class-teacher-uuid',
  };

  const mockMathSubject: Subject = {
    id: 'subj-math',
    subject_name: 'Mathematics',
    subject_code: 'MATH-JS',
    education_level: 'Junior School',
    category: 'Core',
  };

  const mockEnglishSubject: Subject = {
    id: 'subj-eng',
    subject_name: 'English Language',
    subject_code: 'ENG-JS',
    education_level: 'Junior School',
    category: 'Core',
  };

  const mockKiswahiliSubject: Subject = {
    id: 'subj-kisw',
    subject_name: 'Kiswahili Language',
    subject_code: 'KISW-JS',
    education_level: 'Junior School',
    category: 'Core',
  };

  const allSubjects = [mockMathSubject, mockEnglishSubject, mockKiswahiliSubject];
  const allClasses = [mockClassGrade7East, mockClassGrade7West];

  const student1: Student = {
    id: 'std-1',
    admission_number: 'ADM001',
    first_name: 'John',
    last_name: 'Doe',
    full_name: 'John Doe',
    gender: 'M',
    class_id: 'class-g7',
    stream_id: 'stream-g7e',
    active: true,
  };

  const student2: Student = {
    id: 'std-2',
    admission_number: 'ADM002',
    first_name: 'Jane',
    last_name: 'Smith',
    full_name: 'Jane Smith',
    gender: 'F',
    class_id: 'class-g7',
    stream_id: 'stream-g7e',
    active: true,
  };

  const studentWest1: Student = {
    id: 'std-w1',
    admission_number: 'ADM003',
    first_name: 'Alice',
    last_name: 'Wonder',
    full_name: 'Alice Wonder',
    gender: 'F',
    class_id: 'class-g7-w',
    stream_id: 'stream-g7w',
    active: true,
  };

  const allStudents = [student1, student2, studentWest1];

  // Teachers
  const pureSubjectTeacher: Teacher = {
    id: 'teacher-subj-uuid',
    teacher_name: 'Mr. Mwangi',
    email: 'mwangi@example.com',
    phone: '0712345678',
    is_class_teacher: false,
    allocations: [
      {
        id: 'alloc-1',
        class_id: 'class-g7',
        class_name: 'Grade 7',
        stream_id: 'stream-g7e',
        stream: 'East',
        subject_id: 'subj-math',
        subject_name: 'Mathematics',
        education_level: 'Junior School',
      },
    ],
  };

  const pureClassTeacher: Teacher = {
    id: 'teacher-class-uuid',
    teacher_name: 'Mrs. Akinyi',
    email: 'akinyi@example.com',
    phone: '0723456789',
    is_class_teacher: true,
    class_teacher_of_id: 'stream-g7e',
    allocations: [],
  };

  const dualRoleTeacher: Teacher = {
    id: 'teacher-dual-uuid',
    teacher_name: 'Mr. Omondi',
    email: 'omondi@example.com',
    phone: '0734567890',
    is_class_teacher: true,
    class_teacher_of_id: 'stream-g7e',
    allocations: [
      {
        id: 'alloc-2',
        class_id: 'class-g7',
        class_name: 'Grade 7',
        stream_id: 'stream-g7e',
        stream: 'East',
        subject_id: 'subj-math',
        subject_name: 'Mathematics',
        education_level: 'Junior School',
      },
    ],
  };

  const otherTeacher: Teacher = {
    id: 'teacher-other-uuid',
    teacher_name: 'Mr. Kamau',
    email: 'kamau@example.com',
    phone: '0745678901',
    is_class_teacher: false,
    allocations: [
      {
        id: 'alloc-3',
        class_id: 'class-g7-w',
        class_name: 'Grade 7',
        stream_id: 'stream-g7w',
        stream: 'West',
        subject_id: 'subj-eng',
        subject_name: 'English Language',
        education_level: 'Junior School',
      },
    ],
  };

  // -------------------------------------------------------------------------
  // TEST 1: No active examination -> no actionable reminder
  // -------------------------------------------------------------------------
  it('1. Returns neutral response with no active examination or draft examination', () => {
    const reminderEmpty = computeTeacherExamReminder({
      teacher: pureSubjectTeacher,
      exams: [],
      classes: allClasses,
      subjects: allSubjects,
      students: allStudents,
      marks: [],
    });

    expect(reminderEmpty.hasActiveExam).toBe(false);
    expect(reminderEmpty.primaryAction).toBe('none');
    expect(reminderEmpty.isRequired).toBe(false);

    const reminderDraft = computeTeacherExamReminder({
      teacher: pureSubjectTeacher,
      exams: [mockExamDraft],
      classes: allClasses,
      subjects: allSubjects,
      students: allStudents,
      marks: [],
      activeYear: { year: 2026 },
      activeTerm: { term_name: 'Term 3', status: 'Upcoming' },
    });

    expect(reminderDraft.hasActiveExam).toBe(true);
    expect(reminderDraft.primaryAction).toBe('none');
    expect(reminderDraft.isRequired).toBe(false);
    expect(reminderDraft.title).toContain('Draft');
  });

  // -------------------------------------------------------------------------
  // TEST 2: Subject teacher with missing marks -> Marks Entry Required
  // -------------------------------------------------------------------------
  it('2. Evaluates Subject Teacher with missing marks and provides "Marks Entry Required" with context', () => {
    // Only student1 has a mark for Math, student2 has none
    const partialMarks: Mark[] = [
      {
        id: 'mark-1',
        exam_id: mockExamOpen.id,
        student_id: student1.id,
        subject_id: mockMathSubject.id,
        marks: 75,
      },
    ];

    const reminder = computeTeacherExamReminder({
      teacher: pureSubjectTeacher,
      exams: [mockExamOpen],
      classes: allClasses,
      subjects: allSubjects,
      students: allStudents,
      marks: partialMarks,
      activeYear: { year: 2026 },
      activeTerm: { term_name: 'Term 2', status: 'Active' },
    });

    expect(reminder.hasActiveExam).toBe(true);
    expect(reminder.teacherRole).toBe('subject_teacher');
    expect(reminder.reminderPriority).toBe('action_required');
    expect(reminder.badgeType).toBe('urgent');
    expect(reminder.title).toBe('Marks Entry Required');
    expect(reminder.headline).toContain('1 examination mark');
    expect(reminder.isRequired).toBe(true);
    expect(reminder.primaryAction).toBe('enter_marks');
    expect(reminder.primaryActionTab).toBe('marks-entry');
    expect(reminder.primaryActionContext?.subjectId).toBe(mockMathSubject.id);
    expect(reminder.subjectTeacherSummary?.totalMissingMarks).toBe(1);
    expect(reminder.subjectTeacherSummary?.completedAllocations).toBe(0);
  });

  // -------------------------------------------------------------------------
  // TEST 3: Subject teacher with complete marks -> Informational Complete State
  // -------------------------------------------------------------------------
  it('3. Evaluates Subject Teacher with 100% marks entered as informational complete state', () => {
    // Both student1 and student2 have marks for Math
    const completeMarks: Mark[] = [
      {
        id: 'mark-1',
        exam_id: mockExamOpen.id,
        student_id: student1.id,
        subject_id: mockMathSubject.id,
        marks: 80,
      },
      {
        id: 'mark-2',
        exam_id: mockExamOpen.id,
        student_id: student2.id,
        subject_id: mockMathSubject.id,
        marks: 0,
        special_status: 'X', // Absent mark is still a valid evaluated entry
      },
    ];

    const reminder = computeTeacherExamReminder({
      teacher: pureSubjectTeacher,
      exams: [mockExamOpen],
      classes: allClasses,
      subjects: allSubjects,
      students: allStudents,
      marks: completeMarks,
      activeYear: { year: 2026 },
      activeTerm: { term_name: 'Term 2', status: 'Active' },
    });

    expect(reminder.hasActiveExam).toBe(true);
    expect(reminder.reminderPriority).toBe('completed');
    expect(reminder.badgeType).toBe('success');
    expect(reminder.title).toBe('Your Examination Marks Are Complete');
    expect(reminder.isRequired).toBe(false);
    expect(reminder.primaryAction).toBe('none');
    expect(reminder.subjectTeacherSummary?.totalMissingMarks).toBe(0);
    expect(reminder.subjectTeacherSummary?.completedAllocations).toBe(1);
  });

  // -------------------------------------------------------------------------
  // TEST 4: Class teacher with missing subject marks -> Marks Monitoring
  // -------------------------------------------------------------------------
  it('4. Evaluates Class Teacher with incomplete stream subjects as "Examination Marks Need Attention"', () => {
    // Grade 7 East has missing marks in English and Kiswahili
    const mathOnlyMarks: Mark[] = [
      {
        id: 'mark-1',
        exam_id: mockExamOpen.id,
        student_id: student1.id,
        subject_id: mockMathSubject.id,
        marks: 80,
      },
      {
        id: 'mark-2',
        exam_id: mockExamOpen.id,
        student_id: student2.id,
        subject_id: mockMathSubject.id,
        marks: 70,
      },
    ];

    const reminder = computeTeacherExamReminder({
      teacher: pureClassTeacher,
      exams: [mockExamOpen],
      classes: allClasses,
      subjects: allSubjects,
      students: allStudents,
      marks: mathOnlyMarks,
      activeYear: { year: 2026 },
      activeTerm: { term_name: 'Term 2', status: 'Active' },
    });

    expect(reminder.hasActiveExam).toBe(true);
    expect(reminder.teacherRole).toBe('class_teacher');
    expect(reminder.reminderPriority).toBe('attention_needed');
    expect(reminder.badgeType).toBe('warning');
    expect(reminder.title).toBe('Examination Marks Need Attention');
    expect(reminder.primaryAction).toBe('view_monitoring');
    expect(reminder.primaryActionTab).toBe('class-marks-monitoring');
    expect(reminder.classTeacherSummary?.totalMissingMarks).toBeGreaterThan(0);
    expect(reminder.classTeacherSummary?.isStreamReadyForApproval).toBe(false);
  });

  // -------------------------------------------------------------------------
  // TEST 5: Class teacher with complete marks and unapproved stream -> Stream Approval
  // -------------------------------------------------------------------------
  it('5. Evaluates Class Teacher with 100% stream marks complete as "Ready for Stream Approval"', () => {
    // All 3 subjects for both Grade 7 East students are entered
    const allStreamMarks: Mark[] = [
      { id: 'm1', exam_id: mockExamOpen.id, student_id: student1.id, subject_id: mockMathSubject.id, marks: 80 },
      { id: 'm2', exam_id: mockExamOpen.id, student_id: student2.id, subject_id: mockMathSubject.id, marks: 70 },
      { id: 'm3', exam_id: mockExamOpen.id, student_id: student1.id, subject_id: mockEnglishSubject.id, marks: 85 },
      { id: 'm4', exam_id: mockExamOpen.id, student_id: student2.id, subject_id: mockEnglishSubject.id, marks: 65 },
      { id: 'm5', exam_id: mockExamOpen.id, student_id: student1.id, subject_id: mockKiswahiliSubject.id, marks: 90 },
      { id: 'm6', exam_id: mockExamOpen.id, student_id: student2.id, subject_id: mockKiswahiliSubject.id, marks: 88 },
    ];

    const reminder = computeTeacherExamReminder({
      teacher: pureClassTeacher,
      exams: [mockExamOpen],
      classes: allClasses,
      subjects: allSubjects,
      students: allStudents,
      marks: allStreamMarks,
      activeYear: { year: 2026 },
      activeTerm: { term_name: 'Term 2', status: 'Active' },
    });

    expect(reminder.hasActiveExam).toBe(true);
    expect(reminder.reminderPriority).toBe('ready_for_approval');
    expect(reminder.badgeType).toBe('urgent');
    expect(reminder.title).toBe('Ready for Stream Approval');
    expect(reminder.isRequired).toBe(true);
    expect(reminder.primaryAction).toBe('stream_approval');
    expect(reminder.primaryActionTab).toBe('stream-approval');
    expect(reminder.classTeacherSummary?.isStreamReadyForApproval).toBe(true);
  });

  // -------------------------------------------------------------------------
  // TEST 6: Class teacher with approved stream -> Informational Approved State
  // -------------------------------------------------------------------------
  it('6. Evaluates Class Teacher with already approved stream as informational "Stream Approved"', () => {
    const examWithApprovedStream: Examination = {
      ...mockExamOpen,
      approved_classes: ['stream-g7e'],
    };

    const reminder = computeTeacherExamReminder({
      teacher: pureClassTeacher,
      exams: [examWithApprovedStream],
      classes: allClasses,
      subjects: allSubjects,
      students: allStudents,
      marks: [],
      activeYear: { year: 2026 },
      activeTerm: { term_name: 'Term 2', status: 'Active' },
    });

    expect(reminder.hasActiveExam).toBe(true);
    expect(reminder.reminderPriority).toBe('completed');
    expect(reminder.badgeType).toBe('success');
    expect(reminder.title).toBe('Stream Approved');
    expect(reminder.isRequired).toBe(false);
    expect(reminder.primaryAction).toBe('view_reports');
    expect(reminder.classTeacherSummary?.isStreamApproved).toBe(true);
  });

  // -------------------------------------------------------------------------
  // TEST 7: Dual-role teacher -> Actionable marks entry prioritized correctly
  // -------------------------------------------------------------------------
  it('7. Dual-role teacher prioritizes own missing marks first, while preserving stream context in secondary note', () => {
    // Dual role teacher has 1 missing mark in their own Math subject, plus English is missing in stream
    const partialMarks: Mark[] = [
      { id: 'm1', exam_id: mockExamOpen.id, student_id: student1.id, subject_id: mockMathSubject.id, marks: 80 },
      // student2 has no Math mark -> 1 missing for dual teacher
    ];

    const reminder = computeTeacherExamReminder({
      teacher: dualRoleTeacher,
      exams: [mockExamOpen],
      classes: allClasses,
      subjects: allSubjects,
      students: allStudents,
      marks: partialMarks,
      activeYear: { year: 2026 },
      activeTerm: { term_name: 'Term 2', status: 'Active' },
    });

    expect(reminder.teacherRole).toBe('dual_role');
    expect(reminder.reminderPriority).toBe('action_required');
    expect(reminder.title).toBe('Marks Entry Required');
    expect(reminder.primaryAction).toBe('enter_marks');
    expect(reminder.secondaryNote).toBeDefined();
    expect(reminder.secondaryNote).toContain('missing marks');
  });

  // -------------------------------------------------------------------------
  // TEST 8: Approved/published examination -> Class Teacher receives "Examination Completed" with reports action
  // -------------------------------------------------------------------------
  it('8. Approved or published examination returns informational "Examination Concluded" for Class Teacher', () => {
    const reminder = computeTeacherExamReminder({
      teacher: pureClassTeacher,
      exams: [mockExamApproved],
      classes: allClasses,
      subjects: allSubjects,
      students: allStudents,
      marks: [],
      activeYear: { year: 2026 },
      activeTerm: { term_name: 'Term 1', status: 'Closed' },
    });

    expect(reminder.hasActiveExam).toBe(true);
    expect(reminder.isExamLockedOrApproved).toBe(true);
    expect(reminder.reminderPriority).toBe('completed');
    expect(reminder.title).toBe('Examination Concluded');
    expect(reminder.isRequired).toBe(false);
    expect(reminder.primaryAction).toBe('view_reports');

    // Pure subject teacher who is NOT a class teacher must NOT receive the class reports banner
    const subjectTeacherReminder = computeTeacherExamReminder({
      teacher: pureSubjectTeacher,
      exams: [mockExamApproved],
      classes: allClasses,
      subjects: allSubjects,
      students: allStudents,
      marks: [],
      activeYear: { year: 2026 },
      activeTerm: { term_name: 'Term 1', status: 'Closed' },
    });
    expect(subjectTeacherReminder.primaryAction).toBe('none');
    expect(subjectTeacherReminder.reminderPriority).toBe('none');
  });

  // -------------------------------------------------------------------------
  // TEST 9: Teacher cannot receive another teacher's allocation information
  // -------------------------------------------------------------------------
  it('9. Strict Privacy / RBAC: Teacher does not see missing marks for streams/subjects they are not allocated to', () => {
    // Pure subject teacher is only allocated to Math in Grade 7 East.
    // Grade 7 West has missing marks in English.
    const reminder = computeTeacherExamReminder({
      teacher: pureSubjectTeacher,
      exams: [mockExamOpen],
      classes: allClasses,
      subjects: allSubjects,
      students: allStudents,
      marks: [
        { id: 'm1', exam_id: mockExamOpen.id, student_id: student1.id, subject_id: mockMathSubject.id, marks: 80 },
        { id: 'm2', exam_id: mockExamOpen.id, student_id: student2.id, subject_id: mockMathSubject.id, marks: 85 },
      ],
    });

    // Their own allocations (Math in 7 East) are 100% complete
    expect(reminder.subjectTeacherSummary?.totalMissingMarks).toBe(0);
    expect(reminder.title).toBe('Your Examination Marks Are Complete');
    // They should not have any class summary for Grade 7 West
    expect(reminder.classTeacherSummary).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // TEST 10: Teacher cannot receive another class teacher's approval responsibility
  // -------------------------------------------------------------------------
  it('10. Strict Privacy / RBAC: Class teacher for Grade 7 East does not receive approval responsibility for Grade 7 West', () => {
    const reminder = computeTeacherExamReminder({
      teacher: pureClassTeacher, // Class teacher for Grade 7 East
      exams: [mockExamOpen],
      classes: allClasses,
      subjects: allSubjects,
      students: allStudents,
      marks: [],
    });

    expect(reminder.classTeacherSummary?.primaryClass.stream_id).toBe('stream-g7e');
    expect(reminder.classTeacherSummary?.primaryClass.stream_id).not.toBe('stream-g7w');
  });

  // -------------------------------------------------------------------------
  // TEST 11: Undefined/empty data does not produce a false actionable reminder
  // -------------------------------------------------------------------------
  it('11. Gracefully handles undefined/null teacher and empty arrays without throwing or false urgency', () => {
    const reminderNull = computeTeacherExamReminder({
      teacher: null,
      exams: [],
      classes: [],
      subjects: [],
      students: [],
      marks: [],
    });

    expect(reminderNull.hasActiveExam).toBe(false);
    expect(reminderNull.primaryAction).toBe('none');
    expect(reminderNull.isRequired).toBe(false);
  });

  // -------------------------------------------------------------------------
  // TEST 12: Existing examination status values remain untouched
  // -------------------------------------------------------------------------
  it('12. Preserves existing examination status values without mutation', () => {
    const examClone = { ...mockExamOpen };
    const reminder = computeTeacherExamReminder({
      teacher: pureSubjectTeacher,
      exams: [examClone],
      classes: allClasses,
      subjects: allSubjects,
      students: allStudents,
      marks: [],
    });

    expect(examClone.status).toBe('Open');
    expect(examClone.approved_classes).toEqual([]);
    expect(reminder.activeExam?.status).toBe('Open');
  });

  // -------------------------------------------------------------------------
  // TEST 13: Semantic Bell & Notification Style Architecture
  // -------------------------------------------------------------------------
  it('13. Semantic Bell Colors & Card Tokens match state-driven visual specification', async () => {
    const { getSemanticNotificationStyles } = await import(
      '../components/TeacherExamReminderBanner'
    );

    // 1. Urgent / Action Required (Amber)
    const urgentStyles = getSemanticNotificationStyles('urgent');
    expect(urgentStyles.container).toContain('bg-amber-50');
    expect(urgentStyles.container).toContain('border-amber-300');
    expect(urgentStyles.iconBg).toContain('bg-amber-500');
    expect(urgentStyles.iconBg).toContain('text-white');
    expect(urgentStyles.badge).toContain('bg-amber-200');
    expect(urgentStyles.btn).toContain('bg-amber-600');

    // 2. Warning / Attention Needed (Orange)
    const warningStyles = getSemanticNotificationStyles('warning');
    expect(warningStyles.container).toContain('bg-orange-50');
    expect(warningStyles.container).toContain('border-orange-300');
    expect(warningStyles.iconBg).toContain('bg-orange-500');
    expect(warningStyles.iconBg).toContain('text-white');
    expect(warningStyles.badge).toContain('bg-orange-200');
    expect(warningStyles.btn).toContain('bg-orange-600');

    // 3. Success / Completed (Emerald/Green)
    const successStyles = getSemanticNotificationStyles('success');
    expect(successStyles.container).toContain('bg-emerald-50');
    expect(successStyles.container).toContain('border-emerald-300');
    expect(successStyles.iconBg).toContain('bg-[#176B45]');
    expect(successStyles.iconBg).toContain('text-white');
    expect(successStyles.badge).toContain('bg-emerald-200');
    expect(successStyles.btn).toContain('bg-[#176B45]');

    // 4. Critical / Error (Rose)
    const criticalStyles = getSemanticNotificationStyles('critical');
    expect(criticalStyles.container).toContain('bg-rose-50');
    expect(criticalStyles.container).toContain('border-rose-300');
    expect(criticalStyles.iconBg).toContain('bg-rose-600');
    expect(criticalStyles.iconBg).toContain('text-white');
    expect(criticalStyles.badge).toContain('bg-rose-200');
    expect(criticalStyles.btn).toContain('bg-rose-600');

    // 5. Neutral / Info (Slate/Neutral)
    const neutralStyles = getSemanticNotificationStyles('neutral');
    expect(neutralStyles.container).toContain('bg-slate-50');
    expect(neutralStyles.container).toContain('border-slate-300');
    expect(neutralStyles.iconBg).toContain('bg-slate-700');
    expect(neutralStyles.iconBg).toContain('text-white');
  });

  describe('Cohort Participation & Non-Participating Grade Reminder Suppression', () => {
    const mockExamG8G9Only: Examination = {
      id: 'exam-opener-2026',
      exam_name: 'Opener Assessment Term 3 2026',
      exam_type: 'Opener',
      year: 2026,
      term: 'Term 3',
      status: 'Open',
      max_marks: 100,
      academic_year_id: 'ay-2026',
      term_id: 'term-3',
      education_level: 'Junior School',
      approved_classes: ['stream-g8-red', 'stream-g8-blue', 'stream-g9-red', 'stream-g9-blue'],
    };

    const mockClassG7Red: ClassStream = {
      id: 'class-g7-uuid',
      stream_id: 'stream-g7-red',
      class_name: 'Grade 7',
      stream: 'Red',
      education_level: 'Junior School',
      status: 'Active',
      class_teacher_id: 'teacher-gideon-uuid',
    };

    const mockClassG8Red: ClassStream = {
      id: 'class-g8-uuid',
      stream_id: 'stream-g8-red',
      class_name: 'Grade 8',
      stream: 'Red',
      education_level: 'Junior School',
      status: 'Active',
      class_teacher_id: 'other-teacher-uuid',
    };

    const studentG7: Student = {
      id: 'std-g7-1',
      admission_number: 'ADM-701',
      first_name: 'Grade 7',
      last_name: 'Learner',
      full_name: 'Grade 7 Learner',
      class_id: 'class-g7-uuid',
      stream_id: 'stream-g7-red',
      active: true,
      gender: 'M',
    };

    const studentG8: Student = {
      id: 'std-g8-1',
      admission_number: 'ADM-801',
      first_name: 'Grade 8',
      last_name: 'Learner',
      full_name: 'Grade 8 Learner',
      class_id: 'class-g8-uuid',
      stream_id: 'stream-g8-red',
      active: true,
      gender: 'F',
    };

    const marksElsewhere: Mark[] = [
      {
        id: 'mark-g8-1',
        exam_id: 'exam-opener-2026',
        student_id: 'std-g8-1',
        subject_id: 'subj-math',
        score: 75,
      },
    ];

    it('determines an exam is NOT applicable to Grade 7 when administered only to other grades', () => {
      const isApplicableG7 = isExamApplicableToClassStream(
        mockExamG8G9Only,
        mockClassG7Red,
        marksElsewhere,
        [studentG7, studentG8],
        [mockClassG7Red, mockClassG8Red]
      );
      expect(isApplicableG7).toBe(false);

      const isApplicableG8 = isExamApplicableToClassStream(
        mockExamG8G9Only,
        mockClassG8Red,
        marksElsewhere,
        [studentG7, studentG8],
        [mockClassG7Red, mockClassG8Red]
      );
      expect(isApplicableG8).toBe(true);
    });

    it('suppresses missing marks reminder for class teacher whose grade does not take the active exam', () => {
      const gideonTeacher: Teacher = {
        id: 'teacher-gideon-uuid',
        teacher_name: 'Gideon Cheruiyot',
        email: 'gideon@school.com',
        phone: '0712345678',
        tsc_number: 'TSC-GIDEON',
        is_class_teacher: true,
        class_teacher_of_id: 'stream-g7-red',
        allocations: [
          {
            id: 'alloc-1',
            education_level: 'Junior School',
            subject_id: 'subj-math',
            class_id: 'class-g7-uuid',
            stream_id: 'stream-g7-red',
            subject_name: 'Pre-Technical Studies',
            class_name: 'Grade 7',
            stream: 'Red',
          },
          {
            id: 'alloc-2',
            education_level: 'Junior School',
            subject_id: 'subj-math',
            class_id: 'class-g8-uuid',
            stream_id: 'stream-g8-red',
            subject_name: 'Pre-Technical Studies',
            class_name: 'Grade 8',
            stream: 'Red',
          },
        ],
      };

      const reminder = computeTeacherExamReminder({
        teacher: gideonTeacher,
        currentUser: null,
        exams: [mockExamG8G9Only],
        classes: [mockClassG7Red, mockClassG8Red],
        subjects: [mockMathSubject],
        students: [studentG7, studentG8],
        marks: marksElsewhere,
        activeYear: { year: 2026 },
        activeTerm: { term_name: 'Term 3', status: 'Active' },
      });

      // Grade 7 Red is NOT participating, Grade 8 Red is locked/approved in approved_classes
      // Reminder priority should NOT be action_required with false missing marks for Grade 7!
      expect(reminder.reminderPriority).not.toBe('action_required');
      if (reminder.classTeacherSummary) {
        expect(reminder.classTeacherSummary.totalMissingMarks).toBe(0);
        expect(reminder.classTeacherSummary.totalExpectedMarks).toBe(0);
      }
      if (reminder.subjectTeacherSummary) {
        expect(reminder.subjectTeacherSummary.totalMissingMarks).toBe(0);
      }
    });
  });

  describe('Unified Multi-Exam Released Banner & Class Teacher Access Restrictions', () => {
    const classG9Red: ClassStream = {
      id: 'class-g9-uuid',
      stream_id: 'stream-g9-red',
      class_name: 'Grade 9',
      stream: 'Red',
      education_level: 'Junior School',
      status: 'Active',
      class_teacher_id: 'teacher-g9-ct-uuid',
    };

    const g9ClassTeacher: Teacher = {
      id: 'teacher-g9-ct-uuid',
      teacher_name: 'Mr. Class Teacher',
      email: 'ct@school.ac.ke',
      phone: '0711000001',
      tsc_number: 'TSC-G9-CT',
      is_class_teacher: true,
      class_teacher_of_id: 'stream-g9-red',
      allocations: [],
    };

    const g9DualRoleTeacher: Teacher = {
      id: 'teacher-g9-ct-uuid',
      teacher_name: 'Mr. Dual Teacher',
      email: 'dual@school.ac.ke',
      phone: '0711000002',
      tsc_number: 'TSC-G9-CT',
      is_class_teacher: true,
      class_teacher_of_id: 'stream-g9-red',
      allocations: [
        {
          id: 'alloc-g9-math',
          education_level: 'Junior School',
          subject_id: 'subj-math',
          class_id: 'class-g9-uuid',
          stream_id: 'stream-g9-red',
          subject_name: 'Mathematics',
          class_name: 'Grade 9',
          stream: 'Red',
        },
      ],
    };

    const pureSubjectTeacherOnly: Teacher = {
      id: 'teacher-pure-sub-uuid',
      teacher_name: 'Ms. Subject Teacher',
      email: 'st@school.ac.ke',
      phone: '0711000003',
      tsc_number: 'TSC-SUBJ-ONLY',
      is_class_teacher: false,
      allocations: [
        {
          id: 'alloc-g9-eng',
          education_level: 'Junior School',
          subject_id: 'subj-eng',
          class_id: 'class-g9-uuid',
          stream_id: 'stream-g9-red',
          subject_name: 'English',
          class_name: 'Grade 9',
          stream: 'Red',
        },
      ],
    };

    const examOpenerG9Approved: Examination = {
      id: 'exam-opener-g9-2026',
      exam_name: 'Grade 9 Opener Assessment Term 3 2026',
      exam_type: 'Opener',
      year: 2026,
      term: 'Term 3',
      status: 'Approved',
      max_marks: 100,
      academic_year_id: 'ay-2026',
      term_id: 'term-3',
      education_level: 'Junior School',
      class_id: 'class-g9-uuid',
    };

    const examKjseaTrialApproved: Examination = {
      id: 'exam-kjsea-trial-2026',
      exam_name: 'GRADE 9 KJSEA SECOND TRIAL THIRD TERM 3 2026',
      exam_type: 'Custom',
      year: 2026,
      term: 'Term 3',
      status: 'Approved',
      max_marks: 100,
      academic_year_id: 'ay-2026',
      term_id: 'term-3',
      education_level: 'Junior School',
      class_id: 'class-g9-uuid',
    };

    const examMockG9Approved: Examination = {
      id: 'exam-mock-g9-2026',
      exam_name: 'Grade 9 Mock Assessment Term 3 2026',
      exam_type: 'Custom',
      year: 2026,
      term: 'Term 3',
      status: 'Approved',
      max_marks: 100,
      academic_year_id: 'ay-2026',
      term_id: 'term-3',
      education_level: 'Junior School',
      class_id: 'class-g9-uuid',
    };

    const examGrade4Approved: Examination = {
      id: 'exam-g4-opener-2026',
      exam_name: 'Grade 4 Opener Assessment Term 3 2026',
      exam_type: 'Opener',
      year: 2026,
      term: 'Term 3',
      status: 'Approved',
      max_marks: 100,
      academic_year_id: 'ay-2026',
      term_id: 'term-3',
      education_level: 'Primary School' as any,
      class_id: 'class-g4-uuid',
    };

    const examProvisionalG9: Examination = {
      id: 'exam-provisional-g9',
      exam_name: 'Grade 9 Mid-Term Assessment Term 3 2026',
      exam_type: 'Mid-Term',
      year: 2026,
      term: 'Term 3',
      status: 'Provisional',
      max_marks: 100,
      academic_year_id: 'ay-2026',
      term_id: 'term-3',
      education_level: 'Junior School',
      class_id: 'class-g9-uuid',
    };

    it('Case A: One approved assessment displays single released-results notification', () => {
      const reminder = computeTeacherExamReminder({
        teacher: g9ClassTeacher,
        exams: [examOpenerG9Approved],
        classes: [classG9Red],
        subjects: allSubjects,
        students: allStudents,
        marks: [],
        activeYear: { year: 2026 },
        activeTerm: { term_name: 'Term 3', status: 'Active' },
      });

      expect(reminder.hasActiveExam).toBe(true);
      expect(reminder.badgeLabel).toBe('Results Released');
      expect(reminder.title).toBe('Examination Concluded');
      expect(reminder.headline).toContain('Grade 9 Opener Assessment');
      expect(reminder.subtext).toContain('Marks entry and stream approvals for this assessment are concluded.');
      expect(reminder.primaryAction).toBe('view_reports');
      expect(reminder.primaryActionLabel).toBe('View Reports & Transcripts');
      expect(reminder.assessmentBadges?.length).toBe(1);
    });

    it('Case B: Two approved assessments display unified multi-exam banner with both assessment badges', () => {
      const reminder = computeTeacherExamReminder({
        teacher: g9ClassTeacher,
        exams: [examOpenerG9Approved, examKjseaTrialApproved],
        classes: [classG9Red],
        subjects: allSubjects,
        students: allStudents,
        marks: [],
        activeYear: { year: 2026 },
        activeTerm: { term_name: 'Term 3', status: 'Active' },
      });

      expect(reminder.hasActiveExam).toBe(true);
      expect(reminder.badgeLabel).toBe('2 Results Released');
      expect(reminder.title).toBe('Examinations Concluded');
      expect(reminder.headline).toContain('Grade 9 Opener Assessment');
      expect(reminder.headline).toContain('Grade 9 KJSEA Second Trial');
      expect(reminder.headline).toContain('Term 3 2026');
      expect(reminder.subtext).toBe('Marks entry and stream approvals for both assessments are concluded.');
      expect(reminder.primaryAction).toBe('view_reports');
      expect(reminder.primaryActionLabel).toBe('View Reports & Transcripts');
      expect(reminder.releasedExams?.length).toBe(2);
      expect(reminder.assessmentBadges).toEqual([
        '✓ Grade 9 Opener Assessment',
        '✓ Grade 9 KJSEA Second Trial',
      ]);
    });

    it('Case C: Three approved assessments display dynamic count in banner', () => {
      const reminder = computeTeacherExamReminder({
        teacher: g9ClassTeacher,
        exams: [examOpenerG9Approved, examKjseaTrialApproved, examMockG9Approved],
        classes: [classG9Red],
        subjects: allSubjects,
        students: allStudents,
        marks: [],
        activeYear: { year: 2026 },
        activeTerm: { term_name: 'Term 3', status: 'Active' },
      });

      expect(reminder.hasActiveExam).toBe(true);
      expect(reminder.badgeLabel).toBe('3 Results Released');
      expect(reminder.title).toBe('Examinations Concluded');
      expect(reminder.headline).toContain('Grade 9 Opener Assessment');
      expect(reminder.headline).toContain('Grade 9 KJSEA Second Trial');
      expect(reminder.headline).toContain('Grade 9 Mock Assessment');
      expect(reminder.subtext).toBe('Marks entry and stream approvals for these assessments are concluded.');
      expect(reminder.releasedExams?.length).toBe(3);
      expect(reminder.assessmentBadges?.length).toBe(3);
    });

    it('Case D: Excludes provisional exams from released results banner', () => {
      const reminder = computeTeacherExamReminder({
        teacher: g9ClassTeacher,
        exams: [examOpenerG9Approved, examProvisionalG9],
        classes: [classG9Red],
        subjects: allSubjects,
        students: allStudents,
        marks: [],
        activeYear: { year: 2026 },
        activeTerm: { term_name: 'Term 3', status: 'Active' },
      });

      // Since provisional exam has 0 entered marks for the stream, stream is not ready for approval
      // If it falls through or prioritizes, provisional exam must never be classified as released!
      if (reminder.reminderPriority === 'completed') {
        expect(reminder.releasedExams?.length).toBe(1);
        expect(reminder.releasedExams?.[0].id).toBe(examOpenerG9Approved.id);
        expect(reminder.badgeLabel).toBe('Results Released');
      }
    });

    it('Case E: Only includes assessments applicable to teacher class/stream context', () => {
      const reminder = computeTeacherExamReminder({
        teacher: g9ClassTeacher,
        exams: [examOpenerG9Approved, examGrade4Approved],
        classes: [classG9Red],
        subjects: allSubjects,
        students: allStudents,
        marks: [],
        activeYear: { year: 2026 },
        activeTerm: { term_name: 'Term 3', status: 'Active' },
      });

      // Grade 4 exam should NOT be included for Grade 9 Class Teacher
      expect(reminder.releasedExams?.length).toBe(1);
      expect(reminder.releasedExams?.[0].id).toBe(examOpenerG9Approved.id);
      expect(reminder.assessmentBadges).toEqual(['✓ Grade 9 Opener Assessment']);
    });

    it('Case F: Subject Teacher who is not a designated Class Teacher receives NO class reports banner', () => {
      const reminder = computeTeacherExamReminder({
        teacher: pureSubjectTeacherOnly,
        exams: [examOpenerG9Approved, examKjseaTrialApproved],
        classes: [classG9Red],
        subjects: allSubjects,
        students: allStudents,
        marks: [],
        activeYear: { year: 2026 },
        activeTerm: { term_name: 'Term 3', status: 'Active' },
      });

      expect(reminder.primaryAction).toBe('none');
      expect(reminder.reminderPriority).toBe('none');
      expect(reminder.hasActiveExam).toBe(false);
    });

    it('Case G: Dual-Role Teacher who is a designated Class Teacher receives reports banner when marks are done', () => {
      const reminder = computeTeacherExamReminder({
        teacher: g9DualRoleTeacher,
        exams: [examOpenerG9Approved, examKjseaTrialApproved],
        classes: [classG9Red],
        subjects: allSubjects,
        students: allStudents,
        marks: [],
        activeYear: { year: 2026 },
        activeTerm: { term_name: 'Term 3', status: 'Active' },
      });

      expect(reminder.teacherRole).toBe('dual_role');
      expect(reminder.reminderPriority).toBe('completed');
      expect(reminder.primaryAction).toBe('view_reports');
      expect(reminder.primaryActionLabel).toBe('View Reports & Transcripts');
      expect(reminder.releasedExams?.length).toBe(2);
    });

    it('Case H: Grade 8 Class Teacher allocated to Junior School MUST NOT see released results banner for Grade 6 exam', () => {
      const brianGrade8Teacher: Teacher = {
        id: 'tch-brian-g8',
        teacher_name: 'Brian',
        email: 'brian@school.com',
        phone: '0712345678',
        is_class_teacher: true,
        class_teacher_of_id: 'str_g8_blue',
        allocations: [
          { id: 'alloc-1', subject_id: 'subj-eng', class_id: 'cls_g8_blue', stream_id: 'str_g8_blue', class_name: 'Grade 8', stream: 'Blue', education_level: 'Junior School' },
          { id: 'alloc-2', subject_id: 'subj-eng', class_id: 'cls_g9_blue', stream_id: 'str_g9_blue', class_name: 'Grade 9', stream: 'Blue', education_level: 'Junior School' },
        ],
      };

      const grade6Class: ClassStream = {
        id: 'cls_g6_green',
        stream_id: 'str_g6_green',
        class_name: 'Grade 6',
        stream: 'Green',
        education_level: 'Upper Primary',
      };

      const grade8Class: ClassStream = {
        id: 'cls_g8_blue',
        stream_id: 'str_g8_blue',
        class_name: 'Grade 8',
        stream: 'Blue',
        education_level: 'Junior School',
        class_teacher_id: 'tch-brian-g8',
      };

      const grade6OpenerExam: Examination = {
        id: 'exam_g6_opener_t3_2026',
        exam_name: 'Grade 6 Opener Assessment Term 3 2026',
        exam_type: 'Opener',
        year: 2026,
        term: 'Term 3',
        status: 'Approved',
        education_level: 'Upper Primary',
        approved_levels: ['Upper Primary'],
        approved_classes: ['str_g6_green'],
        max_marks: 100,
        academic_year_id: 'ay_2026',
        term_id: 'term_3',
      };

      const reminder = computeTeacherExamReminder({
        teacher: brianGrade8Teacher,
        exams: [grade6OpenerExam],
        classes: [grade6Class, grade8Class],
        subjects: allSubjects,
        students: allStudents,
        marks: [],
        activeYear: { year: 2026 },
        activeTerm: { term_name: 'Term 3', status: 'Active' },
      });

      // Brian is not assigned to Grade 6, so no active exam / reminder must be shown
      expect(reminder.hasActiveExam).toBe(false);
      expect(reminder.reminderPriority).toBe('none');
      expect(reminder.primaryAction).toBe('none');
    });
  });
});
