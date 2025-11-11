// Comprehensive test example using test helpers
import { assertEquals, assertExists } from "jsr:@std/assert@1"
import { handler } from "./index.ts"
import { 
  createMockRequest, 
  parseResponse,
  assertJsonResponse,
  createAuthHeader 
} from "../_shared/test-helpers.ts"

Deno.test("example-with-helpers function", async (t) => {

  await t.step("should create user with valid data", async () => {
    const request = createMockRequest({
      headers: createAuthHeader("fake-jwt-token"),
      body: {
        email: "test@example.com",
        name: "Test User"
      }
    })

    const response = await handler(request)
    
    // Using helper to assert JSON response
    assertJsonResponse(response, 201)
    
    // Using helper to parse response
    const { data } = await parseResponse<{
      id: string
      email: string
      name: string
      createdAt: string
    }>(response)

    // Verify response data
    assertExists(data.id)
    assertEquals(data.email, "test@example.com")
    assertEquals(data.name, "Test User")
    assertExists(data.createdAt)
  })

  await t.step("should return 400 when email is missing", async () => {
    const request = createMockRequest({
      headers: createAuthHeader("fake-jwt-token"),
      body: {
        name: "Test User"
        // email missing
      }
    })

    const response = await handler(request)
    const { data } = await parseResponse<{ error: string; details: string }>(response)

    assertEquals(response.status, 400)
    assertEquals(data.error, "Validation failed")
    assertEquals(data.details, "Email and name are required")
  })

  await t.step("should return 400 when name is missing", async () => {
    const request = createMockRequest({
      headers: createAuthHeader("fake-jwt-token"),
      body: {
        email: "test@example.com"
        // name missing
      }
    })

    const response = await handler(request)
    const { data } = await parseResponse<{ error: string }>(response)

    assertEquals(response.status, 400)
    assertExists(data.error)
  })

  await t.step("should return 400 for invalid email format", async () => {
    const request = createMockRequest({
      headers: createAuthHeader("fake-jwt-token"),
      body: {
        email: "not-an-email",
        name: "Test User"
      }
    })

    const response = await handler(request)
    const { data } = await parseResponse<{ error: string; details: string }>(response)

    assertEquals(response.status, 400)
    assertEquals(data.error, "Validation failed")
    assertEquals(data.details, "Invalid email format")
  })

  await t.step("should return 400 for name too short", async () => {
    const request = createMockRequest({
      headers: createAuthHeader("fake-jwt-token"),
      body: {
        email: "test@example.com",
        name: "A" // Only 1 character
      }
    })

    const response = await handler(request)
    const { data } = await parseResponse<{ error: string; details: string }>(response)

    assertEquals(response.status, 400)
    assertEquals(data.details, "Name must be between 2 and 100 characters")
  })

  await t.step("should return 400 for name too long", async () => {
    const request = createMockRequest({
      headers: createAuthHeader("fake-jwt-token"),
      body: {
        email: "test@example.com",
        name: "A".repeat(101) // 101 characters
      }
    })

    const response = await handler(request)
    assertEquals(response.status, 400)
  })

  await t.step("should return 401 without authorization header", async () => {
    const request = createMockRequest({
      headers: { "Content-Type": "application/json" }, // No auth header
      body: {
        email: "test@example.com",
        name: "Test User"
      }
    })

    const response = await handler(request)
    const { data } = await parseResponse<{ error: string; details: string }>(response)

    assertEquals(response.status, 401)
    assertEquals(data.error, "Unauthorized")
    assertEquals(data.details, "Authorization header required")
  })

  await t.step("should return 405 for GET requests", async () => {
    const request = new Request("http://localhost:8000", {
      method: "GET",
      headers: createAuthHeader("fake-jwt-token"),
    })

    const response = await handler(request)
    const { data } = await parseResponse<{ error: string }>(response)

    assertEquals(response.status, 405)
    assertEquals(data.error, "Method not allowed")
  })

  await t.step("should handle CORS preflight requests", async () => {
    const request = createMockRequest({
      method: "OPTIONS",
      headers: {
        "Origin": "http://localhost:3000",
        "Access-Control-Request-Method": "POST"
      },
      body: ""
    })

    const response = await handler(request)

    assertEquals(response.status, 204)
    assertEquals(response.headers.get("Access-Control-Allow-Origin"), "*")
    assertEquals(response.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS")
    assertExists(response.headers.get("Access-Control-Allow-Headers"))
  })

  await t.step("should return 400 for invalid JSON", async () => {
    const request = new Request("http://localhost:8000", {
      method: "POST",
      headers: {
        ...createAuthHeader("fake-jwt-token"),
      },
      body: "this is not json"
    })

    const response = await handler(request)
    const { data } = await parseResponse<{ error: string; details: string }>(response)

    assertEquals(response.status, 400)
    assertEquals(data.error, "Invalid request")
    assertEquals(data.details, "Could not parse request body as JSON")
  })

  await t.step("should include CORS headers in success response", async () => {
    const request = createMockRequest({
      headers: createAuthHeader("fake-jwt-token"),
      body: {
        email: "test@example.com",
        name: "Test User"
      }
    })

    const response = await handler(request)

    assertEquals(response.headers.get("Access-Control-Allow-Origin"), "*")
  })
})
