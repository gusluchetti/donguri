/**
 * Open Graph + Twitter Card meta tag helper.
 *
 * Returns an array of meta objects for TanStack Start's `head()`.
 * Reads PUBLIC_URL from process.env (safe — `head()` runs during SSR).
 */

const PUBLIC_URL = (process.env.PUBLIC_URL || "http://localhost:3000").replace(/\/+$/, "");

interface OgTagsOptions {
  title: string;
  description: string;
  path: string;
  image?: string;
  type?: string;
}

export function ogTags({ title, description, path, image, type = "website" }: OgTagsOptions) {
  const url = `${PUBLIC_URL}${path}`;
  const imageUrl = image || `${PUBLIC_URL}/og-default.png`;
  const card = image ? "summary_large_image" : "summary";

  return [
    { property: "og:site_name", content: "donguri" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: type },
    { property: "og:url", content: url },
    { property: "og:image", content: imageUrl },
    { name: "twitter:card", content: card },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: imageUrl },
  ];
}
