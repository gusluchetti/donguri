/** Strip surrounding quotes that Docker --env-file keeps literal. */
export function cleanEnv(value: string | undefined): string {
  if (!value) return "";
  return value.trim().replace(/^['"]/, "").replace(/['"]$/, "");
}

export function getPublicUrl(): string {
  return (cleanEnv(process.env.PUBLIC_URL) || "https://dev.donguri.app").replace(/\/+$/, "");
}
