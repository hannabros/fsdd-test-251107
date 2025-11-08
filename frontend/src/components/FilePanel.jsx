import { useRef } from "react";

export default function FilePanel({ files, onUpload, onDelete, disabled }) {
  const fileInputRef = useRef(null);

  const handleFileSelect = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      onUpload(file);
      event.target.value = "";
    }
  };

  return (
    <section className="file-panel">
      <header>
        <h2>Source Files</h2>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
        >
          + Upload
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="sr-only"
          onChange={handleFileSelect}
        />
      </header>
      {files.length === 0 ? (
        <p className="empty-state">No files uploaded yet.</p>
      ) : (
        <ul>
          {files.map((file) => (
            <li key={file.file_id}>
              <div>
                <p>{file.original_filename}</p>
                <small>
                  Status: {file.status} • Uploaded {new Date(file.created_at).toLocaleString()}
                </small>
              </div>
              <button type="button" className="ghost" onClick={() => onDelete(file.file_id)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
