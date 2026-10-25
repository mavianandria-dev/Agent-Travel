import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { boot } from '@/lib/boot.js'

function BootGate() {
  const [state, setState] = useState({ ready: false, error: null })

  useEffect(() => {
    let alive = true
    boot()
      .then(() => { if (alive) setState({ ready: true, error: null }) })
      .catch((e) => { if (alive) setState({ ready: false, error: e }) })
    return () => { alive = false }
  }, [])

  if (state.error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-card p-6 max-w-md w-full">
          <div className="font-extrabold text-[18px] text-slate-900">Data belum bisa dimuat</div>
          <p className="text-[13px] text-slate-500 font-medium mt-2">{state.error.message || 'Terjadi kesalahan.'}</p>
          <button onClick={() => window.location.reload()} className="mt-4 w-full bg-[#0b2447] text-white font-extrabold py-3 rounded-2xl">Coba lagi</button>
        </div>
      </div>
    )
  }

  if (!state.ready) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 mx-auto animate-pulse"></div>
          <div className="text-[13px] font-bold text-slate-500 mt-3">Memuat data…</div>
        </div>
      </div>
    )
  }

  return <App />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BootGate />
  </StrictMode>,
)
