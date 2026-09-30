import rawJsPDF from 'jspdf';
const jsPDF = (rawJsPDF as any).jsPDF || rawJsPDF;
import autoTable from 'jspdf-autotable';
import {
  Student,
  School,
  Examination,
  ClassStream,
  Subject,
  Mark,
  Grade,
  Teacher,
  getEducationLevelForGrade,
} from '../types';
import {
  getGradeForMark,
  applyCompetitionRanking,
  getLearnerReportSubjects,
} from './analysisEngine';
import { getFilteredStudents } from '../utils/filterUtils';
import { getLearnerClassAtExamTime } from './historicalContextResolver';
import { evaluateMark } from '../utils/markUtils';
import { sortSubjectsByStandardOrder } from './meritListExporter';
import { savePdf } from '../utils/fileDownloader';

export interface TopPerformerLearnerRow {
  rank: number;
  admission_number: string;
  name: string;
  stream: string;
  score: number;
  displayScore: string;
  cbe_level: string;
  student_id: string;
}

export interface LearningAreaTopPerformers {
  subject_id: string;
  subject_name: string;
  subject_code: string;
  education_level?: string;
  learners: TopPerformerLearnerRow[];
}

export interface TopPerformersReportData {
  school: School;
  exam: Examination;
  education_level: string;
  class_name: string;
  stream_name: string;
  top_n: number;
  learning_areas: LearningAreaTopPerformers[];
}

export interface TopPerformersPDFOptions {
  school: School;
  exam: Examination;
  exams?: Examination[];
  classes: ClassStream[];
  subjects: Subject[];
  marks: Mark[];
  grades: Grade[];
  students: Student[];
  teachers?: Teacher[];
  selectedClassId?: string;
  selectedStreamId?: string;
  topN?: number; // 5, 6, 7, 8, 9, 10 (default: 5)
  educationLevel?: string;
}

interface ProcessedSchoolLogo {
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * Helper to safely load, resize, and compress a school logo image.
 * Prevents oversized multi-megabyte PDFs by downscaling large originals to a maximum
 * dimension of 120px while strictly preserving the aspect ratio and PNG transparency.
 * Handles Data URLs, remote URLs, and gracefully returns null on failures or absence.
 */
async function getOptimizedSchoolLogo(
  imageUrl?: string | null
): Promise<ProcessedSchoolLogo | null> {
  if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.trim()) return null;

