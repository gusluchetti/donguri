import { getPublicUrl } from "./env";

const IS_DEV = process.env.NODE_ENV === "development";

export function pageTitle(title: string): string {
  return IS_DEV ? `(DEV) ${title}` : title;
}

const PUBLIC_URL = getPublicUrl();

interface OgTagsOptions {
  title: string;
  description: string;
  path: string;
  image?: string;
  type?: string;
}

export function ogTags({ title, description, path, image, type = "website" }: OgTagsOptions) {
  const url = `${PUBLIC_URL}${path}`;

  const tags = [
    { property: "og:site_name", content: "donguri" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: type },
    { property: "og:url", content: url },
    { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];

  if (image) {
    tags.push({ property: "og:image", content: image });
    tags.push({ name: "twitter:image", content: image });
  }

  return tags;
}
