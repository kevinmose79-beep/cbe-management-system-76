import React, { useState, useEffect, useMemo, useRef } from 'react';
import { BookMarked, Plus, Lock, FileText, AlertTriangle, Trash2, RefreshCw, CheckCircle2, Edit2, X } from 'lucide-react';
import { Examination,
  UpperPrimarySSCREStructure, AssessmentStructure, ExamStatus, ExamType, ClassStream, Role, User, EducationLevel, getEducationLevelForGrade } from '../types';
import { api, generateUUID } from '../lib/storage';
import { isTermModifiable, canViewTermData, getTermStatusMessage, canPlanExams, canApproveExams } from '../utils/termStatusUtils';
import { useAcademicSession } from '../contexts/AcademicSessionContext';
import { formatAssessmentCreationDate } from '../utils/kenyaDateUtils';
import { getDisplayExamName, getDisplayExamType } from '../utils/examDisplayUtils';

interface ExaminationManagementProps {
  exams: Examination[];
  classes?: ClassStream[];
  userRole?: Role;
  currentUser?: User | null;
  onAddExamination: (exam: Examination) => Promise<void> | void;
  onUpdateExamination?: (exam: Examination) => Promise<void> | void;
  onUpdateStatus: (examId: string, status: ExamStatus) => Promise<void> | void;
  onDeleteExamination?: (examId: string) => Promise<{ success: boolean; examName: string; deletedMarksCount: number; affectedStudentsCount: number; message: string }>;
}

