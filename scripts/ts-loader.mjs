import { register } from 'node:module';

const hookSource = `
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve as pathResolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  if (
    context.parentURL &&
    context.parentURL.startsWith('file://') &&
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    !/\\.(ts|tsx|mts|cts|js|mjs|cjs|json)$/i.test(specifier)
  ) {
    const parentDir = dirname(fileURLToPath(context.parentURL));
    const basePath = pathResolve(parentDir, specifier);

    for (const candidate of [basePath + '.ts', pathResolve(basePath, 'index.ts')]) {
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        return {
          url: pathToFileURL(candidate).href,
          shortCircuit: true,
        };
      }
    }
  }
  return nextResolve(specifier, context);
}
`;

register(`data:text/javascript;base64,${Buffer.from(hookSource, 'utf8').toString('base64')}`, import.meta.url);
