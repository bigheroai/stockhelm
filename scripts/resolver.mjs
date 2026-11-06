/**
 * Lets plain `node` run the TypeScript sources directly (Node 24 strips types
 * natively). It only resolves specifiers: the "@/..." alias from tsconfig and
 * extensionless relative imports. No transpilation, no child processes.
 */
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = path.resolve(process.cwd(), 'src');
const EXTS = ['.ts', '.tsx', '.mts', '.js', '.mjs'];

function findFile(base) {
  try {
    if (existsSync(base) && statSync(base).isFile()) return base;
  } catch {
    /* ignore */
  }
  for (const ext of EXTS) {
    const candidate = base + ext;
    if (existsSync(candidate)) return candidate;
  }
  for (const ext of EXTS) {
    const candidate = path.join(base, `index${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const found = findFile(path.join(SRC, specifier.slice(2)));
    if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
  }

  const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
  if (isRelative && context.parentURL) {
    if (!path.extname(specifier)) {
      const parentDir = fileURLToPath(new URL('.', context.parentURL));
      const found = findFile(path.resolve(parentDir, specifier));
      if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
    }
  }

  return nextResolve(specifier, context);
}
