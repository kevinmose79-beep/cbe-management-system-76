import { describe, it, expect } from 'vitest';
import { getSSCREComponentMaxMarks, getUpperPrimaryCompositeSubjectMarks } from '../utils/markUtils';
import { Mark, Subject } from '../types';

describe('Custom Upper Primary SST + CRE Structure & Calculation Suite', () => {
  describe('1. getSSCREComponentMaxMarks parsing', () => {
    it('1.1 Preserves Structure A (30/20 -> 50)', () => {
      const res = getSSCREComponentMaxMarks('A');
      expect(res).toEqual({ sstMax: 30, creMax: 20, ssCreMax: 50 });
    });

    it('1.2 Preserves Structure B (10/10 -> 20)', () => {
      const res = getSSCREComponentMaxMarks('B');
      expect(res).toEqual({ sstMax: 10, creMax: 10, ssCreMax: 20 });
    });

    it('1.3 Preserves Structure C (20/30 -> 50)', () => {
      const res = getSSCREComponentMaxMarks('C');
      expect(res).toEqual({ sstMax: 20, creMax: 30, ssCreMax: 50 });
    });

    it('1.4 Correctly parses Custom: CUSTOM:30:30 -> (30/30 -> 60)', () => {
      const res = getSSCREComponentMaxMarks('CUSTOM:30:30');
      expect(res).toEqual({ sstMax: 30, creMax: 30, ssCreMax: 60 });
    });

    it('1.5 Correctly parses Custom: CUSTOM:25:25 -> (25/25 -> 50)', () => {
      const res = getSSCREComponentMaxMarks('CUSTOM:25:25');
      expect(res).toEqual({ sstMax: 25, creMax: 25, ssCreMax: 50 });
    });

    it('1.6 Correctly parses Custom: CUSTOM:40:30 -> (40/30 -> 70)', () => {
      const res = getSSCREComponentMaxMarks('CUSTOM:40:30');
      expect(res).toEqual({ sstMax: 40, creMax: 30, ssCreMax: 70 });
    });

    it('1.7 Correctly parses Custom with lowercase prefix: custom:30:30', () => {
      const res = getSSCREComponentMaxMarks('custom:30:30');
      expect(res).toEqual({ sstMax: 30, creMax: 30, ssCreMax: 60 });
    });

    it('1.8 Safely rejects invalid or malformed Custom structures', () => {
      expect(getSSCREComponentMaxMarks('CUSTOM:0:30')).toBeNull();
      expect(getSSCREComponentMaxMarks('CUSTOM:30:0')).toBeNull();
      expect(getSSCREComponentMaxMarks('CUSTOM:-5:30')).toBeNull();
      expect(getSSCREComponentMaxMarks('CUSTOM:30:-5')).toBeNull();
      expect(getSSCREComponentMaxMarks('CUSTOM:abc:30')).toBeNull();
      expect(getSSCREComponentMaxMarks('CUSTOM:30')).toBeNull();
      expect(getSSCREComponentMaxMarks('CUSTOM:30:')).toBeNull();
      expect(getSSCREComponentMaxMarks('CUSTOM:30:20:10')).toBeNull();
      expect(getSSCREComponentMaxMarks('CUSTOM:30.5:20')).toBeNull();
      expect(getSSCREComponentMaxMarks('UNKNOWN')).toBeNull();
      expect(getSSCREComponentMaxMarks('')).toBeNull();
      expect(getSSCREComponentMaxMarks(null)).toBeNull();
      expect(getSSCREComponentMaxMarks(undefined)).toBeNull();
    });
  });

  describe('2. getUpperPrimaryCompositeSubjectMarks with Custom Structure', () => {
    const mockSubjects: Subject[] = [
      { id: 'sub_sst', subject_code: 'SST', subject_name: 'Social Studies', education_level: 'Upper Primary', category: 'Core' },
      { id: 'sub_cre', subject_code: 'CRE', subject_name: 'Christian Religious Education', education_level: 'Upper Primary', category: 'Core' },
      { id: 'sb_up_ss_cre', subject_code: 'SS_CRE', subject_name: 'Social Studies & CRE', education_level: 'Upper Primary', category: 'Core' },
    ];

    it('2.1 Correctly composites SST (27/30) and CRE (28/30) in CUSTOM:30:30 exam into 55/60 (91.67%)', () => {
      const marks: Mark[] = [
        {
          id: 'm1',
          student_id: 'std1',
          subject_id: 'sub_sst',
          exam_id: 'ex1',
          score: 27,
          out_of: 30,
          status: 'Normal',
        },
        {
          id: 'm2',
          student_id: 'std1',
          subject_id: 'sub_cre',
          exam_id: 'ex1',
          score: 28,
          out_of: 30,
          status: 'Normal',
        },
      ];

      const res = getUpperPrimaryCompositeSubjectMarks(
        marks,
        mockSubjects,
        'Upper Primary',
        'CUSTOM:30:30'
      );

      const compositeMark = res.processedMarks.find((m) => m.subject_id === 'sb_up_ss_cre' || (m as any).code === 'SS_CRE');
      expect(compositeMark).toBeDefined();
      expect(compositeMark?.score).toBe(55);
      expect(compositeMark?.out_of).toBe(60);
      expect((compositeMark as any)?.percentage).toBeCloseTo((55 / 60) * 100, 2);
    });

    it('2.2 Correctly composites SST (20/25) and CRE (22/25) in CUSTOM:25:25 exam into 42/50 (84%)', () => {
      const marks: Mark[] = [
        {
          id: 'm1',
          student_id: 'std1',
          subject_id: 'sub_sst',
          exam_id: 'ex1',
          score: 20,
          out_of: 25,
          status: 'Normal',
        },
        {
          id: 'm2',
          student_id: 'std1',
          subject_id: 'sub_cre',
          exam_id: 'ex1',
          score: 22,
          out_of: 25,
          status: 'Normal',
        },
      ];

      const res = getUpperPrimaryCompositeSubjectMarks(
        marks,
        mockSubjects,
        'Upper Primary',
        { id: 'ex1', ss_cre_structure: 'CUSTOM:25:25' } as any
      );

      const compositeMark = res.processedMarks.find((m) => m.subject_id === 'sb_up_ss_cre');
      expect(compositeMark).toBeDefined();
      expect(compositeMark?.score).toBe(42);
      expect(compositeMark?.out_of).toBe(50);
      expect((compositeMark as any)?.percentage).toBeCloseTo((42 / 50) * 100, 2);
    });

    it('2.3 Correctly handles Irregularity (Y) in Custom Structure component', () => {
      const marks: Mark[] = [
        {
          id: 'm1',
          student_id: 'std1',
          subject_id: 'sub_sst',
          exam_id: 'ex1',
          score: 0,
          out_of: 30,
          status: 'Y',
          special_status: 'Y',
        },
        {
          id: 'm2',
          student_id: 'std1',
          subject_id: 'sub_cre',
          exam_id: 'ex1',
          score: 25,
          out_of: 30,
          status: 'Normal',
        },
      ];

      const res = getUpperPrimaryCompositeSubjectMarks(
        marks,
        mockSubjects,
        'Upper Primary',
        'CUSTOM:30:30'
      );

      const compositeMark = res.processedMarks.find((m) => m.subject_id === 'sb_up_ss_cre');
      expect(compositeMark).toBeDefined();
      expect((compositeMark as any)?.special_status).toBe('Y');
    });
  });
});
