import { useCallback, useMemo, useState } from "react";
import type { InferenceConnection } from "@/api/typesGenerated";
import { useInferenceConnections, useInferenceModels, useInferenceSettings } from "./api";
import { chooseAssistantModel } from "./inference";

function storageKey(userId: string, field: string): string {
  const host = typeof window === "undefined" ? "server" : window.location.host;
  return `chronicle.inference.${host}.${userId}.${field}`;
}

function readStored(userId: string, field: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.localStorage.getItem(storageKey(userId, field)) ?? undefined;
}

function writeStored(userId: string, field: string, value: string | undefined) {
  if (typeof window === "undefined") return;
  const key = storageKey(userId, field);
  if (value) window.localStorage.setItem(key, value);
  else window.localStorage.removeItem(key);
}

function chooseConnection(connections: readonly InferenceConnection[], storedId?: string): string | undefined {
  if (storedId && connections.some((connection) => connection.id === storedId)) return storedId;
  if (connections.length === 1) return connections[0].id;
  return [...connections].sort((left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id))[0]?.id;
}

export function useInferenceSelection(userId: string | undefined, enabled = true, assistantId?: string) {
  const settings = useInferenceSettings(enabled && Boolean(userId && assistantId));
  const connectionsQuery = useInferenceConnections({ enabled: enabled && Boolean(userId) });
  const connections = useMemo(
    () => (connectionsQuery.data?.connections ?? []).filter((connection) => connection.status === "active"),
    [connectionsQuery.data],
  );
  const [chosenConnection, setChosenConnection] = useState<{ userId?: string; value?: string }>({});
  const chosenConnectionId = chosenConnection.userId === userId ? chosenConnection.value : undefined;
  const connectionId = chooseConnection(
    connections,
    chosenConnectionId ?? (userId ? readStored(userId, "connection") : undefined),
  );
  const modelsQuery = useInferenceModels(connectionId, { enabled: enabled && Boolean(connectionId) });
  const models = useMemo(() => modelsQuery.data?.models ?? [], [modelsQuery.data]);
  const modelField = assistantId ? `model.${assistantId}` : "model";
  const [chosenModel, setChosenModel] = useState<{ userId?: string; value?: string }>({});
  const chosenModelId = chosenModel.userId === userId ? chosenModel.value : undefined;
  const assistantDefault = settings.data?.assistants.find((assistant) => assistant.id === assistantId)?.default_model;
  const modelId = chooseAssistantModel(
    models,
    chosenModelId ?? (userId ? readStored(userId, modelField) : undefined),
    assistantDefault,
  );
  const setConnectionId = useCallback((value: string | undefined) => {
    setChosenConnection({ userId, value });
    if (userId) writeStored(userId, "connection", value);
  }, [userId]);
  const setModelId = useCallback((value: string | undefined) => {
    setChosenModel({ userId, value });
    if (userId) writeStored(userId, modelField, value);
  }, [userId, modelField]);

  return useMemo(() => ({
    connections,
    models,
    connectionId,
    modelId,
    setConnectionId,
    setModelId,
    isLoading: connectionsQuery.isLoading || (Boolean(connectionId) && modelsQuery.isLoading),
    error: connectionsQuery.error ?? modelsQuery.error,
    ready: Boolean(connectionId && modelId),
  }), [connections, models, connectionId, modelId, setConnectionId, setModelId, connectionsQuery.isLoading, modelsQuery.isLoading, connectionsQuery.error, modelsQuery.error]);
}
