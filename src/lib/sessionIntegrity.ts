// src/lib/sessionIntegrity.ts

export function normalizeSessionForFeedback(session: any) {
  if (!session || !session.exercises) return session

  const seen = new Set()

  const normalized = session.exercises
    .filter((ex: any) => ex && ex.name)
    .map((ex: any, i: number) => ({
      ...ex,
      sort_order: i
    }))
    .filter((ex: any) => {
      const key = ex.name + "_" + ex.sort_order
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

  return {
    ...session,
    exercises: normalized
  }
}
