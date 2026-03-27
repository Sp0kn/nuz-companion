import { useRef } from 'react'

interface Props {
  onClose: () => void
  children: React.ReactNode
}

/**
 * Modal backdrop that only closes when you click the backdrop itself.
 * Tracks mousedown so text-selection drag that ends outside the dialog
 * does not accidentally close it.
 */
export default function Modal({ onClose, children }: Props) {
  const downTarget = useRef<EventTarget | null>(null)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => { downTarget.current = e.target }}
      onClick={(e) => {
        if (e.target === e.currentTarget && downTarget.current === e.currentTarget) {
          onClose()
        }
      }}
    >
      {children}
    </div>
  )
}
