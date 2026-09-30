import {
  Mark,
  SubjectStatus,
  normalizeGradeName,
  Subject,
  UpperPrimarySSCREStructure,
  Examination,
  Student,
  ClassStream,
  Teacher,
  getEducationLevelForGrade,
  extractGradeName,
  getAllocatedSubjectsForClass,
  getApplicableSubjectsForGrade,
} from '../types';
import { isGrade6OpenerTerm32026 } from './examDisplayUtils';

export interface EvaluatedMark {
  status: SubjectStatus;
  percentage: number | null;
  rawScore: number | null;
  outOf: number;
  irregularityReason?: string;
  displayScore: string;
  displayPercentage: string;
  displayStatus: string;
  isRawScoreOnly?: boolean;
}

/**
 * Verifies whether an assessment, subject, and class context represent Upper Primary English Composition (COMP) or Kiswahili Insha (INSHA).
 * Strict boundaries:
 * - Upper Primary Grades 4, 5 and 6 ONLY
 * - Subject code "COMP" or "INSHA" ONLY
 * Does NOT apply to Pre-Primary, Lower Primary, Junior School, English generally (ENG), Kiswahili generally (KIS/KISW), or other Upper Primary subjects.
 */
export function isUpperPrimaryCompOrInsha(
  subject?: { subject_code?: string; code?: string; id?: string; name?: string; subject_name?: string; learning_area?: string; education_level?: string } | null,
  classObj?: { class_name?: string; education_level?: string } | null,
  educationLevel?: string | null,
  examOrStructure?: Examination | { assessment_structure?: string } | string | null
): boolean {
  if (!subject) return false;

  const isStandalone =
    typeof examOrStructure === 'object' && examOrStructure !== null
      ? (examOrStructure as any).assessment_structure === 'Standalone'
      : examOrStructure === 'Standalone';
  if (isStandalone) return false;

  const code = (subject.subject_code || subject.code || '').trim().toUpperCase();
  const name = (subject.subject_name || subject.name || subject.learning_area || '').trim().toUpperCase();
  const id = (subject.id || '').trim().toLowerCase();

  const isSyntheticComposite = id.startsWith('synth_') || id.includes('composite');
  if (isSyntheticComposite) return false;

  const isCompOrInshaCode = code === 'COMP' || code === 'INSHA' || name.includes('COMPOSITION') || name.includes('INSHA') || id.includes('_comp') || id.includes('_insha');
  if (!isCompOrInshaCode) return false;

  // Resolve resolved education level from classObj, explicit educationLevel, or subject.education_level
  let resolvedLevel: string | undefined = undefined;
  if (classObj) {
    if (classObj.class_name) {
      resolvedLevel = getEducationLevelForGrade(classObj.class_name);
    } else if (classObj.education_level) {
      resolvedLevel = classObj.education_level;
    }
  }

  if (!resolvedLevel && educationLevel) {
    resolvedLevel = educationLevel;
  }

  if (!resolvedLevel && subject.education_level) {
    resolvedLevel = subject.education_level;
  }

  return resolvedLevel === 'Upper Primary';
}

/**
 * Verifies whether an assessment, subject, and class context represent Upper Primary English Language (ENG) or Kiswahili Lugha (KIS/KISW) - marked out of 60.
 * Strict boundaries:
 * - Upper Primary Grades 4, 5 and 6 ONLY
 * Does NOT apply to Pre-Primary, Lower Primary (Grades 1-3), Junior School (Grades 7-9), or Composition/Insha (COMP/INSHA).
 */
export function isUpperPrimaryLanguage(
  subject?: { subject_code?: string; code?: string; id?: string; name?: string; subject_name?: string; learning_area?: string; education_level?: string } | null,
  classObj?: { class_name?: string; education_level?: string } | null,
  educationLevel?: string | null,
  examOrStructure?: Examination | { assessment_structure?: string } | string | null
): boolean {
  if (!subject) return false;

  const isStandalone =
    typeof examOrStructure === 'object' && examOrStructure !== null
      ? (examOrStructure as any).assessment_structure === 'Standalone'
      : examOrStructure === 'Standalone';
  if (isStandalone) return false;

  const code = (subject.subject_code || subject.code || '').trim().toUpperCase();
  const name = (subject.subject_name || subject.name || subject.learning_area || '').trim().toUpperCase();
  const id = (subject.id || '').trim().toLowerCase();

  const isCompOrInshaCode = code === 'COMP' || code === 'INSHA' || name.includes('COMPOSITION') || name.includes('INSHA') || id.includes('_comp') || id.includes('_insha');
  if (isCompOrInshaCode) return false;

  const isSyntheticComposite = id.startsWith('synth_') || id.includes('composite');
  if (isSyntheticComposite) return false;

  const isLangCode = isEnglishLanguage(subject) || isKiswahiliLugha(subject);
  if (!isLangCode) return false;

  // Resolve resolved education level from classObj, explicit educationLevel, or subject.education_level
  let resolvedLevel: string | undefined = undefined;
  if (classObj) {
    if (classObj.class_name) {
      resolvedLevel = getEducationLevelForGrade(classObj.class_name);
    } else if (classObj.education_level) {
      resolvedLevel = classObj.education_level;
    }
  }

  if (!resolvedLevel && educationLevel) {
    resolvedLevel = educationLevel;
  }

  if (!resolvedLevel && subject.education_level) {
    resolvedLevel = subject.education_level;
  }

  return resolvedLevel === 'Upper Primary';
}

