import React, { useState } from 'react';
import {
  X,
  Printer,
  Download,
  Loader2,
} from 'lucide-react';
import { Student, School, ClassStream, Subject, Grade, Teacher } from '../../types';
import {
  ContributingAssessmentRef,
  LearningAreaTerminalResult,
  getUpperPrimaryCanonicalSubjects,
} from '../../services/terminalResultsEngine';
import {
  TerminalLearnerRanking,
  AssessmentRankingSummary,
  isJuniorSchoolEducationLevel,
  calculateSingleLearnerRanking,
  calculateSingleLearnerAssessmentRankings,
} from '../../services/terminalRankingEngine';
import { isUpperPrimaryContext } from '../../utils/upperPrimaryReportUtils';
import { getGradeForMark } from '../../services/analysisEngine';
import {
  downloadSingleTerminalReportPDF,
  getDefaultSubjectComment,
  formatAssessmentColumnHeader,
  resolveTerminalReportRemarks,
} from '../../services/terminalReportPdfGenerator';
import { getStreamNameForLearner } from '../../services/terminalMeritListExporter';
import { formatKenyaDate } from '../../utils/kenyaDateUtils';
import { stripSurroundingQuotes } from '../../utils/filterUtils';
import { resolveSubjectTeacher, resolveClassTeacher } from '../../utils/teacherResolutionUtils';
import { NextTermOpeningDateModal } from '../NextTermOpeningDateModal';
import { isGrade9Term3Report } from '../../services/nextTermOpeningDateResolver';
import { api } from '../../lib/storage';

export interface TerminalReportModalProps {
  isOpen: boolean;
  onClose: () => void;
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
    class_teacher_name?: string;
    class_teacher_comment?: string;
    headteacher_name?: string;
    headteacher_comment?: string;
    hoi_name?: string;
    subject_comments?: Record<string, string>;
  };
  ranking?: TerminalLearnerRanking;
  assessmentRankings?: Record<string, AssessmentRankingSummary>;
  subjectRanks?: Record<string, string>;
  hideSubComponents?: boolean;
  onToggleHideSubComponents?: (val: boolean) => void;
}

