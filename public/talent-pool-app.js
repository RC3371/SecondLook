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

function TalentPool() {
    return (
        <PageShell>
            <div className="flex flex-col h-full" data-name="talent-pool">
                <div className="px-8 py-6 border-b border-zinc-900 shrink-0">
                    <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight mb-1">Talent Pool</h1>
                    <p className="text-zinc-400 text-sm mb-6">Search and filter across all historical candidates in your database.</p>
                    
                    <div className="flex gap-4">
                        <div className="flex-1 relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <div className="icon-search text-zinc-500"></div>
                            </div>
                            <input 
                                type="text" 
                                className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg pl-10 pr-4 py-2 text-zinc-100 focus:outline-none focus:border-zinc-600 transition-colors text-sm"
                                placeholder="Search by name, skills, past roles, or AI semantic search (e.g. 'Frontend devs with fintech experience')..."
                            />
                        </div>
                        <button className="btn-secondary flex items-center gap-2">
                            <div className="icon-list-filter text-sm"></div>
                            Filters
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto p-8">
                    <div className="rounded-xl border border-zinc-900 bg-zinc-950/50 overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-zinc-900/50 text-zinc-400 border-b border-zinc-900">
                                <tr>
                                    <th className="px-4 py-3 font-medium">Candidate</th>
                                    <th className="px-4 py-3 font-medium">Applied Role (Original)</th>
                                    <th className="px-4 py-3 font-medium">Top Skills</th>
                                    <th className="px-4 py-3 font-medium">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-900/50">
                                {MOCK_APPLICATIONS.map(app => (
                                    <tr key={app.id} className="hover:bg-zinc-900/30 transition-colors">
                                        <td className="px-4 py-3">
                                            <a href={`applicant.html?id=${app.id}`} className="font-medium text-emerald-400 hover:underline">{app.candidate.name}</a>
                                            <div className="text-xs text-zinc-500 mt-0.5">{app.candidate.currentRole}</div>
                                        </td>
                                        <td className="px-4 py-3 text-zinc-300">
                                            {MOCK_JOBS.find(j => j.id === app.jobId)?.title || "Unknown Role"}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex gap-1.5 flex-wrap">
                                                {app.insights.map((insight, i) => (
                                                    <span key={i} className="px-1.5 py-0.5 bg-zinc-900 text-zinc-400 border border-zinc-800 rounded text-[10px] font-medium">
                                                        {insight}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="px-2 py-0.5 rounded text-[10px] font-medium border bg-zinc-800 border-zinc-700 text-zinc-300 uppercase">
                                                Archived
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </PageShell>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ErrorBoundary><TalentPool /></ErrorBoundary>);