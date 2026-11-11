/**
 * Turning a resolved stem into a real file, the way TypeScript does (#2953).
 *
 * Shared by `module-resolution.ts` and the package-manifest resolver so both
 * try the same three shapes — exact path, extension, directory index — and, as
 * importantly, the same NARROW extension list. The repo-wide `EXTENSIONS` in
 * `import-resolvers/utils.ts` carries ~39 entries spanning every language the
 * indexer supports; a TypeScript import cannot resolve to a `.py` or `.rb`
 * file, and letting it try was part of how the old suffix matcher found files
 * that had nothing to do with the import.
 */

/** Extension candidates, in the order TypeScript tries them. */
export const TS_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.d.ts',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.json',
] as const;

/**
 * JS-family extensions a specifier may carry for a TypeScript source file.
 *
 * TypeScript ESM requires the specifier to name the EMITTED file (`./m.js`)
 * while the file on disk is `./m.ts`, so a resolver that only tried the literal
 * extension would miss every ESM-style relative import in a modern codebase.
 */
export const JS_TO_TS: ReadonlyMap<string, readonly string[]> = new Map([
  ['.js', ['.ts', '.tsx', '.d.ts']],
  ['.jsx', ['.tsx']],
  ['.mjs', ['.mts']],
  ['.cjs', ['.cts']],
]);

/**
 * A repo-relative stem resolved to a real indexed file, or `null`.
 *
 * The ESM `.js` → `.ts` rewrite, then the exact match, then each extension,
 * then the directory-index form. Nothing here searches: every candidate is
 * derived from the stem the caller already resolved from a declared source.
 */
export function resolveFile(stem: string, allFiles: ReadonlySet<string>): string | null {
  if (stem === '') return null;

  // The rewrite comes BEFORE the literal file, as in tsc: for `./m.js` with
  // both `m.ts` and a compiled `m.js` present, TypeScript resolves `m.ts`.
  // While each language's pass held only its own files the order could not
  // matter; a TypeScript pass now also holds the JavaScript files it imports
  // (d0458), and literal-first would move a TS→TS edge onto the compiled twin.
  const dot = stem.lastIndexOf('.');
  const ext = dot === -1 ? '' : stem.slice(dot);
  const tsEquivalents = JS_TO_TS.get(ext);
  if (tsEquivalents !== undefined) {
    const stripped = stem.slice(0, -ext.length);
    for (const candidate of tsEquivalents) {
      if (allFiles.has(stripped + candidate)) return stripped + candidate;
    }
  }
  if (allFiles.has(stem)) return stem;

  for (const candidate of TS_EXTENSIONS) {
    if (allFiles.has(stem + candidate)) return stem + candidate;
  }
  for (const candidate of TS_EXTENSIONS) {
    if (allFiles.has(`${stem}/index${candidate}`)) return `${stem}/index${candidate}`;
  }
  return null;
}
