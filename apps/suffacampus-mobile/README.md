<p align="center">
  <img src="./assets/images/icon.png" alt="SuffaCampus Logo" width="120" height="120">
</p>

<h1 align="center">SuffaCampus</h1>

<p align="center">
  <strong>A Modern School ERP Mobile Application</strong>
</p>

<p align="center">
  <a href="#features">Features</a> â€¢
  <a href="#tech-stack">Tech Stack</a> â€¢
  <a href="#architecture">Architecture</a> â€¢
  <a href="#installation">Installation</a> â€¢
  <a href="#usage">Usage</a> â€¢
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-iOS%20%7C%20Android%20%7C%20Web-blue" alt="Platform">
  <img src="https://img.shields.io/badge/expo-54.0-000020?logo=expo" alt="Expo">
  <img src="https://img.shields.io/badge/react--native-0.81-61DAFB?logo=react" alt="React Native">
  <img src="https://img.shields.io/badge/firebase-12.8-FFCA28?logo=firebase" alt="Firebase">
  <img src="https://img.shields.io/badge/typescript-5.9-3178C6?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/license-Private-red" alt="License">
</p>

---

## Overview

**SuffaCampus** is a comprehensive, cross-platform mobile application designed to streamline school management and enhance communication between students, teachers, parents, and administrators. Built with modern technologies and a premium user experience in mind, SuffaCampus serves as a centralized hub for all academic activities.

### What Problem Does It Solve?

Traditional school management relies on fragmented systemsâ€”paper records, multiple apps, and disconnected communication channels. SuffaCampus addresses this by providing:

- **Unified Platform**: Single application for attendance, assignments, results, fees, and more
- **Real-time Sync**: Instant updates across all stakeholders via Firebase
- **Role-based Access**: Tailored experiences for students, teachers, and administrators
- **Offline Support**: Seamless functionality with or without internet connectivity
- **Mobile-first Design**: Native experience on iOS, Android, and web

### Target Audience

| Role | Use Case |
|------|----------|
| **Students** | View grades, track attendance, access assignments, pay fees, browse library |
| **Teachers** | Mark attendance, create assignments, manage grades, schedule events |
| **Administrators** | Manage users, configure timetables, oversee fees, control system settings |
| **Parents** | Monitor child's progress, view fee status, receive notifications |

---

## Features

### Core Modules

#### ðŸ“Š Dashboard
- Role-specific personalized dashboards
- Today's summary with configurable widgets
- Event carousel and announcements
- Quick action shortcuts

#### âœ… Attendance Management
- Real-time attendance tracking
- Mark attendance by class/subject (teachers)
- View attendance history and statistics (students)
- Percentage calculations and visual analytics

#### ðŸ“ Assignments
- Create and distribute assignments with deadlines
- File attachment support via document picker
- Subject/class/section filtering
- Submission tracking and notifications

#### ðŸ“ˆ Results & Grades
- Comprehensive result management
- Term-wise and subject-wise breakdowns
- Grade calculation and GPA tracking
- Export and share functionality

#### ðŸ’° Fees Management
- Fee structure configuration
- Payment history and receipts
- Pending dues notifications
- Multi-term fee tracking

#### ðŸ“š Library System
- Digital resource management
- Category-based organization
- Teacher content upload
- Student resource access

#### â“ Question Bank
- Curated question repository
- Subject and topic categorization
- Teacher contribution system
- Student practice mode

#### ðŸ“… Timetable
- Class schedule management
- Teacher schedule view
- Subject and room assignments
- Admin configuration panel

#### ðŸ“† Events & Activities
- School event calendar
- Activity announcements
- Event management for administrators
- Push notifications (planned)

#### ðŸ‘¤ User Profiles
- Complete profile management
- Photo upload capability
- Academic history
- Settings and preferences

---

## Tech Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| **React Native** | 0.81.5 | Cross-platform mobile framework |
| **Expo** | 54.0 | Development toolchain and OTA updates |
| **Expo Router** | 6.0 | File-based navigation and routing |
| **TypeScript** | 5.9 | Type-safe development |
| **React** | 19.1 | UI component library |

### Backend & Database

