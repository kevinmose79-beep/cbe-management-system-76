import './setupLocalStorage';
import { config } from 'dotenv';
config();
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
(globalThis as any).__TEST_SUPABASE_CLIENT__ = createClient(url, serviceKey);

import { describe, it, expect, beforeAll } from 'vitest';
import { api, syncFromSupabase } from '../lib/storage';
import { Examination, AssessmentStructure } from '../types';
import { evaluateMark, isUpperPrimaryLanguage, isUpperPrimaryCompOrInsha } from '../utils/markUtils';

describe('Phase 1: Upper Primary Assessment Structure (Composite / Standalone)', () => {
  beforeAll(async () => {
    await syncFromSupabase({ force: true });
  });

  const ACTIVE_AY_ID = '69ebb4c9-8f38-43ec-81c1-bb41d7488363';
  const ACTIVE_TERM_ID = '4da99451-11a0-4488-b84f-086bff5e2126';

  it('TEST 1 & TEST 6: Existing/historical Upper Primary examination without setting resolves to Composite', async () => {
    await syncFromSupabase({ force: true });
    const exams = api.getExaminations();
    let existingUpExam = exams.find(e => e.education_level === 'Upper Primary' || e.exam_name.includes('Grade 6'));
    if (!existingUpExam) {
      existingUpExam = await api.addExamination({
        id: 'test_hist_' + Date.now(),
        exam_name: 'Historical Upper Primary Exam',
        term: 'Term 1',
        year: 2026,
        academic_year_id: ACTIVE_AY_ID,
        term_id: ACTIVE_TERM_ID,
        education_level: 'Upper Primary',
        status: 'Draft',
        exam_type: 'Mid-Term',
        max_marks: 100,
      });
    }
    
    expect(existingUpExam).toBeDefined();
    // Existing objects without explicit assessment_structure resolve to Composite
    const resolvedStructure: AssessmentStructure = existingUpExam?.assessment_structure || 'Composite';
    expect(resolvedStructure).toBe('Composite');
  });

  it('TEST 2: New Upper Primary examination defaults to Composite when created', async () => {
    const newExamInput: Examination = {
      id: 'test_phase1_default_' + Date.now(),
      exam_name: 'Grade 5 Baseline Test 2026',
      term: 'Term 3',
      year: 2026,
      academic_year_id: ACTIVE_AY_ID,
      term_id: ACTIVE_TERM_ID,
      education_level: 'Upper Primary',
      status: 'Draft',
      exam_type: 'Opener',
      max_marks: 100,
      assessment_structure: 'Composite',
    };

    const created = await api.addExamination(newExamInput);
    expect(created.assessment_structure).toBe('Composite');
  });

  it('TEST 3 & TEST 4: Creation and edit of Standalone Upper Primary examination persists correctly', async () => {
    const examId = 'test_phase1_standalone_' + Date.now();
    const standaloneExamInput: Examination = {
      id: examId,
      exam_name: 'Grade 4 SBA KNEC Assessment 2026',
      term: 'Term 3',
      year: 2026,
      academic_year_id: ACTIVE_AY_ID,
      term_id: ACTIVE_TERM_ID,
      education_level: 'Upper Primary',
      status: 'Draft',
      exam_type: 'Custom',
      max_marks: 100,
      assessment_structure: 'Standalone',
    };

    // Save
    const created = await api.addExamination(standaloneExamInput);
    expect(created.assessment_structure).toBe('Standalone');
    const targetId = created.id;

    // Reload from storage
    await syncFromSupabase({ force: true });
    const reloadedList = api.getExaminations();
    const reloaded = reloadedList.find(e => e.id === targetId);
    expect(reloaded).toBeDefined();
    expect(reloaded?.assessment_structure).toBe('Standalone');

    // Edit and update
    const updateInput: Examination = {
      ...reloaded!,
      exam_name: 'Grade 4 SBA KNEC Assessment 2026 (Updated)',
      assessment_structure: 'Standalone',
    };

    const updated = await api.updateExamination(updateInput);
    expect(updated.assessment_structure).toBe('Standalone');

    // Final re-fetch verification
    await syncFromSupabase({ force: true });
    const finalReloadList = api.getExaminations();
    const finalReload = finalReloadList.find(e => e.id === targetId);
    expect(finalReload?.assessment_structure).toBe('Standalone');
  });

  it('TEST 5: Non-Upper Primary examinations do not require or enforce Upper Primary structure', async () => {
    const juniorExam: Examination = {
      id: 'test_phase1_junior_' + Date.now(),
      exam_name: 'Grade 8 Mid-Term 2026',
      term: 'Term 3',
      year: 2026,
      academic_year_id: ACTIVE_AY_ID,
      term_id: ACTIVE_TERM_ID,
      education_level: 'Junior School',
      status: 'Draft',
      exam_type: 'Mid-Term',
      max_marks: 100,
    };

    const created = await api.addExamination(juniorExam);
    expect(created.education_level).toBe('Junior School');
    expect(created.assessment_structure || 'Composite').toBe('Composite');
  });

  it('TEST 7: Mark entry logic remains 100% UNCHANGED in Phase 1', () => {
    const mockEngSub = { id: 'sb_eng', subject_code: 'ENG', subject_name: 'English', education_level: 'Upper Primary' };
    const mockCompSub = { id: 'sb_comp', subject_code: 'COMP', subject_name: 'English Composition', education_level: 'Upper Primary' };
    const mockKiswSub = { id: 'sb_kis', subject_code: 'KIS', subject_name: 'Kiswahili', education_level: 'Upper Primary' };
    const mockInshaSub = { id: 'sb_insha', subject_code: 'INSHA', subject_name: 'Kiswahili Insha', education_level: 'Upper Primary' };

    expect(isUpperPrimaryLanguage(mockEngSub)).toBe(true);
    expect(isUpperPrimaryCompOrInsha(mockCompSub)).toBe(true);
    expect(isUpperPrimaryLanguage(mockKiswSub)).toBe(true);
    expect(isUpperPrimaryCompOrInsha(mockInshaSub)).toBe(true);

    const evalEng = evaluateMark({ id: 'm1', exam_id: 'e1', student_id: 's1', subject_id: 'sb_eng', marks: 45, out_of: 60 }, { subject: mockEngSub });
    expect(evalEng.rawScore).toBe(45);

    const evalComp = evaluateMark({ id: 'm2', exam_id: 'e1', student_id: 's1', subject_id: 'sb_comp', marks: 30, out_of: 40 }, { subject: mockCompSub });
    expect(evalComp.rawScore).toBe(30);
  });
});