export const ExaminationManagement: React.FC<ExaminationManagementProps> = ({
  exams,
  classes = [],
  userRole = 'admin',
  currentUser = null,
  onAddExamination,
  onUpdateExamination,
  onUpdateStatus,
  onDeleteExamination,
}) => {
  const { viewingTerm: activeTermObj, viewingYear: activeYearObj } = useAcademicSession();
  const isTermClosed = activeTermObj.status === 'Closed';
  const isAdmin = userRole === 'admin';
  
  const canModify = isTermModifiable(activeTermObj.status);
  const canPlan = canPlanExams(activeTermObj.status);
  const canApprove = canApproveExams(activeTermObj.status);

  const [isAdding, setIsAdding] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [examName, setExamName] = useState('');
  const [term, setTerm] = useState<'Term 1' | 'Term 2' | 'Term 3'>(
    (activeTermObj.term_name as any) || 'Term 1'
  );
  const [year, setYear] = useState<number>(activeYearObj?.year || 2026);

  useEffect(() => {
    if (activeTermObj?.term_name) setTerm(activeTermObj.term_name as any);
    if (activeYearObj?.year) setYear(activeYearObj.year);
  }, [activeTermObj?.term_name, activeYearObj?.year]);
  const [examType, setExamType] = useState<ExamType>('Opener');
  const [maxMarks, setMaxMarks] = useState(100);
  const [structureMode, setStructureMode] = useState<'NONE' | 'A' | 'B' | 'C' | 'CUSTOM'>('NONE');
  const [customSstMax, setCustomSstMax] = useState<number | ''>(30);
  const [customCreMax, setCustomCreMax] = useState<number | ''>(30);
  const [assessmentStructure, setAssessmentStructure] = useState<AssessmentStructure>('Composite');
  const [educationLevel, setEducationLevel] = useState<string>('All Levels');
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [selectedClassesForScope, setSelectedClassesForScope] = useState<string[]>([]);
  const [initialStatus, setInitialStatus] = useState<ExamStatus>('Draft');

  // Edit Examination Modal State
  const [examToEdit, setExamToEdit] = useState<Examination | null>(null);
  const [editExamName, setEditExamName] = useState('');
  const [editExamType, setEditExamType] = useState<ExamType>('Opener');
  const [editMaxMarks, setEditMaxMarks] = useState(100);
  const [editClassesForScope, setEditClassesForScope] = useState<string[]>([]);
  const [editStructureMode, setEditStructureMode] = useState<'NONE' | 'A' | 'B' | 'C' | 'CUSTOM'>('NONE');
  const [editCustomSstMax, setEditCustomSstMax] = useState<number | ''>(30);
  const [editCustomCreMax, setEditCustomCreMax] = useState<number | ''>(30);
  const [editAssessmentStructure, setEditAssessmentStructure] = useState<AssessmentStructure>('Composite');
  const [editEducationLevel, setEditEducationLevel] = useState<string>('All Levels');
  const [editClassId, setEditClassId] = useState<string>('all');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Check if active exam to edit has recorded marks to enforce edit locking
  const examHasRecordedMarks = useMemo(() => {
    if (!examToEdit) return false;
    try {
      const marks = api.getMarks();
      return marks.some((m) => m.exam_id === examToEdit.id);
    } catch {
      return false;
    }
  }, [examToEdit]);

  // Authoritative Distinct Classes grouped and sorted by class_name
  const distinctClasses = useMemo(() => {
    const seen = new Map<string, { id: string; className: string; educationLevel: EducationLevel }>();
    (classes || []).forEach((c) => {
      if (!c.id) return;
      if (!seen.has(c.id)) {
        const level = c.education_level || getEducationLevelForGrade(c.class_name) || 'Junior School';
        seen.set(c.id, {
          id: c.id,
          className: c.class_name,
          educationLevel: level as EducationLevel,
        });
      }
    });
    return Array.from(seen.values()).sort((a, b) => {
      return a.className.localeCompare(b.className, undefined, { numeric: true });
    });
  }, [classes]);

  // Classes available for Create Assessment based on selected education level
  const availableClassesForCreate = useMemo(() => {
    if (educationLevel === 'All Levels' || !educationLevel) {
      return distinctClasses;
    }
    return distinctClasses.filter((c) => c.educationLevel === educationLevel);
  }, [distinctClasses, educationLevel]);

  // Handle Target Level change with strict parent-child selection integrity
  const handleEducationLevelChange = (newLevel: string) => {
    setEducationLevel(newLevel);
    setSelectedClassesForScope([]);
    if (newLevel === 'All Levels') {
      setSelectedClassId('all');
      setStructureMode('NONE');
    } else {
      const matched = distinctClasses.find((c) => c.id === selectedClassId);
      if (!matched || matched.educationLevel !== newLevel) {
        setSelectedClassId('all');
      }
    }
  };

  // Classes available for Edit Assessment based on edit education level
  const availableClassesForEdit = useMemo(() => {
    if (editEducationLevel === 'All Levels' || !editEducationLevel) {
      return distinctClasses;
    }
    return distinctClasses.filter((c) => c.educationLevel === editEducationLevel);
  }, [distinctClasses, editEducationLevel]);

  // Handle Edit Target Level change with strict parent-child selection integrity
  const handleEditEducationLevelChange = (newLevel: string) => {
    setEditEducationLevel(newLevel);
    setEditClassesForScope([]);
    if (newLevel === 'All Levels') {
      setEditClassId('all');
    } else {
      const matched = distinctClasses.find((c) => c.id === editClassId);
      if (!matched || matched.educationLevel !== newLevel) {
        setEditClassId('all');
      }
    }
  };

  // Delete Examination Modal & Status State
  const [examToDelete, setExamToDelete] = useState<Examination | null>(null);
  const [confirmedApproved, setConfirmedApproved] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [successFeedback, setSuccessFeedback] = useState<string | null>(null);
  const successTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showSuccessFeedback = (msg: string) => {
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
    }
    setSuccessFeedback(msg);
    successTimeoutRef.current = setTimeout(() => {
      setSuccessFeedback(null);
      successTimeoutRef.current = null;
    }, 4500);
  };

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  if (!canViewTermData(activeTermObj.status)) {
    return (
      <div className="p-8 text-center space-y-4">
        <div className="bg-amber-100 text-amber-800 p-6 rounded-2xl max-w-md mx-auto">
          <h2 className="text-lg font-bold mb-2">Term {activeTermObj.status}</h2>
          <p className="text-sm">{getTermStatusMessage(activeTermObj.status)}</p>
        </div>
      </div>
    );
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examName || isCreating) return;
    if (!canModify) {
      setCreateError(getTermStatusMessage(activeTermObj.status));
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    const resolvedLevel: EducationLevel | undefined =
      educationLevel === 'All Levels' || !educationLevel
        ? undefined
        : (educationLevel as EducationLevel);

    const resolvedClassId: string | undefined =
      !resolvedLevel || selectedClassId === 'all' || !selectedClassId
        ? undefined
        : selectedClassId;

    let resolvedSsCreStructure: UpperPrimarySSCREStructure | undefined = undefined;
    if (educationLevel === 'Upper Primary' || educationLevel === 'All Levels') {
      if (structureMode === 'A' || structureMode === 'B' || structureMode === 'C') {
        resolvedSsCreStructure = structureMode;
      } else if (structureMode === 'CUSTOM') {
        const sst = typeof customSstMax === 'number' ? customSstMax : parseInt(String(customSstMax), 10);
        const cre = typeof customCreMax === 'number' ? customCreMax : parseInt(String(customCreMax), 10);
        if (!Number.isInteger(sst) || sst <= 0 || !Number.isInteger(cre) || cre <= 0) {
          setCreateError('SST and CRE maximum marks must be positive whole numbers greater than zero.');
          setIsCreating(false);
          return;
        }
        if (sst > 100 || cre > 100) {
          setCreateError('Individual SST and CRE component maximums cannot exceed 100 marks.');
          setIsCreating(false);
          return;
        }
        resolvedSsCreStructure = `CUSTOM:${sst}:${cre}` as UpperPrimarySSCREStructure;
      }
    }

    const resolvedApplicableClasses: string[] =
      resolvedClassId || selectedClassesForScope.length === 0
        ? []
        : Array.from(new Set<string>(selectedClassesForScope));

    const today = new Date().toISOString().slice(0, 10);
    const newExam: Examination = {
      id: generateUUID(),
      exam_name: examName.trim(),
      academic_year_id: activeYearObj.id,
      term_id: activeTermObj.id,
      term,
      year,
      education_level: resolvedLevel,
      class_id: resolvedClassId,
      applicable_classes: resolvedApplicableClasses,
      date_created: today,
      status: initialStatus,
      exam_type: examType,
      max_marks: maxMarks,
      ss_cre_structure: resolvedSsCreStructure,
      assessment_structure: assessmentStructure,
      start_date: today,
    };

    try {
      await onAddExamination(newExam);
      setExamName('');
      setEducationLevel('All Levels');
      setSelectedClassId('all');
      setSelectedClassesForScope([]);
      setStructureMode('NONE');
      setCustomSstMax(30);
      setCustomCreMax(30);
      setAssessmentStructure('Composite');
      setIsAdding(false);
      showSuccessFeedback(`Assessment "${newExam.exam_name}" created and saved successfully to database.`);
    } catch (err: any) {
      console.error('Failed to create examination:', err);
      setCreateError(err?.message || 'Failed to create assessment.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenEdit = (exam: Examination) => {
    if (!canModify) {
      setUpdateError(getTermStatusMessage(activeTermObj.status) || 'Term is closed. Cannot edit assessment.');
      return;
    }
    if (exam.status === 'Approved') {
      setUpdateError('Approved assessments are locked. Re-open to Draft if changes are required.');
      return;
    }
    if (exam.status === ('Archived' as any)) {
      setUpdateError('Archived assessments are historical records and cannot be edited.');
      return;
    }
    setExamToEdit(exam);
    setEditExamName(exam.exam_name);
    setEditExamType(exam.exam_type || 'Opener');
    setEditMaxMarks(exam.max_marks || 100);
    setEditAssessmentStructure(exam.assessment_structure || 'Composite');

    // Initialize SS&CRE Structure edit state
    if (exam.ss_cre_structure) {
      const str = String(exam.ss_cre_structure).trim();
      if (str === 'A' || str === 'B' || str === 'C') {
        setEditStructureMode(str);
        setEditCustomSstMax(30);
        setEditCustomCreMax(30);
      } else {
        const match = str.match(/^CUSTOM:(\d+):(\d+)$/i);
        if (match) {
          setEditStructureMode('CUSTOM');
          setEditCustomSstMax(parseInt(match[1], 10) || 30);
          setEditCustomCreMax(parseInt(match[2], 10) || 30);
        } else {
          setEditStructureMode('NONE');
          setEditCustomSstMax(30);
          setEditCustomCreMax(30);
        }
      }
    } else {
      setEditStructureMode('NONE');
      setEditCustomSstMax(30);
      setEditCustomCreMax(30);
    }

    let initialLevel = exam.education_level || 'All Levels';
    let initialClassId = exam.class_id || 'all';

    if (!exam.education_level && exam.class_id && exam.class_id !== 'all') {
      const matched = distinctClasses.find((c) => c.id === exam.class_id);
      if (matched) {
        initialLevel = matched.educationLevel;
      } else {
        // Orphaned or unresolvable class without education level defaults to All Levels / all
        initialLevel = 'All Levels';
        initialClassId = 'all';
      }
    }

    if (initialLevel === 'All Levels') {
      initialClassId = 'all';
    }

    setEditEducationLevel(initialLevel);
    setEditClassId(initialClassId);
    setEditClassesForScope(Array.isArray(exam.applicable_classes) ? exam.applicable_classes : []);
    setUpdateError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examToEdit || isUpdating) return;

    if (!canModify) {
      setUpdateError(getTermStatusMessage(activeTermObj.status) || 'Academic Term is not modifiable.');
      return;
    }

    const trimmed = editExamName.trim();
    if (!trimmed) {
      setUpdateError('Assessment title cannot be empty.');
      return;
    }

    const numMarks = Number(editMaxMarks);
    if (!Number.isFinite(numMarks) || numMarks <= 0) {
      setUpdateError('Maximum marks must be a positive number greater than zero.');
      return;
    }

    setIsUpdating(true);
    setUpdateError(null);

    const resolvedLevel: EducationLevel | undefined =
      editEducationLevel === 'All Levels' || !editEducationLevel
        ? undefined
        : (editEducationLevel as EducationLevel);

    const resolvedClassId: string | undefined =
      !resolvedLevel || editClassId === 'all' || !editClassId
        ? undefined
        : editClassId;

    const resolvedEditApplicableClasses: string[] =
      resolvedClassId || editClassesForScope.length === 0
        ? []
        : Array.from(new Set<string>(editClassesForScope));

    let resolvedEditSsCreStructure: UpperPrimarySSCREStructure | undefined = undefined;
    if (editEducationLevel === 'Upper Primary' || editEducationLevel === 'All Levels') {
      if (editStructureMode === 'A' || editStructureMode === 'B' || editStructureMode === 'C') {
        resolvedEditSsCreStructure = editStructureMode;
      } else if (editStructureMode === 'CUSTOM') {
        const sst = typeof editCustomSstMax === 'number' ? editCustomSstMax : parseInt(String(editCustomSstMax), 10);
        const cre = typeof editCustomCreMax === 'number' ? editCustomCreMax : parseInt(String(editCustomCreMax), 10);
        if (!Number.isInteger(sst) || sst <= 0 || !Number.isInteger(cre) || cre <= 0) {
          setUpdateError('SST and CRE maximum marks must be positive whole numbers greater than zero.');
          setIsUpdating(false);
          return;
        }
        if (sst > 100 || cre > 100) {
          setUpdateError('Individual SST and CRE component maximums cannot exceed 100 marks.');
          setIsUpdating(false);
          return;
        }
        resolvedEditSsCreStructure = `CUSTOM:${sst}:${cre}` as UpperPrimarySSCREStructure;
      }
    }

    // Safety guard: if marks already exist, reject altering the SS&CRE structure
    if (examHasRecordedMarks && resolvedEditSsCreStructure !== (examToEdit.ss_cre_structure || undefined)) {
      setUpdateError('Cannot modify SS & CRE assessment structure because marks have already been recorded for this assessment. Changing the structure would invalidate existing scores.');
      setIsUpdating(false);
      return;
    }

    const updatedRecord: Examination = {
      ...examToEdit,
      exam_name: trimmed,
      exam_type: editExamType,
      max_marks: numMarks,
      ss_cre_structure: resolvedEditSsCreStructure,
      assessment_structure: editAssessmentStructure,
      education_level: resolvedLevel,
      class_id: resolvedClassId,
      applicable_classes: resolvedEditApplicableClasses,
      updated_at: new Date().toISOString(),
    };

    try {
      if (onUpdateExamination) {
        await onUpdateExamination(updatedRecord);
      } else {
        await api.updateExamination(updatedRecord, currentUser);
      }
      showSuccessFeedback(`Assessment "${trimmed}" updated successfully.`);
      setExamToEdit(null);
    } catch (err: any) {
      console.error('Failed to update assessment:', err);
      setUpdateError(err?.message || 'Failed to update assessment. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!examToDelete || isDeleting) return;
    if (activeTermObj.status === 'Locked') {
      setDeleteError(getTermStatusMessage(activeTermObj.status) || 'Academic Term Locked. Cannot delete examination.');
      return;
    }
    if (examToDelete.status === 'Approved') {
      setDeleteError('Approved examinations are locked and cannot be deleted. Re-open the examination to Draft if corrections are required.');
      return;
    }
    if (examToDelete.status === ('Archived' as any)) {
      setDeleteError('Archived examinations cannot be deleted because they are historical records.');
      return;
    }
    setIsDeleting(true);
    setDeleteError(null);

    try {
      let res;
      if (onDeleteExamination) {
        res = await onDeleteExamination(examToDelete.id);
      } else {
        res = await api.deleteExamination(examToDelete.id, currentUser);
      }
      showSuccessFeedback(res?.message || `Examination "${examToDelete.exam_name}" deleted successfully.`);
      setExamToDelete(null);
      setConfirmedApproved(false);
    } catch (err: any) {
      console.error('Failed to delete examination:', err);
      setDeleteError(err?.message || 'Failed to delete examination. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
            <BookMarked className="w-6 h-6 text-[#176B45] dark:text-emerald-400" />
            <span>Assessment Setup</span>
          </h1>
        </div>

        {canModify ? (
          <button
            onClick={() => setIsAdding(true)}
            className="bg-[#176B45] hover:bg-[#0F5132] text-white text-xs font-bold px-4 py-2.5 rounded-lg shadow-xs transition flex items-center space-x-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Assessment</span>
          </button>
        ) : (
          <div className="bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 text-xs font-bold px-4 py-2.5 rounded-lg border border-amber-200 dark:border-amber-800/80 flex items-center space-x-1.5">
            <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span>Term {activeTermObj.status}: Assessment Creation Locked</span>
          </div>
        )}
      </div>

      {/* SUCCESS NOTIFICATION TOAST */}
      {successFeedback && (
        <div className="bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800/80 text-emerald-900 dark:text-emerald-200 rounded-xl p-4 flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center space-x-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            <p className="text-xs font-bold">{successFeedback}</p>
          </div>
          <button
            onClick={() => {
              if (successTimeoutRef.current) {
                clearTimeout(successTimeoutRef.current);
                successTimeoutRef.current = null;
              }
              setSuccessFeedback(null);
            }}
            className="text-emerald-700 dark:text-emerald-400 hover:text-emerald-950 dark:hover:text-emerald-200 font-bold text-xs underline ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* CREATE FORM */}
      {isAdding && (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm max-w-xl mx-auto">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">
            New Assessment Details
          </h2>
          <form onSubmit={handleCreate} className="space-y-3 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Assessment Title *</label>
              <input
                type="text"
                required
                value={examName}
                onChange={(e) => setExamName(e.target.value)}
                placeholder="e.g. Opener Assessment - Term 1 2026"
                className="w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 focus:ring-2 focus:ring-[#176B45] focus:outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Term *</label>
                <select
                  value={term}
                  onChange={(e) => setTerm(e.target.value as any)}
                  className="w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 focus:ring-2 focus:ring-[#176B45] focus:outline-none"
                >
                  <option value="Term 1" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Term 1</option>
                  <option value="Term 2" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Term 2</option>
                  <option value="Term 3" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Term 3</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Academic Year *</label>
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 focus:ring-2 focus:ring-[#176B45] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Assessment Type *</label>
                <select
                  value={examType}
                  onChange={(e) => setExamType(e.target.value as any)}
                  className="w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 focus:ring-2 focus:ring-[#176B45] focus:outline-none"
                >
                  <option value="Opener" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Opener Assessment</option>
                  <option value="Mid-Term" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Mid-Term Assessment</option>
                  <option value="End-Term" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">End-Term Assessment</option>
                  <option value="Custom" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Custom Assessment</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Maximum Marks</label>
                <input
                  type="number"
                  value={maxMarks}
                  onChange={(e) => setMaxMarks(Number(e.target.value))}
                  className="w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 focus:ring-2 focus:ring-[#176B45] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Target Level</label>
                <select
                  value={educationLevel}
                  onChange={(e) => handleEducationLevelChange(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 focus:ring-2 focus:ring-[#176B45] focus:outline-none cursor-pointer"
                >
                  <option value="All Levels" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">All Levels (School-Wide)</option>
                  <option value="Pre-Primary" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Pre-Primary</option>
                  <option value="Lower Primary" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Lower Primary</option>
                  <option value="Upper Primary" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Upper Primary</option>
                  <option value="Junior School" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Junior School</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Target Class / Grade</label>
                <select
                  value={selectedClassId}
                  disabled={educationLevel === 'All Levels'}
                  onChange={(e) => {
                    setSelectedClassId(e.target.value);
                    setSelectedClassesForScope([]);
                  }}
                  className="w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 focus:ring-2 focus:ring-[#176B45] focus:outline-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {educationLevel === 'All Levels' ? (
                    <option value="all" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">All Classes (School-Wide)</option>
                  ) : (
                    <>
                      <option value="all" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">All Classes in {educationLevel}</option>
                      {availableClassesForCreate.map((c) => (
                        <option key={c.id} value={c.id} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                          {c.className}
                        </option>
                      ))}
                    </>
                  )}
                </select>

                {selectedClassId === 'all' && educationLevel !== 'All Levels' && availableClassesForCreate.length > 1 && (
                  <div className="mt-2.5 p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Targeted Grades Scope
                      </span>
                      <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        {selectedClassesForScope.length === 0
                          ? 'All Grades Included (Whole Level)'
                          : `${selectedClassesForScope.length} of ${availableClassesForCreate.length} Grades Selected`}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {availableClassesForCreate.map((c) => {
                        const isChecked = selectedClassesForScope.length === 0 || selectedClassesForScope.includes(c.id);
                        return (
                          <label key={c.id} className="flex items-center space-x-2 text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const allIds = availableClassesForCreate.map((ac) => ac.id);
                                const currentSet = new Set(selectedClassesForScope.length === 0 ? allIds : selectedClassesForScope);
                                if (e.target.checked) {
                                  currentSet.add(c.id);
                                } else {
                                  currentSet.delete(c.id);
                                }
                                const updated = Array.from(currentSet);
                                setSelectedClassesForScope(updated);
                              }}
                              className="rounded text-[#176B45] focus:ring-[#176B45] cursor-pointer"
                            />
                            <span>{c.className}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              {(educationLevel === 'Upper Primary' || educationLevel === 'All Levels') && (
                <div className="space-y-2">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    SS & CRE Assessment Structure (Upper Primary)
                  </label>
                  <select
                    value={structureMode}
                    onChange={(e) => setStructureMode(e.target.value as any)}
                    className="w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 focus:ring-2 focus:ring-[#176B45] focus:outline-none cursor-pointer"
                  >
                    <option value="NONE" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-slate-500">Select structure...</option>
                    <option value="A" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Structure A (SST: 30, CRE: 20, Combined: 50)</option>
                    <option value="B" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Structure B (SST: 10, CRE: 10, Combined: 20)</option>
                    <option value="C" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Structure C (SST: 20, CRE: 30, Combined: 50)</option>
                    <option value="CUSTOM" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Custom Configuration (Define SST & CRE Max)...</option>
                  </select>

                  {structureMode === 'CUSTOM' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80 animate-in fade-in duration-150">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                          SST Max Marks *
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          step={1}
                          required
                          value={customSstMax}
                          onChange={(e) => {
                            const val = e.target.value === '' ? '' : parseInt(e.target.value, 10);
                            setCustomSstMax(Number.isNaN(val) ? '' : val);
                          }}
                          placeholder="30"
                          className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-xs font-semibold focus:ring-2 focus:ring-[#176B45] focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                          CRE Max Marks *
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          step={1}
                          required
                          value={customCreMax}
                          onChange={(e) => {
                            const val = e.target.value === '' ? '' : parseInt(e.target.value, 10);
                            setCustomCreMax(Number.isNaN(val) ? '' : val);
                          }}
                          placeholder="30"
                          className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-xs font-semibold focus:ring-2 focus:ring-[#176B45] focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Combined Max Marks
                        </label>
                        <div className="w-full bg-slate-100 dark:bg-slate-800 text-emerald-800 dark:text-emerald-300 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-extrabold flex items-center justify-between">
                          <span>
                            {(Number(customSstMax) || 0) + (Number(customCreMax) || 0) > 0
                              ? `${(Number(customSstMax) || 0) + (Number(customCreMax) || 0)} Marks`
                              : '—'}
                          </span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">Auto-calc</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(educationLevel === 'Upper Primary' || (selectedClassId !== 'all' && availableClassesForCreate.find((c) => c.id === selectedClassId)?.educationLevel === 'Upper Primary')) && (
                <div className="space-y-1.5 pt-1">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300">
                    Assessment Structure
                  </label>
                  <div className="flex items-center space-x-6 bg-slate-50 dark:bg-slate-800/80 p-2.5 rounded-lg border border-slate-300 dark:border-slate-700">
                    <label className="flex items-center space-x-2 cursor-pointer select-none">
                      <input
                        type="radio"
                        name="create_assessment_structure"
                        value="Composite"
                        checked={assessmentStructure === 'Composite'}
                        onChange={() => setAssessmentStructure('Composite')}
                        className="text-[#176B45] focus:ring-[#176B45] cursor-pointer"
                      />
                      <span className="font-bold text-slate-800 dark:text-slate-200">Composite</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer select-none">
                      <input
                        type="radio"
                        name="create_assessment_structure"
                        value="Standalone"
                        checked={assessmentStructure === 'Standalone'}
                        onChange={() => setAssessmentStructure('Standalone')}
                        className="text-[#176B45] focus:ring-[#176B45] cursor-pointer"
                      />
                      <span className="font-bold text-slate-800 dark:text-slate-200">Standalone</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {createError && (
              <div className="bg-rose-100 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800/80 text-rose-900 dark:text-rose-200 p-2.5 rounded-xl text-xs font-semibold flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-600 dark:text-rose-400" />
                <span>{createError}</span>
              </div>
            )}

            <div className="pt-3 flex items-center justify-end space-x-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                disabled={isCreating}
                onClick={() => {
                  setIsAdding(false);
                  setCreateError(null);
                }}
                className="px-4 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-300 font-semibold disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreating}
                className="px-5 py-2 bg-[#176B45] hover:bg-[#0F5132] text-white font-bold rounded-lg shadow-xs transition flex items-center space-x-2 disabled:opacity-50 cursor-pointer"
              >
                {isCreating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Saving Assessment...</span>
                  </>
                ) : (
                  <span>Save Assessment</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* EXAMINATIONS LIST */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">
          Registered Assessments & Status Pipeline
        </h2>

        <div className="space-y-3">
          {exams.map((ex) => {
            // Scope label derivation
            const scopeLabel = (() => {
              if (ex.applicable_classes && ex.applicable_classes.length > 0) {
                const matchedNames = ex.applicable_classes
                  .map((id) => distinctClasses.find((c) => c.id === id)?.className)
                  .filter(Boolean);
                if (matchedNames.length > 1) {
                  return matchedNames.join(' + ');
                }
                if (matchedNames.length === 1) {
                  return matchedNames[0];
                }
              }
              const targetClass = ex.class_id ? distinctClasses.find((c) => c.id === ex.class_id) : null;
              if (ex.class_id && targetClass) {
                return targetClass.className;
              }
              if (ex.education_level) {
                return `All ${ex.education_level}`;
              }
              return 'School-Wide';
            })();

            // Type and structure combined
            const typeAndStructure = [
              getDisplayExamType(ex.exam_type),
              ex.assessment_structure || (ex.education_level === 'Upper Primary' ? 'Composite' : null),
            ]
              .filter(Boolean)
              .join(' · ');

            return (
              <div
                key={ex.id}
                className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:border-[#176B45]/40 dark:hover:border-emerald-500/40 transition"
              >
                <div className="space-y-1">
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                    {getDisplayExamName(ex.exam_name)}
                  </h3>

                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {typeAndStructure}
                  </p>

                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{scopeLabel}</span>
                    {' · '}
                    {ex.term}
                    {' · '}
                    {ex.year}
                    {' · '}
                    Max: {ex.max_marks} marks
                  </p>

                  {(ex.created_at || ex.date_created) && (
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                      Created: {formatAssessmentCreationDate(ex.created_at || ex.date_created)}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Status Badge */}
                  <div className="flex items-center space-x-1.5 text-xs font-bold">
                    {ex.status === 'Approved' ? (
                      <span className="bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 px-3 py-1 rounded-full flex items-center space-x-1">
                        <Lock className="w-3.5 h-3.5" />
                        <span>Approved & Locked</span>
                      </span>
                    ) : ex.status === 'Provisional' ? (
                      <span className="bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 px-3 py-1 rounded-full flex items-center space-x-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>FOR VERIFICATION ONLY</span>
                      </span>
                    ) : (
                      <span className="bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-3 py-1 rounded-full flex items-center space-x-1">
                        <FileText className="w-3.5 h-3.5" />
                        <span>Draft Mode</span>
                      </span>
                    )}
                  </div>

                  {/* Actions for Draft / Provisional (Approved & Archived require no redundant lock pill) */}
                  {ex.status !== 'Approved' && ex.status !== ('Archived' as any) && isAdmin && (
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(ex)}
                        disabled={!canModify}
                        className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800/80 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition shadow-2xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        title={canModify ? 'Edit Assessment Details' : 'Term is closed/locked. Cannot edit.'}
                      >
                        <Edit2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setDeleteError(null);
                          setConfirmedApproved(false);
                          setExamToDelete(ex);
                        }}
                        className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800/80 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition shadow-2xs cursor-pointer"
                        title="Delete Assessment"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                        <span>Delete</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* EDIT ASSESSMENT DIALOG MODAL */}
      {examToEdit && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 flex items-center justify-center flex-shrink-0">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Edit Assessment</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Update assessment parameters and maximum marks
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setExamToEdit(null);
                  setUpdateError(null);
                }}
                disabled={isUpdating}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Edit Form */}
            <form onSubmit={handleSaveEdit} className="space-y-4">
              {/* Context info banner */}
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 rounded-xl p-3 text-xs text-slate-600 dark:text-slate-400 grid grid-cols-3 gap-2">
                <div>
                  <span className="font-semibold text-slate-500 dark:text-slate-400">Academic Term:</span>{' '}
                  <span className="font-bold text-slate-800 dark:text-slate-200">{examToEdit.term}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500 dark:text-slate-400">Year:</span>{' '}
                  <span className="font-bold text-slate-800 dark:text-slate-200">{examToEdit.year}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500 dark:text-slate-400">Status:</span>{' '}
                  <span className="font-bold text-slate-800 dark:text-slate-200">{examToEdit.status}</span>
                </div>
              </div>

              {/* Assessment Title */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Assessment Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editExamName}
                  onChange={(e) => setEditExamName(e.target.value)}
                  placeholder="e.g., Opener Assessment Term 3"
                  className="w-full text-xs font-semibold px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* Target Level & Target Class */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Target Level
                  </label>
                  <select
                    value={editEducationLevel}
                    onChange={(e) => handleEditEducationLevelChange(e.target.value)}
                    className="w-full text-xs font-semibold px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="All Levels">All Levels (School-Wide)</option>
                    <option value="Pre-Primary">Pre-Primary</option>
                    <option value="Lower Primary">Lower Primary</option>
                    <option value="Upper Primary">Upper Primary</option>
                    <option value="Junior School">Junior School</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Target Class / Grade
                  </label>
                  <select
                    value={editClassId}
                    disabled={editEducationLevel === 'All Levels'}
                    onChange={(e) => {
                      setEditClassId(e.target.value);
                      setEditClassesForScope([]);
                    }}
                    className="w-full text-xs font-semibold px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {editEducationLevel === 'All Levels' ? (
                      <option value="all">All Classes (School-Wide)</option>
                    ) : (
                      <>
                        <option value="all">All Classes in {editEducationLevel}</option>
                        {availableClassesForEdit.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.className}
                          </option>
                        ))}
                      </>
                    )}
                  </select>

                  {editClassId === 'all' && editEducationLevel !== 'All Levels' && availableClassesForEdit.length > 1 && (
                    <div className="mt-2.5 p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          Targeted Grades Scope
                        </span>
                        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                          {editClassesForScope.length === 0
                            ? 'All Grades Included (Whole Level)'
                            : `${editClassesForScope.length} of ${availableClassesForEdit.length} Grades Selected`}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {availableClassesForEdit.map((c) => {
                          const isChecked = editClassesForScope.length === 0 || editClassesForScope.includes(c.id);
                          return (
                            <label key={c.id} className="flex items-center space-x-2 text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  const allIds = availableClassesForEdit.map((ac) => ac.id);
                                  const currentSet = new Set(editClassesForScope.length === 0 ? allIds : editClassesForScope);
                                  if (e.target.checked) {
                                    currentSet.add(c.id);
                                  } else {
                                    currentSet.delete(c.id);
                                  }
                                  const updated = Array.from(currentSet);
                                  setEditClassesForScope(updated);
                                }}
                                className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                              />
                              <span>{c.className}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Assessment Type & Maximum Score */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Assessment Type
                  </label>
                  <select
                    value={editExamType}
                    onChange={(e) => setEditExamType(e.target.value as ExamType)}
                    className="w-full text-xs font-semibold px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="Opener">Opener Assessment</option>
                    <option value="Mid-Term">Mid-Term Assessment</option>
                    <option value="End-Term">End-Term Assessment</option>
                    <option value="Custom">Custom Assessment</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Maximum Score <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={1000}
                    value={editMaxMarks}
                    onChange={(e) => setEditMaxMarks(Math.max(1, Number(e.target.value)))}
                    className="w-full text-xs font-semibold px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                    Standard total score scale (default: 100 or 50)
                  </p>
                </div>
              </div>

              {(editEducationLevel === 'Upper Primary' || editEducationLevel === 'All Levels') && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                      SS & CRE Assessment Structure (Upper Primary)
                    </label>
                    {examHasRecordedMarks && (
                      <span className="inline-flex items-center space-x-1 text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800/60">
                        <Lock className="w-3 h-3" />
                        <span>Locked (Marks Recorded)</span>
                      </span>
                    )}
                  </div>
                  <select
                    value={editStructureMode}
                    disabled={examHasRecordedMarks}
                    onChange={(e) => setEditStructureMode(e.target.value as any)}
                    className="w-full text-xs font-semibold px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="NONE">Select structure...</option>
                    <option value="A">Structure A (SST: 30, CRE: 20, Combined: 50)</option>
                    <option value="B">Structure B (SST: 10, CRE: 10, Combined: 20)</option>
                    <option value="C">Structure C (SST: 20, CRE: 30, Combined: 50)</option>
                    <option value="CUSTOM">Custom Configuration (Define SST & CRE Max)...</option>
                  </select>

                  {editStructureMode === 'CUSTOM' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80 animate-in fade-in duration-150">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                          SST Max Marks *
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          step={1}
                          disabled={examHasRecordedMarks}
                          required
                          value={editCustomSstMax}
                          onChange={(e) => {
                            const val = e.target.value === '' ? '' : parseInt(e.target.value, 10);
                            setEditCustomSstMax(Number.isNaN(val) ? '' : val);
                          }}
                          placeholder="30"
                          className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:opacity-60"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                          CRE Max Marks *
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          step={1}
                          disabled={examHasRecordedMarks}
                          required
                          value={editCustomCreMax}
                          onChange={(e) => {
                            const val = e.target.value === '' ? '' : parseInt(e.target.value, 10);
                            setEditCustomCreMax(Number.isNaN(val) ? '' : val);
                          }}
                          placeholder="30"
                          className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:opacity-60"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Combined Max Marks
                        </label>
                        <div className="w-full bg-slate-100 dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-extrabold flex items-center justify-between">
                          <span>
                            {(Number(editCustomSstMax) || 0) + (Number(editCustomCreMax) || 0) > 0
                              ? `${(Number(editCustomSstMax) || 0) + (Number(editCustomCreMax) || 0)} Marks`
                              : '—'}
                          </span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">Auto-calc</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                    Defines component mark weighting for Upper Primary Social Studies & C.R.E.
                  </p>
                </div>
              )}

              {(editEducationLevel === 'Upper Primary' || (editClassId !== 'all' && availableClassesForEdit.find((c) => c.id === editClassId)?.educationLevel === 'Upper Primary')) && (
                <div className="space-y-1.5 pt-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Assessment Structure
                  </label>
                  <div className="flex items-center space-x-6 bg-slate-50 dark:bg-slate-800/80 p-2.5 rounded-xl border border-slate-300 dark:border-slate-700">
                    <label className="flex items-center space-x-2 cursor-pointer select-none">
                      <input
                        type="radio"
                        name="edit_assessment_structure"
                        value="Composite"
                        checked={editAssessmentStructure === 'Composite'}
                        onChange={() => setEditAssessmentStructure('Composite')}
                        className="text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span className="font-bold text-xs text-slate-800 dark:text-slate-200">Composite</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer select-none">
                      <input
                        type="radio"
                        name="edit_assessment_structure"
                        value="Standalone"
                        checked={editAssessmentStructure === 'Standalone'}
                        onChange={() => setEditAssessmentStructure('Standalone')}
                        className="text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span className="font-bold text-xs text-slate-800 dark:text-slate-200">Standalone</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Error Display */}
              {updateError && (
                <div className="bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800/80 text-rose-800 dark:text-rose-200 p-3 rounded-xl text-xs font-semibold flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-600 dark:text-rose-400" />
                  <span>{updateError}</span>
                </div>
              )}

              {/* Modal Footer */}
              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={() => {
                    setExamToEdit(null);
                    setUpdateError(null);
                  }}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-lg transition disabled:opacity-50 cursor-pointer border border-transparent dark:border-slate-700"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isUpdating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-white" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE DIALOG MODAL */}
      {examToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-start space-x-3.5 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">Delete Assessment?</h3>
                <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold mt-0.5">
                  Permanent Administrative Action
                </p>
              </div>
            </div>

            {/* Target Examination Summary Details */}
            <div className="space-y-3.5 text-xs text-slate-700 dark:text-slate-300">
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl p-3.5 space-y-2">
                <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                  {getDisplayExamName(examToDelete.exam_name)}
                </p>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-400 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                  <div>
                    <span className="font-semibold text-slate-500 dark:text-slate-400">Term:</span> {examToDelete.term}
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500 dark:text-slate-400">Academic Year:</span> {examToDelete.year}
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500 dark:text-slate-400">Assessment Type:</span> {getDisplayExamType(examToDelete.exam_type)}
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500 dark:text-slate-400">Maximum Marks:</span> {examToDelete.max_marks} marks
                  </div>
                  {(examToDelete.created_at || examToDelete.date_created) && (
                    <div className="col-span-2">
                      <span className="font-semibold text-slate-500 dark:text-slate-400">Created:</span>{' '}
                      {formatAssessmentCreationDate(examToDelete.created_at || examToDelete.date_created)}
                    </div>
                  )}
                  <div className="col-span-2 flex items-center space-x-1 mt-1">
                    <span className="font-semibold text-slate-500 dark:text-slate-400">Current Status:</span>{' '}
                    <span className={`font-bold px-2 py-0.5 rounded-full text-[10px] ${
                      examToDelete.status === 'Approved'
                        ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300'
                        : examToDelete.status === 'Provisional'
                        ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
                    }`}>
                      {examToDelete.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Warnings & Notices */}
              {examToDelete.status === 'Approved' ? (
                <div className="bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800/80 rounded-xl p-3 flex items-start space-x-2.5 text-amber-900 dark:text-amber-200">
                  <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-bold text-amber-950 dark:text-amber-100">Assessment is Locked</p>
                    <p className="text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed font-medium">
                      This assessment is officially approved and locked. It cannot be deleted. Re-open it to Draft if corrections are required.
                    </p>
                  </div>
                </div>
              ) : examToDelete.status === ('Archived' as any) ? (
                <div className="bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800/80 rounded-xl p-3 flex items-start space-x-2.5 text-amber-900 dark:text-amber-200">
                  <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-bold text-amber-950 dark:text-amber-100">Assessment is Archived</p>
                    <p className="text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed font-medium">
                      Archived assessments cannot be deleted because they are historical academic records.
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300 leading-relaxed">
                  Deleting this assessment may permanently remove assessment records associated with it. This action cannot be undone.
                </p>
              )}

              {deleteError && (
                <div className="bg-rose-100 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800/80 text-rose-900 dark:text-rose-200 p-2.5 rounded-xl text-xs font-semibold flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-600 dark:text-rose-400" />
                  <span>{deleteError}</span>
                </div>
              )}
            </div>

            {/* Modal Footer Buttons */}
            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => {
                  setExamToDelete(null);
                  setDeleteError(null);
                  setConfirmedApproved(false);
                }}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-lg transition disabled:opacity-50 cursor-pointer border border-transparent dark:border-slate-700"
              >
                {examToDelete.status === 'Approved' || examToDelete.status === ('Archived' as any) ? 'Close' : 'Cancel'}
              </button>

              {examToDelete.status !== 'Approved' && examToDelete.status !== ('Archived' as any) && (
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmDelete}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-md transition flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isDeleting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-white" />
                      <span>Deleting Assessment...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Delete Assessment</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