| Technology | Purpose |
|------------|---------|
| **Firebase** | Backend-as-a-Service platform |
| **Cloud Firestore** | NoSQL document database with real-time sync |
| **Firebase Authentication** | User authentication and session management |
| **Firestore Security Rules** | Role-based access control |

### Key Libraries

| Library | Purpose |
|---------|---------|
| `expo-router` | File-based routing with typed routes |
| `react-native-reanimated` | High-performance animations |
| `react-native-gesture-handler` | Native gesture system |
| `expo-image-picker` | Photo capture and selection |
| `expo-document-picker` | File attachment support |
| `expo-linear-gradient` | Gradient backgrounds |
| `@react-native-async-storage/async-storage` | Local storage persistence |
| `@expo/vector-icons` | Icon library (MaterialCommunityIcons) |

### Development Tools

| Tool | Purpose |
|------|---------|
| **ESLint** | Code linting and formatting |
| **EAS Build** | Cloud builds for iOS/Android |
| **EAS Update** | OTA updates distribution |
| **VS Code** | Recommended IDE |

---

## Architecture

### System Architecture

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                         Client Layer                             â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”           â”‚
â”‚  â”‚   iOS App    â”‚  â”‚ Android App  â”‚  â”‚   Web App    â”‚           â”‚
â”‚  â”‚  (Expo Go)   â”‚  â”‚  (Expo Go)   â”‚  â”‚  (Browser)   â”‚           â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”˜           â”‚
â”‚         â”‚                 â”‚                 â”‚                    â”‚
â”‚         â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                    â”‚
â”‚                           â”‚                                      â”‚
â”‚         â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                    â”‚
â”‚         â”‚        React Native Core          â”‚                    â”‚
â”‚         â”‚    (Expo Router + TypeScript)     â”‚                    â”‚
â”‚         â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                    â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                            â”‚
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                           â–¼                                      â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚  â”‚                  Firebase Platform                          â”‚ â”‚
â”‚  â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤ â”‚
â”‚  â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚ â”‚
â”‚  â”‚  â”‚    Auth     â”‚  â”‚  Firestore  â”‚  â”‚  Security Rules     â”‚  â”‚ â”‚
â”‚  â”‚  â”‚  Service    â”‚  â”‚  Database   â”‚  â”‚  (RBAC)             â”‚  â”‚ â”‚
â”‚  â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚ â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â”‚                       Backend Layer                              â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### Data Flow

