import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card/Card"
import { Button } from "@/components/ui/button"
import { formatBytes } from "@/lib/format"
import { decodePayload, decodeAllPayloads, decodeDelimitedMessages, decompressGzip, isGzipped, FastDamageCursor, parseAllHeaders, type PayloadHeader, type DecodedPayload } from "@/api/protodecode/decode"
import { DamageSchema, type Damage, ExtraAttackSchema, type ExtraAttack, HealSchema, type Heal, ResourceChangeSchema, type ResourceChange, SlainSchema, type Slain, School } from "@/api/proto/chronicle_pb"
import type { GenMessage } from "@bufbuild/protobuf/codegenv1"
import type { Message } from "@bufbuild/protobuf"

type DecodeMode = "payload" | "messages"
type EventType = "damage" | "extra_attack" | "heal" | "resource_change" | "slain"

// Map event types to their schemas
const eventSchemas: Record<EventType, GenMessage<Message>> = {
  damage: DamageSchema,
  extra_attack: ExtraAttackSchema,
  heal: HealSchema,
  resource_change: ResourceChangeSchema,
  slain: SlainSchema,
}

// Union type for all message types
type AnyEventMessage = Damage | ExtraAttack | Heal | ResourceChange | Slain

interface BenchmarkResult {
  name: string;
  events: number;
  totalMs: number;
  eventsPerSec: number;
  details?: string;
}

