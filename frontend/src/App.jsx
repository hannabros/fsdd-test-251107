import { useCallback, useEffect, useRef, useState } from "react";
import WorkspaceHeader from "./components/WorkspaceHeader.jsx";
import FilePanel from "./components/FilePanel.jsx";
import ProjectsModal from "./components/ProjectsModal.jsx";
import { api } from "./lib/api.js";

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

  return (
    <div className="app-shell">
      <WorkspaceHeader
        projectName={activeProject?.project_name ?? FALLBACK_NAME}
        isBusy={isMutating}
        onRename={handleProjectRename}
        onProjectsClick={() => setModalOpen(true)}
      />

      {error ? <p className="error-banner">{error}</p> : null}
      {isLoading || !activeProject ? (
        <section className="loading-state">Loading project workspace…</section>
      ) : (
        <section className="panel-grid">
          <FilePanel
            files={files}
            disabled={isMutating}
            onUpload={handleFileUpload}
            onDelete={handleFileDelete}
          />

          <section className="panel placeholder-panel">
            <div>
              <p className="eyebrow">AI Insights</p>
              <h2>Reserved for Azure Document Intelligence output</h2>
              <p>Once document parsing is complete, extracted highlights will live here.</p>
            </div>
          </section>

          <section className="panel placeholder-panel">
            <div>
              <p className="eyebrow">Q&amp;A Console</p>
              <h2>Ask questions about your files</h2>
              <p>This space is intentionally blank until Azure AI Search is wired in.</p>
            </div>
          </section>
        </section>
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
