# Dashboard UI review (Summary tab)

Date: 2026-09-30
File: `frontend/src/pages/Assembly/Dashboard.tsx`

## Main problems

1. Colour has no fixed meaning. Amber, slate, green, blue, emerald and a second blue are all accents, each used for something different.
2. The two dark green table headers are the heaviest thing on screen. They pull the eye away from the numbers.
3. The right panel repeats the cards and leaves a large empty area.

## Findings

| # | Status | Area | Problem (why) | Suggestion |
| --- | --- | --- | --- | --- |
| 1 | `[x]` Done: BEFORE ISSUE card now amber like its badge, TOTAL card neutral slate (`Dashboard.tsx:51-53`); all table totals and subtotals `text-slate-900` (`:377`, `:386`, `:436`) | Colour system | The same stage has different colours in different places. BEFORE ISSUE is slate on its card but amber in `STATUS_BADGE` (`Dashboard.tsx:32`). TOTAL is amber, table totals are blue, subtotals are emerald. Users cannot learn what a colour means. | Give each stage one colour and use it everywhere (cards, badges, Detail tab). TOTAL gets a neutral colour (dark slate), because it is a sum, not a stage. All total numbers in tables use the same colour. |
| 2 | `[x]` Done: shared `TH_CLS` (`Dashboard.tsx:72`) used by all 3 tables (`:343`, `:412`, `:549`); header text `gray-500` for contrast | Table headers | The solid `bg-emerald-700` headers (`:330`, `:401`) look like Excel and are heavier than the data. The Detail tab already uses a light header (`:537`), so the page has two styles. | Use the Detail tab style everywhere: `bg-gray-50`, grey uppercase text, bottom border. The numbers become the strongest thing in each table. |
| 3 | `[x]` Done: `DAILY_COLUMNS` with `w-40` / `w-32` / `w-28` (`Dashboard.tsx:75-80`) | Daily table columns | PART NO. and WOS take about 45% of the width for 8-character values. This leaves big gaps, and QTY sits far from its part. | Fixed widths: PART NO. `w-40`, WOS `w-32`, QTY `w-28`. M/C NO. takes the rest, because it is the only column that can grow (the chips wrap). |
| 4 | `[x]` Done (Option B): table replaced by "Inventory by Process" card, one neutral bar per process with qty and %, height follows content (`Dashboard.tsx:397-437`); share maths in `processBreakdown.ts` | Right panel duplicates the cards | The process table shows 2,000 / 3,450 / 5,450. These are the card figures, grouped differently (3,450 = 2,000 + 1,450). The same number appears twice in two forms, and the panel is about 60% empty. | Option A: remove the panel and let the Daily table use the full width. Option B: turn it into a small breakdown (a bar per process with qty and %). This is a product decision: ask users whether they read the panel. |
| 5 | `[x]` Done: export button moved into the card header, same style and label as the Detail tab (`Dashboard.tsx:402-405`) | Export button | It floats outside the card, uses `rounded-full` + `text-base` while every other control is `rounded-lg` + `text-xs`/`sm`, and the label mixes Thai and English. | Move it into the card header, the same way the Detail tab does (`:530`). Same size, same style, one language. |
| 6 | `[x]` Done: the table and its DB column names are gone; the card shows process name, code, qty, % (`Dashboard.tsx:413-420`) | Column names | `PROCESS_CODE`, `PROCESS_NAME`, `INVENTORY_QTY` are database column names shown directly to users (`:402`). | Rename to `Code`, `Process`, `Qty`. |
| 7 | `[x]` Done: TOTAL neutral (item 1); stage cards show `%` and a thin bar in the stage colour (`Dashboard.tsx:49-55`, `:312-334`) | Stage cards | Four cards look like four equal numbers, but TOTAL = the other three added together. | Make TOTAL visually different (neutral colour or a slightly wider card). Show each stage as "2,000 · 37%" with a thin progress bar, so the split is visible without doing the maths. |
| 8 | `[x]` Done: `text-gray-400`, refresh button has `title` and `aria-label` (`Dashboard.tsx:307-312`). Stale-time amber colour skipped (optional) | "Updated" time | `text-gray-300` on white is too light to read (`:284`). The refresh button has no label for screen readers. | `text-gray-400` or darker. Add `title` / `aria-label="Refresh"`. Optional: show the time in amber when data is older than the 3-minute refresh period, so users see it is stale. |
| 9 | `[x]` Done: chips are `bg-gray-100 text-gray-600 border-gray-200` (`Dashboard.tsx:374`) | Machine chips | Blue chips compete with the blue totals. | Neutral chips (`bg-gray-100 text-gray-600`). Machines are labels, not actions. |

## Options

| Option | Scope | Risk |
| --- | --- | --- |
| **A. Polish** (items 1-3, 5, 6, 8, 9) | `Dashboard.tsx` only, about 60 lines, no logic change | Low. Styling only. |
| **B. A + fix the information** (items 4, 7) | Also changes what the page shows | Medium. Removes or changes a panel users may rely on. Check with users first. |
| **C. Move tables to Ant Design `Table`** | Large rewrite | High for little gain. The page uses Tailwind tables today; changing that only for looks is not worth it. |

## Recommendation

Do **A now** as one task. It fixes most of what looks "off" with no product risk.

Keep **B** for later, after asking users two questions:

- Do they use the right panel?
- Does a % split on the cards help them?
