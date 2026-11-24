// Fails the build when mock-only code reaches the production bundle.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MARKERS = ['No mock for', 'MOCK001'];
const dir = process.argv[2] ?? 'build';

if (!existsSync(dir)) {
    console.error(`check-no-mocks: folder "${dir}" not found. Run the build first.`);
    process.exit(2);
}

const jsFiles = readdirSync(dir, { recursive: true })
    .filter((file) => file.endsWith('.js'))
    .map((file) => join(dir, file));

const hits = jsFiles.flatMap((file) => {
    const text = readFileSync(file, 'utf8');
    return MARKERS.filter((marker) => text.includes(marker)).map((marker) => `${file}: "${marker}"`);
});

if (hits.length > 0) {
    console.error('check-no-mocks: mock code found in the production bundle:');
    hits.forEach((hit) => console.error(`  ${hit}`));
    process.exit(1);
}

console.log(`check-no-mocks: OK (${jsFiles.length} JS files checked)`);
