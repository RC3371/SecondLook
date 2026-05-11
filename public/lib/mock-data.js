const MOCK_JOBS = [
    {
        id: "job-1",
        title: "Senior Frontend Engineer",
        department: "Engineering",
        applicantsCount: 142,
        newApplicantsCount: 12,
        stats: { top: 12, strong: 34, review: 45, rejected: 51 },
        referralOpportunities: 3
    },
    {
        id: "job-2",
        title: "Product Designer",
        department: "Design",
        applicantsCount: 89,
        newApplicantsCount: 0,
        stats: { top: 5, strong: 15, review: 20, rejected: 49 },
        referralOpportunities: 1
    }
];

const MOCK_REFERRALS = [
    {
        id: "ref-1",
        candidateName: "David Chen",
        targetJob: "Backend Engineer (Python)",
        sourceRecruiter: "Jane Doe",
        sourceTeam: "Frontend Engineering",
        matchScore: 88,
        reasoning: "David applied for Frontend, but his strong Python background and startup experience matches the new Data Platform team requirements perfectly.",
        status: "pending",
        timeAgo: "2 hours ago"
    },
    {
        id: "ref-2",
        candidateName: "Alex Rivera",
        targetJob: "Product Manager",
        sourceRecruiter: "Mark Smith",
        sourceTeam: "Design",
        matchScore: 92,
        reasoning: "Alex applied for Product Designer but has extensive experience managing roadmaps and engineering teams. Would be great for the Core PM role.",
        status: "pending",
        timeAgo: "1 day ago"
    }
];

const MOCK_APPLICATIONS = [
    {
        id: "app-1",
        jobId: "job-1",
        candidate: { 
            name: "Sarah Jenkins", 
            currentRole: "Senior UI Engineer @ Vercel", 
            experience: "6 yrs",
            email: "sarah.j@example.com",
            phone: "+1 (555) 019-2834",
            location: "San Francisco, CA"
        },
        status: "new",
        aiTier: "top",
        matchScore: 94,
        insights: ["React Expert", "Next.js Core", "Leadership"],
        aiSummary: "Sarah has deep experience with Next.js and frontend infrastructure. Her tenure at Vercel directly aligns with our current architecture needs.",
        referralMatch: null,
        hasPreferredQualifications: true,
        preferredNote: "Matches all nice-to-have skills (GraphQL, Node.js)"
    },
    {
        id: "app-2",
        jobId: "job-1",
        candidate: { 
            name: "David Chen", 
            currentRole: "Fullstack Dev @ Startup", 
            experience: "3 yrs",
            email: "david.c@example.com",
            phone: "+1 (555) 123-4567",
            location: "Austin, TX"
        },
        status: "new",
        aiTier: "auto_reject",
        matchScore: 45,
        insights: ["No React Exp", "Python Heavy", "Short Tenure"],
        aiSummary: "David is a strong backend developer but lacks the core frontend frameworks (React/Next.js) required for this specific role.",
        referralMatch: {
            jobId: "job-backend",
            jobTitle: "Backend Engineer (Python)",
            matchScore: 88,
            reasoning: "Strong Python background and startup experience matches the new Data Platform team requirements."
        }
    },
    {
        id: "app-3",
        jobId: "job-1",
        candidate: { 
            name: "Elena Rodriguez", 
            currentRole: "Frontend Lead @ Acme Corp", 
            experience: "8 yrs",
            email: "elena.r@example.com",
            phone: "+1 (555) 987-6543",
            location: "New York, NY"
        },
        status: "new",
        aiTier: "strong",
        matchScore: 82,
        insights: ["Vue Heavy", "Management Exp", "System Design"],
        aiSummary: "Strong technical leader. While primarily Vue-focused historically, her system design skills are exceptional.",
        referralMatch: null
    }
];
