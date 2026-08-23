import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
    plugins: [react()],
    test: {
        exclude: [
            '**/node_modules/**',
            '**/dist/**',
            '**/tests/**',
            '**/.{idea,git,cache,output,temp}/**'
        ]
    }
} as any);
