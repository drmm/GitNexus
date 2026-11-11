/**
 * d0458: a TypeScript file that imports a JavaScript file gets its IMPORTS edge,
 * and its calls into that file their CALLS edges - through a tsconfig `paths`
 * alias with a fallback target, a relative `.mjs` path and a JavaScript
 * re-export - and a JavaScript file inside that import closure is linked to the
 * TypeScript it imports. Before d0458 each language's scope pass resolved
 * imports against its own files only (`runScopeResolution`'s `allFilePaths`),
 * so none of these edges existed. Every case runs twice: in memory, and on the
 * disk-backed ParsedFile store a real `analyze` uses, where the TypeScript
 * pass's context hook first sees only the TypeScript files' records.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import {
  FIXTURES,
  getRelationships,
  edgeSet,
  runPipelineFromRepo,
  type PipelineResult,
} from './helpers.js';
import { loadParseCache } from '../../../src/storage/parse-cache.js';
import { createTempDirPool } from '../../helpers/temp-dir-pool.js';

const repos = createTempDirPool('gn-d0458-repo-');
const storages = createTempDirPool('gn-d0458-store-');

/** `source file -> target file` for every edge of `type`. */
const fileEdges = (result: PipelineResult, type: string): string[] =>
  getRelationships(result, type)
    .map((e) => `${e.sourceFilePath} -> ${e.targetFilePath}`)
    .sort();

const calls = (result: PipelineResult): string[] => edgeSet(getRelationships(result, 'CALLS'));

const runBoth = async (fixture: string): Promise<[string, PipelineResult][]> => [
  ['in memory', await runPipelineFromRepo(repos.fromFixture(fixture), () => {})],
  [
    'disk-backed store',
    await runPipelineFromRepo(repos.fromFixture(fixture), () => {}, {
      parseCache: await loadParseCache(storages.dir()),
    }),
  ],
];

describe('TypeScript importing JavaScript (d0458)', () => {
  let runs: [string, PipelineResult][];
  beforeAll(async () => {
    runs = await runBoth(path.join(FIXTURES, 'typescript-imports-javascript'));
  }, 120000);

  it('links each import: an alias with a fallback target, a relative .mjs, a re-export', () => {
    for (const [mode, result] of runs) {
      expect(fileEdges(result, 'IMPORTS'), mode).toEqual(
        expect.arrayContaining([
          'assistant/tools.ts -> ops.mjs',
          'assistant/tools.ts -> lib/barrel.js',
          'assistant/tools.ts -> lib/js-uses-ts.mjs',
          'assistant/rel.ts -> ops.mjs',
        ]),
      );
    }
  });

  it('resolves the calls across, through the re-export too', () => {
    for (const [mode, result] of runs) {
      expect(calls(result), mode).toEqual(
        expect.arrayContaining([
          'tools → run',
          'tools → helper',
          'tools → jsCaller',
          'viaRelative → run',
        ]),
      );
    }
  });

  it('links a JavaScript file in that closure to the TypeScript it imports', () => {
    for (const [mode, result] of runs) {
      expect(fileEdges(result, 'IMPORTS'), mode).toContain('lib/js-uses-ts.mjs -> ts-only.ts');
      expect(calls(result), mode).toContain('jsCaller → tsOnly');
    }
  });

  it("keeps the JavaScript files' own edges", () => {
    for (const [mode, result] of runs) {
      expect(fileEdges(result, 'IMPORTS'), mode).toContain('ops.mjs -> core.js');
      expect(calls(result), mode).toContain('run → helper');
    }
  });

  it('resolves ./twin.js to twin.ts when both exist, as tsc does', () => {
    for (const [mode, result] of runs) {
      expect(fileEdges(result, 'IMPORTS'), mode).toContain('uses-twin.ts -> twin.ts');
      expect(fileEdges(result, 'IMPORTS'), mode).not.toContain('uses-twin.ts -> twin.js');
    }
  });
});
