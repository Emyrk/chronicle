/* eslint-disable react-refresh/only-export-components -- This module intentionally keeps the runtime, provider, and hooks together. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ClientToolRequestEvent } from "./protocol";

const MAX_RESULT_BYTES = 64 * 1024;

export interface InferenceCapabilityScope {
  type: string;
  id: string;
}

export interface InferenceCapabilityDescriptor {
  id: string;
  version: number;
  scope_type?: string;
  scope_id?: string;
  state_revision?: number;
}

export interface InferenceClientDescriptor {
  session_id: string;
  capabilities: InferenceCapabilityDescriptor[];
}

export type ClientToolResultStatus =
  | "success"
  | "user_rejected"
  | "capability_unavailable"
  | "stale_state"
  | "client_error";

export interface ClientToolContinuation {
  client_session_id: string;
  capability_id: string;
  capability_version: number;
  scope_type?: string;
  scope_id?: string;
  state_revision?: number;
  status: ClientToolResultStatus;
  result: unknown;
}

export interface InferenceToolContext<TContext = unknown> {
  signal: AbortSignal;
  runId: string;
  threadId: string;
  toolCallId: string;
  context: TContext;
}

export type InferenceToolHandler<TContext = unknown> = (
  argumentsValue: unknown,
  context: InferenceToolContext<TContext>,
) => unknown | Promise<unknown>;

export interface InferenceCapabilityRegistration<TContext = unknown> {
  id: string;
  version: number;
  scope?: InferenceCapabilityScope;
  stateRevision?: number;
  available?: boolean | (() => boolean);
  context?: TContext | (() => TContext);
  tools: Record<string, InferenceToolHandler<TContext>>;
}

interface StoredCapability {
  descriptor: InferenceCapabilityDescriptor;
  isAvailable: () => boolean;
  getContext: () => unknown;
  tools: Record<string, InferenceToolHandler>;
  token: symbol;
}

export interface InferenceRuntimeClient {
  getClientDescriptor: () => InferenceClientDescriptor;
  executeClientTool: (request: ClientToolRequestEvent, signal: AbortSignal) => Promise<ClientToolContinuation>;
}

export interface InferenceRuntimeSnapshot extends InferenceRuntimeClient {
  sessionId: string;
  capabilities: InferenceCapabilityDescriptor[];
  yoloEnabled: boolean;
  setYoloEnabled: (enabled: boolean) => void;
  registerCapability: (registration: InferenceCapabilityRegistration) => () => void;
}

export interface InferenceRuntimeOptions {
  sessionId?: string;
  confirm?: (request: ClientToolRequestEvent, signal: AbortSignal) => Promise<boolean>;
  isYoloEnabled?: () => boolean;
}

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function descriptorFor(registration: InferenceCapabilityRegistration): InferenceCapabilityDescriptor {
  return {
    id: registration.id,
    version: registration.version,
    ...(registration.scope ? {
      scope_type: registration.scope.type,
      scope_id: registration.scope.id,
    } : {}),
    ...(registration.stateRevision !== undefined ? { state_revision: registration.stateRevision } : {}),
  };
}

function boundedValue(value: unknown): { ok: boolean; value: unknown } {
  let normalized: unknown;
  try {
    normalized = JSON.parse(JSON.stringify(value ?? null));
  } catch {
    return { ok: false, value: { message: "The client tool returned a non-serializable result." } };
  }
  const encoded = JSON.stringify(normalized);
  if (new TextEncoder().encode(encoded).byteLength > MAX_RESULT_BYTES) {
    return { ok: false, value: { message: "The client tool result exceeded the allowed size." } };
  }
  return { ok: true, value: normalized };
}

function resultMessage(message: string): { message: string } {
  return { message };
}

export class InferenceRuntime implements InferenceRuntimeClient {
  readonly sessionId: string;
  private readonly capabilities = new Map<string, StoredCapability>();
  private capabilitySnapshot: InferenceCapabilityDescriptor[] = [];
  private readonly listeners = new Set<() => void>();
  private readonly confirm: (request: ClientToolRequestEvent, signal: AbortSignal) => Promise<boolean>;
  private readonly isYoloEnabled: () => boolean;

  constructor(options: InferenceRuntimeOptions = {}) {
    this.sessionId = options.sessionId ?? createId();
    this.confirm = options.confirm ?? (async () => false);
    this.isYoloEnabled = options.isYoloEnabled ?? (() => false);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getCapabilities = (): InferenceCapabilityDescriptor[] => this.capabilitySnapshot;

  getClientDescriptor = (): InferenceClientDescriptor => ({
    session_id: this.sessionId,
    capabilities: this.getCapabilities(),
  });

  registerCapability = (registration: InferenceCapabilityRegistration): (() => void) => {
    if (!registration.id || !registration.version) {
      throw new Error("Inference capabilities require an id and version.");
    }
    if (this.capabilities.has(registration.id)) {
      throw new Error(`Inference capability "${registration.id}" is already registered.`);
    }

    const token = Symbol(registration.id);
    const stored: StoredCapability = {
      descriptor: descriptorFor(registration),
      isAvailable: typeof registration.available === "function"
        ? registration.available
        : () => registration.available !== false,
      getContext: typeof registration.context === "function"
        ? registration.context as () => unknown
        : () => registration.context,
      tools: registration.tools as Record<string, InferenceToolHandler>,
      token,
    };
    this.capabilities.set(registration.id, stored);
    this.emit();

    return () => {
      if (this.capabilities.get(registration.id)?.token === token) {
        this.capabilities.delete(registration.id);
        this.emit();
      }
    };
  };

  executeClientTool = async (
    request: ClientToolRequestEvent,
    signal: AbortSignal,
  ): Promise<ClientToolContinuation> => {
    const capability = this.capabilities.get(request.capability.id);
    // Continuations identify the persisted request, not the capability's latest
    // page state. In particular, a stale_state result must echo the requested
    // revision so the server can accept it and let the model recover.
    const descriptor: InferenceCapabilityDescriptor = {
      id: request.capability.id,
      version: request.capability.version,
      ...(request.capability.scopeType ? { scope_type: request.capability.scopeType } : {}),
      ...(request.capability.scopeId ? { scope_id: request.capability.scopeId } : {}),
      ...(request.capability.stateRevision !== undefined ? { state_revision: request.capability.stateRevision } : {}),
    };
    const continuation = (status: ClientToolResultStatus, result: unknown): ClientToolContinuation => {
      const normalized = boundedValue(result);
      return {
        client_session_id: this.sessionId,
        capability_id: descriptor.id,
        capability_version: descriptor.version,
        ...(descriptor.scope_type ? { scope_type: descriptor.scope_type } : {}),
        ...(descriptor.scope_id ? { scope_id: descriptor.scope_id } : {}),
        ...(descriptor.state_revision !== undefined ? { state_revision: descriptor.state_revision } : {}),
        status: status === "success" && !normalized.ok ? "client_error" : status,
        result: normalized.value,
      };
    };

    if (signal.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    if (request.clientSessionId && request.clientSessionId !== this.sessionId) {
      return continuation("capability_unavailable", resultMessage("The client session is no longer available."));
    }
    if (!capability || capability.descriptor.version !== request.capability.version) {
      return continuation("capability_unavailable", resultMessage("The requested capability is unavailable."));
    }
    if (
      request.capability.scopeType !== capability.descriptor.scope_type ||
      request.capability.scopeId !== capability.descriptor.scope_id
    ) {
      return continuation("capability_unavailable", resultMessage("The requested capability scope is unavailable."));
    }
    if (request.capability.stateRevision !== capability.descriptor.state_revision) {
      return continuation("stale_state", resultMessage("The page state changed before the tool could run."));
    }
    if (!capability.isAvailable()) {
      return continuation("capability_unavailable", resultMessage("The requested capability is not currently available."));
    }
    const handler = capability.tools[request.toolName];
    if (!handler) {
      return continuation("capability_unavailable", resultMessage("The requested client tool is unavailable."));
    }

    const argumentsValue = request.arguments;

    if (
      request.effect === "view_mutation" &&
      request.confirmation === "unless_yolo" &&
      !this.isYoloEnabled()
    ) {
      const approved = await new Promise<boolean>((resolve, reject) => {
        const handleAbort = () => reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
        if (signal.aborted) {
          handleAbort();
          return;
        }
        signal.addEventListener("abort", handleAbort, { once: true });
        this.confirm(request, signal).then(resolve, reject).finally(() => {
          signal.removeEventListener("abort", handleAbort);
        });
      });
      if (signal.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
      if (!approved) {
        return continuation("user_rejected", resultMessage("The user declined the requested change."));
      }
    }

    if (this.capabilities.get(request.capability.id)?.token !== capability.token || !capability.isAvailable()) {
      return continuation("capability_unavailable", resultMessage("The requested capability is no longer available."));
    }

    try {
      const result = await handler(argumentsValue, {
        signal,
        runId: request.runId,
        threadId: request.threadId,
        toolCallId: request.toolCallId,
        context: capability.getContext(),
      });
      if (signal.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
      if (this.capabilities.get(request.capability.id)?.token !== capability.token || !capability.isAvailable()) {
        return continuation("capability_unavailable", resultMessage("The requested capability is no longer available."));
      }
      return continuation("success", result);
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
      if (error instanceof Error && error.message === "stale_state") {
        return continuation("stale_state", resultMessage("The page state changed before the tool could run."));
      }
      if (error instanceof Error && error.message === "capability_unavailable") {
        return continuation("capability_unavailable", resultMessage("The requested capability is not currently available."));
      }
      return continuation("client_error", resultMessage("The client tool could not be completed."));
    }
  };

  private emit(): void {
    this.capabilitySnapshot = [...this.capabilities.values()].map((capability) => capability.descriptor);
    for (const listener of this.listeners) listener();
  }
}

interface ConfirmationRequest {
  request: ClientToolRequestEvent;
  resolve: (approved: boolean) => void;
}

const InferenceRuntimeContext = createContext<InferenceRuntimeSnapshot | null>(null);

export function InferenceRuntimeProvider({ children }: { children: ReactNode }) {
  const [yoloEnabled, setYoloEnabled] = useState(false);
  const yoloRef = useRef(false);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const confirmationRef = useRef<ConfirmationRequest | null>(null);
  const confirmationQueue = useRef<ConfirmationRequest[]>([]);
  confirmationRef.current = confirmation;

  const showNextConfirmation = useCallback(() => {
    setConfirmation((current) => current ?? confirmationQueue.current.shift() ?? null);
  }, []);
  const confirm = useCallback((request: ClientToolRequestEvent, signal: AbortSignal) => new Promise<boolean>((resolve) => {
    let settled = false;
    const item: ConfirmationRequest = {
      request,
      resolve: (approved) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", handleAbort);
        resolve(approved);
      },
    };
    const handleAbort = () => {
      const current = confirmationRef.current;
      if (current === item) {
        item.resolve(false);
        setConfirmation(null);
        queueMicrotask(showNextConfirmation);
        return;
      }
      confirmationQueue.current = confirmationQueue.current.filter((queued) => queued !== item);
      item.resolve(false);
    };
    if (signal.aborted) {
      handleAbort();
      return;
    }
    signal.addEventListener("abort", handleAbort, { once: true });
    confirmationQueue.current.push(item);
    showNextConfirmation();
  }), [showNextConfirmation]);
  const runtimeRef = useRef<InferenceRuntime | null>(null);
  runtimeRef.current ??= new InferenceRuntime({ confirm, isYoloEnabled: () => yoloRef.current });
  const runtime = runtimeRef.current;
  const capabilities = useSyncExternalStore(runtime.subscribe, runtime.getCapabilities, runtime.getCapabilities);

  useEffect(() => () => {
    confirmationRef.current?.resolve(false);
    for (const queued of confirmationQueue.current) queued.resolve(false);
    confirmationQueue.current = [];
  }, []);

  const updateYolo = useCallback((enabled: boolean) => {
    yoloRef.current = enabled;
    setYoloEnabled(enabled);
  }, []);
  const resolveConfirmation = (approved: boolean) => {
    confirmation?.resolve(approved);
    setConfirmation(null);
    queueMicrotask(showNextConfirmation);
  };

  const value = useMemo<InferenceRuntimeSnapshot>(() => ({
    sessionId: runtime.sessionId,
    capabilities,
    yoloEnabled,
    setYoloEnabled: updateYolo,
    registerCapability: runtime.registerCapability,
    getClientDescriptor: runtime.getClientDescriptor,
    executeClientTool: runtime.executeClientTool,
  }), [capabilities, runtime, updateYolo, yoloEnabled]);

  return (
    <InferenceRuntimeContext.Provider value={value}>
      {children}
      <Dialog open={Boolean(confirmation)} onOpenChange={(open) => !open && resolveConfirmation(false)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Allow assistant action?</DialogTitle>
            <DialogDescription>
              The assistant wants to run <strong>{confirmation?.request.toolName}</strong>, which will change the current view.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => resolveConfirmation(false)}>Reject</Button>
            <Button onClick={() => resolveConfirmation(true)}>Allow</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </InferenceRuntimeContext.Provider>
  );
}

export function useOptionalInferenceRuntime(): InferenceRuntimeSnapshot | null {
  return useContext(InferenceRuntimeContext);
}

export function useInferenceRuntime(): InferenceRuntimeSnapshot {
  const runtime = useContext(InferenceRuntimeContext);
  if (!runtime) throw new Error("useInferenceRuntime must be used within InferenceRuntimeProvider.");
  return runtime;
}

export function useInferenceCapability<TContext>(registration: InferenceCapabilityRegistration<TContext>): void {
  const { registerCapability } = useInferenceRuntime();
  const registrationRef = useRef(registration);
  const id = registration.id;
  const version = registration.version;
  const scopeType = registration.scope?.type;
  const scopeId = registration.scope?.id;
  const stateRevision = registration.stateRevision;

  useEffect(() => {
    registrationRef.current = registration;
  });

  useEffect(() => registerCapability({
    id,
    version,
    scope: scopeType && scopeId ? { type: scopeType, id: scopeId } : undefined,
    stateRevision,
    available: () => {
      const available = registrationRef.current.available;
      return typeof available === "function" ? available() : available !== false;
    },
    context: () => {
      const context = registrationRef.current.context;
      return typeof context === "function" ? (context as () => unknown)() : context;
    },
    tools: new Proxy({}, {
      get: (_target, property) => {
        if (typeof property !== "string") return undefined;
        const handler = registrationRef.current.tools[property] as InferenceToolHandler | undefined;
        return handler
          ? (...args: Parameters<InferenceToolHandler>) => handler(...args)
          : undefined;
      },
      has: (_target, property) => typeof property === "string" && property in registrationRef.current.tools,
      ownKeys: () => Reflect.ownKeys(registrationRef.current.tools),
      getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    }) as Record<string, InferenceToolHandler>,
  }), [id, registerCapability, scopeId, scopeType, stateRevision, version]);
}
