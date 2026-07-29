'use client'

import { useEffect, useState } from 'react'

export function ResearchEvidenceToggle() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    const report = document.querySelector<HTMLElement>('[data-research-presentation]')
    report?.classList.toggle('evidence-mode', enabled)
    return () => report?.classList.remove('evidence-mode')
  }, [enabled])

  const toggle = () => {
    setEnabled((current) => !current)
  }

  return (
    <button
      type="button"
      className="research-evidence-toggle"
      aria-pressed={enabled}
      onClick={toggle}
    >
      Evidence mode
      <span>{enabled ? 'on' : 'off'}</span>
    </button>
  )
}
