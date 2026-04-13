import "dotenv/config";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { PrismaClient } from "@prisma/client";
import { superadminEnv } from "./src/lib/superadmin-env";

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: superadminEnv.FIREBASE_PROJECT_ID,
      clientEmail: superadminEnv.FIREBASE_CLIENT_EMAIL,
      privateKey: superadminEnv.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

const auth = getAuth();
const prisma = new PrismaClient();

const EMAIL = superadminEnv.SUPERADMIN_EMAIL;
const PASSWORD = superadminEnv.SUPERADMIN_PASSWORD;
const DISPLAY_NAME = superadminEnv.SUPERADMIN_DISPLAY_NAME || EMAIL.split("@")[0];

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

  // 3. Persist superadmin in PostgreSQL (single source of truth)
  const user = await prisma.user.upsert({
    where: { uid },
    update: {
      email: EMAIL,
      displayName: DISPLAY_NAME,
      role: "SuperAdmin",
      schoolId: null,
      isActive: true,
      requirePasswordChange: false,
    },
    create: {
      uid,
      email: EMAIL,
      displayName: DISPLAY_NAME,
      role: "SuperAdmin",
      schoolId: null,
      isActive: true,
      requirePasswordChange: false,
    },
  });
  console.log(`  ✅ Created/updated Prisma user row: User(uid=${user.uid})`);

  console.log("\n🎉 SuperAdmin account ready!");
  console.log(`\n   Email:    ${EMAIL}`);
  console.log("   Password: [SET FROM SUPERADMIN_PASSWORD ENV]");
  console.log(`   Role:     SuperAdmin`);
  console.log(`   UID:      ${uid}`);
  console.log(`\n   You can now log in from the web panel or mobile app.`);
}

createSuperAdmin().catch((err) => {
  console.error("❌ Failed:", err.message);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
