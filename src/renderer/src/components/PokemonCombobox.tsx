import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { filterPokemon, getPokemonSpriteUrl } from '../lib/pokemonUtils'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
}

export default function PokemonCombobox({ value, onChange, placeholder, className, autoFocus, onKeyDown }: Props) {
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Only open the dropdown after the user has actually typed — not on autoFocus or pre-filled values
  const userTypedRef = useRef(false)

  const suggestions = filterPokemon(value)

  useEffect(() => {
    if (!userTypedRef.current) return
    setHighlighted(0)
    setOpen(suggestions.length > 0)
  }, [value])

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  const select = (name: string) => {
    onChange(name)
    setOpen(false)
    userTypedRef.current = false
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlighted((h) => Math.min(h + 1, suggestions.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlighted((h) => Math.max(h - 1, 0))
        return
      }
      if (e.key === 'Enter' && suggestions[highlighted]) {
        e.preventDefault()
        select(suggestions[highlighted])
        return
      }
      if (e.key === 'Escape') {
        setOpen(false)
        return
      }
    }
    onKeyDown?.(e)
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => { userTypedRef.current = true; onChange(e.target.value) }}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (userTypedRef.current && suggestions.length > 0) setOpen(true) }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={className}
        autoComplete="off"
      />
      {open && (
        <ul className="absolute z-50 left-0 right-0 top-full mt-1 bg-surface border border-border rounded-lg shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
          {suggestions.map((name, i) => {
            const sprite = getPokemonSpriteUrl(name)
            return (
              <li
                key={name}
                onPointerDown={(e) => { e.preventDefault(); select(name) }}
                className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${
                  i === highlighted ? 'bg-surface-2' : 'hover:bg-surface-2'
                }`}
              >
                {sprite ? (
                  <img
                    src={sprite}
                    alt={name}
                    className="w-7 h-7 object-contain shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <span className="w-7 h-7 shrink-0" />
                )}
                <span className="text-sm text-text">{name}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
