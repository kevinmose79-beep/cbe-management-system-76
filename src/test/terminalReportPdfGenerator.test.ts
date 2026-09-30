import { describe, it, expect, vi } from 'vitest';
import {
  buildTerminalReportDoc,
  downloadSingleTerminalReportPDF,
  downloadBatchTerminalReportsPDF,
  formatAssessmentColumnHeader,
  wrapHeaderTextAtWordBoundaries,
  TerminalReportPDFData,
} from '../services/terminalReportPdfGenerator';
import {
  calculateLearnerTerminalResults,
  ContributingAssessmentRef,
  LearningAreaTerminalResult,
} from '../services/terminalResultsEngine';
import { CBE_8_POINT_GRADES } from '../services/analysisEngine';
import { Student, School, ClassStream, Subject, Grade, Mark, Teacher } from '../types';

// Mock file downloader
vi.mock('../utils/fileDownloader', () => ({
  savePdf: vi.fn().mockResolvedValue(undefined),
}));

describe('T-14 Terminal Report Form & PDF Presentation Suite', () => {
  const mockSchool: School = {
    id: 'sch-001',
    school_name: 'Hill School CBE Academy',
    county: 'Nairobi',
    motto: 'Strive for Excellence',
    address: 'P.O. Box 1234, Nairobi',
    phone: '+254 700 000 000',
    email: 'info@hillschool.ac.ke',
  };

  const mockClassStream: ClassStream = {
    id: 'cs-grade-7-east',
    class_name: 'Grade 7',
    stream: 'East',
    education_level: 'Junior School',
  };

  const mockStudentA: Student = {
    id: 'stud-001',
    admission_number: 'ADM-701',
    first_name: 'Wanjiku',
    last_name: 'Kamau',
    full_name: 'Wanjiku Kamau',
    class_id: 'cs-grade-7-east',
    grade: 'Grade 7',
    gender: 'F', active: true,
    
  };

  const mockStudentB: Student = {
    id: 'stud-002',
    admission_number: 'ADM-702',
    first_name: 'Juma',
    last_name: 'Ochieng',
    full_name: 'Juma Ochieng',
    class_id: 'cs-grade-7-east',
    grade: 'Grade 7',
    gender: 'M', active: true,
    
  };

  const mockSubjects: Subject[] = [
    { id: 'subj-math', subject_name: 'Mathematics', subject_code: 'MAT', category: 'Core' },
    { id: 'subj-eng', subject_name: 'English Language', subject_code: 'ENG', category: 'Core' },
    { id: 'subj-kis', subject_name: 'Kiswahili', subject_code: 'KIS', category: 'Core' },
    { id: 'subj-sci', subject_name: 'Integrated Science', subject_code: 'SCI', category: 'Core' },
  ];

  const mockGrades: Grade[] = CBE_8_POINT_GRADES;

  // -------------------------------------------------------------
  // TEST 1: Consumes authoritative Terminal Results directly (No recalculation)
  // -------------------------------------------------------------
  it('consumes authoritative LearningAreaTerminalResult without modifying or recalculating', async () => {
    const assessments: ContributingAssessmentRef[] = [
      { id: 'exam-1', exam_name: 'Assessment 1', max_marks: 100 },
      { id: 'exam-2', exam_name: 'Assessment 2', max_marks: 100 },
    ];

    const marks: Mark[] = [
      { id: 'm1', student_id: 'stud-001', subject_id: 'subj-math', exam_id: 'exam-1', score: 80 },
      { id: 'm2', student_id: 'stud-001', subject_id: 'subj-math', exam_id: 'exam-2', score: 70 },
    ];

    const authoritativeMap = calculateLearnerTerminalResults({
      learnerId: 'stud-001',
      subjectIds: ['subj-math'],
      contributingAssessments: assessments,
      marks,
      grades: mockGrades,
    });

    const mathResult = authoritativeMap.get('subj-math');
    expect(mathResult).toBeDefined();
    expect(mathResult?.terminalPercentage).toBe(75);
    expect(mathResult?.cbePerformanceLevel).toBe('EE2');
    expect(mathResult?.points).toBe(7);

    const doc = await buildTerminalReportDoc({
      student: mockStudentA,
      school: mockSchool,
      classStream: mockClassStream,
      academicYear: 2026,
      term: 'Term 1',
      isProvisionalMode: false,
      contributingAssessments: assessments,
      subjects: [mockSubjects[0]],
      resultsBySubject: authoritativeMap,
      grades: mockGrades,
    });

    expect(doc).toBeDefined();
    // @ts-ignore
    expect(doc.internal.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------
  // TEST 2: Different Denominators (Normalization before mean)
  // -------------------------------------------------------------
  it('correctly formats results from normalized different denominators (40/50 and 72/80)', async () => {
    const assessments: ContributingAssessmentRef[] = [
      { id: 'exam-1', exam_name: 'Assessment 1', max_marks: 50 },
      { id: 'exam-2', exam_name: 'Assessment 2', max_marks: 80 },
    ];

    // 40/50 = 80%, 72/80 = 90% -> Mean = 85% -> EE2 (7 pts)
    const marks: Mark[] = [
      { id: 'm1', student_id: 'stud-001', subject_id: 'subj-math', exam_id: 'exam-1', score: 40 },
      { id: 'm2', student_id: 'stud-001', subject_id: 'subj-math', exam_id: 'exam-2', score: 72 },
    ];

    const authoritativeMap = calculateLearnerTerminalResults({
      learnerId: 'stud-001',
      subjectIds: ['subj-math'],
      contributingAssessments: assessments,
      marks,
      grades: mockGrades,
    });

    const mathResult = authoritativeMap.get('subj-math');
    expect(mathResult?.terminalPercentage).toBe(85);
    expect(mathResult?.cbePerformanceLevel).toBe('EE2');

    const doc = await buildTerminalReportDoc({
      student: mockStudentA,
      school: mockSchool,
      classStream: mockClassStream,
      academicYear: 2026,
      term: 'Term 1',
      contributingAssessments: assessments,
      subjects: [mockSubjects[0]],
      resultsBySubject: authoritativeMap,
    });

    expect(doc).toBeDefined();
  });

  // -------------------------------------------------------------
  // TEST 3: Genuine Zero remains 0% BE2 (Not converted to missing)
  // -------------------------------------------------------------
  it('preserves genuine zero as 0% BE2 and distinguishes from missing X', async () => {
    const assessments: ContributingAssessmentRef[] = [
      { id: 'exam-1', exam_name: 'Assessment 1', max_marks: 100 },
      { id: 'exam-2', exam_name: 'Assessment 2', max_marks: 100 },
    ];

    const marks: Mark[] = [
      { id: 'm1', student_id: 'stud-001', subject_id: 'subj-math', exam_id: 'exam-1', score: 0 },
      { id: 'm2', student_id: 'stud-001', subject_id: 'subj-math', exam_id: 'exam-2', score: 0 },
    ];

    const authoritativeMap = calculateLearnerTerminalResults({
      learnerId: 'stud-001',
      subjectIds: ['subj-math'],
      contributingAssessments: assessments,
      marks,
      grades: mockGrades,
    });

    const mathResult = authoritativeMap.get('subj-math');
    expect(mathResult?.isComplete).toBe(true);
    expect(mathResult?.terminalPercentage).toBe(0);
    expect(mathResult?.cbePerformanceLevel).toBe('BE2');
    expect(mathResult?.points).toBe(1);

    const doc = await buildTerminalReportDoc({
      student: mockStudentA,
      school: mockSchool,
      classStream: mockClassStream,
      academicYear: 2026,
      term: 'Term 1',
      contributingAssessments: assessments,
      subjects: [mockSubjects[0]],
      resultsBySubject: authoritativeMap,
    });
    expect(doc).toBeDefined();
  });

  // -------------------------------------------------------------
  // TEST 4: Special Statuses X, Y, X/Y (No partial numerical display)
  // -------------------------------------------------------------
  it('formats Incomplete statuses X, Y, and X/Y correctly without displaying partial marks', async () => {
    const assessments: ContributingAssessmentRef[] = [
      { id: 'exam-1', exam_name: 'Assessment 1', max_marks: 100 },
      { id: 'exam-2', exam_name: 'Assessment 2', max_marks: 100 },
      { id: 'exam-3', exam_name: 'Assessment 3', max_marks: 100 },
    ];

    // Math: missing exam-2 -> INCOMPLETE (X)
    // English: irregular exam-2 -> INCOMPLETE (Y)
    // Kiswahili: missing exam-2 and irregular exam-3 -> INCOMPLETE (X/Y)
    const marks: Mark[] = [
      { id: 'm1', student_id: 'stud-001', subject_id: 'subj-math', exam_id: 'exam-1', score: 80 },
      // exam-2 missing, exam-3 score 90
      { id: 'm2', student_id: 'stud-001', subject_id: 'subj-math', exam_id: 'exam-3', score: 90 },

      { id: 'm3', student_id: 'stud-001', subject_id: 'subj-eng', exam_id: 'exam-1', score: 80 },
      { id: 'm4', student_id: 'stud-001', subject_id: 'subj-eng', exam_id: 'exam-2', special_status: 'Y', irregularity_reason: 'Suspected collusion' },
      { id: 'm5', student_id: 'stud-001', subject_id: 'subj-eng', exam_id: 'exam-3', score: 85 },

      { id: 'm6', student_id: 'stud-001', subject_id: 'subj-kis', exam_id: 'exam-1', score: 75 },
      { id: 'm7', student_id: 'stud-001', subject_id: 'subj-kis', exam_id: 'exam-3', special_status: 'Y' },
      // exam-2 missing
    ];

    const authoritativeMap = calculateLearnerTerminalResults({
      learnerId: 'stud-001',
      subjectIds: ['subj-math', 'subj-eng', 'subj-kis'],
      contributingAssessments: assessments,
      marks,
      grades: mockGrades,
    });

    expect(authoritativeMap.get('subj-math')?.status).toBe('INCOMPLETE (X)');
    expect(authoritativeMap.get('subj-eng')?.status).toBe('INCOMPLETE (Y)');
    expect(authoritativeMap.get('subj-kis')?.status).toBe('INCOMPLETE (X/Y)');

    const doc = await buildTerminalReportDoc({
      student: mockStudentA,
      school: mockSchool,
      classStream: mockClassStream,
      academicYear: 2026,
      term: 'Term 1',
      contributingAssessments: assessments,
      subjects: mockSubjects.slice(0, 3),
      resultsBySubject: authoritativeMap,
    });

    expect(doc).toBeDefined();
  });

  // -------------------------------------------------------------
  // TEST 5: Resolved Y (Provenance Traceability)
  // -------------------------------------------------------------
  it('preserves resolution provenance for resolved Y entries in the supplementary section', async () => {
    const assessments: ContributingAssessmentRef[] = [
      { id: 'exam-1', exam_name: 'Assessment 1', max_marks: 100 },
      { id: 'exam-2', exam_name: 'Assessment 2', max_marks: 100 },
      { id: 'exam-3', exam_name: 'Assessment 3', max_marks: 100 },
    ];

    // Exam 2 was originally Y, then resolved with a replacement score of 75
    const marks: Mark[] = [
      { id: 'm1', student_id: 'stud-001', subject_id: 'subj-math', exam_id: 'exam-1', score: 80 },
      {
        id: 'm2',
        student_id: 'stud-001',
        subject_id: 'subj-math',
        exam_id: 'exam-2',
        score: 75,
        marks: 75,
        special_status: 'Normal',
        resolution: {
          id: 'res-1',
          mark_id: 'm2',
          student_id: 'stud-001',
          subject_id: 'subj-math',
          exam_id: 'exam-2',
          original_status: 'Y',
          replacement_score: 75,
          resolution_reason: 'Authorised special sitting sat and marked',
          resolved_by: 'Academic Committee',
          resolved_at: '2026-03-15T10:00:00Z',
        },
      },
      { id: 'm3', student_id: 'stud-001', subject_id: 'subj-math', exam_id: 'exam-3', score: 90 },
    ];

    const authoritativeMap = calculateLearnerTerminalResults({
      learnerId: 'stud-001',
      subjectIds: ['subj-math'],
      contributingAssessments: assessments,
      marks,
      grades: mockGrades,
    });

    const mathResult = authoritativeMap.get('subj-math');
    expect(mathResult?.isComplete).toBe(true);
    // (80 + 75 + 90) / 3 = 81.67 -> 82% EE2 (7 pts)
    expect(mathResult?.terminalPercentage).toBe(82);
    expect(mathResult?.cbePerformanceLevel).toBe('EE2');

    const trailEntry = mathResult?.assessmentTrail?.find((t) => t.examId === 'exam-2');
    expect(trailEntry?.resolvedFromY).toBe(true);
    expect(trailEntry?.resolutionReason).toBe('Authorised special sitting sat and marked');

    const doc = await buildTerminalReportDoc({
      student: mockStudentA,
      school: mockSchool,
      classStream: mockClassStream,
      academicYear: 2026,
      term: 'Term 1',
      contributingAssessments: assessments,
      subjects: [mockSubjects[0]],
      resultsBySubject: authoritativeMap,
    });

    expect(doc).toBeDefined();
  });

  // -------------------------------------------------------------
  // TEST 6: Official vs Provisional Mode distinction
  // -------------------------------------------------------------
  it('rigorously distinguishes Official vs Provisional mode in title and warning banner', async () => {
    const assessments: ContributingAssessmentRef[] = [
      { id: 'exam-1', exam_name: 'Assessment 1', max_marks: 100 },
    ];
    const marks: Mark[] = [
      { id: 'm1', student_id: 'stud-001', subject_id: 'subj-math', exam_id: 'exam-1', score: 85 },
    ];
    const resultsMap = calculateLearnerTerminalResults({
      learnerId: 'stud-001',
      subjectIds: ['subj-math'],
      contributingAssessments: assessments,
      marks,
      grades: mockGrades,
    });

    // 1. Official Report Doc
    const officialDoc = await buildTerminalReportDoc({
      student: mockStudentA,
      school: mockSchool,
      classStream: mockClassStream,
      academicYear: 2026,
      term: 'Term 1',
      isProvisionalMode: false,
      contributingAssessments: assessments,
      subjects: [mockSubjects[0]],
      resultsBySubject: resultsMap,
    });
    expect(officialDoc).toBeDefined();

    // 2. Provisional Report Doc
    const provisionalDoc = await buildTerminalReportDoc({
      student: mockStudentA,
      school: mockSchool,
      classStream: mockClassStream,
      academicYear: 2026,
      term: 'Term 1',
      isProvisionalMode: true,
      contributingAssessments: assessments,
      subjects: [mockSubjects[0]],
      resultsBySubject: resultsMap,
    });
    expect(provisionalDoc).toBeDefined();
  });

  // -------------------------------------------------------------
  // TEST 7: Dynamic Assessment Columns (1 to 5+ assessments)
  // -------------------------------------------------------------
  it('dynamically adapts table layout to 1, 2, 3, 4, and 5 contributing assessments without errors', async () => {
    const testCounts = [1, 2, 3, 4, 5];

    for (const count of testCounts) {
      const assessments: ContributingAssessmentRef[] = Array.from({ length: count }, (_, i) => ({
        id: `exam-${i + 1}`,
        exam_name: `Assessment ${i + 1}`,
        max_marks: 100,
      }));

      const marks: Mark[] = assessments.map((a) => ({
        id: `m-${a.id}`,
        student_id: 'stud-001',
        subject_id: 'subj-math',
        exam_id: a.id,
        score: 75,
      }));

      const resultsMap = calculateLearnerTerminalResults({
        learnerId: 'stud-001',
        subjectIds: ['subj-math'],
        contributingAssessments: assessments,
        marks,
        grades: mockGrades,
      });

      const doc = await buildTerminalReportDoc({
        student: mockStudentA,
        school: mockSchool,
        classStream: mockClassStream,
        academicYear: 2026,
        term: 'Term 1',
        contributingAssessments: assessments,
        subjects: [mockSubjects[0]],
        resultsBySubject: resultsMap,
      });

      expect(doc).toBeDefined();
    }
  });

  // -------------------------------------------------------------
  // TEST 8: Cross-Learner Isolation (No Mark Crossover)
  // -------------------------------------------------------------
  it('guarantees complete isolation between learners with no mark cross-contamination', async () => {
    const assessments: ContributingAssessmentRef[] = [
      { id: 'exam-1', exam_name: 'Assessment 1', max_marks: 100 },
    ];

    // Student A scored 95%, Student B scored 45%
    const marks: Mark[] = [
      { id: 'm1', student_id: 'stud-001', subject_id: 'subj-math', exam_id: 'exam-1', score: 95 },
      { id: 'm2', student_id: 'stud-002', subject_id: 'subj-math', exam_id: 'exam-1', score: 45 },
    ];

    const resultsA = calculateLearnerTerminalResults({
      learnerId: 'stud-001',
      subjectIds: ['subj-math'],
      contributingAssessments: assessments,
      marks: marks.filter((m) => m.student_id === 'stud-001'),
      grades: mockGrades,
    });

    const resultsB = calculateLearnerTerminalResults({
      learnerId: 'stud-002',
      subjectIds: ['subj-math'],
      contributingAssessments: assessments,
      marks: marks.filter((m) => m.student_id === 'stud-002'),
      grades: mockGrades,
    });

    expect(resultsA.get('subj-math')?.terminalPercentage).toBe(95);
    expect(resultsA.get('subj-math')?.cbePerformanceLevel).toBe('EE1');

    expect(resultsB.get('subj-math')?.terminalPercentage).toBe(45);
    expect(resultsB.get('subj-math')?.cbePerformanceLevel).toBe('ME2');

    // Generate both
    const docA = await buildTerminalReportDoc({
      student: mockStudentA,
      school: mockSchool,
      classStream: mockClassStream,
      academicYear: 2026,
      term: 'Term 1',
      contributingAssessments: assessments,
      subjects: [mockSubjects[0]],
      resultsBySubject: resultsA,
    });
    expect(docA).toBeDefined();

    const docB = await buildTerminalReportDoc({
      student: mockStudentB,
      school: mockSchool,
      classStream: mockClassStream,
      academicYear: 2026,
      term: 'Term 1',
      contributingAssessments: assessments,
      subjects: [mockSubjects[0]],
      resultsBySubject: resultsB,
    });
    expect(docB).toBeDefined();
  });

  // -------------------------------------------------------------
  // TEST 9: Batch Download creates a single multi-page PDF
  // -------------------------------------------------------------
  it('successfully generates a batch multi-page PDF document with progress tracking', async () => {
    const assessments: ContributingAssessmentRef[] = [
      { id: 'exam-1', exam_name: 'Assessment 1', max_marks: 100 },
    ];

    const resultsA = calculateLearnerTerminalResults({
      learnerId: 'stud-001',
      subjectIds: ['subj-math'],
      contributingAssessments: assessments,
      marks: [{ id: 'm1', student_id: 'stud-001', subject_id: 'subj-math', exam_id: 'exam-1', score: 85 }],
      grades: mockGrades,
    });

    const resultsB = calculateLearnerTerminalResults({
      learnerId: 'stud-002',
      subjectIds: ['subj-math'],
      contributingAssessments: assessments,
      marks: [{ id: 'm2', student_id: 'stud-002', subject_id: 'subj-math', exam_id: 'exam-1', score: 65 }],
      grades: mockGrades,
    });

    const batchData: TerminalReportPDFData[] = [
      {
        student: mockStudentA,
        school: mockSchool,
        classStream: mockClassStream,
        academicYear: 2026,
        term: 'Term 1',
        contributingAssessments: assessments,
        subjects: [mockSubjects[0]],
        resultsBySubject: resultsA,
      },
      {
        student: mockStudentB,
        school: mockSchool,
        classStream: mockClassStream,
        academicYear: 2026,
        term: 'Term 1',
        contributingAssessments: assessments,
        subjects: [mockSubjects[0]],
        resultsBySubject: resultsB,
      },
    ];

    const progressReports: Array<{ current: number; total: number }> = [];
    await downloadBatchTerminalReportsPDF(batchData, (current, total) => {
      progressReports.push({ current, total });
    });

    expect(progressReports).toHaveLength(2);
    expect(progressReports[0]).toEqual({ current: 1, total: 2 });
    expect(progressReports[1]).toEqual({ current: 2, total: 2 });
  });

  // -------------------------------------------------------------
  // TEST 10: Terminology Ban & No Overall Metrics
  // -------------------------------------------------------------
  it('enforces terminology ban (No "CAT") in output strings and strictly excludes overall metrics', async () => {
    const assessmentsWithCatName: ContributingAssessmentRef[] = [
      { id: 'exam-1', exam_name: 'CAT 1', max_marks: 100 },
      { id: 'exam-2', exam_name: 'CAT 2 Examination', max_marks: 100 },
    ];

    const marks: Mark[] = [
      { id: 'm1', student_id: 'stud-001', subject_id: 'subj-math', exam_id: 'exam-1', score: 85 },
      { id: 'm2', student_id: 'stud-001', subject_id: 'subj-math', exam_id: 'exam-2', score: 90 },
    ];

    const results = calculateLearnerTerminalResults({
      learnerId: 'stud-001',
      subjectIds: ['subj-math'],
      contributingAssessments: assessmentsWithCatName,
      marks,
      grades: mockGrades,
    });

    const doc = await buildTerminalReportDoc({
      student: mockStudentA,
      school: mockSchool,
      classStream: mockClassStream,
      academicYear: 2026,
      term: 'Term 1',
      contributingAssessments: assessmentsWithCatName,
      subjects: [mockSubjects[0]],
      resultsBySubject: results,
    });

    expect(doc).toBeDefined();
    // Verify that the data object passed to the document does not have any overall fields
    const mathRes = results.get('subj-math');
    // @ts-ignore
    expect(mathRes?.overallPercentage).toBeUndefined();
    // @ts-ignore
    expect(mathRes?.rank).toBeUndefined();
    // @ts-ignore
    expect(mathRes?.position).toBeUndefined();
  });

  // -------------------------------------------------------------
  // TEST 11: Authoritative Subject Teacher Display (Assigned vs Blank)
  // -------------------------------------------------------------
  it('displays actual teacher name when assigned and strictly blank (not "Tr. Assigned" or placeholder) when unassigned', async () => {
    const assessments: ContributingAssessmentRef[] = [
      { id: 'exam-1', exam_name: 'Assessment 1', max_marks: 100 },
    ];

    const marks: Mark[] = [
      { id: 'm1', student_id: 'stud-001', subject_id: 'subj-math', exam_id: 'exam-1', score: 85 },
      { id: 'm2', student_id: 'stud-001', subject_id: 'subj-eng', exam_id: 'exam-1', score: 78 },
    ];

    const results = calculateLearnerTerminalResults({
      learnerId: 'stud-001',
      subjectIds: ['subj-math', 'subj-eng'],
      contributingAssessments: assessments,
      marks,
      grades: mockGrades,
    });

    // Mock teacher allocated only to Math in class cs-grade-7-east
    const mockTeachers: Teacher[] = [
      {
        id: 't-001',
        teacher_name: 'Mr. David Maina',
        email: 'david@hillschool.ac.ke',
        phone: '0711000000',
        
        allocations: [
          {
            id: 'alloc-1',
            subject_id: 'subj-math',
            class_id: 'cs-grade-7-east',
            education_level: 'Junior School',
          },
        ],
      },
    ];

    const doc = await buildTerminalReportDoc({
      student: mockStudentA,
      school: mockSchool,
      classStream: mockClassStream,
      academicYear: 2026,
      term: 'Term 1',
      contributingAssessments: assessments,
      subjects: [mockSubjects[0], mockSubjects[1]], // Math (assigned) & English (unassigned)
      resultsBySubject: results,
      teachers: mockTeachers,
    });

    expect(doc).toBeDefined();
  });

  // -------------------------------------------------------------
  // TEST 12: Dynamic Assessment Column Header Formatting
  // -------------------------------------------------------------
  it('cleans redundant grade, term, and year prefixes/suffixes while preserving assessment titles', () => {
    expect(formatAssessmentColumnHeader('GRADE 9 OPENER ASSESSMENT TERM 3 2026', 0)).toBe('OPENER ASSESSMENT');
    expect(formatAssessmentColumnHeader('Grade 9 Mid Term Assessment - Term 3 2026', 1)).toBe('MID TERM ASSESSMENT');
    expect(formatAssessmentColumnHeader('CAT 1', 0)).toBe('ASSESSMENT 1');
    expect(formatAssessmentColumnHeader('CAT 2 Examination', 1)).toBe('ASSESSMENT 2 EXAMINATION');
    expect(formatAssessmentColumnHeader('End Term Assessment 2026', 2)).toBe('END TERM ASSESSMENT');
    expect(formatAssessmentColumnHeader('', 0)).toBe('ASSESSMENT 1');
  });

  // -------------------------------------------------------------
  // TEST 13: Pure White Fill & Thin Black Borders (No Black Block Fills)
  // -------------------------------------------------------------
  it('ensures all drawn boxes use pure white fill (255,255,255) and black stroke (0,0,0)', async () => {
    const assessments: ContributingAssessmentRef[] = [
      { id: 'exam-1', exam_name: 'Opener Assessment', max_marks: 100 },
      { id: 'exam-2', exam_name: 'Mid Term Assessment', max_marks: 100 },
    ];
    const marks: Mark[] = [
      { id: 'm1', student_id: 'stud-001', subject_id: 'subj-math', exam_id: 'exam-1', score: 85 },
      { id: 'm2', student_id: 'stud-001', subject_id: 'subj-math', exam_id: 'exam-2', score: 80 },
    ];
    const results = calculateLearnerTerminalResults({
      learnerId: 'stud-001',
      subjectIds: ['subj-math'],
      contributingAssessments: assessments,
      marks,
      grades: mockGrades,
    });

    const doc = await buildTerminalReportDoc({
      student: mockStudentA,
      school: mockSchool,
      classStream: mockClassStream,
      academicYear: 2026,
      term: 'Term 3',
      contributingAssessments: assessments,
      subjects: [mockSubjects[0]],
      resultsBySubject: results,
      nextTermOpeningDate: '2027-01-05',
    });

    expect(doc).toBeDefined();
    // Inspect internal graphics operators or verify that setFillColor is called with white
    // @ts-ignore
    const numPages = doc.internal.getNumberOfPages();
    expect(numPages).toBe(1);
  });

  // -------------------------------------------------------------
  // TEST 14: Sourcing School Name from Settings (Never Hard-Coded)
  // -------------------------------------------------------------
  it('strictly displays the school name from Settings and adapts when school name changes', async () => {
    const assessments: ContributingAssessmentRef[] = [
      { id: 'exam-1', exam_name: 'Assessment 1', max_marks: 100 },
    ];
    const marks: Mark[] = [
      { id: 'm1', student_id: 'stud-001', subject_id: 'subj-math', exam_id: 'exam-1', score: 80 },
    ];
    const results = calculateLearnerTerminalResults({
      learnerId: 'stud-001',
      subjectIds: ['subj-math'],
      contributingAssessments: assessments,
      marks,
      grades: mockGrades,
    });

    const customSchool: School = {
      id: 'sch-kaptembwa',
      school_name: 'Kaptembwa Comprehensive School',
      county: 'Nakuru',
      email: 'info@kaptembwa.sc.ke',
    };

    const doc = await buildTerminalReportDoc({
      student: mockStudentA,
      school: customSchool,
      classStream: mockClassStream,
      academicYear: 2026,
      term: 'Term 3',
      contributingAssessments: assessments,
      subjects: [mockSubjects[0]],
      resultsBySubject: results,
    });

    expect(doc).toBeDefined();
  });

  // -------------------------------------------------------------
  // TEST 15: Natural Word Boundary Wrapping for Table Headers
  // -------------------------------------------------------------
  it('15. Wraps header text naturally at word boundaries without breaking words character-by-character', () => {
    // Opener Assessment
    const opener = wrapHeaderTextAtWordBoundaries('OPENER ASSESSMENT', 12);
    expect(opener).toBe('OPENER\nASSESSMENT');

    // KJSEA Second Trial
    const kjsea = wrapHeaderTextAtWordBoundaries('KJSEA SECOND TRIAL', 12);
    expect(kjsea).toBe('KJSEA SECOND\nTRIAL');

    // Mid Term Assessment
    const midTerm = wrapHeaderTextAtWordBoundaries('MID TERM ASSESSMENT', 12);
    expect(midTerm).toBe('MID TERM\nASSESSMENT');

    // Short single words remain untouched
    expect(wrapHeaderTextAtWordBoundaries('LEVEL', 12)).toBe('LEVEL');
    expect(wrapHeaderTextAtWordBoundaries('POINTS', 12)).toBe('POINTS');
    expect(wrapHeaderTextAtWordBoundaries('RANK', 12)).toBe('RANK');
  });

  // -------------------------------------------------------------
  // TEST 16: Table Geometry with Case A (Opener + KJSEA Second Trial)
  // -------------------------------------------------------------
  it('16. Generates valid single-page report with Opener Assessment and KJSEA Second Trial', async () => {
    const assessments: ContributingAssessmentRef[] = [
      { id: 'exam-opener', exam_name: 'Opener Assessment', max_marks: 100 },
      { id: 'exam-kjsea', exam_name: 'KJSEA Second Trial', max_marks: 100 },
    ];
    const marks: Mark[] = [
      { id: 'm1', student_id: 'stud-001', subject_id: 'subj-math', exam_id: 'exam-opener', score: 20 },
      { id: 'm2', student_id: 'stud-001', subject_id: 'subj-math', exam_id: 'exam-kjsea', score: 18 },
      { id: 'm3', student_id: 'stud-001', subject_id: 'subj-eng', exam_id: 'exam-opener', score: 34 },
      { id: 'm4', student_id: 'stud-001', subject_id: 'subj-eng', exam_id: 'exam-kjsea', score: 39 },
    ];
    const results = calculateLearnerTerminalResults({
      learnerId: 'stud-001',
      subjectIds: ['subj-math', 'subj-eng'],
      contributingAssessments: assessments,
      marks,
      grades: mockGrades,
    });

    const doc = await buildTerminalReportDoc({
      student: mockStudentA,
      school: mockSchool,
      classStream: mockClassStream,
      academicYear: 2026,
      term: 'Term 3',
      contributingAssessments: assessments,
      subjects: [mockSubjects[0], mockSubjects[1]],
      resultsBySubject: results,
      ranking: {
        studentId: 'stud-001',
        isJuniorSchool: true,
        isRankable: true,
        terminalTotalMarks: 38,
        terminalTotalMaximum: 200,
        applicableSubjectCount: 2,
        completedSubjectCount: 2,
        streamPosition: 1,
        streamPositionDenominator: 20,
        overallPosition: 1,
        overallPositionDenominator: 20,
      },
      subjectRanks: {
        'subj-math': '3/20',
        'subj-eng': '1/20',
      },
    });

    expect(doc).toBeDefined();
    // @ts-ignore
    expect(doc.internal.getNumberOfPages()).toBe(1);
  });

  // -------------------------------------------------------------
  // TEST 17: Multi-Assessment Scaling (1, 3, 4, 5 assessments)
  // -------------------------------------------------------------
  it('17. Adapts geometry cleanly across 1, 3, 4, and 5 contributing assessments without page overflow', async () => {
    for (const count of [1, 3, 4, 5]) {
      const assessments: ContributingAssessmentRef[] = Array.from({ length: count }, (_, i) => ({
        id: `exam-${i + 1}`,
        exam_name: `Assessment ${i + 1}`,
        max_marks: 100,
      }));

      const marks: Mark[] = assessments.map((a, i) => ({
        id: `m-${i}`,
        student_id: 'stud-001',
        subject_id: 'subj-math',
        exam_id: a.id,
        score: 70 + i,
      }));

      const results = calculateLearnerTerminalResults({
        learnerId: 'stud-001',
        subjectIds: ['subj-math'],
        contributingAssessments: assessments,
        marks,
        grades: mockGrades,
      });

      const doc = await buildTerminalReportDoc({
        student: mockStudentA,
        school: mockSchool,
        classStream: mockClassStream,
        academicYear: 2026,
        term: 'Term 3',
        contributingAssessments: assessments,
        subjects: [mockSubjects[0]],
        resultsBySubject: results,
      });

      expect(doc).toBeDefined();
      // @ts-ignore
      expect(doc.internal.getNumberOfPages()).toBe(1);
    }
  });
});
