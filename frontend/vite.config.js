import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    // Old CRA names are ignored by Vite. Fail loudly instead of silently using defaults.
    const legacy = Object.keys({ ...loadEnv(mode, process.cwd(), 'REACT_APP_'), ...process.env })
        .filter((key) => key.startsWith('REACT_APP_'));
    if (legacy.length > 0) {
        throw new Error(`Rename these env variables to VITE_*: ${legacy.join(', ')}. See .env.example.`);
    }

    return {
        plugins: [react()],
        server: { port: 3000 },
        build: { outDir: 'build' },
        test: {
            environment: 'jsdom',
            globals: true,
            setupFiles: './src/setupTests.ts',
            unstubEnvs: true,
        },
    };
});
