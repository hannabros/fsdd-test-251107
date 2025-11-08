export default function WorkspaceHeader({
  projectName,
  isSaving,
  onNameChange,
  onProjectsClick,
}) {
  return (
    <header className="workspace-header">
      <div>
        <button type="button" className="ghost" onClick={onProjectsClick}>
          My Projects
        </button>
      </div>
      <div className="project-name">
        <label htmlFor="projectName">Project Name</label>
        <input
          id="projectName"
          value={projectName}
          onChange={(event) => onNameChange(event.target.value)}
          disabled={isSaving}
        />
      </div>
    </header>
  );
}
