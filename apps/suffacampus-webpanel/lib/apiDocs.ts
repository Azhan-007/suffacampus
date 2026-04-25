import { ApiEndpointDoc } from '@/types';
import { PUBLIC_API_URL } from '@/lib/runtime-config';

// =============================================================================
// SuffaCampus REST API Documentation
// Complete reference for all public API endpoints
// =============================================================================

export const API_BASE_URL = PUBLIC_API_URL;

export const API_VERSION = 'v1';

// =============================================================================
// Endpoint Documentation
// =============================================================================

export const API_ENDPOINTS: ApiEndpointDoc[] = [
  // "" Students """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
  {
    method: 'GET',
    path: '/api/v1/students',
    summary: 'List Students',
    description:
      'Retrieve a paginated list of all students in the school. Supports filtering by class, section, and search queries.',
    category: 'Students',
    requiresAuth: true,
    permissions: ['students:read'],
    parameters: [
      { name: 'page', in: 'query', required: false, type: 'number', description: 'Page number (default: 1)' },
      { name: 'limit', in: 'query', required: false, type: 'number', description: 'Items per page (default: 20, max: 100)' },
      { name: 'classId', in: 'query', required: false, type: 'string', description: 'Filter by class ID' },
      { name: 'section', in: 'query', required: false, type: 'string', description: 'Filter by section' },
      { name: 'search', in: 'query', required: false, type: 'string', description: 'Search by name or roll number' },
      { name: 'status', in: 'query', required: false, type: 'string', description: 'Filter by status (active|inactive)' },
    ],
    responses: [
      {
        status: 200,
        description: 'List of students',
        example: {
          success: true,
          data: [
            { id: 'stu_abc123', name: 'Rahul Sharma', rollNo: 1, classId: 'class-10', section: 'A', email: 'rahul@example.com', status: 'active' },
          ],
          total: 150,
          page: 1,
          limit: 20,
        },
      },
      { status: 401, description: 'Unauthorized " invalid or missing API key', example: { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid API key' } } },
    ],
  },
  {
    method: 'GET',
    path: '/api/v1/students/:id',
    summary: 'Get Student',
    description: 'Retrieve detailed information for a specific student by their ID.',
    category: 'Students',
    requiresAuth: true,
    permissions: ['students:read'],
    parameters: [
      { name: 'id', in: 'path', required: true, type: 'string', description: 'Student ID' },
    ],
    responses: [
      { status: 200, description: 'Student details', example: { success: true, data: { id: 'stu_abc123', name: 'Rahul Sharma', rollNo: 1, classId: 'class-10', section: 'A', guardianName: 'Mr. Sharma', phone: '+91-9876543210', address: 'Delhi, India', status: 'active', createdAt: '2025-04-15T10:30:00Z' } } },
      { status: 404, description: 'Student not found', example: { success: false, error: { code: 'NOT_FOUND', message: 'Student not found' } } },
    ],
  },
  {
    method: 'POST',
    path: '/api/v1/students',
    summary: 'Create Student',
    description: 'Add a new student to the school. All required fields must be provided.',
    category: 'Students',
    requiresAuth: true,
    permissions: ['students:write'],
    requestBody: {
      contentType: 'application/json',
      schema: { name: 'string (required)', classId: 'string (required)', section: 'string', rollNo: 'number', email: 'string', phone: 'string', guardianName: 'string', address: 'string' },
      example: { name: 'Priya Patel', classId: 'class-10', section: 'A', rollNo: 15, email: 'priya@example.com', guardianName: 'Mrs. Patel', phone: '+91-9876543211' },
    },
    responses: [
      { status: 201, description: 'Student created', example: { success: true, data: { id: 'stu_def456', name: 'Priya Patel', classId: 'class-10' } } },
      { status: 400, description: 'Validation error', example: { success: false, error: { code: 'VALIDATION_ERROR', message: 'Name is required', details: [{ field: 'name', message: 'Required' }] } } },
    ],
  },
  {
    method: 'PATCH',
    path: '/api/v1/students/:id',
    summary: 'Update Student',
    description: 'Update one or more fields of an existing student record.',
    category: 'Students',
    requiresAuth: true,
    permissions: ['students:write'],
    parameters: [{ name: 'id', in: 'path', required: true, type: 'string', description: 'Student ID' }],
    requestBody: {
      contentType: 'application/json',
      schema: { name: 'string', classId: 'string', section: 'string', rollNo: 'number', email: 'string', phone: 'string', status: 'string' },
      example: { section: 'B', rollNo: 20 },
    },
    responses: [
      { status: 200, description: 'Student updated', example: { success: true, data: { id: 'stu_abc123', name: 'Rahul Sharma', section: 'B', rollNo: 20 } } },
    ],
  },
  {
    method: 'DELETE',
    path: '/api/v1/students/:id',
    summary: 'Delete Student',
    description: 'Permanently delete a student record. This action cannot be undone.',
    category: 'Students',
    requiresAuth: true,
    permissions: ['students:write'],
    parameters: [{ name: 'id', in: 'path', required: true, type: 'string', description: 'Student ID' }],
    responses: [
      { status: 204, description: 'Student deleted', example: {} },
    ],
  },

  // "" Teachers """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
  {
    method: 'GET',
    path: '/api/v1/teachers',
    summary: 'List Teachers',
    description: 'Retrieve a paginated list of all teachers.',
    category: 'Teachers',
    requiresAuth: true,
    permissions: ['teachers:read'],
    parameters: [
      { name: 'page', in: 'query', required: false, type: 'number', description: 'Page number' },
      { name: 'limit', in: 'query', required: false, type: 'number', description: 'Items per page' },
      { name: 'subject', in: 'query', required: false, type: 'string', description: 'Filter by subject' },
    ],
    responses: [
      { status: 200, description: 'List of teachers', example: { success: true, data: [{ id: 'tch_1', name: 'Dr. Ananya Roy', subject: 'Mathematics', email: 'ananya@school.com' }], total: 25 } },
    ],
  },
  {
    method: 'POST',
    path: '/api/v1/teachers',
    summary: 'Create Teacher',
    description: 'Add a new teacher to the school.',
    category: 'Teachers',
    requiresAuth: true,
    permissions: ['teachers:write'],
    requestBody: {
      contentType: 'application/json',
      schema: { name: 'string (required)', subject: 'string (required)', email: 'string', phone: 'string', qualification: 'string' },
      example: { name: 'Mr. Rajesh Singh', subject: 'Physics', email: 'rajesh@school.com', qualification: 'M.Sc. Physics' },
    },
    responses: [
      { status: 201, description: 'Teacher created', example: { success: true, data: { id: 'tch_new', name: 'Mr. Rajesh Singh' } } },
    ],
  },

  // "" Classes """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
  {
    method: 'GET',
    path: '/api/v1/classes',
    summary: 'List Classes',
    description: 'Retrieve all classes and sections in the school.',
    category: 'Classes',
    requiresAuth: true,
    permissions: ['classes:read'],
    responses: [
      { status: 200, description: 'List of classes', example: { success: true, data: [{ id: 'cls_1', name: 'Class 10', section: 'A', studentCount: 45, classTeacher: 'Dr. Ananya Roy' }] } },
    ],
  },

  // "" Attendance """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""
  {
    method: 'GET',
    path: '/api/v1/attendance',
    summary: 'Get Attendance',
    description: 'Retrieve attendance records. Filter by date, class, or student.',
    category: 'Attendance',
    requiresAuth: true,
    permissions: ['attendance:read'],
    parameters: [
      { name: 'date', in: 'query', required: false, type: 'string', description: 'Date (YYYY-MM-DD). Defaults to today.' },
      { name: 'classId', in: 'query', required: false, type: 'string', description: 'Filter by class' },
      { name: 'studentId', in: 'query', required: false, type: 'string', description: 'Filter by student' },
    ],
    responses: [
      { status: 200, description: 'Attendance data', example: { success: true, data: { date: '2026-02-25', classId: 'class-10', records: [{ studentId: 'stu_1', status: 'present' }, { studentId: 'stu_2', status: 'absent' }], summary: { present: 38, absent: 7, total: 45 } } } },
    ],
  },
  {
    method: 'POST',
    path: '/api/v1/attendance',
    summary: 'Mark Attendance',
    description: 'Mark or update attendance for a class on a given date.',
    category: 'Attendance',
    requiresAuth: true,
    permissions: ['attendance:write'],
    requestBody: {
      contentType: 'application/json',
      schema: { classId: 'string (required)', date: 'string (required, YYYY-MM-DD)', records: 'array of { studentId, status }' },
      example: { classId: 'class-10', date: '2026-02-25', records: [{ studentId: 'stu_1', status: 'present' }, { studentId: 'stu_2', status: 'absent' }] },
    },
    responses: [
      { status: 200, description: 'Attendance marked', example: { success: true, data: { date: '2026-02-25', classId: 'class-10', marked: 45 } } },
    ],
  },

  // "" Fees """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
  {
    method: 'GET',
    path: '/api/v1/fees',
    summary: 'List Fees',
    description: 'Retrieve fee records with optional filters.',
    category: 'Fees',
    requiresAuth: true,
    permissions: ['fees:read'],
    parameters: [
      { name: 'status', in: 'query', required: false, type: 'string', description: 'Filter: Pending, Paid, Overdue, Partial' },
      { name: 'feeType', in: 'query', required: false, type: 'string', description: 'Filter by fee type' },
      { name: 'studentId', in: 'query', required: false, type: 'string', description: 'Filter by student' },
    ],
    responses: [
      { status: 200, description: 'Fee records', example: { success: true, data: [{ id: 'fee_1', studentName: 'Rahul Sharma', feeType: 'Tuition', amount: 5000, status: 'Paid', paidDate: '2026-01-15' }] } },
    ],
  },
  {
    method: 'POST',
    path: '/api/v1/fees',
    summary: 'Create Fee',
    description: 'Create a new fee record for a student.',
    category: 'Fees',
    requiresAuth: true,
    permissions: ['fees:write'],
    requestBody: {
      contentType: 'application/json',
      schema: { studentId: 'string (required)', studentName: 'string (required)', feeType: 'string (required)', amount: 'number (required)', dueDate: 'string (required, YYYY-MM-DD)' },
      example: { studentId: 'stu_1', studentName: 'Rahul Sharma', feeType: 'Tuition', amount: 5000, dueDate: '2026-03-15' },
    },
    responses: [
      { status: 201, description: 'Fee created', example: { success: true, data: { id: 'fee_new', studentName: 'Rahul Sharma', amount: 5000, status: 'Pending' } } },
    ],
  },
  {
    method: 'PATCH',
    path: '/api/v1/fees/:id',
    summary: 'Update / Mark Fee Paid',
    description: 'Update fee record or mark it as paid with payment details.',
    category: 'Fees',
    requiresAuth: true,
    permissions: ['fees:write'],
    parameters: [{ name: 'id', in: 'path', required: true, type: 'string', description: 'Fee ID' }],
    requestBody: {
      contentType: 'application/json',
      schema: { status: 'string', amountPaid: 'number', paymentMode: 'string', transactionId: 'string' },
      example: { status: 'Paid', amountPaid: 5000, paymentMode: 'UPI', transactionId: 'txn_123' },
    },
    responses: [
      { status: 200, description: 'Fee updated', example: { success: true, data: { id: 'fee_1', status: 'Paid', amountPaid: 5000 } } },
    ],
  },

  // "" Events """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
  {
    method: 'GET',
    path: '/api/v1/events',
    summary: 'List Events',
    description: 'Retrieve school events and calendar items.',
    category: 'Events',
    requiresAuth: true,
    permissions: ['events:read'],
    parameters: [
      { name: 'from', in: 'query', required: false, type: 'string', description: 'Start date (YYYY-MM-DD)' },
      { name: 'to', in: 'query', required: false, type: 'string', description: 'End date (YYYY-MM-DD)' },
    ],
    responses: [
      { status: 200, description: 'Events list', example: { success: true, data: [{ id: 'evt_1', title: 'Annual Sports Day', date: '2026-03-15', type: 'sports', description: 'Inter-house sports competition' }] } },
    ],
  },
  {
    method: 'POST',
    path: '/api/v1/events',
    summary: 'Create Event',
    description: 'Create a new school event.',
    category: 'Events',
    requiresAuth: true,
    permissions: ['events:write'],
    requestBody: {
      contentType: 'application/json',
      schema: { title: 'string (required)', date: 'string (required)', type: 'string', description: 'string' },
      example: { title: 'Parent-Teacher Meeting', date: '2026-04-01', type: 'meeting', description: 'Semester review with parents' },
    },
    responses: [
      { status: 201, description: 'Event created', example: { success: true, data: { id: 'evt_new', title: 'Parent-Teacher Meeting' } } },
    ],
  },

  // "" Results """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
  {
    method: 'GET',
    path: '/api/v1/results',
    summary: 'List Results',
    description: 'Retrieve exam results for students.',
    category: 'Results',
    requiresAuth: true,
    permissions: ['results:read'],
    parameters: [
      { name: 'examId', in: 'query', required: false, type: 'string', description: 'Filter by exam' },
      { name: 'classId', in: 'query', required: false, type: 'string', description: 'Filter by class' },
      { name: 'studentId', in: 'query', required: false, type: 'string', description: 'Filter by student' },
    ],
    responses: [
      { status: 200, description: 'Results list', example: { success: true, data: [{ id: 'res_1', studentName: 'Rahul Sharma', exam: 'Mid-Term', subjects: { Maths: 85, Science: 90, English: 78 }, total: 253, percentage: 84.3 }] } },
    ],
  },

  // "" Library """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
  {
    method: 'GET',
    path: '/api/v1/library/books',
    summary: 'List Books',
    description: 'Retrieve library book inventory.',
    category: 'Library',
    requiresAuth: true,
    permissions: ['library:read'],
    parameters: [
      { name: 'search', in: 'query', required: false, type: 'string', description: 'Search by title, author, or ISBN' },
      { name: 'status', in: 'query', required: false, type: 'string', description: 'available | issued' },
    ],
    responses: [
      { status: 200, description: 'Books list', example: { success: true, data: [{ id: 'book_1', title: 'NCERT Mathematics', author: 'NCERT', isbn: '978-81-7450-001-1', status: 'available', copies: 15 }] } },
    ],
  },

  // "" Timetable """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
  {
    method: 'GET',
    path: '/api/v1/timetable',
    summary: 'Get Timetable',
    description: 'Retrieve the timetable/schedule for a class or teacher.',
    category: 'Timetable',
    requiresAuth: true,
    permissions: ['timetable:read'],
    parameters: [
      { name: 'classId', in: 'query', required: false, type: 'string', description: 'Filter by class' },
      { name: 'teacherId', in: 'query', required: false, type: 'string', description: 'Filter by teacher' },
      { name: 'day', in: 'query', required: false, type: 'string', description: 'Filter by day (Monday-Saturday)' },
    ],
    responses: [
      { status: 200, description: 'Timetable', example: { success: true, data: [{ day: 'Monday', periods: [{ period: 1, time: '08:00-08:45', subject: 'Mathematics', teacher: 'Dr. Ananya Roy' }] }] } },
    ],
  },
];

// =============================================================================
// Helpers
// =============================================================================

/** Get unique endpoint categories */
export function getApiCategories(): string[] {
  const cats = new Set(API_ENDPOINTS.map((e) => e.category));
  return Array.from(cats);
}

/** Get endpoints filtered by category */
export function getEndpointsByCategory(category: string): ApiEndpointDoc[] {
  return API_ENDPOINTS.filter((e) => e.category === category);
}

/** Method color mapping */
export const METHOD_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  GET: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  POST: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  PUT: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  PATCH: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  DELETE: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
};

/** Sample cURL command generator */
export function generateCurl(
  endpoint: ApiEndpointDoc,
  apiKey: string = 'ek_live_your_api_key_here',
  baseUrl: string = API_BASE_URL
): string {
  let curl = `curl -X ${endpoint.method} "${baseUrl}${endpoint.path.replace('/api/v1', '')}"`;
  curl += ` \\\n  -H "Authorization: Bearer ${apiKey}"`;
  curl += ` \\\n  -H "Content-Type: application/json"`;

  if (endpoint.requestBody?.example) {
    curl += ` \\\n  -d '${JSON.stringify(endpoint.requestBody.example, null, 2)}'`;
  }

  return curl;
}

/** Sample code generator (JavaScript) */
export function generateJsCode(
  endpoint: ApiEndpointDoc,
  apiKey: string = 'ek_live_your_api_key_here',
  baseUrl: string = API_BASE_URL
): string {
  const path = endpoint.path.replace('/api/v1', '');
  let code = `const response = await fetch('${baseUrl}${path}', {\n`;
  code += `  method: '${endpoint.method}',\n`;
  code += `  headers: {\n`;
  code += `    'Authorization': 'Bearer ${apiKey}',\n`;
  code += `    'Content-Type': 'application/json',\n`;
  code += `  },\n`;

  if (endpoint.requestBody?.example) {
    code += `  body: JSON.stringify(${JSON.stringify(endpoint.requestBody.example, null, 4).split('\n').map((l, i) => i === 0 ? l : '  ' + l).join('\n')}),\n`;
  }

  code += `});\n\n`;
  code += `const data = await response.json();\nconsole.log(data);`;

  return code;
}

/** Sample code generator (Python) */
export function generatePythonCode(
  endpoint: ApiEndpointDoc,
  apiKey: string = 'ek_live_your_api_key_here',
  baseUrl: string = API_BASE_URL
): string {
  const path = endpoint.path.replace('/api/v1', '');
  let code = `import requests\n\n`;
  code += `response = requests.${endpoint.method.toLowerCase()}(\n`;
  code += `    '${baseUrl}${path}',\n`;
  code += `    headers={\n`;
  code += `        'Authorization': 'Bearer ${apiKey}',\n`;
  code += `        'Content-Type': 'application/json',\n`;
  code += `    },\n`;

  if (endpoint.requestBody?.example) {
    code += `    json=${JSON.stringify(endpoint.requestBody.example, null, 4).split('\n').map((l, i) => i === 0 ? l : '    ' + l).join('\n')},\n`;
  }

  code += `)\n\nprint(response.json())`;

  return code;
}

/** Webhook event types */
export const WEBHOOK_EVENTS = [
  { value: 'student.created', label: 'Student Created', category: 'Students' },
  { value: 'student.updated', label: 'Student Updated', category: 'Students' },
  { value: 'student.deleted', label: 'Student Deleted', category: 'Students' },
  { value: 'teacher.created', label: 'Teacher Created', category: 'Teachers' },
  { value: 'teacher.updated', label: 'Teacher Updated', category: 'Teachers' },
  { value: 'attendance.marked', label: 'Attendance Marked', category: 'Attendance' },
  { value: 'fee.created', label: 'Fee Created', category: 'Fees' },
  { value: 'fee.paid', label: 'Fee Paid', category: 'Fees' },
  { value: 'fee.overdue', label: 'Fee Overdue', category: 'Fees' },
  { value: 'event.created', label: 'Event Created', category: 'Events' },
  { value: 'result.published', label: 'Result Published', category: 'Results' },
];

