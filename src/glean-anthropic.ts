import type { ProviderHeaders, StreamOptions } from "@earendil-works/pi-ai/compat"
import { GLEAN_ANTHROPIC_VERSION } from "./glean-models.ts"

/**
 * The Glean Messages route authenticates with a bearer token.
 * The Anthropic SDK sends x-api-key by default. The function removes that header.
 */
export function withGleanAnthropicAuth<T extends StreamOptions>(options: T | undefined): T {
	const headers: ProviderHeaders = {
		...(options?.headers ?? {}),
		"x-api-key": null,
		"anthropic-version": GLEAN_ANTHROPIC_VERSION,
	}
	if (options?.apiKey) headers.Authorization = `Bearer ${options.apiKey}`
	return { ...options, headers } as T
}
