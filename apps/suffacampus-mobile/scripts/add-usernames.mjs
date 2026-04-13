// Auto-add username fields to existing users
import 'dotenv/config';
import { initializeApp } from 'firebase/app';
import { collection, doc, getDocs, getFirestore, updateDoc } from 'firebase/firestore';

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

// Firebase config loaded from environment variables.
const firebaseConfig = {
  apiKey: requireEnv('EXPO_PUBLIC_FIREBASE_API_KEY'),
  authDomain: requireEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
  projectId: requireEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
  storageBucket: requireEnv('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: requireEnv('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
  appId: requireEnv('EXPO_PUBLIC_FIREBASE_APP_ID')
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function addUsernames() {
  try {
    console.log('ðŸ”„ Fetching all users...');
    const usersSnapshot = await getDocs(collection(db, 'users'));
    
    let updated = 0;
    
    for (const userDoc of usersSnapshot.docs) {
      const data = userDoc.data();
      const email = data.email || '';
      const role = data.role || '';
      
      // Generate username based on email or role
      let username = '';
      
      if (email.includes('admin')) {
        username = 'admin';
      } else if (email.includes('teacher') || role === 'teacher') {
        username = 'teacher';
      } else if (email.includes('student') || role === 'student') {
        username = 'student';
      } else {
        // Extract username from email before @
        username = email.split('@')[0].toLowerCase();
      }
      
      // Update document with username
      await updateDoc(doc(db, 'users', userDoc.id), {
        username: username
      });
      
      console.log(`âœ… Added username "${username}" to ${email} (${role})`);
      updated++;
    }
    
    console.log(`\nðŸŽ‰ Done! Updated ${updated} users.`);
    
  } catch (error) {
    console.error('âŒ Error:', error);
  }
}

addUsernames();

