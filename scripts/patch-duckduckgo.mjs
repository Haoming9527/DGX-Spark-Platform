import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const packagePath = require.resolve('duck-duck-scrape/package.json');
const root = dirname(packagePath);
if (JSON.parse(readFileSync(packagePath, 'utf8')).version !== '2.2.7') throw new Error('DDG patch requires 2.2.7.');
const jsAddition = "    if (options.backend === 'html')\n        return require('./search-html.cjs').searchHtml(query, options, needleOptions);\n";
const versionAddition = 'search.htmlBackendVersion = 1;\n';
const typeAddition = '    /** Project patch: HTML form POST for web results; default remains the upstream API. */\n    backend?: "api" | "html";\n';
const changes = [
  { file: 'search.js', hash: 'bbf5fdf88972608e1f3f445f9d6922e181e1cd9a9fe5f5b48416a7edb2e56e3f',
    edits: [[jsAddition, '    let vqd = options.vqd;', false], [versionAddition, 'exports.search = search;\n', true]] },
  { file: 'search.d.ts', hash: '3e851ed6db87ed5dcfc105fdc93150dbefacea14320bc8350ab939d7b606ebdb',
    edits: [[typeAddition, 'export interface SearchOptions {\n', true]] },
];
const prepared = changes.map(change => {
  const path = join(root, 'lib/search', change.file);
  let source = readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
  for (const [addition] of change.edits) source = source.replace(addition, '');
  if (createHash('sha256').update(source).digest('hex') !== change.hash) throw new Error(`Unexpected DDG source: ${change.file}`);
  for (const [addition, anchor, after] of change.edits) {
    if (!source.includes(anchor)) throw new Error(`Missing DDG anchor: ${change.file}`);
    source = source.replace(anchor, after ? anchor + addition : addition + anchor);
  }
  return { path, source };
});
const adapter = readFileSync(new URL('./duck-duck-scrape-2.2.7/search-html.cjs', import.meta.url));
for (const { path, source } of prepared) writeFileSync(path, source);
writeFileSync(join(root, 'lib/search/search-html.cjs'), adapter);
console.log('Applied DuckDuckGo HTML POST patch.');
