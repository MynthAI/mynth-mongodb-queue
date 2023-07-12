import type { Config } from '@jest/types';
import { defaults } from 'jest-config';

// Sync object
const config: Config.InitialOptions = {
  coveragePathIgnorePatterns: [
    ...defaults.coveragePathIgnorePatterns,
    '__helpers__',
  ],
};

jest.setTimeout(30000);

export default config;
