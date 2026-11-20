/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import prefixer from 'postcss-prefix-selector';
import path from 'path';

// The five simulators are git submodules in sims/. Each one's stylesheet is scoped under its zone's wrapper class
// (.z-forklift …) so their panels keep their own look without clashing with each other or with the world.
export const SIMS = {
  forklift: 'Forklif-Simulator',
  crane: 'Crane-Simulator',
  excavator: 'Excavator-Simulator',
  tractor: 'Tractor-Simulator',
  genset: 'Genset-Simulator',
} as const;

const scopeOf = (file: string) => {
  const f = file.replace(/\\/g, '/');
  for (const [id, dir] of Object.entries(SIMS)) if (f.includes(`/sims/${dir}/`)) return `.z-${id}`;
  return null;
};

export default defineConfig({
  base: '/Traknus-World/',
  plugins: [react()],
  resolve: {
    alias: Object.fromEntries(Object.entries(SIMS).map(([id, dir]) => [`@${id}`, path.resolve(__dirname, 'sims', dir, 'src')])),
    // one copy of three / React / zustand for the world and every simulator
    dedupe: ['three', 'react', 'react-dom', '@react-three/fiber', '@react-three/drei', '@react-three/postprocessing', 'postprocessing', 'zustand', 'three-stdlib'],
  },
  css: {
    postcss: {
      plugins: [
        prefixer({
          prefix: '',
          transform(_prefix: string, selector: string, _prefixed: string, file: string) {
            const scope = scopeOf(file);
            if (!scope) return selector;
            // body / html / #root (also body.plant-mode …) become the zone wrapper itself
            if (/^(html|body|:root|#root)(?=[.:[\s]|$)/.test(selector)) return selector.replace(/^(html|body|:root|#root)/, scope);
            return `${scope} ${selector}`;
          },
        }),
      ],
    },
  },
  build: { chunkSizeWarningLimit: 4000 },
  // the simulators run their own tests in their own repositories
  test: { include: ['src/**/*.test.ts'] },
});
