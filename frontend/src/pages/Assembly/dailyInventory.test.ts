import { groupDailyInventory } from './dailyInventory';
import type { DailyInventoryRow } from '../../types/api';

const row = (mc_no: string, part_no: string, wos: string, qty: number): DailyInventoryRow => ({ mc_no, part_no, wos, qty });

describe('groupDailyInventory', () => {
    it('returns an empty list for no rows', () => {
        expect(groupDailyInventory([])).toEqual([]);
    });

    it('makes one line per WOS with its machines and summed qty', () => {
        const parts = groupDailyInventory([
            row('MC-06', 'P1', 'W1', 1200),
            row('MC-07', 'P1', 'W1', 800),
        ]);
        expect(parts).toEqual([
            { part_no: 'P1', qty: 2000, lines: [{ wos: 'W1', mc_nos: ['MC-06', 'MC-07'], qty: 2000 }] },
        ]);
    });

    it('keeps many WOS of one part under that part, with a part subtotal', () => {
        const parts = groupDailyInventory([
            row('MC-01', 'P1', 'W2', 7),
            row('MC-02', 'P1', 'W1', 5),
            row('MC-03', 'P1', 'W1', 3),
        ]);
        expect(parts).toHaveLength(1);
        expect(parts[0].qty).toBe(15);
        expect(parts[0].lines).toEqual([
            { wos: 'W1', mc_nos: ['MC-02', 'MC-03'], qty: 8 },
            { wos: 'W2', mc_nos: ['MC-01'], qty: 7 },
        ]);
    });

    it('lists each machine once per WOS, sorted', () => {
        const parts = groupDailyInventory([
            row('MC-07', 'P1', 'W1', 1),
            row('MC-06', 'P1', 'W1', 1),
            row('MC-07', 'P1', 'W1', 1),
        ]);
        expect(parts[0].lines[0].mc_nos).toEqual(['MC-06', 'MC-07']);
    });

    it('sorts parts by part no', () => {
        const parts = groupDailyInventory([
            row('MC-02', 'P2', 'W9', 1),
            row('MC-01', 'P1', 'W3', 1),
        ]);
        expect(parts.map(p => p.part_no)).toEqual(['P1', 'P2']);
    });
});
