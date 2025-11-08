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
  const [isSaving, setIsSaving] = useState(false);
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
      const firstProjectId = targetProjectId ?? projectList[0]?.project_id;
      if (firstProjectId) {
        await focusProject(firstProjectId);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function focusProject(projectId) {
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
    setActiveProject({ ...activeProject, project_name: trimmed });

    try {
      setIsSaving(true);
      await api.updateProjectName(activeProject.project_id, trimmed);
      setProjects((prev) =>
        prev.map((project) =>
          project.project_id === activeProject.project_id
            ? { ...project, project_name: trimmed }
            : project,
        ),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateProject(name) {
    try {
      const project = await api.createProject({ project_name: name || FALLBACK_NAME });
      setProjects((prev) => [project, ...prev]);
      await focusProject(project.project_id);
      setModalOpen(false);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSelectProject(projectId) {
    await focusProject(projectId);
    setModalOpen(false);
  }

  async function handleDeleteProject(projectId) {
    try {
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
    }
  }

  async function handleFileUpload(file) {
    if (!activeProject) return;
    try {
      await api.uploadFile(activeProject.project_id, file);
      await focusProject(activeProject.project_id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleFileDelete(fileId) {
    if (!activeProject) return;
    try {
      await api.deleteFile(fileId);
      await focusProject(activeProject.project_id);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="workspace">
      <WorkspaceHeader
        projectName={activeProject?.project_name ?? FALLBACK_NAME}
        onNameChange={handleProjectRename}
        isSaving={isSaving}
        onProjectsClick={() => setModalOpen(true)}
      />

      {error ? <p className="error-banner">{error}</p> : null}
      {isLoading || !activeProject ? (
        <section className="empty-canvas">Loading project...</section>
      ) : (
        <section className="workspace-body">
          <FilePanel
            files={activeProject.files ?? []}
            onUpload={handleFileUpload}
            onDelete={handleFileDelete}
            disabled={isSaving}
          />
          <section className="insights-panel">
            <h2>Insights &amp; Q&amp;A (Future)</h2>
            <p>This area is intentionally left blank for future AI-powered features.</p>
          </section>
        </section>
      )}

      <ProjectsModal
        open={modalOpen}
        projects={projects}
        onSelect={handleSelectProject}
        onCreate={handleCreateProject}
        onDelete={handleDeleteProject}
        onClose={() => setModalOpen(false)}
      />
    </main>
  );
}
