const SUPABASE_SUFFIX_PATTERN = /\/(?:rest|auth)\/v1\/?$/i

export function normalizeSupabaseUrl(rawUrl: string | undefined): string {
  if (!rawUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL')
  }

  const trimmed = rawUrl.trim().replace(/\/+$/, '')
  return trimmed.replace(SUPABASE_SUFFIX_PATTERN, '')
}
