import { useEffect, useRef, useState } from "react";

export default function WorkspaceHeader({ projectName, isBusy, onProjectsClick, onRename }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(projectName);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isEditing) {
      setDraftName(projectName);
    }
  }, [projectName, isEditing]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const commitName = () => {
    setIsEditing(false);
    onRename(draftName);
  };

  const cancelEditing = () => {
    setDraftName(projectName);
    setIsEditing(false);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      commitName();
    }
    if (event.key === "Escape") {
      cancelEditing();
    }
  };

  return (
    <header className="workspace-header">
      <div className="project-title">
        <p className="eyebrow">Active project</p>
        {isEditing ? (
          <input
            ref={inputRef}
            id="projectNameInput"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onBlur={commitName}
            onKeyDown={handleKeyDown}
            disabled={isBusy}
          />
        ) : (
          <button
            type="button"
            className="project-name-button"
            onClick={() => setIsEditing(true)}
            disabled={isBusy}
          >
            {projectName}
          </button>
        )}
      </div>

      <div className="workspace-header-actions">
        <span className={`pill ${isBusy ? "pill-pending" : "pill-ready"}`}>
          {isBusy ? "Syncing changes…" : "Up to date"}
        </span>
        <button type="button" onClick={onProjectsClick} className="primary">
          My Projects
        </button>
      </div>
    </header>
  );
}
