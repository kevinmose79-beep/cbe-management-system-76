import { describe, it, expect } from 'vitest';
import {
  getUpperPrimaryCanonicalSubjects,
  calculateLearnerTerminalResults,
  ContributingAssessmentRef,
} from '../services/terminalResultsEngine';
import {
  buildTerminalReportDoc,
  TerminalReportPDFData,
} from '../services/terminalReportPdfGenerator';
import { Student, School, ClassStream, Subject, Mark, Grade } from '../types';

describe('Phase 2 — Upper Primary Terminal Results Web UI / PDF Canonical Structure', () => {
  const upperPrimarySubjects: Subject[] = [
    { id: 'sb_up_eng_lang', subject_name: 'English Language', subject_code: 'ENG_LANG', category: 'Core' },
    { id: 'sb_up_eng_comp', subject_name: 'English Composition', subject_code: 'ENG_COMP', category: 'Core' },
    { id: 'sb_up_kisw_lugha', subject_name: 'Kiswahili Lugha', subject_code: 'KISW_LUGHA', category: 'Core' },
    { id: 'sb_up_kisw_insha', subject_name: 'Kiswahili Insha', subject_code: 'KISW_INSHA', category: 'Core' },
    { id: 'sb_up_math', subject_name: 'Mathematics', subject_code: 'MATH', category: 'Core' },
    { id: 'sb_up_science', subject_name: 'Integrated Science', subject_code: 'INT-SCI', category: 'Core' },
    { id: 'sb_up_arts', subject_name: 'Creative Arts and Sports', subject_code: 'CAS', category: 'Core' },
    { id: 'sb_up_sst', subject_name: 'Social Studies', subject_code: 'SST', category: 'Core' },
    { id: 'sb_up_cre', subject_name: 'Christian Religious Education', subject_code: 'CRE', category: 'Core' },
    { id: 'sb_up_ss_cre', subject_name: 'Social Studies & C.R.E.', subject_code: 'SS&CRE', category: 'Core' },
  ];

  const student: Student = {
    id: 'std_up_01',
    admission_number: 'ADM-601',
    first_name: 'Faith',
    last_name: 'Achieng',
    full_name: 'Faith Achieng',
    grade: 'Grade 6',
    education_level: 'Upper Primary',
    class_id: 'cls_grade_6',
    gender: 'F',
    active: true,
  };

  const classStream: ClassStream = {
    id: 'cls_grade_6',
    class_name: 'Grade 6',
    stream: 'East',
    education_level: 'Upper Primary',
  };

  const school: School = {
    id: 'sch_01',
    school_name: 'St. Teresa Primary School',
    motto: 'Excellence in Service',
    county: 'Nairobi',
    email: 'info@stteresa.ac.ke',
  };

  const contributingAssessments: ContributingAssessmentRef[] = [
    { id: 'exam_opener', exam_name: 'Opener Exam', max_marks: 100, out_of: 100 },
    { id: 'exam_midterm', exam_name: 'Mid Term Exam', max_marks: 100, out_of: 100 },
  ];

  const grades: Grade[] = [
    { id: 'g_ee', grade_code: 'EE', performance_level: 'EE', minimum_score: 76, maximum_score: 100, points: 4, remarks: 'Exceeding Expectations', descriptor: 'Exceeding Expectations' },
    { id: 'g_me', grade_code: 'ME', performance_level: 'ME', minimum_score: 51, maximum_score: 75, points: 3, remarks: 'Meeting Expectations', descriptor: 'Meeting Expectations' },
    { id: 'g_ae', grade_code: 'AE', performance_level: 'AE', minimum_score: 26, maximum_score: 50, points: 2, remarks: 'Approaching Expectations', descriptor: 'Approaching Expectations' },
    { id: 'g_be', grade_code: 'BE', performance_level: 'BE', minimum_score: 0, maximum_score: 25, points: 1, remarks: 'Below Expectations', descriptor: 'Below Expectations' },
  ];

  it('1. Canonical subjects filter reduces 10 raw subjects to exactly 6 canonical Upper Primary learning areas', () => {
    const canonical = getUpperPrimaryCanonicalSubjects(upperPrimarySubjects);
    expect(canonical).toHaveLength(6);

    const subjectNames = canonical.map((s) => s.subject_name);
    expect(subjectNames).toEqual([
      'English',
      'Kiswahili',
      'Mathematics',
      'Integrated Science',
      'Creative Arts and Sports',
      'Social Studies & C.R.E.',
    ]);
  });

  it('2. Terminal engine consolidates English (60+40), Kiswahili (60+40), and SST+CRE (30+20)', () => {
    const marks: Mark[] = [
      // Opener
      { id: 'm1', student_id: 'std_up_01', exam_id: 'exam_opener', subject_id: 'sb_up_eng_lang', score: 45, raw_score: 45, out_of: 60, marks: 45 },
      { id: 'm2', student_id: 'std_up_01', exam_id: 'exam_opener', subject_id: 'sb_up_eng_comp', score: 30, raw_score: 30, out_of: 40, marks: 30 },
      { id: 'm3', student_id: 'std_up_01', exam_id: 'exam_opener', subject_id: 'sb_up_kisw_lugha', score: 40, raw_score: 40, out_of: 60, marks: 40 },
      { id: 'm4', student_id: 'std_up_01', exam_id: 'exam_opener', subject_id: 'sb_up_kisw_insha', score: 25, raw_score: 25, out_of: 40, marks: 25 },
      { id: 'm5', student_id: 'std_up_01', exam_id: 'exam_opener', subject_id: 'sb_up_math', score: 80, raw_score: 80, out_of: 100, marks: 80 },
      { id: 'm6', student_id: 'std_up_01', exam_id: 'exam_opener', subject_id: 'sb_up_science', score: 70, raw_score: 70, out_of: 100, marks: 70 },
      { id: 'm7', student_id: 'std_up_01', exam_id: 'exam_opener', subject_id: 'sb_up_arts', score: 85, raw_score: 85, out_of: 100, marks: 85 },
      { id: 'm8', student_id: 'std_up_01', exam_id: 'exam_opener', subject_id: 'sb_up_sst', score: 24, raw_score: 24, out_of: 30, marks: 24 },
      { id: 'm9', student_id: 'std_up_01', exam_id: 'exam_opener', subject_id: 'sb_up_cre', score: 16, raw_score: 16, out_of: 20, marks: 16 },

      // Midterm
      { id: 'm10', student_id: 'std_up_01', exam_id: 'exam_midterm', subject_id: 'sb_up_eng_lang', score: 48, raw_score: 48, out_of: 60, marks: 48 },
      { id: 'm11', student_id: 'std_up_01', exam_id: 'exam_midterm', subject_id: 'sb_up_eng_comp', score: 32, raw_score: 32, out_of: 40, marks: 32 },
      { id: 'm12', student_id: 'std_up_01', exam_id: 'exam_midterm', subject_id: 'sb_up_kisw_lugha', score: 45, raw_score: 45, out_of: 60, marks: 45 },
      { id: 'm13', student_id: 'std_up_01', exam_id: 'exam_midterm', subject_id: 'sb_up_kisw_insha', score: 28, raw_score: 28, out_of: 40, marks: 28 },
      { id: 'm14', student_id: 'std_up_01', exam_id: 'exam_midterm', subject_id: 'sb_up_math', score: 85, raw_score: 85, out_of: 100, marks: 85 },
      { id: 'm15', student_id: 'std_up_01', exam_id: 'exam_midterm', subject_id: 'sb_up_science', score: 75, raw_score: 75, out_of: 100, marks: 75 },
      { id: 'm16', student_id: 'std_up_01', exam_id: 'exam_midterm', subject_id: 'sb_up_arts', score: 90, raw_score: 90, out_of: 100, marks: 90 },
      { id: 'm17', student_id: 'std_up_01', exam_id: 'exam_midterm', subject_id: 'sb_up_sst', score: 26, raw_score: 26, out_of: 30, marks: 26 },
      { id: 'm18', student_id: 'std_up_01', exam_id: 'exam_midterm', subject_id: 'sb_up_cre', score: 18, raw_score: 18, out_of: 20, marks: 18 },
    ];

    const canonical = getUpperPrimaryCanonicalSubjects(upperPrimarySubjects);
    const results = calculateLearnerTerminalResults({
      learnerId: student.id,
      subjectIds: canonical.map((s) => s.id),
      contributingAssessments,
      marks,
      grades,
      educationLevel: 'Upper Primary',
      gradeName: 'Grade 6',
      subjects: upperPrimarySubjects,
    });

    // Verify all 6 canonical subjects have complete results
    for (const cSub of canonical) {
      const res = results.get(cSub.id);
      expect(res, `Result for ${cSub.subject_name} (${cSub.id}) should exist`).toBeDefined();
      expect(res?.isComplete, `Result for ${cSub.subject_name} should be complete`).toBe(true);
    }

    // English: Opener (45+30=75%), Midterm (48+32=80%) -> Mean: (75+80)/2 = 77.5 -> 78% (EE, 4 pts)
    const engRes = results.get('sb_up_eng') || results.get(canonical[0].id);
    expect(engRes).toBeDefined();
    expect(engRes?.isComplete).toBe(true);
    expect(engRes?.terminalPercentage).toBe(78);
    expect(engRes?.cbePerformanceLevel).toBe('EE');
    expect(engRes?.points).toBe(4);

    // Kiswahili: Opener (40+25=65%), Midterm (45+28=73%) -> Mean: (65+73)/2 = 69% (ME, 3 pts)
    const kiswRes = results.get('sb_up_kisw') || results.get(canonical[1].id);
    expect(kiswRes).toBeDefined();
    expect(kiswRes?.isComplete).toBe(true);
    expect(kiswRes?.terminalPercentage).toBe(69);
    expect(kiswRes?.cbePerformanceLevel).toBe('ME');
    expect(kiswRes?.points).toBe(3);

    // SST + CRE: Opener (24+16=40/50 = 80%), Midterm (26+18=44/50 = 88%) -> Mean: (80+88)/2 = 84% (EE, 4 pts)
    const sstCreRes = results.get('sb_up_ss_cre') || results.get(canonical[5].id);
    expect(sstCreRes).toBeDefined();
    expect(sstCreRes?.isComplete).toBe(true);
    expect(sstCreRes?.terminalPercentage).toBe(84);
    expect(sstCreRes?.cbePerformanceLevel).toBe('EE');
    expect(sstCreRes?.points).toBe(4);
  });

  it('3. PDF Generator generates valid document for Upper Primary with 6 canonical learning areas and summary', async () => {
    const canonical = getUpperPrimaryCanonicalSubjects(upperPrimarySubjects);
    const marks: Mark[] = [
      { id: 'm1', student_id: 'std_up_01', exam_id: 'exam_opener', subject_id: 'sb_up_eng_lang', score: 45, raw_score: 45, out_of: 60, marks: 45 },
      { id: 'm2', student_id: 'std_up_01', exam_id: 'exam_opener', subject_id: 'sb_up_eng_comp', score: 30, raw_score: 30, out_of: 40, marks: 30 },
      { id: 'm3', student_id: 'std_up_01', exam_id: 'exam_opener', subject_id: 'sb_up_kisw_lugha', score: 40, raw_score: 40, out_of: 60, marks: 40 },
      { id: 'm4', student_id: 'std_up_01', exam_id: 'exam_opener', subject_id: 'sb_up_kisw_insha', score: 25, raw_score: 25, out_of: 40, marks: 25 },
      { id: 'm5', student_id: 'std_up_01', exam_id: 'exam_opener', subject_id: 'sb_up_math', score: 80, raw_score: 80, out_of: 100, marks: 80 },
      { id: 'm6', student_id: 'std_up_01', exam_id: 'exam_opener', subject_id: 'sb_up_science', score: 70, raw_score: 70, out_of: 100, marks: 70 },
      { id: 'm7', student_id: 'std_up_01', exam_id: 'exam_opener', subject_id: 'sb_up_arts', score: 85, raw_score: 85, out_of: 100, marks: 85 },
      { id: 'm8', student_id: 'std_up_01', exam_id: 'exam_opener', subject_id: 'sb_up_sst', score: 24, raw_score: 24, out_of: 30, marks: 24 },
      { id: 'm9', student_id: 'std_up_01', exam_id: 'exam_opener', subject_id: 'sb_up_cre', score: 16, raw_score: 16, out_of: 20, marks: 16 },
    ];

    const results = calculateLearnerTerminalResults({
      learnerId: student.id,
      subjectIds: canonical.map((s) => s.id),
      contributingAssessments: [contributingAssessments[0]],
      marks,
      grades,
      educationLevel: 'Upper Primary',
      gradeName: 'Grade 6',
      subjects: canonical,
    });

    const pdfData: TerminalReportPDFData = {
      student,
      school,
      classStream,
      academicYear: 2026,
      term: 'Term 1',
      contributingAssessments: [contributingAssessments[0]],
      subjects: upperPrimarySubjects, // Raw 10 subjects passed
      resultsBySubject: results,
      grades,
    };

    const doc = await buildTerminalReportDoc(pdfData);
    expect(doc).toBeDefined();
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });
});
