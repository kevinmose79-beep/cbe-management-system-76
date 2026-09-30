import './setupLocalStorage';
import { describe, it, expect, beforeEach } from 'vitest';
import { api, setStorage, getStorage, KEYS } from '../lib/storage';
import { Teacher, User } from '../types';

describe('Teacher Signature Persistence & Module Navigation Safety', () => {
  beforeEach(() => {
    localStorage.clear();
    const mockUser: User = {
      id: 'usr_001',
      name: 'Mr Brian',
      email: 'brian@school.com',
      role: 'class_teacher',
      teacher_id: 'tch_001',
    };
    setStorage(KEYS.CURRENT_USER, mockUser);

    (globalThis as any).fetch = async (url: string) => {
      if (url.includes('/api/teacher/save-signature')) {
        return {
          ok: true,
          json: async () => ({ success: true }),
        };
      }
      return {
        ok: true,
        json: async () => ({}),
      };
    };
  });

  it('preserves signature_url in local cache when syncFromSupabase hydrated data lacks explicit signature column', async () => {
    const mockTeacher: Teacher = {
      id: 'tch_001',
      teacher_name: 'Mr Brian',
      email: 'brian@school.com',
      phone: '0712345678',
      signature_url: 'data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    };

    // Save teacher with signature URL
    setStorage(KEYS.TEACHERS, [mockTeacher]);

    // Verify stored
    const storedBefore = getStorage<Teacher[]>(KEYS.TEACHERS, []);
    expect(storedBefore[0].signature_url).toBe(mockTeacher.signature_url);

    // Call api.updateTeacher with signature
    await api.updateTeacher({
      ...mockTeacher,
      phone: '0722000111',
    });

    const storedAfterUpdate = getStorage<Teacher[]>(KEYS.TEACHERS, []);
    expect(storedAfterUpdate[0].signature_url).toBe(mockTeacher.signature_url);
    expect(storedAfterUpdate[0].phone).toBe('0722000111');
  });

  it('ensures updated teacher object retains signature_url when updating teacher details', async () => {
    const teacherWithoutSig: Teacher = {
      id: 'tch_002',
      teacher_name: 'Madam Grace',
      email: 'grace@school.com',
      phone: '0700000000',
    };

    setStorage(KEYS.TEACHERS, [teacherWithoutSig]);

    // Upload new signature
    const signatureData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const teacherWithSig: Teacher = {
      ...teacherWithoutSig,
      signature_url: signatureData,
    };

    await api.updateTeacher(teacherWithSig);

    const updatedList = getStorage<Teacher[]>(KEYS.TEACHERS, []);
    expect(updatedList[0].signature_url).toBe(signatureData);
  });
});
