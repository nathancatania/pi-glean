import assert from "node:assert/strict"
import { test } from "node:test"
import type { StreamOptions } from "@earendil-works/pi-ai/compat"
import { withGleanAnthropicAuth } from "../src/glean-anthropic.ts"

test("withGleanAnthropicAuth sends bearer auth and removes x-api-key", () => {
	const input: StreamOptions = { apiKey: "secret", headers: { "x-custom": "1" } }
	const options = withGleanAnthropicAuth(input)
	assert.equal(options.headers?.Authorization, "Bearer secret")
	assert.equal(options.headers?.["x-api-key"], null)
	assert.equal(options.headers?.["anthropic-version"], "2023-06-01")
	assert.equal(options.headers?.["x-custom"], "1")
})

test("withGleanAnthropicAuth omits bearer auth without an API key", () => {
	const input: StreamOptions = {}
	const options = withGleanAnthropicAuth(input)
	assert.equal(options.headers?.Authorization, undefined)
	assert.equal(options.headers?.["x-api-key"], null)
})

test("withGleanAnthropicAuth handles undefined options", () => {
	const options = withGleanAnthropicAuth(undefined)
	assert.equal(options.headers?.["x-api-key"], null)
	assert.equal(options.headers?.["anthropic-version"], "2023-06-01")
})
