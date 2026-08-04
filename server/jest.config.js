/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  // Native ESM — no Babel transform. Run with --experimental-vm-modules (see package.json).
  transform: {},
  moduleNameMapper: {
    '^@verihire/shared$': '<rootDir>/../shared/index.js',
    '^@verihire/shared/(.*)$': '<rootDir>/../shared/$1',
  },
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/services/**/*.js',
    'src/repositories/**/*.js',
    'src/utils/**/*.js',
    'src/middlewares/**/*.js',
  ],
  coverageThreshold: {
    global: { lines: 70, functions: 60, branches: 55 },
  },
  testTimeout: 30_000,
  clearMocks: true,
  verbose: true,
};
