/**
 * Firestore Security Rules Test Suite
 * 
 * Run with: npm run test:rules
 * Requires Firebase Emulator running: firebase emulators:start --only firestore
 */

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc } from 'firebase/firestore';
import * as fs from 'fs';

let testEnv: RulesTestEnvironment;

// Test data
const SCHOOL_1 = 'school-001';
const SCHOOL_2 = 'school-002';

const USERS = {
  superAdmin: {
    uid: 'superadmin-001',
    data: {
      uid: 'superadmin-001',
      email: 'super@educonnect.com',
      displayName: 'Super Admin',
      role: 'SuperAdmin',
      schoolId: "" as string,
      isActive: true,
    }
  },
  admin1: {
    uid: 'admin-001',
    data: {
      uid: 'admin-001',
      email: 'admin@school1.com',
      displayName: 'School 1 Admin',
      role: 'Admin',
      schoolId: SCHOOL_1,
      isActive: true,
    }
  },
  admin2: {
    uid: 'admin-002',
    data: {
      uid: 'admin-002',
      email: 'admin@school2.com',
      displayName: 'School 2 Admin',
      role: 'Admin',
      schoolId: SCHOOL_2,
      isActive: true,
    }
  },
  principal1: {
    uid: 'principal-001',
    data: {
      uid: 'principal-001',
      email: 'principal@school1.com',
      displayName: 'School 1 Principal',
      role: 'Principal',
      schoolId: SCHOOL_1,
      isActive: true,
    }
  },
  staff1: {
    uid: 'staff-001',
    data: {
      uid: 'staff-001',
      email: 'staff@school1.com',
      displayName: 'School 1 Staff',
      role: 'Staff',
      schoolId: SCHOOL_1,
      isActive: true,
    }
  },
  accountant1: {
    uid: 'accountant-001',
    data: {
      uid: 'accountant-001',
      email: 'accountant@school1.com',
      displayName: 'School 1 Accountant',
      role: 'Accountant',
      schoolId: SCHOOL_1,
      isActive: true,
    }
  },
  deactivated: {
    uid: 'deactivated-001',
    data: {
      uid: 'deactivated-001',
      email: 'deactivated@school1.com',
      displayName: 'Deactivated User',
      role: 'Admin',
      schoolId: SCHOOL_1,
      isActive: false,
    }
  },
};

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'educonnect-test',
    firestore: {
      rules: fs.readFileSync('firestore.rules', 'utf8'),
      host: 'localhost',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  
  // Seed user documents
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    
    for (const user of Object.values(USERS)) {
      await setDoc(doc(db, 'users', user.uid), user.data);
    }
    
    // Seed schools
    await setDoc(doc(db, 'schools', SCHOOL_1), {
      id: SCHOOL_1,
      name: 'Test School 1',
      subscriptionPlan: 'pro',
      subscriptionStatus: 'active',
    });
    
    await setDoc(doc(db, 'schools', SCHOOL_2), {
      id: SCHOOL_2,
      name: 'Test School 2',
      subscriptionPlan: 'basic',
      subscriptionStatus: 'active',
    });
    
    // Seed test students
    await setDoc(doc(db, 'students', 'student-001'), {
      id: 'student-001',
      firstName: 'John',
      lastName: 'Doe',
      schoolId: SCHOOL_1,
      classId: 'class-10',
    });
    
    await setDoc(doc(db, 'students', 'student-002'), {
      id: 'student-002',
      firstName: 'Jane',
      lastName: 'Smith',
      schoolId: SCHOOL_2,
      classId: 'class-10',
    });
    
    // Seed test fees
    await setDoc(doc(db, 'fees', 'fee-001'), {
      id: 'fee-001',
      studentId: 'student-001',
      schoolId: SCHOOL_1,
      amount: 5000,
      status: 'Pending',
      feeType: 'Tuition',
    });
  });
});

// Helper to get authenticated context
function getAuthContext(user: typeof USERS.admin1) {
  return testEnv.authenticatedContext(user.uid);
}

function getUnauthContext() {
  return testEnv.unauthenticatedContext();
}

// ========================================
// TEST SUITE: Authentication
// ========================================

describe('Authentication', () => {
  test('unauthenticated user cannot read any collection', async () => {
    const db = getUnauthContext().firestore();
    await assertFails(getDoc(doc(db, 'students', 'student-001')));
    await assertFails(getDoc(doc(db, 'schools', SCHOOL_1)));
    await assertFails(getDoc(doc(db, 'fees', 'fee-001')));
  });
});

