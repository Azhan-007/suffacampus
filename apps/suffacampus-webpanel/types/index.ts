// TypeScript interfaces for Firestore collections

export type UserRole = 'SuperAdmin' | 'Admin' | 'Teacher' | 'Student' | 'Staff' | 'Accountant' | 'Principal' | 'Parent';

export type SubscriptionPlan = 'free' | 'basic' | 'pro' | 'enterprise';
export type SubscriptionStatus = 'active' | 'trial' | 'expired' | 'cancelled' | 'past_due';
export type BillingCycle = 'monthly' | 'yearly';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type PaymentMethod = 'card' | 'upi' | 'netbanking' | 'wallet';

// Subscription & Billing Types
export interface PlanFeature {
  id: string;
  name: string;
  description: string;
  included: boolean;
  limit?: number | 'unlimited';
}

export interface PlanPricing {
  monthly: number;
  yearly: number;
  currency: string;
  yearlyDiscount: number; // percentage
}

export interface SubscriptionPlanDetails {
  id: SubscriptionPlan;
  name: string;
  description: string;
  pricing: PlanPricing;
  limits: {
    maxStudents: number;
    maxTeachers: number;
    maxClasses: number;
    maxAdmins: number;
    maxStorage: number; // in MB
  };
  features: PlanFeature[];
  isPopular?: boolean;
  trialDays: number;
}

export interface Subscription {
  id: string;
  schoolId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  
  // Dates
  startDate: Date;
  endDate: Date;
  trialEndDate?: Date;
  cancelledAt?: Date;
  
  // Billing
  amount: number;
  currency: string;
  nextBillingDate?: Date;
  
  // Payment
  paymentMethodId?: string;
  lastPaymentId?: string;
  
  // Auto-renewal
  autoRenew: boolean;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export interface Invoice {
  id: string;
  schoolId: string;
  subscriptionId: string;
  
  // Invoice details
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  
  // Amounts
  subtotal: number;
  tax: number;
  taxRate: number;
  discount: number;
  total: number;
  currency: string;
  
  // Line items
  lineItems: InvoiceLineItem[];
  
  // Status
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  paidAt?: Date;
  
  // Payment
  paymentId?: string;
  
  // Metadata
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  period?: {
    start: Date;
    end: Date;
  };
}

export interface Payment {
  id: string;
  schoolId: string;
  invoiceId?: string;
  subscriptionId?: string;
  
  // Payment details
  amount: number;
  currency: string;
  status: PaymentStatus;
  method: PaymentMethod;
  
  // Gateway info
  gatewayId?: string; // e.g., Razorpay payment_id
  gatewayOrderId?: string;
  gatewaySignature?: string;
  
  // Card/UPI details (masked)
  paymentMethodDetails?: {
    type: PaymentMethod;
    last4?: string;
    brand?: string;
    upiId?: string;
  };
  
  // Status
  failureReason?: string;
  refundedAmount?: number;
  
  // Metadata
  description?: string;
  receiptUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Payment Gateway Types
export interface RazorpayOrder {
  id: string;
  amount: number;        // in paise
  currency: string;
  receipt: string;
  status: 'created' | 'attempted' | 'paid';
  notes: Record<string, string>;
}

export interface PaymentVerification {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface PaymentRequest {
  amount: number;           // in rupees (will be converted to paise)
  currency?: string;        // defaults to INR
  description: string;
  feeId?: string;           // for fee payments
  subscriptionId?: string;  // for subscription payments
  plan?: SubscriptionPlan;
  billingCycle?: BillingCycle;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  notes?: Record<string, string>;
}

export interface PaymentResult {
  success: boolean;
  paymentId?: string;
  orderId?: string;
  signature?: string;
  method?: PaymentMethod;
  error?: string;
  amount: number;
}

export interface PaymentGatewayConfig {
  provider: 'razorpay' | 'sandbox';
  keyId: string;
  companyName: string;
  logo?: string;
  theme?: {
    color: string;
  };
  sandboxMode: boolean;
}

export interface UsageRecord {
  id: string;
  schoolId: string;
  
  // Usage snapshot
  date: Date;
  students: number;
  teachers: number;
  classes: number;
  admins: number;
  storage: number; // in MB
  
  // Additional metrics
  activeUsers?: number;
  apiCalls?: number;
  
  // Period type
  period?: 'daily' | 'weekly' | 'monthly';
  
  // Metadata
  createdAt: Date;
}

export interface UsageAlert {
  id: string;
  schoolId: string;
  
  // Alert details
  type: 'limit_warning' | 'limit_reached' | 'subscription_expiring' | 'payment_failed';
  resource?: 'students' | 'teachers' | 'classes' | 'storage';
  threshold?: number; // percentage (e.g., 80, 90, 100)
  currentUsage?: number;
  limit?: number;
  percentage?: number;
  
