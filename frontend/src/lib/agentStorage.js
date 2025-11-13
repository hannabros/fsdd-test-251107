const HISTORY_KEY = "research-agent-history";
const INSTANCE_KEY = "research-agent-instance-id";
const RUN_METADATA_KEY = "research-agent-last-run";

export function loadHistory() {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Failed to load history from localStorage", error);
    return [];
  }
}

export function persistHistory(history) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const prunedHistory = history.map((entry) => {
      const lastUpdateIndex = entry.updates.length - 1;
      const lastUpdate = lastUpdateIndex >= 0 ? entry.updates[lastUpdateIndex] : undefined;
      return {
        ...entry,
        updates: lastUpdate ? [lastUpdate] : [],
      };
    });
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(prunedHistory));
  } catch (error) {
    console.warn("Failed to persist history to localStorage", error);
  }
}

export function persistInstanceId(runId) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(INSTANCE_KEY, runId);
  } catch (error) {
    console.warn("Failed to persist instance id", error);
  }
}

export function persistRunMetadata(metadata) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(RUN_METADATA_KEY, JSON.stringify(metadata));
    if (metadata.runId) {
      persistInstanceId(metadata.runId);
    }
  } catch (error) {
    console.warn("Failed to persist run metadata", error);
  }
}

export function loadRunMetadata() {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(RUN_METADATA_KEY);
    if (!raw) {
      const legacyId = window.localStorage.getItem(INSTANCE_KEY);
      if (!legacyId) {
        return null;
      }
      return { runId: legacyId };
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.runId !== "string" || parsed.runId.length === 0) {
      return null;
    }
    return {
      runId: parsed.runId,
      query: typeof parsed.query === "string" ? parsed.query : undefined,
      reportLength: typeof parsed.reportLength === "string" ? parsed.reportLength : undefined,
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : undefined,
    };
  } catch (error) {
    console.warn("Failed to load run metadata", error);
    return null;
  }
}

export function clearRunMetadata() {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(RUN_METADATA_KEY);
  } catch (error) {
    console.warn("Failed to clear run metadata", error);
  }
}
