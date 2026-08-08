/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The deployed wordle-svc Lambda Function URL. In dev we proxy `/service` here
 * so browser calls stay same-origin and avoid CORS (mirrors legacy setupProxy.js).
 * Override the app's base URL at build/run time with VITE_API_URL.
 */
const LAMBDA_URL =
  'https://3a4sqenzhvr7ytnxakcsjeeh5u0hbynu.lambda-url.us-east-1.on.aws/';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_PROXY_TARGET ?? LAMBDA_URL;

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/service': {
          target: proxyTarget,
          changeOrigin: true,
          secure: true,
          // The Lambda serves the operation at the URL root, so strip `/service`.
          rewrite: (path) => path.replace(/^\/service/, ''),
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: true,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: [
          'src/**/*.test.{ts,tsx}',
          'src/**/*.d.ts',
          'src/test/**',
          'src/main.tsx',
          'src/data/answers.ts',
          'src/data/guesses.ts',
          'src/types.ts',
        ],
      },
    },
  };
});
