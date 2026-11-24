import type { DateTimeText } from '../types/api';

const pad = (n: number) => String(n).padStart(2, '0');

// SQL Server DATETIME has no zone; the real API serialises it as if it were UTC,
// so pages print these digits as-is. Mirror that with local date parts.
export const toWallClock = (date: Date): DateTimeText =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.000Z`;

export const daysAgo = (today: Date, days: number, hours: number, minutes = 0): DateTimeText =>
    toWallClock(new Date(today.getFullYear(), today.getMonth(), today.getDate() - days, hours, minutes));
