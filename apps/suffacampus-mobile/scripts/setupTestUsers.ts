/**
 * Setup Test Users for SuffaCampus
 * Run this script once to create test accounts in Firebase Auth and Firestore
 */

import "dotenv/config";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

const testUsers = [
  {
    email: requireEnv("TEST_STUDENT_EMAIL"),
    password: requireEnv("TEST_STUDENT_PASSWORD"),
    role: "student",
    name: process.env.TEST_STUDENT_NAME?.trim() || "Test Student",
  },
  {
    email: requireEnv("TEST_TEACHER_EMAIL"),
    password: requireEnv("TEST_TEACHER_PASSWORD"),
    role: "teacher",
    name: process.env.TEST_TEACHER_NAME?.trim() || "Test Teacher",
  },
];

async function setupTestUsers() {
  console.log("ðŸ”§ Setting up test users...\n");

  for (const user of testUsers) {
    try {
      // Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        user.email,
        user.password
      );
      const userId = userCredential.user.uid;

      console.log(`âœ… Created Auth user: ${user.email} (UID: ${userId})`);

      // Create Firestore document
      await setDoc(doc(db, "users", userId), {
        email: user.email.toLowerCase(),
        role: user.role,
        name: user.name,
        createdAt: new Date().toISOString(),
      });

      console.log(`âœ… Created Firestore document for: ${user.email}\n`);
    } catch (error: any) {
      if (error.code === "auth/email-already-in-use") {
        console.log(`âš ï¸  User already exists: ${user.email}\n`);
      } else {
        console.error(`âŒ Error creating ${user.email}:`, error.message, "\n");
      }
    }
  }

  console.log("âœ¨ Setup complete!");
  console.log("\nCreated users:");
  console.log("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€");
  testUsers.forEach((user) => {
    console.log(`${user.role.toUpperCase()}:`);
    console.log(`  Email: ${user.email}`);
    console.log("  Password: [SET FROM ENV]\n");
  });
}

setupTestUsers()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });

