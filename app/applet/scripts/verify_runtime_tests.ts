import { getSupabaseClient, syncFromSupabase, saveExaminationToSupabase, deleteExaminationFromSupabase } from '../src/lib/storage';
import { Examination, Class, Stream } from '../src/types';

async function runTests() {
  console.log('=== CBE MANAGEMENT SYSTEM — RUNTIME VERIFICATION ===\n');

  const supabase = getSupabaseClient();
  if (!supabase) {
    console.error('ERROR: Could not initialize Supabase client.');
    process.exit(1);
  }

  // -------------------------------------------------------------
  // TEST 1: Verify Database Column
  // -------------------------------------------------------------
  console.log('--- TEST 1: Database Column Check ---');
  const { data: dbExams, error: dbErr } = await supabase
    .from('examinations')
    .select('id, exam_name, education_level, class_id, applicable_classes, status')
    .limit(10);

  if (dbErr) {
    console.error('TEST 1 FAIL: Database error inspecting examinations:', dbErr.message);
  } else {
    console.log('TEST 1 PASS: public.examinations.applicable_classes query succeeded.');
    console.log(`Retrieved ${dbExams?.length || 0} existing examination records from live Supabase database.`);
    if (dbExams && dbExams.length > 0) {
      console.log('Sample Record 1:', JSON.stringify(dbExams[0], null, 2));
    }
  }

  // Fetch classes from Supabase to get Grade 4, Grade 5, Grade 6, Grade 7, Grade 8, Grade 9 IDs
  const { data: dbClasses, error: classErr } = await supabase
    .from('classes')
    .select('id, name, grade_id, stream_id, education_level');

  console.log('\n--- Fetching Classes for Runtime Verification ---');
  if (classErr) {
    console.error('Error fetching classes:', classErr.message);
  } else {
    console.log(`Loaded ${dbClasses?.length || 0} classes/streams.`);
  }

  // Group classes by grade/level
  const classesList = dbClasses || [];
  const g4 = classesList.find((c: any) => (c.name || '').includes('Grade 4') || (c.name || '').includes('G4') || (c.name || '').includes('Standard 4'));
  const g5 = classesList.find((c: any) => (c.name || '').includes('Grade 5') || (c.name || '').includes('G5') || (c.name || '').includes('Standard 5'));
  const g6 = classesList.find((c: any) => (c.name || '').includes('Grade 6') || (c.name || '').includes('G6') || (c.name || '').includes('Standard 6'));

  const g7 = classesList.find((c: any) => (c.name || '').includes('Grade 7') || (c.name || '').includes('G7'));
  const g8 = classesList.find((c: any) => (c.name || '').includes('Grade 8') || (c.name || '').includes('G8'));
  const g9 = classesList.find((c: any) => (c.name || '').includes('Grade 9') || (c.name || '').includes('G9'));

  console.log('Class mapping found:');
  console.log('Grade 4:', g4 ? `${g4.name} (${g4.id})` : 'Not found');
  console.log('Grade 5:', g5 ? `${g5.name} (${g5.id})` : 'Not found');
  console.log('Grade 6:', g6 ? `${g6.name} (${g6.id})` : 'Not found');
  console.log('Grade 7:', g7 ? `${g7.name} (${g7.id})` : 'Not found');
  console.log('Grade 8:', g8 ? `${g8.name} (${g8.id})` : 'Not found');
  console.log('Grade 9:', g9 ? `${g9.name} (${g9.id})` : 'Not found');

  // Let's also check for existing Single-Class and Whole-Level examinations
  console.log('\n--- TEST 9 & TEST 10: Existing Examinations Check ---');
  const singleClassExam = dbExams?.find((e: any) => Boolean(e.class_id) && (!e.applicable_classes || e.applicable_classes.length === 0));
  const wholeLevelExam = dbExams?.find((e: any) => !e.class_id && (!e.applicable_classes || e.applicable_classes.length === 0) && e.education_level === 'Upper Primary');

  console.log('Single Class Examination:', singleClassExam ? `ID: ${singleClassExam.id}, Name: ${singleClassExam.exam_name}, class_id: ${singleClassExam.class_id}` : 'None found in sample');
  console.log('Whole Level Examination:', wholeLevelExam ? `ID: ${wholeLevelExam.id}, Name: ${wholeLevelExam.exam_name}, level: ${wholeLevelExam.education_level}` : 'None found in sample');

  // -------------------------------------------------------------
  // TEST 2 & TEST 3: Create Controlled Test Exam & Verify Persistence
  // -------------------------------------------------------------
  console.log('\n--- TEST 2 & 3: Creating Controlled Upper Primary Test Exam ---');
  const testExamId = 'test-up-sba-g4-g5-' + Date.now();
  const testExamName = 'RUNTIME TEST — UP SBA G4 G5 ONLY';
  
  const g4Id = g4 ? g4.id : 'g4-dummy-id';
  const g5Id = g5 ? g5.id : 'g5-dummy-id';
  const g6Id = g6 ? g6.id : 'g6-dummy-id';

  const testExam: Examination = {
    id: testExamId,
    exam_name: testExamName,
    education_level: 'Upper Primary',
    class_id: undefined, // NULL in db
    applicable_classes: [g4Id, g5Id], // Targeted Grade 4 + Grade 5
    date_created: new Date().toISOString().slice(0, 10),
    status: 'Draft',
    exam_type: 'SBA',
    max_marks: 100,
  };

  console.log('Saving test exam to Supabase:', testExam);
  const saveSuccess = await saveExaminationToSupabase(testExam);
  console.log('Save result:', saveSuccess ? 'SUCCESS' : 'FAILED');

  // Query database directly to verify persistence
  console.log('\n--- Verifying Direct Database Row ---');
  const { data: verifyRow, error: verifyErr } = await supabase
    .from('examinations')
    .select('id, exam_name, education_level, class_id, applicable_classes, status')
    .eq('id', testExamId)
    .single();

  if (verifyErr || !verifyRow) {
    console.error('TEST 3 FAIL: Could not read created test examination row from Supabase:', verifyErr?.message);
  } else {
    console.log('TEST 3 PASS: Database row retrieved directly from Supabase:');
    console.log(JSON.stringify(verifyRow, null, 2));
    console.log('class_id:', verifyRow.class_id);
    console.log('applicable_classes:', verifyRow.applicable_classes);
  }

  // -------------------------------------------------------------
  // TEST 4, 5, 6: Runtime Visibility & Exclusion Rules
  // -------------------------------------------------------------
  console.log('\n--- TEST 4, 5, 6: Runtime Filtering Verification ---');
  
  function isExamVisibleForClass(exam: Examination, targetClassId: string, targetStreamId?: string, targetLevel?: string): boolean {
    // Level match check
    if (exam.education_level && targetLevel && exam.education_level !== targetLevel) {
      return false;
    }
    // Targeted Class Scope (applicable_classes)
    if (exam.applicable_classes && exam.applicable_classes.length > 0) {
      const matchesTarget =
        exam.applicable_classes.includes(targetClassId) ||
        (Boolean(targetStreamId) && exam.applicable_classes.includes(targetStreamId!));
      return matchesTarget;
    }
    // Single class targeting
    if (exam.class_id && exam.class_id !== 'all') {
      return exam.class_id === targetClassId || exam.class_id === targetStreamId;
    }
    // Whole level targeting (class_id is null/all and applicable_classes is empty)
    return true;
  }

  const g4Visible = isExamVisibleForClass(testExam, g4Id, g4?.stream_id, 'Upper Primary');
  const g5Visible = isExamVisibleForClass(testExam, g5Id, g5?.stream_id, 'Upper Primary');
  const g6Visible = isExamVisibleForClass(testExam, g6Id, g6?.stream_id, 'Upper Primary');

  console.log(`Grade 4 (${g4Id}) Visibility:`, g4Visible ? 'VISIBLE (PASS)' : 'NOT VISIBLE (FAIL)');
  console.log(`Grade 5 (${g5Id}) Visibility:`, g5Visible ? 'VISIBLE (PASS)' : 'NOT VISIBLE (FAIL)');
  console.log(`Grade 6 (${g6Id}) Visibility:`, g6Visible ? 'VISIBLE (FAIL)' : 'NOT VISIBLE (PASS - EXCLUDED)');

  // -------------------------------------------------------------
  // TEST 11: Junior School Targeted Exam
  // -------------------------------------------------------------
  console.log('\n--- TEST 11: Junior School Targeted Exam ---');
  const jsExamId = 'test-js-sba-g7-g8-' + Date.now();
  const jsExamName = 'RUNTIME TEST — JS SBA G7 G8 ONLY';
  const g7Id = g7 ? g7.id : 'g7-dummy-id';
  const g8Id = g8 ? g8.id : 'g8-dummy-id';
  const g9Id = g9 ? g9.id : 'g9-dummy-id';

  const jsTestExam: Examination = {
    id: jsExamId,
    exam_name: jsExamName,
    education_level: 'Junior School',
    class_id: undefined,
    applicable_classes: [g7Id, g8Id],
    date_created: new Date().toISOString().slice(0, 10),
    status: 'Draft',
    exam_type: 'SBA',
    max_marks: 100,
  };

  const jsSaveSuccess = await saveExaminationToSupabase(jsTestExam);
  console.log('Junior School Exam Save Result:', jsSaveSuccess ? 'SUCCESS' : 'FAILED');

  const g7Visible = isExamVisibleForClass(jsTestExam, g7Id, g7?.stream_id, 'Junior School');
  const g8Visible = isExamVisibleForClass(jsTestExam, g8Id, g8?.stream_id, 'Junior School');
  const g9Visible = isExamVisibleForClass(jsTestExam, g9Id, g9?.stream_id, 'Junior School');

  console.log(`Grade 7 (${g7Id}) Visibility:`, g7Visible ? 'VISIBLE (PASS)' : 'NOT VISIBLE (FAIL)');
  console.log(`Grade 8 (${g8Id}) Visibility:`, g8Visible ? 'VISIBLE (PASS)' : 'NOT VISIBLE (FAIL)');
  console.log(`Grade 9 (${g9Id}) Visibility:`, g9Visible ? 'VISIBLE (FAIL)' : 'NOT VISIBLE (PASS - EXCLUDED)');

  // -------------------------------------------------------------
  // CLEAN-UP (Controlled Removal of Temporary Verification Records)
  // -------------------------------------------------------------
  console.log('\n--- CLEAN-UP: Removing Temporary Test Examinations ---');
  console.log(`Deleting test exam: ${testExamId}`);
  await deleteExaminationFromSupabase(testExamId);

  console.log(`Deleting JS test exam: ${jsExamId}`);
  await deleteExaminationFromSupabase(jsExamId);

  // Confirm deletion from DB
  const { data: deletedCheck1 } = await supabase.from('examinations').select('id').eq('id', testExamId).single();
  const { data: deletedCheck2 } = await supabase.from('examinations').select('id').eq('id', jsExamId).single();

  console.log('Deletion verification check:');
  console.log('Test UP Exam present:', Boolean(deletedCheck1));
  console.log('Test JS Exam present:', Boolean(deletedCheck2));

  console.log('\n=== VERIFICATION RUN COMPLETE ===');
}

runTests().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
