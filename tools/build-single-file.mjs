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

for (const rel of ['../dist-single/index.html', '../docs/index.html']) {
  const out = new URL(rel, import.meta.url).pathname;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, out.endsWith('docs/index.html') ? standalone(page) : page);
  console.log(`wrote ${out} (${(page.length / 1024).toFixed(0)} kB)`);
}

/**
 * `docs/` is served as a normal web page rather than embedded in a host that
 * supplies the document shell, so that copy needs its own wrapper.
 */
function standalone(body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%2314110F'/%3E%3Ccircle cx='16' cy='16' r='9' fill='none' stroke='%23D9A441' stroke-width='2'/%3E%3Ccircle cx='16' cy='16' r='3' fill='%23C8452F'/%3E%3C/svg%3E" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="description" content="A browser-based heist strategy game. Recruit a crew, buy what you can afford to know, and run a six-stage job that will not go the way you drew it." />
${body}</body>
</html>
`.replace('<div id="root"></div>', '</head>\n<body>\n<div id="root"></div>');
}
