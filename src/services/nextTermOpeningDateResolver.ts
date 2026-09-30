/**
 * Next Term Opening Date Resolver & Utilities
 * 
 * Handles resolution of suggested next term opening dates from configured
 * SchoolTerm records in the CBE Management System.
 * 
 * Educational Domain Logic:
 * - Term 1 Assessment -> Term 2 Opening Date (same academic year)
 * - Term 2 Assessment -> Term 3 Opening Date (same academic year)
 * - Term 3 Assessment -> Term 1 Opening Date (next academic year)
 */

import { Examination, SchoolTerm, TermName, Student, ClassStream, normalizeGradeName } from '../types';
import { formatKenyaDate } from '../utils/kenyaDateUtils';
import { api } from '../lib/storage';

export interface AcademicReportContext {
  grade?: string | null;
  term?: string | null;
  exam?: Examination | null;
  student?: Student | null;
  classStream?: ClassStream | null;
  classes?: ClassStream[] | null;
}

/**
 * Authoritatively determines if the report context represents Grade 9 Term 3.
 * Grade 9 Term 3 marks the completion of the Junior Secondary School cycle,
 * where learners transition out and no subsequent school term opening date applies.
 */
export function isGrade9Term3Report(context?: AcademicReportContext | null): boolean {
  if (!context) return false;

  // 1. Determine term
  let termStr = context.term || context.exam?.term || '';
  if (!termStr && context.exam?.exam_name) {
    if (/term\s*3/i.test(context.exam.exam_name)) {
      termStr = 'Term 3';
    }
  }

  const isTerm3 = /^term\s*3$/i.test(termStr.trim()) || termStr.trim() === '3';
  if (!isTerm3) {
    return false;
  }

  // 2. Determine grade
  let rawGrade = context.grade || '';

  if (!rawGrade && context.student?.grade) {
    rawGrade = context.student.grade;
  }

  if (!rawGrade && context.classStream?.class_name) {
    rawGrade = context.classStream.class_name;
  }

  if (!rawGrade && context.exam?.exam_name) {
    const match = context.exam.exam_name.match(/grade\s*([1-9]|pp[12])/i);
    if (match) {
      rawGrade = `Grade ${match[1]}`;
    }
  }

  if (!rawGrade && context.student && context.classes) {
    const cls = context.classes.find(
      (c) =>
        c.id === context.student?.class_id ||
        (context.student?.stream_id && (c.stream_id === context.student.stream_id || c.id === context.student.stream_id))
    );
    if (cls?.class_name) {
      rawGrade = cls.class_name;
    }
  }

  if (!rawGrade) {
    return false;
  }

  const normalizedGrade = normalizeGradeName(rawGrade);
  return normalizedGrade === 'Grade 9';
}

/**
 * Returns whether a Next Term Opening Date is required for the given report context.
 * Returns false exclusively for Grade 9 Term 3 (Junior School completion).
 */
export function isNextTermOpeningDateRequired(context?: AcademicReportContext | null): boolean {
  return !isGrade9Term3Report(context);
}

export interface SuggestedNextTermResult {
  rawDate: string; // ISO date format 'YYYY-MM-DD' or configured string
  rawStartDate?: string;
  formattedDate: string; // Kenyan display format e.g. '12 September 2026'
  subsequentTermName: string; // e.g. 'Term 3 2026' or 'Term 1 2027'
  nextTermName?: string;
  targetYear: number;
  targetTerm: TermName;
}

export function validateNextTermOpeningDate(dateStr?: string | null): boolean {
  if (!dateStr || !dateStr.trim()) return false;
  const trimmed = dateStr.trim();
  if (trimmed === 'N/A' || trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'undefined') return false;
  return trimmed.length >= 4;
}

export function formatDateToKenyaHumanReadable(dateStr?: string | null): string {
  if (!dateStr || !dateStr.trim()) return '';
  let trimmed = dateStr.trim();
  // Strip ordinal suffixes (e.g. 1st, 2nd, 3rd, 4th -> 1, 2, 3, 4)
  trimmed = trimmed.replace(/(\b\d+)(?:st|nd|rd|th)\b/gi, '$1');
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthName = months[m - 1] || '';
    return `${d} ${monthName} ${y}`;
  }
  const formatted = formatKenyaDate(trimmed);
  if (formatted) {
    return formatted.replace(/(\b\d+)(?:st|nd|rd|th)\b/gi, '$1');
  }
  return trimmed;
}

/**
 * Resolves the suggested next term opening date based on the examination's
 * academic year and term, referencing authoritative SchoolTerm records.
 * 
 * Returns null if no matching configured subsequent term or opening date exists.
 * Does NOT invent or hardcode fallback dates.
 */
export function resolveSuggestedNextTermOpeningDate(
  exam?: Examination,
  schoolTerms?: SchoolTerm[]
): SuggestedNextTermResult | null {
  if (!exam || !exam.term || !exam.year) {
    return null;
  }

  const terms = schoolTerms && schoolTerms.length > 0 ? schoolTerms : api.getSchoolTerms();
  if (!terms || terms.length === 0) {
    return null;
  }

  let targetTerm: TermName;
  let targetYear = exam.year;

  if (exam.term === 'Term 1') {
    targetTerm = 'Term 2';
    targetYear = exam.year;
  } else if (exam.term === 'Term 2') {
    targetTerm = 'Term 3';
    targetYear = exam.year;
  } else if (exam.term === 'Term 3') {
    targetTerm = 'Term 1';
    targetYear = exam.year + 1;
  } else {
    return null;
  }

  const matchingTerm = terms.find(
    (t) => t.year === targetYear && t.term_name === targetTerm
  );

  if (matchingTerm && matchingTerm.opening_date && matchingTerm.opening_date.trim()) {
    const rawDate = matchingTerm.opening_date.trim();
    const formattedDate = formatKenyaDate(rawDate) || rawDate;

    return {
      rawDate,
      rawStartDate: rawDate,
      formattedDate,
      subsequentTermName: `${targetTerm} ${targetYear}`,
      nextTermName: targetTerm,
      targetYear,
      targetTerm,
    };
  }

  return null;
}
