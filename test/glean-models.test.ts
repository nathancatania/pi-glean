import assert from "node:assert/strict"
import { test } from "node:test"
import {
	GLEAN_PROVIDER_ID,
	gleanApiBaseUrl,
	gleanBaseUrl,
	gleanChatApi,
	gleanThinkingLevelMap,
	mapGleanModels,
	normalizeTenantId,
	usesAdaptiveThinking,
	type GleanModel,
} from "../src/glean-models.ts"

function model(overrides: Partial<GleanModel> & { model: string }): GleanModel {
	return { displayName: overrides.model, ...overrides }
}

function close(actual: number, expected: number): void {
	assert.ok(Math.abs(actual - expected) < 1e-9, `expected ${expected}, got ${actual}`)
}

test("normalizeTenantId accepts a bare id", () => {
	assert.equal(normalizeTenantId("acme"), "acme")
})

test("normalizeTenantId strips a full URL", () => {
	assert.equal(normalizeTenantId("https://acme-be.glean.com/rest/api/v1"), "acme")
})

test("normalizeTenantId removes a trailing -be label", () => {
	assert.equal(normalizeTenantId("acme-be.glean.com"), "acme")
})

test("normalizeTenantId lowercases and trims", () => {
	assert.equal(normalizeTenantId("  ACME-Be  "), "acme")
})

test("normalizeTenantId returns an empty string for empty input", () => {
	assert.equal(normalizeTenantId(undefined), "")
	assert.equal(normalizeTenantId("   "), "")
})

test("gleanBaseUrl builds the tenant root", () => {
	assert.equal(gleanBaseUrl("acme"), "https://acme-be.glean.com/rest/api/v1")
})

test("gleanChatApi prefers the Responses API", () => {
	const entry = model({
		model: "GPT6_1_SOL",
		features: { supportedEndpoints: ["v1/chat/completions", "v1/responses"] },
	})
	assert.equal(gleanChatApi(entry), "openai-responses")
})

test("gleanChatApi selects chat completions alone", () => {
	const entry = model({ model: "GLM_5P2", features: { supportedEndpoints: ["v1/chat/completions"] } })
	assert.equal(gleanChatApi(entry), "openai-completions")
})

test("gleanChatApi selects the Messages API", () => {
	const entry = model({ model: "CLAUDE_5_OPUS", features: { supportedEndpoints: ["v1/messages"] } })
	assert.equal(gleanChatApi(entry), "anthropic-messages")
})

test("gleanChatApi rejects endpoints that Pi cannot drive", () => {
	const endpoints = ["streamGenerateContent", "ConverseStream", "v1/realtime", "v1/embeddings", "v1/audio/speech"]
	for (const endpoint of endpoints) {
		const entry = model({ model: endpoint, features: { supportedEndpoints: [endpoint] } })
		assert.equal(gleanChatApi(entry), undefined, endpoint)
	}
})

test("gleanApiBaseUrl separates the OpenAI and Anthropic roots", () => {
	const root = gleanBaseUrl("acme")
	assert.equal(gleanApiBaseUrl("openai-responses", root), `${root}/openai/v1`)
	assert.equal(gleanApiBaseUrl("openai-completions", root), `${root}/openai/v1`)
	assert.equal(gleanApiBaseUrl("anthropic-messages", root), `${root}/anthropic`)
})

test("gleanThinkingLevelMap maps none to off", () => {
	assert.deepEqual(gleanThinkingLevelMap(["none", "low", "high"]), {
		off: "none",
		minimal: null,
		low: "low",
		medium: null,
		high: "high",
		xhigh: null,
		max: null,
	})
})

test("gleanThinkingLevelMap marks off unsupported without none", () => {
	const map = gleanThinkingLevelMap(["low", "medium", "high"])
	assert.equal(map?.off, null)
	assert.equal(map?.low, "low")
})

test("gleanThinkingLevelMap returns undefined for an empty list", () => {
	assert.equal(gleanThinkingLevelMap(undefined), undefined)
	assert.equal(gleanThinkingLevelMap([]), undefined)
})

test("usesAdaptiveThinking detects effort-only levels", () => {
	assert.equal(usesAdaptiveThinking(["low", "medium", "high"]), false)
	assert.equal(usesAdaptiveThinking(["low", "max"]), true)
	assert.equal(usesAdaptiveThinking(["xhigh"]), true)
})

test("mapGleanModels converts per-token prices to per-million prices", () => {
	const models = mapGleanModels(
		{
			models: [
				model({
					model: "GPT6_1_SOL",
					displayName: "GPT-6.1 Sol",
					modelAliases: ["gpt-6.1"],
					features: {
						supportedEndpoints: ["v1/responses"],
						supportsReasoning: true,
						tokenInfo: {
							maxContextTokens: 1_050_000,
							maxOutputTokens: 128_000,
							pricingPerInputToken: 0.000002,
							pricingPerOutputToken: 0.00001,
							pricingPerCachedInputTokenRead: 1e-7,
						},
					},
				}),
			],
		},
		"acme",
	)
	assert.equal(models.length, 1)
	const entry = models[0]
	assert.ok(entry)
	assert.equal(entry.id, "gpt-6.1")
	assert.equal(entry.name, "GPT-6.1 Sol")
	assert.equal(entry.provider, GLEAN_PROVIDER_ID)
	assert.equal(entry.api, "openai-responses")
	assert.equal(entry.baseUrl, "https://acme-be.glean.com/rest/api/v1/openai/v1")
	assert.equal(entry.contextWindow, 1_050_000)
	assert.equal(entry.maxTokens, 128_000)
	assert.equal(entry.reasoning, true)
	close(entry.cost.input, 2)
	close(entry.cost.output, 10)
	close(entry.cost.cacheRead, 0.1)
	assert.equal(entry.cost.cacheWrite, 0)
})

