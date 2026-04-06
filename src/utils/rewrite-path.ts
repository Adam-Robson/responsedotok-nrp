import type { RouteRewrite } from "../lib/types/route-rewrite.js";

/**
 * Apply rewrite rules to apply forwarded path name.
 * @param pathname The request path to rewrite.
 * @param rewrite The rewrite rules to apply.
 * @returns The rewritten path.
 */
export function rewritePath(
  pathname: string, 
  rewrite?: RouteRewrite
): string {
	if (!rewrite) return pathname;

	if (rewrite.replacePath !== undefined) return rewrite.replacePath;

	let result = pathname;

	if (rewrite.stripPrefix && result.startsWith(rewrite.stripPrefix)) {
		result = result.slice(rewrite.stripPrefix.length) || "/";
	}

	if (rewrite.addPrefix) {
		result = rewrite.addPrefix + result;
	}

	return result;
}
