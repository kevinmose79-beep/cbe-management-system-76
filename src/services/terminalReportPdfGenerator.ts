/**
 * Authoritative Terminal Report PDF Generator
 *
 * Presentation Layer for the Terminal Learner Report Form.
 * Strictly adheres to the Black & White typeset specification:
 * - Pure Black and White (No colors, no greys, no badges, no colored headers)
 * - Typography: Bold Black and Regular Black only
 * - School Name sourced dynamically from Settings (Never hard-coded)
 * - Header: School Name, TERMINAL LEARNER REPORT FORM, TERM • YEAR
 * - Learner Information table (Learner, Adm No, Class, Stream, Stream Rank, Overall Rank)
 * - Main Learning Area Performance table:
 *     # | Learning Area | [Dynamic Assessment Columns] | Terminal Score | Level | Points | Rank | Comment | Instructor
 * - Dynamic assessment columns from contributing assessments (No fixed EXAM 1 / EXAM 2)
 * - Full learning-area names without truncation
 * - Consumes authoritative results-engine data without independent recalculation
 * - Summary: Terminal Total & Mean Score in a single horizontal box
 * - Class Teacher's Remarks (with writing lines and Class Teacher line)
 * - Head Teacher's Remarks (with writing lines and Head Teacher line)
 * - Compact Legend: 8-level points mapping
 * - Footer: Next Term Opens line only (No system notes or watermarks)
 * - Compact single-page A4 Portrait layout
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ensureSafeJsPdf } from '../utils/pdfSafeUtils';
import { Student, School, ClassStream, Subject, Grade, Teacher } from '../types';
import {
  ContributingAssessmentRef,
  LearningAreaTerminalResult,
  getUpperPrimaryCanonicalSubjects,
} from './terminalResultsEngine';
import {
  TerminalLearnerRanking,
  AssessmentRankingSummary,
  calculateSingleLearnerAssessmentRankings,
} from './terminalRankingEngine';
export type { AssessmentRankingSummary };
import { getStreamNameForLearner } from './terminalMeritListExporter';
import { savePdf } from '../utils/fileDownloader';
import { formatKenyaDate } from '../utils/kenyaDateUtils';
import { stripSurroundingQuotes } from '../utils/filterUtils';
import { resolveSubjectTeacher, resolveClassTeacher } from '../utils/teacherResolutionUtils';
import { isKiswahiliSubject } from '../utils/kiswahiliCommentValidator';
import { generatePersonalizedLearnerComment } from './learnerCommentGenerator';
import { isUpperPrimaryContext } from '../utils/upperPrimaryReportUtils';
import { getGradeForMark } from './analysisEngine';
import { isGrade9Term3Report } from './nextTermOpeningDateResolver';

/**
 * Safely embeds an image into a jsPDF document with format detection (PNG, JPEG, WEBP).
 * Avoids silent rendering failures when image format differs from hardcoded string.
 */
