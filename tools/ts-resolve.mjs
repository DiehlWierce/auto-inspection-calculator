// Исходники приложения импортируют модули без расширения — так их видит сборщик Vite.
// Node такие пути не резолвит, поэтому CLI подключает этот хук и дописывает .ts сам.
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.(m?[jt]sx?|json|css)$/i.test(specifier)) {
    const base = fileURLToPath(new URL(specifier, context.parentURL));
    for (const candidate of [`${base}.ts`, `${base}/index.ts`]) {
      if (existsSync(candidate)) return nextResolve(pathToFileURL(candidate).href, context);
    }
  }
  return nextResolve(specifier, context);
}

register(import.meta.url, pathToFileURL('./'));
