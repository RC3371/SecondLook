
function TalentPool() {
    const [candidates, setCandidates] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState(null);
    const [searchQuery, setSearchQuery] = React.useState('');
    const debounceRef = React.useRef(null);

    const load = React.useCallback(async (q) => {
        setLoading(true);
        setError(null);
        try {
            const data = await window.api.searchCandidates(q || '');
            setCandidates(data);
        } catch (err) {
            setError(err?.message || String(err));
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => { load(''); }, []);

    const handleSearch = (e) => {
        const q = e.target.value;
        setSearchQuery(q);
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => load(q), 300);
    };

    const normalize = (item) => ({
        id: item.id,
        jobTitle: item.job_postings?.title || 'Unknown Role',
        candidate: item.candidates || { name: 'Unknown', currentRole: '' },
        status: item.status,
        insights: item.insights || [],
    });

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
                                value={searchQuery}
                                onChange={handleSearch}
                                className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg pl-10 pr-4 py-2 text-zinc-100 focus:outline-none focus:border-zinc-600 transition-colors text-sm"
                                placeholder="Search by name, skills, past roles..."
                            />
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-auto p-8">
                    {error ? (
                        <div className="text-center py-20 border border-dashed border-red-900 rounded-2xl bg-red-500/5">
                            <div className="icon-alert-circle text-4xl text-red-500 mb-4 mx-auto"></div>
                            <h3 className="text-red-400 font-medium mb-1">Failed to load candidates</h3>
                            <p className="text-zinc-500 text-sm">{error}</p>
                        </div>
                    ) : loading ? (
                        <div className="text-center py-20">
                            <div className="icon-loader text-2xl text-zinc-500 animate-spin mx-auto mb-4"></div>
                            <div className="text-zinc-400">Loading candidates...</div>
                        </div>
                    ) : candidates.length === 0 ? (
                        <div className="text-center py-20 border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/20">
                            <div className="icon-users text-4xl text-zinc-600 mb-4 mx-auto"></div>
                            <h3 className="text-zinc-300 font-medium mb-1">No candidates found</h3>
                            <p className="text-zinc-500 text-sm">Try a different search query.</p>
                        </div>
                    ) : (
                        <div className="rounded-xl border border-zinc-900 bg-zinc-950/50 overflow-hidden">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-zinc-900/50 text-zinc-400 border-b border-zinc-900">
                                    <tr>
                                        <th className="px-4 py-3 font-medium">Candidate</th>
                                        <th className="px-4 py-3 font-medium">Applied Role</th>
                                        <th className="px-4 py-3 font-medium">Top Skills</th>
                                        <th className="px-4 py-3 font-medium">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-900/50">
                                    {candidates.map(item => {
                                        const c = normalize(item);
                                        return (
                                            <tr key={c.id} className="hover:bg-zinc-900/30 transition-colors">
                                                <td className="px-4 py-3">
                                                    <a href={`applicant.html?id=${c.id}`} className="font-medium text-emerald-400 hover:underline">{c.candidate.name}</a>
                                                    <div className="text-xs text-zinc-500 mt-0.5">{c.candidate.currentRole || c.candidate.current_role}</div>
                                                </td>
                                                <td className="px-4 py-3 text-zinc-300">{c.jobTitle}</td>
                                                <td className="px-4 py-3">
                                                    <div className="flex gap-1.5 flex-wrap">
                                                        {c.insights.map((insight, i) => (
                                                            <span key={i} className="px-1.5 py-0.5 bg-zinc-900 text-zinc-400 border border-zinc-800 rounded text-[10px] font-medium">
                                                                {insight}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-medium border bg-zinc-800 border-zinc-700 text-zinc-300 uppercase">
                                                        {c.status || 'Archived'}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </PageShell>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ErrorBoundary><TalentPool /></ErrorBoundary>);