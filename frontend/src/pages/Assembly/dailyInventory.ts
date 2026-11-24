import type { DailyInventoryRow } from '../../types/api';

export interface DailyInventoryLine {
    wos: string;
    mc_nos: string[];
    qty: number;
}

export interface DailyInventoryPart {
    part_no: string;
    qty: number;
    lines: DailyInventoryLine[];
}

// A part can have many WOS and many machines; each machine row belongs to one WOS,
// so machines are listed per WOS line, not per part.
export const groupDailyInventory = (rows: DailyInventoryRow[]): DailyInventoryPart[] => {
    const parts = new Map<string, Map<string, { mcs: Set<string>; qty: number }>>();
    for (const r of rows) {
        const lines = parts.get(r.part_no) ?? new Map<string, { mcs: Set<string>; qty: number }>();
        const line = lines.get(r.wos) ?? { mcs: new Set<string>(), qty: 0 };
        line.mcs.add(r.mc_no);
        line.qty += r.qty;
        lines.set(r.wos, line);
        parts.set(r.part_no, lines);
    }
    return [...parts.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([part_no, lines]) => {
            const sorted = [...lines.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([wos, { mcs, qty }]) => ({ wos, mc_nos: [...mcs].sort(), qty }));
            return { part_no, qty: sorted.reduce((sum, l) => sum + l.qty, 0), lines: sorted };
        });
};