```
User Action â†’ Component â†’ Firebase SDK â†’ Firestore â†’ Real-time Listener â†’ UI Update
     â†“
AsyncStorage (Offline Cache) â†â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### Authentication Flow

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”     â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”     â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Login UI  â”‚â”€â”€â”€â”€â–¶â”‚ Firebase Authâ”‚â”€â”€â”€â”€â–¶â”‚ Firestore DB  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜     â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜     â””â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”˜
                                                â”‚
                   â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”             â”‚
                   â”‚ AsyncStorage â”‚â—€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                   â”‚ (Session)    â”‚    (Fetch user role/data)
                   â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”˜
                          â”‚
                          â–¼
              â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
              â”‚ Role-based Navigation â”‚
              â”‚ Student â”‚ Teacher â”‚ Admin
              â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

---

## Folder Structure

```
suffacampus-mobile/
â”‚
â”œâ”€â”€ app/                          # Application screens (file-based routing)
â”‚   â”œâ”€â”€ _layout.tsx               # Root layout with navigation setup
â”‚   â”œâ”€â”€ index.tsx                 # Entry point (redirects to login)
â”‚   â”œâ”€â”€ login.tsx                 # Authentication screen
â”‚   â”œâ”€â”€ school-select.tsx         # Multi-school selection
â”‚   â”‚
â”‚   â”œâ”€â”€ (student)/                # Student route group (parallel layouts)
â”‚   â”‚   â”œâ”€â”€ activities.tsx        # Student activities view
â”‚   â”‚   â”œâ”€â”€ attendance-screen.tsx # Detailed attendance view
â”‚   â”‚   â””â”€â”€ ...
â”‚   â”‚
â”‚   â”œâ”€â”€ (teacher)/                # Teacher route group
â”‚   â”‚   â”œâ”€â”€ attendance-screen.tsx # Attendance marking
â”‚   â”‚   â””â”€â”€ ...
â”‚   â”‚
â”‚   â”œâ”€â”€ student/                  # Student module screens
â”‚   â”‚   â”œâ”€â”€ _layout.tsx           # Student layout wrapper
â”‚   â”‚   â”œâ”€â”€ dashboard.tsx         # Student home screen
â”‚   â”‚   â”œâ”€â”€ menu.tsx              # Navigation menu
â”‚   â”‚   â”œâ”€â”€ attendance.tsx        # Attendance overview
â”‚   â”‚   â”œâ”€â”€ assignments.tsx       # Assignment list and details
â”‚   â”‚   â”œâ”€â”€ results.tsx           # Academic results
â”‚   â”‚   â”œâ”€â”€ fees.tsx              # Fee management
â”‚   â”‚   â”œâ”€â”€ library.tsx           # Library resources
â”‚   â”‚   â”œâ”€â”€ question-bank.tsx     # Practice questions
â”‚   â”‚   â”œâ”€â”€ timetable.tsx         # Class schedule
â”‚   â”‚   â”œâ”€â”€ activity.tsx          # Extra-curricular activities
â”‚   â”‚   â””â”€â”€ profile.tsx           # User profile
â”‚   â”‚
â”‚   â”œâ”€â”€ teacher/                  # Teacher module screens
â”‚   â”‚   â”œâ”€â”€ _layout.tsx           # Teacher layout wrapper
â”‚   â”‚   â”œâ”€â”€ dashboard.tsx         # Teacher home screen
â”‚   â”‚   â”œâ”€â”€ menu.tsx              # Navigation menu
â”‚   â”‚   â”œâ”€â”€ attendance.tsx        # Attendance management
â”‚   â”‚   â”œâ”€â”€ assignments.tsx       # Assignment creation/management
â”‚   â”‚   â”œâ”€â”€ results.tsx           # Grade entry
â”‚   â”‚   â”œâ”€â”€ library.tsx           # Resource management
â”‚   â”‚   â”œâ”€â”€ question-bank.tsx     # Question management
â”‚   â”‚   â”œâ”€â”€ add-question.tsx      # New question form
â”‚   â”‚   â”œâ”€â”€ events.tsx            # Event management
â”‚   â”‚   â”œâ”€â”€ schedule.tsx          # Personal schedule
â”‚   â”‚   â”œâ”€â”€ activity.tsx          # Activity tracking
â”‚   â”‚   â””â”€â”€ profile.tsx           # Profile settings
â”‚   â”‚
â”‚   â””â”€â”€ admin/                    # Administrator module screens
â”‚       â”œâ”€â”€ dashboard.tsx         # Admin control center
â”‚       â”œâ”€â”€ manage-students.tsx   # Student CRUD operations
â”‚       â”œâ”€â”€ manage-teachers.tsx   # Teacher CRUD operations
â”‚       â”œâ”€â”€ attendance.tsx        # Attendance oversight
â”‚       â”œâ”€â”€ fees.tsx              # Fee configuration
â”‚       â”œâ”€â”€ library.tsx           # Library administration
â”‚       â”œâ”€â”€ timetable.tsx         # Timetable configuration
â”‚       â”œâ”€â”€ events.tsx            # Event administration
â”‚       â”œâ”€â”€ carousel.tsx          # Dashboard carousel management
â”‚       â””â”€â”€ summary-config.tsx    # Widget configuration
â”‚
â”œâ”€â”€ components/                   # Reusable UI components
â”‚   â”œâ”€â”€ AttendanceCard.tsx        # Attendance display widget
â”‚   â”œâ”€â”€ BottomNav.tsx             # Bottom navigation bar
â”‚   â”œâ”€â”€ BottomSheet.tsx           # Modal bottom sheet
â”‚   â”œâ”€â”€ Card.tsx                  # Base card component
â”‚   â”œâ”€â”€ CreateAssignmentForm.tsx  # Assignment creation wizard
â”‚   â”œâ”€â”€ IconCircle.tsx            # Circular icon wrapper
â”‚   â”œâ”€â”€ LibraryForm.tsx           # Library item form
â”‚   â”œâ”€â”€ ListItem.tsx              # Standard list item
â”‚   â”œâ”€â”€ MenuTile.tsx              # Menu grid tile
â”‚   â”œâ”€â”€ ModalPortal.tsx           # Modal rendering utility
â”‚   â”œâ”€â”€ ProfileHeader.tsx         # Profile page header
â”‚   â”œâ”€â”€ ResultForm.tsx            # Result entry form
â”‚   â”œâ”€â”€ ScheduleForm.tsx          # Schedule entry form
â”‚   â”œâ”€â”€ Screen.tsx                # Base screen wrapper
â”‚   â”œâ”€â”€ Section.tsx               # Content section wrapper
â”‚   â”œâ”€â”€ SectionTitle.tsx          # Section heading
â”‚   â””â”€â”€ AssignmentPickers.tsx     # Date/time pickers
â”‚
â”œâ”€â”€ config/                       # Configuration files
â”‚   â””â”€â”€ ...
â”‚
â”œâ”€â”€ data/                         # Static data and mock APIs
â”‚   â”œâ”€â”€ attendance-api.ts         # Attendance data helpers
â”‚   â”œâ”€â”€ attendance.js             # Mock attendance data
â”‚   â””â”€â”€ class.js                  # Class information
â”‚
â”œâ”€â”€ hooks/                        # Custom React hooks
â”‚   â””â”€â”€ useAuth.ts                # Authentication hook
â”‚
â”œâ”€â”€ services/                     # Business logic layer
â”‚   â””â”€â”€ attendanceService.ts      # Attendance operations
â”‚
â”œâ”€â”€ assets/                       # Static assets
â”‚   â””â”€â”€ images/                   # App icons, splash screens
â”‚
â”œâ”€â”€ scripts/                      # Utility scripts
â”‚   â””â”€â”€ reset-project.js          # Project reset utility
â”‚
â”œâ”€â”€ firebase.ts                   # Firebase configuration
â”œâ”€â”€ firestore.rules               # Firestore security rules
â”œâ”€â”€ firestore.indexes.json        # Firestore indexes
â”œâ”€â”€ firebase.json                 # Firebase CLI config
â”œâ”€â”€ app.json                      # Expo configuration
â”œâ”€â”€ package.json                  # Dependencies and scripts
â”œâ”€â”€ tsconfig.json                 # TypeScript configuration
â”œâ”€â”€ eslint.config.js              # ESLint configuration
â””â”€â”€ eas.json                      # EAS Build configuration
```

---

## UI/UX Design Principles

### Design System

SuffaCampus follows a strict design token system for consistency:

| Token | Value | Usage |
|-------|-------|-------|
| **Primary Color** | `#E6F4FE` | Backgrounds, highlights |
| **Accent Color** | `#4A90D9` | Interactive elements |
| **Surface** | `#FFFFFF` | Card backgrounds |
| **Text Primary** | `#1A1A1A` | Headings |
| **Text Secondary** | `#6B7280` | Body text, labels |
| **Border Radius (Hero)** | `16px` | Hero cards |
| **Border Radius (Card)** | `12px` | Standard cards |
| **Border Radius (Inner)** | `8px` | Nested elements |

