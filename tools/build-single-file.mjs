import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

/**
 * Inline the built app into one HTML file.
 *
 * The published page runs under a strict CSP that blocks every external host,
 * so nothing may be fetched at runtime — the JS, the CSS and the favicon all
 * have to be in the document. The output has no <html>/<head>/<body> wrapper
 * because the artifact host supplies those and wraps this content directly.
 */
const dist = new URL('../dist/', import.meta.url).pathname;
const assets = join(dist, 'assets');
const files = readdirSync(assets);

const js = readFileSync(join(assets, files.find((f) => f.endsWith('.js'))), 'utf8');
const css = readFileSync(join(assets, files.find((f) => f.endsWith('.css'))), 'utf8');

// The bundle is an ES module and stays one, so top-level imports inside it and
// `import.meta` both keep working when inlined.
const page = `<title>The Big Score</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#14110F" />
<style>
${css}
</style>
<div id="root"></div>
<script type="module">
${js}
</script>
`;

const out = new URL('../dist-single/index.html', import.meta.url).pathname;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, page);
console.log(`wrote ${out} (${(page.length / 1024).toFixed(0)} kB)`);
