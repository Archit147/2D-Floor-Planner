export class ApiClient {
  async request(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    const contentType = response.headers.get('content-type') || '';
    const result = contentType.includes('application/json') ? await response.json() : await response.blob();
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
    return result;
  }

  listProjects() { return this.request('/api/projects'); }
  getProject(id) { return this.request(`/api/projects/${encodeURIComponent(id)}`); }
  createProject(document) { return this.request('/api/projects', { method: 'POST', body: JSON.stringify(document) }); }
  updateProject(id, document) { return this.request(`/api/projects/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(document) }); }
  deleteProject(id) { return this.request(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
  listSamples() { return this.request('/api/samples'); }
  export(format, document) { return this.request(`/api/export/${format}`, { method: 'POST', body: JSON.stringify(document) }); }
}