export async function resolve(specifier, context, nextResolve) {
  try { return await nextResolve(specifier, context); }
  catch (error) {
    if ((specifier.startsWith('.') || specifier.startsWith('/')) && !/[.](ts|js|mjs|json)$/.test(specifier)) {
      for (const suffix of ['.ts', '/index.ts']) {
        try { return await nextResolve(specifier + suffix, context); } catch {}
      }
    }
    throw error;
  }
}
