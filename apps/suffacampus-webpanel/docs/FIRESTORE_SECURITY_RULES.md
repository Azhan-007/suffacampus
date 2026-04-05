# Firestore Security Rules Documentation

## Overview

This document explains the Firestore security rules for the SuffaCampus multi-tenant SaaS platform. The rules enforce:

1. **Multi-school data isolation** - Each school's data is completely isolated
2. **Role-based access control (RBAC)** - 5 roles with different permissions
3. **SuperAdmin global access** - Platform-wide administration
4. **Cross-school access prevention** - Users cannot access other schools' data
5. **Collection-specific rules** - Granular permissions per collection

---

## Role Hierarchy

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                        SUPERADMIN                                â”‚
â”‚  Platform-wide access to ALL schools, subscriptions, billing     â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                              â”‚
                              â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                          ADMIN                                   â”‚
â”‚  Full access within their school only                            â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                              â”‚
                              â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                        PRINCIPAL                                 â”‚
â”‚  Full read, limited write within their school                    â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                              â”‚
              â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
              â–¼                               â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”     â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚         STAFF           â”‚     â”‚       ACCOUNTANT        â”‚
â”‚  - Read all data        â”‚     â”‚  - Finance data only    â”‚
â”‚  - Write: attendance,   â”‚     â”‚  - Read/write fees      â”‚
â”‚    assignments, results â”‚     â”‚  - No student/teacher   â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜     â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

---

## Permission Matrix

| Collection | SuperAdmin | Admin | Principal | Staff | Accountant |
|------------|------------|-------|-----------|-------|------------|
| **users** | CRUD | CRU (school) | R (school) | R (own) | R (own) |
| **schools** | CRUD | RU (own, limited) | R (own) | R (own) | R (own) |
| **students** | CRUD | CRUD (school) | CRUD (school) | R (school) | R (school) |
| **teachers** | CRUD | CRUD (school) | CRUD (school) | R (school) | R (school) |
| **attendance** | CRUD | CRUD (school) | CRUD (school) | CRU (school) | âŒ |
| **fees** | CRUD | CRUD (school) | CRUD (school) | âŒ | RU (school) |
| **events** | CRUD | CRUD (school) | CRUD (school) | R (school) | R (school) |
| **subscriptions** | CRUD | R (own) | âŒ | âŒ | âŒ |
| **invoices** | CRUD | R (own) | âŒ | âŒ | R (own) |
| **usageRecords** | CRUD | R (own) | âŒ | âŒ | âŒ |
| **classes** | CRUD | CRUD (school) | CRUD (school) | R (school) | R (school) |
| **timetable** | CRUD | CRUD (school) | CRUD (school) | R (school) | R (school) |
| **assignments** | CRUD | CRUD (school) | CRUD (school) | CRUD (own) | âŒ |
| **results** | CRUD | CRUD (school) | CRUD (school) | CRU (school) | âŒ |
| **library** | CRUD | CRUD (school) | CRUD (school) | RU (school) | R (school) |
| **settings** | CRUD | CRUD (own) | R (school) | R (school) | R (school) |

**Legend:**
- C = Create, R = Read, U = Update, D = Delete
- (school) = Only their school's data
- (own) = Only their own records
- âŒ = No access

---

## Helper Functions Explained

### Authentication Functions

```javascript
// Checks if request has valid Firebase Auth token
function isAuthenticated() {
  return request.auth != null;
}

// Fetches user document to get role and schoolId
function getUserData() {
  return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
}
```

**Why fetch user data?** Firebase Auth token only contains `uid`. We store role and schoolId in Firestore, so we must fetch it for authorization.

### School Access Functions

```javascript
// Core isolation function - prevents cross-school access
function belongsToSchool(schoolId) {
  return isAuthenticated() && isActiveUser() && getUserSchoolId() == schoolId;
}

// SuperAdmin bypass + school check
function canAccessSchool(schoolId) {
  return isSuperAdmin() || belongsToSchool(schoolId);
}
```

**Security Note:** `belongsToSchool` also checks `isActiveUser()` to prevent deactivated users from accessing data.

### Write Protection

```javascript
// Prevents schoolId from being changed on update
function schoolIdNotChanged() {
  return !('schoolId' in request.resource.data) || 
         request.resource.data.schoolId == resource.data.schoolId;
}
```

**Why?** Prevents malicious users from moving documents to another school by updating schoolId.

---

## Collection Rules Explained

### 1. Users Collection

```javascript
match /users/{userId} {
  allow read: if isAuthenticated() && (
    request.auth.uid == userId ||           // Own profile
    isSuperAdmin() ||                        // Platform admin
    (belongsToSchool(resource.data.schoolId) && hasAdminAccess())
  );
```

