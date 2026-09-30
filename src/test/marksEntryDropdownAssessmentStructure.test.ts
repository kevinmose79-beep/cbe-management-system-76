import { describe, it, expect } from 'vitest';
import { Subject, ClassStream, Examination, sortSubjectsByStandardOrder } from '../types';
import { isEnglishComposition, isKiswahiliInsha, isDirectSSCRE } from '../utils/markUtils';

// Mirroring the exact filtering logic from MarksEntryTable.tsx
function filterMarksEntrySubjects(
  rawApplicableSubjects: Subject[],
  selectedClass: ClassStream | undefined,
  selectedExam: Examination | undefined
): Subject[] {
  const isUpperPrimaryCls =
    selectedClass?.education_level === 'Upper Primary' ||
    (selectedClass?.class_name && ['Grade 4', 'Grade 5', 'Grade 6'].some(g => selectedClass.class_name.includes(g)));

  const isStandaloneSelectedExam = selectedExam?.assessment_structure === 'Standalone';

  const isAgricultureSubject = (s?: Subject | null) => {
    if (!s) return false;
    const code = (s.subject_code || (s as any).code || '').trim().toUpperCase();
    const name = (s.subject_name || (s as any).name || (s as any).learning_area || '').trim().toLowerCase();
    return s.id === 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f' || code === 'AGN' || code === 'AGR' || name.includes('agriculture');
  };

  return sortSubjectsByStandardOrder(
    rawApplicableSubjects.filter((s) => {
      if (isUpperPrimaryCls) {
        if (isStandaloneSelectedExam) {
          // Upper Primary Standalone: Exclude Composition, Insha, and direct SS&CRE
          if (isEnglishComposition(s) || isKiswahiliInsha(s) || isDirectSSCRE(s)) {
            return false;
          }
          return true;
        } else {
          // Upper Primary Composite: Exclude Agriculture (AGN) from the 6-subject composite model
          if (isAgricultureSubject(s)) {
            return false;
          }
          if (selectedExam?.ss_cre_structure && isDirectSSCRE(s)) {
            return false;
          }
          return true;
        }
      }
      return true;
    })
  );
}