export function evaluateMark(
  mark?: Mark | null,
  options?: {
    isUpperPrimaryCompOrInsha?: boolean;
    isUpperPrimaryLanguage?: boolean;
    subject?: { subject_code?: string; code?: string; id?: string; name?: string; subject_name?: string; learning_area?: string; education_level?: string } | null;
    classObj?: { class_name?: string; education_level?: string } | null;
    educationLevel?: string | null;
    examination?: Examination | { assessment_structure?: string } | null;
  }
): EvaluatedMark {
  if (!mark) {
    return {
      status: 'Blank',
      percentage: null,
      rawScore: null,
      outOf: 100,
      displayScore: '',
      displayPercentage: '',
      displayStatus: 'Blank',
    };
  }

  const rawMarkStr = typeof mark.marks === 'string' ? (mark.marks as string).trim().toUpperCase() : '';

  // Explicit status check
  if (mark.special_status === 'X' || rawMarkStr === 'X') {
    return {
      status: 'X',
      percentage: null,
      rawScore: null,
      outOf: mark.out_of && mark.out_of <= 50 ? mark.out_of : 100,
      displayScore: 'X',
      displayPercentage: 'X',
      displayStatus: 'X (Missing Mark)',
    };
  }

  if (mark.special_status === 'Y' || rawMarkStr === 'Y') {
    const reason = mark.irregularity_reason || 'Absent';
    return {
      status: 'Y',
      percentage: null,
      rawScore: null,
      outOf: mark.out_of && mark.out_of <= 50 ? mark.out_of : 100,
      irregularityReason: reason,
      displayScore: 'Y',
      displayPercentage: 'Y',
      displayStatus: `Y (${reason})`,
    };
  }

  if (mark.special_status === 'Blank' || rawMarkStr === 'BLANK' || rawMarkStr === '-') {
    return {
      status: 'Blank',
      percentage: null,
      rawScore: null,
      outOf: mark.out_of && mark.out_of <= 50 ? mark.out_of : 100,
      displayScore: '',
      displayPercentage: '',
      displayStatus: 'Blank',
    };
  }

  // Normal numerical score
  const numRaw = typeof mark.raw_score === 'number' && !isNaN(mark.raw_score)
    ? mark.raw_score
    : (typeof (mark as any).score === 'number' && !isNaN((mark as any).score))
      ? (mark as any).score
      : (typeof mark.raw_score === 'string' && (mark.raw_score as string).trim() !== '' && !isNaN(Number(mark.raw_score)))
        ? Number(mark.raw_score)
        : (typeof (mark as any).score === 'string' && ((mark as any).score as string).trim() !== '' && !isNaN(Number((mark as any).score)))
          ? Number((mark as any).score)
          : NaN;

  const numMarks = typeof mark.marks === 'number' && !isNaN(mark.marks)
    ? mark.marks
    : (typeof mark.marks === 'string' && (mark.marks as string).trim() !== '' && !isNaN(Number(mark.marks)))
      ? Number(mark.marks)
      : (typeof (mark as any).percentage === 'number' && !isNaN((mark as any).percentage))
        ? (mark as any).percentage
        : NaN;

  const hasRawScore = !isNaN(numRaw);
  const hasMarks = !isNaN(numMarks);

  if (hasRawScore || hasMarks) {
    const rawScore = hasRawScore ? numRaw : numMarks;
    const isStandaloneExam =
      options?.examination && typeof options.examination === 'object'
        ? (options.examination as any).assessment_structure === 'Standalone'
        : (options?.examination as unknown) === 'Standalone';
    const isCompInsha = !isStandaloneExam && (options?.isUpperPrimaryCompOrInsha ?? (
      options?.subject ? isUpperPrimaryCompOrInsha(options.subject, options.classObj, options.educationLevel) : false
    ));
    const isLang60 = !isStandaloneExam && (options?.isUpperPrimaryLanguage ?? (
      options?.subject ? isUpperPrimaryLanguage(options.subject, options.classObj, options.educationLevel, options?.examination) : false
    ));

    if (isCompInsha) {
      let outOf = 40;
      if (mark.out_of && mark.out_of > 0 && mark.out_of <= 50) {
        outOf = mark.out_of;
      } else {
        outOf = 40;
      }
      const percentage = outOf > 0 ? (rawScore / outOf) * 100 : rawScore;
      const clampedPct = Math.min(100, Math.max(0, percentage));
      return {
        status: 'Normal',
        percentage: clampedPct,
        rawScore,
        outOf,
        displayScore: `${rawScore}`,
        displayPercentage: `${rawScore}`,
        displayStatus: 'Normal',
        isRawScoreOnly: true,
      };
    }

    let outOf = 100;
    if (isLang60) {
      if (mark.out_of && mark.out_of > 60) {
        outOf = mark.out_of;
      } else {
        outOf = mark.out_of && mark.out_of > 0 && mark.out_of <= 60 ? mark.out_of : 60;
      }
    } else {
      outOf = mark.out_of && mark.out_of > 0 ? mark.out_of : 100;
    }
    const percentage = outOf > 0 ? (rawScore / outOf) * 100 : rawScore;
    const clampedPct = Math.min(100, Math.max(0, percentage));

    return {
      status: 'Normal',
      percentage: clampedPct,
      rawScore,
      outOf,
      displayScore: outOf !== 100 ? `${rawScore}/${outOf}` : formatPercentage(clampedPct),
      displayPercentage: formatPercentage(clampedPct, true),
      displayStatus: 'Normal',
    };
  }

  return {
    status: 'Blank',
    percentage: null,
    rawScore: null,
    outOf: 100,
    displayScore: '',
    displayPercentage: '',
    displayStatus: 'Blank',
  };
}

export const IRREGULARITY_REASONS = [
  'Absent',
  'Examination Malpractice',
  'Withheld Result',
  'Medical Absence',
  'Exempted',
];

/**
 * Consistently rounds a percentage value to the nearest whole number integer, returning a number.
 * E.g., 74.2 -> 74, 74.5 -> 75, 74.8 -> 75
 */
export function roundPercentage(val: number | string | null | undefined): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  if (isNaN(num)) return null;
  return Math.round(num);
}

/**
 * Formats a percentage or average mark for user display.
 * Displays whole numbers where appropriate (e.g. 56%), or max 1 decimal place without trailing zeros (e.g. 56.3%).
 */
export function formatPercentage(
  val: number | string | null | undefined,
  includeSymbol: boolean = false,
  fallback: string = '-'
): string {
  if (val === null || val === undefined || val === '') return fallback;
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  if (isNaN(num)) return String(val);

  const rounded = roundPercentage(num);
  if (rounded === null) return fallback;

  const str = String(rounded);
  return includeSymbol ? `${str}%` : str;
}

/**
 * Formats an Average Mark for Merit List display to exactly one decimal place.
 * E.g., 78 -> "78.0", 78.456 -> "78.5", 91.24 -> "91.2", 100 -> "100.0", null -> "-"
 */
export function formatAverageMark(
  val: number | string | null | undefined,
  fallback: string = '-'
): string {
  if (val === null || val === undefined || val === '') return fallback;
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  if (isNaN(num)) return fallback;
  return (Math.round(num * 10) / 10).toFixed(1);
}

/**
 * Formats a Learning Area / Subject Average Mark for Merit List summary display to exactly two decimal places.
 * E.g., 85.666... -> "85.67", 75 -> "75.00", 59.4 -> "59.40", 68.125 -> "68.13", 80 -> "80.00", null -> "-"
 */
export function formatTwoDecimalAverage(
  val: number | string | null | undefined,
  fallback: string = '-'
): string {
  if (val === null || val === undefined || val === '') return fallback;
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  if (isNaN(num)) return fallback;
  return (Math.round((num + Number.EPSILON) * 100) / 100).toFixed(2);
}

/**
 * Utility to consistently round a numerical mark or percentage to the nearest integer.
 * Handles numbers, numeric strings, and null/undefined values gracefully.
 */
export function roundMark(mark: number | string | null | undefined): number | null {
  if (mark === null || mark === undefined || mark === '') return null;
  const num = typeof mark === 'number' ? mark : parseFloat(String(mark));
  if (isNaN(num)) return null;
  return Math.round(num);
}

/**
 * Abbreviates CBE performance levels to short form (EE, ME, AE, BE).
 */