**Key Points:**
- Users can always read their own profile
- Admins can see users in their school (for user management)
- Users cannot update their own `role`, `schoolId`, or `isActive` fields
- Only SuperAdmin can delete users

### 2. Schools Collection

```javascript
allow update: if isAuthenticated() && (
  isSuperAdmin() ||
  (isAdmin() && belongsToSchool(schoolId) && 
   // Admin cannot modify subscription fields
   !('subscriptionPlan' in request.resource.data) &&
   !('subscriptionStatus' in request.resource.data) &&
   ...
```

**Key Points:**
- Only SuperAdmin can create/delete schools
- Admin can update school info (name, address) but NOT subscription fields
- Subscription management is restricted to prevent billing manipulation

### 3. Students/Teachers Collections

```javascript
allow create: if isAuthenticated() && (
  isSuperAdmin() ||
  (canWriteToSchool(request.resource.data.schoolId) && 
   hasRequiredFields(['firstName', 'lastName', 'schoolId', 'classId']))
);
```

**Key Points:**
- Required fields validated on create
- Staff can read but not write
- Accountant has read-only for fee linking

### 4. Fees Collection (Finance-Sensitive)

```javascript
function hasFinanceAccess(schoolId) {
  return isSuperAdmin() || 
         (belongsToSchool(schoolId) && (isAdmin() || isPrincipal() || isAccountant()));
}
```

**Key Points:**
- Staff explicitly excluded from fee access
- Accountant can read and update (mark payments)
- Only Admin can delete fee records (audit trail)

### 5. Subscriptions/Invoices/Payments (System-Only)

```javascript
allow create: if isSuperAdmin();
allow update: if isSuperAdmin();
allow delete: if isSuperAdmin();
```

**Key Points:**
- These should primarily be managed by backend/Cloud Functions
- SuperAdmin access for manual interventions
- In production, use Admin SDK for payment gateway webhooks

### 6. Attendance Collection

```javascript
// Staff can mark attendance
allow create: if isAuthenticated() && (
  isSuperAdmin() ||
  canWriteToSchool(request.resource.data.schoolId) ||
  (isStaff() && belongsToSchool(request.resource.data.schoolId))
);
```

**Key Points:**
- Staff can create (mark) attendance
- Staff can only update records they created (`markedBy == request.auth.uid`)
- Admin/Principal can update any attendance

### 7. Usage Alerts Collection

```javascript
allow update: if isAuthenticated() && (
  isSuperAdmin() ||
  (isAdmin() && belongsToSchool(resource.data.schoolId) &&
   request.resource.data.diff(resource.data).affectedKeys()
     .hasOnly(['acknowledged', 'acknowledgedAt', 'acknowledgedBy']))
);
```

**Key Points:**
- Admin can only update acknowledgement fields (not the alert itself)
- Uses `diff().affectedKeys().hasOnly()` for field-level restriction

---

## Edge Cases & Mitigations

### Edge Case 1: User Tries to Change Their Own Role

```javascript
// In users update rule
(request.auth.uid == userId && 
 !('role' in request.resource.data) &&  // Can't change role
 !('schoolId' in request.resource.data) &&  // Can't change school
 !('isActive' in request.resource.data))  // Can't reactivate self
```

**Mitigation:** Explicitly block role, schoolId, and isActive from self-updates.

### Edge Case 2: Admin Tries to Elevate User to SuperAdmin

```javascript
// Admin can update but not create SuperAdmins
request.resource.data.role != 'SuperAdmin'
```

**Mitigation:** Block Admin from setting role to SuperAdmin.

### Edge Case 3: User Tries to Move Document to Another School

```javascript
function schoolIdNotChanged() {
  return !('schoolId' in request.resource.data) || 
         request.resource.data.schoolId == resource.data.schoolId;
}
```

**Mitigation:** Check that schoolId is either not in the update or unchanged.

### Edge Case 4: Deactivated User Tries to Access Data

```javascript
function isActiveUser() {
  return getUserData().isActive == true;
}

function belongsToSchool(schoolId) {
  return isAuthenticated() && isActiveUser() && getUserSchoolId() == schoolId;
}
```

**Mitigation:** `isActiveUser()` check in school access function.

### Edge Case 5: Staff Tries to Access Finance Data

```javascript
function hasFinanceAccess(schoolId) {
  return isSuperAdmin() || 
         (belongsToSchool(schoolId) && (isAdmin() || isPrincipal() || isAccountant()));
}
```

**Mitigation:** Staff role explicitly not included in finance access.

### Edge Case 6: Query Without schoolId Filter

Even if rules allow access, Firestore requires queries to match the security rules. A query like:

