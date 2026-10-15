import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { createGleanProvider } from "./src/glean-provider.ts"

/**
 * Glean LLM Gateway provider for Pi.
 * The provider discovers models from the tenant catalog at startup.
 */
export default function glean(pi: ExtensionAPI): void {
	pi.registerProvider(createGleanProvider())
}