export function ProtoDecode() {
  const [input, setInput] = useState("")
  const [instanceId, setInstanceId] = useState("")
  const [mode, setMode] = useState<DecodeMode>("payload")
  const [eventType, setEventType] = useState<EventType>("damage")
  const [allPayloads, setAllPayloads] = useState<DecodedPayload<AnyEventMessage>[]>([])
  const [, setHeader] = useState<PayloadHeader | null>(null)
  const [messages, setMessages] = useState<AnyEventMessage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [benchmarkResults, setBenchmarkResults] = useState<BenchmarkResult[]>([])
  const [benchmarking, setBenchmarking] = useState(false)
  const [encounterSummary, setEncounterSummary] = useState<{
    headers: PayloadHeader[];
    compressedSize: number;
    decompressedSize: number;
  } | null>(null)

  const handleFetch = async () => {
    if (!instanceId.trim()) {
      setError("Please enter an instance ID")
      return
    }

    setError(null)
    setHeader(null)
    setMessages([])
    setAllPayloads([])
    setLoading(true)

    try {
      const schema = eventSchemas[eventType]
      const url = `/api/v1/raidlogs/instances/${instanceId.trim()}/events/${eventType}`
      const response = await fetch(url)
      
      if (!response.ok) {
        const text = await response.text()
        throw new Error(`HTTP ${response.status}: ${text || response.statusText}`)
      }

      const contentType = response.headers.get("content-type") || ""
      
      if (contentType.includes("application/json")) {
        const json = await response.json()
        throw new Error(`Server error: ${JSON.stringify(json)}`)
      }

      const buffer = await response.arrayBuffer()
      let data = new Uint8Array(buffer)

      if (isGzipped(data)) {
        data = await decompressGzip(data)
      }

      if (mode === "payload") {
        // Decode ALL encounters
        const payloads = decodeAllPayloads(schema, data)
        setAllPayloads(payloads as DecodedPayload<AnyEventMessage>[])
        // Also set first encounter for backward compat
        if (payloads.length > 0) {
          setHeader(payloads[0].header)
          // Flatten all messages for display
          const allMsgs = payloads.flatMap(p => p.messages)
          setMessages(allMsgs as AnyEventMessage[])
        }
      } else {
        const msgs = decodeDelimitedMessages(schema, data)
        setMessages(msgs as AnyEventMessage[])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleDecode = async () => {
    setError(null)
    setHeader(null)
    setMessages([])

    try {
      const schema = eventSchemas[eventType]
      let data = parseInput(input.trim())

      if (isGzipped(data)) {
        data = await decompressGzip(data)
      }

      if (mode === "payload") {
        const result = decodePayload(schema, data)
        setHeader(result.header)
        setMessages(result.messages as AnyEventMessage[])
      } else {
        const msgs = decodeDelimitedMessages(schema, data)
        setMessages(msgs as AnyEventMessage[])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleClear = () => {
    setInput("")
    setInstanceId("")
    setHeader(null)
    setMessages([])
    setError(null)
    setBenchmarkResults([])
    setEncounterSummary(null)
  }

  const handleBenchmark = async () => {
    if (!instanceId.trim()) {
      setError("Please enter an instance ID to benchmark")
      return
    }

    setBenchmarking(true)
    setBenchmarkResults([])
    setError(null)

    try {
      // Fetch raw data
      const url = `/api/v1/raidlogs/instances/${instanceId.trim()}/events/damage`
      const response = await fetch(url)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const buffer = await response.arrayBuffer()
      const compressedData = new Uint8Array(buffer)
      const compressedSize = compressedData.length
      
      // Decompress for TypeScript benchmark
      let data = compressedData
      if (isGzipped(data)) {
        data = await decompressGzip(data)
      }
      const decompressedSize = data.length

      // Parse encounter headers for summary
      const headers = parseAllHeaders(data)
      setEncounterSummary({ headers, compressedSize, decompressedSize })

      const results: BenchmarkResult[] = []
      const iterations = 3

      // Benchmark 0: TypeScript with aggregation (simulates real usage)
      {
        const times: number[] = []
        let eventCount = 0
        for (let i = 0; i < iterations; i++) {
          const start = performance.now()
          const cursor = new FastDamageCursor(data)
          const aggregated = new Map<string, number>()
          let count = 0
          while (cursor.currentHeader) {
            while (cursor.hasMoreInEncounter) {
              const msg = cursor.next()
              if (msg) {
                count++
                const key = msg.caster || "Unknown"
                aggregated.set(key, (aggregated.get(key) || 0) + msg.amount)
              }
            }
            cursor.nextEncounter()
          }
          times.push(performance.now() - start)
          eventCount = count
        }
        const avgTime = times.reduce((a, b) => a + b, 0) / times.length
        results.push({
          name: "TypeScript + Aggregation",
          events: eventCount,
          totalMs: avgTime,
          eventsPerSec: Math.round(eventCount / (avgTime / 1000)),
          details: `${iterations} runs: ${times.map(t => t.toFixed(1)).join(", ")}ms`
        })
      }

      // Benchmark 1: TypeScript FastDamageCursor
      {
        const times: number[] = []
        let eventCount = 0
        for (let i = 0; i < iterations; i++) {
          const start = performance.now()
          const cursor = new FastDamageCursor(data)
          let count = 0
          while (cursor.currentHeader) {
            while (cursor.hasMoreInEncounter) {
              const msg = cursor.next()
              if (msg) count++
            }
            cursor.nextEncounter()
          }
          times.push(performance.now() - start)
          eventCount = count
        }
        const avgTime = times.reduce((a, b) => a + b, 0) / times.length
        results.push({
          name: "TypeScript (FastDamageCursor)",
          events: eventCount,
          totalMs: avgTime,
          eventsPerSec: Math.round(eventCount / (avgTime / 1000)),
          details: `${iterations} runs: ${times.map(t => t.toFixed(1)).join(", ")}ms`
        })
      }

      setBenchmarkResults(results)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBenchmarking(false)
    }
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <h1 className="text-3xl font-bold mb-6">Protobuf Decoder</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="text-sm font-medium mb-2">Event Type</div>
            <div className="flex gap-4 items-center">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="eventType"
                  checked={eventType === "damage"}
                  onChange={() => setEventType("damage")}
                  className="accent-primary"
                />
                <span>Damage</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="eventType"
                  checked={eventType === "heal"}
                  onChange={() => setEventType("heal")}
                  className="accent-primary"
                />
                <span>Heal</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="eventType"
                  checked={eventType === "resource_change"}
                  onChange={() => setEventType("resource_change")}
                  className="accent-primary"
                />
                <span>Resource Change</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="eventType"
                  checked={eventType === "extra_attack"}
                  onChange={() => setEventType("extra_attack")}
                  className="accent-primary"
                />
                <span>Extra Attack</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="eventType"
                  checked={eventType === "slain"}
                  onChange={() => setEventType("slain")}
                  className="accent-primary"
                />
                <span>Slain</span>
              </label>
            </div>
          </div>
          <div>
            <div className="text-sm font-medium mb-2">Decode Mode</div>
            <div className="flex gap-4 items-center">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "payload"}
                  onChange={() => setMode("payload")}
                  className="accent-primary"
                />
                <span>Full Payload (with header)</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "messages"}
                  onChange={() => setMode("messages")}
                  className="accent-primary"
                />
                <span>Messages Only (no header)</span>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Fetch from API</CardTitle>
          <CardDescription>
            Load events directly from the API by instance ID
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={instanceId}
              onChange={(e) => setInstanceId(e.target.value)}
              placeholder="Instance UUID (e.g., a1da6acf-a103-4aca-9176-d46e4deabb69)"
              className="flex-1 p-2 font-mono text-sm bg-background border rounded-md"
            />
            <Button onClick={handleFetch} disabled={loading || benchmarking}>
              {loading ? "Loading..." : "Fetch"}
            </Button>
            <Button 
              onClick={handleBenchmark} 
              disabled={loading || benchmarking}
              variant="secondary"
            >
              {benchmarking ? "Benchmarking..." : "Benchmark"}
            </Button>
          </div>
          
          {/* Benchmark Results */}
          {benchmarkResults.length > 0 && (
            <div className="mt-4 p-4 bg-muted rounded-md">
              <h4 className="font-semibold mb-2">Benchmark Results</h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1">Decoder</th>
                    <th className="text-right py-1">Events</th>
                    <th className="text-right py-1">Time (ms)</th>
                    <th className="text-right py-1">Events/sec</th>
                  </tr>
                </thead>
                <tbody>
                  {benchmarkResults.map((result, i) => (
                    <tr key={i} className="border-b border-muted-foreground/20">
                      <td className="py-1">{result.name}</td>
                      <td className="text-right py-1">{result.events.toLocaleString()}</td>
                      <td className="text-right py-1">{result.totalMs.toFixed(2)}</td>
                      <td className="text-right py-1">{result.eventsPerSec.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2 text-xs text-muted-foreground">
                {benchmarkResults.map((r, i) => (
                  <div key={i}>{r.name}: {r.details}</div>
                ))}
              </div>
            </div>
          )}
          
          {/* Encounter Summary */}
          {encounterSummary && (
            <div className="mt-4 p-4 bg-muted rounded-md">
              <h4 className="font-semibold mb-2">Data Summary</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Compressed</div>
                  <div className="font-mono">{formatBytes(encounterSummary.compressedSize)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Decompressed</div>
                  <div className="font-mono">{formatBytes(encounterSummary.decompressedSize)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Compression Ratio</div>
                  <div className="font-mono">{(encounterSummary.decompressedSize / encounterSummary.compressedSize).toFixed(2)}x</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Encounters</div>
                  <div className="font-mono">{encounterSummary.headers.length}</div>
                </div>
              </div>
              
              <h4 className="font-semibold mb-2">Encounters ({encounterSummary.headers.reduce((sum, h) => sum + h.count, 0).toLocaleString()} total events)</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-1 pr-4">#</th>
                      <th className="text-left py-1 pr-4">Encounter ID</th>
                      <th className="text-left py-1 pr-4">Timestamp</th>
                      <th className="text-right py-1 pr-4">Events</th>
                      <th className="text-right py-1 pr-4">Data Size</th>
                      <th className="text-right py-1">Avg/Event</th>
                    </tr>
                  </thead>
                  <tbody>
                    {encounterSummary.headers.map((header, i) => (
                      <tr key={i} className="border-b border-muted-foreground/20">
                        <td className="py-1 pr-4 text-muted-foreground">{i + 1}</td>
                        <td className="py-1 pr-4 font-mono text-xs">{header.encounterID.slice(0, 8)}...</td>
                        <td className="py-1 pr-4 text-xs">{header.firstTimestamp.toLocaleTimeString()}</td>
                        <td className="text-right py-1 pr-4">{header.count.toLocaleString()}</td>
                        <td className="text-right py-1 pr-4 font-mono">{formatBytes(header.dataLength)}</td>
                        <td className="text-right py-1 font-mono">{(header.dataLength / header.count).toFixed(1)}B</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold">
                      <td className="py-1 pr-4"></td>
                      <td className="py-1 pr-4">Total</td>
                      <td className="py-1 pr-4"></td>
                      <td className="text-right py-1 pr-4">{encounterSummary.headers.reduce((sum, h) => sum + h.count, 0).toLocaleString()}</td>
                      <td className="text-right py-1 pr-4 font-mono">{formatBytes(encounterSummary.headers.reduce((sum, h) => sum + h.dataLength, 0))}</td>
                      <td className="text-right py-1 font-mono">
                        {(encounterSummary.headers.reduce((sum, h) => sum + h.dataLength, 0) / encounterSummary.headers.reduce((sum, h) => sum + h.count, 0)).toFixed(1)}B
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Manual Input</CardTitle>
          <CardDescription>
            Or paste base64 or hex-encoded protobuf data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste base64 or hex data here..."
            className="w-full h-40 p-3 font-mono text-sm bg-background border rounded-md resize-y"
          />

          <div className="flex gap-2">
            <Button onClick={handleDecode}>Decode</Button>
            <Button variant="outline" onClick={handleClear}>Clear</Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="mb-6 border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm text-destructive whitespace-pre-wrap">{error}</pre>
          </CardContent>
        </Card>
      )}

      {allPayloads.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Encounters ({allPayloads.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">#</th>
                    <th className="text-left p-2">Encounter ID</th>
                    <th className="text-left p-2">Timestamp</th>
                    <th className="text-right p-2">Count</th>
                    <th className="text-right p-2">Data Size</th>
                  </tr>
                </thead>
                <tbody>
                  {allPayloads.map((payload, i) => (
                    <tr key={i} className="border-b hover:bg-muted/50">
                      <td className="p-2 text-muted-foreground">{i}</td>
                      <td className="p-2 font-mono text-xs">{payload.header.encounterID}</td>
                      <td className="p-2">{isNaN(payload.header.firstTimestamp.getTime()) ? "-" : payload.header.firstTimestamp.toISOString()}</td>
                      <td className="p-2 text-right">{payload.header.count}</td>
                      <td className="p-2 text-right">{payload.header.dataLength.toLocaleString()} B</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 text-sm text-muted-foreground">
              Total messages: {allPayloads.reduce((sum, p) => sum + p.header.count, 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      )}

      {messages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Messages ({messages.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              {eventType === "damage" && (
                <DamageTable messages={messages as Damage[]} />
              )}
              {eventType === "heal" && (
                <HealingTable messages={messages as Heal[]} />
              )}
              {eventType === "resource_change" && (
                <ResourceChangeTable messages={messages as ResourceChange[]} />
              )}
              {eventType === "extra_attack" && (
                <ExtraAttackTable messages={messages as ExtraAttack[]} />
              )}
              {eventType === "slain" && (
                <SlainTable messages={messages as Slain[]} />
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// Table component for Damage events
function DamageTable({ messages }: { messages: Damage[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b">
          <th className="text-left p-2">#</th>
          <th className="text-left p-2">Index</th>
          <th className="text-left p-2">Offset (ms)</th>
          <th className="text-left p-2">Caster</th>
          <th className="text-left p-2">Source</th>
          <th className="text-left p-2">Target</th>
          <th className="text-right p-2">Amount</th>
          <th className="text-left p-2">School</th>
          <th className="text-left p-2">Hit Type</th>
        </tr>
      </thead>
      <tbody>
        {messages.map((msg, i) => (
          <tr key={i} className="border-b hover:bg-muted/50">
            <td className="p-2 text-muted-foreground">{i}</td>
            <td className="p-2">{msg.meta?.index ?? "-"}</td>
            <td className="p-2">{msg.meta?.offsetMilli?.toString() ?? "-"}</td>
            <td className="p-2">{msg.caster ?? "-"}</td>
            <td className="p-2">{msg.sourceName}</td>
            <td className="p-2">{msg.target}</td>
            <td className="p-2 text-right">{msg.amount}</td>
            <td className="p-2">{schoolName(msg.school)}</td>
            <td className="p-2">{msg.hitType}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// Table component for Healing events
function HealingTable({ messages }: { messages: Heal[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b">
          <th className="text-left p-2">#</th>
          <th className="text-left p-2">Index</th>
          <th className="text-left p-2">Offset (ms)</th>
          <th className="text-left p-2">Caster</th>
          <th className="text-left p-2">Source</th>
          <th className="text-left p-2">Target</th>
          <th className="text-right p-2">Amount</th>
          <th className="text-left p-2">Hit Type</th>
        </tr>
      </thead>
      <tbody>
        {messages.map((msg, i) => (
          <tr key={i} className="border-b hover:bg-muted/50">
            <td className="p-2 text-muted-foreground">{i}</td>
            <td className="p-2">{msg.meta?.index ?? "-"}</td>
            <td className="p-2">{msg.meta?.offsetMilli?.toString() ?? "-"}</td>
            <td className="p-2">{msg.caster ?? "-"}</td>
            <td className="p-2">{msg.sourceName ?? "-"}</td>
            <td className="p-2">{msg.target ?? "-"}</td>
            <td className="p-2 text-right">{msg.amount ?? 0}</td>
            <td className="p-2">{msg.hitType ?? "-"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// Table component for ResourceChange events
function ResourceChangeTable({ messages }: { messages: ResourceChange[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b">
          <th className="text-left p-2">#</th>
          <th className="text-left p-2">Index</th>
          <th className="text-left p-2">Offset (ms)</th>
          <th className="text-left p-2">Caster</th>
          <th className="text-left p-2">Source</th>
          <th className="text-left p-2">Target</th>
          <th className="text-right p-2">Amount</th>
          <th className="text-left p-2">Resource</th>
          <th className="text-left p-2">Direction</th>
        </tr>
      </thead>
      <tbody>
        {messages.map((msg, i) => (
          <tr key={i} className="border-b hover:bg-muted/50">
            <td className="p-2 text-muted-foreground">{i}</td>
            <td className="p-2">{msg.meta?.index ?? "-"}</td>
            <td className="p-2">{msg.meta?.offsetMilli?.toString() ?? "-"}</td>
            <td className="p-2">{msg.caster ?? "-"}</td>
            <td className="p-2">{msg.sourceName ?? "-"}</td>
            <td className="p-2">{msg.target ?? "-"}</td>
            <td className="p-2 text-right">{msg.amount ?? 0}</td>
            <td className="p-2">{msg.resourceType ?? "-"}</td>
            <td className="p-2">{msg.direction ?? "-"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// Table component for ExtraAttack events
function ExtraAttackTable({ messages }: { messages: ExtraAttack[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b">
          <th className="text-left p-2">#</th>
          <th className="text-left p-2">Index</th>
          <th className="text-left p-2">Offset (ms)</th>
          <th className="text-left p-2">Target</th>
          <th className="text-left p-2">Amount</th>
          <th className="text-left p-2">Source</th>
        </tr>
      </thead>
      <tbody>
        {messages.map((msg, i) => (
          <tr key={i} className="border-b hover:bg-muted/50">
            <td className="p-2 text-muted-foreground">{i}</td>
            <td className="p-2">{msg.meta?.index ?? "-"}</td>
            <td className="p-2">{msg.meta?.offsetMilli?.toString() ?? "-"}</td>
            <td className="p-2">{msg.target ?? "-"}</td>
            <td className="p-2">{msg.amount ?? "-"}</td>
            <td className="p-2">{msg.sourceName ?? "-"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function SlainTable({ messages }: { messages: Slain[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b">
          <th className="text-left p-2">#</th>
          <th className="text-left p-2">Index</th>
          <th className="text-left p-2">Offset (ms)</th>
          <th className="text-left p-2">Victim</th>
          <th className="text-left p-2">Killer</th>
        </tr>
      </thead>
      <tbody>
        {messages.map((msg, i) => (
          <tr key={i} className="border-b hover:bg-muted/50">
            <td className="p-2 text-muted-foreground">{i}</td>
            <td className="p-2">{msg.meta?.index ?? "-"}</td>
            <td className="p-2">{msg.meta?.offsetMilli?.toString() ?? "-"}</td>
            <td className="p-2">{msg.target ?? "-"}</td>
            <td className="p-2">{msg.caster ?? "-"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function parseInput(input: string): Uint8Array {
  if (/^[A-Za-z0-9+/=]+$/.test(input)) {
    try {
      const binary = atob(input)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      return bytes
    } catch {
      // Fall through to hex
    }
  }

  const hexClean = input.replace(/^0x/i, "").replace(/\s/g, "")
  if (/^[A-Fa-f0-9]+$/.test(hexClean) && hexClean.length % 2 === 0) {
    const bytes = new Uint8Array(hexClean.length / 2)
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hexClean.substr(i * 2, 2), 16)
    }
    return bytes
  }

  throw new Error("Invalid input: expected base64 or hex-encoded data")
}

function schoolName(school: School): string {
  switch (school) {
    case School.Unknown: return "Unknown"
    case School.None: return "None"
    case School.Physical: return "Physical"
    case School.Holy: return "Holy"
    case School.Fire: return "Fire"
    case School.Nature: return "Nature"
    case School.Frost: return "Frost"
    case School.Shadow: return "Shadow"
    case School.Arcane: return "Arcane"
    default: return `${school}`
  }
}