```javascript
// This will FAIL even for SuperAdmin querying all
db.collection('students').get()
```

**Mitigation:** Client code must always include schoolId filter (except SuperAdmin with special handling).

### Edge Case 7: Batch Writes Across Schools

```javascript
// Firestore atomic batches evaluate all rules
batch.set(doc1, { schoolId: 'school-1' });
batch.set(doc2, { schoolId: 'school-2' });  // Will fail for non-SuperAdmin
```

**Mitigation:** Rules prevent cross-school operations in batches.

---

## Test Cases

### Test Setup

```javascript
// Test users
const superAdmin = {
  uid: 'superadmin-001',
  role: 'SuperAdmin',
  schoolId: null,
  isActive: true
};

const school1Admin = {
  uid: 'admin-001',
  role: 'Admin',
  schoolId: 'school-001',
  isActive: true
};

const school1Staff = {
  uid: 'staff-001',
  role: 'Staff',
  schoolId: 'school-001',
  isActive: true
};

const school2Admin = {
  uid: 'admin-002',
  role: 'Admin',
  schoolId: 'school-002',
  isActive: true
};

const deactivatedUser = {
  uid: 'deactivated-001',
  role: 'Admin',
  schoolId: 'school-001',
  isActive: false
};
```

### Test Case 1: Multi-School Isolation

```javascript
// âœ… SHOULD PASS: Admin reads own school's students
test('admin can read own school students', async () => {
  const db = getFirestore(school1Admin);
  const studentRef = db.collection('students').doc('student-001');
  await assertSucceeds(studentRef.get());
});

// âŒ SHOULD FAIL: Admin tries to read another school's students
test('admin cannot read other school students', async () => {
  const db = getFirestore(school1Admin);
  const studentRef = db.collection('students').doc('school2-student-001');
  await assertFails(studentRef.get());
});

// âœ… SHOULD PASS: SuperAdmin reads any school's students
test('superadmin can read any school students', async () => {
  const db = getFirestore(superAdmin);
  const student1 = db.collection('students').doc('school1-student');
  const student2 = db.collection('students').doc('school2-student');
  await assertSucceeds(student1.get());
  await assertSucceeds(student2.get());
});
```

### Test Case 2: Role-Based Write Access

```javascript
// âœ… SHOULD PASS: Staff creates attendance
test('staff can mark attendance', async () => {
  const db = getFirestore(school1Staff);
  const attendanceRef = db.collection('attendance').doc();
  await assertSucceeds(attendanceRef.set({
    studentId: 'student-001',
    schoolId: 'school-001',
    date: new Date(),
    status: 'Present',
    markedBy: school1Staff.uid
  }));
});

// âŒ SHOULD FAIL: Staff creates fee record
test('staff cannot create fee record', async () => {
  const db = getFirestore(school1Staff);
  const feeRef = db.collection('fees').doc();
  await assertFails(feeRef.set({
    studentId: 'student-001',
    schoolId: 'school-001',
    amount: 5000,
    feeType: 'Tuition'
  }));
});
```

### Test Case 3: Cross-School Write Prevention

```javascript
// âŒ SHOULD FAIL: Admin creates student in another school
test('admin cannot create student in other school', async () => {
  const db = getFirestore(school1Admin);
  const studentRef = db.collection('students').doc();
  await assertFails(studentRef.set({
    firstName: 'Test',
    lastName: 'Student',
    schoolId: 'school-002',  // Different school!
    classId: 'class-10'
  }));
});

// âŒ SHOULD FAIL: Admin changes student's schoolId
test('admin cannot move student to another school', async () => {
  const db = getFirestore(school1Admin);
  const studentRef = db.collection('students').doc('existing-student');
  await assertFails(studentRef.update({
    schoolId: 'school-002'  // Trying to move to different school
  }));
});
```

### Test Case 4: Role Elevation Prevention

```javascript
// âŒ SHOULD FAIL: User changes own role
test('user cannot change own role', async () => {
  const db = getFirestore(school1Staff);
  const userRef = db.collection('users').doc(school1Staff.uid);
  await assertFails(userRef.update({
    role: 'Admin'  // Trying to elevate self
  }));
});

// âŒ SHOULD FAIL: Admin creates SuperAdmin
test('admin cannot create superadmin', async () => {
  const db = getFirestore(school1Admin);
  const userRef = db.collection('users').doc('new-user');
  await assertFails(userRef.set({
    uid: 'new-user',
    email: 'evil@test.com',
    role: 'SuperAdmin',  // Not allowed!
    schoolId: 'school-001',
    isActive: true
  }));
});
```

### Test Case 5: Deactivated User Access

