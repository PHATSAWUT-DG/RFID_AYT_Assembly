import { toProcessShares } from './processBreakdown';
import type { ProcessSummaryRow } from '../../types/api';

const row = (process_code: string, inventory_qty: number): ProcessSummaryRow => ({ process_code, process_name: `P${process_code}`, inventory_qty });

describe('toProcessShares', () => {
    it('returns zero total and no shares for no rows', () => {
        expect(toProcessShares([])).toEqual({ total: 0, shares: [] });
    });

    it('computes each process share of the total', () => {
        const { total, shares } = toProcessShares([row('1400', 2000), row('1500', 3450)]);
        expect(total).toBe(5450);
        expect(shares.map(s => s.qty)).toEqual([2000, 3450]);
        expect(shares[0].pct).toBeCloseTo(36.7, 1);
        expect(shares[1].pct).toBeCloseTo(63.3, 1);
        expect(shares[0].pct + shares[1].pct).toBeCloseTo(100);
    });

    it('gives 0% to every process when the total is 0', () => {
        const { total, shares } = toProcessShares([row('1400', 0), row('1500', 0)]);
        expect(total).toBe(0);
        expect(shares.map(s => s.pct)).toEqual([0, 0]);
    });

    it('keeps the API order', () => {
        const { shares } = toProcessShares([row('1500', 1), row('1400', 9)]);
        expect(shares.map(s => s.process_code)).toEqual(['1500', '1400']);
    });
});
