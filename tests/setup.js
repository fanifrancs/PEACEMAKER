// Test setup file for Jest
// This file runs before all tests

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.IBM_BOB_API_KEY = 'test-api-key';
process.env.IBM_BOB_API_URL = 'https://test.api.ibm.com/bob/v1';
process.env.PEACEMAKER_LOG_LEVEL = 'error'; // Suppress logs during tests

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Global test timeout
jest.setTimeout(10000);

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Made with Bob
