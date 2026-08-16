import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const siteDirectory = fileURLToPath(new URL('.', import.meta.url));

function hostedSkillPlugin(): Plugin {
  return {
    name: 'brandpreflight-hosted-skill',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'skill.md',
        source: readFileSync(resolve(siteDirectory, 'skill.md'), 'utf8')
      });
    }
  };
}

export default defineConfig({
  root: siteDirectory,
  plugins: [react(), hostedSkillPlugin()],
  build: {
    outDir: resolve(siteDirectory, 'dist'),
    emptyOutDir: true
  }
});
