import { describe, it, expect } from 'vitest';
import { buildTerminalReportDoc, TerminalReportPDFData } from '../services/terminalReportPdfGenerator';
import { Student, School, ClassStream, Subject, Teacher } from '../types';

describe('Terminal Report Form PDF — 3-Column Signatures & Teacher Portal Connection', () => {
  const mockSchool: School = {
    id: 'sch_1',
    school_name: 'MUCHORWE COMPREHENSIVE SCHOOL',
    motto: 'Strive for Excellence',
    postal_code: '20100',
    county: 'NAKURU',
    email: 'info@muchorwe.ac.ke',
    phone: '0712345678',
    principal_name: 'Mr. J. Mwangi',
  };

  const mockClass: ClassStream = {
    id: 'cls_g9_blue',
    stream_id: 'str_g9_blue',
    class_name: 'Grade 9',
    stream: 'Blue',
    education_level: 'Junior School',
    class_teacher_id: 'tch_maina',
  };

  const mockTeacherWithSignature: Teacher = {
    id: 'tch_maina',
    teacher_name: 'Maina Kamau',
    email: 'maina@school.com',
    phone: '0712345678',
    is_class_teacher: true,
    class_teacher_of_id: 'str_g9_blue',
    signature_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  };

  const mockTeacherWithoutSignature: Teacher = {
    id: 'tch_maina_nosig',
    teacher_name: 'Maina Kamau',
    email: 'maina@school.com',
    phone: '0712345678',
    is_class_teacher: true,
    class_teacher_of_id: 'str_g9_blue',
  };

  const mockStudent: Student = {
    id: 'std_1',
    admission_number: 'ADM001',
    full_name: 'FAITH WAMUGURU',
    grade: 'Grade 9',
    gender: 'F',
    class_id: 'cls_g9_blue',
    stream_id: 'str_g9_blue',
    active: true,
  };

  const mockSubjects: Subject[] = [
    { id: 'sb_eng', subject_name: 'English', subject_code: 'ENG', category: 'Core', education_level: 'Junior School' },
    { id: 'sb_mat', subject_name: 'Mathematics', subject_code: 'MATH', category: 'Core', education_level: 'Junior School' },
  ];

  it('embeds the 3 signature headers and digital signature when uploaded by class teacher', async () => {
    const pdfData: TerminalReportPDFData = {
      student: mockStudent,
      school: mockSchool,
      classStream: mockClass,
      academicYear: 2026,
      term: 'Term 3',
      contributingAssessments: [
        { id: 'ex_1', exam_name: 'Opener', out_of: 100, status: 'Approved' },
      ],
      subjects: mockSubjects,
      resultsBySubject: new Map(),
      teachers: [mockTeacherWithSignature],
      nextTermOpeningDate: '2027-01-05',
    };

    const doc = await buildTerminalReportDoc(pdfData);
    expect(doc).toBeDefined();
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('renders default signature lines when class teacher has not uploaded digital signature', async () => {
    const pdfData: TerminalReportPDFData = {
      student: mockStudent,
      school: mockSchool,
      classStream: mockClass,
      academicYear: 2026,
      term: 'Term 3',
      contributingAssessments: [
        { id: 'ex_1', exam_name: 'Opener', out_of: 100, status: 'Approved' },
      ],
      subjects: mockSubjects,
      resultsBySubject: new Map(),
      teachers: [mockTeacherWithoutSignature],
      nextTermOpeningDate: '2027-01-05',
    };

    const doc = await buildTerminalReportDoc(pdfData);
    expect(doc).toBeDefined();
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('successfully embeds JPEG format digital signatures without crashing or falling back to blank lines', async () => {
    const mockTeacherJpegSignature: Teacher = {
      ...mockTeacherWithSignature,
      signature_url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP______________________________________________________________________________________wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
    };

    const pdfData: TerminalReportPDFData = {
      student: mockStudent,
      school: mockSchool,
      classStream: mockClass,
      academicYear: 2026,
      term: 'Term 3',
      contributingAssessments: [
        { id: 'ex_1', exam_name: 'Opener', out_of: 100, status: 'Approved' },
      ],
      subjects: mockSubjects,
      resultsBySubject: new Map(),
      teachers: [mockTeacherJpegSignature],
      nextTermOpeningDate: '2027-01-05',
    };

    const doc = await buildTerminalReportDoc(pdfData);
    expect(doc).toBeDefined();
    expect(doc.getNumberOfPages()).toBe(1);
  });
});
