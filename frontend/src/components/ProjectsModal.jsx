import { formatRelativeTime } from "../lib/formatters.js";

export default function ProjectsModal({
  open,
  projects,
  activeProjectId,
  onSelect,
  onCreate,
  onDelete,
  onClose,
}) {
  if (!open) {
    return null;
  }

  const disableDelete = projects.length <= 1;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="projects-modal">
        <header>
          <div>
            <p className="eyebrow">Workspace</p>
            <h2>My Projects</h2>
          </div>
          <div className="header-actions">
            <button type="button" className="ghost" onClick={onClose}>
              Close
            </button>
            <button type="button" onClick={() => onCreate()}>
              + Create New
            </button>
          </div>
        </header>

        {projects.length === 0 ? (
          <div className="empty-state">
            <p>No projects yet.</p>
            <p className="muted">Create one to start uploading documents.</p>
          </div>
        ) : (
          <section className="project-grid">
            {projects.map((project) => {
              const lastTouched =
                project.last_modified ?? project.updated_at ?? project.created_at;
              const isActive = project.project_id === activeProjectId;
              return (
                <article
                  key={project.project_id}
                  className={`project-card ${isActive ? "active" : ""}`}
                >
                  <button
                    type="button"
                    className="project-card-body"
                    onClick={() => onSelect(project.project_id)}
                  >
                    <div>
                      <h3>{project.project_name}</h3>
                      <p className="muted">{project.index_name}</p>
                    </div>
                    <small>{formatRelativeTime(lastTouched)}</small>
                  </button>
                  <button
                    type="button"
                    className="ghost danger"
                    disabled={disableDelete}
                    onClick={() => onDelete(project.project_id)}
                  >
                    Delete
                  </button>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}
