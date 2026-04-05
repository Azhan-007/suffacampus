// Auto-add username fields to existing users
import { initializeApp } from 'firebase/app';
import { collection, doc, getDocs, getFirestore, updateDoc } from 'firebase/firestore';

// Your Firebase config (from firebase.ts)
const firebaseConfig = {
  apiKey: "AIzaSyDahs8w3bKv6j74j-Q-rHb95VzWxU9aBLM",
  authDomain: "SuffaCampus-fa194.firebaseapp.com",
  projectId: "SuffaCampus-fa194",
  storageBucket: "SuffaCampus-fa194.firebasestorage.app",
  messagingSenderId: "1038598740653",
  appId: "1:1038598740653:web:e23df2c6f1bbef5f00e2ce"
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
    console.log('\nCredentials:');
    console.log('- Username: admin / Password: password123');
    console.log('- Username: teacher / Password: password123');
    console.log('- Username: student / Password: password123');
    
  } catch (error) {
    console.error('âŒ Error:', error);
  }
}

addUsernames();

