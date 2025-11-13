import { useState } from "react";
import "./ResultHistory.css";

function safeParse(output) {
  try {
    return JSON.parse(output);
  } catch (error) {
    console.warn("Failed to parse agent output", error);
    return {};
  }
}

function formatReport(output) {
  const jsonOutput = safeParse(output);
  const report = jsonOutput?.final_report || "No report generated.";
  return report.replace(/~/g, "\\~");
}

function formatSearchSummary(output) {
  const jsonOutput = safeParse(output);
  const reportInput = jsonOutput?.report_input || {};
  const researchResults = reportInput?.research_results || [];
  const lines = [];
  for (const research of researchResults) {
    lines.push(`### ${research.topic}`);
    lines.push(`**summary**: ${(research.summary || "").replace("\n", " ")}`);
    lines.push("");
  }
  return lines.join("\n");
}

function formatSearchResult(output) {
  const jsonOutput = safeParse(output);
  const searchResults = jsonOutput?.search_results || [];
  const sections = [];
  for (const topicResults of searchResults) {
    sections.push("## Search Results:");
    for (const item of topicResults) {
      sections.push(`### ${item.query}`);
      sections.push(item.result || "");
      sections.push("\n---\n");
    }
  }
  return sections.join("\n");
}

function formatSearchPlan(output) {
  const jsonOutput = safeParse(output);
  return "```json\n" + JSON.stringify(jsonOutput?.search_tasks || {}, null, 2) + "\n```";
}

function ResultHistory({ entries, onSelectOutput, onRemoveEntry }) {
  const [focusedEntryId, setFocusedEntryId] = useState(null);

  const stringifyOutput = (output) => {
    if (output === null || output === undefined) {
      return "";
    }
    if (typeof output === "string") {
      return output;
    }
    try {
      return JSON.stringify(output, null, 2);
    } catch (error) {
      console.warn("Failed to stringify output", error);
      return String(output);
    }
  };

  const clampProgress = (value) => {
    if (Number.isNaN(value)) {
      return 0;
    }
    return Math.min(100, Math.max(0, value));
  };

  const handleRemove = (entry) => {
    const confirmed = window.confirm("Remove this run from history? This action cannot be undone.");
    if (!confirmed) {
      return;
    }
    onRemoveEntry(entry.id);
    if (focusedEntryId === entry.id) {
      setFocusedEntryId(null);
    }
  };

  const handleOutputClick = (entryId, outputText) => {
    setFocusedEntryId(entryId);
    onSelectOutput(outputText);
  };

  return (
    <div className="history-panel">
      <h2>Research History</h2>
      {entries.length === 0 ? (
        <p className="history-empty">History will appear here once you start a job.</p>
      ) : (
        <ul className="history-list">
          {entries.map((entry) => {
            const hasOutput = entry.output !== undefined && entry.output !== null;
            const outputText = hasOutput ? stringifyOutput(entry.output) : "";
            const latestUpdate =
              entry.updates.length > 0 ? entry.updates[entry.updates.length - 1] : null;
            const showProgress = entry.status === "Running" && latestUpdate;
            const progressValue =
              showProgress && latestUpdate ? clampProgress((latestUpdate.progress || 0) * 100) : 0;
            const isFocused = focusedEntryId === entry.id;

            return (
              <li key={entry.id} className={`history-item${isFocused ? " focused" : ""}`}>
                <div className="history-header">
                  <div className="history-header-left">
                    <button
                      type="button"
                      className="history-remove-button"
                      aria-label="Remove run from history"
                      onClick={() => handleRemove(entry)}
                    >
                      ×
                    </button>
                    <span className="history-status" data-status={entry.status}>
                      {entry.status}
                    </span>
                  </div>
                  <span className="history-timestamp">
                    {new Date(entry.createdAt).toLocaleString()}
                  </span>
                </div>

                <div className="history-query" title={entry.query}>
                  {entry.query}
                </div>

                <div className="history-status-block">
                  {showProgress && latestUpdate ? (
                    <>
                      <div className="history-status-meta">
                        <span className="update-time">
                          {new Date(latestUpdate.timestamp).toLocaleTimeString()}
                        </span>
                        <span className="history-status-message">{latestUpdate.message}</span>
                      </div>
                      <div className="history-progress-bar">
                        <div className="history-progress-bar-fill" style={{ width: `${progressValue}%` }} />
                      </div>
                    </>
                  ) : latestUpdate ? (
                    <div className="history-status-meta">
                      <span className="update-time">
                        {new Date(latestUpdate.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="history-status-message">{latestUpdate.message}</span>
                    </div>
                  ) : (
                    <div className="history-status-empty">No status updates yet.</div>
                  )}
                </div>

                {hasOutput ? (
                  <div className="history-output">
                    <button
                      type="button"
                      className="history-output-button"
                      onClick={() => handleOutputClick(entry.id, entry.query)}
                    >
                      Query
                    </button>
                    ➡️
                    <button
                      type="button"
                      className="history-output-button"
                      title="Search Plan"
                      onClick={() => handleOutputClick(entry.id, formatSearchPlan(outputText))}
                    >
                      🗞️
                    </button>
                    ➡️
                    <button
                      type="button"
                      className="history-output-button"
                      title="Search Result"
                      onClick={() => handleOutputClick(entry.id, formatSearchResult(outputText))}
                    >
                      🔎
                    </button>
                    ➡️
                    <button
                      type="button"
                      className="history-output-button"
                      title="Result Summary"
                      onClick={() => handleOutputClick(entry.id, formatSearchSummary(outputText))}
                    >
                      📑
                    </button>
                    ➡️
                    <button
                      type="button"
                      className="history-output-button"
                      onClick={() => handleOutputClick(entry.id, formatReport(outputText))}
                    >
                      Report
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default ResultHistory;
