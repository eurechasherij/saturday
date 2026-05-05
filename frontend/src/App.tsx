import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "@/components/Layout";
import DataPage from "@/pages/Data";
import BacktestPage from "@/pages/Backtest";
import RunsPage from "@/pages/Runs";
import RunViewerPage from "@/pages/RunViewer";
import LiveSignalPage from "@/pages/LiveSignal";
import SettingsPage from "@/pages/Settings";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/data" replace />} />
        <Route path="data" element={<DataPage />} />
        <Route path="backtest" element={<BacktestPage />} />
        <Route path="runs" element={<RunsPage />} />
        <Route path="runs/:runId" element={<RunViewerPage />} />
        <Route path="live" element={<LiveSignalPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
