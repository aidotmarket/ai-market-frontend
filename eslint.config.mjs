import { FlatCompat } from '@eslint/eslintrc';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const config = [
  ...compat.extends('next/core-web-vitals'),
  {
    ignores: ['.next/**', 'dist/**', 'node_modules/**', 'tsconfig.tsbuildinfo'],
  },
  {
    rules: {
      'react/no-unescaped-entities': 'off',
    },
  },
];

export default config;
