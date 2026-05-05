import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import { ThemeProvider } from "./components/ui/theme-provider"
import { Toaster } from "./components/ui/toaster"
import { AuthProvider } from "./contexts/AuthContext"
import { Layout } from "./components/Layout"
import { Dashboard } from "./pages/Dashboard"

function App() {
  return (
    <AuthProvider>
        <ThemeProvider defaultTheme="light" storageKey="ui-theme">
          <Router>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<Dashboard />} />
              </Route>
            </Routes>
          </Router>
          <Toaster />
        </ThemeProvider>
    </AuthProvider>
  )
}

export default App