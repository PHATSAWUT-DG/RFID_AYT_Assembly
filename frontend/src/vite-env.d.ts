/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_API_BACKEND?: string;
    readonly VITE_MOCK?: string;
    readonly VITE_MOCK_LATENCY?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
