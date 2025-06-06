import { Outlet } from "react-router-dom"
import { Header } from "./Header"
import { Footer } from "./Footer"

export function Layout() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary">
      <Header />
      <div className="pt-16 pb-14">
        <main className="min-h-[calc(100vh-7rem)]">
          <Outlet />
        </main>
      </div>
      <Footer />
    </div>
  )
}