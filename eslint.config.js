import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// กฎ dependency ระหว่าง package (Architecture Spec v3 ส่วน 4)
const forbid = (...names) => ({
  'no-restricted-imports': [
    'error',
    {
      paths: names.filter((n) => !n.endsWith('*')).map((name) => ({ name, message: 'ผิดกฎ dependency ใน Spec ส่วน 4' })),
      patterns: names.filter((n) => n.endsWith('*')).map((group) => ({ group: [group], message: 'ผิดกฎ dependency ใน Spec ส่วน 4' })),
    },
  ],
});

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/src-tauri/target/**', '**/src-tauri/gen/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Spec ส่วน 16: ห้าม eval และ new Function ทั้งโปรเจกต์
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['packages/shared/**/*.ts'],
    rules: forbid('@z-ncpu/engine', '@z-ncpu/isa', '@z-ncpu/canvas', '@z-ncpu/content', 'react', 'react-dom'),
  },
  {
    files: ['packages/engine/**/*.ts'],
    rules: forbid('@z-ncpu/isa', '@z-ncpu/canvas', '@z-ncpu/content', 'react', 'react-dom', 'react/*'),
  },
  {
    files: ['packages/isa/**/*.ts'],
    rules: forbid('@z-ncpu/engine', '@z-ncpu/canvas', '@z-ncpu/content', 'react', 'react-dom'),
  },
  {
    files: ['packages/content/src/**/*.ts'],
    rules: forbid('@z-ncpu/engine', '@z-ncpu/isa', '@z-ncpu/canvas', 'react', 'react-dom'),
  },
  {
    files: ['packages/canvas/**/*.ts'],
    rules: forbid('@z-ncpu/isa', '@z-ncpu/content', 'react', 'react-dom'),
  },
);
