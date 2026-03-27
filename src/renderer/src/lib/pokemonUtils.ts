import pokemon from 'pokemon'

export function getPokemonSpriteUrl(name: string): string | null {
  try {
    const normalized = name.trim().charAt(0).toUpperCase() + name.trim().slice(1).toLowerCase()
    const id = pokemon.getId(normalized)
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`
  } catch {
    return null
  }
}

const ALL_POKEMON: string[] = pokemon.all() as unknown as string[]

export function filterPokemon(query: string, limit = 8): string[] {
  if (!query.trim()) return []
  const q = query.toLowerCase()
  const starts = ALL_POKEMON.filter((n) => n.toLowerCase().startsWith(q))
  const contains = ALL_POKEMON.filter((n) => !n.toLowerCase().startsWith(q) && n.toLowerCase().includes(q))
  return [...starts, ...contains].slice(0, limit)
}
