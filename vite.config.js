import { defineConfig } from 'vite';

// Tauri ile uyumlu Vite ayarları: sabit port, src-tauri izlenmez.
export default defineConfig({
    clearScreen: false,
    envPrefix: ['VITE_', 'TAURI_ENV_'],
    server: {
        port: 5173,
        strictPort: true,
        watch: { ignored: ['**/src-tauri/**'] },
    },
    build: {
        target: 'es2021',
        outDir: 'dist',
        emptyOutDir: true,
    },
});
