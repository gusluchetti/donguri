/* biome-ignore-all lint/suspicious/noConsole: this is the sanctioned logger wrapper */

const isDev = process.env.NODE_ENV === "development";
const noop = () => {};

/**
 * Application logger. Use instead of `console.*` everywhere except CLI scripts
 * under `src/import/**` and `src/db/seed-*.ts` (which have a Biome override).
 *
 * - `debug` / `info`: dev-only, no-op in production
 * - `warn` / `error`: always emit
 *
 * Methods are bound to `console` so the browser DevTools / terminal stack
 * trace points at the *caller*, not at this wrapper.
 */
export const log = {
  debug: isDev ? console.debug.bind(console) : noop,
  info: isDev ? console.info.bind(console) : noop,
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};
