/**
 * Import resolution for unit tests (`npm test`), preloaded with `node --import`.
 *
 * Node runs .ts files natively by stripping their types, but resolves imports
 * strictly: no tsconfig "paths" and no extension guessing. App code is written
 * for Metro, so this teaches Node the two conventions it relies on:
 *
 *   '@/lib/foo' -> <repo>/src/lib/foo       (tsconfig "paths")
 *   './foo'     -> ./foo.ts or ./foo/index.ts
 *
 * Only .ts is tried. Type stripping can't transform JSX, so .tsx components
 * (and anything that pulls in react-native or expo) are deliberately out of
 * reach — tests target pure TypeScript modules.
 *
 * module.registerHooks runs in-thread and synchronously, so the hook covers
 * both `import` and `require()`. The test runner passes `--import` on to the
 * child process it spawns for each test file.
 */
import { statSync } from 'node:fs';
import nodeModule from 'node:module';

// Unflagged type stripping and module.registerHooks: Node 22.18+ or 23.6+.
// Checked before use so older Nodes get this instead of a confusing failure.
const [major, minor] = process.versions.node.split('.').map(Number);
if (!(major > 23 || (major === 23 && minor >= 6) || (major === 22 && minor >= 18))) {
  throw new Error(`npm test needs Node >= 22.18 (TypeScript type stripping); this is ${process.version}.`);
}

const SRC_URL = new URL('../../src/', import.meta.url);
const TS_SUFFIXES = ['.ts', '/index.ts'];

function isFile(url) {
  try {
    return statSync(url).isFile();
  } catch {
    return false;
  }
}

nodeModule.registerHooks({
  resolve(specifier, context, nextResolve) {
    // Only rewrite what app code needs: '@/' aliases anywhere, and relative
    // specifiers from files under src/. Everything else — bare packages,
    // node: builtins, and relative require()s inside node_modules (the CJS
    // resolver rejects file: URLs as specifiers) — goes to Node untouched.
    let target;
    if (specifier.startsWith('@/')) {
      target = new URL(specifier.slice(2), SRC_URL);
    } else if (/^\.\.?\//.test(specifier) && context.parentURL?.startsWith(SRC_URL.href)) {
      const base = new URL(specifier, context.parentURL);
      // Paths that already name a file ('./data.json', './foo.ts') keep it.
      if (!isFile(base)) target = base;
    }

    if (target && !isFile(target)) {
      const match = TS_SUFFIXES.map((suffix) => new URL(target.href + suffix)).find(isFile);
      if (match) {
        target = match;
      } else if (isFile(new URL(`${target.href}.tsx`))) {
        // Fail with the reason instead of a bare "Cannot find module".
        throw new Error(
          `'${specifier}' (imported from ${context.parentURL}) is a .tsx module. `
          + 'Node cannot strip JSX, so unit tests can only load pure .ts modules.',
        );
      } else if (!specifier.startsWith('@/')) {
        // No .ts probe matched: let Node report the original specifier.
        target = undefined;
      }
    }
    const resolved = nextResolve(target ? target.href : specifier, context);

    // App code is ESM, but package.json has no "type" (Expo's config files
    // are CommonJS), so say so up front instead of letting Node fail to parse
    // each file as CommonJS first and warn (MODULE_TYPELESS_PACKAGE_JSON).
    if (!resolved.format && resolved.url.startsWith(SRC_URL.href) && resolved.url.endsWith('.ts')) {
      return { ...resolved, format: 'module-typescript' };
    }
    return resolved;
  },
});
