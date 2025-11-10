import { useRef } from "react";
import { formatAbsoluteTime } from "../lib/formatters.js";

const STATUS_META = {
  PENDING: { label: "Pending", tone: "pending" },
  PROCESSING: { label: "Processing", tone: "processing" },
  COMPLETED: { label: "Indexed", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
};

export default function FilePanel({ files = [], onUpload, onDelete, disabled }) {
  const inputRef = useRef(null);

  const handleFileSelect = (event) => {
    const list = event.target.files;
    if (list && list.length > 0) {
      onUpload(Array.from(list));
      event.target.value = "";
    }
  };

  const removeFile = (fileId) => {
    if (!disabled) {
      onDelete(fileId);
    }
  };

  return (
    <section className="panel file-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Source Files</p>
          <h2>Connected project assets</h2>
          <p className="muted">{files.length} file(s) indexed</p>
        </div>
        <div className="upload-control">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={disabled}>
            Upload files
          </button>
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept="application/pdf"
            multiple
            onChange={handleFileSelect}
          />
        </div>
      </div>

      {files.length === 0 ? (
        <div className="empty-state">
          <p>No files uploaded yet.</p>
          <p className="muted">
            Use the upload button to send PDFs to Azure Document Intelligence for parsing.
          </p>
        </div>
      ) : (
        <ul className="file-list">
          {files.map((file) => {
            const normalizedStatus = STATUS_META[file.status?.toUpperCase()] ?? {
              label: file.status ?? "Unknown",
              tone: "pending",
            };

            return (
              <li key={file.file_id} className="file-row">
                <div>
                  <p className="file-name">{file.original_filename}</p>
                  <div className="file-meta">
                    <span className={`file-pill ${normalizedStatus.tone}`}>
                      {normalizedStatus.label}
                    </span>
                    <span>{formatAbsoluteTime(file.created_at)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="ghost icon"
                  onClick={() => removeFile(file.file_id)}
                  aria-label={`Delete ${file.original_filename}`}
                  disabled={disabled}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