// ========================================
// TEST SUITE: Multi-School Isolation
// ========================================

describe('Multi-School Isolation', () => {
  test('admin can read students in their school', async () => {
    const db = getAuthContext(USERS.admin1).firestore();
    await assertSucceeds(getDoc(doc(db, 'students', 'student-001')));
  });

  test('admin cannot read students in another school', async () => {
    const db = getAuthContext(USERS.admin1).firestore();
    await assertFails(getDoc(doc(db, 'students', 'student-002')));
  });

  test('superadmin can read students in any school', async () => {
    const db = getAuthContext(USERS.superAdmin).firestore();
    await assertSucceeds(getDoc(doc(db, 'students', 'student-001')));
    await assertSucceeds(getDoc(doc(db, 'students', 'student-002')));
  });

  test('admin cannot create student in another school', async () => {
    const db = getAuthContext(USERS.admin1).firestore();
    await assertFails(addDoc(collection(db, 'students'), {
      firstName: 'Evil',
      lastName: 'Student',
      schoolId: SCHOOL_2, // Different school
      classId: 'class-10',
    }));
  });

  test('admin cannot move student to another school', async () => {
    const db = getAuthContext(USERS.admin1).firestore();
    await assertFails(updateDoc(doc(db, 'students', 'student-001'), {
      schoolId: SCHOOL_2, // Trying to move
    }));
  });
});

// ========================================
// TEST SUITE: Role-Based Access
// ========================================

describe('Role-Based Access - Students', () => {
  test('admin has full CRUD on students', async () => {
    const db = getAuthContext(USERS.admin1).firestore();
    
    // Create
    const newStudent = await assertSucceeds(addDoc(collection(db, 'students'), {
      firstName: 'New',
      lastName: 'Student',
      schoolId: SCHOOL_1,
      classId: 'class-10',
    }));
    
    // Read
    await assertSucceeds(getDoc(doc(db, 'students', 'student-001')));
    
    // Update
    await assertSucceeds(updateDoc(doc(db, 'students', 'student-001'), {
      firstName: 'Updated',
    }));
    
    // Delete
    await assertSucceeds(deleteDoc(newStudent));
  });

  test('staff can only read students', async () => {
    const db = getAuthContext(USERS.staff1).firestore();
    
    // Read - should succeed
    await assertSucceeds(getDoc(doc(db, 'students', 'student-001')));
    
    // Create - should fail
    await assertFails(addDoc(collection(db, 'students'), {
      firstName: 'New',
      lastName: 'Student',
      schoolId: SCHOOL_1,
      classId: 'class-10',
    }));
    
    // Update - should fail
    await assertFails(updateDoc(doc(db, 'students', 'student-001'), {
      firstName: 'Updated',
    }));
    
    // Delete - should fail
    await assertFails(deleteDoc(doc(db, 'students', 'student-001')));
  });
});

describe('Role-Based Access - Fees', () => {
  test('accountant can read fees', async () => {
    const db = getAuthContext(USERS.accountant1).firestore();
    await assertSucceeds(getDoc(doc(db, 'fees', 'fee-001')));
  });

  test('accountant can update fee payment status', async () => {
    const db = getAuthContext(USERS.accountant1).firestore();
    await assertSucceeds(updateDoc(doc(db, 'fees', 'fee-001'), {
      status: 'Paid',
      paidDate: new Date(),
    }));
  });

  test('staff cannot read fees', async () => {
    const db = getAuthContext(USERS.staff1).firestore();
    await assertFails(getDoc(doc(db, 'fees', 'fee-001')));
  });
});

describe('Role-Based Access - Attendance', () => {
  test('staff can create attendance', async () => {
    const db = getAuthContext(USERS.staff1).firestore();
    await assertSucceeds(addDoc(collection(db, 'attendance'), {
      studentId: 'student-001',
      schoolId: SCHOOL_1,
      date: new Date(),
      status: 'Present',
      markedBy: USERS.staff1.uid,
    }));
  });
});

// ========================================
// TEST SUITE: Role Elevation Prevention
// ========================================

