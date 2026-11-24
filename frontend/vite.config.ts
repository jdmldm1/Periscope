import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
        exclude: ['**/node_modules/**', '**/dist/**', '**/tests/**', '**/.{idea,git,cache,output,temp}/**'],
        setupFiles: ['./src/test/setup.ts'],
        coverage: {
            include: ['src/**/*.{ts,tsx}'],
            exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx'],
        },
    },
});