test("mapGleanModels selects the Anthropic route and adaptive thinking", () => {
	const models = mapGleanModels(
		{
			models: [
				model({
					model: "CLAUDE_5_5_OPUS",
					displayName: "Claude Opus 5.5",
					modelAliases: ["claude-opus-5-5", "anthropic.claude-opus-5-5"],
					features: {
						supportedEndpoints: ["v1/messages"],
						supportedThinkingLevels: ["low", "medium", "high", "xhigh", "max"],
						supportsReasoning: true,
						supportedInputs: { hasText: true, imageExtensions: ["png", "jpg"] },
						tokenInfo: { maxContextTokens: 1_000_000, maxOutputTokens: 128_000 },
					},
				}),
			],
		},
		"acme",
	)
	const entry = models[0]
	assert.ok(entry)
	assert.equal(entry.api, "anthropic-messages")
	assert.equal(entry.baseUrl, "https://acme-be.glean.com/rest/api/v1/anthropic")
	assert.deepEqual(entry.input, ["text", "image"])
	const compat = entry.compat as { forceAdaptiveThinking?: boolean } | undefined
	assert.equal(compat?.forceAdaptiveThinking, true)
	assert.equal(entry.thinkingLevelMap?.max, "max")
})

test("mapGleanModels keeps legacy thinking without adaptive effort", () => {
	const models = mapGleanModels(
		{
			models: [
				model({
					model: "CLAUDE_4_5_HAIKU",
					modelAliases: ["claude-haiku-4-5"],
					features: {
						supportedEndpoints: ["v1/messages"],
						supportedThinkingLevels: ["low", "medium", "high"],
						supportsReasoning: true,
						tokenInfo: { maxContextTokens: 200_000, maxOutputTokens: 64_000 },
					},
				}),
			],
		},
		"acme",
	)
	const entry = models[0]
	assert.ok(entry)
	const compat = entry.compat as { forceAdaptiveThinking?: boolean } | undefined
	assert.equal(compat?.forceAdaptiveThinking, undefined)
	assert.equal(entry.thinkingLevelMap?.off, null)
})

test("mapGleanModels clamps max tokens to the context window", () => {
	const models = mapGleanModels(
		{
			models: [
				model({
					model: "SMALL",
					features: {
						supportedEndpoints: ["v1/chat/completions"],
						tokenInfo: { maxContextTokens: 4_000, maxOutputTokens: 100_000 },
					},
				}),
			],
		},
		"acme",
	)
	assert.equal(models[0]?.maxTokens, 4_000)
})

test("mapGleanModels applies defaults for missing token info", () => {
	const models = mapGleanModels(
		{ models: [model({ model: "BARE", features: { supportedEndpoints: ["v1/chat/completions"] } })] },
		"acme",
	)
	const entry = models[0]
	assert.ok(entry)
	assert.equal(entry.reasoning, false)
	assert.equal(entry.thinkingLevelMap, undefined)
	assert.equal(entry.maxTokens, 8_192)
	assert.equal(entry.contextWindow, 128_000)
	assert.deepEqual(entry.input, ["text"])
})

test("mapGleanModels skips unsupported models", () => {
	const models = mapGleanModels(
		{
			models: [
				model({ model: "EMBED", features: { supportedEndpoints: ["v1/embeddings"] } }),
				model({ model: "GEMINI_3_8_FLASH", features: { supportedEndpoints: ["streamGenerateContent"] } }),
				model({ model: "GPT_REALTIME_2", features: { supportedEndpoints: ["v1/realtime"] } }),
				model({ model: "WALDO", features: { supportedEndpoints: ["v1/chat/completions"] } }),
			],
		},
		"acme",
	)
	assert.deepEqual(
		models.map((entry) => entry.id),
		["WALDO"],
	)
})

test("mapGleanModels keeps the first model for a duplicate id", () => {
	const models = mapGleanModels(
		{
			models: [
				model({ model: "FIRST", modelAliases: ["shared"], features: { supportedEndpoints: ["v1/responses"] } }),
				model({ model: "SECOND", modelAliases: ["shared"], features: { supportedEndpoints: ["v1/responses"] } }),
			],
		},
		"acme",
	)
	assert.equal(models.length, 1)
	assert.equal(models[0]?.name, "FIRST")
})

test("mapGleanModels falls back to the internal id without an alias", () => {
	const models = mapGleanModels(
		{ models: [model({ model: "GPT_IMAGE_2", features: { supportedEndpoints: ["v1/responses"] } })] },
		"acme",
	)
	assert.equal(models[0]?.id, "GPT_IMAGE_2")
})

test("mapGleanModels tolerates a payload without a model list", () => {
	const payload = {} as Parameters<typeof mapGleanModels>[0]
	assert.deepEqual(mapGleanModels(payload, "acme"), [])
})