export function getAbbreviatedLevel(levelStr?: string | null, gradeCode?: string | null): string {
  if (gradeCode) {
    const gc = gradeCode.toUpperCase();
    if (gc.startsWith('EE')) return 'EE';
    if (gc.startsWith('ME')) return 'ME';
    if (gc.startsWith('AE')) return 'AE';
    if (gc.startsWith('BE')) return 'BE';
  }
  if (!levelStr) return '-';
  const str = levelStr.trim().toUpperCase();
  if (str.includes('EXCEEDING') || str === 'EE') return 'EE';
  if (str.includes('MEETING') || str === 'ME') return 'ME';
  if (str.includes('APPROACHING') || str === 'AE') return 'AE';
  if (str.includes('BELOW') || str === 'BE') return 'BE';
  if (str === 'ABSENT' || str === 'X') return 'Absent';
  if (str === 'IRREGULARITY' || str === 'Y') return 'Irregularity';
  if (str === 'PENDING' || str === 'PROVISIONAL') return 'Pending';
  return levelStr;
}

/**
 * Returns concise 1-2 word remarks for tables (e.g., Outstanding, Excellent, Good, Satisfactory, Developing, Needs Support, Intervention Required).
 */
export function getShortRemark(remarkStr?: string | null, gradeCode?: string | null): string {
  if (gradeCode) {
    const gc = gradeCode.toUpperCase();
    if (gc === 'EE1') return 'Outstanding';
    if (gc === 'EE2') return 'Excellent';
    if (gc === 'ME1') return 'Good';
    if (gc === 'ME2') return 'Satisfactory';
    if (gc === 'AE1') return 'Developing';
    if (gc === 'AE2') return 'Needs Support';
    if (gc === 'BE1') return 'Needs Support';
    if (gc === 'BE2') return 'Intervention Required';
  }

  if (!remarkStr) return '-';
  const upper = remarkStr.toUpperCase();
  if (upper.includes('OUTSTANDING')) return 'Outstanding';
  if (upper.includes('EXCELLENT')) return 'Excellent';
  if (upper.includes('GOOD')) return 'Good';
  if (upper.includes('SATISFACTORY')) return 'Satisfactory';
  if (upper.includes('DEVELOPING')) return 'Developing';
  if (upper.includes('NEEDS MORE PRACTICE') || upper.includes('NEEDS PRACTICE')) return 'Needs Support';
  if (upper.includes('NEEDS SUPPORT')) return 'Needs Support';
  if (upper.includes('INTERVENTION') || upper.includes('IMMEDIATE SUPPORT')) return 'Intervention Required';
  if (upper.includes('ABSENT')) return 'Absent';
  if (upper.includes('IRREGULARITY')) return 'Irregularity';
  if (upper.includes('PENDING') || upper.includes('PROVISIONAL')) return 'Pending';

  return remarkStr.length > 20 ? `${remarkStr.substring(0, 18)}..` : remarkStr;
}

export interface CompositeLanguageResult {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  rawScore: number;
  outOf: number;
  percentage: number;
  componentMarks: {
    language?: { rawScore: number; outOf: number; markRecord?: Mark };
    compositionOrInsha?: { rawScore: number; outOf: number; markRecord?: Mark };
  };
}

/**
 * Checks if a subject is English Language (non-composition)
 */
export function isEnglishLanguage(subject?: { subject_code?: string; code?: string; subject_name?: string; name?: string; id?: string } | null): boolean {
  if (!subject) return false;
  const code = (subject.subject_code || subject.code || '').trim().toUpperCase();
  const name = (subject.subject_name || subject.name || '').trim().toUpperCase();
  const id = (subject.id || '').trim().toLowerCase();
  if (code === 'COMP' || name.includes('COMPOSITION') || id.includes('_comp')) return false;
  return code === 'ENG' || code === 'ENGLISH' || name.includes('ENGLISH') || id.includes('eng');
}

/**
 * Checks if a subject is English Composition (component marked out of 40)
 */
export function isEnglishComposition(subject?: { subject_code?: string; code?: string; subject_name?: string; name?: string; id?: string } | null): boolean {
  if (!subject) return false;
  const code = (subject.subject_code || subject.code || '').trim().toUpperCase();
  const name = (subject.subject_name || subject.name || '').trim().toUpperCase();
  const id = (subject.id || '').trim().toLowerCase();
  return code === 'COMP' || code === 'ENG COMP' || name.includes('COMPOSITION') || id.includes('_comp');
}

/**
 * Checks if a subject is Kiswahili Lugha (non-insha)
 */
export function isKiswahiliLugha(subject?: { subject_code?: string; code?: string; subject_name?: string; name?: string; id?: string } | null): boolean {
  if (!subject) return false;
  const code = (subject.subject_code || subject.code || '').trim().toUpperCase();
  const name = (subject.subject_name || subject.name || '').trim().toUpperCase();
  const id = (subject.id || '').trim().toLowerCase();
  if (code === 'INSHA' || name.includes('INSHA') || id.includes('_insha')) return false;
  return code === 'KIS' || code === 'KISW' || code === 'KISWAHILI' || name.includes('KISWAHILI') || name.includes('LUGHA') || id.includes('kis');
}

/**
 * Checks if a subject is Kiswahili Insha (component marked out of 40)
 */
export function isKiswahiliInsha(subject?: { subject_code?: string; code?: string; subject_name?: string; name?: string; id?: string } | null): boolean {
  if (!subject) return false;
  const code = (subject.subject_code || subject.code || '').trim().toUpperCase();
  const name = (subject.subject_name || subject.name || '').trim().toUpperCase();
  const id = (subject.id || '').trim().toLowerCase();
  return code === 'INSHA' || code === 'KIS INSHA' || name.includes('INSHA') || id.includes('_insha');
}

/**
 * Checks if a subject is Mathematics
 */
export function isMathematics(subject?: { subject_code?: string; code?: string; subject_name?: string; name?: string; id?: string } | null): boolean {
  if (!subject) return false;
  const code = (subject.subject_code || subject.code || '').trim().toUpperCase();
  const name = (subject.subject_name || subject.name || '').trim().toUpperCase();
  const id = (subject.id || '').trim().toLowerCase();
  return code === 'MATH' || code === 'MATHS' || code === 'MATHEMATICS' || name.includes('MATH') || id.includes('math');
}

/**
 * Checks if a subject is Integrated Science / Science
 */
export function isIntegratedScience(subject?: { subject_code?: string; code?: string; subject_name?: string; name?: string; id?: string } | null): boolean {
  if (!subject) return false;
  const code = (subject.subject_code || subject.code || '').trim().toUpperCase();
  const name = (subject.subject_name || subject.name || '').trim().toUpperCase();
  const id = (subject.id || '').trim().toLowerCase();
  return code === 'IS' || code === 'INT SCI' || code === 'SCI' || name.includes('INTEGRATED SCIENCE') || name.includes('SCIENCE') || id.includes('sci');
}

/**
 * Checks if a subject is Creative Arts & Sports (CAS)
 */
export function isCreativeArts(subject?: { subject_code?: string; code?: string; subject_name?: string; name?: string; id?: string } | null): boolean {
  if (!subject) return false;
  const code = (subject.subject_code || subject.code || '').trim().toUpperCase();
  const name = (subject.subject_name || subject.name || '').trim().toUpperCase();
  const id = (subject.id || '').trim().toLowerCase();
  return code === 'CAS' || code === 'CREATIVE ARTS' || code === 'ART' || name.includes('CREATIVE ARTS') || name.includes('CAS') || id.includes('art') || id.includes('cas');
}
/**
 * Checks if a subject represents Social Studies (standalone component, non-composite).
 */
