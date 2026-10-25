import fs from 'node:fs';
import path from 'node:path';

const SRC_APP_DIR = path.resolve('src/app');
const SRC_DIR = path.resolve('src');

// 1. Collect all app routes
function collectRoutes(dir, baseRoute = '') {
  const routes = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Handle Route Groups (group) by not adding to URL path
      let segment = entry.name;
      if (segment.startsWith('(') && segment.endsWith(')')) {
        routes.push(...collectRoutes(fullPath, baseRoute));
      } else {
        const nextBase = baseRoute === '' ? `/${segment}` : `${baseRoute}/${segment}`;
        routes.push(...collectRoutes(fullPath, nextBase));
      }
    } else if (entry.isFile()) {
      if (
        entry.name === 'page.tsx' ||
        entry.name === 'page.jsx' ||
        entry.name === 'page.js' ||
        entry.name === 'route.ts' ||
        entry.name === 'route.js'
      ) {
        routes.push({
          filePath: fullPath,
          route: baseRoute === '' ? '/' : baseRoute,
        });
      }
    }
  }

  return routes;
}

const rawRoutes = collectRoutes(SRC_APP_DIR);

// Build route matchers
const routeMatchers = rawRoutes.map((r) => {
  // Replace [param] with ([^/]+)
  // Replace [...param] with (.+)
  // Replace [[...param]] with (.*)
  const escaped = r.route
    .replace(/[.+*?^${}()|[\]\\]/g, (m) => (m === '[' || m === ']' ? m : `\\${m}`))
    .replace(/\[\.\.\.([^\]]+)\]/g, '(.+)')
    .replace(/\[([^\]]+)\]/g, '([^/]+)');

  const regex = new RegExp(`^${escaped}$`);
  return {
    raw: r.route,
    regex,
    filePath: r.filePath,
  };
});

// Helper to check if a route matches
function isValidRoute(targetPath) {
  // Remove hash and query
  let clean = targetPath.split('#')[0].split('?')[0];
  if (!clean.startsWith('/')) clean = `/${clean}`;
  if (clean.length > 1 && clean.endsWith('/')) {
    clean = clean.slice(0, -1);
  }

  // Exact match or regex match
  for (const matcher of routeMatchers) {
    if (matcher.regex.test(clean)) {
      return true;
    }
  }
  return false;
}

// 2. Scan all files in src/ for internal links
const scannedExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];
const ASSET_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.ico',
  '.pdf', '.mp3', '.mp4', '.woff', '.woff2', '.ttf', '.eot'
];

function isAsset(target) {
  const clean = target.split('?')[0].split('#')[0].toLowerCase();
  return ASSET_EXTENSIONS.some((ext) => clean.endsWith(ext));
}

function getAllFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next') {
        files.push(...getAllFiles(full));
      }
    } else if (entry.isFile()) {
      if (scannedExtensions.includes(path.extname(entry.name))) {
        files.push(full);
      }
    }
  }
  return files;
}

const allFiles = getAllFiles(SRC_DIR);
console.log(`[check:links] Found ${routeMatchers.length} routes in src/app`);
console.log(`[check:links] Scanning ${allFiles.length} source files in src/ ...`);

const findings = [];

for (const file of allFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, lineIndex) => {
    // We look for patterns where a URL or route path is assigned or passed:
    // 1) Double-quoted strings: "..."
    // 2) Single-quoted strings: '...'
    // 3) Backtick template literals: `...`
    // Prefixed by href=, href:, url:, to=, redirect(, router.push(, router.replace(, etc.
    const patterns = [
      // href="..." or href='...' or href={`...`}
      /(?:href|to|url)\s*=\s*["']([^"']+)["']/g,
      /(?:href|to|url)\s*=\s*\{`([^`]+)`\}/g,
      /(?:href|to|url)\s*:\s*["']([^"']+)["']/g,
      /(?:href|to|url)\s*:\s*`([^`]+)`/g,
      // router.push("..."), router.push(`...`), redirect("..."), redirect(`...`)
      /(?:router\.(?:push|replace)|redirect)\s*\(\s*["']([^"']+)["']/g,
      /(?:router\.(?:push|replace)|redirect)\s*\(\s*`([^`]+)`/g,
      // requireAuth("..."), requireAuth(`...`)
      /requireAuth\s*\(\s*["']([^"']+)["']/g,
      /requireAuth\s*\(\s*`([^`]+)`/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const rawTarget = match[1].trim();

        // Must start with '/' and not '//'
        if (!rawTarget.startsWith('/') || rawTarget.startsWith('//') || isAsset(rawTarget)) {
          continue;
        }

        // Replace any template interpolation ${...} with a dummy segment 'param'
        const normalizedTarget = rawTarget.replace(/\$\{[^}]+\}/g, 'sample_param');

        const valid = isValidRoute(normalizedTarget);
        if (!valid) {
          findings.push({
            file: path.relative(process.cwd(), file).replace(/\\/g, '/'),
            line: lineIndex + 1,
            target: rawTarget,
            normalizedTarget,
            codeSnippet: line.trim(),
          });
        }
      }
    }
  });
}

// Remove duplicates based on file, line, and target
const uniqueFindings = [];
const seen = new Set();
for (const f of findings) {
  const key = `${f.file}:${f.line}:${f.target}`;
  if (!seen.has(key)) {
    seen.add(key);
    uniqueFindings.push(f);
  }
}

if (uniqueFindings.length > 0) {
  console.error(`\n❌ [check:links] Found ${uniqueFindings.length} broken internal link(s):\n`);
  console.table(
    uniqueFindings.map((f) => ({
      Location: `${f.file}:${f.line}`,
      Target: f.target,
    }))
  );
  process.exit(1);
} else {
  console.log(`\n✅ [check:links] All internal links match existing routes! (0 broken links)`);
  process.exit(0);
}
