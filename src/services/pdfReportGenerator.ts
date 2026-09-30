import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JSZip from 'jszip';
import { savePdf, saveFile } from '../utils/fileDownloader';
import { ensureSafeJsPdf } from '../utils/pdfSafeUtils';
import {
  Student,
  School,
  Examination,
  ClassStream,
  Subject,
  Mark,
  Grade,
  Teacher,
  LearnerReportComment,
  LearnerRankingMetadata,
  getEducationLevelForGrade,
  EducationLevel,
} from '../types';
import {
  calculateExamResults,
  getGradeForMark,
  calculateSubjectRank,
  getLearnerReportSubjects,
} from './analysisEngine';
import { getDisplayExamName, isGrade6OpenerTerm32026 } from '../utils/examDisplayUtils';
import { getLearnerClassAtExamTime, getStreamCohortStudentIds, getGradeCohortStudentIds } from './historicalContextResolver';
import {
  evaluateMark,
  formatPercentage,
  isSocialStudies,
  isChristianReligiousEducation,
  isDirectSSCRE,
  hasSeparateSstAndCreMarks,
  resolveLearnerReportSubjectsAndMarks,
} from '../utils/markUtils';
import { resolveUpperPrimaryReportStructure } from '../utils/upperPrimaryReportUtils';
import { formatKenyaDate } from '../utils/kenyaDateUtils';
import { isKiswahiliSubject, getKiswahiliDefaultComment } from '../utils/kiswahiliCommentValidator';
import { resolveSubjectTeacher, resolveClassTeacher } from '../utils/teacherResolutionUtils';
import { stripSurroundingQuotes } from '../utils/filterUtils';
import { generatePersonalizedLearnerComment } from './learnerCommentGenerator';
import { formatDateToKenyaHumanReadable, isGrade9Term3Report } from './nextTermOpeningDateResolver';
import { buildLearnerTrajectory } from './learnerTrajectoryEngine';

export const PDF_COLORS = {
  PRIMARY_NAVY: [6, 78, 59] as [number, number, number],
  NAVY_DARK: [6, 78, 59] as [number, number, number],
  SLATE_HEADER: [6, 78, 59] as [number, number, number],
  SLATE_MUTED: [71, 85, 105] as [number, number, number],
  SLATE_TEXT: [51, 65, 85] as [number, number, number],
  SLATE_DARK_TEXT: [15, 23, 42] as [number, number, number],
  WHITE: [255, 255, 255] as [number, number, number],
  SLATE_LIGHT: [248, 250, 252] as [number, number, number],
  BORDER_SLATE: [203, 213, 225] as [number, number, number],
  CARD_BG: [255, 255, 255] as [number, number, number],
  METRIC_LABEL: [209, 250, 229] as [number, number, number],
  METRIC_AVG: [255, 255, 255] as [number, number, number],
  METRIC_LEVEL: [255, 255, 255] as [number, number, number],
  HOI_BG: [254, 253, 248] as [number, number, number],
  HOI_BORDER: [229, 215, 185] as [number, number, number],
  HOI_LABEL: [6, 78, 59] as [number, number, number],
  EE: [4, 120, 87] as [number, number, number],
  ME: [30, 64, 175] as [number, number, number],
  AE: [180, 83, 9] as [number, number, number],
  BE: [190, 18, 60] as [number, number, number],
};

export function drawPerformanceProgressionGraph(
  doc: jsPDF,
  data: PDFReportData,
  currentY: number,
  contentWidth: number,
  marginX: number
): number {
  return currentY;
}

export interface PDFReportData {
  student: Student;
  school: School;
  exam?: Examination;
  allExams?: Examination[];
  classes: ClassStream[];
  subjects: Subject[];
  marks: Mark[];
  grades: Grade[];
  teachers?: Teacher[];
  allStudents: Student[];
  savedRemarks?: LearnerReportComment;
  nextTermOpeningDate?: string;
  aggregateRanking?: LearnerRankingMetadata;
}

function drawPdfImage(
  doc: jsPDF,
  imageDataUrl: string,
  x: number,
  y: number,
  w: number,
  h: number
): boolean {
  if (!imageDataUrl || typeof imageDataUrl !== 'string' || !imageDataUrl.trim()) return false;

  const urlLower = imageDataUrl.toLowerCase();
  let primaryFormat: 'PNG' | 'JPEG' | 'WEBP' = 'PNG';
  if (
    urlLower.includes('data:image/jpeg') ||
    urlLower.includes('data:image/jpg') ||
    urlLower.endsWith('.jpg') ||
    urlLower.endsWith('.jpeg')
  ) {
    primaryFormat = 'JPEG';
  } else if (urlLower.includes('data:image/webp') || urlLower.endsWith('.webp')) {
    primaryFormat = 'WEBP';
  }

  const formatsToTry: Array<'PNG' | 'JPEG' | 'WEBP'> = [
    primaryFormat,
    primaryFormat === 'PNG' ? 'JPEG' : 'PNG',
    'WEBP',
  ];

  for (const fmt of formatsToTry) {
    try {
      doc.addImage(imageDataUrl, fmt, x, y, w, h);
      return true;
    } catch {
      // try next format
    }
  }

  try {
    (doc as any).addImage(imageDataUrl, x, y, w, h);
    return true;
  } catch {
    return false;
  }
}

export function resolvePDFLearnerContext(
  student: Student,
  exam: Examination | undefined,
  classes: ClassStream[]
) {
  const examContext = exam ? getLearnerClassAtExamTime(student, exam, classes) : null;
  const isHistoricalContext = examContext?.is_historical === true;

  let targetClass =
    (classes || []).find(
      (c) =>
        student.stream_id &&
        (c.stream_id === student.stream_id || c.id === student.stream_id)
    ) || (classes || []).find((c) => c.id === student.class_id);

  if (isHistoricalContext) {
    if (examContext.historical_context_resolved && examContext.class_id) {
      targetClass =
        (classes || []).find(
          (c) =>
            examContext.stream_id &&
            (c.stream_id === examContext.stream_id || c.id === examContext.stream_id)
        ) ||
        (classes || []).find((c) => c.id === examContext.class_id) ||
        ({
          id: examContext.class_id,
          stream_id: examContext.stream_id,
          class_name: examContext.class_name,
          stream: examContext.stream_name,
          education_level: getEducationLevelForGrade(examContext.grade),
        } as ClassStream);
    } else {
      targetClass = undefined;
    }
  }

  const targetClassId = isHistoricalContext
    ? examContext?.class_id || ''
    : student.class_id || '';

  const targetStreamId = isHistoricalContext
    ? examContext?.stream_id || targetClass?.stream_id || ''
    : student.stream_id || targetClass?.stream_id || '';

  const classNameStr = isHistoricalContext
    ? examContext?.full_class_name || 'Unknown Grade'
    : targetClass
    ? `${targetClass.class_name} - ${targetClass.stream}`
    : student.class_id || student.grade || 'Grade 7';

  const studentGrade = isHistoricalContext
    ? examContext?.grade || 'Unknown Grade'
    : student.grade || targetClass?.class_name || '';

  const effectiveStudent: Student = isHistoricalContext
    ? {
        ...student,
        class_id: targetClassId,
        stream_id: targetStreamId,
        grade: studentGrade as Student['grade'],
      }
    : student;

  return {
    examContext,
    isHistoricalContext,
    targetClass,
    targetClassId,
    targetStreamId,
    classNameStr,
    studentGrade,
    effectiveStudent,
  };
}

