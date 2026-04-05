# Question Bank System - Multi-Format Support

## Overview
The question bank system provides a comprehensive solution for teachers to add various types of educational content (MCQs, Images, PDFs, Documents) that automatically sync with students through Firebase.

## Features Implemented

### Teacher Side (add-question.tsx)

#### 1. **Content Type Selection**
Teachers can choose from 4 content types:
- **MCQ** - Multiple choice questions with 4 options
- **Image** - Visual content (diagrams, charts, illustrations)
- **PDF** - Document files for study materials
- **Document** - Other document formats

Visual type selector with icons:
- Format List icon for MCQ
- Image icon for pictures
- PDF icon for PDF files
- Document icon for general files

#### 2. **Subject & Class Selection**
- Horizontal scrollable chips for quick subject selection
- Available subjects: Mathematics, Physics, Chemistry, Biology, English, Computer Science, History, Geography
- Class targeting: 9A, 9B, 9C, 10A, 10B, 10C, 11A, 11B, 12A, 12B
- Visual feedback with active state (blue highlight)

#### 3. **Common Fields (All Types)**
- **Title Field**: Descriptive name for the content
- **Description Field**: Optional brief description
- Dynamic placeholders based on selected type

#### 4. **MCQ-Specific Features**
- **Question Field**: Multi-line text area
- **Four Options**: Labeled A, B, C, D with individual inputs
- **Correct Answer Selection**: Visual buttons with icons
  - Circle outline for unselected
  - Check circle icon for selected option
- Complete validation for all fields

#### 5. **File Upload Features** (Image/PDF/Document)
- **Image Picker**: 
  - Camera roll integration
  - Image preview before upload
  - Automatic quality optimization (0.8)
  - Supports JPG, PNG formats
  
- **Document Picker**:
  - Native file browser integration
  - PDF filtering (when PDF type selected)
  - File size display
  - Document icon preview
  
- **File Management**:
  - Visual preview for images
  - File name and size display for documents
  - Remove/change file option
  - Upload progress indicator

#### 6. **Firebase Storage Integration**
- Automatic file upload to Firebase Storage
- Organized folder structure: `questionBank/timestamp_filename`
- Download URL generation
- File metadata storage (name, type, size, URL)
- Progress feedback during upload

#### 7. **Modern UI/UX**
- Card-based layout with clean design
- Type-specific forms (conditional rendering)
- Required fields marked with asterisks (*)
- Clear visual hierarchy
- Responsive touch feedback
- Upload progress indicators
- Professional styling with shadows and borders

#### 8. **Smart Validation**
- Type-specific validation rules
- Subject selection required
- Title required for all types
- MCQ: Question + 4 options + correct answer required
- Files: File selection required
- User-friendly error messages

#### 9. **Save & Upload Functionality**
- Uploads files to Firebase Storage first
- Then saves metadata to Firestore
- Shows progress: "Uploading..." → "Saving..."
- Success confirmation with options:
  - "Add Another" - Resets form
  - "Go Back" - Returns to previous screen
- Clear success messages

### Student Side (question-bank.tsx)

#### How Students View Content
- All content types displayed in unified interface
- **MCQ Questions**:
  - Question text with options
  - Interactive attempt system
  - Immediate feedback on answers
  
- **Images**:
  - Full-size image display
  - Zoom/pinch capabilities
  - Subject and title labels
  
- **PDF/Documents**:
  - File information display
  - Download/open functionality
  - File size and type info
  
- Metadata shown:
  - Subject badge with color coding
  - Content title
  - Upload date and teacher name
  - Class information
  - Description (if provided)

## Firebase Data Structure

### MCQ Questions
```typescript
{
  type: "mcq",
  subject: string,
  class: string,
  title: string,
  description: string,
  question: string,
  options: string[],          // Array of 4 options
  answer: string,             // Correct answer text
  correctOption: string,      // Letter (A/B/C/D)
  uploadedBy: string,
  uploadedDate: string,       // ISO timestamp
  createdAt: string,
  teacherId: string
}
```

