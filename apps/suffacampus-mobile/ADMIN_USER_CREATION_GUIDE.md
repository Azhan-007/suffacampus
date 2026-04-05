# Admin Guide: Creating User Accounts

## Overview
The system now uses **username-based authentication**. Admins must create accounts for all teachers and students.

## How to Create User Accounts

### Step 1: Create Firebase Auth Account
1. Go to Firebase Console → Authentication → Users
2. Click "Add User"
3. Enter email: `username@yourschool.internal` (use username as email prefix)
4. Enter password (give this to the user)
5. Click "Add User"

### Step 2: Create Firestore User Document
1. Go to Firebase Console → Firestore Database
2. Navigate to `users` collection
3. Add a new document with these fields:

```javascript
{
  email: "username@yourschool.internal",  // Must match Auth email
  username: "john.doe",                    // What user will enter to login
  name: "John Doe",                        // Full name
  role: "teacher",                         // "student", "teacher", or "admin"
  createdAt: "2026-01-20T10:00:00Z"       // ISO date string
}
```

### Example User Documents

**Teacher Account:**
```javascript
{
  email: "sarah.ahmed@yourschool.internal",
  username: "sarah.ahmed",
  name: "Dr. Sarah Ahmed",
  role: "teacher",
  createdAt: "2026-01-20T10:00:00Z"
}
```

**Student Account:**
```javascript
{
  email: "student123@yourschool.internal",
  username: "student123",
  name: "Ahmad Ibrahim",
  role: "student",
  createdAt: "2026-01-20T10:00:00Z"
}
```

**Admin Account:**
```javascript
{
  email: "admin@yourschool.internal",
  username: "admin",
  name: "System Admin",
  role: "admin",
  createdAt: "2026-01-20T10:00:00Z"
}
```

## Login Flow

1. **User enters:** username (e.g., "sarah.ahmed") + password
2. **System finds:** email from Firestore using username
3. **Firebase Auth:** authenticates with email + password
4. **Redirect:** to appropriate dashboard based on role

## Username Rules

- Use lowercase only
- No spaces (use dots or underscores)
- Keep it simple: `firstname.lastname` or `student123`
- Must be unique across all users

## Password Management

- Initial password: Set by admin
- Forgot password: User contacts admin to reset
- Admin resets in Firebase Auth console

## Quick Setup Script (Optional)

For bulk user creation, you can use this script structure:

```javascript
const users = [
  { username: "teacher1", name: "Teacher One", role: "teacher", password: "pass123" },
  { username: "student1", name: "Student One", role: "student", password: "pass123" },
];

// Loop and create each user in Firebase Auth + Firestore
```

## Important Notes

⚠️ **Both steps are required:**
- Firebase Auth account (for authentication)
- Firestore document (for username mapping + role)

✅ **Username must match:**
- Username in Firestore = what user types to login
- Email in both Auth and Firestore must match

## Test Accounts

Current test accounts:
- Username: `teacher` / Password: `password123` (Role: teacher)
- Username: `student` / Password: `password123` (Role: student)

Update their Firestore documents to add `username` field if missing.
