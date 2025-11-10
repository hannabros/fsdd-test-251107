const DAY_IN_MS = 24 * 60 * 60 * 1000;

const SAFE_DATE_OPTIONS = {
  dateStyle: "medium",
  timeStyle: "short",
};

export function formatRelativeTime(value) {
  const timestamp = parseDate(value);
  if (!timestamp) {
    return "Unknown date";
  }

  const now = Date.now();
  const diff = now - timestamp;

  if (diff < DAY_IN_MS) {
    return "Today";
  }
  if (diff < DAY_IN_MS * 2) {
    return "Yesterday";
  }
  if (diff < DAY_IN_MS * 7) {
    return `${Math.floor(diff / DAY_IN_MS)} days ago`;
  }

  return new Date(timestamp).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatAbsoluteTime(value) {
  const timestamp = parseDate(value);
  if (!timestamp) {
    return "—";
  }
  return new Date(timestamp).toLocaleString(undefined, SAFE_DATE_OPTIONS);
}

function parseDate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.getTime();
}
