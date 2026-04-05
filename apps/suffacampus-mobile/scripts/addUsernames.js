// Run this script to add username field to existing test users
// Usage: node scripts/addUsernames.js

const admin = require('firebase-admin');
const serviceAccount = require('../path-to-your-serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function addUsernames() {
  try {
    // Update teacher user
    const teacherQuery = await db.collection('users')
      .where('email', '==', 'teacher@test.com')
      .get();
    
    if (!teacherQuery.empty) {
      await teacherQuery.docs[0].ref.update({
        username: 'teacher'
      });
      console.log('✅ Added username to teacher');
    }

    // Update student user
    const studentQuery = await db.collection('users')
      .where('email', '==', 'student@test.com')
      .get();
    
    if (!studentQuery.empty) {
      await studentQuery.docs[0].ref.update({
        username: 'student'
      });
      console.log('✅ Added username to student');
    }

    console.log('Done! Try logging in now.');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

addUsernames();
