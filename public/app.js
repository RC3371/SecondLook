class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, errorInfo) { console.error('Error:', error, errorInfo); }
  render() {
    if (this.state.hasError) return <div className="p-8 text-red-500">Something went wrong.</div>;
    return this.props.children;
  }
}

function OpenRoles() {
    const [jobs, setJobs] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState(null);

    React.useEffect(() => {
        async function fetchJobs() {
            try {
                const res = await fetch('/api/jobs')
                if (!res.ok) throw new Error('Failed to fetch jobs')
                const processedJobs = await res.json()
                setJobs(processedJobs)
            } catch (err) {
                const errorMessage = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err))
                console.error('Error fetching jobs:', errorMessage)
                setError(errorMessage)
                setJobs(typeof MOCK_JOBS !== 'undefined' ? MOCK_JOBS : [])
            } finally {
                setLoading(false)
            }
        }

        fetchJobs()
    }, [])

    return (
        <PageShell>
            <div className="flex-1 overflow-auto p-8" data-name="open-roles">
                <div className="max-w-5xl mx-auto">
                    <div className="flex justify-between items-end mb-8">
                        <div>
                            <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight mb-1">Open Roles</h1>
                            <p className="text-zinc-400 text-sm">Review AI-triaged candidates across your active jobs.</p>
                        </div>
                        <a href="new-role.html" className="btn-primary flex items-center gap-2 inline-flex">
                            <div className="icon-plus text-sm"></div>
                            New Role
                        </a>
                    </div>

                    {loading ? (
                        <div className="text-center py-20">
                            <div className="icon-loader text-2xl text-zinc-500 animate-spin mx-auto mb-4"></div>
                            <div className="text-zinc-400">Loading jobs from Supabase...</div>
                        </div>
                    ) : jobs.length === 0 ? (
                        <div className="text-center py-20 border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/20">
                            <div className="icon-briefcase text-4xl text-zinc-600 mb-4 mx-auto"></div>
                            <h3 className="text-zinc-300 font-medium mb-1">No Jobs Found</h3>
                            <p className="text-zinc-500 text-sm mb-4">Create your first job posting to start receiving applicants.</p>
                            <a href="new-role.html" className="btn-secondary inline-flex">Create New Role</a>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {jobs.map(job => (
                                <a key={job.id} href={`triage.html?jobId=${job.id}`} className="card p-5 hover:border-zinc-700 transition-colors group block cursor-pointer">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-medium text-zinc-100 group-hover:text-emerald-400 transition-colors truncate max-w-[160px]" title={job.title}>{job.title}</h3>
                                                {job.newApplicantsCount > 0 && (
                                                    <span className="flex h-2 w-2 relative">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-sm text-zinc-500 mt-0.5">{job.department}</div>
                                        </div>
                                        <div className="flex flex-col gap-1 items-end">
                                            {job.newApplicantsCount > 0 && (
                                                <span className="badge bg-red-500/10 text-red-500 border-red-500/20">
                                                    +{job.newApplicantsCount} New
                                                </span>
                                            )}
                                            {job.referralOpportunities > 0 && (
                                                <span className="badge bg-amber-500/10 text-amber-500 border-amber-500/20 flex items-center gap-1">
                                                    <div className="icon-sparkles text-[10px]"></div>
                                                    {job.referralOpportunities} Referrals
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-end justify-between mt-8">
                                        <div>
                                            <div className="text-3xl font-light text-zinc-100">{job.applicantsCount}</div>
                                            <div className="text-xs text-zinc-500 font-medium uppercase tracking-wider mt-1">Total Apps</div>
                                        </div>
                                        
                                        <div className="flex gap-2 text-xs font-medium">
                                            <div className="flex flex-col items-center">
                                                <span className="text-emerald-500">{job.stats.top}</span>
                                                <span className="text-zinc-600 text-[10px] uppercase">Top</span>
                                            </div>
                                            <div className="flex flex-col items-center">
                                                <span className="text-blue-500">{job.stats.strong}</span>
                                                <span className="text-zinc-600 text-[10px] uppercase">Str</span>
                                            </div>
                                        </div>
                                    </div>
                                </a>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </PageShell>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ErrorBoundary><OpenRoles /></ErrorBoundary>);