### Design Patterns

- **Card-based Layout**: Content organized in elevated, rounded cards
- **Visual Hierarchy**: Distinct elevation levels (hero â†’ section â†’ inner)
- **Soft UI**: Gentle shadows, subtle gradients, calm color palette
- **Native Feel**: Platform-specific behaviors (iOS/Android)
- **Parallax Scrolling**: Hero cards with subtle motion effect

### Accessibility

- High contrast text for readability
- Touch targets minimum 44x44 points
- Screen reader-friendly labels
- Consistent icon system (MaterialCommunityIcons)

### Responsiveness

- Scales from iPhone SE to iPad Pro
- Web support with responsive breakpoints
- Safe area handling for notched devices

---

## Installation

### Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Node.js** | â‰¥ 18.x | LTS recommended |
| **npm** | â‰¥ 9.x | Comes with Node.js |
| **Expo CLI** | Latest | `npx expo` |
| **Git** | Latest | Version control |
| **VS Code** | Latest | Recommended IDE |

#### Optional (for native builds)

| Requirement | Platform | Notes |
|-------------|----------|-------|
| **Xcode** | macOS only | iOS simulator |
| **Android Studio** | All | Android emulator |
| **Expo Go** | Mobile | Physical device testing |

### Installation Steps

1. **Clone the repository**

   ```bash
  git clone https://github.com/your-org/suffacampus-mobile.git
  cd suffacampus-mobile
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure Firebase** *(optional: use existing config)*

   The app includes a pre-configured Firebase project. To use your own:
   
   ```typescript
   // firebase.ts
   const firebaseConfig = {
     apiKey: "YOUR_API_KEY",
     authDomain: "YOUR_AUTH_DOMAIN",
     projectId: "YOUR_PROJECT_ID",
     storageBucket: "YOUR_STORAGE_BUCKET",
     messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
     appId: "YOUR_APP_ID",
     measurementId: "YOUR_MEASUREMENT_ID",
   };
   ```

4. **Start the development server**

   ```bash
   npx expo start
   ```

5. **Run on your device**

   - **Expo Go**: Scan QR code with Expo Go app
   - **iOS Simulator**: Press `i` in terminal
   - **Android Emulator**: Press `a` in terminal
   - **Web Browser**: Press `w` in terminal

---

## Usage

### Running the Application

| Command | Description |
|---------|-------------|
| `npm start` | Start Expo development server |
| `npm run android` | Start on Android emulator |
| `npm run ios` | Start on iOS simulator |
| `npm run web` | Start in web browser |
| `npm run lint` | Run ESLint checks |
| `npm run reset-project` | Reset to blank project |

### Common Workflows

#### Student Login

1. Launch the application
2. Select your school (if multi-school enabled)
3. Enter credentials (username/password)
4. Select "Student" role
5. Access dashboard with personalized content

#### Teacher Attendance Workflow

1. Login as teacher
2. Navigate to **Attendance** from dashboard
3. Select class and subject
4. Mark present/absent for each student
5. Submit attendance (auto-syncs to Firebase)

#### Admin User Management

1. Login as administrator
2. Navigate to **Manage Students** or **Manage Teachers**
3. Add/Edit/Delete user records
4. Configure roles and permissions

---

## Environment Variables

SuffaCampus uses Firebase configuration embedded in `firebase.ts`. For production deployments, consider using environment variables:

| Variable | Description | Required |
|----------|-------------|----------|
| `FIREBASE_API_KEY` | Firebase API key | Yes |
| `FIREBASE_AUTH_DOMAIN` | Auth domain | Yes |
| `FIREBASE_PROJECT_ID` | Project identifier | Yes |
| `FIREBASE_STORAGE_BUCKET` | Cloud Storage bucket | Yes |
| `FIREBASE_MESSAGING_SENDER_ID` | FCM sender ID | Yes |
| `FIREBASE_APP_ID` | Application ID | Yes |
| `FIREBASE_MEASUREMENT_ID` | Analytics ID | No |

For EAS builds, configure secrets in `eas.json` or Expo dashboard.

---

## Firestore Data Model

### Collections

| Collection | Description | Access |
|------------|-------------|--------|
| `users` | User profiles and authentication data | Public read, authenticated write |
| `students` | Student records | Authenticated read, admin write |
| `teachers` | Teacher records | Authenticated read, admin write |
| `attendance` | Attendance records | Authenticated read, teacher/admin write |
| `assignments` | Assignment details | Authenticated read, teacher/admin write |
| `results` | Academic results | Authenticated read, teacher/admin write |
| `questionBank` | Question repository | Authenticated read, teacher/admin write |
| `timetable` | Class schedules | Public read, admin write |
| `events` | School events | Public read, admin write |
| `fees` | Fee records | Authenticated read, admin write |
| `library` | Library resources | Authenticated read, teacher/admin write |
| `carousel` | Dashboard banners | Public read, admin write |
| `summaryConfig` | Dashboard widgets | Authenticated read, admin write |

### Security Rules

Role-based access control is enforced via Firestore Security Rules. See `firestore.rules` for complete configuration.

---

## Testing

### Running Tests

```bash
# Unit tests (coming soon)
npm test

