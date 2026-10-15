import { gleanBaseUrl, type GleanModelsResponse } from "./glean-models.ts"

export interface GleanClientOptions {
	tenantId: string
	apiKey: string
	signal?: AbortSignal
}

/** Read the Glean model catalog for one tenant. */
export async function listGleanModels(options: GleanClientOptions): Promise<GleanModelsResponse> {
	const url = `${gleanBaseUrl(options.tenantId)}/models`
	const response = await fetch(url, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${options.apiKey}`,
			Accept: "application/json",
		},
		signal: options.signal,
	})
	if (!response.ok) {
		const detail = await readErrorDetail(response)
		throw new Error(`Glean model discovery failed with status ${response.status}${detail}`)
	}
	const body = await response.json()
	return body as GleanModelsResponse
}

async function readErrorDetail(response: Response): Promise<string> {
	try {
		const text = (await response.text()).trim()
		return text.length > 0 ? `: ${text.slice(0, 300)}` : ""
	} catch {
		return ""
	}
}
