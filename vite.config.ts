import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Static build — the output is a plain folder, deployable anywhere.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist' },
  test: {
    // The whole game engine is pure and DOM-free by design, so node is all
    // it needs. Add jsdom here if component tests ever arrive.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