export function drawPdfImage(
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
  if (urlLower.includes('data:image/jpeg') || urlLower.includes('data:image/jpg') || urlLower.endsWith('.jpg') || urlLower.endsWith('.jpeg')) {
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

export interface TerminalReportPDFData {
  student: Student;
  school: School;
  classStream?: ClassStream;
  academicYear: string | number;
  term: string;
  isProvisionalMode?: boolean;
  contributingAssessments: ContributingAssessmentRef[];
  subjects: Subject[];
  resultsBySubject: Map<string, LearningAreaTerminalResult>;
  grades?: Grade[];
  teachers?: Teacher[];
  classes?: ClassStream[];
  nextTermOpeningDate?: string;
  customSubjectComments?: Record<string, string>;
  savedRemarks?: {
    class_teacher_comment?: string;
    class_teacher_name?: string;
    headteacher_comment?: string;
    headteacher_name?: string;
    hoi_name?: string;
    subject_comments?: Record<string, string>;
  };
  ranking?: TerminalLearnerRanking;
  assessmentRankings?: Record<string, AssessmentRankingSummary>;
  subjectRanks?: Record<string, string>;
  hideSubComponents?: boolean;
}

export interface ResolvedTerminalReportRemarks {
  class_teacher_name: string;
  class_teacher_comment: string;
  headteacher_name: string;
  headteacher_comment: string;
}

/**
 * Authoritatively resolves Class Teacher & Head Teacher names and pedagogical remarks
 * with data-driven fallbacks when explicit savedRemarks entries are absent.
 */
export function resolveTerminalReportRemarks(
  data: Partial<TerminalReportPDFData>
): ResolvedTerminalReportRemarks {
  const {
    student,
    school,
    classStream,
    teachers = [],
    savedRemarks,
    subjects = [],
    resultsBySubject,
    ranking,
    grades = [],
    isProvisionalMode = false,
  } = data;

  // 1. CLASS TEACHER NAME RESOLUTION
  let classTeacherName = '';
  if (savedRemarks?.class_teacher_name && savedRemarks.class_teacher_name.trim()) {
    classTeacherName = savedRemarks.class_teacher_name.trim();
  } else {
    const matchedTeacher = resolveClassTeacher(teachers, classStream);
    if (matchedTeacher && matchedTeacher.teacher_name) {
      classTeacherName = matchedTeacher.teacher_name.trim();
    }
  }

  // 2. HEAD TEACHER NAME RESOLUTION
  let headteacherName = '';
  if (savedRemarks?.headteacher_name && savedRemarks.headteacher_name.trim()) {
    headteacherName = savedRemarks.headteacher_name.trim();
  } else if (savedRemarks?.hoi_name && savedRemarks.hoi_name.trim()) {
    headteacherName = savedRemarks.hoi_name.trim();
  } else if (school?.principal_name && school.principal_name.trim()) {
    headteacherName = school.principal_name.trim();
  }

  // 3 & 4. REMARKS RESOLUTION
  const explicitCtComment = savedRemarks?.class_teacher_comment
    ? stripSurroundingQuotes(savedRemarks.class_teacher_comment).trim()
    : '';
  const explicitHtComment = savedRemarks?.headteacher_comment
    ? stripSurroundingQuotes(savedRemarks.headteacher_comment).trim()
    : '';

  let ctComment = explicitCtComment;
  let htComment = explicitHtComment;

  if ((!ctComment || !htComment) && student && subjects.length > 0) {
    const enrichedSubjects = subjects.map((s) => {
      const res = resultsBySubject?.get(s.id);
      return {
        ...s,
        percentage: res?.isComplete && typeof res.terminalPercentage === 'number' ? res.terminalPercentage : null,
        status: res?.status || 'Normal',
      };
    });

    let averageScore: number | undefined = undefined;
    if (ranking && typeof ranking.terminalTotalMarks === 'number' && subjects.length > 0) {
      averageScore = Math.round((ranking.terminalTotalMarks / subjects.length) * 10) / 10;
    } else if (resultsBySubject) {
      let sum = 0;
      let count = 0;
      subjects.forEach((s) => {
        const r = resultsBySubject.get(s.id);
        if (r?.isComplete && typeof r.terminalPercentage === 'number') {
          sum += r.terminalPercentage;
          count++;
        }
      });
      if (count > 0) {
        averageScore = Math.round((sum / count) * 10) / 10;
      }
    }

    if (!ctComment) {
      ctComment = generatePersonalizedLearnerComment({
        student,
        examId: '',
        marks: [],
        subjects: enrichedSubjects as any,
        grades,
        averageScore,
        commentType: 'class_teacher',
        isProvisional: isProvisionalMode,
      });
    }

    if (!htComment) {
      htComment = generatePersonalizedLearnerComment({
        student,
        examId: '',
        marks: [],
        subjects: enrichedSubjects as any,
        grades,
        averageScore,
        commentType: 'hoi',
        isProvisional: isProvisionalMode,
      });
    }
  }

  return {
    class_teacher_name: classTeacherName,
    class_teacher_comment: ctComment,
    headteacher_name: headteacherName,
    headteacher_comment: htComment,
  };
}

export const TERMINAL_PDF_COLORS = {
  BLACK: [0, 0, 0] as [number, number, number],
  WHITE: [255, 255, 255] as [number, number, number],
};

/**
 * Generates an authoritative default developmental comment for a learning area.
 */
export function getDefaultSubjectComment(subject: Subject, result: LearningAreaTerminalResult | undefined): string {
  if (!result) {
    return 'Incomplete assessment record; pending evaluation.';
  }

  if (result.status === 'INCOMPLETE (X)') {
    return 'Incomplete record; missed contributing assessment.';
  }
  if (result.status === 'INCOMPLETE (Y)') {
    return 'Irregularity recorded; pending board resolution.';
  }
  if (result.status === 'INCOMPLETE (X/Y)') {
    return 'Incomplete and irregular record.';
  }

  const isKis = isKiswahiliSubject(subject);
  const band = result.cbePerformanceLevel || '';

  if (band.startsWith('EE')) {
    if (isKis) return 'Umahiri wa hali ya juu katika stadi za somo.';
    return 'Exceeding expectations with outstanding mastery.';
  }
  if (band.startsWith('ME')) {
    if (isKis) return 'Kiwango cha kuridhisha katika umilisi na utendaji.';
    return 'Meeting expectations with solid grasp of skills.';
  }
  if (band.startsWith('AE')) {
    if (isKis) return 'Anakaribia kiwango kinachohitajika; anahitaji mazoezi.';
    return 'Approaching expectations. Commendable effort.';
  }
  if (band.startsWith('BE')) {
    if (isKis) return 'Chini ya kiwango; anahitaji mwongozo wa karibu.';
    return 'Below expectations. Requires targeted support.';
  }

  return 'Good progress shown throughout the term.';
}

/**
 * Clean and format assessment header dynamically:
 * - Bans "CAT" terminology (converts to "Assessment")
 * - Strips redundant Grade prefix (e.g. "Grade 9") and Term/Year suffix (e.g. "Term 3 2026")
 *   since Grade, Term, and Year are already displayed in the main report headers
 * - Returns clean, readable title (e.g., "OPENER ASSESSMENT", "MID TERM ASSESSMENT", "ASSESSMENT 1")
 */
export function formatAssessmentColumnHeader(rawName: string, index: number): string {
  if (!rawName) return `ASSESSMENT ${index + 1}`;
  let name = rawName.replace(/\bCAT\s*(\d+)?\b/gi, (_, n) => (n ? `Assessment ${n}` : 'Assessment'));
  // Remove redundant Grade prefix
  name = name.replace(/^Grade\s*\d+\s*[-:]?\s*/i, '');
  // Remove redundant Term/Year suffix
  name = name.replace(/\s*[-–—]?\s*Term\s*\d+\s*(20\d\d)?\s*$/i, '');
  name = name.replace(/\s*[-–—]?\s*20\d\d\s*$/i, '');
  name = name.trim();
  return (name || `ASSESSMENT ${index + 1}`).toUpperCase();
}

/**
 * Wraps text naturally at word boundaries without breaking words character-by-character.
 */
export function wrapHeaderTextAtWordBoundaries(text: string, maxLineLength: number = 12): string {
  if (!text) return '';
  const words = text.trim().split(/\s+/);
  if (words.length <= 1) return text;

  const lines: string[] = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    if (`${currentLine} ${word}`.length <= maxLineLength) {
      currentLine = `${currentLine} ${word}`;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return lines.join('\n');
}

/**
 * Converts an image URL / base64 string to a monochrome (grayscale) Data URL
 * suitable for pure black and white PDF documents, downscaling to print-optimal dimensions (KB size).
 */
export async function convertImageToMonochromeDataUrl(imageUrl: string): Promise<string | null> {
  if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.trim()) return null;
  // If not running in a browser DOM environment with HTMLCanvasElement support, return original imageUrl
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof Image === 'undefined') {
    return imageUrl;
  }
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      let resolved = false;

      img.onload = () => {
        if (resolved) return;
        resolved = true;
        try {
          const MAX_DIM = 240; // 240px produces ultra-crisp >400 DPI for a 15mm PDF logo box
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
          if (!ctx) {
            resolve(imageUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const imgData = ctx.getImageData(0, 0, width, height);
          const data = imgData.data;
          for (let i = 0; i < data.length; i += 4) {
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            data[i] = gray;     // R
            data[i + 1] = gray; // G
            data[i + 2] = gray; // B
          }
          ctx.putImageData(imgData, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } catch (err) {
          console.warn('Monochrome conversion fallback:', err);
          resolve(imageUrl);
        }
      };
      img.onerror = () => {
        if (resolved) return;
        resolved = true;
        resolve(imageUrl);
      };

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(imageUrl);
        }
      }, 300);

      img.src = imageUrl;
    } catch {
      resolve(imageUrl);
    }
  });
}