export function isSocialStudies(subject?: { subject_code?: string; code?: string; id?: string; subject_name?: string; name?: string; learning_area?: string } | null): boolean {
  if (!subject) return false;
  const code = (subject.subject_code || subject.code || '').trim().toUpperCase();
  const name = (subject.subject_name || subject.name || subject.learning_area || '').trim().toUpperCase();
  const id = (subject.id || '').trim().toLowerCase();
  if (
    code === 'SS&CRE' ||
    code === 'SS & CRE' ||
    code === 'SS/CRE' ||
    code === 'SST&CRE' ||
    code === 'SST/CRE' ||
    name.includes('SS&CRE') ||
    name.includes('SOCIAL STUDIES&CRE') ||
    name.includes('SOCIAL STUDIES & CRE') ||
    id === 'sb_up_ss_cre' ||
    id === 'f8255683-1d59-46a7-881a-04a25d45d972'
  ) {
    return false;
  }
  return (
    code === 'SST' ||
    code === 'SST UP' ||
    name === 'SOCIAL STUDIES' ||
    id === 'sb_sst' ||
    id === 'sb_up_sst' ||
    id === 'dff8e7fc-bb0d-41c5-b451-e6b6f3361409'
  );
}

/**
 * Checks if a subject represents Christian Religious Education (standalone component, non-composite).
 */
export function isChristianReligiousEducation(subject?: { subject_code?: string; code?: string; id?: string; subject_name?: string; name?: string; learning_area?: string } | null): boolean {
  if (!subject) return false;
  const code = (subject.subject_code || subject.code || '').trim().toUpperCase();
  const name = (subject.subject_name || subject.name || subject.learning_area || '').trim().toUpperCase();
  const id = (subject.id || '').trim().toLowerCase();
  if (
    code === 'SS&CRE' ||
    code === 'SS & CRE' ||
    code === 'SS/CRE' ||
    code === 'SST&CRE' ||
    code === 'SST/CRE' ||
    name.includes('SS&CRE') ||
    name.includes('SOCIAL STUDIES&CRE') ||
    name.includes('SOCIAL STUDIES & CRE') ||
    id === 'sb_up_ss_cre' ||
    id === 'f8255683-1d59-46a7-881a-04a25d45d972'
  ) {
    return false;
  }
  return (
    code === 'CRE' ||
    code === 'C.R.E' ||
    code === 'C.R.E.' ||
    name === 'CHRISTIAN RELIGIOUS EDUCATION' ||
    id === 'sb_cre' ||
    id === 'sb_up_cre' ||
    id === 'e784b5fc-dab9-4105-bb49-fce1d1a84cf7'
  );
}

/**
 * Checks if a subject is historical direct Social Studies & CRE.
 */
export function isDirectSSCRE(subject?: { subject_code?: string; code?: string; id?: string; subject_name?: string; name?: string; learning_area?: string } | null): boolean {
  if (!subject) return false;
  const code = (subject.subject_code || subject.code || '').trim().toUpperCase();
  const name = (subject.subject_name || subject.name || subject.learning_area || '').trim().toUpperCase();
  const id = (subject.id || '').trim().toLowerCase();
  return (
    id === 'f8255683-1d59-46a7-881a-04a25d45d972' ||
    id === 'sb_up_ss_cre' ||
    id === 'synth_ss_cre_composite' ||
    id === 'f8255683-1d59-46a7-881a-04a25d45d972' ||
    code === 'SS&CRE' ||
    code === 'SS & CRE' ||
    code === 'SS/CRE' ||
    code === 'SST&CRE' ||
    code === 'SST/CRE' ||
    name.includes('SS&CRE') ||
    name.includes('SOCIAL STUDIES&CRE') ||
    name.includes('SOCIAL STUDIES & CRE') ||
    name.includes('SOCIAL STUDIES AND CRE') ||
    name.includes('SOCIAL STUDIES & C.R.E') ||
    name.includes('SOCIAL STUDIES AND RELIGIOUS EDUCATION')
  );
}

/**
 * Detects whether there are any marks for separate Social Studies (SST) and Christian Religious Education (CRE)
 * for a specific student and/or exam.
 * Returns true if separate marks exist (so the report form displays separate SST & CRE).
 * Returns false if no marks exist for separate SST and CRE (so the report form displays the merged marks).
 */
export function hasSeparateSstAndCreMarks(
  student?: { id?: string; admission_number?: string } | null,
  exam?: { id?: string; exam_code?: string; exam_name?: string; name?: string } | null,
  marks?: Mark[] | null,
  subjects: Subject[] = []
): boolean {
  if (!exam || !marks || marks.length === 0) return false;

  const examId = exam.id;
  const examCode = (exam as any).exam_code;
  const examName = exam.exam_name || (exam as any).name;

  const isExamMatch = (mExamId: string) => {
    return (
      mExamId === examId ||
      (examCode && mExamId === examCode) ||
      (examName && mExamId === examName)
    );
  };

  const isStudentMatch = (stdId: string | undefined | null) => {
    if (!student) return true;
    if (!stdId) return false;
    const sIdStr = String(stdId).trim().toLowerCase();
    return (
      (student.id && String(student.id).trim().toLowerCase() === sIdStr) ||
      (student.admission_number && String(student.admission_number).trim().toLowerCase() === sIdStr)
    );
  };

  // 1. Check student-level first (if student is provided)
  if (student) {
    let hasStudentSst = false;
    let hasStudentCre = false;

    for (const m of marks) {
      if (!isExamMatch(m.exam_id) || !isStudentMatch(m.student_id)) continue;
      const subj = subjects.find((s) => s.id === m.subject_id || s.subject_code === m.subject_id) || { id: m.subject_id };
      if (isDirectSSCRE(subj) || isDirectSSCRE({ id: m.subject_id })) continue;

      const ev = evaluateMark(m);
      if (ev.status === 'Normal' && ev.rawScore !== null && !isNaN(ev.rawScore)) {
        if (isSocialStudies(subj) || isSocialStudies({ id: m.subject_id })) hasStudentSst = true;
        if (isChristianReligiousEducation(subj) || isChristianReligiousEducation({ id: m.subject_id })) hasStudentCre = true;
      }
    }

    if (hasStudentSst || hasStudentCre) {
      return true;
    }
  }

  // 2. Check exam-wide across all students in the exam
  let hasExamSst = false;
  let hasExamCre = false;

  for (const m of marks) {
    if (!isExamMatch(m.exam_id)) continue;
    const subj = subjects.find((s) => s.id === m.subject_id || s.subject_code === m.subject_id) || { id: m.subject_id };
    if (isDirectSSCRE(subj) || isDirectSSCRE({ id: m.subject_id })) continue;

    const ev = evaluateMark(m);
    if (ev.status === 'Normal' && ev.rawScore !== null && !isNaN(ev.rawScore)) {
      if (isSocialStudies(subj) || isSocialStudies({ id: m.subject_id })) hasExamSst = true;
      if (isChristianReligiousEducation(subj) || isChristianReligiousEducation({ id: m.subject_id })) hasExamCre = true;
      if (hasExamSst && hasExamCre) return true;
    }
  }

  return hasExamSst && hasExamCre;
}

