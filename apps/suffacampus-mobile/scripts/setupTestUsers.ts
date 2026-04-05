/**
 * Setup Test Users for SuffaCampus
 * Run this script once to create test accounts in Firebase Auth and Firestore
 */

import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

const testUsers = [
  {
    email: "student@test.com",
    password: "password123",
    role: "student",
    name: "Test Student",
  },
  {
    email: "teacher@test.com",
    password: "password123",
    role: "teacher",
    name: "Test Teacher",
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
  console.log("\nTest Credentials:");
  console.log("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€");
  testUsers.forEach((user) => {
    console.log(`${user.role.toUpperCase()}:`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Password: ${user.password}\n`);
  });
}

setupTestUsers()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });

