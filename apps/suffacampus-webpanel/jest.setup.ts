// Note: @testing-library/jest-dom is imported via jest.config.js setupFiles
// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock firebase
jest.mock('@/lib/firebase', () => ({
  auth: {},
}));
