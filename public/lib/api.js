// Small client helper used by legacy Trickle UI to call our server endpoints
async function fetchJobs() {
  const res = await fetch('/api/jobs')
  if (!res.ok) throw new Error('Failed to fetch jobs')
  return res.json()
}

async function fetchJobApplications(jobId) {
  const res = await fetch(`/api/jobs/${jobId}/applications`)
  if (!res.ok) throw new Error('Failed to fetch applications')
  return res.json()
}

async function fetchApplication(id) {
  const res = await fetch(`/api/applications/${id}`)
  if (!res.ok) throw new Error('Failed to fetch application')
  return res.json()
}

async function updateApplicationStatus(id, status) {
  const res = await fetch(`/api/applications/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'update_status', data: { status } })
  })
  if (!res.ok) throw new Error('Failed to update application')
  return res.json()
}

async function fetchReferrals() {
  const res = await fetch('/api/referrals')
  if (!res.ok) throw new Error('Failed to fetch referrals')
  return res.json()
}

async function createJob(payload) {
  const res = await fetch('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error('Failed to create job')
  return res.json()
}

async function uploadImport(formData) {
  const res = await fetch('/api/import', { method: 'POST', body: formData })
  if (!res.ok) throw new Error('Failed to upload import')
  return res.json()
}

const api = { fetchJobs, fetchJobApplications, fetchApplication, updateApplicationStatus, fetchReferrals, createJob, uploadImport }

if (typeof window !== 'undefined') window.api = api

export default api