  // Display
  message: string;
  severity?: 'warning' | 'critical' | 'info';
  
  // Status
  isRead: boolean;
  isDismissed: boolean;
  acknowledged?: boolean;
  acknowledgedAt?: Date;
  
  // Metadata
  createdAt: Date;
  readAt?: Date;
}

export interface SchoolUsage {
  students: number;
  teachers: number;
  classes: number;
  admins: number;
  storage: number; // in MB
}

export interface School {
  id: string;
  name: string;
  code: string;                    // Unique school code (e.g., EDU001)
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  website?: string;
  logoURL?: string;
  principalName?: string;
  
  // Branding (white-label)
  primaryColor: string;
  secondaryColor: string;
  
  // Subscription
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  subscriptionStartDate: Date;
  subscriptionEndDate?: Date;
  
  // Limits based on plan
  maxStudents: number;
  maxTeachers: number;
  maxStorage: number;              // in MB
  
  // Usage tracking (new structure)
  usage?: SchoolUsage;
  
  // Legacy fields (for backward compatibility)
  currentStudents: number;
  currentTeachers: number;
  currentStorage: number;
  
  // Settings
  timezone: string;
  currency: string;
  dateFormat: string;
  currentSession: string;
  
  // Status
  isActive: boolean;
  createdBy: string;               // SuperAdmin uid
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  schoolId?: string;               // Required for non-SuperAdmin users
  schoolIds?: string[];            // For SuperAdmin: list of managed schools
  photoURL?: string;
  phone?: string;
  createdAt: Date;
  lastLogin?: Date;
  isActive: boolean;
}

export interface Student {
  id: string;
  schoolId: string;                // Multi-tenant: school identifier
  studentId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  parentPhone: string;
  parentEmail?: string;
  classId: string;
  sectionId: string;
  rollNumber: string;
  dateOfBirth: Date;
  gender: 'Male' | 'Female' | 'Other';
  address: string;
  photoURL?: string;
  enrollmentDate: Date;
  isActive: boolean;
  // Additional info
  alternatePhone?: string;
  bloodGroup?: string;
  nationality?: string;
  religion?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  emergencyContactName?: string;
  emergencyContact?: string;
  emergencyRelation?: string;
  medicalConditions?: string;
  allergies?: string;
  previousSchool?: string;
  fatherName?: string;
  fatherPhone?: string;
  fatherEmail?: string;
  fatherOccupation?: string;
  fatherWorkplace?: string;
  motherName?: string;
  motherPhone?: string;
  motherEmail?: string;
  motherOccupation?: string;
  motherWorkplace?: string;
  guardianName?: string;
  guardianRelation?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClassAssignment {
  classId: string;
  sectionId: string;
  className?: string;
  sectionName?: string;
}

export interface Teacher {
  id: string;
  schoolId?: string;               // Multi-tenant: school identifier (set by backend from auth token)
  teacherId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  subjects: string[];
  department: string;
  assignedClasses: ClassAssignment[];
  joiningDate: Date;
  gender: 'Male' | 'Female' | 'Other';
  address: string;
  photoURL?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Class {
  id: string;
  schoolId?: string;               // Multi-tenant: school identifier (set by backend from auth token)
  className: string;
  grade: number;
  sections: Section[];
  capacity: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Section {
  id: string;
  sectionName: string;
  capacity: number;
  teacherId?: string;
  teacherName?: string;
  studentsCount: number;
}

export interface Attendance {
  id: string;
  schoolId?: string;               // Multi-tenant: school identifier (set by backend from auth token)
  studentId: string;
  studentName: string;
  classId: string;
  sectionId: string;
  date: Date;
  status: 'Present' | 'Absent' | 'Late' | 'Excused';
  markedBy: string;
  remarks?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Assignment {
  id: string;
  schoolId?: string;               // Multi-tenant: school identifier (set by backend from auth token)
  title: string;
  description: string;
  classId: string;
  sectionId: string;
  className?: string;
  subject: string;
  teacherId: string;
  teacherName?: string;
  dueDate: Date;
  totalMarks: number;
  attachments: string[];
  status: 'Pending' | 'Submitted' | 'Graded';
  submissionsCount?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Result {
  id: string;
  schoolId?: string;               // Multi-tenant: school identifier (set by backend from auth token)
  studentId: string;
  studentName: string;
  rollNumber: string;
  classId: string;
  sectionId: string;
  className?: string;
  examType: string; // 'Midterm', 'Final', 'Unit Test', 'Monthly Test'
  examName: string;
  subject: string;
  marksObtained: number;
  totalMarks: number;
  percentage: number;
  grade: string; // 'A+', 'A', 'B+', 'B', 'C', 'D', 'F'
  status: 'Pass' | 'Fail';
  rank?: number;
  remarks?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuestionBank {
  id: string;
  schoolId?: string;               // Multi-tenant: school identifier (set by backend from auth token)
  subject: string;
  topic: string;
  question: string;
  options?: string[];
  answer: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  classId: string;
  createdBy: string;
  createdAt: Date;
}

export interface Timetable {
  id: string;
  schoolId?: string;               // Multi-tenant: school identifier (set by backend from auth token)
  classId: string;
  sectionId: string;
  className?: string;
  day: string;
  periods: Period[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Period {
  periodNumber: number;
  subject: string;
  teacherId: string;
  teacherName?: string;
  startTime: string;
  endTime: string;
  roomNumber?: string;
}

export interface Event {
  id: string;
  schoolId?: string;               // Multi-tenant: school identifier (set by backend from auth token)
  title: string;
  description: string;
  eventDate: Date;
  endDate?: Date;
  eventType: 'Holiday' | 'Exam' | 'Sports' | 'Cultural' | 'Meeting' | 'Other';
  targetAudience: string[]; // ['All', 'Students', 'Teachers', 'Parents']
  location?: string;
  organizer?: string;
  imageURL?: string;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Fee {
  id: string;
  schoolId?: string;               // Multi-tenant: school identifier (set by backend from auth token)
  studentId: string;
  studentName: string;
  classId: string;
  sectionId: string;
  amount: number;
  dueDate: Date;
  paidDate?: Date;
  status: 'Pending' | 'Paid' | 'Overdue' | 'Partial';
  paymentMode?: string;
  transactionId?: string;
  feeType: string;
  amountPaid?: number;
  remarks?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Library {
  id: string;
  schoolId?: string;               // Multi-tenant: school identifier (set by backend from auth token)
  title: string;
  author: string;
  category: string;
  isbn: string;
  totalCopies: number;
  availableCopies: number;
  issuedCount: number;
  status: 'Available' | 'Issued';
  publishedYear?: number;
  publisher?: string;
  description?: string;
  coverImageURL?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface LibraryTransaction {
  id: string;
  bookId: string;
  studentId: string;
  issueDate: Date;
  dueDate: Date;
  returnDate?: Date;
  status: 'Issued' | 'Returned' | 'Overdue';
  fine?: number;
  issuedBy: string;
}

export interface Carousel {
  id: string;
  title: string;
  description?: string;
  imageURL: string;
  order: number;
  isActive: boolean;
  createdAt: Date;
}

export interface SummaryConfig {
  id: string;
  schoolId: string;
  totalStudents: number;
  totalTeachers: number;
  totalClasses: number;
  attendanceToday: number;
  pendingFees: number;
  upcomingEvents: number;
  lastUpdated: Date;
}

// â”€â”€ White-Label Branding Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type SidebarStyle = 'light' | 'dark' | 'branded';
export type FontFamily = 'inter' | 'poppins' | 'roboto' | 'nunito' | 'outfit';
export type BorderRadiusPreset = 'sharp' | 'rounded' | 'pill';

export interface SchoolBranding {
  // Colors
  primaryColor: string;          // Main brand color (buttons, links, active states)
  secondaryColor: string;        // Lighter complement (backgrounds, badges)
  accentColor: string;           // CTA / highlight color

  // Logo
  logoURL?: string;              // School logo (sidebar / login)
  faviconURL?: string;           // Browser tab icon

  // Appearance
  sidebarStyle: SidebarStyle;    // Sidebar visual theme
  fontFamily: FontFamily;        // App-wide font
  borderRadius: BorderRadiusPreset; // Border-radius profile

  // Login page customisation
  loginTagline?: string;         // Custom tagline on login screen
  loginLogoSize?: 'sm' | 'md' | 'lg'; // Logo size on login page

  // Footer
  footerText?: string;           // Custom footer text (replaces "Â© 2026 SuffaCampus")
}

export interface BrandingPreset {
  id: string;
  name: string;
  colors: { primary: string; secondary: string; accent: string };
  sidebarStyle: SidebarStyle;
  preview: string; // gradient CSS for preview swatch
}

export interface SchoolSettings {
  id: string;
  // School Information
  schoolName: string;
  schoolCode: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  website?: string;
  
  // Branding (white-label)
  logoURL?: string;
  primaryColor: string;
  secondaryColor: string;
  branding?: SchoolBranding;     // Extended branding settings
  
  // Academic Settings
  currentSession: string;      // e.g., "2025-2026"
  sessionStartMonth: number;   // 1-12
  sessionEndMonth: number;     // 1-12
  
  // System Settings
  currency: string;            // INR, USD, etc.
  dateFormat: string;          // DD/MM/YYYY, MM/DD/YYYY
  timeFormat: string;          // 12h, 24h
  timezone: string;            // Asia/Kolkata
  
  // Notification Settings
  emailNotifications: boolean;
  smsNotifications: boolean;
  
  // Other
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// API Layer Types
// =============================================================================

export type ApiKeyStatus = 'active' | 'revoked' | 'expired';

export interface ApiKey {
  id: string;
  schoolId: string;
  name: string;
  key: string;             // masked after creation, e.g., "ek_live_****abc"
  prefix: string;          // "ek_live" or "ek_test"
  status: ApiKeyStatus;
  permissions: ApiPermission[];
  rateLimit: number;       // requests per minute
  lastUsedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type ApiPermission =
  | 'students:read'
  | 'students:write'
  | 'teachers:read'
  | 'teachers:write'
  | 'classes:read'
  | 'classes:write'
  | 'attendance:read'
  | 'attendance:write'
  | 'fees:read'
  | 'fees:write'
  | 'events:read'
  | 'events:write'
  | 'results:read'
  | 'results:write'
  | 'library:read'
  | 'library:write'
  | 'timetable:read'
  | 'timetable:write'
  | 'settings:read'
  | 'settings:write';

export interface ApiKeyCreateRequest {
  name: string;
  permissions: ApiPermission[];
  rateLimit?: number;
  expiresInDays?: number;
}

export interface ApiKeyCreateResponse {
  apiKey: ApiKey;
  rawKey: string;          // full key shown only once at creation
}

export interface ApiUsageStats {
  totalRequests: number;
  requestsToday: number;
  requestsThisMonth: number;
  avgResponseTime: number;   // ms
  errorRate: number;         // percentage
  topEndpoints: { endpoint: string; count: number; avgTime: number }[];
  dailyUsage: { date: string; requests: number; errors: number }[];
}

export interface ApiEndpointDoc {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  summary: string;
  description: string;
  category: string;
  requiresAuth: boolean;
  permissions: ApiPermission[];
  parameters?: ApiParam[];
  requestBody?: {
    contentType: string;
    schema: Record<string, unknown>;
    example: Record<string, unknown>;
  };
  responses: {
    status: number;
    description: string;
    example: Record<string, unknown>;
  }[];
}

export interface ApiParam {
  name: string;
  in: 'path' | 'query' | 'header';
  required: boolean;
  type: string;
  description: string;
}

export interface WebhookConfig {
  id: string;
  schoolId: string;
  url: string;
  events: string[];
  secret: string;
  status: 'active' | 'inactive';
  lastTriggeredAt?: Date;
  failureCount: number;
  createdAt: Date;
}

// =============================================================================
// Webhook Delivery Log Types
// =============================================================================

export type WebhookDeliveryStatus = 'success' | 'failed' | 'retrying' | 'pending';

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  url: string;
  status: WebhookDeliveryStatus;
  statusCode?: number;
  requestHeaders: Record<string, string>;
  requestBody: string;
  responseBody?: string;
  responseTimeMs?: number;
  attempt: number;
  maxAttempts: number;
  nextRetryAt?: Date;
  error?: string;
  createdAt: Date;
}

// =============================================================================
// GDPR / Data Privacy Types
// =============================================================================

export type DataRequestType = 'export' | 'deletion';
export type DataRequestStatus = 'pending' | 'processing' | 'completed' | 'rejected';

export interface DataRequest {
  id: string;
  schoolId: string;
  requestedBy: string;
  requestedByName: string;
  type: DataRequestType;
  scope: string[];  // e.g. ['students', 'fees', 'attendance']
  status: DataRequestStatus;
  reason?: string;
  downloadUrl?: string;
  expiresAt?: Date;
  processedAt?: Date;
  createdAt: Date;
}

export interface PrivacySettings {
  dataRetentionDays: number;
  anonymizeInactiveAfterDays: number;
  autoDeleteBackupsAfterDays: number;
  consentRequired: boolean;
  cookieBannerEnabled: boolean;
}

// =============================================================================
// Session Management Types
// =============================================================================

export interface UserSession {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  device: string;
  browser: string;
  os: string;
  ipAddress: string;
  location?: string;
  lastActiveAt: Date;
  createdAt: Date;
  isCurrent: boolean;
}

// =============================================================================
// Role Permission Matrix Types
// =============================================================================

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'export';

export interface RolePermission {
  module: string;
  actions: Record<PermissionAction, boolean>;
}

export interface RolePermissionMatrix {
  role: UserRole;
  permissions: RolePermission[];
}