  // In non-browser (Node/SSR) environments where Image/canvas is unavailable:
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof Image === 'undefined') {
    if (imageUrl.startsWith('data:image/')) {
      return { dataUrl: imageUrl, width: 120, height: 120 };
    }
    return null;
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 2500);
    try {
      const img = new Image();
      if (!imageUrl.startsWith('data:')) {
        img.crossOrigin = 'Anonymous';
      }
      img.onload = () => {
        clearTimeout(timer);
        try {
          const MAX_DIM = 120; // 120px optimal for ~16mm display size at high DPI
          const naturalW = img.naturalWidth || img.width || 120;
          const naturalH = img.naturalHeight || img.height || 120;

          let targetW = naturalW;
          let targetH = naturalH;

          // Preserve exact aspect ratio; do not stretch
          if (targetW > MAX_DIM || targetH > MAX_DIM) {
            if (targetW >= targetH) {
              targetH = Math.max(1, Math.round((naturalH * MAX_DIM) / naturalW));
              targetW = MAX_DIM;
            } else {
              targetW = Math.max(1, Math.round((naturalW * MAX_DIM) / naturalH));
              targetH = MAX_DIM;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, targetW, targetH);
            const dataUrl = canvas.toDataURL('image/png');
            resolve({ dataUrl, width: targetW, height: targetH });
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

/**
 * Resolves authoritative top performers data for all applicable learning areas.
 * Excludes X, Y, Blank, and ineligible learners.
 * Reuses applyCompetitionRanking and getGradeForMark.
 */
export function resolveTopPerformersReportData(
  options: TopPerformersPDFOptions
): TopPerformersReportData {
  const {
    school,
    exam,
    classes = [],
    subjects = [],
    marks = [],
    grades = [],
    students = [],
    teachers = [],
    selectedClassId = 'all',
    selectedStreamId = 'all',
    topN = 5,
    educationLevel: overrideEduLevel,
  } = options;

  const validTopN = Math.max(5, Math.min(10, Number(topN) || 5));

  // 1. Resolve Target Students within authorized scope
  const targetStudents = getFilteredStudents(
    students,
    classes,
    selectedClassId,
    selectedStreamId,
    exam
  );

  // 2. Resolve Class and Stream Display Labels
  let targetClass: ClassStream | undefined = undefined;
  if (selectedStreamId && selectedStreamId !== 'all') {
    targetClass = classes.find(
      (c) => (c.stream_id && c.stream_id === selectedStreamId) || c.id === selectedStreamId
    );
  }
  if (!targetClass && selectedClassId && selectedClassId !== 'all') {
    targetClass = classes.find(
      (c) =>
        c.id === selectedClassId ||
        (c.stream_id && c.stream_id === selectedClassId) ||
        (c.class_name && c.class_name.toLowerCase() === selectedClassId.toLowerCase())
    );
  }

  const firstTargetStudent = targetStudents[0];
  const firstHistCtx =
    firstTargetStudent && exam
      ? getLearnerClassAtExamTime(firstTargetStudent, exam, classes)
      : null;

  if (!targetClass) {
    const fallbackClassId = firstHistCtx?.class_id || firstTargetStudent?.class_id;
    if (fallbackClassId) {
      targetClass = classes.find((c) => c.id === fallbackClassId);
    }
  }

  const targetGrade =
    targetClass?.class_name ||
    (selectedClassId && selectedClassId !== 'all' && selectedClassId.startsWith('Grade')
      ? selectedClassId
      : '') ||
    firstHistCtx?.class_name ||
    firstHistCtx?.grade ||
    firstTargetStudent?.grade ||
    '';

  const classDisplayStr = targetGrade || (selectedClassId !== 'all' ? selectedClassId : 'All Classes');

  let streamDisplayStr = 'All Streams';
  if (selectedStreamId && selectedStreamId !== 'all') {
    const streamObj = classes.find(
      (c) =>
        c.id === selectedStreamId ||
        c.stream_id === selectedStreamId ||
        (c.stream && c.stream.toLowerCase() === selectedStreamId.toLowerCase())
    );
    if (streamObj && streamObj.stream) {
      streamDisplayStr = streamObj.stream;
    } else {
      streamDisplayStr = selectedStreamId;
    }
  } else {
    streamDisplayStr = 'All Streams';
  }

  // 3. Resolve Education Level
  const resolvedEduLevel =
    overrideEduLevel ||
    targetClass?.education_level ||
    (targetGrade ? getEducationLevelForGrade(targetGrade) : null) ||
    exam.education_level ||
    'Junior School';

  // 4. Resolve Applicable Learning Areas (Subjects)
  let rawSubjects: Subject[] = targetClass
    ? getLearnerReportSubjects(firstTargetStudent || ({} as any), targetClass, subjects, teachers)
    : [];

  if (rawSubjects.length === 0 && targetGrade) {
    const applicable = subjects.filter((s) => {
      if (s.status === 'Archived') return false;
      if (s.applicable_grades && s.applicable_grades.length > 0) {
        return s.applicable_grades.includes(targetGrade as any);
      }
      if (s.education_level) {
        return s.education_level === resolvedEduLevel;
      }
      return true;
    });
    rawSubjects = applicable;
  }

  if (rawSubjects.length === 0) {
    rawSubjects = subjects.filter((s) => s.status !== 'Archived');
  }

  // Deduplicate and order according to standard CBE curriculum sequence
  const uniqueSubjectsMap = new Map<string, Subject>();
  rawSubjects.forEach((s) => {
    if (s && s.id && !uniqueSubjectsMap.has(s.id)) {
      uniqueSubjectsMap.set(s.id, s);
    }
  });
  const orderedSubjects = sortSubjectsByStandardOrder(Array.from(uniqueSubjectsMap.values()));

  // 5. Evaluate and Rank Learners per Learning Area
  const learningAreas: LearningAreaTopPerformers[] = [];

  orderedSubjects.forEach((subject) => {
    const eligibleCandidates: Array<{
      student: Student;
      score: number;
      displayScore: string;
      cbe_level: string;
    }> = [];

    targetStudents.forEach((student) => {
      // Find mark for this student, exam, and subject
      const mark = marks.find(
        (m) =>
          String(m.exam_id) === String(exam.id) &&
          (String(m.student_id) === String(student.id) ||
            (student.admission_number && String(m.student_id) === String(student.admission_number))) &&
          (
            String(m.subject_id) === String(subject.id) ||
            (subject.subject_code && String(m.subject_id) === String(subject.subject_code)) ||
            (subject.subject_name && String(m.subject_id).toLowerCase() === subject.subject_name.toLowerCase())
          )
      );

      // If missing mark -> unassessed / blank -> strictly excluded
      if (!mark) return;

      const evalMark = evaluateMark(mark, {
        subject,
        classObj: targetClass,
        educationLevel: resolvedEduLevel,
      });

      // Exclude X, Y, Blank, null, or invalid scores
      if (
        evalMark.status !== 'Normal' ||
        evalMark.percentage === null ||
        isNaN(evalMark.percentage)
      ) {
        return;
      }

      const scorePct = Math.round(evalMark.percentage);
      const gradeObj = getGradeForMark(scorePct, grades, resolvedEduLevel, classDisplayStr);
      const cbeLevel =
        gradeObj.grade_code || gradeObj.grade || gradeObj.performance_level || '-';

      eligibleCandidates.push({
        student,
        score: scorePct,
        displayScore: `${scorePct}%`,
        cbe_level: cbeLevel,
      });
    });

    // If no eligible/assessed learners exist for this learning area, skip it!
    if (eligibleCandidates.length === 0) {
      return;
    }

    // Sort descending by score percentage
    eligibleCandidates.sort((a, b) => b.score - a.score);

    // Apply authoritative KNEC CBE Competition Ranking (1, 1, 3 method)
    interface RankingItem {
      rank: number;
      student: Student;
      score: number;
      displayScore: string;
      cbe_level: string;
    }

    const rankingItems: RankingItem[] = eligibleCandidates.map((c) => ({
      rank: 1,
      student: c.student,
      score: c.score,
      displayScore: c.displayScore,
      cbe_level: c.cbe_level,
    }));

    applyCompetitionRanking(
      rankingItems,
      (a, b) => a.score === b.score,
      (item, rank) => {
        item.rank = rank;
      }
    );

    // Slice to exactly Top-N learners (e.g. Top 5 = max 5 rows)
    const sliced = rankingItems.slice(0, validTopN);

    const rows: TopPerformerLearnerRow[] = sliced.map((item) => {
      const histCtx = exam ? getLearnerClassAtExamTime(item.student, exam, classes) : null;
      const foundCls =
        (item.student.stream_id
          ? classes.find((c) => c.stream_id === item.student.stream_id || c.id === item.student.stream_id)
          : undefined) ||
        classes.find((c) => c.id === (histCtx?.class_id || item.student.class_id));

      const streamName =
        (histCtx?.stream_name && histCtx.stream_name.trim()) ||
        foundCls?.stream ||
        (item.student as any).stream ||
        '-';

      return {
        rank: item.rank,
        admission_number: item.student.admission_number || '-',
        name: item.student.full_name || 'Learner',
        stream: streamName,
        score: item.score,
        displayScore: item.displayScore,
        cbe_level: item.cbe_level,
        student_id: item.student.id,
      };
    });

    learningAreas.push({
      subject_id: subject.id,
      subject_name: subject.subject_name || subject.subject_code || 'Learning Area',
      subject_code: subject.subject_code || '',
      education_level: resolvedEduLevel,
      learners: rows,
    });
  });

  return {
    school,
    exam,
    education_level: resolvedEduLevel,
    class_name: classDisplayStr,
    stream_name: streamDisplayStr,
    top_n: validTopN,
    learning_areas: learningAreas,
  };
}

/**
 * Builds the complete jsPDF document matching the exact ASCII specification.
 * - School Header: Page 1 ONLY.
 * - Colours: STRICT BLACK AND WHITE ONLY (no blue, green, red, yellow, slate, grey, or tinted elements).
 * - Typography: Helvetica bold headings and normal data rows.
 * - Table headers: Rank | Admission No | Learner Name | Score | CBE Level.
 * - Page Break Guard: Learning area heading is never stranded at page bottom.
 * - Footer: "Page X of Y" subtle bottom-right.
 */
export async function generateTopPerformersPDFDoc(
  options: TopPerformersPDFOptions
): Promise<any> {
  const data = resolveTopPerformersReportData(options);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 15;
  const marginTop = 12;
  const marginBottom = 14;
  const centerX = pageWidth / 2; // 105mm

  const logoObj = data.school.logo_url
    ? await getOptimizedSchoolLogo(data.school.logo_url)
    : null;

  let curY = marginTop;

  // ==========================================
  // PAGE 1: SCHOOL HEADER (PAGE 1 ONLY!)
  // ==========================================
  if (logoObj && logoObj.dataUrl) {
    try {
      const maxBox = 16; // 16mm maximum visual bounding box
      let logoW = maxBox;
      let logoH = maxBox;

      if (logoObj.width && logoObj.height) {
        const aspect = logoObj.width / logoObj.height;
        if (aspect >= 1) {
          logoW = maxBox;
          logoH = Math.max(4, maxBox / aspect);
        } else {
          logoH = maxBox;
          logoW = Math.max(4, maxBox * aspect);
        }
      }

      doc.addImage(
        logoObj.dataUrl,
        'PNG',
        centerX - logoW / 2,
        curY,
        logoW,
        logoH
      );
      curY += logoH + 3.5;
    } catch {
      curY += 2;
    }
  } else {
    curY += 2;
  }

  // School Name (Centered, Bold, Black)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(0, 0, 0);
  const schoolNameStr = (data.school.school_name || 'CBE MANAGEMENT SYSTEM').toUpperCase();
  doc.text(schoolNameStr, centerX, curY, { align: 'center' });
  curY += 4.5;

  // School Motto (Centered, Normal, Black - no quotation marks)
  if (data.school.motto) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    doc.text(data.school.motto, centerX, curY, { align: 'center' });
    curY += 4.5;
  }

  // Report Title (Centered, Bold, Black)
  curY += 1.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text('TOP PERFORMERS REPORT', centerX, curY, { align: 'center' });
  curY += 4.5;

  // Term • Year (Centered, Bold, Black)
  const termStr = String(data.exam.term || 'Term 3').toUpperCase();
  const yearStr = String(data.exam.year || '2026');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  doc.text(`${termStr} • ${yearStr}`, centerX, curY, { align: 'center' });
  curY += 4.5;

  // CLASS: <CLASS_NAME> (<STREAM>) (Centered, Bold, Black)
  // e.g. CLASS: GRADE 9 (ALL STREAMS) or CLASS: GRADE 9 (STREAM: BLUE)
  const isAllStreams =
    !data.stream_name ||
    data.stream_name.toLowerCase() === 'all streams' ||
    data.stream_name.toLowerCase() === 'all';
  const streamFormatted = isAllStreams
    ? '(ALL STREAMS)'
    : `(STREAM: ${data.stream_name.toUpperCase()})`;
  const classText = `CLASS: ${data.class_name.toUpperCase()} ${streamFormatted}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  doc.text(classText, centerX, curY, { align: 'center' });
  curY += 4.5;

  // ASSESSMENT: <EXAM_NAME> (Centered, Bold, Black)
  // e.g. ASSESSMENT: GRADE 9 OPENER ASSESSMENT TERM 3 2026
  const assessmentText = `ASSESSMENT: ${(data.exam.exam_name || 'ASSESSMENT').toUpperCase()}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  doc.text(assessmentText, centerX, curY, { align: 'center' });
  curY += 6;

  // Horizontal Divider Line (Black)
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.line(marginX, curY, pageWidth - marginX, curY);
  curY += 7;

  // ==========================================
  // LEARNING-AREA SECTIONS
  // ==========================================
  if (data.learning_areas.length === 0) {
    // If no learning areas had eligible performers
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    doc.text('No eligible learner performance records found for the selected scope.', centerX, curY + 10, { align: 'center' });
  } else {
    for (let i = 0; i < data.learning_areas.length; i++) {
      const la = data.learning_areas[i];
      if (!la.learners || la.learners.length === 0) continue;

      // PAGE BREAK RULE: Check if sufficient vertical space exists for:
      // - Heading (~7mm)
      // - Table header (~6mm)
      // - At least first row of table (~6mm)
      // - Spacing buffer (~8mm)
      // Minimum space required before starting a new section = ~27mm.
      const minRequiredSpace = 27;
      if (curY + minRequiredSpace > pageHeight - marginBottom) {
        doc.addPage();
        // Start directly at top margin on subsequent pages — DO NOT repeat the school header!
        curY = marginTop + 4;
      }

      // Learning Area Heading (Centered, Bold, Black)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(0, 0, 0);
      const headingText = `${la.subject_name.toUpperCase()} TOP PERFORMERS`;
      doc.text(headingText, centerX, curY, { align: 'center' });
      curY += 3.5;

      // Table (Black and white only)
      autoTable(doc, {
        startY: curY,
        margin: { left: marginX, right: marginX },
        tableWidth: 180,
        head: [['Rank', 'Admission No', 'Learner Name', 'Stream', 'Score', 'CBE Level']],
        body: la.learners.map((l) => [
          String(l.rank),
          l.admission_number,
          l.name,
          l.stream || '-',
          l.displayScore,
          l.cbe_level,
        ]),
        theme: 'plain',
        styles: {
          font: 'helvetica',
          fontSize: 8.5,
          textColor: [0, 0, 0],
          fillColor: [255, 255, 255],
          lineColor: [0, 0, 0],
          lineWidth: 0.2,
          cellPadding: 1.8,
          overflow: 'ellipsize',
        },
        headStyles: {
          font: 'helvetica',
          fontStyle: 'bold',
          fontSize: 8.5,
          textColor: [0, 0, 0],
          fillColor: [255, 255, 255],
          lineColor: [0, 0, 0],
          lineWidth: 0.3,
          halign: 'center',
        },
        columnStyles: {
          0: { cellWidth: 16, halign: 'center' }, // Rank
          1: { cellWidth: 28, halign: 'center' }, // Admission No
          2: { cellWidth: 62, halign: 'left' },   // Learner Name
          3: { cellWidth: 24, halign: 'center' }, // Stream
          4: { cellWidth: 24, halign: 'center' }, // Score
          5: { cellWidth: 26, halign: 'center' }, // CBE Level
        },
        pageBreak: 'auto',
        showHead: 'everyPage',
      });

      curY = (doc as any).lastAutoTable.finalY + 7;
    }
  }

  // ==========================================
  // FOOTER: PAGE NUMBERING (PAGE X OF Y)
  // ==========================================
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - marginX, pageHeight - 6, {
      align: 'right',
    });
  }

  return doc;
}

/**
 * Generates and triggers download of the Top Performers PDF using existing savePdf utility.
 */
export async function exportTopPerformersPDF(
  options: TopPerformersPDFOptions
): Promise<void> {
  const doc = await generateTopPerformersPDFDoc(options);
  const data = resolveTopPerformersReportData(options);

  const safeClass = String(data.class_name || 'Class').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeStream = String(data.stream_name || 'Stream').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeExam = String(data.exam?.exam_name || 'Assessment').replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `Top_Performers_${safeClass}_${safeStream}_${safeExam}.pdf`;

  await savePdf(doc, fileName);
}