# Type checking
npx tsc --noEmit

# Linting
npm run lint
```

### Manual Testing

1. Test on multiple devices using Expo Go
2. Verify offline functionality
3. Test role-based access for each user type
4. Validate form submissions and data persistence

---

## Deployment

### Development Builds

Use Expo Go for rapid development iteration.

### Preview Builds (EAS)

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Build for internal testing
eas build --profile preview --platform all
```

### Production Builds

```bash
# Production build for app stores
eas build --profile production --platform all

# Submit to app stores
eas submit --platform android
eas submit --platform ios
```

### OTA Updates

```bash
# Push updates without new build
eas update --branch production --message "Bug fixes"
```

### Web Deployment

```bash
# Export static web build
npx expo export -p web

# Deploy to hosting service (Netlify, Vercel, etc.)
```

---

## Future Enhancements

### Planned Features

| Feature | Priority | Status |
|---------|----------|--------|
| Push Notifications (FCM) | High | Planned |
| Parent Portal | High | Planned |
| Chat/Messaging System | Medium | Planned |
| Biometric Authentication | Medium | Planned |
| Report Generation (PDF) | Medium | Planned |
| Multi-language Support (i18n) | Medium | Planned |
| Dark Mode | Low | Planned |
| Offline-first Architecture | High | In Progress |
| Analytics Dashboard | Low | Planned |

