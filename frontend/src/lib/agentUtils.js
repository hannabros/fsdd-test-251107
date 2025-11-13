export function deriveProgressPercent(value) {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(value * 100)));
}

export function createEmptyPollingState() {
  return {
    runId: null,
    statusUrl: null,
    sendEventPostUri: null,
    status: "Idle",
    message: "",
    progress: 0,
    lastUpdated: null,
    humanFeedback: null,
  };
}