describe('Role Elevation Prevention', () => {
  test('user cannot change their own role', async () => {
    const db = getAuthContext(USERS.staff1).firestore();
    await assertFails(updateDoc(doc(db, 'users', USERS.staff1.uid), {
      role: 'Admin',
    }));
  });

  test('admin cannot create superadmin', async () => {
    const db = getAuthContext(USERS.admin1).firestore();
    await assertFails(setDoc(doc(db, 'users', 'new-user'), {
      uid: 'new-user',
      email: 'evil@test.com',
      displayName: 'Evil User',
      role: 'SuperAdmin',
      schoolId: SCHOOL_1,
      isActive: true,
    }));
  });

  test('admin can create staff in their school', async () => {
    const db = getAuthContext(USERS.admin1).firestore();
    await assertSucceeds(setDoc(doc(db, 'users', 'new-staff'), {
      uid: 'new-staff',
      email: 'newstaff@school1.com',
      displayName: 'New Staff',
      role: 'Staff',
      schoolId: SCHOOL_1,
      isActive: true,
    }));
  });
});

// ========================================
// TEST SUITE: Deactivated User
// ========================================

describe('Deactivated User Access', () => {
  test('deactivated user cannot read data', async () => {
    const db = getAuthContext(USERS.deactivated).firestore();
    await assertFails(getDoc(doc(db, 'students', 'student-001')));
  });
});

// ========================================
// TEST SUITE: Subscription Protection
// ========================================

describe('Subscription Protection', () => {
  test('admin cannot modify subscription plan', async () => {
    const db = getAuthContext(USERS.admin1).firestore();
    await assertFails(updateDoc(doc(db, 'schools', SCHOOL_1), {
      subscriptionPlan: 'enterprise',
    }));
  });

  test('admin can update school name', async () => {
    const db = getAuthContext(USERS.admin1).firestore();
    await assertSucceeds(updateDoc(doc(db, 'schools', SCHOOL_1), {
      name: 'Updated School Name',
    }));
  });

  test('superadmin can modify subscription', async () => {
    const db = getAuthContext(USERS.superAdmin).firestore();
    await assertSucceeds(updateDoc(doc(db, 'schools', SCHOOL_1), {
      subscriptionPlan: 'enterprise',
      subscriptionStatus: 'active',
    }));
  });
});

// ========================================
// TEST SUITE: Schools Collection
// ========================================

describe('Schools Collection', () => {
  test('only superadmin can create schools', async () => {
    const superDb = getAuthContext(USERS.superAdmin).firestore();
    const adminDb = getAuthContext(USERS.admin1).firestore();
    
    await assertSucceeds(setDoc(doc(superDb, 'schools', 'new-school'), {
      id: 'new-school',
      name: 'New School',
      subscriptionPlan: 'free',
      subscriptionStatus: 'trial',
    }));
    
    await assertFails(setDoc(doc(adminDb, 'schools', 'another-school'), {
      id: 'another-school',
      name: 'Another School',
      subscriptionPlan: 'free',
      subscriptionStatus: 'trial',
    }));
  });

  test('only superadmin can delete schools', async () => {
    const superDb = getAuthContext(USERS.superAdmin).firestore();
    const adminDb = getAuthContext(USERS.admin1).firestore();
    
    await assertFails(deleteDoc(doc(adminDb, 'schools', SCHOOL_1)));
    await assertSucceeds(deleteDoc(doc(superDb, 'schools', SCHOOL_1)));
  });
});

// ========================================
// TEST SUITE: Subscriptions Collection
// ========================================

describe('Subscriptions Collection', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'subscriptions', 'sub-001'), {
        id: 'sub-001',
        schoolId: SCHOOL_1,
        planId: 'pro',
        status: 'active',
      });
    });
  });

  test('admin can read their school subscription', async () => {
    const db = getAuthContext(USERS.admin1).firestore();
    await assertSucceeds(getDoc(doc(db, 'subscriptions', 'sub-001')));
  });

  test('admin cannot write to subscriptions', async () => {
    const db = getAuthContext(USERS.admin1).firestore();
    await assertFails(updateDoc(doc(db, 'subscriptions', 'sub-001'), {
      planId: 'enterprise',
    }));
  });

  test('staff cannot read subscriptions', async () => {
    const db = getAuthContext(USERS.staff1).firestore();
    await assertFails(getDoc(doc(db, 'subscriptions', 'sub-001')));
  });
});

export {};
