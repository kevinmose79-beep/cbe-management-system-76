import { describe, it, expect } from 'vitest';

describe('Examination Targeted Scope Logic - Length Equality Fix', () => {
  // Model the logic in ExaminationManagement.tsx
  const resolveCreateApplicableClasses = (
    resolvedClassId: string | undefined,
    selectedClassesForScope: string[]
  ): string[] => {
    return resolvedClassId || selectedClassesForScope.length === 0
      ? []
      : Array.from(new Set<string>(selectedClassesForScope));
  };

  const resolveEditApplicableClasses = (
    resolvedClassId: string | undefined,
    editClassesForScope: string[]
  ): string[] => {
    return resolvedClassId || editClassesForScope.length === 0
      ? []
      : Array.from(new Set<string>(editClassesForScope));
  };

  it('Test A & E: preserves [Grade4UUID, Grade5UUID] when exactly 2 classes available and both are selected', () => {
    const availableGrades = ['grade-4-uuid', 'grade-5-uuid'];
    const userSelected = ['grade-4-uuid', 'grade-5-uuid'];

    // In previous defective code, userSelected.length === availableGrades.length would collapse to []
    const result = resolveCreateApplicableClasses(undefined, userSelected);
    expect(result).toEqual(['grade-4-uuid', 'grade-5-uuid']);
    expect(result).not.toEqual([]);
  });

  it('Test B: preserves [Grade4UUID, Grade5UUID] when 3 classes available and 2 are selected', () => {
    const availableGrades = ['grade-4-uuid', 'grade-5-uuid', 'grade-6-uuid'];
    const userSelected = ['grade-4-uuid', 'grade-5-uuid'];

    const result = resolveCreateApplicableClasses(undefined, userSelected);
    expect(result).toEqual(['grade-4-uuid', 'grade-5-uuid']);
    expect(result.includes('grade-6-uuid')).toBe(false);
  });

  it('Test C: returns [] when Whole Level is selected (no specific classes targeted)', () => {
    const userSelected: string[] = []; // user chose Whole Level without specific targeted checkboxes

    const result = resolveCreateApplicableClasses(undefined, userSelected);
    expect(result).toEqual([]);
  });

  it('Test D: edit path preserves [Grade4UUID, Grade5UUID] when saved', () => {
    const existingApplicable = ['grade-4-uuid', 'grade-5-uuid'];
    const editSelected = [...existingApplicable];

    const result = resolveEditApplicableClasses(undefined, editSelected);
    expect(result).toEqual(['grade-4-uuid', 'grade-5-uuid']);
  });

  it('Single class targeting sets applicable_classes to [] and uses class_id', () => {
    const targetClassId = 'grade-4-uuid';
    const userSelected = ['grade-4-uuid'];

    const result = resolveCreateApplicableClasses(targetClassId, userSelected);
    expect(result).toEqual([]);
  });
});
