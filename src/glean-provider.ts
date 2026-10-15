import {
	anthropicMessagesApi,
	createProvider,
	openAICompletionsApi,
	openAIResponsesApi,
	type Api,
	type ApiKeyCredential,
	type AuthContext,
	type AuthResult,
	type Model,
	type Provider,
	type ProviderAuthInteraction,
	type ProviderStreams,
	type RefreshModelsContext,
} from "@earendil-works/pi-ai/compat"
import { withGleanAnthropicAuth } from "./glean-anthropic.ts"
import { listGleanModels } from "./glean-client.ts"
import {
	GLEAN_API_KEY_ENV,
	GLEAN_PROVIDER_ID,
	GLEAN_TENANT_ID_ENV,
	mapGleanModels,
	normalizeTenantId,
	resolveGleanCredentials,
} from "./glean-models.ts"

/** Prompt for the tenant id and the API key. Then verify the pair against Glean. */
export async function gleanLogin(interaction: ProviderAuthInteraction): Promise<ApiKeyCredential> {
	const rawTenant = await interaction.prompt({
		type: "text",
		message: "Glean tenant id",
		placeholder: "acme (from acme-be.glean.com)",
	})
	const tenantId = normalizeTenantId(rawTenant)
	if (tenantId.length === 0) throw new Error("A Glean tenant id is required.")
	const apiKey = (await interaction.prompt({ type: "secret", message: "Glean LLM Gateway API key" })).trim()
	if (apiKey.length === 0) throw new Error("A Glean LLM Gateway API key is required.")
	await listGleanModels({ tenantId, apiKey, signal: interaction.signal })
	return { type: "api_key", key: apiKey, env: { [GLEAN_TENANT_ID_ENV]: tenantId } }
}

/** Resolve the request API key and the tenant id from the credential or the environment. */
export async function gleanResolve(input: {
	ctx: AuthContext
	credential?: ApiKeyCredential
	signal: AbortSignal
}): Promise<AuthResult | undefined> {
	const envApiKey = await input.ctx.env(GLEAN_API_KEY_ENV)
	const envTenantId = await input.ctx.env(GLEAN_TENANT_ID_ENV)
	const connection = resolveGleanCredentials(input.credential, (name) =>
		name === GLEAN_API_KEY_ENV ? envApiKey : envTenantId,
	)
	if (!connection) return undefined
	const stored = input.credential?.type === "api_key" && typeof input.credential.key === "string"
	return {
		auth: { apiKey: connection.apiKey },
		env: { [GLEAN_TENANT_ID_ENV]: connection.tenantId },
		source: stored ? "stored credential" : GLEAN_API_KEY_ENV,
	}
}

/** Discover the Glean catalog for the resolved credential or environment values. */
export async function refreshGleanModels(context: RefreshModelsContext): Promise<Model<Api>[]> {
	if (!context.allowNetwork || context.signal.aborted) return []
	const connection = resolveGleanCredentials(context.credential, (name) => process.env[name])
	if (!connection) return []
	const payload = await listGleanModels({
		tenantId: connection.tenantId,
		apiKey: connection.apiKey,
		signal: context.signal,
	})
	return mapGleanModels(payload, connection.tenantId)
}

function gleanAnthropicApi(): ProviderStreams {
	const inner = anthropicMessagesApi()
	return {
		stream: (model, context, options) => inner.stream(model, context, withGleanAnthropicAuth(options)),
		streamSimple: (model, context, options) => inner.streamSimple(model, context, withGleanAnthropicAuth(options)),
	}
}

/** Build the Glean provider. Live discovery supplies the model list. */
export function createGleanProvider(): Provider<Api> {
	return createProvider<Api>({
		id: GLEAN_PROVIDER_ID,
		name: "Glean",
		auth: {
			apiKey: {
				name: "Glean LLM Gateway API key",
				login: gleanLogin,
				resolve: gleanResolve,
			},
		},
		models: [],
		api: {
			"openai-responses": openAIResponsesApi(),
			"openai-completions": openAICompletionsApi(),
			"anthropic-messages": gleanAnthropicApi(),
		},
		fetchModels: refreshGleanModels,
	})
}