```javascript
// âŒ SHOULD FAIL: Deactivated user reads data
test('deactivated user cannot read students', async () => {
  const db = getFirestore(deactivatedUser);
  const studentRef = db.collection('students').doc('student-001');
  await assertFails(studentRef.get());
});
```

### Test Case 6: Subscription Protection

```javascript
// âŒ SHOULD FAIL: Admin changes subscription plan
test('admin cannot modify subscription plan', async () => {
  const db = getFirestore(school1Admin);
  const schoolRef = db.collection('schools').doc('school-001');
  await assertFails(schoolRef.update({
    subscriptionPlan: 'enterprise'  // Not allowed!
  }));
});

// âœ… SHOULD PASS: Admin updates school name
test('admin can update school name', async () => {
  const db = getFirestore(school1Admin);
  const schoolRef = db.collection('schools').doc('school-001');
  await assertSucceeds(schoolRef.update({
    name: 'New School Name'
  }));
});
```

### Test Case 7: Finance Role Access

```javascript
// âœ… SHOULD PASS: Accountant reads fees
test('accountant can read fees', async () => {
  const db = getFirestore(school1Accountant);
  const feeRef = db.collection('fees').doc('fee-001');
  await assertSucceeds(feeRef.get());
});

// âœ… SHOULD PASS: Accountant updates payment status
test('accountant can update fee payment', async () => {
  const db = getFirestore(school1Accountant);
  const feeRef = db.collection('fees').doc('fee-001');
  await assertSucceeds(feeRef.update({
    status: 'Paid',
    paidDate: new Date()
  }));
});

// âŒ SHOULD FAIL: Accountant reads student personal info
// (Actually accountant CAN read students for fee linking - design decision)
```

### Test Case 8: Usage Alerts

```javascript
// âœ… SHOULD PASS: Admin acknowledges alert
test('admin can acknowledge usage alert', async () => {
  const db = getFirestore(school1Admin);
  const alertRef = db.collection('usageAlerts').doc('alert-001');
  await assertSucceeds(alertRef.update({
    acknowledged: true,
    acknowledgedAt: new Date(),
    acknowledgedBy: school1Admin.uid
  }));
});

// âŒ SHOULD FAIL: Admin tries to modify alert message
test('admin cannot modify alert content', async () => {
  const db = getFirestore(school1Admin);
  const alertRef = db.collection('usageAlerts').doc('alert-001');
  await assertFails(alertRef.update({
    message: 'Modified message',  // Not allowed!
    acknowledged: true
  }));
});
```

---

## Running Tests

### Using Firebase Emulator

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Initialize (if not done)
firebase init emulators

# Start emulator with rules
firebase emulators:start --only firestore

# Run tests
npm test
```

### Test File Structure

```
__tests__/
â”œâ”€â”€ rules/
â”‚   â”œâ”€â”€ users.test.js
â”‚   â”œâ”€â”€ schools.test.js
â”‚   â”œâ”€â”€ students.test.js
â”‚   â”œâ”€â”€ fees.test.js
â”‚   â”œâ”€â”€ subscriptions.test.js
â”‚   â””â”€â”€ multi-tenant.test.js
```

---

## Performance Considerations

### Document Reads

Each rule evaluation that calls `getUserData()` costs 1 read. For high-traffic applications:

1. **Cache user role in custom claims** (reduces reads)
2. **Use callable functions** for sensitive operations
3. **Batch operations** where possible

### Custom Claims Alternative

```javascript
// Instead of fetching user doc every time
function getUserRole() {
  return request.auth.token.role;  // From custom claims
}

function getUserSchoolId() {
  return request.auth.token.schoolId;  // From custom claims
}
```

Set custom claims via Admin SDK:

```javascript
admin.auth().setCustomUserClaims(uid, {
  role: 'Admin',
  schoolId: 'school-001'
});
```

---

## Security Checklist

- [ ] All collections have explicit rules (no open access)
- [ ] Catch-all denies all undefined paths
- [ ] schoolId cannot be changed on updates
- [ ] Role elevation is prevented
- [ ] Deactivated users are blocked
- [ ] Finance data restricted to appropriate roles
- [ ] Subscription data is system-only writable
- [ ] Required fields validated on create
- [ ] SuperAdmin has bypass for all checks
- [ ] Cross-school queries return empty (not error)

---

## Deployment

```bash
# Deploy rules to Firebase
firebase deploy --only firestore:rules

# Validate rules before deploy
firebase firestore:rules:validate firestore.rules
```

---

## Maintenance Notes

1. **Adding New Collections**: Add explicit rules, default is deny
2. **Adding New Roles**: Update helper functions and permission matrix
3. **Changing Permissions**: Update both rules AND this documentation
4. **Testing**: Always test with emulator before deploying

