
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    // 'obsidian' モジュールをモックファイルにマッピング
    '^obsidian$': '<rootDir>/__tests__/obsidian.mock.ts',
    '^../main$': '<rootDir>/main.ts',
  },
};