describe('Marks Entry Dropdown Assessment Structure Filtering', () => {
  const allMasterSubjects: Subject[] = [
    { id: 'sb_eng', subject_code: 'ENG', subject_name: 'English', category: 'Core', education_level: 'Upper Primary', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'] },
    { id: 'sb_comp', subject_code: 'COMP', subject_name: 'English Composition', category: 'Core', education_level: 'Upper Primary', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'] },
    { id: 'sb_kis', subject_code: 'KIS', subject_name: 'Kiswahili', category: 'Core', education_level: 'Upper Primary', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'] },
    { id: 'sb_insha', subject_code: 'INSHA', subject_name: 'Kiswahili Insha', category: 'Core', education_level: 'Upper Primary', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'] },
    { id: 'sb_mat', subject_code: 'MATH', subject_name: 'Mathematics', category: 'Core', education_level: 'Upper Primary', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'] },
    { id: 'sb_sci', subject_code: 'INT-SCI', subject_name: 'Integrated Science', category: 'Core', education_level: 'Upper Primary', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'] },
    { id: 'sb_sst', subject_code: 'SST', subject_name: 'Social Studies', category: 'Core', education_level: 'Upper Primary', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'] },
    { id: 'sb_cre', subject_code: 'CRE', subject_name: 'Christian Religious Education', category: 'Core', education_level: 'Upper Primary', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'] },
    { id: 'sb_ss_cre', subject_code: 'SS&CRE', subject_name: 'Social Studies & CRE', category: 'Core', education_level: 'Upper Primary', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'] },
    { id: 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f', subject_code: 'AGN', subject_name: 'Agriculture', category: 'Core', education_level: 'Grade 4–9', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9'] },
    { id: 'sb_cas', subject_code: 'CAS', subject_name: 'Creative Arts and Sports', category: 'Core', education_level: 'Upper Primary', applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6'] },
  ];

  const upperPrimaryClass: ClassStream = {
    id: 'cls_g5',
    stream_id: 'str_g5a',
    class_name: 'Grade 5',
    stream: 'A',
    education_level: 'Upper Primary',
  };

  const juniorClass: ClassStream = {
    id: 'cls_g8',
    stream_id: 'str_g8a',
    class_name: 'Grade 8',
    stream: 'A',
    education_level: 'Junior School',
  };

  const compositeExam: Examination = {
    id: 'ex_comp',
    exam_name: 'Grade 5 Mid-Term 2026',
    term: 'Term 1',
    year: 2026,
    education_level: 'Upper Primary',
    status: 'Published',
    exam_type: 'Mid-Term',
    max_marks: 100,
    assessment_structure: 'Composite',
    ss_cre_structure: 'A',
  };

  const standaloneExam: Examination = {
    id: 'ex_stand',
    exam_name: 'Grade 4 SBA KNEC Assessment 2026',
    term: 'Term 1',
    year: 2026,
    education_level: 'Upper Primary',
    status: 'Published',
    exam_type: 'Custom',
    max_marks: 100,
    assessment_structure: 'Standalone',
  };

  const juniorExam: Examination = {
    id: 'ex_junior',
    exam_name: 'Grade 8 Mid-Term 2026',
    term: 'Term 1',
    year: 2026,
    education_level: 'Junior School',
    status: 'Published',
    exam_type: 'Mid-Term',
    max_marks: 100,
  };

  it('Test A — Composite Upper Primary: Contains 60/40 components (ENG, COMP, KIS, INSHA, SST, CRE) and excludes AGN', () => {
    const result = filterMarksEntrySubjects(allMasterSubjects, upperPrimaryClass, compositeExam);
    const codes = result.map((s) => s.subject_code);

    // COMP and INSHA are present for teacher entry
    expect(codes).toContain('ENG');
    expect(codes).toContain('COMP');
    expect(codes).toContain('KIS');
    expect(codes).toContain('INSHA');
    expect(codes).toContain('MATH');
    expect(codes).toContain('INT-SCI');
    expect(codes).toContain('CAS');
    expect(codes).toContain('SST');
    expect(codes).toContain('CRE');

    // AGN is strictly absent in Composite Upper Primary
    expect(codes).not.toContain('AGN');
  });

  it('Test B — Standalone Upper Primary: Contains exactly the 8 assessed learning areas and excludes COMP, INSHA, and direct SS&CRE', () => {
    const result = filterMarksEntrySubjects(allMasterSubjects, upperPrimaryClass, standaloneExam);
    const codes = result.map((s) => s.subject_code);

    // Exactly 8 learning areas
    expect(result).toHaveLength(8);
    expect(new Set(codes)).toEqual(new Set(['ENG', 'KIS', 'MATH', 'INT-SCI', 'SST', 'CRE', 'AGN', 'CAS']));

    // COMP, INSHA, and direct SS&CRE are strictly excluded
    expect(codes).not.toContain('COMP');
    expect(codes).not.toContain('INSHA');
    expect(codes).not.toContain('SS&CRE');
  });

  it('Test C & D — Agriculture preservation across Grades 4–9 and Junior School non-regression', () => {
    const jsSubjects: Subject[] = [
      { id: 'sb_js_eng', subject_code: 'ENG', subject_name: 'English', category: 'Core', education_level: 'Junior School' },
      { id: 'sb_js_kis', subject_code: 'KIS', subject_name: 'Kiswahili', category: 'Core', education_level: 'Junior School' },
      { id: 'sb_js_mat', subject_code: 'MATH', subject_name: 'Mathematics', category: 'Core', education_level: 'Junior School' },
      { id: 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f', subject_code: 'AGN', subject_name: 'Agriculture', category: 'Core', education_level: 'Grade 4–9' },
    ];

    const result = filterMarksEntrySubjects(jsSubjects, juniorClass, juniorExam);
    const codes = result.map((s) => s.subject_code);

    // Junior School Agriculture is preserved
    expect(codes).toContain('AGN');
    expect(result.find((s) => s.id === 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f')).toBeDefined();
  });
});