export function getLearnerReportSubjectsForExam(
  student: Student,
  classObj: ClassStream | undefined,
  subjects: Subject[],
  teachers: Teacher[] | undefined,
  exam: Examination | undefined,
  marks?: Mark[]
): Subject[] {
  const raw = getLearnerReportSubjects(student, classObj, subjects, teachers);
  const isUpperPrimary =
    (exam?.education_level || classObj?.education_level) === 'Upper Primary';
  const isG6OpenerT3 = exam && isGrade6OpenerTerm32026(exam);
  let effectiveExam = exam;

  if (isG6OpenerT3) {
    const hasSeparateMarks = hasSeparateSstAndCreMarks(student, exam, marks, subjects);
    if (hasSeparateMarks) {
      effectiveExam = !exam.ss_cre_structure
        ? { ...exam, ss_cre_structure: 'A' as const }
        : exam;
    } else {
      effectiveExam = { ...exam, ss_cre_structure: undefined };
    }
  }

  if (!isUpperPrimary) return raw;

  const filtered = raw.filter((sb) => {
    if (isSocialStudies(sb) || isChristianReligiousEducation(sb)) return false;
    return true;
  });

  if (!filtered.some(isDirectSSCRE)) {
    const directSubj = subjects.find(isDirectSSCRE) || {
      id: 'sb_up_ss_cre',
      subject_name: 'Social Studies&CRE',
      subject_code: 'SS&CRE',
      category: 'Core' as const,
      education_level: 'Upper Primary',
      applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'] as any,
    };
    filtered.push(directSubj);
  }

  return filtered;
}

export function resolveNextTermOpeningDate(data: PDFReportData): string {
  const rawDate = (
    data.nextTermOpeningDate ||
    data.savedRemarks?.next_term_opening_date ||
    ''
  ).trim();
  if (!rawDate) {
    return '';
  }

  return formatDateToKenyaHumanReadable(rawDate) || rawDate;
}