### Technical Improvements

- [ ] Unit and integration test suite
- [ ] E2E testing with Detox
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Performance monitoring
- [ ] Error tracking (Sentry)
- [ ] API documentation (OpenAPI)

---

## Contributing

We welcome contributions from the community. Please follow these guidelines:

### Getting Started

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Guidelines

- Follow the existing code style and TypeScript conventions
- Use `StyleSheet.create()` for all styles (no inline styles)
- Maintain strict typing (avoid `any`)
- Only use MaterialCommunityIcons for icons
- Write descriptive commit messages
- Update documentation for significant changes

### Code Review Criteria

- [ ] TypeScript types are properly defined
- [ ] Components follow established patterns
- [ ] No console.log statements in production code
- [ ] Handles loading/error states appropriately
- [ ] Responsive across device sizes

---

## Documentation

### Additional Guides

| Document | Description |
|----------|-------------|
| [Admin Setup Guide](./ADMIN_CONFIG_SETUP.md) | Administrator configuration |
| [User Creation Guide](./ADMIN_USER_CREATION_GUIDE.md) | Creating user accounts |
| [Carousel Setup](./CAROUSEL_SETUP.md) | Dashboard carousel configuration |
| [Events Setup](./EVENTS_SETUP.md) | Event management guide |
| [Timetable Setup](./TIMETABLE_ADMIN_SETUP.md) | Timetable configuration |
| [Question Bank Setup](./QUESTION_BANK_SETUP.md) | Question bank management |
| [Firebase Permissions](./FIREBASE_PERMISSION_FIX.md) | Fixing permission issues |
| [School Branding](./SCHOOL_BRANDING_GUIDE.md) | Customizing school branding |

---

## License

This project is **proprietary software**. All rights reserved.

Unauthorized copying, modification, distribution, or use of this software is strictly prohibited without express written permission from the project owner.

---

## Credits & Acknowledgments

### Development Team

- **SuffaCampus Team** â€” Design, Development, and Maintenance

### Technologies

- [Expo](https://expo.dev/) â€” React Native development platform
- [Firebase](https://firebase.google.com/) â€” Backend services
- [React Native](https://reactnative.dev/) â€” Mobile framework
- [TypeScript](https://www.typescriptlang.org/) â€” Programming language

### Resources

- [Expo Documentation](https://docs.expo.dev/)
- [React Native Documentation](https://reactnative.dev/docs/getting-started)
- [Firebase Documentation](https://firebase.google.com/docs)
- [Expo Router Documentation](https://docs.expo.dev/router/introduction/)

---

<p align="center">
  <sub>Built with â¤ï¸ using Expo and React Native</sub>
</p>

<p align="center">
  <sub>Â© 2026 SuffaCampus. All rights reserved.</sub>
</p>