/**
 * Given an ss_cre_structure ('A' | 'B' | 'C' | 'CUSTOM:<sstMax>:<creMax>'), returns the configured maximum scores for SST and CRE.
 */
export function getSSCREComponentMaxMarks(structure?: UpperPrimarySSCREStructure | string | null): { sstMax: number; creMax: number; ssCreMax: number } | null {
  if (!structure) return null;
  const s = String(structure).trim().toUpperCase();
  if (s === 'A') {
    return { sstMax: 30, creMax: 20, ssCreMax: 50 };
  }
  if (s === 'B') {
    return { sstMax: 10, creMax: 10, ssCreMax: 20 };
  }
  if (s === 'C') {
    return { sstMax: 20, creMax: 30, ssCreMax: 50 };
  }

  // Strict Custom format: "CUSTOM:<sstMax>:<creMax>"
  const match = s.match(/^CUSTOM:(\d+):(\d+)$/);
  if (match) {
    const sstMax = parseInt(match[1], 10);
    const creMax = parseInt(match[2], 10);
    if (Number.isInteger(sstMax) && sstMax > 0 && Number.isInteger(creMax) && creMax > 0) {
      return { sstMax, creMax, ssCreMax: sstMax + creMax };
    }
  }

  return null;
}

/**
 * For Upper Primary students, merges ENG (/60) + COMP (/40) into English (/100),
 * KISW (/60) + INSHA (/40) into Kiswahili (/100),
 * and SST + CRE into SS&CRE based on the authoritative examination ss_cre_structure ('A', 'B', or 'C').
 *
 * Preserves historical direct SS&CRE marks (sb_up_ss_cre) and enforces explicit conflict surfacing
 * if both direct and component marks exist for the same learner in the same assessment.
 */
