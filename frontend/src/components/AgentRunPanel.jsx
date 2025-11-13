import { useRef, useState } from "react";
import { formatAbsoluteTime } from "../lib/formatters.js";
import "./AgentRunPanel.css";

const STATUS_META = {
  PENDING: { label: "Pending", tone: "pending" },
  PROCESSING: { label: "Processing", tone: "pending" },
  COMPLETED: { label: "Indexed", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
};

export default function AgentRunPanel({
  files,
  onUpload,
  onDelete,
  uploadsDisabled,
  onSubmit,
  apiStatus,
  errorMessage,
  isBusy,
  humanFeedback,
  onFeedbackAction,
}) {
  const [query, setQuery] = useState("");
  const [reportLength, setReportLength] = useState("medium");
  const fileInputRef = useRef(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }
    await onSubmit(trimmed, reportLength);
    setQuery("");
  };

  const handleFileSelect = (event) => {
    const selection = event.target.files;
    if (!selection || selection.length === 0) {
      return;
    }
    onUpload(Array.from(selection));
    event.target.value = "";
  };

  const statusPill = (status) => {
    const normalized = STATUS_META[status?.toUpperCase()] ?? {
      label: status ?? "Unknown",
      tone: "pending",
    };
    return <span className={`file-pill ${normalized.tone}`}>{normalized.label}</span>;
  };

  return (
    <form className="agent-panel" onSubmit={handleSubmit}>
      <section className="agent-panel__files">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Source Files</p>
            <h2>Project Assets</h2>
            <p className="muted">{files.length} file(s) indexed</p>
          </div>
          <div className="upload-control">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadsDisabled}
            >
              Upload Files
            </button>
            <input
              ref={fileInputRef}
              className="sr-only"
              type="file"
              accept="application/pdf"
              multiple
              onChange={handleFileSelect}
            />
          </div>
        </div>

        {files.length === 0 ? (
          <div className="empty-state">No files uploaded yet.</div>
        ) : (
          <ul className="file-list">
            {files.map((file) => (
              <li key={file.file_id} className="file-row">
                <div>
                  <p className="file-name">{file.original_filename}</p>
                  <div className="file-meta">
                    {statusPill(file.status)}
                    <span>{formatAbsoluteTime(file.created_at)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="ghost icon"
                  onClick={() => onDelete(file.file_id)}
                  disabled={uploadsDisabled}
                  aria-label={`Delete ${file.original_filename}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="agent-panel__section">
        <label htmlFor="report-length" className="agent-panel__label">
          Report Length
        </label>
        <select
          id="report-length"
          className="agent-panel__select"
          value={reportLength}
          onChange={(event) => setReportLength(event.target.value)}
          disabled={isBusy}
        >
          <option value="short">Short</option>
          <option value="medium">Medium</option>
          <option value="long">Long</option>
        </select>
      </div>

      <div className="agent-panel__section">
        <label htmlFor="query-text" className="agent-panel__label">
          Research Request
        </label>
        <textarea
          id="query-text"
          className="agent-panel__textarea"
          rows={8}
          placeholder="Describe the due-diligence request, deliverable, or questions to investigate..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={isBusy}
        />
      </div>

      {errorMessage ? <p className="agent-panel__error">{errorMessage}</p> : null}

      <button type="submit" className="agent-panel__submit" disabled={isBusy || !query.trim()}>
        {isBusy ? "Research in progress..." : "Start Research"}
      </button>

      <div className="agent-panel__status">
        <div className="agent-panel__status-row">
          <span className="agent-panel__status-label">Status</span>
          <span className="agent-panel__status-value">
            {apiStatus.status === "Idle" ? "Idle" : apiStatus.message || apiStatus.status}
          </span>
        </div>
        <div className="agent-panel__progress">
          <progress value={apiStatus.progressPercent} max={100} />
          <span>{apiStatus.progressPercent}%</span>
        </div>
        {apiStatus.lastUpdated ? (
          <div className="agent-panel__status-updated">
            Updated {new Date(apiStatus.lastUpdated).toLocaleTimeString()}
          </div>
        ) : null}
      </div>

      {humanFeedback ? (
        <div className="agent-panel__feedback">
          <div className="agent-panel__feedback-header">Human input requested</div>
          <pre>{humanFeedback}</pre>
          <div className="agent-panel__feedback-actions">
            <button
              type="button"
              className="agent-panel__feedback-button continue"
              onClick={() => onFeedbackAction("continue")}
              disabled={!isBusy}
            >
              Continue
            </button>
            <button
              type="button"
              className="agent-panel__feedback-button cancel"
              onClick={() => onFeedbackAction("cancel")}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </form>
  );
}
