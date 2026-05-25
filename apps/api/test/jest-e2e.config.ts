// NestJS E2E + integration test configuration.
// Requires: docker compose -f docker-compose.test.yml up -d
//
// Maps the @codearena/question-schema alias so ts-jest can resolve it.

import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.(e2e|integration).spec.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '../tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@codearena/question-schema$':
      '<rootDir>/../../packages/question-schema/src/index.ts',
  },
  globalSetup: '<rootDir>/setup.ts',
  verbose: true,
  testTimeout: 30_000,
};

export default config;
