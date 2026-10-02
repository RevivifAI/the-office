/**
 * Read-only client for the local Paperclip control plane.
 *
 * The office stack only ever issues GETs against loopback. It never writes to
 * the control plane. Credentials come from the run environment (a Vault
 * rendered EnvironmentFile in the container) and are never logged or returned.
 */

const DEFAULT_TIMEOUT_MS = 8000;

export function createControlPlaneClient({
  apiUrl,
  apiKey,
  companyId,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const base = String(apiUrl ?? "").replace(/\/+$/, "");
  const configured = Boolean(base && apiKey && companyId);

  async function get(path) {
    if (!apiKey) throw new Error("missing_credential");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${base}${path}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    configured,
    getAgents: () => get(`/api/companies/${companyId}/agents`),
    getIssues: () =>
      get(
        `/api/companies/${companyId}/issues` +
          "?status=in_progress,in_review,blocked&view=compact&limit=200",
      ),
    getLiveRuns: () => get(`/api/companies/${companyId}/live-runs`),
    getActivity: (limit = 50) =>
      get(`/api/companies/${companyId}/activity?limit=${limit}`),
    getLatestComment: (issueId) => get(`/api/issues/${issueId}/comments`),
  };
}
