import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

// ---------- Hash router ----------
export function useHash() {
  const [hash, setHash] = useState(() => window.location.hash || '#/')
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#/')
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash.replace(/^#/, '')
}
export const go = (path: string) => { window.location.hash = path }
export const back = () => (history.length > 1 ? history.back() : go('/'))

// ---------- Toast ----------
const ToastCtx = createContext<(msg: string) => void>(() => {})
export const useToast = () => useContext(ToastCtx)
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  const show = useCallback((m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(null), 2200)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className="toast">{msg}</div>}
    </ToastCtx.Provider>
  )
}

// ---------- Layout ----------
export function TopBar({ title, sub, onBack, right }: { title: string; sub?: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <header className="topbar">
      {onBack && <button className="back" onClick={onBack} aria-label="返回">‹</button>}
      <div className="grow">
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {right}
    </header>
  )
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="handle" />
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  )
}

// ---------- Form controls ----------
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

export function Chips<T extends string | number>({ options, value, onChange, labels }: {
  options: T[]; value: T; onChange: (v: T) => void; labels?: (v: T) => string
}) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={String(o)} type="button" className={'chip' + (o === value ? ' on' : '')} onClick={() => onChange(o)}>
          {labels ? labels(o) : String(o)}
        </button>
      ))}
    </div>
  )
}

export function Stepper({ value, onChange, min = 0, step = 1 }: { value: number; onChange: (v: number) => void; min?: number; step?: number }) {
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(Math.max(min, value - step))} aria-label="減少">−</button>
      <input
        type="number" inputMode="numeric" value={value}
        onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))}
        onFocus={(e) => e.target.select()}
      />
      <button type="button" onClick={() => onChange(value + step)} aria-label="增加">+</button>
    </div>
  )
}

export function Segment<T extends string>({ options, value, onChange }: { options: { v: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.v} type="button" className={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)}>{o.label}</button>
      ))}
    </div>
  )
}

export function confirm(msg: string) {
  return window.confirm(msg)
}
