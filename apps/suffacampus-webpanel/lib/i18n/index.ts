/* ------------------------------------------------------------------ */
/*  i18n " Lightweight internationalisation for SuffaCampus WebPanel    */
/*                                                                     */
/*  Supported locales:                                                 */
/*    en  " English (default)                                          */
/*    hi  "    (Hindi)                                             */
/*    ta  "    (Tamil)                                             */
/*    te  "  -   (Telugu)                                            */
/*    kn  " *   (Kannada)                                           */
/*    bn  "    (Bengali)                                           */
/* ------------------------------------------------------------------ */

export type Locale = "en" | "hi" | "ta" | "te" | "kn" | "bn";

export const SUPPORTED_LOCALES: { code: Locale; label: string; nativeLabel: string }[] = [
  { code: "en", label: "English",  nativeLabel: "English" },
  { code: "hi", label: "Hindi",    nativeLabel: "" },
  { code: "ta", label: "Tamil",    nativeLabel: "" },
  { code: "te", label: "Telugu",   nativeLabel: " - " },
  { code: "kn", label: "Kannada",  nativeLabel: "*" },
  { code: "bn", label: "Bengali",  nativeLabel: "" },
];

/* ---------- Translation key structure -------------------------------- */

export interface TranslationKeys {
  // Navigation / sidebar
  nav: {
    dashboard: string;
    students: string;
    teachers: string;
    classes: string;
    attendance: string;
    results: string;
    fees: string;
    library: string;
    timetable: string;
    events: string;
    reports: string;
    settings: string;
    subscription: string;
    branding: string;
    api: string;
    schools: string;
    logout: string;
  };

  // Section headings in sidebar
  sections: {
    overview: string;
    academics: string;
    finance: string;
    resources: string;
    settings: string;
    admin: string;
  };

  // Common UI
  common: {
    save: string;
    cancel: string;
    delete: string;
    edit: string;
    add: string;
    search: string;
    filter: string;
    export: string;
    import: string;
    loading: string;
    noData: string;
    confirm: string;
    back: string;
    next: string;
    previous: string;
    submit: string;
    reset: string;
    close: string;
    refresh: string;
    download: string;
    upload: string;
    view: string;
    actions: string;
    status: string;
    date: string;
    name: string;
    email: string;
    phone: string;
    address: string;
    selectAll: string;
    deselectAll: string;
    showing: string;
    of: string;
    entries: string;
    rowsPerPage: string;
    yes: string;
    no: string;
    active: string;
    inactive: string;
  };

  // Auth
  auth: {
    login: string;
    forgotPassword: string;
    resetPassword: string;
    emailLabel: string;
    passwordLabel: string;
    loginButton: string;
    sendResetLink: string;
    backToLogin: string;
    welcome: string;
    signInSubtitle: string;
  };

  // Dashboard
  dashboard: {
    title: string;
    totalStudents: string;
    totalTeachers: string;
    totalClasses: string;
    attendanceRate: string;
    feeCollection: string;
    recentActivity: string;
    upcomingEvents: string;
    quickActions: string;
  };

  // Students
  students: {
    title: string;
    addStudent: string;
    editStudent: string;
    studentDetails: string;
    rollNumber: string;
    class: string;
    section: string;
    gender: string;
    dob: string;
    guardian: string;
    guardianPhone: string;
    bloodGroup: string;
    admissionDate: string;
  };

  // Teachers
  teachers: {
    title: string;
    addTeacher: string;
    editTeacher: string;
    subject: string;
    qualification: string;
    experience: string;
    joiningDate: string;
    salary: string;
    department: string;
  };

  // Fees
  fees: {
    title: string;
    feeType: string;
    amount: string;
    dueDate: string;
    paid: string;
    pending: string;
    overdue: string;
    totalCollected: string;
    totalPending: string;
    paymentHistory: string;
    recordPayment: string;
  };

  // Attendance
  attendance: {
    title: string;
    present: string;
    absent: string;
    late: string;
    excused: string;
    markAttendance: string;
    attendanceReport: string;
    todayAttendance: string;
    selectDate: string;
  };

  // Settings
  settings: {
    title: string;
    general: string;
    schoolInfo: string;
    academicSession: string;
    notifications: string;
    language: string;
    selectLanguage: string;
    appearance: string;
    timezone: string;
    currency: string;
    saveChanges: string;
    resetDefaults: string;
  };
}

/* ---------- Flat dot-notation key ------------------------------------- */

type FlattenKeys<T, Prefix extends string = ""> = T extends object
  ? {
      [K in keyof T & string]: FlattenKeys<
        T[K],
        Prefix extends "" ? K : `${Prefix}.${K}`
      >;
    }[keyof T & string]
  : Prefix;

export type TranslationKey = FlattenKeys<TranslationKeys>;

/* ---------- Loader ---------------------------------------------------- */

const localeModules: Record<Locale, () => Promise<{ default: TranslationKeys }>> = {
  en: () => import("./locales/en"),
  hi: () => import("./locales/hi"),
  ta: () => import("./locales/ta"),
  te: () => import("./locales/te"),
  kn: () => import("./locales/kn"),
  bn: () => import("./locales/bn"),
};

const cache = new Map<Locale, TranslationKeys>();

export async function loadTranslations(locale: Locale): Promise<TranslationKeys> {
  if (cache.has(locale)) return cache.get(locale)!;
  const mod = await localeModules[locale]();
  cache.set(locale, mod.default);
  return mod.default;
}

/* ---------- Resolve nested key ---------------------------------------- */

export function resolveKey(translations: TranslationKeys, key: string): string {
  const parts = key.split(".");
  // eslint-disable-next-line
  let current: any = translations;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return key;
    current = current[part];
  }
  return typeof current === "string" ? current : key;
}

/* ---------- Persistence ----------------------------------------------- */

const LOCALE_STORAGE_KEY = "SuffaCampus_locale";

export function getPersistedLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null;
  if (stored && SUPPORTED_LOCALES.some((l) => l.code === stored)) return stored;
  return "en";
}

export function persistLocale(locale: Locale): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCALE_STORAGE_KEY, locale);
}

