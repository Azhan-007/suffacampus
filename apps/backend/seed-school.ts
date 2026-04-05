import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

async function seed() {
  const schoolRef = db.collection('schools').doc('school_001');
  const doc = await schoolRef.get();

  if (doc.exists) {
    console.log('schools/school_001 already exists:', doc.data());
    return;
  }

  await schoolRef.set({
    id: 'school_001',
    name: 'SuffaCampus Demo School',
    subscriptionPlan: 'premium',
    limits: {
      students: -1, // unlimited
    },
    isActive: true,
    createdAt: new Date(),
  });

  console.log('âœ… Created schools/school_001 with unlimited student plan');
}

seed().catch(console.error);

