import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import WorkspaceHeader from "./components/WorkspaceHeader.jsx";
import ProjectsModal from "./components/ProjectsModal.jsx";
import AgentRunPanel from "./components/AgentRunPanel.jsx";
import ResultHistory from "./components/ResultHistory.jsx";
import ReportPreview from "./components/ReportPreview.jsx";
import { api } from "./lib/api.js";
import {
  clearRunMetadata,
  loadHistory,
  loadRunMetadata,
  persistHistory,
  persistRunMetadata,
} from "./lib/agentStorage.js";
import { createEmptyPollingState, deriveProgressPercent } from "./lib/agentUtils.js";

const FALLBACK_NAME = "Untitled Project";
const POLL_INTERVAL_MS = 3000;
function orderProjects(list, preferredId) {
  const copy = Array.isArray(list) ? [...list] : [];
  if (!preferredId) {
    return copy;
  }
  const index = copy.findIndex((project) => project.project_id === preferredId);
  if (index <= 0) {
    return copy;
  }
  const [preferred] = copy.splice(index, 1);
  return [preferred, ...copy];
}

export default function App() {
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState("");
  const [isPolling, setIsPolling] = useState(false);
  const pollRef = useRef(null);
  const layoutRef = useRef(null);
  const [columnWidths, setColumnWidths] = useState([26, 32, 42]);
  const [dragState, setDragState] = useState(null);
  const [history, setHistory] = useState(() => loadHistory());
  const [pollingState, setPollingState] = useState(() => createEmptyPollingState());
  const [agentError, setAgentError] = useState(null);
  const [selectedOutput, setSelectedOutput] = useState("");

  useEffect(() => {
    bootstrap();
  }, []);

  async function bootstrap(targetProjectId) {
    setIsLoading(true);
    setError("");

    try {
      let projectList = await api.listProjects();
      let preferredId = targetProjectId;
      if (projectList.length === 0) {
        const created = await api.createProject({ project_name: FALLBACK_NAME });
        preferredId = created.project_id;
        projectList = await api.listProjects();
      }
      const nextProjectId = preferredId ?? projectList[0]?.project_id;
      setProjects(orderProjects(projectList, nextProjectId));
      if (nextProjectId) {
        await focusProject(nextProjectId);
      } else {
        setActiveProject(null);
        setActiveProjectId(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  const focusProject = useCallback(async (projectId) => {
    if (!projectId) return;
    try {
      const project = await api.getProject(projectId);
      setActiveProject(project);
      setActiveProjectId(project.project_id);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  async function handleProjectRename(name) {
    if (!activeProject) return;
    const trimmed = name.trim() || FALLBACK_NAME;
    if (trimmed === activeProject.project_name) {
      return;
    }

    try {
      setIsMutating(true);
      await api.updateProjectName(activeProject.project_id, trimmed);
      await bootstrap(activeProject.project_id);
    } catch (err) {
      setError(err.message);
      await focusProject(activeProject.project_id);
    } finally {
      setIsMutating(false);
    }
  }

  async function handleCreateProject(name) {
    setError("");
    try {
      setIsMutating(true);
      const project = await api.createProject({ project_name: name || FALLBACK_NAME });
      await bootstrap(project.project_id);
      setModalOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsMutating(false);
    }
  }

  async function handleSelectProject(projectId) {
    await focusProject(projectId);
    setProjects((prev) => orderProjects(prev, projectId));
    setModalOpen(false);
  }

  async function handleDeleteProject(projectId) {
    setError("");
    try {
      setIsMutating(true);
      await api.deleteProject(projectId);
      const remainingAfterDelete = projects.filter((project) => project.project_id !== projectId);
      const fallbackId = remainingAfterDelete[0]?.project_id;
      await bootstrap(fallbackId);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsMutating(false);
    }
  }

  async function handleFileUpload(selectedFiles) {
    if (!activeProject || !selectedFiles?.length) return;
    setError("");

    try {
      setIsMutating(true);
      for (const file of selectedFiles) {
        await api.uploadFile(activeProject.project_id, file);
      }
      await focusProject(activeProject.project_id);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsMutating(false);
    }
  }

  async function handleFileDelete(fileId) {
    if (!activeProject) return;
    setError("");

    try {
      setIsMutating(true);
      await api.deleteFile(fileId);
      await focusProject(activeProject.project_id);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsMutating(false);
    }
  }

  const files = activeProject?.files ?? [];

  useEffect(() => {
    if (!activeProjectId) {
      return;
    }
    setProjects((prev) => orderProjects(prev, activeProjectId));
  }, [activeProjectId]);

  useEffect(() => {
    if (!activeProject) {
      setIsPolling(false);
      return;
    }
    const hasInFlight = (activeProject.files ?? []).some((file) =>
      ["PENDING", "PROCESSING"].includes(file.status?.toUpperCase()),
    );
    setIsPolling(hasInFlight);
  }, [activeProject]);

  useEffect(() => {
    if (!isPolling || !activeProject?.project_id) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    pollRef.current = setInterval(() => {
      focusProject(activeProject.project_id);
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isPolling, activeProject?.project_id, focusProject]);

  useEffect(() => {
    persistHistory(history);
  }, [history]);

  const startPolling = useCallback((startResponse, submittedQuery, reportLength) => {
    const runId = startResponse.run_id ?? startResponse.id;
    const timestamp = startResponse.created_at ?? new Date().toISOString();
    if (!runId) {
      throw new Error("Missing run identifier from backend response.");
    }
    persistRunMetadata({
      runId,
      query: submittedQuery,
      reportLength,
      createdAt: timestamp,
    });
    setSelectedOutput("");
    setPollingState({
      runId,
      statusUrl: `/agent-runs/${runId}`,
      sendEventPostUri: null,
      status: "Running",
      message: "Queued",
      progress: 0,
      lastUpdated: timestamp,
      humanFeedback: null,
    });
    setHistory((previous) => [
      {
        id: runId,
        query: submittedQuery,
        createdAt: timestamp,
        status: "Running",
        updates: [],
      },
      ...previous,
    ]);
  }, []);

  const updateHistoryEntry = useCallback((runId, reducer) => {
    setHistory((previous) => previous.map((entry) => (entry.id === runId ? reducer(entry) : entry)));
  }, []);

  const markRunAsRunning = useCallback(
    (runId, message, progress, humanFeedback = null) => {
      const timestamp = new Date().toISOString();
      setPollingState((previous) => ({
        ...previous,
        runId,
        statusUrl: `/agent-runs/${runId}`,
        status: "Running",
        message,
        progress,
        lastUpdated: timestamp,
        humanFeedback,
      }));
      updateHistoryEntry(runId, (entry) => ({
        ...entry,
        status: "Running",
        updates: [
          ...entry.updates,
          {
            timestamp,
            message,
            progress,
          },
        ],
      }));
    },
    [updateHistoryEntry],
  );

  const markRunAsCompleted = useCallback(
    (runId, message, output) => {
      const timestamp = new Date().toISOString();
      const resolvedMessage = message ?? "Completed";
      updateHistoryEntry(runId, (entry) => ({
        ...entry,
        status: "Completed",
        updates: [
          ...entry.updates,
          {
            timestamp,
            message: resolvedMessage,
            progress: 1,
          },
        ],
        output,
      }));
      setPollingState((previous) => ({
        ...previous,
        runId,
        status: "Completed",
        message: resolvedMessage,
        progress: 1,
        lastUpdated: timestamp,
        statusUrl: null,
        humanFeedback: null,
      }));
      clearRunMetadata();
    },
    [updateHistoryEntry],
  );

  const markRunAsFailed = useCallback(
    (runId, message) => {
      const timestamp = new Date().toISOString();
      let lastProgress = 0;
      updateHistoryEntry(runId, (entry) => {
        lastProgress =
          entry.updates.length > 0 ? entry.updates[entry.updates.length - 1].progress ?? 0 : 0;
        return {
          ...entry,
          status: "Failed",
          updates: [
            ...entry.updates,
            {
              timestamp,
              message,
              progress: lastProgress,
            },
          ],
        };
      });
      setPollingState((previous) => ({
        ...previous,
        runId,
        status: "Failed",
        message,
        progress: lastProgress,
        lastUpdated: timestamp,
        statusUrl: null,
        humanFeedback: null,
      }));
      clearRunMetadata();
    },
    [updateHistoryEntry],
  );

  const handleRemoveHistoryEntry = useCallback(
    (runId) => {
      setHistory((previous) => previous.filter((entry) => entry.id !== runId));
      setSelectedOutput("");
      setPollingState((previous) =>
        previous.runId === runId ? createEmptyPollingState() : previous,
      );
      const metadata = loadRunMetadata();
      if (metadata?.runId === runId) {
        clearRunMetadata();
      }
    },
    [setHistory],
  );

  const handleFeedbackAction = useCallback(
    async (action) => {
      const { runId } = pollingState;
      if (!runId) {
        console.warn("Cannot send event: missing runId");
        return;
      }
      try {
        await api.sendAgentFeedback(runId, action);
        setPollingState((previous) => ({
          ...previous,
          humanFeedback: null,
        }));
        if (action === "cancel") {
          markRunAsFailed(runId, "Cancelled by user");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setAgentError(`Failed to send ${action} event: ${message}`);
      }
    },
    [pollingState, markRunAsFailed],
  );

  useEffect(() => {
    const metadata = loadRunMetadata();
    if (!metadata || !metadata.runId) {
      return;
    }
    let cancelled = false;

    const ensureHistoryEntry = (stored, fallbackTimestamp) => {
      setHistory((previous) => {
        const exists = previous.some((entry) => entry.id === stored.runId);
        if (exists) {
          return previous;
        }
        const createdAt = stored.createdAt ?? fallbackTimestamp;
        const restoredEntry = {
          id: stored.runId,
          query: stored.query ?? "(restored run)",
          createdAt,
          status: "Running",
          updates: [],
        };
        return [restoredEntry, ...previous];
      });
    };

    const resumePolling = async (stored) => {
      const timestamp = new Date().toISOString();
      ensureHistoryEntry(stored, timestamp);
      try {
        const { status, body } = await api.getAgentRunStatus(stored.runId);
        if (cancelled) {
          return;
        }
        if (status === 202) {
          const progress = body.customStatus?.progress ?? 0;
          const message = body.customStatus?.message ?? "In progress";
          const humanFeedback = body.customStatus?.human_feedback ?? null;
          setSelectedOutput("");
          markRunAsRunning(stored.runId, message, progress, humanFeedback);
          return;
        }
        if (status === 200) {
          const message = body.customStatus?.message ?? body.runtimeStatus ?? "Completed";
          markRunAsCompleted(stored.runId, message, body.output);
          setSelectedOutput("");
          return;
        }
        const message = `Unexpected status: ${status}`;
        markRunAsFailed(stored.runId, message);
      } catch (err) {
        if (cancelled) {
          return;
        }
        const message = err instanceof Error ? err.message : "Unknown error";
        markRunAsFailed(metadata.runId, message);
      }
    };

    resumePolling(metadata).catch((err) => {
      console.warn("Failed to resume polling", err);
    });

    return () => {
      cancelled = true;
    };
  }, [markRunAsCompleted, markRunAsFailed, markRunAsRunning]);

  useEffect(() => {
    const { runId } = pollingState;
    if (!runId) {
      return;
    }
    let cancelled = false;
    let intervalId;

    const pollStatus = async () => {
      try {
        const { status, body } = await api.getAgentRunStatus(runId);
        if (cancelled) {
          return;
        }
        if (status === 202) {
          const progress = body.customStatus?.progress ?? 0;
          const message = body.customStatus?.message ?? "In progress";
          const humanFeedback = body.customStatus?.human_feedback ?? null;
          markRunAsRunning(runId, message, progress, humanFeedback);
          return;
        }
        if (status === 200) {
          const message = body.customStatus?.message ?? body.runtimeStatus;
          markRunAsCompleted(runId, message, body.output);
          intervalId && clearInterval(intervalId);
          return;
        }
        const message = `Unexpected status: ${status}`;
        markRunAsFailed(runId, message);
        intervalId && clearInterval(intervalId);
      } catch (err) {
        if (cancelled) {
          return;
        }
        const message = err instanceof Error ? err.message : "Unknown error";
        markRunAsFailed(runId, message);
        intervalId && clearInterval(intervalId);
      }
    };

    pollStatus();
    intervalId = setInterval(pollStatus, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      intervalId && clearInterval(intervalId);
    };
  }, [pollingState.runId, markRunAsCompleted, markRunAsFailed, markRunAsRunning]);

  const handleAgentSubmit = useCallback(
    async (query, reportLength) => {
      setAgentError(null);
      setSelectedOutput("");
      try {
        const startResponse = await api.startAgentRun({
          query,
          report_length: reportLength,
          project_id: activeProjectId,
        });
        startPolling(startResponse, query, reportLength);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setAgentError(message);
      }
    },
    [startPolling, activeProjectId],
  );

  const handleResizerMouseDown = useCallback(
    (index, event) => {
      if (!layoutRef.current) {
        return;
      }
      const { width } = layoutRef.current.getBoundingClientRect();
      if (width <= 0) {
        return;
      }
      setDragState({
        index,
        startX: event.clientX,
        startWidths: [...columnWidths],
        containerWidth: width,
      });
      event.preventDefault();
      event.stopPropagation();
    },
    [columnWidths],
  );

  useEffect(() => {
    if (typeof window === "undefined" || !dragState) {
      return;
    }
    const handleMouseMove = (event) => {
      const deltaPx = event.clientX - dragState.startX;
      const deltaPercent = (deltaPx / dragState.containerWidth) * 100;
      const totalPair =
        dragState.startWidths[dragState.index] + dragState.startWidths[dragState.index + 1];

      let nextLeft = dragState.startWidths[dragState.index] + deltaPercent;
      const minLeft = 18;
      const minRight = 18;
      nextLeft = Math.max(minLeft, Math.min(totalPair - minRight, nextLeft));
      const nextRight = totalPair - nextLeft;

      setColumnWidths(() => {
        const updated = [...dragState.startWidths];
        updated[dragState.index] = nextLeft;
        updated[dragState.index + 1] = nextRight;
        return updated;
      });
    };

    const handleMouseUp = () => {
      setDragState(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    if (!dragState) {
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
      return;
    }
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [dragState]);

  const derivedStatus = useMemo(
    () => ({
      status: pollingState.status,
      message: pollingState.message,
      progressPercent: deriveProgressPercent(pollingState.progress),
      lastUpdated: pollingState.lastUpdated,
    }),
    [pollingState],
  );


  return (
    <div className="app-shell">
      <section className="workspace-header-card">
        <WorkspaceHeader
          projectName={activeProject?.project_name ?? FALLBACK_NAME}
          isBusy={isMutating}
          onRename={handleProjectRename}
          onProjectsClick={() => setModalOpen(true)}
        />
      </section>

      {error ? <p className="error-banner">{error}</p> : null}

      {isLoading || !activeProject ? (
        <section className="loading-state">Loading project workspace…</section>
      ) : (
        <main className={dragState ? "app-layout is-dragging" : "app-layout"} ref={layoutRef}>
          <section
            className="column"
            style={{
              flexBasis: `${columnWidths[0]}%`,
              flexGrow: 0,
              flexShrink: 0,
            }}
          >
            <AgentRunPanel
              files={files}
              onUpload={handleFileUpload}
              onDelete={handleFileDelete}
              uploadsDisabled={isMutating}
              onSubmit={handleAgentSubmit}
              apiStatus={derivedStatus}
              errorMessage={agentError}
              isBusy={derivedStatus.status === "Running"}
              humanFeedback={pollingState.humanFeedback}
              onFeedbackAction={handleFeedbackAction}
            />
          </section>

        <div
          className={`column-resizer${dragState?.index === 0 ? " is-active" : ""}`}
          onMouseDown={(event) => handleResizerMouseDown(0, event)}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize project and history panels"
        />

        <section
          className="column"
          style={{
            flexBasis: `${columnWidths[1]}%`,
            flexGrow: 0,
            flexShrink: 0,
          }}
        >
          <ResultHistory
            entries={history}
            onSelectOutput={setSelectedOutput}
            onRemoveEntry={handleRemoveHistoryEntry}
          />
        </section>

        <div
          className={`column-resizer${dragState?.index === 1 ? " is-active" : ""}`}
          onMouseDown={(event) => handleResizerMouseDown(1, event)}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize history and preview panels"
        />

        <section
          className="column"
          style={{
            flexBasis: `${columnWidths[2]}%`,
            flexGrow: 0,
            flexShrink: 0,
          }}
        >
          <ReportPreview selectedOutput={selectedOutput} />
        </section>
        </main>
      )}

      <ProjectsModal
        open={modalOpen}
        projects={projects}
        activeProjectId={activeProjectId}
        onSelect={handleSelectProject}
        onCreate={handleCreateProject}
        onDelete={handleDeleteProject}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
