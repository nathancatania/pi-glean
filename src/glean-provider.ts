import {
	anthropicMessagesApi,
	createProvider,
	openAICompletionsApi,
	openAIResponsesApi,
	type Api,
	type Provider,
	type ProviderStreams,
} from "@earendil-works/pi-ai/compat"
import { withGleanAnthropicAuth } from "./glean-anthropic.ts"
import { gleanLogin, gleanResolve, refreshGleanModels } from "./glean-auth.ts"
import { GLEAN_PROVIDER_ID } from "./glean-models.ts"

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
