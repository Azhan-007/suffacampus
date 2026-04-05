import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  User as FirebaseUser,
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { auth } from '@/lib/firebase';
import { apiFetch } from '@/lib/api';
import { User } from '@/types';

/**
 * Shape returned by POST /api/v1/auth/login and GET /api/v1/auth/me.
 */
interface AuthProfileResponse {
  uid: string;
  email: string;
  displayName: string;
  role: string;
  schoolId?: string | null;
  phone?: string | null;
  photoURL?: string | null;
  isActive: boolean;
  requirePasswordChange?: boolean;
  createdAt?: string | null;
  lastLogin?: string | null;
}

function mapProfileToUser(profile: AuthProfileResponse): User {
  return {
    uid: profile.uid,
    email: profile.email,
    displayName: profile.displayName || profile.email,
    role: profile.role as User['role'],
    schoolId: profile.schoolId ?? undefined,
    phone: profile.phone ?? undefined,
    photoURL: profile.photoURL ?? undefined,
    isActive: profile.isActive,
    createdAt: profile.createdAt ? new Date(profile.createdAt) : new Date(),
    lastLogin: profile.lastLogin ? new Date(profile.lastLogin) : undefined,
  };
}

export class AuthService {
  /**
   * Sign in with email and password.
   * 1. Firebase Auth sign-in (client-side)
   * 2. POST /auth/login to record login + fetch user profile from backend
   */
  static async signIn(email: string, password: string): Promise<User> {
    try {
      await signInWithEmailAndPassword(auth, email, password);

      // Fetch user profile from backend (also records lastLogin)
      const profile = await apiFetch<AuthProfileResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const user = mapProfileToUser(profile);

      // Check if user has admin privileges
      const allowedRoles = ['Admin', 'Staff', 'Accountant', 'Principal', 'SuperAdmin'];
      if (!allowedRoles.includes(user.role)) {
        await this.signOut();
        throw new Error('Unauthorized: You do not have admin panel access');
      }

      // Store redirect hint for SuperAdmin
      if (user.role === 'SuperAdmin') {
        sessionStorage.setItem('SuffaCampus-sa-redirect', '1');
      }

      return user;
    } catch (error) {
      if (error instanceof FirebaseError && (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password')) {
        throw new Error('Invalid email or password');
      }
      throw error;
    }
  }

  /**
   * Sign out the current user
   */
  static async signOut(): Promise<void> {
    await signOut(auth);
  }

  /**
   * Listen to auth state changes.
   * When Firebase reports a signed-in user, fetches their profile from the
   * backend API instead of reading Firestore directly.
   */
  static onAuthStateChanged(callback: (user: User | null) => void): () => void {
    return onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        try {
          const profile = await apiFetch<AuthProfileResponse>('/auth/me');
          callback(mapProfileToUser(profile));
        } catch (error) {
          console.error('Error fetching user profile:', error);
          callback(null);
        }
      } else {
        callback(null);
      }
    });
  }

  /**
   * Get current authenticated user
   */
  static getCurrentUser(): FirebaseUser | null {
    return auth.currentUser;
  }

  /**
   * Send password reset email
   */
  static async resetPassword(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      if (error instanceof FirebaseError && error.code === 'auth/user-not-found') {
        throw new Error('No account found with this email address');
      }
      throw new Error('Failed to send password reset email');
    }
  }
}

