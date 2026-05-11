import { createClient } from './supabase/server'

export async function getJobs() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('job_postings')
      .select('*, recruiter:profiles!recruiter_id(full_name)')
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      console.error('getJobs error', error)
      return []
    }
    return data ?? []
  } catch (err) {
    console.error('getJobs exception', err)
    return []
  }
}