### File-Based Content (Image/PDF/Document)
```typescript
{
  type: "image" | "pdf" | "document",
  subject: string,
  class: string,
  title: string,
  description: string,
  fileUrl: string,            // Firebase Storage URL
  fileName: string,           // Original filename
  fileType: string,           // MIME type
  fileSize: number,           // Size in bytes
  uploadedBy: string,
  uploadedDate: string,
  createdAt: string,
  teacherId: string
}
```

## Usage Flow

### Adding MCQ Questions
1. Navigate to Question Bank → Add Question
2. Select "MCQ" type
3. Choose subject and class
4. Enter title and optional description
5. Type the question
6. Fill in all four options
7. Select correct answer (A/B/C/D)
8. Tap "Save Question"

### Adding Image Content
1. Navigate to Question Bank → Add Question
2. Select "Image" type
3. Choose subject and class
4. Enter title and description
5. Tap to select image from gallery
6. Preview the selected image
7. Tap "Upload & Save"
8. Wait for upload progress

### Adding PDF/Document Content
1. Navigate to Question Bank → Add Question
2. Select "PDF" or "Document" type
3. Choose subject and class
4. Enter title and description
5. Tap to browse and select file
6. Review file name and size
7. Tap "Upload & Save"
8. Wait for upload to complete

### Student Access
1. Open Question Bank in student app
2. Content automatically loads from Firebase
3. Filter by subject/type if needed
4. For MCQs: Attempt questions and get instant feedback
5. For files: View images or download documents
6. All content shows metadata (subject, date, teacher)

## Benefits

✅ **Multi-Format Support**: MCQs, Images, PDFs, and Documents
✅ **User-Friendly**: Intuitive interface for all content types
✅ **Real-Time Sync**: Content appears immediately for students
✅ **Organized**: Subject and class-based categorization
✅ **File Management**: Automatic upload to Firebase Storage
✅ **Validated**: Comprehensive form validation prevents errors
✅ **Professional**: Modern UI matching app design language
✅ **Scalable**: Easy to add more content types in the future
✅ **Progress Feedback**: Upload and save progress indicators
✅ **Flexible**: Teachers can share various educational materials

## Technical Details

- **Framework**: React Native with Expo
- **Database**: Firebase Firestore (metadata)
- **Storage**: Firebase Storage (files)
- **Image Picker**: expo-image-picker (camera roll access)
- **Document Picker**: expo-document-picker (file browser)
- **Icons**: MaterialCommunityIcons
- **Styling**: Modern card-based design
- **Type Safety**: Full TypeScript implementation
- **State Management**: React hooks (useState)
- **Navigation**: Expo Router
- **File Upload**: Blob-based upload with progress tracking

## Supported Formats

### Images
- **Formats**: JPG, PNG, JPEG
- **Quality**: Optimized at 0.8 compression
- **Preview**: Full image preview before upload
- **Display**: Native image display on student side

### PDFs
- **Format**: PDF only (filtered in picker)
- **Preview**: Icon with filename and size
- **Access**: Download/open in PDF viewer

### Documents
- **Formats**: All document types (DOC, DOCX, XLS, TXT, etc.)
- **Preview**: Icon with metadata
- **Access**: Download/open in appropriate app

## Security & Performance

- **File Organization**: All files stored in `questionBank/` folder
- **Unique Names**: Timestamp-based naming prevents collisions
- **Optimized Upload**: Blob conversion for efficient transfer
- **Error Handling**: Comprehensive try-catch blocks
- **Validation**: Type-specific validation before upload
- **Progress Feedback**: Real-time upload status
- **Memory Management**: Efficient file handling

## Future Enhancements (Optional)

- [ ] Video content support
- [ ] Audio files for language learning
- [ ] Question editing/deletion
- [ ] Draft mode for content
- [ ] Content analytics (views, attempts)
- [ ] Difficulty level tagging
- [ ] Multi-image galleries
- [ ] Collaborative content creation
- [ ] Content versioning
- [ ] Bulk upload via CSV
- [ ] Content scheduling/publishing dates
- [ ] Student feedback/ratings on content
