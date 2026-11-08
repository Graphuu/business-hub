import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import AdHocQuery from './pages/AdHocQuery'
import AIBuilder from './pages/AIBuilder'
import DashboardViewer from './pages/DashboardViewer'
import Dashboards from './pages/Dashboards'
import DataSources from './pages/DataSources'
import Datasets from './pages/Datasets'
import Overview from './pages/Overview'
import PipelineBuilder from './pages/PipelineBuilder'
import Pipelines from './pages/Pipelines'
import TransformBuilder from './pages/TransformBuilder'
import Transforms from './pages/Transforms'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/ai" element={<AIBuilder />} />
        <Route path="/sources" element={<DataSources />} />
        <Route path="/pipelines" element={<Pipelines />} />
        <Route path="/pipelines/new" element={<PipelineBuilder />} />
        <Route path="/pipelines/:id" element={<PipelineBuilder />} />
        <Route path="/transforms" element={<Transforms />} />
        <Route path="/transforms/new" element={<TransformBuilder />} />
        <Route path="/transforms/:id" element={<TransformBuilder />} />
        <Route path="/datasets" element={<Datasets />} />
        <Route path="/query" element={<AdHocQuery />} />
        <Route path="/dashboards" element={<Dashboards />} />
        <Route path="/dashboards/:id" element={<DashboardViewer />} />
      </Routes>
    </Layout>
  )
}