export const TerminalReportModal: React.FC<TerminalReportModalProps> = ({
  isOpen,
  onClose,
  student,
  school,
  classStream,
  academicYear,
  term,
  isProvisionalMode = false,
  contributingAssessments,
  subjects,
  resultsBySubject,
  grades,
  teachers,
  classes,
  nextTermOpeningDate,
  customSubjectComments,
  savedRemarks,
  ranking,
  assessmentRankings,
  subjectRanks,
  hideSubComponents = false,
  onToggleHideSubComponents,
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);
  const [confirmedDate, setConfirmedDate] = useState<string>(nextTermOpeningDate || '');

  if (!isOpen) return null;

  const targetClassId = classStream?.id || student.class_id;
  const targetStreamId = classStream?.stream_id || (student as any).stream_id;

  const isJuniorSchool = isJuniorSchoolEducationLevel(undefined, classStream, student);
  const isUpperPrimary = isUpperPrimaryContext(student, classStream);
  const effectiveSubjects = isUpperPrimary ? getUpperPrimaryCanonicalSubjects(subjects) : subjects;

  const effectiveRanking: TerminalLearnerRanking | undefined = (isJuniorSchool || isUpperPrimary)
    ? (ranking || calculateSingleLearnerRanking({
        student,
        classStream,
        resultsBySubject,
        applicableSubjects: effectiveSubjects,
        isProvisionalMode,
      }))
    : undefined;

  const effectiveAssessmentRankings: Record<string, AssessmentRankingSummary> | undefined =
    assessmentRankings ||
    calculateSingleLearnerAssessmentRankings({
      student,
      classStream,
      resultsBySubject,
      contributingAssessments,
      applicableSubjects: effectiveSubjects,
      isProvisionalMode,
    });

  const resolvedRemarks = resolveTerminalReportRemarks({
    student,
    school,
    classStream,
    academicYear,
    term,
    isProvisionalMode,
    contributingAssessments,
    subjects: effectiveSubjects,
    resultsBySubject,
    grades,
    teachers,
    classes,
    nextTermOpeningDate,
    customSubjectComments,
    savedRemarks,
    ranking: effectiveRanking,
    assessmentRankings: effectiveAssessmentRankings,
    subjectRanks,
  });

  const resolvedClassTeacher = teachers && classStream ? resolveClassTeacher(teachers, classStream) : null;

  const executeTerminalPdfDownload = async (dateStr?: string) => {
    try {
      setIsDownloading(true);
      await new Promise((resolve) => setTimeout(resolve, 50));
      await downloadSingleTerminalReportPDF({
        student,
        school,
        classStream,
        classes,
        academicYear,
        term,
        isProvisionalMode,
        contributingAssessments,
        subjects: effectiveSubjects,
        resultsBySubject,
        grades,
        teachers,
        nextTermOpeningDate: dateStr,
        customSubjectComments,
        savedRemarks,
        ranking: effectiveRanking,
        assessmentRankings: effectiveAssessmentRankings,
        subjectRanks,
        hideSubComponents,
      });
    } catch (err) {
      console.error('Failed to download terminal report PDF:', err);
    } finally {
      setIsDownloading(false);
      setIsDateModalOpen(false);
    }
  };

  const handleDownloadPDF = async () => {
    const isG9T3 = isGrade9Term3Report({
      student,
      classStream,
      classes,
      grade: classStream?.class_name || student.grade,
      term,
    });

    if (isG9T3) {
      await executeTerminalPdfDownload('');
      return;
    }

    if (confirmedDate && confirmedDate.trim()) {
      await executeTerminalPdfDownload(confirmedDate.trim());
      return;
    }

    setIsDateModalOpen(true);
  };

  const handlePrint = () => {
    window.print();
  };

  const learnerFullName = (
    student.full_name || `${student.first_name || ''} ${student.last_name || ''}`
  ).trim().toUpperCase() || 'LEARNER';

  const learnerStreamName = getStreamNameForLearner(student, classes || (classStream ? [classStream] : []));
  const baseClassName = classStream?.class_name || student.grade || (student as any).class_name || 'Class';
  const classNameStr = (classStream?.class_name || baseClassName).toUpperCase();
  const streamNameStr = (learnerStreamName && learnerStreamName !== '—'
    ? learnerStreamName
    : classStream?.stream || '—').toUpperCase();

  const streamRankStr = effectiveRanking && effectiveRanking.isRankable && effectiveRanking.streamPosition !== null
    ? `${effectiveRanking.streamPosition} / ${effectiveRanking.streamPositionDenominator}`
    : '____ / ____';

  const overallRankStr = effectiveRanking && effectiveRanking.isRankable && effectiveRanking.overallPosition !== null
    ? `${effectiveRanking.overallPosition} / ${effectiveRanking.overallPositionDenominator}`
    : '____ / ____';

  const terminalTotalMarks = effectiveRanking?.terminalTotalMarks ?? (
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
  const terminalTotalMaximum = effectiveRanking?.terminalTotalMaximum || effectiveSubjects.length * 100;
  const isRankable = Boolean(
    (effectiveRanking?.isRankable || isUpperPrimary) &&
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

  // School name sourced strictly from Settings (never hard-coded)
  const schoolName = (school?.school_name || '').trim().toUpperCase();

  return (
    <div
      id="terminal-report-modal"
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 print:p-0 print:bg-white"
    >
      <div className="relative w-full max-w-4xl bg-white text-black border border-black shadow-2xl overflow-hidden flex flex-col max-h-[94vh] print:max-h-none print:border-none print:shadow-none">
        {/* Modal Controls Bar (Hidden when printing) */}
        <div className="px-5 py-3 border-b border-black flex items-center justify-between bg-white print:hidden">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-bold tracking-tight text-black">
              Terminal Learner Report Preview
            </span>
          </div>

          <div className="flex items-center space-x-2">
            {isUpperPrimary && (
              <label className="inline-flex items-center space-x-1.5 text-xs font-bold mr-3 text-black select-none cursor-pointer border border-black px-2 py-1 bg-white hover:bg-neutral-100 transition">
                <input
                  type="checkbox"
                  id="modal-hide-subcomponents-checkbox"
                  checked={hideSubComponents}
                  onChange={(e) => onToggleHideSubComponents?.(e.target.checked)}
                  className="rounded border-black text-black focus:ring-black h-3.5 w-3.5 cursor-pointer"
                />
                <span>Hide Sub-components</span>
              </label>
            )}

            <button
              id="print-terminal-report-btn"
              onClick={handlePrint}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold text-black bg-white border border-black hover:bg-black hover:text-white transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>

            <button
              id="modal-download-terminal-pdf-btn"
              onClick={handleDownloadPDF}
              disabled={isDownloading}
              className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-black hover:bg-neutral-800 disabled:opacity-50 transition"
            >
              {isDownloading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>Download PDF</span>
            </button>

            <button
              id="close-terminal-report-modal-btn"
              onClick={onClose}
              className="p-1.5 text-black hover:bg-black hover:text-white border border-transparent hover:border-black transition"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Printable Document Container (Pure Black & White) */}
        <div className="overflow-y-auto p-6 sm:p-8 space-y-5 bg-white text-black print:p-4 print:overflow-visible">
          {/* 1. HEADER (School Logo, School Name, Motto, Title, Term • Year) */}
          <div className="text-center space-y-1.5 pb-1">
            {school?.logo_url && (
              <div className="flex justify-center mb-2">
                <img
                  src={school.logo_url}
                  alt="School Logo"
                  className="h-12 w-auto max-w-[80px] object-contain filter grayscale"
                />
              </div>
            )}
            {schoolName && (
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-black uppercase">
                {schoolName}
              </h1>
            )}
            {school?.motto && (
              <p className="text-xs italic text-black font-medium">
                &quot;{school.motto}&quot;
              </p>
            )}
            <h2 className="text-sm sm:text-base font-bold tracking-tight text-black uppercase">
              {isUpperPrimary ? 'UPPER PRIMARY TERMINAL REPORT' : 'TERMINAL LEARNER REPORT FORM'}
            </h2>
            <p className="text-xs font-bold text-black uppercase">
              {term.toUpperCase()} • {academicYear}
            </p>
          </div>

          {/* 2. LEARNER INFORMATION */}
          <div className="space-y-1.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-black">
              LEARNER INFORMATION
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-black border-collapse">
                <thead>
                  <tr className="border-b border-black">
                    <th className="p-2 font-bold text-black border-r border-black w-[30%]">LEARNER</th>
                    <th className="p-2 font-bold text-black border-r border-black w-[14%]">ADM NO</th>
                    <th className="p-2 font-bold text-black border-r border-black w-[14%]">CLASS</th>
                    <th className="p-2 font-bold text-black border-r border-black w-[14%]">STREAM</th>
                    <th className="p-2 font-bold text-black text-center border-r border-black w-[14%]">STREAM RANK</th>
                    <th className="p-2 font-bold text-black text-center w-[14%]">OVERALL RANK</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-2 font-normal text-black border-r border-black">{learnerFullName}</td>
                    <td className="p-2 font-normal text-black border-r border-black">{student.admission_number || 'N/A'}</td>
                    <td className="p-2 font-normal text-black border-r border-black">{classNameStr}</td>
                    <td className="p-2 font-normal text-black border-r border-black">{streamNameStr}</td>
                    <td className="p-2 font-normal text-black text-center border-r border-black">{streamRankStr}</td>
                    <td className="p-2 font-normal text-black text-center">{overallRankStr}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. LEARNING AREA PERFORMANCE */}
          <div className="space-y-1.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-black">
              LEARNING AREA PERFORMANCE
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-black border-collapse">
                <thead>
                  <tr className="border-b border-black">
                    <th className="p-2 font-bold text-black text-center border-r border-black w-7">#</th>
                    <th className="p-2 font-bold text-black border-r border-black">LEARNING AREA</th>
                    {contributingAssessments.map((a, idx) => {
                      const cleanName = formatAssessmentColumnHeader(a.exam_name, idx);
                      return (
                        <th key={a.id || idx} className="p-2 font-bold text-black text-center border-r border-black">
                          {cleanName}
                        </th>
                      );
                    })}
                    <th className="p-2 font-bold text-black text-center border-r border-black">
                      TERMINAL SCORE
                    </th>
                    <th className="p-2 font-bold text-black text-center border-r border-black">
                      LEVEL
                    </th>
                    <th className="p-2 font-bold text-black text-center border-r border-black">
                      POINTS
                    </th>
                    <th className="p-2 font-bold text-black text-center border-r border-black">
                      RANK
                    </th>
                    <th className="p-2 font-bold text-black border-r border-black w-[22%]">
                      COMMENT
                    </th>
                    <th className="p-2 font-bold text-black w-[13%]">
                      INSTRUCTOR
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black">
                  {effectiveSubjects.map((subject, idx) => {
                    const result = resultsBySubject.get(subject.id);
                    const isComplete = result?.isComplete ?? false;

                    const entryWithComponents = result?.assessmentTrail?.find(
                      (t) => t.components && t.components.length > 0
                    );
                    const hasComponents = Boolean(
                      isUpperPrimary &&
                      !hideSubComponents &&
                      entryWithComponents?.components &&
                      entryWithComponents.components.length > 0
                    );

                    const customComment = customSubjectComments?.[subject.id] || savedRemarks?.subject_comments?.[subject.id];
                    const commentStr = customComment
                      ? stripSurroundingQuotes(customComment)
                      : getDefaultSubjectComment(subject, result);

                    const subjTeacher = resolveSubjectTeacher(teachers, subject.id, targetClassId, targetStreamId);
                    const teacherNameStr = subjTeacher ? subjTeacher.teacher_name : '';

                    let terminalScoreDisplay = '—';
                    if (result) {
                      if (isComplete && typeof result.terminalPercentage === 'number') {
                        terminalScoreDisplay = String(result.terminalPercentage);
                      } else if (result.status === 'INCOMPLETE (X)') {
                        terminalScoreDisplay = 'X';
                      } else if (result.status === 'INCOMPLETE (Y)') {
                        terminalScoreDisplay = 'Y';
                      } else if (result.status === 'INCOMPLETE (X/Y)') {
                        terminalScoreDisplay = 'X/Y';
                      }
                    }

                    const upGradeObj = isUpperPrimary && isComplete && typeof result?.terminalPercentage === 'number'
                      ? getGradeForMark(result.terminalPercentage, grades, 'Upper Primary', student.grade || classStream?.class_name)
                      : null;

                    const levelDisplay = isComplete
                      ? (isUpperPrimary
                          ? (upGradeObj?.grade_code || upGradeObj?.performance_level || 'BE')
                          : (result?.cbePerformanceLevel || '—'))
                      : '—';

                    const pointsDisplay = isComplete
                      ? (isUpperPrimary
                          ? String(upGradeObj?.points ?? 1)
                          : (typeof result?.points === 'number' ? String(result.points) : '—'))
                      : '—';
                    const rankDisplay = subjectRanks?.[subject.id] || '—';

                    return (
                      <React.Fragment key={subject.id}>
                        {hasComponents &&
                          entryWithComponents?.components?.map((comp, cIdx) => (
                            <tr key={`${subject.id}-comp-${comp.code || cIdx}`} className="bg-neutral-50/70">
                              <td className="p-2 font-normal text-black text-center border-r border-black">—</td>
                              <td className="p-2 font-normal text-black border-r border-black pl-4">
                                {comp.name} <span className="font-mono text-[10px]">({comp.outOf}%)</span>
                              </td>
                              {contributingAssessments.map((a) => {
                                const trail = result?.assessmentTrail?.find((t) => t.examId === a.id);
                                const c = trail?.components?.find((tc) => tc.code === comp.code);
                                return (
                                  <td key={a.id} className="p-2 font-normal text-black text-center border-r border-black font-mono text-xs">
                                    {c
                                      ? c.status === 'Normal' && c.rawScore !== null
                                        ? `${c.rawScore}/${c.outOf}`
                                        : c.displayScore
                                      : '—'}
                                  </td>
                                );
                              })}
                              <td className="p-2 font-normal text-black text-center border-r border-black">—</td>
                              <td className="p-2 font-normal text-black text-center border-r border-black">—</td>
                              <td className="p-2 font-normal text-black text-center border-r border-black">—</td>
                              <td className="p-2 font-normal text-black text-center border-r border-black">—</td>
                              <td className="p-2 font-normal text-black border-r border-black italic text-[10px]">
                                Component contribution ({comp.outOf}%)
                              </td>
                              <td className="p-2 font-normal text-black">
                                {teacherNameStr}
                              </td>
                            </tr>
                          ))}

                        <tr>
                          <td className="p-2 font-normal text-black text-center border-r border-black">{idx + 1}</td>
                          <td className="p-2 font-normal text-black border-r border-black">
                            <span className={hasComponents ? 'font-bold' : ''}>
                              {subject.subject_name}
                            </span>
                            {hasComponents && (
                              <span className="ml-1 text-[10px] font-bold uppercase">(TOTAL)</span>
                            )}
                          </td>
                          {contributingAssessments.map((a) => {
                            const entry = result?.assessmentTrail?.find((t) => t.examId === a.id);
                            if (!entry || entry.status === 'Blank' || entry.status === 'X') {
                              return (
                                <td key={a.id} className="p-2 font-normal text-black text-center border-r border-black">
                                  X
                                </td>
                              );
                            }
                            if (entry.status === 'Y') {
                              return (
                                <td key={a.id} className="p-2 font-normal text-black text-center border-r border-black">
                                  Y
                                </td>
                              );
                            }
                            const scoreVal = typeof entry.percentage === 'number'
                              ? Math.round(entry.percentage)
                              : (typeof entry.rawScore === 'number' ? entry.rawScore : 'X');
                            return (
                              <td key={a.id} className="p-2 font-normal text-black text-center border-r border-black">
                                {scoreVal}
                              </td>
                            );
                          })}
                          <td className="p-2 font-normal text-black text-center border-r border-black">
                            {terminalScoreDisplay}
                          </td>
                          <td className="p-2 font-normal text-black text-center border-r border-black">
                            {levelDisplay}
                          </td>
                          <td className="p-2 font-normal text-black text-center border-r border-black">
                            {pointsDisplay}
                          </td>
                          <td className="p-2 font-normal text-black text-center border-r border-black">
                            {rankDisplay}
                          </td>
                          <td className="p-2 font-normal text-black border-r border-black">
                            {commentStr}
                          </td>
                          <td className="p-2 font-normal text-black">
                            {teacherNameStr}
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3B. ASSESSMENT PERFORMANCE SUMMARY */}
          {contributingAssessments && contributingAssessments.length > 0 && effectiveAssessmentRankings && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-black">
                ASSESSMENT PERFORMANCE SUMMARY
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border border-black border-collapse">
                  <thead>
                    <tr className="border-b border-black">
                      <th className="p-2 font-bold text-black border-r border-black w-[35%]">ASSESSMENT NAME</th>
                      <th className="p-2 font-bold text-black text-center border-r border-black w-[20%]">TOTAL MARKS</th>
                      <th className="p-2 font-bold text-black text-center border-r border-black w-[22.5%]">STREAM RANK</th>
                      <th className="p-2 font-bold text-black text-center w-[22.5%]">OVERALL GRADE RANK</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contributingAssessments.map((a, idx) => {
                      const name = formatAssessmentColumnHeader(a.exam_name, idx);
                      const ranking = effectiveAssessmentRankings[a.id];

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

                      return (
                        <tr key={a.id} className="border-b border-black last:border-b-0">
                          <td className="p-2 font-normal text-black border-r border-black">{name}</td>
                          <td className="p-2 font-normal text-black text-center border-r border-black">{totalStr}</td>
                          <td className="p-2 font-normal text-black text-center border-r border-black">{streamRankStr}</td>
                          <td className="p-2 font-normal text-black text-center">{overallRankStr}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. SUMMARY (TERMINAL TOTAL & MEAN SCORE) */}
          <div className="space-y-1.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-black">
              SUMMARY
            </h3>
            <div className="border border-black grid grid-cols-2 divide-x divide-black p-2 text-xs">
              <div>
                <span className="font-bold">TERMINAL TOTAL: </span>
                <span className="font-normal">{terminalTotalStr}</span>
              </div>
              <div className="pl-3">
                <span className="font-bold">MEAN SCORE: </span>
                <span className="font-normal">{meanScoreStr}</span>
              </div>
            </div>
          </div>

          {/* 5. CLASS TEACHER'S REMARKS */}
          <div className="space-y-1.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-black">
              CLASS TEACHER'S REMARKS
            </h3>
            <div className="border border-black p-3 min-h-[64px] flex flex-col justify-between text-xs space-y-2">
              <div className="min-h-[28px] relative flex flex-col justify-between">
                <div>
                  {resolvedRemarks.class_teacher_comment ? (
                    <p className="font-normal text-black leading-relaxed">
                      {resolvedRemarks.class_teacher_comment}
                    </p>
                  ) : (
                    <div className="space-y-2.5 pt-1">
                      <div className="border-b border-black w-full" />
                      <div className="border-b border-black w-full" />
                    </div>
                  )}
                </div>

                {resolvedClassTeacher?.signature_url && (
                  <div className="self-end mr-12 -mt-2 mb-1 h-10 print:h-8">
                    <img 
                      src={resolvedClassTeacher.signature_url} 
                      alt="Class Teacher Signature" 
                      className="h-full object-contain max-w-[150px] mix-blend-darken"
                    />
                  </div>
                )}
              </div>
              <div className="pt-1 font-normal text-black">
                {resolvedRemarks.class_teacher_name
                  ? `Class Teacher: ${resolvedRemarks.class_teacher_name}`
                  : 'Class Teacher: ____________________________________________________________________________'}
              </div>
            </div>
          </div>

          {/* 6. HEAD TEACHER'S REMARKS */}
          <div className="space-y-1.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-black">
              HEAD TEACHER'S REMARKS
            </h3>
            <div className="border border-black p-3 min-h-[64px] flex flex-col justify-between text-xs space-y-2">
              <div className="min-h-[28px]">
                {resolvedRemarks.headteacher_comment ? (
                  <p className="font-normal text-black leading-relaxed">
                    {resolvedRemarks.headteacher_comment}
                  </p>
                ) : (
                  <div className="space-y-2.5 pt-1">
                    <div className="border-b border-black w-full" />
                    <div className="border-b border-black w-full" />
                  </div>
                )}
              </div>
              <div className="pt-1 font-normal text-black">
                {resolvedRemarks.headteacher_name
                  ? `Head Teacher: ${resolvedRemarks.headteacher_name}`
                  : 'Head Teacher: ____________________________________________________________________________'}
              </div>
            </div>
          </div>

          {/* 7. SIGNATURES & OFFICIAL SEAL (3 COLUMNS) */}
          <div className="grid grid-cols-3 gap-2 text-xs print:gap-2">
            {/* Box 1: Class Teacher Signature */}
            <div className="border border-black p-1.5 flex flex-col justify-between items-center min-h-[56px] text-center">
              <span className="font-bold uppercase text-[9px] tracking-wider text-black">CLASS TEACHER SIGNATURE</span>
              <div className="my-0.5 flex items-center justify-center min-h-[24px]">
                {resolvedClassTeacher?.signature_url ? (
                  <img
                    src={resolvedClassTeacher.signature_url}
                    alt="Class Teacher Signature"
                    className="max-h-7 max-w-[110px] object-contain mix-blend-darken"
                  />
                ) : (
                  <span className="font-normal text-black text-[10px]">Sign: _________________</span>
                )}
              </div>
              <span className="italic text-[9px] text-black">
                {resolvedRemarks.class_teacher_name || 'Class Teacher'}
              </span>
            </div>

            {/* Box 2: Head of Institution & Stamp */}
            <div className="border border-black p-1.5 flex flex-col justify-between items-center min-h-[56px] text-center">
              <span className="font-bold uppercase text-[9px] tracking-wider text-black">HEAD OF INSTITUTION & STAMP</span>
              <div className="my-0.5 flex items-center justify-center min-h-[24px]">
                {school?.stamp_url ? (
                  <img
                    src={school.stamp_url}
                    alt="Official School Stamp"
                    className="max-h-7 max-w-[110px] object-contain mix-blend-darken"
                  />
                ) : (
                  <span className="font-normal text-black text-[10px]">Sign &amp; Seal: ___________</span>
                )}
              </div>
              <span className="italic text-[9px] text-black">
                {resolvedRemarks.headteacher_name || school?.principal_name || 'Head Teacher'}
              </span>
            </div>

            {/* Box 3: Parent / Guardian Signature */}
            <div className="border border-black p-1.5 flex flex-col justify-between items-center min-h-[56px] text-center">
              <span className="font-bold uppercase text-[9px] tracking-wider text-black">PARENT / GUARDIAN SIGNATURE</span>
              <div className="my-0.5 flex items-center justify-center min-h-[24px]">
                <span className="font-normal text-black text-[10px]">Sign: _________________</span>
              </div>
              <span className="italic text-[9px] text-black">Parent / Guardian</span>
            </div>
          </div>

          {/* 8. LEGEND */}
          <div className="space-y-1 text-xs">
            <h3 className="font-bold uppercase tracking-wider text-black">
              LEGEND
            </h3>
            {isUpperPrimary ? (
              <>
                <p className="font-normal text-black">
                  76–100%: EE (Exceeding Expectations) = 4 pts | 51–75%: ME (Meeting Expectations) = 3 pts
                </p>
                <p className="font-normal text-black">
                  26–50%: AE (Approaching Expectations) = 2 pts | 0–25%: BE (Below Expectations) = 1 pt
                </p>
              </>
            ) : (
              <>
                <p className="font-normal text-black">
                  EE1 – Exceeding Expectation 1 (8 pts) | EE2 – Exceeding Expectation 2 (7 pts) | ME1 – Meeting Expectation 1 (6 pts) | ME2 – Meeting Expectation 2 (5 pts)
                </p>
                <p className="font-normal text-black">
                  AE1 – Approaching Expectation 1 (4 pts) | AE2 – Approaching Expectation 2 (3 pts) | BE1 – Below Expectation 1 (2 pts) | BE2 – Below Expectation 2 (1 pt)
                </p>
              </>
            )}
          </div>

          {/* 8. FOOTER: NEXT TERM OPENS ONLY */}
          <div className="pt-2 text-xs font-normal text-black">
            Next Term Opens:{' '}
            {confirmedDate || nextTermOpeningDate ? (
              <span className="font-normal">{formatKenyaDate(confirmedDate || nextTermOpeningDate || '')}</span>
            ) : (
              '____________________________________________________________________________'
            )}
          </div>
        </div>
      </div>

      {/* MANDATORY NEXT TERM OPENING DATE GATE MODAL */}
      <NextTermOpeningDateModal
        isOpen={isDateModalOpen}
        exam={contributingAssessments[0] as any}
        reportType="terminal"
        reportTitle="Terminal Report"
        termName={term}
        year={academicYear}
        schoolTerms={api.getSchoolTerms()}
        initialDate={confirmedDate}
        studentName={student.full_name}
        downloadContext="single"
        onConfirm={(date) => {
          setConfirmedDate(date);
          executeTerminalPdfDownload(date);
        }}
        onClose={() => setIsDateModalOpen(false)}
        isProcessing={isDownloading}
      />
    </div>
  );
};
