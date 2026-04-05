import "dotenv/config";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const auth = getAuth();
const db = getFirestore();

const EMAIL = "developeraz07@gmail.com";
const PASSWORD = "Azhan@SuperAdmin";
const DISPLAY_NAME = "Azhan";

async function createSuperAdmin() {
  console.log("🔧 Creating SuperAdmin account...\n");

  // 1. Create or get Firebase Auth user
  let uid: string;
  try {
    const existing = await auth.getUserByEmail(EMAIL);
    uid = existing.uid;
    console.log(`  ✅ Firebase Auth user already exists: ${uid}`);
    // Update password in case it changed
    await auth.updateUser(uid, { password: PASSWORD, displayName: DISPLAY_NAME });
    console.log(`  ✅ Updated password and display name`);
  } catch (err: any) {
    if (err.code === "auth/user-not-found") {
      const user = await auth.createUser({
        email: EMAIL,
        password: PASSWORD,
        displayName: DISPLAY_NAME,
        emailVerified: true,
      });
      uid = user.uid;
      console.log(`  ✅ Created Firebase Auth user: ${uid}`);
    } else {
      throw err;
    }
  }

  // 2. Set custom claims (role + no schoolId for SuperAdmin)
  await auth.setCustomUserClaims(uid, {
    role: "SuperAdmin",
  });
  console.log(`  ✅ Set custom claims: role=SuperAdmin`);

  // 3. Create Firestore user document
  const now = new Date();
  await db.collection("users").doc(uid).set(
    {
      uid,
      email: EMAIL,
      name: DISPLAY_NAME,
      displayName: DISPLAY_NAME,
      role: "SuperAdmin",
      schoolId: null, // SuperAdmin operates across all schools
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );
  console.log(`  ✅ Created/updated Firestore user doc: users/${uid}`);

  console.log("\n🎉 SuperAdmin account ready!");
  console.log(`\n   Email:    ${EMAIL}`);
  console.log(`   Password: ${PASSWORD}`);
  console.log(`   Role:     SuperAdmin`);
  console.log(`   UID:      ${uid}`);
  console.log(`\n   You can now log in from the web panel or mobile app.`);
}

createSuperAdmin().catch((err) => {
  console.error("❌ Failed:", err.message);
  process.exit(1);
});
