import { useState } from "react";

export default function ProjectsModal({
  open,
  projects,
  onSelect,
  onCreate,
  onDelete,
  onClose,
}) {
  const [newName, setNewName] = useState("Untitled Project");

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <header>
          <h2>My Projects</h2>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </header>
        <section className="new-project">
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
          />
          <button
            type="button"
            onClick={() => {
              onCreate(newName);
              setNewName("Untitled Project");
            }}
          >
            + New Project
          </button>
        </section>
        <section className="project-cards">
          {projects.length === 0 ? (
            <p className="empty-state">No projects yet.</p>
          ) : (
            projects.map((project) => (
              <article key={project.project_id}>
                <div>
                  <h3>{project.project_name}</h3>
                  <small>{project.index_name}</small>
                </div>
                <div className="actions">
                  <button type="button" onClick={() => onSelect(project.project_id)}>
                    Open
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => onDelete(project.project_id)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
