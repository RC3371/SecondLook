
function TriageView() {
    const [selectedAppId, setSelectedAppId] = React.useState(null);
    const urlParams = new URLSearchParams(window.location.search);
    const job = { id: urlParams.get('jobId') || '', title: 'Job' };
    const [applications, setApplications] = React.useState([]);
    const [appsLoading, setAppsLoading] = React.useState(false);

    const getTierColor = (tier) => {
        switch(tier) {
            case 'top': return 'text-emerald-500 border-emerald-500/20 bg-emerald-500/10';
            case 'strong': return 'text-blue-500 border-blue-500/20 bg-blue-500/10';
            case 'review': return 'text-amber-500 border-amber-500/20 bg-amber-500/10';
            default: return 'text-zinc-400 border-zinc-700 bg-zinc-800/50';
        }
    };

    const getTierValue = (tier) => {
        switch(tier) {
            case 'top': return 4;
            case 'strong': return 3;
            case 'review': return 2;
            default: return 1;
        }
    };

    const [scheduleApp, setScheduleApp] = React.useState(null);

    React.useEffect(() => {
        const handler = (e) => setScheduleApp(e.detail);
        window.addEventListener('open-schedule', handler);
        return () => window.removeEventListener('open-schedule', handler);
    }, []);

    const sortedApplications = [...applications].sort((a, b) => {
        // Automatically sort by AI Tier first, then Match Score
        return getTierValue(b.aiTier) - getTierValue(a.aiTier) || b.matchScore - a.matchScore;
    });

    const handleScheduleConfirm = (mode) => {
        const msg = mode === 'link' ? 'Booking link sent to ' + scheduleApp.candidate.name : 'Proposed times sent to ' + scheduleApp.candidate.name;
        if (window.showToast) window.showToast(msg, 'success');
        setScheduleApp(null);
    };
    
    // Add effect to simulate advance from Drawer passing to Schedule
    React.useEffect(() => {
        const handleAdvance = (e) => {
            const app = e.detail;
            if (window.showToast) window.showToast(`${app.candidate.name} advanced. Please schedule the interview.`, 'success');
            setScheduleApp(app);
            setSelectedAppId(null); // close drawer
        };
        window.addEventListener('advance-schedule', handleAdvance);
        return () => window.removeEventListener('advance-schedule', handleAdvance);
    }, []);

    React.useEffect(() => {
        // try to fetch real applications, fall back to mocks
        async function load() {
            if (window.api && job && job.id) {
                try {
                    setAppsLoading(true)
                    const apps = await window.api.fetchJobApplications(job.id)
                    setApplications(apps)
                } catch (err) {
                    console.error('Failed to load applications, using mock:', err)
                } finally { setAppsLoading(false) }
            }
        }
        load()
    }, [job && job.id])

    return (
        <PageShell>
            {scheduleApp && (
                <ScheduleModal 
                    application={scheduleApp} 
                    onClose={() => setScheduleApp(null)} 
                    onConfirm={handleScheduleConfirm} 
                />
            )}
            <div className="flex h-full w-full" data-name="triage-main">
                {/* Main Table Area */}
                <div className="flex-1 flex flex-col h-full overflow-hidden relative">
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-zinc-900 shrink-0">
                        <div className="flex items-center gap-2 text-sm text-zinc-500 mb-2">
                            <a href="index.html" className="hover:text-zinc-300">Jobs</a>
                            <div className="icon-chevron-right text-xs"></div>
                            <span className="text-zinc-300">{job.title}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <h1 className="text-xl font-semibold text-zinc-100">{job.title} Applicants</h1>
                            <div className="flex gap-4 items-center">
                                <div className="flex gap-2">
                                    <span className="px-2 py-1 rounded text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">Top: {job.stats.top}</span>
                                    <span className="px-2 py-1 rounded text-xs font-medium bg-blue-500/10 text-blue-500 border border-blue-500/20">Strong: {job.stats.strong}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="flex-1 overflow-auto p-6">
                        <div className="rounded-xl border border-zinc-900 bg-zinc-950/50 overflow-hidden">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-zinc-900/50 text-zinc-400 border-b border-zinc-900">
                                    <tr>
                                        <th className="px-4 py-3 font-medium">Candidate</th>
                                        <th className="px-4 py-3 font-medium">AI Tier</th>
                                        <th className="px-4 py-3 font-medium">Match Score</th>
                                        <th className="px-4 py-3 font-medium">Insights</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-900/50">
                                    {sortedApplications.map(app => (
                                        <tr 
                                            key={app.id} 
                                            onClick={() => setSelectedAppId(app.id)}
                                            className={`hover:bg-zinc-900/30 cursor-pointer transition-colors ${selectedAppId === app.id ? 'bg-zinc-900/50' : ''} ${app.hasPreferredQualifications ? 'bg-amber-500/5 border-l-2 border-amber-500' : ''}`}
                                        >
                                            <td className="px-4 py-3 pl-3">
                                                <div className="flex items-center gap-2">
                                                    <a href={`applicant.html?id=${app.id}`} onClick={e => e.stopPropagation()} className="font-medium text-emerald-400 hover:underline">{app.candidate.name}</a>
                                                    {app.status === 'new' && (
                                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/10 text-red-500 border border-red-500/20 uppercase tracking-wider">New</span>
                                                    )}
                                                    {app.hasPreferredQualifications && (
                                                        <div className="group relative flex items-center">
                                                            <div className="icon-star text-amber-500 text-sm drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]"></div>
                                                            <div className="absolute left-full ml-2 px-2 py-1 bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                                                                Preferred: {app.preferredNote}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="text-xs text-zinc-500 mt-0.5">{app.candidate.currentRole}</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-0.5 rounded text-xs font-medium border uppercase tracking-wider ${getTierColor(app.aiTier)}`}>
                                                    {app.aiTier.replace('_', ' ')}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                                        <div className="h-full bg-emerald-500 rounded-full" style={{width: `${app.matchScore}%`}}></div>
                                                    </div>
                                                    <span className="text-xs text-zinc-400 font-medium">{app.matchScore}%</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex gap-1.5 flex-wrap">
                                                    {app.insights.map((insight, i) => (
                                                        <span key={i} className="px-1.5 py-0.5 bg-zinc-900 text-zinc-400 border border-zinc-800 rounded text-[10px] font-medium">
                                                            {insight}
                                                        </span>
                                                    ))}
                                                    {app.hasPreferredQualifications && (
                                                        <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded text-[10px] font-medium flex items-center gap-1">
                                                            <div className="icon-sparkles text-[10px]"></div> Preferred
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Right Drawer */}
                {selectedAppId && (
                    <ApplicantDrawer 
                        application={applications.find(a => a.id === selectedAppId)}
                        onClose={() => setSelectedAppId(null)}
                    />
                )}
            </div>
        </PageShell>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ErrorBoundary><TriageView /></ErrorBoundary>);