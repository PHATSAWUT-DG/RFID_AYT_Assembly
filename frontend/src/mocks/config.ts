export const MOCK_LATENCY_MS = import.meta.env.VITE_MOCK_LATENCY === undefined
    ? 250
    : Number(import.meta.env.VITE_MOCK_LATENCY);
