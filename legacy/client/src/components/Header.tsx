import { Bot, Zap } from "lucide-react"
import { Button } from "./ui/button"
import { ThemeToggle } from "./ui/theme-toggle"
import { useAuth } from "@/contexts/AuthContext"
import { useNavigate } from "react-router-dom"

export function Header() {
  const navigate = useNavigate()
  return (
    <header className="fixed top-0 z-50 w-full border-b bg-white/80 backdrop-blur-sm shadow-sm">
      <div className="flex h-16 items-center justify-between px-6">
        <div 
          className="flex items-center gap-2 cursor-pointer" 
          onClick={() => navigate("/")}
        >
          <div className="p-2 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Saturday
            </h1>
            <p className="text-xs text-gray-500">Automated Trading Bot</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
            <Zap className="w-4 h-4" />
            <span>Live</span>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}