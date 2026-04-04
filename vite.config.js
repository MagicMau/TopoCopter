import { defineConfig } from 'vite';

export default defineConfig({
  assetsInclude: ['**/*.geojson'],
  server: {
    host: true
  },
  preview: {
    host: true
  },
  test: {
    environment: 'node'
  }
});
