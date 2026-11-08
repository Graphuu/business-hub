import client from './client'

// Integrations
export const listIntegrations = () => client.get('/integrations').then((r) => r.data)
export const createIntegration = (body) => client.post('/integrations', body).then((r) => r.data)
export const updateIntegration = (id, body) => client.put(`/integrations/${id}`, body).then((r) => r.data)
export const deleteIntegration = (id) => client.delete(`/integrations/${id}`).then((r) => r.data)
export const testIntegration = (id) => client.post(`/integrations/${id}/test`).then((r) => r.data)
export const testIntegrationConfig = (body) => client.post('/integrations/test-config', body).then((r) => r.data)

// Pipelines
export const listPipelines = () => client.get('/pipelines').then((r) => r.data)
export const getPipeline = (id) => client.get(`/pipelines/${id}`).then((r) => r.data)
export const createPipeline = (body) => client.post('/pipelines', body).then((r) => r.data)
export const updatePipeline = (id, body) => client.put(`/pipelines/${id}`, body).then((r) => r.data)
export const deletePipeline = (id) => client.delete(`/pipelines/${id}`).then((r) => r.data)
export const runPipeline = (id) => client.post(`/pipelines/${id}/run`).then((r) => r.data)
export const startPipelineStream = (id) => client.post(`/pipelines/${id}/start-stream`).then((r) => r.data)
export const stopPipelineStream = (id) => client.post(`/pipelines/${id}/stop-stream`).then((r) => r.data)
export const getPipelineStreamStatus = (id) => client.get(`/pipelines/${id}/stream-status`).then((r) => r.data)

// Transforms
export const listTransforms = () => client.get('/transforms').then((r) => r.data)
export const getTransform = (id) => client.get(`/transforms/${id}`).then((r) => r.data)
export const createTransform = (body) => client.post('/transforms', body).then((r) => r.data)
export const updateTransform = (id, body) => client.put(`/transforms/${id}`, body).then((r) => r.data)
export const deleteTransform = (id) => client.delete(`/transforms/${id}`).then((r) => r.data)
export const runTransform = (id) => client.post(`/transforms/${id}/run`).then((r) => r.data)
export const previewTransform = (sql) => client.post('/transforms/preview', { sql }).then((r) => r.data)

// Datasets
export const listDatasets = () => client.get('/datasets').then((r) => r.data)
export const getDataset = (id) => client.get(`/datasets/${id}`).then((r) => r.data)
export const getDatasetSchema = (id) => client.get(`/datasets/${id}/schema`).then((r) => r.data)
export const previewDataset = (id, limit = 100) => client.get(`/datasets/${id}/preview`, { params: { limit } }).then((r) => r.data)
export const deleteDataset = (id) => client.delete(`/datasets/${id}`).then((r) => r.data)

// Ad-hoc + saved queries
export const runAdHocQuery = (sql) => client.post('/query', { sql }).then((r) => r.data)
export const listSavedQueries = () => client.get('/saved-queries').then((r) => r.data)
export const createSavedQuery = (body) => client.post('/saved-queries', body).then((r) => r.data)
export const updateSavedQuery = (id, body) => client.put(`/saved-queries/${id}`, body).then((r) => r.data)
export const deleteSavedQuery = (id) => client.delete(`/saved-queries/${id}`).then((r) => r.data)
export const runSavedQuery = (id) => client.post(`/saved-queries/${id}/run`).then((r) => r.data)

// Dashboards
export const listDashboards = () => client.get('/dashboards').then((r) => r.data)
export const getDashboard = (id) => client.get(`/dashboards/${id}`).then((r) => r.data)
export const createDashboard = (body) => client.post('/dashboards', body).then((r) => r.data)
export const updateDashboard = (id, body) => client.put(`/dashboards/${id}`, body).then((r) => r.data)
export const deleteDashboard = (id) => client.delete(`/dashboards/${id}`).then((r) => r.data)
export const getDashboardData = (id) => client.get(`/dashboards/${id}/data`).then((r) => r.data)
export const createWidget = (dashboardId, body) => client.post(`/dashboards/${dashboardId}/widgets`, body).then((r) => r.data)
export const updateWidget = (dashboardId, widgetId, body) => client.put(`/dashboards/${dashboardId}/widgets/${widgetId}`, body).then((r) => r.data)
export const deleteWidget = (dashboardId, widgetId) => client.delete(`/dashboards/${dashboardId}/widgets/${widgetId}`).then((r) => r.data)
export const updateLayout = (dashboardId, items) => client.patch(`/dashboards/${dashboardId}/layout`, { items }).then((r) => r.data)

// Seed
export const seedMockDemo = () => client.post('/seed/mock').then((r) => r.data)
export const resetAll = () => client.post('/seed/reset').then((r) => r.data)

// AI
export const getAISettings = () => client.get('/ai/settings').then((r) => r.data)
export const saveAISettings = (body) => client.put('/ai/settings', body).then((r) => r.data)
export const testAIConnection = (settings) => client.post('/ai/test', { settings }).then((r) => r.data)
export const generateAIPlan = (body) => client.post('/ai/plan', body).then((r) => r.data)
export const applyAIPlan = (plan) => client.post('/ai/apply', { plan }).then((r) => r.data)
