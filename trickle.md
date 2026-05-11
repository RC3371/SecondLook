# Second Look - Hackathon Project

## Overview
AI-powered recruiter triage and candidate routing system. Focuses on speed, intelligence, and a dark-mode, clean interface.

## Modules Built
- Open Roles Dashboard (index)
- Triage Workflow (triage)
- Applicant Profile Viewer (applicant)
- Referrals Inbox (referrals)
- New Role Configuration (new-role)
- Talent Pool Search (talent-pool)
- Settings & Preferences (settings)
- Analytics Dashboard (analytics)
- Calendar & Scheduling (scheduling)

## Recent Updates
- **Supabase Integration:** Initialized `lib/supabase.js` and updated the `app.js` (Open Roles) dashboard to pull directly from the real `job_postings` and `applications` tables!
- **Interactive Scheduling:** Added `ScheduleModal` component for quick interview bookings (Send Link / Propose Times) on the Triage Drawer and Applicant Profile.
- **Combined Advance/Schedule Workflow:** Advancing candidates now automatically bridges into the scheduling workflow.
- **Calendar Management:** `scheduling.html` now has an interactive calendar with date selection, event indicators, and a "Add Interview" manual booking flow.
- **Candidate Booking Simulation:** Added `booking.html` to simulate applicant's experience resolving proposed times, including handling edge cases like double-booked slots being auto-blocked.

## Maintenance Rules
- Update this README.md whenever adding new modules or core features.
- Keep the `lib/mock-data.js` aligned with UI needs.