// Helper to convert image URL or base64 to optimized base64 data URL for jsPDF
async function getBase64ImageFromUrl(
  imageUrl?: string | null
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.trim()) return null;

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 2500);
    try {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        clearTimeout(timer);
        try {
          const MAX_DIM = 240;
          let width = img.naturalWidth || img.width || 240;
          let height = img.naturalHeight || img.height || 240;

          if (width > MAX_DIM || height > MAX_DIM) {
            if (width >= height) {
              height = Math.round((height * MAX_DIM) / width);
              width = MAX_DIM;
            } else {
              width = Math.round((width * MAX_DIM) / height);
              height = MAX_DIM;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/png');
            resolve({ dataUrl, width, height });
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
      img.src = imageUrl;
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

// -------------------------------------------------------------
// BLACK & WHITE ASSESSMENT REPORT PRESENTATION HELPERS
// -------------------------------------------------------------

async function drawBwReportHeader(
  doc: jsPDF,
  school: School,
  exam: Examination | undefined,
  currentY: number,
  pageWidth: number
): Promise<number> {
  const logoObj = await getBase64ImageFromUrl(school.logo_url);

  if (logoObj) {
    const { dataUrl, width, height } = logoObj;
    let logoDisplayW = 14;
    let logoDisplayH = 14;
    if (width && height && height > 0) {
      const aspect = width / height;
      if (aspect >= 1) {
        logoDisplayW = 14;
        logoDisplayH = Math.min(14, 14 / aspect);
      } else {
        logoDisplayH = 14;
        logoDisplayW = Math.min(14, 14 * aspect);
      }
    }
    const logoX = (pageWidth - logoDisplayW) / 2;
    try {
      doc.addImage(dataUrl, 'PNG', logoX, currentY, logoDisplayW, logoDisplayH);
      currentY += logoDisplayH + 1.5;
    } catch (err) {
      console.warn('Failed to embed school logo in PDF:', err);
    }
  }

  // School Name (Uppercase, Bold, Centered)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(0, 0, 0);
  doc.text(
    (school.school_name || 'School Name Not Configured').toUpperCase(),
    pageWidth / 2,
    currentY + 3.5,
    { align: 'center' }
  );
  currentY += 4.5;

  // School Motto (No quotes, Centered)
  if (school.motto) {
    const cleanMotto = stripSurroundingQuotes(school.motto);
    if (cleanMotto) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);
      doc.text(cleanMotto, pageWidth / 2, currentY + 3, { align: 'center' });
      currentY += 4.5;
    }
  }

  currentY += 1.5;

  // Report Title (Bold, Centered)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text('LEARNER ASSESSMENT REPORT', pageWidth / 2, currentY + 3, { align: 'center' });
  currentY += 4.5;

  // Term & Year (Bold, Centered)
  const termStr = (exam?.term || 'Term 3').toUpperCase();
  const yearStr = String(exam?.year || new Date().getFullYear());
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.text(`${termStr} • ${yearStr}`, pageWidth / 2, currentY + 3, { align: 'center' });
  currentY += 5.5;

  return currentY;
}

function drawBwLearnerInfo(
  doc: jsPDF,
  student: Student,
  targetClass: ClassStream | undefined,
  exam: Examination | undefined,
  currentY: number,
  marginX: number,
  contentWidth: number
): number {
  const boxH = 17;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  doc.rect(marginX, currentY, contentWidth, boxH);

  const learnerName =
    (student.full_name || `${student.first_name || ''} ${student.last_name || ''}`)
      .trim()
      .toUpperCase() || 'LEARNER';
  const admNo = student.admission_number || '-';
  const gradeStr = (student.grade || targetClass?.class_name || 'GRADE').toUpperCase();
  const streamStr = (targetClass?.stream || (student as any).stream || '-').toUpperCase();
  const examDisplayName = getDisplayExamName(exam?.exam_name) || 'ASSESSMENT';
  const examTermStr = (exam?.term || 'TERM').toUpperCase();

  const col1X = marginX + 3;
  const col1ValX = marginX + 28;
  const col2X = marginX + 112;
  const col2ValX = marginX + 132;

  // Row 1: LEARNER & ADM NO.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);
  doc.text('LEARNER', col1X, currentY + 4.5);
  doc.setFont('helvetica', 'normal');
  doc.text(learnerName, col1ValX, currentY + 4.5, { maxWidth: 80 });

  doc.setFont('helvetica', 'bold');
  doc.text('ADM NO.', col2X, currentY + 4.5);
  doc.setFont('helvetica', 'normal');
  doc.text(admNo, col2ValX, currentY + 4.5, { maxWidth: 55 });

  // Row 2: GRADE & STREAM
  doc.setFont('helvetica', 'bold');
  doc.text('GRADE', col1X, currentY + 9.5);
  doc.setFont('helvetica', 'normal');
  doc.text(gradeStr, col1ValX, currentY + 9.5, { maxWidth: 80 });

  doc.setFont('helvetica', 'bold');
  doc.text('STREAM', col2X, currentY + 9.5);
  doc.setFont('helvetica', 'normal');
  doc.text(streamStr, col2ValX, currentY + 9.5, { maxWidth: 55 });

  // Row 3: ASSESSMENT
  doc.setFont('helvetica', 'bold');
  doc.text('ASSESSMENT', col1X, currentY + 14.5);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `${examDisplayName} • ${examTermStr}`.toUpperCase(),
    col1ValX,
    currentY + 14.5,
    { maxWidth: 155 }
  );

  return currentY + boxH + 2.5;
}

function drawBwAssessmentSummary(
  doc: jsPDF,
  summaryData: {
    totalMarks: number;
    maxPossibleMarks: number;
    averageScore: number;
    overallLevel: string;
    totalPoints: number;
    maxPossiblePoints: number;
    streamRank: string;
    streamTotal: number;
    overallRank: string;
    overallTotal: number;
    isComplete: boolean;
  },
  currentY: number,
  marginX: number,
  contentWidth: number
): number {
  const boxH = 20;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  doc.rect(marginX, currentY, contentWidth, boxH);

  // Section Header: ASSESSMENT SUMMARY
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(0, 0, 0);
  doc.text('ASSESSMENT SUMMARY', marginX + contentWidth / 2, currentY + 3.8, {
    align: 'center',
  });
  doc.line(marginX, currentY + 5.2, marginX + contentWidth, currentY + 5.2);

  // Row 1 (4 Columns): TOTAL SCORE | AVERAGE | CBE LEVEL | TOTAL POINTS
  const colW4 = contentWidth / 4;
  const row1LabelY = currentY + 8.4;
  const row1ValY = currentY + 12.4;

  const scoreStr = `${summaryData.totalMarks} / ${summaryData.maxPossibleMarks}`;
  const avgStr = formatPercentage(summaryData.averageScore, true);
  const levelStr = summaryData.isComplete ? summaryData.overallLevel : 'Pending';
  const ptsStr = summaryData.isComplete
    ? `${summaryData.totalPoints} / ${summaryData.maxPossiblePoints}`
    : '-';

  const row1Metrics = [
    { label: 'TOTAL SCORE', val: scoreStr },
    { label: 'AVERAGE', val: avgStr },
    { label: 'CBE LEVEL', val: levelStr },
    { label: 'TOTAL POINTS', val: ptsStr },
  ];

  row1Metrics.forEach((m, i) => {
    const cx = marginX + i * colW4 + colW4 / 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.text(m.label, cx, row1LabelY, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(m.val, cx, row1ValY, { align: 'center' });
    if (i > 0) {
      doc.line(
        marginX + i * colW4,
        currentY + 5.2,
        marginX + i * colW4,
        currentY + 14.0
      );
    }
  });

  doc.line(marginX, currentY + 14.0, marginX + contentWidth, currentY + 14.0);

  // Row 2 (2 Columns): STREAM RANK | OVERALL RANK
  const colW2 = contentWidth / 2;
  const row2Y = currentY + 18.0;

  const sRankStr =
    summaryData.isComplete && summaryData.streamRank !== 'Not Ranked'
      ? `${summaryData.streamRank} OF ${summaryData.streamTotal}`
      : summaryData.streamRank;

  const oRankStr =
    summaryData.isComplete && summaryData.overallRank !== 'Not Ranked'
      ? `${summaryData.overallRank} OF ${summaryData.overallTotal}`
      : summaryData.overallRank;

  // Stream Rank (Col 1)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.text('STREAM RANK:', marginX + 18, row2Y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.text(sRankStr, marginX + 44, row2Y);

  doc.line(
    marginX + colW2,
    currentY + 14.0,
    marginX + colW2,
    currentY + boxH
  );

  // Overall Rank (Col 2)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.text('OVERALL RANK:', marginX + colW2 + 18, row2Y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.text(oRankStr, marginX + colW2 + 46, row2Y);

  return currentY + boxH + 2.5;
}

function drawBwRemarks(
  doc: jsPDF,
  ctName: string,
  ctComment: string,
  hoiName: string,
  hoiComment: string,
  currentY: number,
  marginX: number,
  contentWidth: number
): number {
  // Teacher's Remarks Box
  const boxH1 = 13.5;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  doc.rect(marginX, currentY, contentWidth, boxH1);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(0, 0, 0);
  doc.text("TEACHER'S REMARKS", marginX + 3, currentY + 3.8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.0);
  const ctFullText = `Class Teacher (Tr. ${ctName}): ${ctComment}`;
  doc.text(ctFullText, marginX + 3, currentY + 7.8, {
    maxWidth: contentWidth - 6,
  });

  currentY += boxH1 + 2.0;

  // Head of Institution Remarks Box
  const boxH2 = 13.5;
  doc.rect(marginX, currentY, contentWidth, boxH2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.text('HEAD OF INSTITUTION REMARKS', marginX + 3, currentY + 3.8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.0);
  const hoiFullText = `Head of Institution (${hoiName}): ${hoiComment}`;
  doc.text(hoiFullText, marginX + 3, currentY + 7.8, {
    maxWidth: contentWidth - 6,
  });

  currentY += boxH2 + 2.0;

  return currentY;
}

function drawBwCbeKey(
  doc: jsPDF,
  isJuniorSchool: boolean,
  currentY: number,
  marginX: number,
  contentWidth: number
): number {
  const boxH = 8.5;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  doc.rect(marginX, currentY, contentWidth, boxH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(0, 0, 0);
  doc.text('CBE LEVEL KEY', marginX + 3, currentY + 3.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  const keyText = isJuniorSchool
    ? 'EE1 (90–100% • 8 Pts) • EE2 (75–89% • 7 Pts) • ME1 (58–74% • 6 Pts) • ME2 (41–57% • 5 Pts) • AE1 (31–40% • 4 Pts) • AE2 (21–30% • 3 Pts) • BE1 (11–20% • 2 Pts) • BE2 (0–10% • 1 Pt)'
    : 'EE (Exceeding Expectations: 80–100% • 4 Pts) • ME (Meeting Expectations: 50–79% • 3 Pts) • AE (Approaching Expectations: 30–49% • 2 Pts) • BE (Below Expectations: 0–29% • 1 Pt)';

  doc.text(keyText, marginX + 3, currentY + 6.8, { maxWidth: contentWidth - 6 });

  return currentY + boxH + 2.0;
}

function drawBwSignatures(
  doc: jsPDF,
  classTeacher: Teacher | undefined,
  school: School,
  currentY: number,
  marginX: number,
  contentWidth: number
): number {
  const boxH = 14.5;
  const colW = contentWidth / 3;

  const sigBoxes = [
    { title: 'CLASS TEACHER', label: 'Signature: __________' },
    { title: 'HEAD OF INSTITUTION', label: 'Sign & Seal: __________' },
    { title: 'PARENT / GUARDIAN', label: 'Signature: __________' },
  ];

  sigBoxes.forEach((sig, idx) => {
    const x = marginX + idx * colW;
    const boxW = colW - (idx === 2 ? 0 : 2);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    doc.rect(x, currentY, boxW, boxH);

    doc.setFontSize(6.8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(sig.title, x + boxW / 2, currentY + 3.8, { align: 'center' });

    let drawn = false;
    if (idx === 0 && classTeacher?.signature_url) {
      drawn = drawPdfImage(
        doc,
        classTeacher.signature_url,
        x + boxW / 2 - 14,
        currentY + 4.5,
        28,
        7.5
      );
    } else if (idx === 1 && school?.stamp_url) {
      drawn = drawPdfImage(
        doc,
        school.stamp_url,
        x + boxW / 2 - 14,
        currentY + 4.5,
        28,
        7.5
      );
    }

    if (!drawn) {
      doc.setFontSize(6.8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      doc.text(sig.label, x + boxW / 2, currentY + 10.8, { align: 'center' });
    }
  });

  return currentY + boxH + 2.5;
}

// -------------------------------------------------------------
// 1. JUNIOR SCHOOL REPORT CARD PDF GENERATOR (Grades 7 - 9)
// -------------------------------------------------------------
export async function generateJuniorSchoolReportPDF(
  data: PDFReportData,
  existingDoc?: jsPDF
): Promise<jsPDF> {
  const {
    student,
    school,
    exam,
    classes = [],
    subjects = [],
    marks = [],
    grades = [],
    teachers = [],
    allStudents = [],
    savedRemarks,
  } = data;

  const doc = ensureSafeJsPdf(
    existingDoc || new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  );
  const pageWidth = 210;
  const marginX = 10;
  const contentWidth = pageWidth - marginX * 2;

  const examId = exam?.id || '';
  const {
    targetClass,
    targetClassId,
    targetStreamId,
    classNameStr,
    studentGrade,
    effectiveStudent,
  } = resolvePDFLearnerContext(student, exam, classes);

  const learnerSubjects = getLearnerReportSubjectsForExam(
    effectiveStudent,
    targetClass,
    subjects,
    teachers,
    exam
  );
  const examResults = calculateExamResults(
    examId,
    allStudents,
    marks,
    grades,
    classes,
    subjects,
    exam
  );
  const studentResult = examResults.find((r) => r.student_id === student.id);
  const isAssessmentComplete = data.aggregateRanking
    ? data.aggregateRanking.is_complete
    : studentResult
    ? studentResult.is_complete !== false
    : false;

  const totalMarks =
    data.aggregateRanking?.total_marks !== undefined
      ? data.aggregateRanking.total_marks
      : studentResult?.total_marks || 0;
  const averageScore =
    data.aggregateRanking?.average !== undefined
      ? data.aggregateRanking.average
      : studentResult?.average || 0;
  const totalPoints = isAssessmentComplete
    ? data.aggregateRanking?.total_points !== undefined
      ? data.aggregateRanking.total_points
      : studentResult?.total_points || 0
    : 0;
  const overallGradeCode = isAssessmentComplete
    ? data.aggregateRanking?.grade_code ||
      studentResult?.grade_code ||
      studentResult?.grade ||
      'ME1'
    : 'Pending';
  const overallRank = data.aggregateRanking
    ? data.aggregateRanking.is_complete && data.aggregateRanking.overall_rank
      ? `${data.aggregateRanking.overall_rank}`
      : 'Not Ranked'
    : isAssessmentComplete && studentResult?.position
    ? `${studentResult.position}`
    : 'Not Ranked';
  const streamRank = data.aggregateRanking
    ? data.aggregateRanking.is_complete && data.aggregateRanking.stream_rank
      ? `${data.aggregateRanking.stream_rank}`
      : 'Not Ranked'
    : isAssessmentComplete &&
      (studentResult?.class_position || studentResult?.position)
    ? `${studentResult.class_position || studentResult.position}`
    : 'Not Ranked';

  // Authoritative grade cohort (across streams)
  const gradeStudentIds = getGradeCohortStudentIds(student, allStudents, exam, classes);
  const gradeResults = examResults.filter((r) => gradeStudentIds.has(r.student_id));
  const totalGradeAssessedStudents = data.aggregateRanking?.overall_total
    ? data.aggregateRanking.overall_total
    : gradeResults.filter((r) => r.is_complete !== false).length ||
      gradeResults.length ||
      1;

  // Authoritative stream cohort
  const streamStudentIds = getStreamCohortStudentIds(student, allStudents, exam, classes);
  const streamResults = examResults.filter((r) => streamStudentIds.has(r.student_id));
  const streamAssessedStudentsCount = data.aggregateRanking?.stream_total
    ? data.aggregateRanking.stream_total
    : streamResults.filter((r) => r.is_complete !== false).length ||
      streamResults.length ||
      1;

  const evaluatedSubjectCount = learnerSubjects.length || 1;
  const maxPossibleMarks = evaluatedSubjectCount * 100;
  const maxPossiblePoints = evaluatedSubjectCount * 8;

  let currentY = 7;
  currentY = await drawBwReportHeader(
    doc,
    school,
    exam,
    currentY,
    pageWidth
  );

  currentY = drawBwLearnerInfo(
    doc,
    student,
    targetClass,
    exam,
    currentY,
    marginX,
    contentWidth
  );

  currentY = drawBwAssessmentSummary(
    doc,
    {
      totalMarks,
      maxPossibleMarks,
      averageScore,
      overallLevel: overallGradeCode,
      totalPoints,
      maxPossiblePoints,
      streamRank,
      streamTotal: streamAssessedStudentsCount,
      overallRank,
      overallTotal: totalGradeAssessedStudents,
      isComplete: isAssessmentComplete,
    },
    currentY,
    marginX,
    contentWidth
  );

  // Learning Areas Performance Table
  const tableRows = learnerSubjects.map((sb) => {
    const stdMark = marks.find(
      (m) => m.student_id === student.id && m.subject_id === sb.id && m.exam_id === examId
    );
    const markInfo = evaluateMark(stdMark, {
      subject: sb,
      classObj: targetClass,
      educationLevel: 'Junior School',
    });

    let scoreDisplay = 'X';
    let pctDisplay = 'X';
    let levelDisplay = 'X';
    let pointsDisplay = 'X';

    if (isKiswahiliSubject(sb)) {
      if (markInfo.status === 'Normal' && markInfo.percentage !== null) {
        const gr = getGradeForMark(markInfo.percentage, grades, 'Junior School', studentGrade);
        const roundedScore = Math.round(markInfo.percentage);
        scoreDisplay = `${roundedScore}/100`;
        pctDisplay = `${roundedScore}`;
        levelDisplay = gr.grade_code || gr.grade || '';
        pointsDisplay = `${gr.points}`;
      } else if (markInfo.status === 'Y') {
        scoreDisplay = 'Y';
        pctDisplay = 'Y';
        levelDisplay = 'Y';
        pointsDisplay = 'Y';
      }
    } else if (markInfo.status === 'Normal' && markInfo.percentage !== null) {
      const gr = getGradeForMark(markInfo.percentage, grades, 'Junior School', studentGrade);
      const roundedScore = Math.round(markInfo.percentage);
      scoreDisplay = `${roundedScore}/100`;
      pctDisplay = `${roundedScore}`;
      levelDisplay = gr.grade_code || gr.grade || '';
      pointsDisplay = `${gr.points}`;
    } else if (markInfo.status === 'Y') {
      scoreDisplay = 'Y';
      pctDisplay = 'Y';
      levelDisplay = 'Y';
      pointsDisplay = 'Y';
    }

    const subjectRankStr =
      markInfo.status === 'Normal'
        ? calculateSubjectRank(
            effectiveStudent,
            sb.id,
            examId,
            allStudents,
            classes,
            marks,
            subjects
          )
        : '-';
    const subjTeacher = resolveSubjectTeacher(teachers, sb.id, targetClassId, targetStreamId);
    const teacherNameStr = subjTeacher ? subjTeacher.teacher_name : '';

    return [
      sb.subject_name,
      scoreDisplay,
      pctDisplay,
      levelDisplay,
      pointsDisplay,
      subjectRankStr,
      teacherNameStr,
    ];
  });

  autoTable(doc, {
    startY: currentY,
    margin: { left: marginX, right: marginX },
    head: [['LEARNING AREA', 'SCORE', '%', 'LEVEL', 'POINTS', 'RANK', 'INSTRUCTOR']],
    body: tableRows,
    theme: 'grid',
    styles: {
      fontSize: 7.2,
      cellPadding: 1.6,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [243, 244, 246],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 7.2,
      halign: 'center',
      cellPadding: 2.0,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { halign: 'left', cellWidth: 48, fontStyle: 'bold' },
      1: { halign: 'center', cellWidth: 18 },
      2: { halign: 'center', cellWidth: 14 },
      3: { halign: 'center', cellWidth: 16, fontStyle: 'bold' },
      4: { halign: 'center', cellWidth: 16 },
      5: { halign: 'center', cellWidth: 20 },
      6: { halign: 'left', cellWidth: 58 },
    },
  });

  // @ts-ignore
  currentY = ((doc as any).lastAutoTable?.finalY ?? (currentY + 50)) + 2.5;

  // Remarks
  const classTeacher = targetClassId
    ? teachers.find((t) => t.id === targetClass?.class_teacher_id) ||
      teachers.find((t) => (t.allocations || []).some((a) => a.class_id === targetClassId))
    : undefined;
  const classTeacherName =
    savedRemarks?.class_teacher_name || classTeacher?.teacher_name || 'Class Teacher';
  const hoiName = savedRemarks?.hoi_name || school.principal_name || 'Head of Institution';

  const defaultCtComment = generatePersonalizedLearnerComment({
    student: effectiveStudent,
    examId,
    marks,
    subjects: learnerSubjects,
    grades,
    averageScore,
    commentType: 'class_teacher',
    isProvisional: !isAssessmentComplete,
  });
  const defaultHoiComment = generatePersonalizedLearnerComment({
    student: effectiveStudent,
    examId,
    marks,
    subjects: learnerSubjects,
    grades,
    averageScore,
    commentType: 'hoi',
    isProvisional: !isAssessmentComplete,
  });

  const ctComment = stripSurroundingQuotes(
    savedRemarks?.class_teacher_comment || defaultCtComment
  );
  const hoiComment = stripSurroundingQuotes(
    savedRemarks?.hoi_comment || defaultHoiComment
  );
  const currentDateStr = formatKenyaDate(new Date());

  currentY = drawBwRemarks(
    doc,
    classTeacherName,
    ctComment,
    hoiName,
    hoiComment,
    currentY,
    marginX,
    contentWidth
  );

  currentY = drawBwCbeKey(doc, true, currentY, marginX, contentWidth);

  currentY = drawBwSignatures(
    doc,
    classTeacher,
    school,
    currentY,
    marginX,
    contentWidth
  );

  // Footer: Next Term Opening Date & Generation Notice
  const nextTermDate = resolveNextTermOpeningDate(data);
  const footerY = Math.max(currentY + 2, 285);

  if (nextTermDate) {
    doc.setFontSize(6.8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(`NEXT TERM OPENING DATE: ${nextTermDate}`, marginX, footerY);
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(0, 0, 0);
  doc.text(`Generated: ${currentDateStr}`, marginX + contentWidth, footerY, {
    align: 'right',
  });

  return doc;
}

// -------------------------------------------------------------
// 2. UPPER PRIMARY REPORT CARD PDF GENERATOR (Grades 4 - 6)
// -------------------------------------------------------------
export async function generateUpperPrimaryReportPDF(
  data: PDFReportData,
  existingDoc?: jsPDF
): Promise<jsPDF> {
  const {
    student,
    school,
    exam,
    classes = [],
    subjects = [],
    marks = [],
    grades = [],
    teachers = [],
    allStudents = [],
    savedRemarks,
  } = data;

  const doc = ensureSafeJsPdf(
    existingDoc || new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  );
  const pageWidth = 210;
  const marginX = 10;
  const contentWidth = pageWidth - marginX * 2;

  const examId = exam?.id || '';
  const {
    targetClass,
    targetClassId,
    targetStreamId,
    classNameStr,
    studentGrade,
    effectiveStudent,
  } = resolvePDFLearnerContext(student, exam, classes);

  const customSubjectComments = savedRemarks?.subject_comments || {};
  const upReport = resolveUpperPrimaryReportStructure({
    student: effectiveStudent,
    exam,
    targetClass,
    subjects,
    marks,
    grades,
    teachers,
    allStudents,
    classes,
    customSubjectComments,
  });

  const examResults = calculateExamResults(
    examId,
    allStudents,
    marks,
    grades,
    classes,
    subjects,
    exam
  );
  const studentResult = examResults.find((r) => r.student_id === student.id);
  const isAssessmentComplete = upReport.isComplete;
  const totalMarks = upReport.totalMarks;
  const averageScore = upReport.averageScore;
  const totalPoints = upReport.totalPoints;
  const overallGradeCode = upReport.overallGradeCode;
  const overallRank = data.aggregateRanking
    ? data.aggregateRanking.is_complete && data.aggregateRanking.overall_rank
      ? `${data.aggregateRanking.overall_rank}`
      : 'Not Ranked'
    : isAssessmentComplete && studentResult?.position
    ? `${studentResult.position}`
    : 'Not Ranked';
  const streamRank = data.aggregateRanking
    ? data.aggregateRanking.is_complete && data.aggregateRanking.stream_rank
      ? `${data.aggregateRanking.stream_rank}`
      : 'Not Ranked'
    : isAssessmentComplete &&
      (studentResult?.class_position || studentResult?.position)
    ? `${studentResult.class_position || studentResult.position}`
    : 'Not Ranked';

  // Authoritative grade cohort (across streams)
  const gradeStudentIds = getGradeCohortStudentIds(student, allStudents, exam, classes);
  const gradeResults = examResults.filter((r) => gradeStudentIds.has(r.student_id));
  const totalGradeAssessedStudents = data.aggregateRanking?.overall_total
    ? data.aggregateRanking.overall_total
    : gradeResults.filter((r) => r.is_complete !== false).length ||
      gradeResults.length ||
      1;

  // Authoritative stream cohort
  const streamStudentIds = getStreamCohortStudentIds(student, allStudents, exam, classes);
  const streamResults = examResults.filter((r) => streamStudentIds.has(r.student_id));
  const streamAssessedStudentsCount = data.aggregateRanking?.stream_total
    ? data.aggregateRanking.stream_total
    : streamResults.filter((r) => r.is_complete !== false).length ||
      streamResults.length ||
      1;

  const maxPossibleMarks = upReport.maxPossibleMarks;
  const maxPossiblePoints = upReport.maxPossiblePoints;

  let currentY = 7;
  currentY = await drawBwReportHeader(
    doc,
    school,
    exam,
    currentY,
    pageWidth
  );

  currentY = drawBwLearnerInfo(
    doc,
    student,
    targetClass,
    exam,
    currentY,
    marginX,
    contentWidth
  );

  currentY = drawBwAssessmentSummary(
    doc,
    {
      totalMarks,
      maxPossibleMarks,
      averageScore,
      overallLevel: overallGradeCode,
      totalPoints,
      maxPossiblePoints,
      streamRank,
      streamTotal: streamAssessedStudentsCount,
      overallRank,
      overallTotal: totalGradeAssessedStudents,
      isComplete: isAssessmentComplete,
    },
    currentY,
    marginX,
    contentWidth
  );

  // Learning Areas Table (Upper Primary Composite Structure)
  const tableRows: any[] = [];
  upReport.allReportAreas.forEach((area) => {
    if (area.isConsolidated && (area as any).components) {
      const compArea = area as any;
      compArea.components.forEach((c: any) => {
        tableRows.push([
          `  • ${c.name} (Max ${c.maxScore})`,
          c.displayScore,
          '-',
          '-',
          '-',
          '-',
          c.teacherName || '',
        ]);
      });
      // Composite Summary Row
      tableRows.push([
        area.name,
        area.displayScore,
        area.percentage !== null ? `${Math.round(area.percentage)}` : area.status,
        area.gradeCode || area.performanceLevel || '',
        `${area.points}`,
        area.rank || '-',
        area.teacherName || '',
      ]);
    } else {
      tableRows.push([
        area.name,
        area.displayScore,
        area.percentage !== null ? `${Math.round(area.percentage)}` : area.status,
        area.gradeCode || area.performanceLevel || '',
        `${area.points}`,
        area.rank || '-',
        area.teacherName || '',
      ]);
    }
  });

  autoTable(doc, {
    startY: currentY,
    margin: { left: marginX, right: marginX },
    head: [['LEARNING AREA', 'SCORE', '%', 'LEVEL', 'POINTS', 'RANK', 'INSTRUCTOR']],
    body: tableRows,
    theme: 'grid',
    styles: {
      fontSize: 7.0,
      cellPadding: 1.5,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [243, 244, 246],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 7.2,
      halign: 'center',
      cellPadding: 1.8,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { halign: 'left', cellWidth: 48, fontStyle: 'bold' },
      1: { halign: 'center', cellWidth: 18 },
      2: { halign: 'center', cellWidth: 14 },
      3: { halign: 'center', cellWidth: 16, fontStyle: 'bold' },
      4: { halign: 'center', cellWidth: 16 },
      5: { halign: 'center', cellWidth: 20 },
      6: { halign: 'left', cellWidth: 58 },
    },
  });

  // @ts-ignore
  currentY = ((doc as any).lastAutoTable?.finalY ?? (currentY + 50)) + 2.5;

  // Remarks
  const classTeacher = targetClassId
    ? teachers.find((t) => t.id === targetClass?.class_teacher_id) ||
      teachers.find((t) => (t.allocations || []).some((a) => a.class_id === targetClassId))
    : undefined;
  const classTeacherName =
    savedRemarks?.class_teacher_name || classTeacher?.teacher_name || 'Class Teacher';
  const hoiName = savedRemarks?.hoi_name || school.principal_name || 'Head of Institution';

  const defaultCtComment = generatePersonalizedLearnerComment({
    student: effectiveStudent,
    examId,
    marks,
    subjects,
    grades,
    averageScore,
    commentType: 'class_teacher',
    isProvisional: !isAssessmentComplete,
  });
  const defaultHoiComment = generatePersonalizedLearnerComment({
    student: effectiveStudent,
    examId,
    marks,
    subjects,
    grades,
    averageScore,
    commentType: 'hoi',
    isProvisional: !isAssessmentComplete,
  });

  const ctComment = stripSurroundingQuotes(
    savedRemarks?.class_teacher_comment || defaultCtComment
  );
  const hoiComment = stripSurroundingQuotes(
    savedRemarks?.hoi_comment || defaultHoiComment
  );
  const currentDateStr = formatKenyaDate(new Date());

  currentY = drawBwRemarks(
    doc,
    classTeacherName,
    ctComment,
    hoiName,
    hoiComment,
    currentY,
    marginX,
    contentWidth
  );

  currentY = drawBwCbeKey(doc, false, currentY, marginX, contentWidth);

  currentY = drawBwSignatures(
    doc,
    classTeacher,
    school,
    currentY,
    marginX,
    contentWidth
  );

  // Footer: Next Term Opening Date & Generation Notice
  const nextTermDate = resolveNextTermOpeningDate(data);
  const footerY = Math.max(currentY + 2, 285);

  if (nextTermDate) {
    doc.setFontSize(6.8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(`NEXT TERM OPENING DATE: ${nextTermDate}`, marginX, footerY);
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(0, 0, 0);
  doc.text(`Generated: ${currentDateStr}`, marginX + contentWidth, footerY, {
    align: 'right',
  });

  return doc;
}

// -------------------------------------------------------------
// 3. LOWER PRIMARY REPORT CARD PDF GENERATOR (Grades 1 - 3)
// -------------------------------------------------------------
export async function generateLowerPrimaryReportPDF(
  data: PDFReportData,
  existingDoc?: jsPDF
): Promise<jsPDF> {
  const {
    student,
    school,
    exam,
    classes = [],
    subjects = [],
    marks = [],
    grades = [],
    teachers = [],
    allStudents = [],
    savedRemarks,
  } = data;

  const doc = ensureSafeJsPdf(
    existingDoc || new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  );
  const pageWidth = 210;
  const marginX = 10;
  const contentWidth = pageWidth - marginX * 2;

  const examId = exam?.id || '';
  const {
    targetClass,
    targetClassId,
    targetStreamId,
    classNameStr,
    studentGrade,
    effectiveStudent,
  } = resolvePDFLearnerContext(student, exam, classes);

  const { reportSubjects: learnerSubjects } = resolveLearnerReportSubjectsAndMarks(
    effectiveStudent,
    targetClass,
    subjects,
    teachers,
    exam,
    marks
  );
  const examResults = calculateExamResults(
    examId,
    allStudents,
    marks,
    grades,
    classes,
    subjects,
    exam
  );
  const studentResult = examResults.find((r) => r.student_id === student.id);
  const isAssessmentComplete = data.aggregateRanking
    ? data.aggregateRanking.is_complete
    : studentResult
    ? studentResult.is_complete !== false
    : false;

  const totalMarks =
    data.aggregateRanking?.total_marks !== undefined
      ? data.aggregateRanking.total_marks
      : studentResult?.total_marks || 0;
  const averageScore =
    data.aggregateRanking?.average !== undefined
      ? data.aggregateRanking.average
      : studentResult?.average || 0;
  const totalPoints = isAssessmentComplete
    ? data.aggregateRanking?.total_points !== undefined
      ? data.aggregateRanking.total_points
      : studentResult?.total_points || 0
    : 0;
  const overallGradeCode = isAssessmentComplete
    ? data.aggregateRanking?.grade_code ||
      studentResult?.grade_code ||
      studentResult?.grade ||
      'ME'
    : 'Pending';
  const overallRank = data.aggregateRanking
    ? data.aggregateRanking.is_complete && data.aggregateRanking.overall_rank
      ? `${data.aggregateRanking.overall_rank}`
      : 'Not Ranked'
    : isAssessmentComplete && studentResult?.position
    ? `${studentResult.position}`
    : 'Not Ranked';
  const streamRank = data.aggregateRanking
    ? data.aggregateRanking.is_complete && data.aggregateRanking.stream_rank
      ? `${data.aggregateRanking.stream_rank}`
      : 'Not Ranked'
    : isAssessmentComplete &&
      (studentResult?.class_position || studentResult?.position)
    ? `${studentResult.class_position || studentResult.position}`
    : 'Not Ranked';

  // Authoritative grade cohort (across streams)
  const gradeStudentIds = getGradeCohortStudentIds(student, allStudents, exam, classes);
  const gradeResults = examResults.filter((r) => gradeStudentIds.has(r.student_id));
  const totalGradeAssessedStudents = data.aggregateRanking?.overall_total
    ? data.aggregateRanking.overall_total
    : gradeResults.filter((r) => r.is_complete !== false).length ||
      gradeResults.length ||
      1;

  // Authoritative stream cohort
  const streamStudentIds = getStreamCohortStudentIds(student, allStudents, exam, classes);
  const streamResults = examResults.filter((r) => streamStudentIds.has(r.student_id));
  const streamAssessedStudentsCount = data.aggregateRanking?.stream_total
    ? data.aggregateRanking.stream_total
    : streamResults.filter((r) => r.is_complete !== false).length ||
      streamResults.length ||
      1;

  const evaluatedSubjectCount = learnerSubjects.length || 1;
  const maxPossibleMarks = evaluatedSubjectCount * 100;
  const maxPossiblePoints = evaluatedSubjectCount * 4;

  let currentY = 7;
  currentY = await drawBwReportHeader(
    doc,
    school,
    exam,
    currentY,
    pageWidth
  );

  currentY = drawBwLearnerInfo(
    doc,
    student,
    targetClass,
    exam,
    currentY,
    marginX,
    contentWidth
  );

  currentY = drawBwAssessmentSummary(
    doc,
    {
      totalMarks,
      maxPossibleMarks,
      averageScore,
      overallLevel: overallGradeCode,
      totalPoints,
      maxPossiblePoints,
      streamRank,
      streamTotal: streamAssessedStudentsCount,
      overallRank,
      overallTotal: totalGradeAssessedStudents,
      isComplete: isAssessmentComplete,
    },
    currentY,
    marginX,
    contentWidth
  );

  // Table of Learning Areas
  const tableRows = learnerSubjects.map((sb) => {
    const stdMark = marks.find(
      (m) => m.student_id === student.id && m.subject_id === sb.id && m.exam_id === examId
    );
    const markInfo = evaluateMark(stdMark, {
      subject: sb,
      classObj: targetClass,
      educationLevel: 'Lower Primary',
    });

    let scoreDisplay = 'X';
    let pctDisplay = 'X';
    let levelDisplay = 'X';
    let pointsDisplay = 'X';

    if (markInfo.status === 'Normal' && markInfo.percentage !== null) {
      const gr = getGradeForMark(markInfo.percentage, grades, 'Lower Primary', studentGrade);
      const roundedScore = Math.round(markInfo.percentage);
      scoreDisplay = `${roundedScore}/100`;
      pctDisplay = `${roundedScore}`;
      levelDisplay = gr.grade_code || gr.grade || '';
      pointsDisplay = `${gr.points}`;
    } else if (markInfo.status === 'Y') {
      scoreDisplay = 'Y';
      pctDisplay = 'Y';
      levelDisplay = 'Y';
      pointsDisplay = 'Y';
    }

    const subjectRankStr =
      markInfo.status === 'Normal'
        ? calculateSubjectRank(
            effectiveStudent,
            sb.id,
            examId,
            allStudents,
            classes,
            marks,
            subjects
          )
        : '-';
    const subjTeacher = resolveSubjectTeacher(teachers, sb.id, targetClassId, targetStreamId);
    const teacherNameStr = subjTeacher ? subjTeacher.teacher_name : '';

    return [
      sb.subject_name,
      scoreDisplay,
      pctDisplay,
      levelDisplay,
      pointsDisplay,
      subjectRankStr,
      teacherNameStr,
    ];
  });

  autoTable(doc, {
    startY: currentY,
    margin: { left: marginX, right: marginX },
    head: [['LEARNING AREA', 'SCORE', '%', 'LEVEL', 'POINTS', 'RANK', 'INSTRUCTOR']],
    body: tableRows,
    theme: 'grid',
    styles: {
      fontSize: 7.2,
      cellPadding: 1.6,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [243, 244, 246],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 7.2,
      halign: 'center',
      cellPadding: 2.0,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { halign: 'left', cellWidth: 48, fontStyle: 'bold' },
      1: { halign: 'center', cellWidth: 18 },
      2: { halign: 'center', cellWidth: 14 },
      3: { halign: 'center', cellWidth: 16, fontStyle: 'bold' },
      4: { halign: 'center', cellWidth: 16 },
      5: { halign: 'center', cellWidth: 20 },
      6: { halign: 'left', cellWidth: 58 },
    },
  });

  // @ts-ignore
  currentY = ((doc as any).lastAutoTable?.finalY ?? (currentY + 50)) + 2.5;

  // Remarks
  const classTeacher = targetClassId
    ? teachers.find((t) => t.id === targetClass?.class_teacher_id) ||
      teachers.find((t) => (t.allocations || []).some((a) => a.class_id === targetClassId))
    : undefined;
  const classTeacherName =
    savedRemarks?.class_teacher_name || classTeacher?.teacher_name || 'Class Teacher';
  const hoiName = savedRemarks?.hoi_name || school.principal_name || 'Head of Institution';

  const defaultCtComment = generatePersonalizedLearnerComment({
    student: effectiveStudent,
    examId,
    marks,
    subjects: learnerSubjects,
    grades,
    averageScore,
    commentType: 'class_teacher',
    isProvisional: !isAssessmentComplete,
  });
  const defaultHoiComment = generatePersonalizedLearnerComment({
    student: effectiveStudent,
    examId,
    marks,
    subjects: learnerSubjects,
    grades,
    averageScore,
    commentType: 'hoi',
    isProvisional: !isAssessmentComplete,
  });

  const ctComment = stripSurroundingQuotes(
    savedRemarks?.class_teacher_comment || defaultCtComment
  );
  const hoiComment = stripSurroundingQuotes(
    savedRemarks?.hoi_comment || defaultHoiComment
  );
  const currentDateStr = formatKenyaDate(new Date());

  currentY = drawBwRemarks(
    doc,
    classTeacherName,
    ctComment,
    hoiName,
    hoiComment,
    currentY,
    marginX,
    contentWidth
  );

  currentY = drawBwCbeKey(doc, false, currentY, marginX, contentWidth);

  currentY = drawBwSignatures(
    doc,
    classTeacher,
    school,
    currentY,
    marginX,
    contentWidth
  );

  // Footer: Next Term Opening Date & Generation Notice
  const nextTermDate = resolveNextTermOpeningDate(data);
  const footerY = Math.max(currentY + 2, 285);

  if (nextTermDate) {
    doc.setFontSize(6.8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(`NEXT TERM OPENING DATE: ${nextTermDate}`, marginX, footerY);
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(0, 0, 0);
  doc.text(`Generated: ${currentDateStr}`, marginX + contentWidth, footerY, {
    align: 'right',
  });

  return doc;
}

// -------------------------------------------------------------
// 4. PRE-PRIMARY REPORT CARD PDF GENERATOR (PP1 - PP2)
// -------------------------------------------------------------
export async function generatePrePrimaryReportPDF(
  data: PDFReportData,
  existingDoc?: jsPDF
): Promise<jsPDF> {
  const {
    student,
    school,
    exam,
    classes = [],
    subjects = [],
    marks = [],
    grades = [],
    teachers = [],
    savedRemarks,
  } = data;

  const doc = ensureSafeJsPdf(
    existingDoc || new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  );
  const pageWidth = 210;
  const marginX = 10;
  const contentWidth = pageWidth - marginX * 2;

  const { targetClass, targetClassId, targetStreamId, effectiveStudent } =
    resolvePDFLearnerContext(student, exam, classes);
  const learnerSubjects = getLearnerReportSubjectsForExam(
    effectiveStudent,
    targetClass,
    subjects,
    teachers,
    exam
  );
  const examId = exam?.id || '';

  let currentY = 7;
  currentY = await drawBwReportHeader(
    doc,
    school,
    exam,
    currentY,
    pageWidth
  );

  currentY = drawBwLearnerInfo(
    doc,
    student,
    targetClass,
    exam,
    currentY,
    marginX,
    contentWidth
  );

  // Table of Learning Areas
  const tableRows = learnerSubjects.map((sb) => {
    const stdMark = marks.find(
      (m) => m.student_id === student.id && m.subject_id === sb.id && m.exam_id === examId
    );
    const markInfo = evaluateMark(stdMark, {
      subject: sb,
      classObj: targetClass,
      educationLevel: 'Pre-Primary',
    });

    let scoreDisplay = 'X';
    let pctDisplay = 'X';
    let levelDisplay = 'X';
    let pointsDisplay = 'X';

    if (markInfo.status === 'Normal' && markInfo.percentage !== null) {
      const gr = getGradeForMark(markInfo.percentage, grades, 'Pre-Primary', 'PP1');
      const roundedScore = Math.round(markInfo.percentage);
      scoreDisplay = `${roundedScore}/100`;
      pctDisplay = `${roundedScore}`;
      levelDisplay = gr.grade_code || gr.grade || '';
      pointsDisplay = `${gr.points}`;
    } else if (markInfo.status === 'Y') {
      scoreDisplay = 'Y';
      pctDisplay = 'Y';
      levelDisplay = 'Y';
      pointsDisplay = 'Y';
    }

    const subjTeacher = resolveSubjectTeacher(teachers, sb.id, targetClassId, targetStreamId);
    const teacherNameStr = subjTeacher ? subjTeacher.teacher_name : '';

    return [
      sb.subject_name,
      scoreDisplay,
      pctDisplay,
      levelDisplay,
      pointsDisplay,
      '-',
      teacherNameStr,
    ];
  });

  autoTable(doc, {
    startY: currentY,
    margin: { left: marginX, right: marginX },
    head: [['LEARNING AREA', 'SCORE', '%', 'LEVEL', 'POINTS', 'RANK', 'INSTRUCTOR']],
    body: tableRows,
    theme: 'grid',
    styles: {
      fontSize: 7.2,
      cellPadding: 1.6,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [243, 244, 246],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 7.2,
      halign: 'center',
      cellPadding: 2.0,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { halign: 'left', cellWidth: 48, fontStyle: 'bold' },
      1: { halign: 'center', cellWidth: 18 },
      2: { halign: 'center', cellWidth: 14 },
      3: { halign: 'center', cellWidth: 16, fontStyle: 'bold' },
      4: { halign: 'center', cellWidth: 16 },
      5: { halign: 'center', cellWidth: 20 },
      6: { halign: 'left', cellWidth: 58 },
    },
  });

  // @ts-ignore
  currentY = ((doc as any).lastAutoTable?.finalY ?? (currentY + 50)) + 2.5;

  // Remarks
  const classTeacher = targetClassId
    ? teachers.find((t) => t.id === targetClass?.class_teacher_id) ||
      teachers.find((t) => (t.allocations || []).some((a) => a.class_id === targetClassId))
    : undefined;
  const classTeacherName =
    savedRemarks?.class_teacher_name || classTeacher?.teacher_name || 'Class Teacher';
  const hoiName = savedRemarks?.hoi_name || school.principal_name || 'Head of Institution';

  const defaultCtComment = 'The learner shows good developmental milestones in all learning activities.';
  const defaultHoiComment = 'Commendable growth in foundational competencies.';

  const ctComment = stripSurroundingQuotes(
    savedRemarks?.class_teacher_comment || defaultCtComment
  );
  const hoiComment = stripSurroundingQuotes(
    savedRemarks?.hoi_comment || defaultHoiComment
  );
  const currentDateStr = formatKenyaDate(new Date());

  currentY = drawBwRemarks(
    doc,
    classTeacherName,
    ctComment,
    hoiName,
    hoiComment,
    currentY,
    marginX,
    contentWidth
  );

  currentY = drawBwCbeKey(doc, false, currentY, marginX, contentWidth);

  currentY = drawBwSignatures(
    doc,
    classTeacher,
    school,
    currentY,
    marginX,
    contentWidth
  );

  // Footer: Next Term Opening Date & Generation Notice
  const nextTermDate = resolveNextTermOpeningDate(data);
  const footerY = Math.max(currentY + 2, 285);

  if (nextTermDate) {
    doc.setFontSize(6.8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(`NEXT TERM OPENING DATE: ${nextTermDate}`, marginX, footerY);
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(0, 0, 0);
  doc.text(`Generated: ${currentDateStr}`, marginX + contentWidth, footerY, {
    align: 'right',
  });

  return doc;
}

// -------------------------------------------------------------
// MAIN ENTRY POINT FOR PDF DOCUMENT GENERATION
// -------------------------------------------------------------
export async function createReportCardPDFDoc(
  data: PDFReportData,
  existingDoc?: jsPDF
): Promise<jsPDF> {
  const { student, exam, classes } = data;
  const { studentGrade } = resolvePDFLearnerContext(student, exam, classes);
  const eduLevel: EducationLevel = getEducationLevelForGrade(studentGrade);

  switch (eduLevel) {
    case 'Pre-Primary':
      return generatePrePrimaryReportPDF(data, existingDoc);
    case 'Lower Primary':
      return generateLowerPrimaryReportPDF(data, existingDoc);
    case 'Upper Primary':
      return generateUpperPrimaryReportPDF(data, existingDoc);
    case 'Junior School':
    default:
      return generateJuniorSchoolReportPDF(data, existingDoc);
  }
}

// Download single learner PDF
export async function downloadSingleReportCardPDF(data: PDFReportData): Promise<void> {
  const doc = await createReportCardPDFDoc(data);
  const rawStudentName =
    data.student?.full_name || (data.student as any)?.name || 'Learner';
  const cleanStudentName = String(rawStudentName)
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanAdm = String(data.student?.admission_number || 'ADM').replace(
    /[^a-zA-Z0-9_-]/g,
    '_'
  );
  const fileName = `${cleanAdm}_${cleanStudentName}_ReportCard.pdf`;
  await savePdf(doc, fileName);
}

// Download batch combined PDF of report cards (One master PDF document, exactly 1 page per learner)
export async function downloadAllReportCardsCombinedPDF(
  dataList: PDFReportData[],
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  if (!dataList || dataList.length === 0) return;

  const total = dataList.length;
  const masterDoc = ensureSafeJsPdf(
    new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  );

  for (let i = 0; i < total; i++) {
    const item = dataList[i];
    if (onProgress) {
      onProgress(i + 1, total);
    }
    if (i > 0) {
      masterDoc.addPage('a4', 'portrait');
    }
    await createReportCardPDFDoc(item, masterDoc);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  const firstItem = dataList[0];
  const examName = getDisplayExamName(firstItem?.exam?.exam_name) || 'Report';
  const year = firstItem?.exam?.year || new Date().getFullYear();
  const { classNameStr } = resolvePDFLearnerContext(
    firstItem.student,
    firstItem.exam,
    firstItem.classes
  );

  const cleanClass = String(classNameStr || 'Class').replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanExam = String(examName || 'Assessment').replace(/[^a-zA-Z0-9_-]/g, '_');

  const fileName = `Report_Forms_${cleanExam}_${year}_${cleanClass}.pdf`;
  await savePdf(masterDoc, fileName);
}

// Download batch ZIP of report cards (Kept for compatibility)
export async function downloadAllReportCardsZIP(
  dataList: PDFReportData[],
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  const zip = new JSZip();
  const total = dataList.length;

  for (let i = 0; i < total; i++) {
    const item = dataList[i];
    if (onProgress) {
      onProgress(i + 1, total);
    }
    const doc = await createReportCardPDFDoc(item);
    const pdfBlob = doc.output('blob');
    const rawStudentName =
      item.student?.full_name || (item.student as any)?.name || 'Learner';
    const cleanStudentName = String(rawStudentName)
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanAdm = String(item.student?.admission_number || 'ADM').replace(
      /[^a-zA-Z0-9_-]/g,
      '_'
    );
    const fileName = `${cleanAdm}_${cleanStudentName}_ReportCard.pdf`;
    zip.file(fileName, pdfBlob);
  }

  const firstExam =
    getDisplayExamName(dataList[0]?.exam?.exam_name) || 'Class_Report_Cards';
  const zipName = `Learner_Report_Cards_${String(firstExam || 'Assessment').replace(
    /\s+/g,
    '_'
  )}.zip`;

  const content = await zip.generateAsync({ type: 'blob' });
  await saveFile(content, zipName, { mimeType: 'application/zip' });
}