/**
 * Builds an A4 Portrait jsPDF document for a learner's Terminal Report.
 * Uses strictly black & white presentation with white backgrounds and black borders.
 */
export async function buildTerminalReportDoc(
  data: TerminalReportPDFData,
  existingDoc?: jsPDF
): Promise<jsPDF> {
  const {
    student,
    school,
    classStream,
    academicYear,
    term,
    contributingAssessments = [],
    subjects = [],
    resultsBySubject,
    nextTermOpeningDate,
    savedRemarks,
    teachers = [],
    customSubjectComments,
    ranking,
    subjectRanks,
  } = data;

  const doc = ensureSafeJsPdf(existingDoc || new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }));
  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 8;
  const contentWidth = pageWidth - marginX * 2;

  let currentY = 8;

  // -------------------------------------------------------------
  // 1. HEADER (SCHOOL LOGO, SCHOOL NAME, MOTTO, TITLE, TERM • YEAR) — ALL CENTERED
  // -------------------------------------------------------------
  // Sourced strictly from Settings / school object (Never hard-coded)
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  doc.setFillColor(255, 255, 255);

  if (school?.logo_url) {
    try {
      const monoLogo = await convertImageToMonochromeDataUrl(school.logo_url);
      if (monoLogo) {
        const logoSize = 15;
        const logoX = (pageWidth - logoSize) / 2;
        doc.addImage(monoLogo, 'PNG', logoX, currentY, logoSize, logoSize);
        currentY += logoSize + 5.5;
      }
    } catch (e) {
      console.warn('Could not render logo in terminal report PDF:', e);
    }
  }

  const schoolName = (school?.school_name || '').trim().toUpperCase();
  const isUpperPrimary = isUpperPrimaryContext(student, classStream);

  if (schoolName) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(schoolName, pageWidth / 2, currentY, { align: 'center' });
    currentY += 5.0;
  }

  const schoolMotto = (school?.motto || '').trim();
  if (schoolMotto) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.text(`"${schoolMotto}"`, pageWidth / 2, currentY, { align: 'center' });
    currentY += 4.5;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(isUpperPrimary ? 'UPPER PRIMARY TERMINAL REPORT' : 'TERMINAL LEARNER REPORT FORM', pageWidth / 2, currentY, { align: 'center' });
  currentY += 4.8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(`${term.toUpperCase()} • ${academicYear}`, pageWidth / 2, currentY, { align: 'center' });
  currentY += 7.0;

  // -------------------------------------------------------------
  // 2. LEARNER INFORMATION
  // -------------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.text('LEARNER INFORMATION', marginX, currentY);
  currentY += 2.5;

  const learnerFullName = (
    student.full_name || `${student.first_name || ''} ${student.last_name || ''}`
  ).trim().toUpperCase() || 'LEARNER';

  const learnerStreamName = getStreamNameForLearner(student, data.classes || (classStream ? [classStream] : []));
  const baseClassName = classStream?.class_name || student.grade || (student as any).class_name || 'Class';
  const classNameStr = (classStream?.class_name || baseClassName).toUpperCase();
  const streamNameStr = (learnerStreamName && learnerStreamName !== '—'
    ? learnerStreamName
    : classStream?.stream || '—').toUpperCase();

  const streamRankStr = ranking && ranking.isRankable && ranking.streamPosition !== null
    ? `${ranking.streamPosition} / ${ranking.streamPositionDenominator}`
    : '____ / ____';

  const overallRankStr = ranking && ranking.isRankable && ranking.overallPosition !== null
    ? `${ranking.overallPosition} / ${ranking.overallPositionDenominator}`
    : '____ / ____';

  autoTable(doc, {
    startY: currentY,
    margin: { left: marginX, right: marginX },
    head: [['LEARNER', 'ADM NO', 'CLASS', 'STREAM', 'STREAM RANK', 'OVERALL RANK']],
    body: [[
      learnerFullName,
      student.admission_number || 'N/A',
      classNameStr,
      streamNameStr,
      streamRankStr,
      overallRankStr,
    ]],
    theme: 'grid',
    styles: {
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      font: 'helvetica',
      fontSize: 7.2,
      cellPadding: 1.8,
      fillColor: [255, 255, 255],
      valign: 'middle',
    },
    headStyles: {
      fontStyle: 'bold',
      textColor: [0, 0, 0],
      fillColor: [255, 255, 255],
      halign: 'left',
    },
    bodyStyles: {
      fontStyle: 'normal',
      textColor: [0, 0, 0],
      fillColor: [255, 255, 255],
      halign: 'left',
    },
    columnStyles: {
      0: { cellWidth: 54 },
      1: { cellWidth: 26 },
      2: { cellWidth: 26 },
      3: { cellWidth: 26 },
      4: { cellWidth: 31, halign: 'center' },
      5: { cellWidth: 31, halign: 'center' },
    },
    tableWidth: contentWidth,
  });

  currentY = (doc as any).lastAutoTable.finalY + 5.0;

  // -------------------------------------------------------------
  // 3. LEARNING AREA PERFORMANCE (MAIN TABLE)
  // -------------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.text('LEARNING AREA PERFORMANCE', marginX, currentY);
  currentY += 2.5;

  // Build clean dynamic assessment headers (Bans "CAT" terminology, cleans redundant prefixes)
  const assessmentHeaders = contributingAssessments.map((a, idx) => {
    return formatAssessmentColumnHeader(a.exam_name, idx);
  });

  const numAssessments = contributingAssessments.length;

  const tableHead = [
    [
      '#',
      'LEARNING AREA',
      ...assessmentHeaders.map((h) => wrapHeaderTextAtWordBoundaries(h, numAssessments >= 3 ? 10 : 12)),
      'TERMINAL\nSCORE',
      'LEVEL',
      'POINTS',
      'RANK',
      'COMMENT',
      'INSTRUCTOR',
    ],
  ];

  // Dynamic geometry calculation across exact 194mm printable width
  // Ensures assessment columns are sufficiently wide and headers don't wrap excessively
  const hashWidth = numAssessments >= 5 ? 5.0 : 5.5;
  let learningAreaWidth: number;
  let assessmentColWidth: number;
  let terminalScoreWidth: number;
  let levelWidth: number;
  let pointsWidth: number;
  let rankWidth: number;
  let commentWidth: number;
  let instructorWidth: number;

  if (numAssessments === 2) {
    learningAreaWidth = 36.0;
    assessmentColWidth = 17.5;
    terminalScoreWidth = 17.0;
    levelWidth = 11.0;
    pointsWidth = 10.0;
    rankWidth = 11.0;
    commentWidth = 43.5;
    instructorWidth = 25.0;
  } else if (numAssessments === 1) {
    learningAreaWidth = 40.0;
    assessmentColWidth = 22.0;
    terminalScoreWidth = 18.0;
    levelWidth = 12.0;
    pointsWidth = 11.0;
    rankWidth = 12.0;
    commentWidth = 47.5;
    instructorWidth = 26.0;
  } else if (numAssessments === 3) {
    learningAreaWidth = 34.0;
    assessmentColWidth = 15.0;
    terminalScoreWidth = 16.0;
    levelWidth = 11.0;
    pointsWidth = 9.5;
    rankWidth = 10.5;
    commentWidth = 40.0;
    instructorWidth = 22.5;
  } else if (numAssessments === 4) {
    learningAreaWidth = 32.0;
    assessmentColWidth = 13.5;
    terminalScoreWidth = 15.0;
    levelWidth = 10.0;
    pointsWidth = 9.0;
    rankWidth = 10.0;
    commentWidth = 37.0;
    instructorWidth = 21.5;
  } else {
    // numAssessments >= 5 or 0
    learningAreaWidth = 30.0;
    terminalScoreWidth = 14.5;
    levelWidth = 9.5;
    pointsWidth = 8.5;
    rankWidth = 9.5;
    commentWidth = 34.5;
    instructorWidth = 20.5;
    const fixedTotal = hashWidth + learningAreaWidth + terminalScoreWidth + levelWidth + pointsWidth + rankWidth + commentWidth + instructorWidth;
    assessmentColWidth = (contentWidth - fixedTotal) / (numAssessments || 1);
  }

  const targetClassId = classStream?.id || student.class_id;
  const targetStreamId = classStream?.stream_id || (student as any).stream_id;
  const effectiveSubjects = isUpperPrimary ? getUpperPrimaryCanonicalSubjects(subjects) : subjects;

  const tableBody: (string | { content: string; styles?: any })[][] = [];

  effectiveSubjects.forEach((subject, idx) => {
    const res = resultsBySubject.get(subject.id);
    const entryWithComponents = res?.assessmentTrail?.find(
      (t) => t.components && t.components.length > 0
    );
    const hasComponents = Boolean(
      isUpperPrimary &&
      !data.hideSubComponents &&
      entryWithComponents?.components &&
      entryWithComponents.components.length > 0
    );

    const teacherObj = resolveSubjectTeacher(teachers, subject.id, targetClassId, targetStreamId);
    const teacherName = teacherObj ? teacherObj.teacher_name : '';

    if (hasComponents && entryWithComponents?.components) {
      entryWithComponents.components.forEach((comp) => {
        const compExamMarks = contributingAssessments.map((a) => {
          const trail = res?.assessmentTrail?.find((t) => t.examId === a.id);
          const c = trail?.components?.find((tc) => tc.code === comp.code);
          if (!c) return '—';
          if (c.status === 'Normal' && c.rawScore !== null) {
            return `${c.rawScore}/${c.outOf}`;
          }
          return c.displayScore || '—';
        });

        tableBody.push([
          '—',
          `  ${comp.name} (${comp.outOf}%)`,
          ...compExamMarks,
          '—',
          '—',
          '—',
          '—',
          `Component contribution (${comp.outOf}%)`,
          teacherName,
        ]);
      });
    }

    // Dynamic assessment marks
    const examMarks = contributingAssessments.map((a) => {
      const trail = res?.assessmentTrail?.find((t) => t.examId === a.id);
      if (!trail) return 'X';
      if (trail.status === 'X' || trail.status === 'Blank') return 'X';
      if (trail.status === 'Y') return 'Y';
      if (typeof trail.percentage === 'number') {
        return `${Math.round(trail.percentage)}`;
      }
      if (typeof trail.rawScore === 'number') {
        return String(trail.rawScore);
      }
      return 'X';
    });

    // Terminal Score
    let terminalScoreDisplay = '—';
    if (res) {
      if (res.isComplete && typeof res.terminalPercentage === 'number') {
        terminalScoreDisplay = String(res.terminalPercentage);
      } else if (res.status === 'INCOMPLETE (X)') {
        terminalScoreDisplay = 'X';
      } else if (res.status === 'INCOMPLETE (Y)') {
        terminalScoreDisplay = 'Y';
      } else if (res.status === 'INCOMPLETE (X/Y)') {
        terminalScoreDisplay = 'X/Y';
      }
    }

    // Level and Points
    const upGradeObj = isUpperPrimary && res?.isComplete && typeof res?.terminalPercentage === 'number'
      ? getGradeForMark(res.terminalPercentage, data.grades, 'Upper Primary', student.grade || classStream?.class_name)
      : null;

    const levelDisplay = res?.isComplete
      ? (isUpperPrimary
          ? (upGradeObj?.grade_code || upGradeObj?.performance_level || 'BE')
          : (res?.cbePerformanceLevel || '—'))
      : '—';

    const pointsDisplay = res?.isComplete
      ? (isUpperPrimary
          ? String(upGradeObj?.points ?? 1)
          : (typeof res?.points === 'number' ? String(res.points) : '—'))
      : '—';

    // Rank inside Learning Area Performance table
    const rankDisplay = subjectRanks?.[subject.id] || '—';

    // Comment
    const commentDisplay =
      customSubjectComments?.[subject.id] ||
      savedRemarks?.subject_comments?.[subject.id] ||
      getDefaultSubjectComment(subject, res);

    tableBody.push([
      String(idx + 1),
      hasComponents ? `${subject.subject_name} (TOTAL)` : subject.subject_name,
      ...examMarks,
      terminalScoreDisplay,
      levelDisplay,
      pointsDisplay,
      rankDisplay,
      commentDisplay,
      teacherName,
    ]);
  });

  const columnStylesObj: Record<number, any> = {
    0: { cellWidth: hashWidth, halign: 'center' },
    1: { cellWidth: learningAreaWidth, halign: 'left' },
  };

  for (let i = 0; i < numAssessments; i++) {
    columnStylesObj[2 + i] = { cellWidth: assessmentColWidth, halign: 'center' };
  }

  const termScoreIdx = 2 + numAssessments;
  const levelIdx = termScoreIdx + 1;
  const pointsIdx = levelIdx + 1;
  const rankIdx = pointsIdx + 1;
  const commentIdx = rankIdx + 1;
  const instructorIdx = commentIdx + 1;

  columnStylesObj[termScoreIdx] = { cellWidth: terminalScoreWidth, halign: 'center' };
  columnStylesObj[levelIdx] = { cellWidth: levelWidth, halign: 'center' };
  columnStylesObj[pointsIdx] = { cellWidth: pointsWidth, halign: 'center' };
  columnStylesObj[rankIdx] = { cellWidth: rankWidth, halign: 'center' };
  columnStylesObj[commentIdx] = { cellWidth: commentWidth, halign: 'left' };
  columnStylesObj[instructorIdx] = { cellWidth: instructorWidth, halign: 'left' };

  autoTable(doc, {
    startY: currentY,
    margin: { left: marginX, right: marginX },
    head: tableHead,
    body: tableBody,
    theme: 'grid',
    styles: {
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.15,
      font: 'helvetica',
      fontSize: numAssessments >= 4 ? 6.0 : 6.5,
      cellPadding: { top: 1.5, bottom: 1.5, left: 1.0, right: 1.0 },
      fillColor: [255, 255, 255],
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      fontStyle: 'bold',
      textColor: [0, 0, 0],
      fillColor: [255, 255, 255],
      halign: 'center',
      valign: 'middle',
      fontSize: numAssessments >= 4 ? 5.8 : (numAssessments === 3 ? 6.0 : 6.3),
      cellPadding: { top: 1.8, bottom: 1.8, left: 0.6, right: 0.6 },
      lineWidth: 0.15,
      lineColor: [0, 0, 0],
    },
    bodyStyles: {
      fontStyle: 'normal',
      textColor: [0, 0, 0],
      fillColor: [255, 255, 255],
    },
    columnStyles: columnStylesObj,
    tableWidth: 'auto',
  });

  currentY = (doc as any).lastAutoTable.finalY + 4.0;

  // -------------------------------------------------------------
  // 3B. ASSESSMENT PERFORMANCE SUMMARY
  // -------------------------------------------------------------
  const effectiveAssessmentRankings =
    data.assessmentRankings ||
    (contributingAssessments && contributingAssessments.length > 0
      ? calculateSingleLearnerAssessmentRankings({
          student,
          classStream,
          resultsBySubject,
          applicableSubjects: effectiveSubjects,
          contributingAssessments,
          isProvisionalMode: data.isProvisionalMode,
        })
      : undefined);

  if (contributingAssessments && contributingAssessments.length > 0 && effectiveAssessmentRankings) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    doc.text('ASSESSMENT PERFORMANCE SUMMARY', marginX, currentY);
    currentY += 2.5;

    const summaryHead = [['ASSESSMENT NAME', 'TOTAL MARKS', 'STREAM RANK', 'OVERALL GRADE RANK']];
    const summaryBody = contributingAssessments.map((a, idx) => {
      const name = formatAssessmentColumnHeader(a.exam_name, idx);
      const ranking = effectiveAssessmentRankings?.[a.id];

      let totalStr = '—';
      let streamRankStr = '—';
      let overallRankStr = '—';

      if (ranking) {
        if (ranking.totalMarks !== null && ranking.totalMarks !== undefined) {
          totalStr = `${ranking.totalMarks} / ${ranking.maxMarks}`;
        }
        if (ranking.isComplete && ranking.streamPosition !== null && ranking.streamPosition !== undefined) {
          streamRankStr = ranking.streamDenominator
            ? `${ranking.streamPosition} / ${ranking.streamDenominator}`
            : `${ranking.streamPosition}`;
        } else if (!ranking.isComplete) {
          streamRankStr = 'Unranked';
        }

        if (ranking.isComplete && ranking.overallPosition !== null && ranking.overallPosition !== undefined) {
          overallRankStr = ranking.overallDenominator
            ? `${ranking.overallPosition} / ${ranking.overallDenominator}`
            : `${ranking.overallPosition}`;
        } else if (!ranking.isComplete) {
          overallRankStr = 'Unranked';
        }
      }

      return [name, totalStr, streamRankStr, overallRankStr];
    });

    autoTable(doc, {
      startY: currentY,
      margin: { left: marginX, right: marginX },
      head: summaryHead,
      body: summaryBody,
      theme: 'grid',
      styles: {
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.15,
        font: 'helvetica',
        fontSize: 6.5,
        cellPadding: { top: 1.5, bottom: 1.5, left: 1.5, right: 1.5 },
        fillColor: [255, 255, 255],
        valign: 'middle',
      },
      headStyles: {
        fontStyle: 'bold',
        textColor: [0, 0, 0],
        fillColor: [255, 255, 255],
        fontSize: 6.3,
        cellPadding: { top: 1.8, bottom: 1.8, left: 1.5, right: 1.5 },
        lineWidth: 0.15,
        lineColor: [0, 0, 0],
      },
      bodyStyles: {
        fontStyle: 'normal',
        textColor: [0, 0, 0],
        fillColor: [255, 255, 255],
        halign: 'left',
      },
      columnStyles: {
        0: { cellWidth: 70, halign: 'left' },
        1: { cellWidth: 40, halign: 'center' },
        2: { cellWidth: 42, halign: 'center' },
        3: { cellWidth: 42, halign: 'center' },
      },
      tableWidth: contentWidth,
    });

    currentY = (doc as any).lastAutoTable.finalY + 4.0;
  }

  // -------------------------------------------------------------
  // 4. SUMMARY (TERMINAL TOTAL & MEAN SCORE)
  // -------------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.text('SUMMARY', marginX, currentY);
  currentY += 2.5;

  const terminalTotalMarks = ranking?.terminalTotalMarks ?? (
    isUpperPrimary
      ? (() => {
          let sum = 0;
          for (const s of effectiveSubjects) {
            const r = resultsBySubject.get(s.id);
            if (!r || !r.isComplete || typeof r.terminalPercentage !== 'number') return null;
            sum += r.terminalPercentage;
          }
          return sum;
        })()
      : null
  );
  const terminalTotalMaximum = ranking?.terminalTotalMaximum || effectiveSubjects.length * 100;
  const isRankable = Boolean(
    (ranking?.isRankable || isUpperPrimary) &&
    terminalTotalMarks !== null &&
    terminalTotalMarks !== undefined
  );

  const terminalTotalStr = isRankable
    ? `${terminalTotalMarks} / ${terminalTotalMaximum}`
    : '__________ / __________';

  let meanScoreStr = '__________';
  if (isRankable && typeof terminalTotalMarks === 'number' && effectiveSubjects.length > 0) {
    const meanVal = Math.round((terminalTotalMarks / effectiveSubjects.length) * 10) / 10;
    meanScoreStr = `${meanVal}%`;
  }

  // Single horizontal summary box with 2 columns (Strictly pure white fill & thin black border)
  const summaryBoxHeight = 7.5;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.rect(marginX, currentY, contentWidth, summaryBoxHeight, 'FD');
  doc.line(marginX + contentWidth / 2, currentY, marginX + contentWidth / 2, currentY + summaryBoxHeight);

  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('TERMINAL TOTAL:', marginX + 3, currentY + 4.9);
  doc.setFont('helvetica', 'normal');
  doc.text(terminalTotalStr, marginX + 34, currentY + 4.9);

  doc.setFont('helvetica', 'bold');
  doc.text('MEAN SCORE:', marginX + contentWidth / 2 + 3, currentY + 4.9);
  doc.setFont('helvetica', 'normal');
  doc.text(meanScoreStr, marginX + contentWidth / 2 + 28, currentY + 4.9);

  currentY += summaryBoxHeight + 5.0;

  // Authoritative Remarks & Names Resolution
  const resolvedRemarks = resolveTerminalReportRemarks(data);

  // -------------------------------------------------------------
  // 5. CLASS TEACHER'S REMARKS
  // -------------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.text("CLASS TEACHER'S REMARKS", marginX, currentY);
  currentY += 2.5;

  const ctBoxHeight = 16.0;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.rect(marginX, currentY, contentWidth, ctBoxHeight, 'FD');

  const ctComment = resolvedRemarks.class_teacher_comment;

  if (ctComment) {
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.0);
    doc.text(ctComment, marginX + 3, currentY + 4.8, { maxWidth: contentWidth - 6 });
  } else {
    // Two empty writing lines
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.15);
    doc.line(marginX + 3, currentY + 5.0, marginX + contentWidth - 3, currentY + 5.0);
    doc.line(marginX + 3, currentY + 9.5, marginX + contentWidth - 3, currentY + 9.5);
  }

  let resolvedClassTeacher = data.teachers && data.classStream ? resolveClassTeacher(data.teachers, data.classStream) : null;
  if (!resolvedClassTeacher && data.teachers && data.teachers.length > 0) {
    if (resolvedRemarks.class_teacher_name) {
      const targetName = resolvedRemarks.class_teacher_name.toLowerCase().replace(/^(mr|mrs|ms|madam|dr|prof)\.?\s+/i, '').trim();
      resolvedClassTeacher = data.teachers.find(t => {
        const name = t.teacher_name.toLowerCase().replace(/^(mr|mrs|ms|madam|dr|prof)\.?\s+/i, '').trim();
        return (targetName.length > 1 && name.includes(targetName)) || (name.length > 1 && targetName.includes(name));
      }) || null;
    }
    if (!resolvedClassTeacher) {
      resolvedClassTeacher = data.teachers.find(t => t.is_class_teacher && t.signature_url) || data.teachers.find(t => !!t.signature_url) || null;
    }
  }

  const ctNameStr = resolvedRemarks.class_teacher_name
    ? `Class Teacher: ${resolvedRemarks.class_teacher_name}`
    : 'Class Teacher: ____________________________________________________________________________';
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.0);
  doc.text(ctNameStr, marginX + 3, currentY + ctBoxHeight - 2.5);

  currentY += ctBoxHeight + 4.0;

  // -------------------------------------------------------------
  // 6. HEAD TEACHER'S REMARKS
  // -------------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.text("HEAD TEACHER'S REMARKS", marginX, currentY);
  currentY += 2.5;

  const htBoxHeight = 16.0;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.rect(marginX, currentY, contentWidth, htBoxHeight, 'FD');

  const htComment = resolvedRemarks.headteacher_comment;

  if (htComment) {
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.0);
    doc.text(htComment, marginX + 3, currentY + 4.8, { maxWidth: contentWidth - 6 });
  } else {
    // Two empty writing lines
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.15);
    doc.line(marginX + 3, currentY + 5.0, marginX + contentWidth - 3, currentY + 5.0);
    doc.line(marginX + 3, currentY + 9.5, marginX + contentWidth - 3, currentY + 9.5);
  }

  const htNameStr = resolvedRemarks.headteacher_name
    ? `Head Teacher: ${resolvedRemarks.headteacher_name}`
    : 'Head Teacher: ____________________________________________________________________________';
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.0);
  doc.text(htNameStr, marginX + 3, currentY + htBoxHeight - 2.5);

  currentY += htBoxHeight + 4.0;

  // -------------------------------------------------------------
  // 7. LEGEND (COMPACT POINTS MAPPING)
  // -------------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.text('LEGEND', marginX, currentY);
  currentY += 3.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.0);
  doc.setTextColor(0, 0, 0);
  if (isUpperPrimary) {
    doc.text('76–100%: EE (Exceeding Expectations) = 4 pts | 51–75%: ME (Meeting Expectations) = 3 pts', marginX, currentY);
    currentY += 3.2;
    doc.text('26–50%: AE (Approaching Expectations) = 2 pts | 0–25%: BE (Below Expectations) = 1 pt', marginX, currentY);
    currentY += 5.0;
  } else {
    doc.text('EE1 – Exceeding Expectation 1 (8 pts) | EE2 – Exceeding Expectation 2 (7 pts) | ME1 – Meeting Expectation 1 (6 pts) | ME2 – Meeting Expectation 2 (5 pts)', marginX, currentY);
    currentY += 3.2;
    doc.text('AE1 – Approaching Expectation 1 (4 pts) | AE2 – Approaching Expectation 2 (3 pts) | BE1 – Below Expectation 1 (2 pts) | BE2 – Below Expectation 2 (1 pt)', marginX, currentY);
    currentY += 5.0;
  }

  // -------------------------------------------------------------
  // 8. SIGNATURES & OFFICIAL SEAL SECTION (3 COLUMNS)
  // -------------------------------------------------------------
  const sigColW = contentWidth / 3;
  const sigBoxHeight = 15.0;
  const sigBoxes = [
    { title: 'CLASS TEACHER SIGNATURE', defaultLabel: 'Sign: _____________' },
    { title: 'HEAD OF INSTITUTION & STAMP', defaultLabel: 'Sign & Seal: __________' },
    { title: 'PARENT / GUARDIAN SIGNATURE', defaultLabel: 'Sign: _____________' },
  ];

  sigBoxes.forEach((sig, idx) => {
    const x = marginX + idx * sigColW;
    const boxW = sigColW - (idx < 2 ? 1.5 : 0);

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.rect(x, currentY, boxW, sigBoxHeight, 'FD');

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(sig.title, x + boxW / 2, currentY + 3.8, { align: 'center' });

    if (idx === 0) {
      // Connect Class Teacher digital signature from teacher portal
      let drawn = false;
      if (resolvedClassTeacher?.signature_url) {
        drawn = drawPdfImage(
          doc,
          resolvedClassTeacher.signature_url,
          x + boxW / 2 - 14,
          currentY + 4.2,
          28,
          7.0
        );
      }
      if (!drawn) {
        doc.setFontSize(7.0);
        doc.setFont('helvetica', 'normal');
        doc.text(sig.defaultLabel, x + boxW / 2, currentY + 11.5, { align: 'center' });
      }

      if (resolvedRemarks.class_teacher_name) {
        doc.setFontSize(5.5);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(80, 80, 80);
        doc.text(
          resolvedRemarks.class_teacher_name,
          x + boxW / 2,
          currentY + sigBoxHeight - 1.2,
          { align: 'center' }
        );
        doc.setTextColor(0, 0, 0);
      }
    } else if (idx === 1) {
      let drawn = false;
      if (data.school?.stamp_url) {
        drawn = drawPdfImage(
          doc,
          data.school.stamp_url,
          x + boxW / 2 - 14,
          currentY + 4.2,
          28,
          7.0
        );
      }
      if (!drawn) {
        doc.setFontSize(7.0);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        doc.text(sig.defaultLabel, x + boxW / 2, currentY + 11.5, { align: 'center' });
      }

      if (resolvedRemarks.headteacher_name || data.school?.principal_name) {
        doc.setFontSize(5.5);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(80, 80, 80);
        doc.text(
          resolvedRemarks.headteacher_name || data.school?.principal_name || 'Head Teacher',
          x + boxW / 2,
          currentY + sigBoxHeight - 1.2,
          { align: 'center' }
        );
        doc.setTextColor(0, 0, 0);
      }
    } else {
      doc.setFontSize(7.0);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      doc.text(sig.defaultLabel, x + boxW / 2, currentY + 11.5, { align: 'center' });
    }
  });

  currentY += sigBoxHeight + 12.0;

  // -------------------------------------------------------------
  // 9. FOOTER: NEXT TERM OPENS ONLY (Except Grade 9 Term 3 completion)
  // -------------------------------------------------------------
  const isG9T3 = isGrade9Term3Report({
    student,
    classStream,
    grade: classStream?.class_name || student.grade,
    term,
  });

  if (!isG9T3) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(0, 0, 0);
    const openDateStr = nextTermOpeningDate
      ? formatKenyaDate(nextTermOpeningDate)
      : '________________________________________________';
    doc.text(`Next Term Opens: ${openDateStr}`, marginX, currentY);
  }

  return doc;
}