export function getUpperPrimaryCompositeSubjectMarks(
  studentMarks: Mark[],
  subjects: { id: string; subject_code?: string; code?: string; subject_name?: string; name?: string; education_level?: string }[],
  educationLevel?: string | null,
  examOrStructure?: Examination | UpperPrimarySSCREStructure | string | null
): {
  processedMarks: Mark[];
  syntheticSubjects: Subject[];
} {
  const isStandalone =
    typeof examOrStructure === 'object' && examOrStructure !== null
      ? (examOrStructure as any).assessment_structure === 'Standalone'
      : examOrStructure === 'Standalone';

  if (educationLevel !== 'Upper Primary' || isStandalone) {
    return { processedMarks: studentMarks, syntheticSubjects: [] };
  }

  let engLangSub: any = null;
  let engCompSub: any = null;
  let kiswLangSub: any = null;
  let kiswInshaSub: any = null;
  let sstSub: any = null;
  let creSub: any = null;
  let directSsCreSub: any = null;

  subjects.forEach(s => {
    if (!engLangSub && isEnglishLanguage(s) && !isEnglishComposition(s)) engLangSub = s;
    if (!engCompSub && isEnglishComposition(s)) engCompSub = s;
    if (!kiswLangSub && isKiswahiliLugha(s) && !isKiswahiliInsha(s)) kiswLangSub = s;
    if (!kiswInshaSub && isKiswahiliInsha(s)) kiswInshaSub = s;
    if (!sstSub && isSocialStudies(s)) sstSub = s;
    if (!creSub && isChristianReligiousEducation(s)) creSub = s;
    if (!directSsCreSub && isDirectSSCRE(s)) directSsCreSub = s;
  });

  const processed: Mark[] = [];
  const syntheticSubs: any[] = [];
  const handledSubjectIds = new Set<string>();

  // 1. English Composite: ENG (60) + COMP (40) -> English (100)
  if (engLangSub && engCompSub) {
    handledSubjectIds.add(engLangSub.id);
    handledSubjectIds.add(engCompSub.id);

    const engMark = studentMarks.find((m) => {
      if (m.subject_id === engLangSub.id || m.subject_id === 'sb_up_eng' || m.subject_id === 'sb_eng') return true;
      const sub = subjects.find((s) => s.id === m.subject_id);
      if (sub) return isEnglishLanguage(sub) && !isEnglishComposition(sub);
      return isEnglishLanguage({ id: m.subject_id, subject_code: (m as any).subject_code || (m as any).code, subject_name: (m as any).subject_name || (m as any).name }) &&
             !isEnglishComposition({ id: m.subject_id, subject_code: (m as any).subject_code || (m as any).code, subject_name: (m as any).subject_name || (m as any).name });
    });
    const compMark = studentMarks.find((m) => {
      if (m.subject_id === engCompSub.id || m.subject_id === 'sb_up_comp' || m.subject_id === 'COMP') return true;
      const sub = subjects.find((s) => s.id === m.subject_id);
      if (sub) return isEnglishComposition(sub);
      return isEnglishComposition({ id: m.subject_id, subject_code: (m as any).subject_code || (m as any).code, subject_name: (m as any).subject_name || (m as any).name });
    });

    const evalEng = evaluateMark(engMark);
    const evalComp = evaluateMark(compMark, { isUpperPrimaryCompOrInsha: true, subject: engCompSub, educationLevel: 'Upper Primary' });

    const synthId = 'synth_english_composite';
    syntheticSubs.push({
      id: synthId,
      subject_name: 'English',
      subject_code: 'ENG',
      category: 'Core' as const,
      education_level: 'Upper Primary',
    });

    if (evalEng.status === 'Y' || evalComp.status === 'Y') {
      processed.push({
        id: 'synth_mark_english',
        exam_id: engMark?.exam_id || compMark?.exam_id || '',
        student_id: engMark?.student_id || compMark?.student_id || '',
        subject_id: synthId,
        marks: 0,
        score: null,
        raw_score: null,
        out_of: 100,
        percentage: 0,
        special_status: 'Y',
        irregularity_reason: evalEng.irregularityReason || evalComp.irregularityReason || 'Irregularity',
        is_synthetic: true,
      });
    } else if (evalEng.status === 'X' && evalComp.status === 'X') {
      processed.push({
        id: 'synth_mark_english',
        exam_id: engMark?.exam_id || compMark?.exam_id || '',
        student_id: engMark?.student_id || compMark?.student_id || '',
        subject_id: synthId,
        marks: 0,
        score: null,
        raw_score: null,
        out_of: 100,
        percentage: 0,
        special_status: 'X',
        irregularity_reason: 'Absent',
        is_synthetic: true,
      });
    } else if (evalEng.status === 'Normal' || evalComp.status === 'Normal') {
      const engRaw = evalEng.status === 'Normal' ? (evalEng.rawScore ?? 0) : 0;
      const compRaw = evalComp.status === 'Normal' ? (evalComp.rawScore ?? 0) : 0;
      const totalRaw = engRaw + compRaw;

      processed.push({
        id: 'synth_mark_english',
        exam_id: engMark?.exam_id || compMark?.exam_id || '',
        student_id: engMark?.student_id || compMark?.student_id || '',
        subject_id: synthId,
        score: totalRaw,
        marks: totalRaw,
        raw_score: totalRaw,
        out_of: 100,
        percentage: totalRaw,
        special_status: 'Normal',
        is_synthetic: true,
      });
    }
  }

  // 2. Kiswahili Composite: KIS (60) + INSHA (40) -> Kiswahili (100)
  if (kiswLangSub && kiswInshaSub) {
    handledSubjectIds.add(kiswLangSub.id);
    handledSubjectIds.add(kiswInshaSub.id);

    const kiswMark = studentMarks.find((m) => {
      if (m.subject_id === kiswLangSub.id || m.subject_id === 'sb_up_kis' || m.subject_id === 'sb_kis') return true;
      const sub = subjects.find((s) => s.id === m.subject_id);
      if (sub) return isKiswahiliLugha(sub) && !isKiswahiliInsha(sub);
      return isKiswahiliLugha({ id: m.subject_id, subject_code: (m as any).subject_code || (m as any).code, subject_name: (m as any).subject_name || (m as any).name }) &&
             !isKiswahiliInsha({ id: m.subject_id, subject_code: (m as any).subject_code || (m as any).code, subject_name: (m as any).subject_name || (m as any).name });
    });
    const inshaMark = studentMarks.find((m) => {
      if (m.subject_id === kiswInshaSub.id || m.subject_id === 'sb_up_insha' || m.subject_id === 'INSHA') return true;
      const sub = subjects.find((s) => s.id === m.subject_id);
      if (sub) return isKiswahiliInsha(sub);
      return isKiswahiliInsha({ id: m.subject_id, subject_code: (m as any).subject_code || (m as any).code, subject_name: (m as any).subject_name || (m as any).name });
    });

    const evalKisw = evaluateMark(kiswMark);
    const evalInsha = evaluateMark(inshaMark, { isUpperPrimaryCompOrInsha: true, subject: kiswInshaSub, educationLevel: 'Upper Primary' });

    const synthId = 'synth_kiswahili_composite';
    syntheticSubs.push({
      id: synthId,
      subject_name: 'Kiswahili',
      subject_code: 'KIS',
      category: 'Core' as const,
      education_level: 'Upper Primary',
    });

    if (evalKisw.status === 'Y' || evalInsha.status === 'Y') {
      processed.push({
        id: 'synth_mark_kiswahili',
        exam_id: kiswMark?.exam_id || inshaMark?.exam_id || '',
        student_id: kiswMark?.student_id || inshaMark?.student_id || '',
        subject_id: synthId,
        marks: 0,
        score: null,
        raw_score: null,
        out_of: 100,
        percentage: 0,
        special_status: 'Y',
        irregularity_reason: evalKisw.irregularityReason || evalInsha.irregularityReason || 'Irregularity',
        is_synthetic: true,
      });
    } else if (evalKisw.status === 'X' && evalInsha.status === 'X') {
      processed.push({
        id: 'synth_mark_kiswahili',
        exam_id: kiswMark?.exam_id || inshaMark?.exam_id || '',
        student_id: kiswMark?.student_id || inshaMark?.student_id || '',
        subject_id: synthId,
        marks: 0,
        score: null,
        raw_score: null,
        out_of: 100,
        percentage: 0,
        special_status: 'X',
        irregularity_reason: 'Absent',
        is_synthetic: true,
      });
    } else if (evalKisw.status === 'Normal' || evalInsha.status === 'Normal') {
      const kiswRaw = evalKisw.status === 'Normal' ? (evalKisw.rawScore ?? 0) : 0;
      const inshaRaw = evalInsha.status === 'Normal' ? (evalInsha.rawScore ?? 0) : 0;
      const totalRaw = kiswRaw + inshaRaw;

      processed.push({
        id: 'synth_mark_kiswahili',
        exam_id: kiswMark?.exam_id || inshaMark?.exam_id || '',
        student_id: kiswMark?.student_id || inshaMark?.student_id || '',
        subject_id: synthId,
        score: totalRaw,
        marks: totalRaw,
        raw_score: totalRaw,
        out_of: 100,
        percentage: totalRaw,
        special_status: 'Normal',
        is_synthetic: true,
      });
    }
  }

  // 3. Social Studies & CRE Composite (SST + CRE -> SS&CRE)
  // Authoritative CBE Upper Primary Resolution Rule:
  // - If the assessment is explicitly configured for Option B / component structure ('A' | 'B' | 'C'),
  //   SST + CRE component marks are AUTHORITATIVE. Any in-memory direct mark is cleanly handled and superseded.
  // - If the assessment uses the historical/merged model (no ss_cre_structure) and a direct SS&CRE mark exists,
  //   the direct SS&CRE mark is AUTHORITATIVE and preserved intact. Component-shaped data in memory is not used to override it.
  // - If neither structure is specified, but only component marks are present, we dynamically synthesize the composite using inferred maxes.
  
  let explicitStructure: UpperPrimarySSCREStructure | null = null;
  if (typeof examOrStructure === 'string') {
    const s = examOrStructure.trim().toUpperCase();
    if (getSSCREComponentMaxMarks(s) !== null) {
      explicitStructure = s as UpperPrimarySSCREStructure;
    }
  } else if (examOrStructure && typeof examOrStructure === 'object') {
    const s = (examOrStructure as any).ss_cre_structure;
    if (s) {
      const su = String(s).trim().toUpperCase();
      if (getSSCREComponentMaxMarks(su) !== null) {
        explicitStructure = su as UpperPrimarySSCREStructure;
      }
    }
  }

  const sstMark = studentMarks.find((m) => {
    if (sstSub && m.subject_id === sstSub.id) return true;
    if (m.subject_id === 'sb_sst' || m.subject_id === 'sb_up_sst') return true;
    const sub = subjects.find((s) => s.id === m.subject_id);
    if (sub) return isSocialStudies(sub);
    return isSocialStudies({ id: m.subject_id, subject_code: (m as any).subject_code || (m as any).code, subject_name: (m as any).subject_name || (m as any).name });
  });
  const creMark = studentMarks.find((m) => {
    if (creSub && m.subject_id === creSub.id) return true;
    if (m.subject_id === 'sb_cre' || m.subject_id === 'sb_up_cre') return true;
    const sub = subjects.find((s) => s.id === m.subject_id);
    if (sub) return isChristianReligiousEducation(sub);
    return isChristianReligiousEducation({ id: m.subject_id, subject_code: (m as any).subject_code || (m as any).code, subject_name: (m as any).subject_name || (m as any).name });
  });
  const directSsCreMark = studentMarks.find((m) => {
    if (directSsCreSub && m.subject_id === directSsCreSub.id) return true;
    if (m.subject_id === 'sb_up_ss_cre' || m.subject_id === 'synth_ss_cre_composite' || m.subject_id === 'SS&CRE') return true;
    const sub = subjects.find((s) => s.id === m.subject_id);
    if (sub) return isDirectSSCRE(sub);
    return isDirectSSCRE({ id: m.subject_id, subject_code: (m as any).subject_code || (m as any).code, subject_name: (m as any).subject_name || (m as any).name });
  });

  const evalDirect = evaluateMark(directSsCreMark);
  const evalSst = evaluateMark(sstMark);
  const evalCre = evaluateMark(creMark);

  const hasDirectMark = evalDirect.status === 'Normal' || evalDirect.status === 'X' || evalDirect.status === 'Y';
  const hasComponentMarks = evalSst.status === 'Normal' || evalSst.status === 'X' || evalSst.status === 'Y' ||
                            evalCre.status === 'Normal' || evalCre.status === 'X' || evalCre.status === 'Y';

  // Determine whether component marks or direct marks are authoritative
  const isComponentAuthoritative = Boolean(explicitStructure) && hasComponentMarks;
  const isDirectAuthoritative = !explicitStructure && hasDirectMark;
  const isComponentFallback = !explicitStructure && !hasDirectMark && hasComponentMarks;

  if (isComponentAuthoritative || isComponentFallback) {
    let structureCode = explicitStructure;
    if (!structureCode) {
      const sstOutOf = sstMark?.out_of || (sstMark as any)?.max_score;
      const creOutOf = creMark?.out_of || (creMark as any)?.max_score;
      if (sstOutOf === 10 || creOutOf === 10) {
        structureCode = 'B';
      } else if (sstOutOf === 30 || creOutOf === 20) {
        structureCode = 'A';
      } else if (sstOutOf === 20 || creOutOf === 30) {
        structureCode = 'C';
      } else {
        structureCode = 'B';
      }
    }
    const sstCreMaxes = getSSCREComponentMaxMarks(structureCode);

    if (directSsCreMark) handledSubjectIds.add(directSsCreMark.subject_id);
    if (sstSub) handledSubjectIds.add(sstSub.id);
    if (creSub) handledSubjectIds.add(creSub.id);
    if (sstMark) handledSubjectIds.add(sstMark.subject_id);
    if (creMark) handledSubjectIds.add(creMark.subject_id);

    const synthId = directSsCreSub?.id || 'sb_up_ss_cre';
    syntheticSubs.push({
      id: synthId,
      subject_name: directSsCreSub?.subject_name || 'Social Studies&CRE',
      subject_code: directSsCreSub?.subject_code || 'SS&CRE',
      category: 'Core' as const,
      education_level: 'Upper Primary',
    });

    const isSstSubmitted = evalSst.status === 'Normal' || evalSst.status === 'X' || evalSst.status === 'Y';
    const isCreSubmitted = evalCre.status === 'Normal' || evalCre.status === 'X' || evalCre.status === 'Y';

    if (evalSst.status === 'Y' || evalCre.status === 'Y') {
      processed.push({
        id: 'synth_mark_ss_cre',
        exam_id: sstMark?.exam_id || creMark?.exam_id || directSsCreMark?.exam_id || '',
        student_id: sstMark?.student_id || creMark?.student_id || directSsCreMark?.student_id || '',
        subject_id: synthId,
        marks: 0,
        score: null,
        raw_score: null,
        out_of: sstCreMaxes?.ssCreMax || 50,
        percentage: 0,
        special_status: 'Y',
        irregularity_reason: evalSst.irregularityReason || evalCre.irregularityReason || 'Irregularity',
        is_synthetic: true,
      });
    } else if (evalSst.status === 'X' && evalCre.status === 'X') {
      processed.push({
        id: 'synth_mark_ss_cre',
        exam_id: sstMark?.exam_id || creMark?.exam_id || directSsCreMark?.exam_id || '',
        student_id: sstMark?.student_id || creMark?.student_id || directSsCreMark?.student_id || '',
        subject_id: synthId,
        marks: 0,
        score: null,
        raw_score: null,
        out_of: sstCreMaxes?.ssCreMax || 50,
        percentage: 0,
        special_status: 'X',
        irregularity_reason: 'Absent',
        is_synthetic: true,
      });
    } else if (isSstSubmitted && isCreSubmitted) {
      // Both components submitted (could be Normal+Normal or Normal+X)
      const sstRaw = evalSst.status === 'Normal' ? (evalSst.rawScore ?? 0) : 0;
      const creRaw = evalCre.status === 'Normal' ? (evalCre.rawScore ?? 0) : 0;
      const totalRaw = sstRaw + creRaw;
      const totalMax = sstCreMaxes?.ssCreMax || 50;
      const pct = totalMax > 0 ? (totalRaw / totalMax) * 100 : totalRaw;

      processed.push({
        id: 'synth_mark_ss_cre',
        exam_id: sstMark?.exam_id || creMark?.exam_id || directSsCreMark?.exam_id || '',
        student_id: sstMark?.student_id || creMark?.student_id || directSsCreMark?.student_id || '',
        subject_id: synthId,
        score: totalRaw,
        marks: totalRaw,
        raw_score: totalRaw,
        out_of: totalMax,
        percentage: pct,
        is_synthetic: true,
      });
    }
  } else if (isDirectAuthoritative) {
    if (directSsCreMark) handledSubjectIds.add(directSsCreMark.subject_id);
    if (sstSub) handledSubjectIds.add(sstSub.id);
    if (creSub) handledSubjectIds.add(creSub.id);
    if (sstMark) handledSubjectIds.add(sstMark.subject_id);
    if (creMark) handledSubjectIds.add(creMark.subject_id);

    const rawDirect = evalDirect.status === 'Normal' ? (evalDirect.rawScore ?? Number(directSsCreMark?.score) ?? 0) : 0;
    const directOutOf = Number(directSsCreMark?.out_of || 50);

    const synthId = directSsCreSub?.id || 'sb_up_ss_cre';
    syntheticSubs.push({
      id: synthId,
      subject_name: directSsCreSub?.subject_name || 'Social Studies&CRE',
      subject_code: directSsCreSub?.subject_code || 'SS&CRE',
      category: 'Core' as const,
      education_level: 'Upper Primary',
    });

    const pct = directOutOf > 0 ? (rawDirect / directOutOf) * 100 : rawDirect;
    processed.push({
      id: directSsCreMark?.id || 'synth_mark_ss_cre',
      exam_id: directSsCreMark?.exam_id || '',
      student_id: directSsCreMark?.student_id || '',
      subject_id: synthId,
      score: directSsCreMark?.score ?? pct,
      marks: directSsCreMark?.marks ?? pct,
      raw_score: rawDirect,
      out_of: directOutOf,
      percentage: pct,
      special_status: directSsCreMark?.special_status,
      irregularity_reason: directSsCreMark?.irregularity_reason,
      is_synthetic: directSsCreMark?.is_synthetic ?? false,
    });

    const sstMax = Math.round(directOutOf * 0.6);
    const creMax = directOutOf - sstMax;
    const sstRaw = directOutOf > 0 ? (rawDirect * sstMax) / directOutOf : 0;
    const creRaw = directOutOf > 0 ? (rawDirect * creMax) / directOutOf : 0;

    const sstSynthId = sstSub?.id || 'sb_up_sst';
    const creSynthId = creSub?.id || 'sb_up_cre';

    if (!sstSub) {
      syntheticSubs.push({
        id: sstSynthId,
        subject_name: 'Social Studies',
        subject_code: 'SST',
        category: 'Core' as const,
        education_level: 'Upper Primary',
      });
    }
    if (!creSub) {
      syntheticSubs.push({
        id: creSynthId,
        subject_name: 'Christian Religious Education',
        subject_code: 'CRE',
        category: 'Core' as const,
        education_level: 'Upper Primary',
      });
    }

    processed.push({
      id: 'synth_mark_sst',
      exam_id: directSsCreMark?.exam_id || '',
      student_id: directSsCreMark?.student_id || '',
      subject_id: sstSynthId,
      score: sstRaw,
      marks: sstRaw,
      raw_score: sstRaw,
      out_of: sstMax,
      percentage: sstMax > 0 ? (sstRaw / sstMax) * 100 : 0,
      special_status: directSsCreMark?.special_status,
      is_synthetic: true,
    });
    processed.push({
      id: 'synth_mark_cre',
      exam_id: directSsCreMark?.exam_id || '',
      student_id: directSsCreMark?.student_id || '',
      subject_id: creSynthId,
      score: creRaw,
      marks: creRaw,
      raw_score: creRaw,
      out_of: creMax,
      percentage: creMax > 0 ? (creRaw / creMax) * 100 : 0,
      special_status: directSsCreMark?.special_status,
      is_synthetic: true,
    });
  }

  // 4. Pass through all other unhandled marks (including direct historical SS&CRE marks)
  studentMarks.forEach(m => {
    if (!handledSubjectIds.has(m.subject_id)) {
      processed.push(m);
    }
  });

  return { processedMarks: processed, syntheticSubjects: syntheticSubs };
}

