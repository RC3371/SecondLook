
function ReferralsInbox() {
    const [referrals, setReferrals] = React.useState([]);
    const [loading, setLoading] = React.useState(false);

    React.useEffect(() => {
        async function load() {
            if (window.api) {
                try {
                    setLoading(true)
                    const data = await window.api.fetchReferrals()
                    if (data && data.length) setReferrals(data)
                } catch (err) {
                    console.error('Failed to fetch referrals, using mock:', err)
                } finally { setLoading(false) }
            }
        }
        load()
    }, [])

    const handleAccept = (id) => {
        setReferrals(referrals.filter(r => r.id !== id));
        if (window.showToast) window.showToast('Candidate accepted to your pipeline.', 'success');
    };

    const handleDecline = (id) => {
        setReferrals(referrals.filter(r => r.id !== id));
        if (window.showToast) window.showToast('Referral declined.', 'success');
    };

    return (
        <PageShell>
            <div className="flex-1 overflow-auto p-8" data-name="referrals-inbox">
                <div className="max-w-4xl mx-auto">
                    <div className="mb-8">
                        <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight mb-1">Incoming Referrals</h1>
                        <p className="text-zinc-400 text-sm">Review candidates matched to your roles from other teams' pipelines.</p>
                    </div>

                    {referrals.length === 0 ? (
                        <div className="text-center py-20 border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/20">
                            <div className="icon-inbox text-4xl text-zinc-600 mb-4 mx-auto"></div>
                            <h3 className="text-zinc-300 font-medium mb-1">Inbox Zero</h3>
                            <p className="text-zinc-500 text-sm">You're all caught up on referrals.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {referrals.map(referral => (
                                <div key={referral.id} className="card p-6 flex gap-6 hover:border-zinc-700 transition-colors">
                                    <div className="flex-1">
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <div className="flex items-center gap-3 mb-1">
                                                    <h3 className="text-lg font-medium text-zinc-100">{referral.candidateName}</h3>
                                                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center gap-1">
                                                        <div className="icon-sparkles text-[10px]"></div> Match
                                                    </span>
                                                </div>
                                                <div className="text-sm text-zinc-400">
                                                    Suggested for <span className="text-zinc-200 font-medium">{referral.targetJob}</span>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-sm text-zinc-500">{referral.timeAgo}</div>
                                                <div className="text-xs text-zinc-500 mt-1 flex items-center justify-end gap-1.5">
                                                    <div className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-medium text-zinc-300">
                                                        {referral.sourceRecruiter.split(' ').map(n => n[0]).join('')}
                                                    </div>
                                                    From {referral.sourceRecruiter}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-zinc-950 rounded-xl p-4 border border-zinc-800/50 mb-4">
                                            <div className="flex items-start gap-4">
                                                <div className="flex-shrink-0 flex flex-col items-center">
                                                    <div className="w-12 h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-1">
                                                        <div className="h-full bg-emerald-500 rounded-full" style={{width: `${referral.matchScore}%`}}></div>
                                                    </div>
                                                    <span className="text-xs text-zinc-400 font-medium">{referral.matchScore}%</span>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-zinc-300 leading-relaxed">"{referral.reasoning}"</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex gap-3">
                                            <button 
                                                onClick={() => handleAccept(referral.id)}
                                                className="btn-primary bg-emerald-500 text-emerald-950 hover:bg-emerald-400 flex items-center gap-2"
                                            >
                                                <div className="icon-check text-sm"></div>
                                                Accept to Pipeline
                                            </button>
                                            <button 
                                                onClick={() => handleDecline(referral.id)}
                                                className="btn-secondary hover:text-red-400 hover:border-red-900/50 flex items-center gap-2"
                                            >
                                                <div className="icon-x text-sm"></div>
                                                Decline
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </PageShell>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ErrorBoundary><ReferralsInbox /></ErrorBoundary>);