import { run } from '@/lib/repo/ops.mjs';
import { helper } from '../lib/barrel.js';
import { jsCaller } from '../lib/js-uses-ts.mjs';

export function tools(): unknown {
  return [run('x'), helper(1), jsCaller()];
}
