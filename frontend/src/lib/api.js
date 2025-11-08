const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: buildHeaders(options.body, options.headers),
    ...options,
  });

  if (!response.ok) {
    const message = await safeParseError(response);
    throw new Error(message || `Request failed with ${response.status}`);
  }

  return parseResponse(response);
}

function buildHeaders(body, customHeaders = {}) {
  const headers = { ...customHeaders };
  if (body instanceof FormData) {
    return headers;
  }
  if (!headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

async function safeParseError(response) {
  try {
    const data = await response.json();
    return data?.detail ?? JSON.stringify(data);
  } catch (error) {
    return response.statusText;
  }
}

export const api = {
  listProjects: () => request("/projects"),
  createProject: (payload) =>
    request("/projects", {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    }),
  getProject: (projectId) => request(`/projects/${projectId}`),
  updateProjectName: (projectId, name) =>
    request(`/projects/${projectId}`, {
      method: "PUT",
      body: JSON.stringify({ project_name: name }),
    }),
  deleteProject: (projectId) =>
    request(`/projects/${projectId}`, { method: "DELETE" }),
  uploadFile: (projectId, file) => {
    const formData = new FormData();
    formData.append("file", file);
    return request(`/projects/${projectId}/files`, {
      method: "POST",
      body: formData,
    });
  },
  deleteFile: (fileId) => request(`/files/${fileId}`, { method: "DELETE" }),
};
