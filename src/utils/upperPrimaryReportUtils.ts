import {
  Student,
  Subject,
  Mark,
  Grade,
  ClassStream,
  Teacher,
  Examination,
  getEducationLevelForGrade,
  normalizeGradeName,
} from '../types';
import {
  evaluateMark,
  formatPercentage,
  isEnglishLanguage,
  isEnglishComposition,
  isKiswahiliLugha,
  isKiswahiliInsha,
  isMathematics,
  isIntegratedScience,
  isCreativeArts,
  isDirectSSCRE,
  isSocialStudies,
  isChristianReligiousEducation,
  getUpperPrimaryCompositeSubjectMarks,
} from './markUtils';
import {
  calculateExamResults,
  getGradeForMark,
  calculateSubjectRank,
  getSubjectDefaultComment,
} from '../services/analysisEngine';
import {
  isKiswahiliSubject,
  getKiswahiliDefaultComment,
} from './kiswahiliCommentValidator';
import { resolveSubjectTeacher } from './teacherResolutionUtils';
import { stripSurroundingQuotes } from './filterUtils';

export interface UpperPrimaryComponentRow {
  code: string;
  name: string;
  maxScore: number;
  rawScore: number | null;
  displayScore: string;
  status: 'Normal' | 'X' | 'Y' | 'Blank';
  teacherName: string;
  subjectId: string;
}

export interface UpperPrimaryConsolidatedArea {
  id: string;
  subjectId: string;
  code: string;
  name: string;
  components: UpperPrimaryComponentRow[];
  rawScore: number | null;
  outOf: number;
  percentage: number | null;
  displayScore: string;
  pctDisplay: string;
  points: number;
  pointsDisplay: string;
  rank: string;
  defaultComment: string;
  customComment: string;
  effectiveComment: string;
  teacherName: string;
  status: 'Normal' | 'X' | 'Y' | 'Blank';
  gradeCode: string;
  performanceLevel: string;
  isKiswahili: boolean;
  isConsolidated: true;
}

export interface UpperPrimaryStandardArea {
  id: string;
  subjectId: string;
  code: string;
  name: string;
  rawScore: number | null;
  outOf: number;
  percentage: number | null;
  displayScore: string;
  pctDisplay: string;
  points: number;
  pointsDisplay: string;
  rank: string;
  defaultComment: string;
  customComment: string;
  effectiveComment: string;
  teacherName: string;
  status: 'Normal' | 'X' | 'Y' | 'Blank';
  gradeCode: string;
  performanceLevel: string;
  isKiswahili: boolean;
  isConsolidated: false;
}

export interface UpperPrimaryStructuredReport {
  isUpperPrimary: boolean;
  isStandalone?: boolean;
  english: UpperPrimaryConsolidatedArea;
  kiswahili: UpperPrimaryConsolidatedArea;
  standardAreas: UpperPrimaryStandardArea[];
  allReportAreas: (UpperPrimaryConsolidatedArea | UpperPrimaryStandardArea)[];
  totalMarks: number;
  maxPossibleMarks: number;
  totalPoints: number;
  maxPossiblePoints: number;
  averageScore: number;
  overallLevel: string;
  overallGradeCode: string;
  isComplete: boolean;
}

/**
 * Checks whether a given student and class context belongs strictly to Upper Primary (Grades 4, 5, 6).
 */
export function isUpperPrimaryContext(
  student?: Student | null,
  targetClass?: ClassStream | null,
  exam?: Examination | null
): boolean {
  if (exam?.education_level === 'Upper Primary') return true;
  if (targetClass?.education_level === 'Upper Primary') return true;
  const gradeStr = student?.grade || targetClass?.class_name || '';
  const norm = normalizeGradeName(gradeStr);
  if (['Grade 4', 'Grade 5', 'Grade 6'].includes(norm)) return true;
  const level = getEducationLevelForGrade(gradeStr);
  return level === 'Upper Primary';
}

/**
 * Resolves the structured Upper Primary report breakdown:
 * - English with ENG (60) + COMP (40) components and Consolidated English (100)
 * - Kiswahili with KIS (60) + INSHA (40) components and Consolidated Kiswahili (100)
 * - 4 core standard areas: Mathematics (100), Integrated Science (100), Creative Arts and Sports (100), Social Studies & CRE (100)
 * - Correct overall aggregation out of 600 and 24 points.
 */
