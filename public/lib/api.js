// Small client helper used by legacy Trickle UI to call our server endpoints
async function fetchJobs() {
  const res = await fetch('/api/jobs')
  if (!res.ok) throw new Error('Failed to fetch jobs')
  return res.json()
}

async function fetchJobApplications(jobId) {
  const res = await fetch(`/api/jobs/${jobId}/applications`)
  if (!res.ok) throw new Error('Failed to fetch applications')
  return res.json() // returns { job, applications }
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

async function createReferral(payload) {
  const res = await fetch('/api/referrals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error('Failed to create referral')
  return res.json()
}

async function advanceApplication(id, stage) {
  const res = await fetch(`/api/applications/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'advance', data: { stage } })
  })
  if (!res.ok) throw new Error('Failed to advance application')
  return res.json()
}

async function addNote(id, note) {
  const res = await fetch(`/api/applications/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'add_note', data: { note } })
  })
  if (!res.ok) throw new Error('Failed to add note')
  return res.json()
}

async function searchCandidates(query) {
  const url = query ? `/api/candidates?q=${encodeURIComponent(query)}` : '/api/candidates'
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to search candidates')
  return res.json()
}

async function getInterviews(date) {
  const url = date ? `/api/interviews?date=${encodeURIComponent(date)}` : '/api/interviews'
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch interviews')
  return res.json()
}

async function scheduleInterview(payload) {
  const res = await fetch('/api/interviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error('Failed to schedule interview')
  return res.json()
}

async function getSettings() {
  const res = await fetch('/api/settings')
  if (!res.ok) throw new Error('Failed to fetch settings')
  return res.json()
}

async function saveSettings(payload) {
  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error('Failed to save settings')
  return res.json()
}

async function getBooking(token) {
  const res = await fetch(`/api/booking?token=${encodeURIComponent(token)}`)
  if (!res.ok) throw new Error('Failed to fetch booking')
  return res.json()
}

async function confirmBooking(token, slotId) {
  const res = await fetch('/api/booking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, slotId })
  })
  if (!res.ok) throw new Error('Failed to confirm booking')
  return res.json()
}

async function createInvitation(payload) {
  const res = await fetch('/api/invitations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error('Failed to create invitation')
  return res.json()
}

async function getTeam() {
  const res = await fetch('/api/team')
  if (!res.ok) throw new Error('Failed to fetch team')
  return res.json()
}

async function inviteMember(email, role) {
  const res = await fetch('/api/team', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'invite', email, role })
  })
  if (!res.ok) throw new Error('Failed to send invite')
  return res.json()
}

async function changeMemberRole(userId, role) {
  const res = await fetch('/api/team', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'change_role', userId, role })
  })
  if (!res.ok) throw new Error('Failed to change role')
  return res.json()
}

async function removeMember(userId) {
  const res = await fetch('/api/team', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  })
  if (!res.ok) throw new Error('Failed to remove member')
  return res.json()
}

const api = {
  fetchJobs, fetchJobApplications, fetchApplication, updateApplicationStatus,
  fetchReferrals, createJob, uploadImport,
  createReferral, advanceApplication, addNote,
  searchCandidates, getInterviews, scheduleInterview,
  getSettings, saveSettings, getBooking, confirmBooking, createInvitation,
  getTeam, inviteMember, changeMemberRole, removeMember,
}

window.api = api
