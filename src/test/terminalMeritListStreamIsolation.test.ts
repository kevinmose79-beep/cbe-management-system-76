import { Student, ClassStream, Subject, Teacher } from '../types';
import {
  isLearnerInSelectedClassStream,
  resolveSubjectTeacherName,
  getStreamNameForLearner,
} from '../services/terminalMeritListExporter';

console.log('=== RUNNING TERMINAL MERIT LIST STREAM ISOLATION & TEACHER RESOLUTION TESTS ===\n');

let passed = 0;
let total = 0;

function assert(condition: boolean, message: string) {
  total++;
  if (condition) {
    passed++;
    console.log(`✓ PASS: ${message}`);
  } else {
    console.error(`✗ FAIL: ${message}`);
  }
}

// 1. Setup mock classes
const classG9Blue: ClassStream = {
  id: 'cls_g9_parent',
  stream_id: 'cs_g9_blue',
  class_name: 'Grade 9',
  stream: 'Blue',
};

const classG9Red: ClassStream = {
  id: 'cls_g9_parent',
  stream_id: 'cs_g9_red',
  class_name: 'Grade 9',
  stream: 'Red',
};

// 2. Setup mock students
const studentG9Blue: Student = {
  id: 'st_blue_1',
  full_name: 'Blue Learner',
  admission_number: 'ADM_B1',
  class_id: 'cls_g9_parent',
  stream_id: 'cs_g9_blue',
  grade: 'Grade 9',
  gender: 'M',
  active: true,
};

const studentG9Red: Student = {
  id: 'st_red_1',
  full_name: 'Red Learner',
  admission_number: 'ADM_R1',
  class_id: 'cls_g9_parent',
  stream_id: 'cs_g9_red',
  grade: 'Grade 9',
  gender: 'F',
  active: true,
};

// Test stream cohort filtering
assert(
  isLearnerInSelectedClassStream(studentG9Blue, classG9Blue) === true,
  'Grade 9 Blue learner is included when viewing Grade 9 Blue stream'
);

assert(
  isLearnerInSelectedClassStream(studentG9Red, classG9Blue) === false,
  'Grade 9 Red learner is EXCLUDED when viewing Grade 9 Blue stream (no Bleeding / all-X rows)'
);

assert(
  isLearnerInSelectedClassStream(studentG9Red, classG9Red) === true,
  'Grade 9 Red learner is included when viewing Grade 9 Red stream'
);

// 3. Setup mock teachers with stream-specific allocations
const teachers: Teacher[] = [
  {
    id: 'tch_blue_math',
    teacher_name: 'Mr. Blue Math',
    phone: '0700000001',
    email: 'blue.math@school.ac.ke',
    allocations: [
      {
        id: 'alloc_1',
        subject_id: 'sb_mat',
        class_id: 'cls_g9_parent',
        stream_id: 'cs_g9_blue',
        education_level: 'Junior School',
      },
    ],
  },
  {
    id: 'tch_red_math',
    teacher_name: 'Mr. Red Math',
    phone: '0700000002',
    email: 'red.math@school.ac.ke',
    allocations: [
      {
        id: 'alloc_2',
        subject_id: 'sb_mat',
        class_id: 'cls_g9_parent',
        stream_id: 'cs_g9_red',
        education_level: 'Junior School',
      },
    ],
  },
];

// Test subject teacher resolution for specific stream
const blueMathTeacher = resolveSubjectTeacherName('sb_mat', 'cls_g9_parent', 'cs_g9_blue', teachers);
const redMathTeacher = resolveSubjectTeacherName('sb_mat', 'cls_g9_parent', 'cs_g9_red', teachers);
const unassignedTeacher = resolveSubjectTeacherName('sb_eng', 'cls_g9_parent', 'cs_g9_blue', teachers);

assert(blueMathTeacher === 'Mr. Blue Math', `Grade 9 Blue Math resolves to 'Mr. Blue Math' (got '${blueMathTeacher}')`);
assert(redMathTeacher === 'Mr. Red Math', `Grade 9 Red Math resolves to 'Mr. Red Math' (got '${redMathTeacher}')`);
assert(unassignedTeacher === '', `Unassigned subject resolves to empty string '' (got '${unassignedTeacher}')`);

// 4. Test stream name resolution for learners
const blueStreamName = getStreamNameForLearner(studentG9Blue, [classG9Blue, classG9Red]);
const redStreamName = getStreamNameForLearner(studentG9Red, [classG9Blue, classG9Red]);

assert(blueStreamName === 'BLUE', `Grade 9 Blue learner stream resolves to 'BLUE' (got '${blueStreamName}')`);
assert(redStreamName === 'RED', `Grade 9 Red learner stream resolves to 'RED' (got '${redStreamName}')`);

console.log(`\n==================================================`);
console.log(`STREAM ISOLATION TEST RESULTS: ${passed}/${total} PASSED`);
console.log(`==================================================\n`);

if (passed !== total) {
  process.exit(1);
}