/**
 * Download a single learner's Terminal Report PDF.
 */
export async function downloadSingleTerminalReportPDF(data: TerminalReportPDFData): Promise<void> {
  const doc = await buildTerminalReportDoc(data);
  const cleanAdm = (data.student.admission_number || 'Learner').replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanName = (data.student.full_name || `${data.student.first_name || ''}_${data.student.last_name || ''}`)
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanTerm = String(data.term).replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanYear = String(data.academicYear).replace(/[^a-zA-Z0-9_-]/g, '_');
  const modeTag = data.isProvisionalMode ? 'Provisional' : 'Official';

  const fileName = `Terminal_Report_${cleanAdm}_${cleanName}_${cleanYear}_${cleanTerm}_${modeTag}.pdf`;
  await savePdf(doc, fileName);
}

/**
 * Batch download Terminal Reports PDF for an entire cohort/class stream.
 * Creates a single combined master document where each learner's report starts cleanly.
 */
export async function downloadBatchTerminalReportsPDF(
  reportsData: TerminalReportPDFData[],
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  if (!reportsData || reportsData.length === 0) return;

  const total = reportsData.length;
  const masterDoc = ensureSafeJsPdf(new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }));

  for (let i = 0; i < total; i++) {
    const reportItem = reportsData[i];
    if (onProgress) {
      onProgress(i + 1, total);
    }
    if (i > 0) {
      masterDoc.addPage('a4', 'portrait');
    }
    await buildTerminalReportDoc(reportItem, masterDoc);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  const firstItem = reportsData[0];
  const classNameStr = firstItem.classStream
    ? `${firstItem.classStream.class_name || ''}_${firstItem.classStream.stream || ''}`
    : 'Class';
  const cleanClass = classNameStr.replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanYear = String(firstItem.academicYear).replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanTerm = String(firstItem.term).replace(/[^a-zA-Z0-9_-]/g, '_');
  const modeTag = firstItem.isProvisionalMode ? 'Provisional' : 'Official';

  const fileName = `Terminal_Reports_${cleanClass}_${cleanYear}_${cleanTerm}_${modeTag}.pdf`;
  await savePdf(masterDoc, fileName);
}
