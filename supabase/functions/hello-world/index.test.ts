// Deno-native test for hello-world Edge Function
// Run with: deno test --allow-env --allow-net supabase/functions/hello-world/index.test.ts

import { assertEquals, assertExists } from "jsr:@std/assert@1"
import { handler } from "./index.ts"

Deno.test("hello-world function", async (t) => {

  await t.step("should return greeting with provided name", async () => {
    const request = new Request("http://localhost:8000", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Deno" }),
    })

    const response = await handler(request)
    const data = await response.json()

    assertEquals(response.status, 200)
    assertEquals(response.headers.get("Content-Type"), "application/json")
    assertEquals(data.message, "Hello Deno!")
  })

  await t.step("should handle different names", async () => {
    const request = new Request("http://localhost:8000", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "World" }),
    })

    const response = await handler(request)
    const data = await response.json()

    assertEquals(data.message, "Hello World!")
  })

  await t.step("should return valid JSON response", async () => {
    const request = new Request("http://localhost:8000", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test" }),
    })

    const response = await handler(request)
    const data = await response.json()

    assertExists(data.message)
    assertEquals(typeof data.message, "string")
  })

  await t.step("should return 400 when name is missing", async () => {
    const request = new Request("http://localhost:8000", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })

    const response = await handler(request)
    const data = await response.json()

    assertEquals(response.status, 400)
    assertExists(data.error)
    assertEquals(data.error, "Name is required")
  })

  await t.step("should return 400 when JSON is invalid", async () => {
    const request = new Request("http://localhost:8000", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalid json",
    })

    const response = await handler(request)
    const data = await response.json()

    assertEquals(response.status, 400)
    assertExists(data.error)
    assertEquals(data.error, "Invalid JSON body")
  })
})
