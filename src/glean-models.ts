import type { Api, Model, ThinkingLevelMap } from "@earendil-works/pi-ai/compat"

/**
 * Wire types for the Glean LLM Gateway model catalog.
 * The gateway answers GET {baseUrl}/models with this shape.
 */
export interface GleanSupportedInputs {
	hasText?: boolean
	fileExtensions?: string[]
	imageExtensions?: string[]
	hasAudio?: boolean
}

export interface GleanTokenInfo {
	maxContextTokens?: number
	maxInputTokens?: number
	maxOutputTokens?: number
	pricingPerInputToken?: number
	pricingPerOutputToken?: number
	pricingPerCachedInputTokenRead?: number
}

export interface GleanImageLimits {
	maxDimPx?: number
	maxBytes?: number
}

export interface GleanModelFeatures {
	modelId?: string
	supportedInputs?: GleanSupportedInputs
	supportedEndpoints?: string[]
	supportedThinkingLevels?: string[]
	supportsJsonMode?: boolean
	supportsReasoning?: boolean
	supportsWebSearch?: boolean
	supportsFunctionCalling?: boolean
	supportsBatchPrediction?: boolean
	supportsStructuredOutputs?: boolean
	knowledgeCutoff?: string
	tokenInfo?: GleanTokenInfo
	imageLimits?: GleanImageLimits
}

export interface GleanModel {
	model: string
	modelAliases?: string[]
	creator?: string
	displayName?: string
	enabledSurfaces?: string[]
	features?: GleanModelFeatures
}

export interface GleanModelsResponse {
	models?: GleanModel[]
}

/** Pi provider id. The user selects this provider as "glean". */
export const GLEAN_PROVIDER_ID = "glean"

/** Environment variable that holds the Glean LLM Gateway API key. */
export const GLEAN_API_KEY_ENV = "GLEAN_LLM_API_KEY"

/** Environment variable that holds the Glean tenant id. */
export const GLEAN_TENANT_ID_ENV = "GLEAN_TENANT_ID"

/** The Anthropic version header that the Glean Messages route needs. */
export const GLEAN_ANTHROPIC_VERSION = "2023-06-01"

/** Glean endpoint names that Pi can drive. */
export const GLEAN_RESPONSES_ENDPOINT = "v1/responses"
export const GLEAN_COMPLETIONS_ENDPOINT = "v1/chat/completions"
export const GLEAN_MESSAGES_ENDPOINT = "v1/messages"

/** Glean thinking level that maps to the Pi "off" level. */
const GLEAN_THINKING_OFF = "none"

/** Pi thinking levels in ascending order. */
const PI_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const

/** Pi chat API ids that the Glean gateway can serve. */
export type GleanChatApi = "openai-responses" | "openai-completions" | "anthropic-messages"

/** Endpoint preference order. The Responses API wins over Chat Completions. */
const CHAT_API_PREFERENCE: ReadonlyArray<{ endpoint: string, api: GleanChatApi }> = [
	{ endpoint: GLEAN_RESPONSES_ENDPOINT, api: "openai-responses" },
	{ endpoint: GLEAN_COMPLETIONS_ENDPOINT, api: "openai-completions" },
	{ endpoint: GLEAN_MESSAGES_ENDPOINT, api: "anthropic-messages" },
]

const DEFAULT_CONTEXT_WINDOW = 128_000
const DEFAULT_MAX_TOKENS = 8_192

/**
 * Turn a user entry into a bare Glean tenant id.
 * The function accepts a bare id, a host name, or a full URL.
 */
export function normalizeTenantId(raw: string | undefined): string {
	if (!raw) return ""
	const trimmed = raw.trim()
	if (trimmed.length === 0) return ""
	const withoutScheme = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
	const host = withoutScheme.split("/")[0] ?? ""
	const label = host.split(".")[0] ?? ""
	return label.replace(/-be$/i, "").toLowerCase().trim()
}

/** Tenant root for every Glean REST route. */
export function gleanBaseUrl(tenantId: string): string {
	return `https://${tenantId}-be.glean.com/rest/api/v1`
}

/** Pick the best chat API for one catalog entry. Undefined means Pi cannot drive the model. */
export function gleanChatApi(model: GleanModel): GleanChatApi | undefined {
	const endpoints = model.features?.supportedEndpoints ?? []
	for (const candidate of CHAT_API_PREFERENCE) {
		if (endpoints.includes(candidate.endpoint)) return candidate.api
	}
	return undefined
}

/** Base URL for one chat API. Each SDK appends its own route. */
export function gleanApiBaseUrl(api: GleanChatApi, root: string): string {
	return api === "anthropic-messages" ? `${root}/anthropic` : `${root}/openai/v1`
}

/**
 * Build the Pi thinking level map for a Glean model.
 * Unsupported levels become null so that Pi clamps them.
 */
export function gleanThinkingLevelMap(levels: string[] | undefined): ThinkingLevelMap | undefined {
	if (!levels || levels.length === 0) return undefined
	const supported = new Set(levels)
	const map: ThinkingLevelMap = {}
	for (const level of PI_THINKING_LEVELS) {
		if (level === "off") {
			map.off = supported.has(GLEAN_THINKING_OFF) ? GLEAN_THINKING_OFF : null
			continue
		}
		map[level] = supported.has(level) ? level : null
	}
	return map
}

