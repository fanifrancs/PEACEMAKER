import { useState } from 'react'
import LandingPage from './components/LandingPage'
import Dashboard from './components/Dashboard'
import './App.css'

function App() {
  const [currentView, setCurrentView] = useState('landing') // 'landing' | 'dashboard'

  return (
    <>
      {currentView === 'landing' ? (
        <LandingPage onEnterApp={() => setCurrentView('dashboard')} />
      ) : (
        <Dashboard onBack={() => setCurrentView('landing')} />
      )}
    </>
  )
}

export default App
