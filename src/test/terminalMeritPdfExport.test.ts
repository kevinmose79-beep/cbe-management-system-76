import * as rawJsPDF from 'jspdf';
import { generateTerminalMeritListPdfDoc } from '../services/terminalMeritListExporter';

const jsPDFConstructor = (rawJsPDF as any).jsPDF || (rawJsPDF as any).default || rawJsPDF;

console.log('=== TESTING TERMINAL MERIT LIST PDF EXPORT GENERATION ===\n');

try {
  const dummyData: any = {
    title: 'Terminal Merit List',
    school: { school_name: 'Test School' },
    academicYear: 2026,
    term: 'Term 3',
    educationLevel: 'Junior School',
    grade: 'Grade 9',
    streamName: 'Grade 9 Blue',
    isStreamView: true,
    isProvisionalMode: false,
    activeSubjects: [
      { id: 'sb_eng', subject_name: 'English', subject_code: 'ENG' },
      { id: 'sb_mat', subject_name: 'Mathematics', subject_code: 'MATH' },
    ],
    learners: [
      {
        student: { id: 's1', full_name: 'John Doe', admission_number: '101' },
        isRankable: true,
        ranking: { streamPosition: 1, overallPosition: 1 },
        subjectResults: new Map([
          ['sb_eng', { terminalPercentage: 80, isComplete: true }],
          ['sb_mat', { terminalPercentage: 75, isComplete: true }],
        ]),
        terminalTotalMarks: 155,
        learnerAverageMarks: 77.5,
        learnerAveragePoints: 7,
        overallPerformanceLevel: 'EE1',
      },
    ],
    summaryStats: {
      enrolledCount: 1,
      rankableCount: 1,
      unrankableCount: 0,
      classCurriculumMax: 200,
      classAverageMarks: 155,
      classMeanPercentage: 77.5,
      classMeanPoints: 7,
      overallPerformanceLevel: 'EE1',
      genderDistribution: { boysCount: 1, girlsCount: 0, totalCount: 1 },
      subjectStats: new Map([
        [
          'sb_eng',
          {
            subjectId: 'sb_eng',
            subjectCode: 'ENG',
            subjectName: 'English',
            validCount: 1,
            totalPercentageSum: 80,
            averagePercentage: 80,
            averagePoints: 8,
            performanceLevel: 'EE1',
            assignedTeacherName: 'Mr. Smith',
          },
        ],
      ]),
    },
    generatedAt: '26 Sept 2026',
    classes: [],
    teachers: [],
  };

  // Generate 76 learners
  const learners76 = Array.from({ length: 76 }, (_, i) => ({
    student: { id: `s_${i + 1}`, full_name: `Learner ${i + 1}`, admission_number: `${100 + i}` },
    isRankable: true,
    ranking: { streamPosition: i + 1, overallPosition: i + 1 },
    subjectResults: new Map([
      ['sb_eng', { terminalPercentage: 80, isComplete: true }],
      ['sb_mat', { terminalPercentage: 75, isComplete: true }],
    ]),
    terminalTotalMarks: 155,
    learnerAverageMarks: 77.5,
    learnerAveragePoints: 7,
    overallPerformanceLevel: 'EE1',
  }));

  dummyData.learners = learners76;

  const doc76 = generateTerminalMeritListPdfDoc(dummyData);
  console.log('✓ PASS: 76-learner PDF generated successfully.');
  console.log('Page count for 76 learners:', doc76.getNumberOfPages());
} catch (err: any) {
  console.error('✗ FAIL: PDF generation threw an error:', err);
  process.exit(1);
}
