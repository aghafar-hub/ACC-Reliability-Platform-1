// Node resolve hook for the tests: the app sources import "./levels" without
// ".js" (Vite adds it); Node does not, so try ".js" / ".jsx" too.
export async function resolve(spec, ctx, next) {
  try {
    return await next(spec, ctx);
  } catch (e) {
    if (e.code !== "ERR_MODULE_NOT_FOUND" || !/^\.{1,2}\//.test(spec) || /\.[cm]?jsx?$/.test(spec)) throw e;
    for (const ext of [".js", ".jsx"]) {
      try {
        return await next(spec + ext, ctx);
      } catch {
        /* next */
      }
    }
    throw e;
  }
}
