import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
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

// The icon, inlined for hosts that cannot fetch anything, and copied beside
// docs/index.html for GitHub Pages, where the home-screen icon and manifest
// have to be real files the phone can request.
const publicDir = new URL('../public/', import.meta.url).pathname;
const iconSvg = readFileSync(join(publicDir, 'icon.svg'), 'utf8');
const iconData = `data:image/svg+xml,${encodeURIComponent(iconSvg.replace(/\s+/g, ' ').trim())}`;
const ICON_FILES = ['icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'favicon-32.png', 'manifest.webmanifest'];

const js = readFileSync(join(assets, files.find((f) => f.endsWith('.js'))), 'utf8');
const css = readFileSync(join(assets, files.find((f) => f.endsWith('.css'))), 'utf8');

// The bundle is an ES module and stays one, so top-level imports inside it and
// `import.meta` both keep working when inlined.
const page = `<title>The Big Score</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#14110F" />
<link rel="icon" href="${iconData}" />
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

const docs = new URL('../docs/', import.meta.url).pathname;
for (const file of ICON_FILES) copyFileSync(join(publicDir, file), join(docs, file));
console.log(`copied ${ICON_FILES.length} icon files into docs/`);

/**
 * `docs/` is served as a normal web page rather than embedded in a host that
 * supplies the document shell, so that copy needs its own wrapper.
 */
function standalone(body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<link rel="apple-touch-icon" href="./apple-touch-icon.png" />
<link rel="icon" href="./favicon-32.png" sizes="32x32" type="image/png" />
<link rel="manifest" href="./manifest.webmanifest" />
<meta name="apple-mobile-web-app-title" content="Big Score" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="description" content="A browser-based heist strategy game. Recruit a crew, buy what you can afford to know, and run a six-stage job that will not go the way you drew it." />
${body}</body>
</html>
`.replace('<div id="root"></div>', '</head>\n<body>\n<div id="root"></div>');
}
