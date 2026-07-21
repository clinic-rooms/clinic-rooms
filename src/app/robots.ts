import type { MetadataRoute } from "next";

// Private clinic app — never index anything, everywhere.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