/**
 * Adaptive Anthropic thinking uses effort levels.
 * Glean marks those models with the xhigh or max thinking level.
 */
export function usesAdaptiveThinking(levels: string[] | undefined): boolean {
	if (!levels) return false
	return levels.includes("xhigh") || levels.includes("max")
}

function positive(value: number | undefined): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined
}

/** Glean prices one token. Pi prices one million tokens. */
function perMillionTokens(value: number | undefined): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0
	const rate = value * 1_000_000
	return Number.isFinite(rate) ? rate : 0
}

function modelIdFor(entry: GleanModel): string {
	const alias = entry.modelAliases?.find((value) => value.trim().length > 0)
	return (alias ?? entry.model ?? "").trim()
}

function compatFor(api: GleanChatApi, features: GleanModelFeatures): Model<Api>["compat"] {
	const strict = features.supportsStructuredOutputs === true
	switch (api) {
		case "openai-responses":
			return { supportsStrictMode: strict, supportsLongCacheRetention: false }
		case "openai-completions":
			return {
				supportsStore: false,
				supportsDeveloperRole: false,
				supportsReasoningEffort: true,
				maxTokensField: "max_tokens",
				supportsStrictMode: strict,
				supportsLongCacheRetention: false,
			}
		case "anthropic-messages":
			return usesAdaptiveThinking(features.supportedThinkingLevels) ? { forceAdaptiveThinking: true } : {}
		default:
			throw new Error(`Unsupported Glean chat API: ${String(api)}`)
	}
}

function buildModel(entry: GleanModel, id: string, api: GleanChatApi, root: string): Model<Api> {
	const features = entry.features ?? {}
	const tokenInfo = features.tokenInfo ?? {}
	const contextWindow =
		positive(tokenInfo.maxContextTokens) ?? positive(tokenInfo.maxInputTokens) ?? DEFAULT_CONTEXT_WINDOW
	const maxTokens = Math.min(positive(tokenInfo.maxOutputTokens) ?? DEFAULT_MAX_TOKENS, contextWindow)
	const reasoning = features.supportsReasoning === true
	const hasImages = (features.supportedInputs?.imageExtensions?.length ?? 0) > 0

	const model: Model<Api> = {
		id,
		name: entry.displayName?.trim() || id,
		api,
		provider: GLEAN_PROVIDER_ID,
		baseUrl: gleanApiBaseUrl(api, root),
		type: "chat",
		reasoning,
		input: hasImages ? ["text", "image"] : ["text"],
		cost: {
			input: perMillionTokens(tokenInfo.pricingPerInputToken),
			output: perMillionTokens(tokenInfo.pricingPerOutputToken),
			cacheRead: perMillionTokens(tokenInfo.pricingPerCachedInputTokenRead),
			cacheWrite: 0,
		},
		contextWindow,
		maxTokens,
		compat: compatFor(api, features),
	}

	if (reasoning) {
		const thinkingLevelMap = gleanThinkingLevelMap(features.supportedThinkingLevels)
		if (thinkingLevelMap) model.thinkingLevelMap = thinkingLevelMap
	}
	return model
}

/** Minimal credential shape for discovery. A stored api_key carries the tenant in env. */
export interface GleanCredentialLike {
	type?: string
	key?: string
	env?: Record<string, string>
}

/** Resolved Glean connection values. */
export interface GleanConnection {
	apiKey: string
	tenantId: string
}

/**
 * Resolve the API key and the tenant id.
 * Stored credentials win over the environment variables.
 */
export function resolveGleanCredentials(
	credential: GleanCredentialLike | undefined,
	readEnv: (name: string) => string | undefined,
): GleanConnection | undefined {
	const stored = credential?.type === "api_key" ? credential : undefined
	const apiKey = stored?.key ?? readEnv(GLEAN_API_KEY_ENV)
	const tenantId = normalizeTenantId(stored?.env?.[GLEAN_TENANT_ID_ENV] ?? readEnv(GLEAN_TENANT_ID_ENV))
	if (!apiKey || tenantId.length === 0) return undefined
	return { apiKey, tenantId }
}

/**
 * Convert the Glean catalog into Pi chat models.
 * The function drops unsupported endpoints and keeps the first duplicate id.
 */
export function mapGleanModels(payload: GleanModelsResponse, tenantId: string): Model<Api>[] {
	const root = gleanBaseUrl(tenantId)
	const mapped: Model<Api>[] = []
	const seen = new Set<string>()
	const entries = Array.isArray(payload.models) ? payload.models : []
	for (const entry of entries) {
		if (!entry) continue
		const api = gleanChatApi(entry)
		if (!api) continue
		const id = modelIdFor(entry)
		if (id.length === 0 || seen.has(id)) continue
		seen.add(id)
		mapped.push(buildModel(entry, id, api, root))
	}
	return mapped
}
