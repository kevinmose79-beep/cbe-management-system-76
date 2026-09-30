import { describe, it, expect } from 'vitest';
import { sanitizeSubject, deduplicateSubjectList } from '../lib/storage';
import { getApplicableSubjectsForGrade, Subject } from '../types';

describe('Agriculture Cross-Phase Availability & Sanitation Invariant', () => {
  const canonicalAgricultureId = 'a9bf02ee-5e4e-46fa-b7d5-39f77657821f';

  it('correctly sanitizes Agriculture from Supabase database record preserving Grade 4–9', () => {
    const rawDbAgriculture: Subject = {
      id: canonicalAgricultureId,
      subject_name: 'Agriculture',
      subject_code: 'AGN',
      category: 'Core',
      learning_area: 'Grade 4–9',
    } as any;

    const sanitized = sanitizeSubject(rawDbAgriculture);

    expect(sanitized.id).toBe(canonicalAgricultureId);
    expect(sanitized.subject_code).toBe('AGN');
    expect(sanitized.subject_name).toBe('Agriculture');
    expect(sanitized.education_level).toBe('Grade 4–9');
    expect(sanitized.applicable_grades).toEqual([
      'Grade 4',
      'Grade 5',
      'Grade 6',
      'Grade 7',
      'Grade 8',
      'Grade 9',
    ]);
  });

  it('idempotently repairs legacy cached Agriculture with Junior School to Grade 4–9 for canonical ID', () => {
    const staleCachedAgriculture: Subject = {
      id: canonicalAgricultureId,
      subject_name: 'Agriculture',
      subject_code: 'AGN',
      category: 'Core',
      education_level: 'Junior School',
      applicable_grades: ['Grade 7', 'Grade 8', 'Grade 9'],
    };

    const sanitized = sanitizeSubject(staleCachedAgriculture);

    expect(sanitized.id).toBe(canonicalAgricultureId);
    expect(sanitized.education_level).toBe('Grade 4–9');
    expect(sanitized.applicable_grades).toEqual([
      'Grade 4',
      'Grade 5',
      'Grade 6',
      'Grade 7',
      'Grade 8',
      'Grade 9',
    ]);
  });

  it('resolves Agriculture via getApplicableSubjectsForGrade for Upper Primary (Grades 4, 5, 6)', () => {
    const sanitizedAgriculture = sanitizeSubject({
      id: canonicalAgricultureId,
      subject_name: 'Agriculture',
      subject_code: 'AGN',
      category: 'Core',
      learning_area: 'Grade 4–9',
    } as any);

    for (const grade of ['Grade 4', 'Grade 5', 'Grade 6']) {
      const applicable = getApplicableSubjectsForGrade(grade, [sanitizedAgriculture]);
      expect(applicable.length).toBe(1);
      expect(applicable[0].id).toBe(canonicalAgricultureId);
      expect(applicable[0].subject_code).toBe('AGN');
      expect(applicable[0].education_level).toBe('Upper Primary');
    }
  });

  it('resolves Agriculture via getApplicableSubjectsForGrade for Junior School (Grades 7, 8, 9)', () => {
    const sanitizedAgriculture = sanitizeSubject({
      id: canonicalAgricultureId,
      subject_name: 'Agriculture',
      subject_code: 'AGN',
      category: 'Core',
      learning_area: 'Grade 4–9',
    } as any);

    for (const grade of ['Grade 7', 'Grade 8', 'Grade 9']) {
      const applicable = getApplicableSubjectsForGrade(grade, [sanitizedAgriculture]);
      expect(applicable.length).toBe(1);
      expect(applicable[0].id).toBe(canonicalAgricultureId);
      expect(applicable[0].subject_code).toBe('AGN');
      expect(applicable[0].education_level).toBe('Junior School');
    }
  });

  it('deduplicates subject lists while preserving canonical Agriculture UUID', () => {
    const list: Subject[] = [
      {
        id: 'sb_agn',
        subject_name: 'Agriculture',
        subject_code: 'AGN',
        category: 'Core',
        education_level: 'Grade 4–9',
        applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9'],
      },
      {
        id: canonicalAgricultureId,
        subject_name: 'Agriculture',
        subject_code: 'AGN',
        category: 'Core',
        education_level: 'Grade 4–9',
        applicable_grades: ['Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9'],
      },
    ];

    const deduplicated = deduplicateSubjectList(list);
    expect(deduplicated.length).toBe(1);
    expect(deduplicated[0].id).toBe(canonicalAgricultureId);
    expect(deduplicated[0].subject_code).toBe('AGN');
  });
});
