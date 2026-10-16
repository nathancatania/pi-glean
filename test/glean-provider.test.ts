import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import type { RefreshModelsContext } from "@earendil-works/pi-ai/compat"
import { refreshGleanModels } from "../src/glean-auth.ts"

const realFetch = globalThis.fetch

afterEach(() => {
	globalThis.fetch = realFetch
})

function fakeContext(
	credential: RefreshModelsContext["credential"],
	allowNetwork = true,
): RefreshModelsContext {
	return {
		credential,
		allowNetwork,
		signal: new AbortController().signal,
		publish: async () => true,
	}
}

function catalogResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })
}

test("refreshGleanModels discovers and maps the catalog", async () => {
	globalThis.fetch = (async () =>
		catalogResponse({
			models: [
				{
					model: "GPT6_1_SOL",
					modelAliases: ["gpt-6.1"],
					displayName: "GPT-6.1 Sol",
					features: {
						supportedEndpoints: ["v1/responses"],
						supportsReasoning: true,
						supportedThinkingLevels: ["none", "low", "high"],
						tokenInfo: { maxContextTokens: 1_000, maxOutputTokens: 100 },
					},
				},
			],
		})) as typeof fetch

	const models = await refreshGleanModels(
		fakeContext({ type: "api_key", key: "stored-key", env: { GLEAN_TENANT_ID: "acme" } }),
	)
	assert.equal(models.length, 1)
	assert.equal(models[0]?.id, "gpt-6.1")
	assert.equal(models[0]?.baseUrl, "https://acme-be.glean.com/rest/api/v1/openai/v1")
	assert.equal(models[0]?.thinkingLevelMap?.off, "none")
})

test("refreshGleanModels falls back to the environment variables", async () => {
	let seenUrl = ""
	globalThis.fetch = (async (url: string | URL | Request) => {
		seenUrl = String(url)
		return catalogResponse({ models: [] })
	}) as typeof fetch

	const previousKey = process.env.GLEAN_LLM_API_KEY
	const previousTenant = process.env.GLEAN_TENANT_ID
	process.env.GLEAN_LLM_API_KEY = "env-key"
	process.env.GLEAN_TENANT_ID = "envacme"
	try {
		const models = await refreshGleanModels(fakeContext(undefined))
		assert.deepEqual(models, [])
		assert.equal(seenUrl, "https://envacme-be.glean.com/rest/api/v1/models")
	} finally {
		if (previousKey === undefined) delete process.env.GLEAN_LLM_API_KEY
		else process.env.GLEAN_LLM_API_KEY = previousKey
		if (previousTenant === undefined) delete process.env.GLEAN_TENANT_ID
		else process.env.GLEAN_TENANT_ID = previousTenant
	}
})

test("refreshGleanModels skips the network when it is not allowed", async () => {
	let called = false
	globalThis.fetch = (async () => {
		called = true
		return catalogResponse({ models: [] })
	}) as typeof fetch

	const models = await refreshGleanModels(
		fakeContext({ type: "api_key", key: "stored-key", env: { GLEAN_TENANT_ID: "acme" } }, false),
	)
	assert.deepEqual(models, [])
	assert.equal(called, false)
})

test("refreshGleanModels returns nothing without a tenant", async () => {
	let called = false
	globalThis.fetch = (async () => {
		called = true
		return catalogResponse({ models: [] })
	}) as typeof fetch

	const previousKey = process.env.GLEAN_LLM_API_KEY
	const previousTenant = process.env.GLEAN_TENANT_ID
	delete process.env.GLEAN_LLM_API_KEY
	delete process.env.GLEAN_TENANT_ID
	try {
		const models = await refreshGleanModels(fakeContext({ type: "api_key", key: "stored-key" }))
		assert.deepEqual(models, [])
		assert.equal(called, false)
	} finally {
		if (previousKey !== undefined) process.env.GLEAN_LLM_API_KEY = previousKey
		if (previousTenant !== undefined) process.env.GLEAN_TENANT_ID = previousTenant
	}
})