export function resolveUpperPrimaryReportStructure(options: {
  student: Student;
  exam?: Examination;
  targetClass?: ClassStream;
  subjects: Subject[];
  marks: Mark[];
  grades: Grade[];
  teachers: Teacher[];
  allStudents: Student[];
  classes: ClassStream[];
  customSubjectComments?: Record<string, string>;
}): UpperPrimaryStructuredReport {
  const {
    student,
    exam,
    targetClass,
    subjects = [],
    marks = [],
    grades = [],
    teachers = [],
    allStudents = [],
    classes = [],
    customSubjectComments = {},
  } = options;

  const examId = exam?.id || '';
  const studentGrade = student.grade || targetClass?.class_name || 'Grade 5';
  const targetClassId = targetClass?.id || student.class_id || '';
  const targetStreamId = targetClass?.stream_id || student.stream_id || '';

  const matchesStudent = (stdId: string | undefined | null) => {
    if (!stdId) return false;
    const str = String(stdId).trim().toLowerCase();
    if (student.id && String(student.id).trim().toLowerCase() === str) return true;
    if (student.admission_number && String(student.admission_number).trim().toLowerCase() === str) return true;
    return false;
  };

  const matchesExam = (mExamId: string | undefined | null) => {
    if (!mExamId || !examId) return true;
    if (mExamId === examId) return true;
    if (exam && (mExamId === exam.id || mExamId === (exam as any).exam_code || mExamId === (exam as any).exam_name)) return true;
    return false;
  };

  const studentMarks = marks.filter((m) => matchesStudent(m.student_id) && matchesExam(m.exam_id));

  const isUpperPrimarySubject = (s: Subject) => {
    if (!s) return false;
    if (s.education_level === 'Pre-Primary' || s.education_level === 'Lower Primary') return false;
    if ((s as any).learning_area === 'Pre-Primary' || (s as any).learning_area === 'Lower Primary') return false;
    if (s.subject_code?.startsWith('PP-') || s.subject_code?.startsWith('LP-')) return false;
    return true;
  };

  // Standalone Upper Primary: 8 Assessed Learning Areas (ENG, KIS, MATH, INT-SCI, SST, CRE, AGN, CAS)
  if (exam?.assessment_structure === 'Standalone') {
    const engSub = subjects.find((s) => isUpperPrimarySubject(s) && isEnglishLanguage(s) && !isEnglishComposition(s)) || subjects.find((s) => isEnglishLanguage(s) && !isEnglishComposition(s)) || { id: 'sb_up_eng', subject_code: 'ENG', subject_name: 'English', education_level: 'Upper Primary' } as Subject;
    const kiswSub = subjects.find((s) => isUpperPrimarySubject(s) && isKiswahiliLugha(s) && !isKiswahiliInsha(s)) || subjects.find((s) => isKiswahiliLugha(s) && !isKiswahiliInsha(s)) || { id: 'sb_up_kis', subject_code: 'KIS', subject_name: 'Kiswahili', education_level: 'Upper Primary' } as Subject;
    const mathSub = subjects.find((s) => isUpperPrimarySubject(s) && isMathematics(s)) || subjects.find(isMathematics) || { id: 'sb_up_math', subject_code: 'MATH', subject_name: 'Mathematics', education_level: 'Upper Primary' } as Subject;
    const sciSub = subjects.find((s) => isUpperPrimarySubject(s) && isIntegratedScience(s)) || subjects.find(isIntegratedScience) || { id: 'sb_up_sci', subject_code: 'INT-SCI', subject_name: 'Integrated Science', education_level: 'Upper Primary' } as Subject;
    const sstSub = subjects.find((s) => isUpperPrimarySubject(s) && isSocialStudies(s)) || subjects.find(isSocialStudies) || { id: 'sb_up_sst', subject_code: 'SST', subject_name: 'Social Studies', education_level: 'Upper Primary' } as Subject;
    const creSub = subjects.find((s) => isUpperPrimarySubject(s) && isChristianReligiousEducation(s)) || subjects.find(isChristianReligiousEducation) || { id: 'sb_up_cre', subject_code: 'CRE', subject_name: 'Christian Religious Education', education_level: 'Upper Primary' } as Subject;
    const agriSub = subjects.find((s) => s.id === 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f' || (s.subject_code || '').toUpperCase() === 'AGN' || (s.subject_code || '').toUpperCase() === 'AGR' || (s.subject_name || '').toLowerCase().includes('agriculture')) || { id: 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f', subject_code: 'AGN', subject_name: 'Agriculture', education_level: 'Upper Primary' } as Subject;
    const casSub = subjects.find((s) => isUpperPrimarySubject(s) && isCreativeArts(s)) || subjects.find(isCreativeArts) || { id: 'sb_up_cas', subject_code: 'CAS', subject_name: 'Creative Arts and Sports', education_level: 'Upper Primary' } as Subject;

    const standaloneOrder = [
      { sub: engSub, defaultCode: 'ENG', defaultName: 'English' },
      { sub: kiswSub, defaultCode: 'KIS', defaultName: 'Kiswahili' },
      { sub: mathSub, defaultCode: 'MATH', defaultName: 'Mathematics' },
      { sub: sciSub, defaultCode: 'INT-SCI', defaultName: 'Integrated Science' },
      { sub: sstSub, defaultCode: 'SST', defaultName: 'Social Studies' },
      { sub: creSub, defaultCode: 'CRE', defaultName: 'Christian Religious Education' },
      { sub: agriSub, defaultCode: 'AGN', defaultName: 'Agriculture' },
      { sub: casSub, defaultCode: 'CAS', defaultName: 'Creative Arts and Sports' },
    ];

    const standaloneStandardAreas: UpperPrimaryStandardArea[] = standaloneOrder.map(({ sub, defaultCode, defaultName }) => {
      let stdMark = studentMarks.find((m) => m.subject_id === sub.id || (sub.subject_code && m.subject_id === sub.subject_code));
      const evalRes = evaluateMark(stdMark, { subject: sub, classObj: targetClass, educationLevel: 'Upper Primary', examination: exam });
      const isKisw = isKiswahiliSubject(sub);
      const subTeacher = resolveSubjectTeacher(teachers, sub.id, targetClassId, targetStreamId);

      let rawScore = evalRes.rawScore;
      let percentage = evalRes.percentage;
      let status = evalRes.status;

      const gr = percentage !== null
        ? getGradeForMark(percentage, grades, 'Upper Primary', studentGrade)
        : { performance_level: 'ME', grade_code: 'ME', grade: 'ME', points: 0, remarks: 'Good Progress' };

      const roundedPct = percentage !== null ? Math.round(percentage) : null;
      const displayScore = status === 'Normal' && roundedPct !== null ? `${roundedPct}/100` : status === 'Y' ? 'Y' : 'X';
      const pctDisplay = status === 'Normal' && roundedPct !== null ? `${roundedPct}% ${gr.grade_code || gr.grade || ''}`.trim() : status;
      const pointsDisplay = status === 'Normal' ? `${gr.points} Pts` : status;
      const rank = status === 'Normal' ? calculateSubjectRank(student, sub.id, examId, allStudents, classes, marks, subjects) : '-';

      const defaultComment = isKisw
        ? getKiswahiliDefaultComment(percentage, status, evalRes.irregularityReason)
        : status === 'Normal' && percentage !== null
        ? getSubjectDefaultComment(percentage)
        : status === 'Y' ? `Irregularity (${evalRes.irregularityReason || 'Absent'})` : 'Missing Assessment (X)';

      const customComment = customSubjectComments[sub.id] || (sub.subject_code ? customSubjectComments[sub.subject_code] : '') || '';

      return {
        id: sub.id,
        subjectId: sub.id,
        code: sub.subject_code || defaultCode,
        name: sub.subject_name || defaultName,
        rawScore,
        outOf: 100,
        percentage,
        displayScore,
        pctDisplay,
        points: status === 'Normal' ? gr.points : 0,
        pointsDisplay,
        rank,
        defaultComment,
        customComment,
        effectiveComment: stripSurroundingQuotes(customComment || defaultComment),
        teacherName: subTeacher?.teacher_name || '',
        status,
        gradeCode: gr.grade_code || gr.grade || '',
        performanceLevel: gr.performance_level,
        isKiswahili: isKisw,
        isConsolidated: false,
      };
    });

    const evaluatedCount = 8;
    const maxPossibleMarks = 800;
    const maxPossiblePoints = 32;

    let totalMarks = 0;
    let totalPoints = 0;
    let isComplete = true;

    standaloneStandardAreas.forEach((area) => {
      if (area.status === 'Normal' && area.percentage !== null) {
        totalMarks += Math.round(area.percentage);
        totalPoints += area.points;
      } else {
        isComplete = false;
      }
    });

    const averageScore = evaluatedCount > 0 ? totalMarks / evaluatedCount : 0;
    const overallGrade = getGradeForMark(averageScore, grades, 'Upper Primary', studentGrade);

    const engArea = standaloneStandardAreas[0];
    const kiswArea = standaloneStandardAreas[1];

    const engConsolidated: UpperPrimaryConsolidatedArea = {
      ...engArea,
      components: [],
      isConsolidated: true,
    };
    const kiswConsolidated: UpperPrimaryConsolidatedArea = {
      ...kiswArea,
      components: [],
      isConsolidated: true,
    };

    return {
      isUpperPrimary: true,
      isStandalone: true,
      english: engConsolidated,
      kiswahili: kiswConsolidated,
      standardAreas: standaloneStandardAreas.slice(2),
      allReportAreas: standaloneStandardAreas,
      totalMarks,
      maxPossibleMarks,
      totalPoints,
      maxPossiblePoints,
      averageScore,
      overallLevel: isComplete ? overallGrade.performance_level : 'Pending',
      overallGradeCode: isComplete ? (overallGrade.grade_code || overallGrade.grade || 'ME') : 'Pending',
      isComplete,
    };
  }

  // Find authoritative subject entities (strictly matching Upper Primary tier over Lower/Pre-Primary)
  const engLangSub = subjects.find((s) => isUpperPrimarySubject(s) && isEnglishLanguage(s)) || subjects.find(isEnglishLanguage) || { id: 'sb_up_eng', subject_code: 'ENG', subject_name: 'English Language', education_level: 'Upper Primary' } as Subject;
  const engCompSub = subjects.find((s) => isUpperPrimarySubject(s) && isEnglishComposition(s)) || subjects.find(isEnglishComposition) || { id: 'sb_up_comp', subject_code: 'COMP', subject_name: 'English Composition', education_level: 'Upper Primary' } as Subject;
  const kiswLangSub = subjects.find((s) => isUpperPrimarySubject(s) && isKiswahiliLugha(s)) || subjects.find(isKiswahiliLugha) || { id: 'sb_up_kis', subject_code: 'KIS', subject_name: 'Kiswahili Lugha', education_level: 'Upper Primary' } as Subject;
  const kiswInshaSub = subjects.find((s) => isUpperPrimarySubject(s) && isKiswahiliInsha(s)) || subjects.find(isKiswahiliInsha) || { id: 'sb_up_insha', subject_code: 'INSHA', subject_name: 'Kiswahili Insha', education_level: 'Upper Primary' } as Subject;
  const mathSub = subjects.find((s) => isUpperPrimarySubject(s) && isMathematics(s)) || subjects.find((s) => isMathematics(s) && s.subject_code !== 'PP-MATH' && s.education_level !== 'Pre-Primary' && s.education_level !== 'Lower Primary') || subjects.find(isMathematics) || { id: 'sb_up_math', subject_code: 'MATH', subject_name: 'Mathematics', education_level: 'Upper Primary' } as Subject;
  const sciSub = subjects.find((s) => isUpperPrimarySubject(s) && isIntegratedScience(s)) || subjects.find(isIntegratedScience) || { id: 'sb_up_sci', subject_code: 'INT-SCI', subject_name: 'Integrated Science', education_level: 'Upper Primary' } as Subject;
  const casSub = subjects.find((s) => isUpperPrimarySubject(s) && isCreativeArts(s)) || subjects.find(isCreativeArts) || { id: 'sb_up_cas', subject_code: 'CAS', subject_name: 'Creative Arts and Sports', education_level: 'Upper Primary' } as Subject;
  const ssCreSub = subjects.find((s) => isUpperPrimarySubject(s) && isDirectSSCRE(s)) || subjects.find(isDirectSSCRE) || { id: 'sb_up_ss_cre', subject_code: 'SS&CRE', subject_name: 'Social Studies & CRE', education_level: 'Upper Primary' } as Subject;

  // 1. ENGLISH BREAKDOWN
  const engLangMark = studentMarks.find((m) => m.subject_id === engLangSub.id || (engLangSub.subject_code && m.subject_id === engLangSub.subject_code));
  const engCompMark = studentMarks.find((m) => m.subject_id === engCompSub.id || (engCompSub.subject_code && m.subject_id === engCompSub.subject_code));

  const evalEngLang = evaluateMark(engLangMark, { subject: engLangSub, classObj: targetClass, educationLevel: 'Upper Primary' });
  const evalEngComp = evaluateMark(engCompMark, { subject: engCompSub, classObj: targetClass, educationLevel: 'Upper Primary', isUpperPrimaryCompOrInsha: true });

  const engLangTeacher = resolveSubjectTeacher(teachers, engLangSub.id, targetClassId, targetStreamId);
  const engCompTeacher = resolveSubjectTeacher(teachers, engCompSub.id, targetClassId, targetStreamId) || engLangTeacher;

  const engComponents: UpperPrimaryComponentRow[] = [
    {
      code: 'ENG',
      name: 'English Language',
      maxScore: 60,
      rawScore: evalEngLang.rawScore,
      displayScore: evalEngLang.status === 'Normal' && evalEngLang.rawScore !== null ? `${evalEngLang.rawScore}` : evalEngLang.status === 'Y' ? 'Y' : 'X',
      status: evalEngLang.status,
      teacherName: engLangTeacher?.teacher_name || '',
      subjectId: engLangSub.id,
    },
    {
      code: 'COMP',
      name: 'English Composition',
      maxScore: 40,
      rawScore: evalEngComp.rawScore,
      displayScore: evalEngComp.status === 'Normal' && evalEngComp.rawScore !== null ? `${evalEngComp.rawScore}` : evalEngComp.status === 'Y' ? 'Y' : 'X',
      status: evalEngComp.status,
      teacherName: engCompTeacher?.teacher_name || '',
      subjectId: engCompSub.id,
    },
  ];

  // Consolidated English
  let engTotalRaw: number | null = null;
  let engStatus: 'Normal' | 'X' | 'Y' | 'Blank' = 'Blank';
  if (evalEngLang.status === 'Y' || evalEngComp.status === 'Y') {
    engStatus = 'Y';
  } else if (evalEngLang.status === 'X' && evalEngComp.status === 'X') {
    engStatus = 'X';
  } else if (evalEngLang.status === 'Normal' || evalEngComp.status === 'Normal') {
    engStatus = 'Normal';
    engTotalRaw = (evalEngLang.status === 'Normal' ? (evalEngLang.rawScore ?? 0) : 0) +
                  (evalEngComp.status === 'Normal' ? (evalEngComp.rawScore ?? 0) : 0);
  }

  const engGrade = engTotalRaw !== null
    ? getGradeForMark(engTotalRaw, grades, 'Upper Primary', studentGrade)
    : { performance_level: 'ME', grade_code: 'ME', grade: 'ME', points: 0, remarks: 'Good Progress' };

  const engScoreDisplay = engStatus === 'Normal' && engTotalRaw !== null ? `${engTotalRaw}/100` : engStatus;
  const engPctDisplay = engStatus === 'Normal' && engTotalRaw !== null ? `${engTotalRaw}% ${engGrade.grade_code || engGrade.grade || ''}`.trim() : engStatus;
  const engPointsDisplay = engStatus === 'Normal' ? `${engGrade.points} Pts` : engStatus;
  const engRank = engStatus === 'Normal' ? calculateSubjectRank(student, 'synth_english_composite', examId, allStudents, classes, marks, subjects) : '-';
  const engDefaultComment = engStatus === 'Normal' && engTotalRaw !== null
    ? getSubjectDefaultComment(engTotalRaw)
    : engStatus === 'Y' ? `Irregularity (${evalEngLang.irregularityReason || evalEngComp.irregularityReason || 'Absent'})` : 'Missing Assessment (X)';
  const engCustomComment = customSubjectComments['synth_english_composite'] || customSubjectComments['sb_up_eng'] || customSubjectComments[engLangSub.id] || '';

  const englishConsolidated: UpperPrimaryConsolidatedArea = {
    id: 'synth_english_composite',
    subjectId: 'synth_english_composite',
    code: 'ENG',
    name: 'English',
    components: engComponents,
    rawScore: engTotalRaw,
    outOf: 100,
    percentage: engTotalRaw,
    displayScore: engScoreDisplay,
    pctDisplay: engPctDisplay,
    points: engStatus === 'Normal' ? engGrade.points : 0,
    pointsDisplay: engPointsDisplay,
    rank: engRank,
    defaultComment: engDefaultComment,
    customComment: engCustomComment,
    effectiveComment: stripSurroundingQuotes(engCustomComment || engDefaultComment),
    teacherName: engLangTeacher?.teacher_name || '',
    status: engStatus,
    gradeCode: engGrade.grade_code || engGrade.grade || '',
    performanceLevel: engGrade.performance_level,
    isKiswahili: false,
    isConsolidated: true,
  };

  // 2. KISWAHILI BREAKDOWN
  const kiswLangMark = studentMarks.find((m) => m.subject_id === kiswLangSub.id || (kiswLangSub.subject_code && m.subject_id === kiswLangSub.subject_code));
  const kiswInshaMark = studentMarks.find((m) => m.subject_id === kiswInshaSub.id || (kiswInshaSub.subject_code && m.subject_id === kiswInshaSub.subject_code));

  const evalKiswLang = evaluateMark(kiswLangMark, { subject: kiswLangSub, classObj: targetClass, educationLevel: 'Upper Primary' });
  const evalKiswInsha = evaluateMark(kiswInshaMark, { subject: kiswInshaSub, classObj: targetClass, educationLevel: 'Upper Primary', isUpperPrimaryCompOrInsha: true });

  const kiswLangTeacher = resolveSubjectTeacher(teachers, kiswLangSub.id, targetClassId, targetStreamId);
  const kiswInshaTeacher = resolveSubjectTeacher(teachers, kiswInshaSub.id, targetClassId, targetStreamId) || kiswLangTeacher;

  const kiswComponents: UpperPrimaryComponentRow[] = [
    {
      code: 'KIS',
      name: 'Kiswahili Lugha',
      maxScore: 60,
      rawScore: evalKiswLang.rawScore,
      displayScore: evalKiswLang.status === 'Normal' && evalKiswLang.rawScore !== null ? `${evalKiswLang.rawScore}` : evalKiswLang.status === 'Y' ? 'Y' : 'X',
      status: evalKiswLang.status,
      teacherName: kiswLangTeacher?.teacher_name || '',
      subjectId: kiswLangSub.id,
    },
    {
      code: 'INSHA',
      name: 'Kiswahili Insha',
      maxScore: 40,
      rawScore: evalKiswInsha.rawScore,
      displayScore: evalKiswInsha.status === 'Normal' && evalKiswInsha.rawScore !== null ? `${evalKiswInsha.rawScore}` : evalKiswInsha.status === 'Y' ? 'Y' : 'X',
      status: evalKiswInsha.status,
      teacherName: kiswInshaTeacher?.teacher_name || '',
      subjectId: kiswInshaSub.id,
    },
  ];

  // Consolidated Kiswahili
  let kiswTotalRaw: number | null = null;
  let kiswStatus: 'Normal' | 'X' | 'Y' | 'Blank' = 'Blank';
  if (evalKiswLang.status === 'Y' || evalKiswInsha.status === 'Y') {
    kiswStatus = 'Y';
  } else if (evalKiswLang.status === 'X' && evalKiswInsha.status === 'X') {
    kiswStatus = 'X';
  } else if (evalKiswLang.status === 'Normal' || evalKiswInsha.status === 'Normal') {
    kiswStatus = 'Normal';
    kiswTotalRaw = (evalKiswLang.status === 'Normal' ? (evalKiswLang.rawScore ?? 0) : 0) +
                   (evalKiswInsha.status === 'Normal' ? (evalKiswInsha.rawScore ?? 0) : 0);
  }

  const kiswGrade = kiswTotalRaw !== null
    ? getGradeForMark(kiswTotalRaw, grades, 'Upper Primary', studentGrade)
    : { performance_level: 'ME', grade_code: 'ME', grade: 'ME', points: 0, remarks: 'Vizuri' };

  const kiswScoreDisplay = kiswStatus === 'Normal' && kiswTotalRaw !== null ? `${kiswTotalRaw}/100` : kiswStatus;
  const kiswPctDisplay = kiswStatus === 'Normal' && kiswTotalRaw !== null ? `${kiswTotalRaw}% ${kiswGrade.grade_code || kiswGrade.grade || ''}`.trim() : kiswStatus;
  const kiswPointsDisplay = kiswStatus === 'Normal' ? `${kiswGrade.points} Pts` : kiswStatus;
  const kiswRank = kiswStatus === 'Normal' ? calculateSubjectRank(student, 'synth_kiswahili_composite', examId, allStudents, classes, marks, subjects) : '-';
  const kiswDefaultComment = getKiswahiliDefaultComment(
    kiswTotalRaw,
    kiswStatus,
    evalKiswLang.irregularityReason || evalKiswInsha.irregularityReason
  );
  const kiswCustomComment = customSubjectComments['synth_kiswahili_composite'] || customSubjectComments['sb_up_kis'] || customSubjectComments[kiswLangSub.id] || '';

  const kiswahiliConsolidated: UpperPrimaryConsolidatedArea = {
    id: 'synth_kiswahili_composite',
    subjectId: 'synth_kiswahili_composite',
    code: 'KIS',
    name: 'Kiswahili',
    components: kiswComponents,
    rawScore: kiswTotalRaw,
    outOf: 100,
    percentage: kiswTotalRaw,
    displayScore: kiswScoreDisplay,
    pctDisplay: kiswPctDisplay,
    points: kiswStatus === 'Normal' ? kiswGrade.points : 0,
    pointsDisplay: kiswPointsDisplay,
    rank: kiswRank,
    defaultComment: kiswDefaultComment,
    customComment: kiswCustomComment,
    effectiveComment: stripSurroundingQuotes(kiswCustomComment || kiswDefaultComment),
    teacherName: kiswLangTeacher?.teacher_name || '',
    status: kiswStatus,
    gradeCode: kiswGrade.grade_code || kiswGrade.grade || '',
    performanceLevel: kiswGrade.performance_level,
    isKiswahili: true,
    isConsolidated: true,
  };

  // 3. OTHER STANDARD UPPER PRIMARY LEARNING AREAS (MATH, INT-SCI, CAS, SS&CRE)
  const coreOtherSubjects = [
    { sub: mathSub, defaultCode: 'MATH', defaultName: 'Mathematics' },
    { sub: sciSub, defaultCode: 'INT-SCI', defaultName: 'Integrated Science' },
    { sub: casSub, defaultCode: 'CAS', defaultName: 'Creative Arts and Sports' },
    { sub: ssCreSub, defaultCode: 'SS&CRE', defaultName: 'Social Studies & CRE' },
  ];

  // Helper to build a standard learning area row
  const buildStandardArea = (sub: Subject, defaultCode: string, defaultName: string): UpperPrimaryStandardArea => {
    const isSsCre = isDirectSSCRE(sub) || sub.id === 'sb_up_ss_cre' || sub.subject_code === 'SS&CRE';
    let stdMark = studentMarks.find((m) => m.subject_id === sub.id || (sub.subject_code && m.subject_id === sub.subject_code));

    if (!stdMark && isSsCre) {
      // Check composite SST + CRE
      const sstMark = studentMarks.find((m) => isSocialStudies({ id: m.subject_id }));
      const creMark = studentMarks.find((m) => isChristianReligiousEducation({ id: m.subject_id }));
      if (sstMark || creMark) {
        const compRes = getUpperPrimaryCompositeSubjectMarks([sstMark, creMark].filter(Boolean) as Mark[], subjects, 'Upper Primary', exam);
        stdMark = compRes.processedMarks.find((m) => isDirectSSCRE({ id: m.subject_id }));
      }
    }

    const evalRes = evaluateMark(stdMark, { subject: sub, classObj: targetClass, educationLevel: 'Upper Primary' });
    const isKisw = isKiswahiliSubject(sub);
    const subTeacher = resolveSubjectTeacher(teachers, sub.id, targetClassId, targetStreamId);

    let rawScore = evalRes.rawScore;
    let percentage = evalRes.percentage;
    let status = evalRes.status;

    const gr = percentage !== null
      ? getGradeForMark(percentage, grades, 'Upper Primary', studentGrade)
      : { performance_level: 'ME', grade_code: 'ME', grade: 'ME', points: 0, remarks: 'Good Progress' };

    const roundedPct = percentage !== null ? Math.round(percentage) : null;
    const displayScore = status === 'Normal' && roundedPct !== null ? `${roundedPct}/100` : status === 'Y' ? 'Y' : 'X';
    const pctDisplay = status === 'Normal' && roundedPct !== null ? `${roundedPct}% ${gr.grade_code || gr.grade || ''}`.trim() : status;
    const pointsDisplay = status === 'Normal' ? `${gr.points} Pts` : status;
    const rank = status === 'Normal' ? calculateSubjectRank(student, sub.id, examId, allStudents, classes, marks, subjects) : '-';
    
    const defaultComment = isKisw
      ? getKiswahiliDefaultComment(percentage, status, evalRes.irregularityReason)
      : status === 'Normal' && percentage !== null
      ? getSubjectDefaultComment(percentage)
      : status === 'Y' ? `Irregularity (${evalRes.irregularityReason || 'Absent'})` : 'Missing Assessment (X)';

    const customComment = customSubjectComments[sub.id] || '';

    return {
      id: sub.id,
      subjectId: sub.id,
      code: sub.subject_code || defaultCode,
      name: sub.subject_name || defaultName,
      rawScore,
      outOf: 100,
      percentage,
      displayScore,
      pctDisplay,
      points: status === 'Normal' ? gr.points : 0,
      pointsDisplay,
      rank,
      defaultComment,
      customComment,
      effectiveComment: stripSurroundingQuotes(customComment || defaultComment),
      teacherName: subTeacher?.teacher_name || '',
      status,
      gradeCode: gr.grade_code || gr.grade || '',
      performanceLevel: gr.performance_level,
      isKiswahili: isKisw,
      isConsolidated: false,
    };
  };

  const standardAreas: UpperPrimaryStandardArea[] = coreOtherSubjects.map(({ sub, defaultCode, defaultName }) =>
    buildStandardArea(sub, defaultCode, defaultName)
  );

  // Check for any additional optional subjects allocated to learner
  const handledIds = new Set([
    engLangSub.id, engCompSub.id, 'synth_english_composite',
    kiswLangSub.id, kiswInshaSub.id, 'synth_kiswahili_composite',
    mathSub.id, sciSub.id, casSub.id, ssCreSub.id, 'sb_up_ss_cre', 'sb_sst', 'sb_cre'
  ]);

  // Populate handledIds with any other subjects that match core subjects or pre-primary
  subjects.forEach((sb) => {
    if (
      isEnglishLanguage(sb) || isEnglishComposition(sb) ||
      isKiswahiliLugha(sb) || isKiswahiliInsha(sb) ||
      isMathematics(sb) || isIntegratedScience(sb) ||
      isCreativeArts(sb) || isSocialStudies(sb) ||
      isChristianReligiousEducation(sb) || isDirectSSCRE(sb) ||
      sb.education_level === 'Pre-Primary' || sb.education_level === 'Lower Primary' ||
      sb.subject_code === 'PP-MATH' || sb.subject_code?.startsWith('PP-') || sb.subject_code?.startsWith('LP-')
    ) {
      handledIds.add(sb.id);
    }
  });

  subjects.forEach((sb) => {
    if (handledIds.has(sb.id)) return;
    // Check if learner has a mark or is enrolled
    const hasMark = studentMarks.some((m) => m.subject_id === sb.id);
    if (hasMark) {
      handledIds.add(sb.id);
      standardAreas.push(buildStandardArea(sb, sb.subject_code || 'OPT', sb.subject_name || 'Elective'));
    }
  });

  const allReportAreas = [
    englishConsolidated,
    kiswahiliConsolidated,
    ...standardAreas,
  ];

  // TOTALS & AGGREGATIONS (Strictly out of 600 marks, 24 points for the 6 core areas)
  const evaluatedCount = allReportAreas.length || 6;
  const maxPossibleMarks = evaluatedCount * 100;
  const maxPossiblePoints = evaluatedCount * 4;

  let totalMarks = 0;
  let totalPoints = 0;
  let normalCount = 0;
  let isComplete = true;

  allReportAreas.forEach((area) => {
    if (area.status === 'Normal' && area.percentage !== null) {
      totalMarks += Math.round(area.percentage);
      totalPoints += area.points;
      normalCount++;
    } else {
      isComplete = false;
    }
  });

  const averageScore = evaluatedCount > 0 ? (totalMarks / evaluatedCount) : 0;
  const overallGrade = getGradeForMark(averageScore, grades, 'Upper Primary', studentGrade);

  return {
    isUpperPrimary: true,
    english: englishConsolidated,
    kiswahili: kiswahiliConsolidated,
    standardAreas,
    allReportAreas,
    totalMarks,
    maxPossibleMarks,
    totalPoints: totalPoints,
    maxPossiblePoints,
    averageScore,
    overallLevel: isComplete ? overallGrade.performance_level : 'Pending',
    overallGradeCode: isComplete ? (overallGrade.grade_code || overallGrade.grade || 'ME') : 'Pending',
    isComplete,
  };
}