/**
 * Resolves authoritative subjects and marks for learner report cards, summaries, and PDF generators.
 * For Upper Primary (Grades 4–6):
 * - SST + CRE are resolved into the calculated SS&CRE composite result.
 * - SST and CRE component rows are excluded from the final reporting subject list.
 * - The calculated SS&CRE composite mark is returned in the resolved marks array.
 * For other education levels (e.g. Junior School Grades 7–9):
 * - Subjects and marks pass through without composite merging (preserving separate SST and CRE).
 */
export function resolveLearnerReportSubjectsAndMarks(
  student: Student,
  classObj: ClassStream | undefined,
  subjects: Subject[],
  teachers: Teacher[] | undefined,
  exam: Examination | undefined,
  rawMarks: Mark[]
): {
  reportSubjects: Subject[];
  reportMarks: Mark[];
} {
  // 1. Determine raw applicable subjects for this student
  let rawSubjects: Subject[] = [];
  if (classObj && classObj.allocated_subject_ids && classObj.allocated_subject_ids.length > 0) {
    rawSubjects = getAllocatedSubjectsForClass(classObj, subjects);
  } else {
    const stdGrade = classObj?.class_name || student?.grade || '';
    rawSubjects = getApplicableSubjectsForGrade(stdGrade, subjects);
  }

  // 2. Identify education level
  const gradeStr = student?.grade || classObj?.class_name || '';
  const eduLevel = classObj?.education_level || (exam?.education_level && (exam.education_level as string) !== 'All Levels' ? exam.education_level : null) || getEducationLevelForGrade(gradeStr);
  const normalizedGrade = extractGradeName(gradeStr) || gradeStr;
  const isUpperPrimary = eduLevel === 'Upper Primary' || ['Grade 4', 'Grade 5', 'Grade 6'].includes(normalizedGrade as any);

  // If not Upper Primary (e.g. Junior School Grade 7-9), return raw subjects and marks directly
  if (!isUpperPrimary) {
    return {
      reportSubjects: rawSubjects,
      reportMarks: rawMarks,
    };
  }

  // Standalone Upper Primary: 8 separate assessed learning areas (ENG, KIS, MATH, INT-SCI, SST, CRE, AGN, CAS)
  // Exclude COMP, INSHA, and direct SS&CRE composite subjects; keep all 8 separate /100 subjects
  if (exam?.assessment_structure === 'Standalone') {
    const standaloneSubjects = rawSubjects.filter((sb) => {
      if (isEnglishComposition(sb) || isKiswahiliInsha(sb) || isDirectSSCRE(sb)) return false;
      return true;
    });
    const standaloneMarks = rawMarks.filter((m) => {
      const sub = subjects.find((s) => s.id === m.subject_id);
      if (sub && (isEnglishComposition(sub) || isKiswahiliInsha(sub) || isDirectSSCRE(sub))) return false;
      return true;
    });
    return {
      reportSubjects: standaloneSubjects,
      reportMarks: standaloneMarks,
    };
  }

  // 3. Match marks for this specific learner
  const matchesStudent = (stdId: string | undefined | null) => {
    if (!stdId) return false;
    const str = String(stdId).trim().toLowerCase();
    if (student.id && String(student.id).trim().toLowerCase() === str) return true;
    if (student.admission_number && String(student.admission_number).trim().toLowerCase() === str) return true;
    return false;
  };

  const studentRawMarks = rawMarks.filter((m) => matchesStudent(m.student_id));
  const otherMarks = rawMarks.filter((m) => !matchesStudent(m.student_id));

  // 4. Run authoritative composite subject mark processing for Upper Primary
  const compositeResult = getUpperPrimaryCompositeSubjectMarks(
    studentRawMarks,
    rawSubjects,
    'Upper Primary',
    exam
  );

  // 5. Build final reporting subjects list for Upper Primary:
  // Exclude component subjects (SST and CRE)
  const filteredSubjects = rawSubjects.filter((sb) => {
    if (isSocialStudies(sb) || isChristianReligiousEducation(sb)) return false;
    return true;
  });

  // Ensure SS&CRE composite subject is present
  if (!filteredSubjects.some(isDirectSSCRE)) {
    const directSubj = subjects.find(isDirectSSCRE) || compositeResult.syntheticSubjects.find(isDirectSSCRE) || {
      id: 'sb_up_ss_cre',
      subject_name: 'Social Studies&CRE',
      subject_code: 'SS&CRE',
      category: 'Core' as const,
      education_level: 'Upper Primary',
      applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'] as any,
    };
    filteredSubjects.push(directSubj);
  }

  // Combine other students' marks, the student's raw marks for non-component learning areas (ENG, COMP, KIS, INSHA, MATH, SCIENCE, CAS, etc.),
  // and the processed composite marks (e.g. SS&CRE composite mark)
  const nonComponentStudentRawMarks = studentRawMarks.filter(
    (m) => !isSocialStudies({ id: m.subject_id }) && !isChristianReligiousEducation({ id: m.subject_id })
  );

  const combinedStudentMarks = [...nonComponentStudentRawMarks];
  compositeResult.processedMarks.forEach((cm) => {
    if (!combinedStudentMarks.some((m) => m.id === cm.id || (m.subject_id === cm.subject_id && m.exam_id === cm.exam_id))) {
      combinedStudentMarks.push(cm);
    }
  });

  const reportMarks = [...otherMarks, ...combinedStudentMarks];

  return {
    reportSubjects: filteredSubjects,
    reportMarks,
  };
}



