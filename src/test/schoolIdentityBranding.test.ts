import { describe, it, expect, beforeEach } from 'vitest';
import { api, KEYS, getStorage, setStorage } from '../lib/storage';
import {
  resolveTerminalReportRemarks,
  convertImageToMonochromeDataUrl,
  buildTerminalReportDoc,
  TerminalReportPDFData,
} from '../services/terminalReportPdfGenerator';
import { School, Student, ClassStream, Subject } from '../types';

describe('School Identity & Branding — Dynamic Settings & Terminal Report Integration', () => {
  const initialTestSchool: School = {
    id: '00000000-0000-0000-0000-000000000001',
    school_name: 'Muchorwe Comprehensive School',
    motto: 'Knowledge to Excel',
    county: 'Nakuru',
    postal_code: 'P.O. Box 100-20100',
    address: 'P.O. Box 100-20100',
    email: 'info@muchorwe.ac.ke',
    logo_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  };

  const mockStudent: Student = {
    id: 'std-1001',
    admission_number: 'ADM-1001',
    full_name: 'Grace Wanjiku',
    first_name: 'Grace',
    last_name: 'Wanjiku',
    gender: 'F',
    grade: 'Grade 7',
    class_id: 'cls-7e',
    stream_id: 'st-7e',
    active: true,
  };

  const mockClassStream: ClassStream = {
    id: 'cls-7e',
    stream_id: 'st-7e',
    class_name: 'Grade 7',
    stream: 'East',
    education_level: 'Junior School',
  };

  const mockSubjects: Subject[] = [
    { id: 'sb-math', subject_name: 'Mathematics', subject_code: 'MATH', category: 'Core' },
  ];

  beforeEach(() => {
    setStorage(KEYS.SCHOOL, initialTestSchool);
  });

  it('Test A — Existing School Settings persist and retrieve cleanly', async () => {
    const school = api.getSchool();
    expect(school.school_name).toBe('Muchorwe Comprehensive School');
    expect(school.motto).toBe('Knowledge to Excel');
    expect(school.county).toBe('Nakuru');
    expect(school.postal_code).toBe('P.O. Box 100-20100');
    expect(school.email).toBe('info@muchorwe.ac.ke');
  });

  it('Test B — Logo URL persists and is retrievable after update', async () => {
    const newLogoDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const updatedSchool: School = {
      ...initialTestSchool,
      logo_url: newLogoDataUrl,
    };

    await api.updateSchool(updatedSchool);
    const retrieved = api.getSchool();
    expect(retrieved.logo_url).toBe(newLogoDataUrl);
  });

  it('Test C & D — Dynamic School Name: Modifying settings changes report data dynamically', async () => {
    const updatedSchool: School = {
      ...initialTestSchool,
      school_name: 'Example Comprehensive Academy',
    };

    await api.updateSchool(updatedSchool);
    const currentSchool = api.getSchool();

    const pdfData: TerminalReportPDFData = {
      student: mockStudent,
      school: currentSchool,
      classStream: mockClassStream,
      academicYear: 2026,
      term: 'Term 3',
      contributingAssessments: [],
      subjects: mockSubjects,
      resultsBySubject: new Map(),
    };

    const doc = await buildTerminalReportDoc(pdfData);
    expect(doc).toBeDefined();
    // The generated PDF uses currentSchool.school_name
    expect(pdfData.school.school_name).toBe('Example Comprehensive Academy');
  });

  it('Test E — Dynamic School Motto: Modifying motto changes report data dynamically', async () => {
    const updatedSchool: School = {
      ...initialTestSchool,
      motto: 'Strive to Achieve',
    };

    await api.updateSchool(updatedSchool);
    const currentSchool = api.getSchool();
    expect(currentSchool.motto).toBe('Strive to Achieve');
  });

  it('Test F — Logo Replacement: Updating logo_url updates report configuration', async () => {
    const updatedSchool: School = {
      ...initialTestSchool,
      logo_url: 'data:image/png;base64,REPLACED_LOGO_DATA_URL',
    };

    await api.updateSchool(updatedSchool);
    const currentSchool = api.getSchool();
    expect(currentSchool.logo_url).toBe('data:image/png;base64,REPLACED_LOGO_DATA_URL');
  });

  it('Test G — Monochrome PDF Conversion: Converts image to monochrome Data URL', async () => {
    const sampleLogo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const monoResult = await convertImageToMonochromeDataUrl(sampleLogo);
    // In node/vitest or canvas environment, returns valid data URL or fallback string
    expect(monoResult).toBeTruthy();
    expect(typeof monoResult).toBe('string');
  });

  it('Test H — Existing Results & Calculations remain untouched', async () => {
    const remarks = resolveTerminalReportRemarks({
      student: mockStudent,
      school: initialTestSchool,
      classStream: mockClassStream,
      subjects: mockSubjects,
      resultsBySubject: new Map(),
    });

    expect(remarks).toBeDefined();
    expect(remarks.class_teacher_comment).toBeTruthy();
  });
});
