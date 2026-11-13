// Lets tests import source .ts files that use "./x.js" specifiers, so they run without a build.
export async function resolve(specifier, context, next) {
  if (specifier.endsWith('.js') && context.parentURL?.includes('/src/')) { try { return await next(specifier.replace(/\.js$/, '.ts'), context) } catch { /* fall through */ } }
  return next(specifier, context)
}
