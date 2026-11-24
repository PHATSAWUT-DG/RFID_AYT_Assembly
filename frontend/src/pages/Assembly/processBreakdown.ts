import type { ProcessSummaryRow } from '../../types/api';

export interface ProcessShare {
    process_code: string;
    process_name: string;
    qty: number;
    pct: number;
}

export interface ProcessBreakdown {
    total: number;
    shares: ProcessShare[];
}

// pct is unrounded (0-100); round only when displaying, so bar widths stay exact.
export const toProcessShares = (rows: ProcessSummaryRow[]): ProcessBreakdown => {
    const total = rows.reduce((sum, r) => sum + r.inventory_qty, 0);
    const shares = rows.map(r => ({
        process_code: r.process_code,
        process_name: r.process_name,
        qty: r.inventory_qty,
        pct: total === 0 ? 0 : (r.inventory_qty / total) * 100,
    }));
    return { total, shares };
};
