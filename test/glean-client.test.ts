import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { listGleanModels } from "../src/glean-client.ts"
import { GLEAN_API_KEY_ENV, GLEAN_TENANT_ID_ENV, resolveGleanCredentials } from "../src/glean-models.ts"

const realFetch = globalThis.fetch

afterEach(() => {
	globalThis.fetch = realFetch
})

test("resolveGleanCredentials reads a stored credential", () => {
	const connection = resolveGleanCredentials(
		{ type: "api_key", key: "stored-key", env: { [GLEAN_TENANT_ID_ENV]: "acme" } },
		() => undefined,
	)
	assert.deepEqual(connection, { apiKey: "stored-key", tenantId: "acme" })
})

test("resolveGleanCredentials falls back to the environment", () => {
	const values: Record<string, string> = {
		[GLEAN_API_KEY_ENV]: "env-key",
		[GLEAN_TENANT_ID_ENV]: "https://env-be.glean.com/rest/api/v1",
	}
	const connection = resolveGleanCredentials(undefined, (name) => values[name])
	assert.deepEqual(connection, { apiKey: "env-key", tenantId: "env" })
})

test("resolveGleanCredentials prefers a stored credential over the environment", () => {
	const values: Record<string, string> = {
		[GLEAN_API_KEY_ENV]: "env-key",
		[GLEAN_TENANT_ID_ENV]: "env-tenant",
	}
	const connection = resolveGleanCredentials({ type: "api_key", key: "stored" }, (name) => values[name])
	assert.deepEqual(connection, { apiKey: "stored", tenantId: "env-tenant" })
})

test("resolveGleanCredentials needs both values", () => {
	assert.equal(resolveGleanCredentials(undefined, () => undefined), undefined)
	assert.equal(
		resolveGleanCredentials(undefined, (name) => (name === GLEAN_API_KEY_ENV ? "key" : undefined)),
		undefined,
	)
	assert.equal(
		resolveGleanCredentials(undefined, (name) => (name === GLEAN_TENANT_ID_ENV ? "acme" : undefined)),
		undefined,
	)
})

test("listGleanModels sends the bearer token and reads the catalog", async () => {
	let seenUrl = ""
	let seenAuth = ""
	globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
		seenUrl = String(url)
		const headers = new Headers(init?.headers)
		seenAuth = headers.get("authorization") ?? ""
		return new Response(JSON.stringify({ models: [{ model: "WALDO" }] }), {
			status: 200,
			headers: { "content-type": "application/json" },
		})
	}) as typeof fetch

	const payload = await listGleanModels({ tenantId: "acme", apiKey: "secret" })
	assert.equal(seenUrl, "https://acme-be.glean.com/rest/api/v1/models")
	assert.equal(seenAuth, "Bearer secret")
	assert.equal(payload.models?.[0]?.model, "WALDO")
})

test("listGleanModels reports a failing status", async () => {
	globalThis.fetch = (async () =>
		new Response("bad key", { status: 401, statusText: "Unauthorized" })) as typeof fetch

	await assert.rejects(
		() => listGleanModels({ tenantId: "acme", apiKey: "secret" }),
		/status 401.*bad key/,
	)
})
