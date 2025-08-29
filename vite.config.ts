import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/dashboard': 'http://localhost:3000/dashboard',
      '/buses': 'http://localhost:3000/buses',
      '/alerts': 'http://localhost:3000/alerts',
    }
  }
});