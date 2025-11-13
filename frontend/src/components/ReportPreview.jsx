import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./ReportPreview.css";

export default function ReportPreview({ selectedOutput }) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const previousOverflow = useRef("");
  const hasOutput = selectedOutput.trim().length > 0;

  useEffect(() => {
    if (!isMaximized) {
      return;
    }
    previousOverflow.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow.current;
    };
  }, [isMaximized]);

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(selectedOutput);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error("Failed to copy text", error);
    }
  };

  const containerClassName = [
    "chat-placeholder",
    isMaximized ? "chat-placeholder--maximized" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={containerClassName}>
      <div className="chat-placeholder__header">
        <h2 className="chat-placeholder__title">Report Preview</h2>
        <div className="chat-placeholder__actions">
          <button
            type="button"
            className="preview-toggle"
            aria-label="Copy to clipboard"
            title={copySuccess ? "Copied!" : "Copy to clipboard"}
            onClick={handleCopyToClipboard}
            disabled={!hasOutput}
          >
            {copySuccess ? "✓" : "⧉"}
          </button>
          <button
            type="button"
            className="preview-toggle"
            aria-label={isMaximized ? "Exit full view" : "Maximize preview"}
            title={isMaximized ? "Exit full view" : "Maximize preview"}
            onClick={() => setIsMaximized((prev) => !prev)}
          >
            {isMaximized ? "▢" : "⬜"}
          </button>
        </div>
      </div>
      <div className="markdown-viewer">
        {hasOutput ? (
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedOutput}</ReactMarkdown>
          </div>
        ) : (
          <div className="markdown-placeholder">Select a result from the history to view it.</div>
        )}
      </div>
    </div>
  );
}
