import { useEffect, useState } from "react";
import WorkspaceHeader from "./components/WorkspaceHeader.jsx";
import FilePanel from "./components/FilePanel.jsx";
import ProjectsModal from "./components/ProjectsModal.jsx";
import { api } from "./lib/api.js";

const FALLBACK_NAME = "Untitled Project";

export default function App() {
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    bootstrap();
  }, []);

  async function bootstrap(targetProjectId) {
    setIsLoading(true);
    setError("");

    try {
      let projectList = await api.listProjects();
      if (projectList.length === 0) {
        const created = await api.createProject({ project_name: FALLBACK_NAME });
        projectList = [created];
      }
      setProjects(projectList);
      const nextProjectId = targetProjectId ?? projectList[0]?.project_id;
      if (nextProjectId) {
        await focusProject(nextProjectId);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function focusProject(projectId) {
    if (!projectId) return;
    try {
      const project = await api.getProject(projectId);
      setActiveProject(project);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleProjectRename(name) {
    if (!activeProject) return;
    const trimmed = name.trim() || FALLBACK_NAME;
    if (trimmed === activeProject.project_name) {
      return;
    }

    setActiveProject({ ...activeProject, project_name: trimmed });
    setProjects((prev) =>
      prev.map((project) =>
        project.project_id === activeProject.project_id
          ? { ...project, project_name: trimmed }
          : project,
      ),
    );

    try {
      setIsMutating(true);
      await api.updateProjectName(activeProject.project_id, trimmed);
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
      setProjects((prev) => [project, ...prev]);
      await focusProject(project.project_id);
      setModalOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsMutating(false);
    }
  }

  async function handleSelectProject(projectId) {
    await focusProject(projectId);
    setModalOpen(false);
  }

  async function handleDeleteProject(projectId) {
    setError("");
    try {
      setIsMutating(true);
      await api.deleteProject(projectId);
      const remaining = projects.filter((project) => project.project_id !== projectId);
      setProjects(remaining);

      if (activeProject?.project_id === projectId) {
        const fallback = remaining[0];
        if (fallback) {
          await focusProject(fallback.project_id);
        } else {
          setActiveProject(null);
        }
      }
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
        activeProjectId={activeProject?.project_id}
        onSelect={handleSelectProject}
        onCreate={handleCreateProject}
        onDelete={handleDeleteProject}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
