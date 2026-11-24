import { toWallClock } from './time';
import { buildProcesses, buildStatuses } from './fixtures/master';
import { buildUsers } from './fixtures/users';
import { buildAs400Lots, buildLots } from './fixtures/lots';
import { buildMockDone } from './fixtures/mockDone';
import { buildReaderConfig } from './fixtures/readers';
import type { MockDb } from './types';

export const nextId = (rows: { id: number }[]): number => rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;

export const createDb = ({ now = () => new Date() }: { now?: () => Date } = {}): MockDb => {
    const today = now();
    return {
        now: () => toWallClock(now()),
        processes: buildProcesses(),
        statuses: buildStatuses(),
        users: buildUsers(),
        as400Lots: buildAs400Lots(),
        lots: buildLots(today),
        mockDone: buildMockDone(today),
        readerConfig: buildReaderConfig(),
    };
};
