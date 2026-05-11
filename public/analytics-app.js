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

function AnalyticsDashboard() {
    const chartRef1 = React.useRef(null);
    const chartRef2 = React.useRef(null);
    const [referralCount, setReferralCount] = React.useState(null);
    const [loadError, setLoadError] = React.useState(null);

    React.useEffect(() => {
        let chart1, chart2;

        async function loadAndRender() {
            let jobs = [];
            let referrals = [];
            try {
                if (window.api) {
                    [jobs, referrals] = await Promise.all([
                        window.api.fetchJobs().catch(() => []),
                        window.api.fetchReferrals().catch(() => []),
                    ]);
                    setReferralCount(referrals.length);
                }
            } catch (err) {
                console.error('Analytics load error:', err);
                setLoadError(err?.message || String(err));
            }

            const barLabels = jobs.length > 0 ? jobs.map(j => j.title) : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
            const barData = jobs.length > 0 ? jobs.map(j => j.applicantsCount) : [120, 190, 150, 220, 310, 280];
            const top = jobs.reduce((s, j) => s + (j.stats?.top || 0), 0) || 15;
            const strong = jobs.reduce((s, j) => s + (j.stats?.strong || 0), 0) || 30;
            const review = jobs.reduce((s, j) => s + (j.stats?.review || 0), 0) || 25;
            const rejected = jobs.reduce((s, j) => s + (j.stats?.rejected || 0), 0) || 30;

            try {
                if (chartRef1.current) {
                    chart1 = new ChartJS(chartRef1.current, {
                        type: 'bar',
                        data: {
                            labels: barLabels,
                            datasets: [{ label: 'Applications', data: barData, backgroundColor: '#10b981', borderRadius: 4 }]
                        },
                        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
                    });
                }
                if (chartRef2.current) {
                    chart2 = new ChartJS(chartRef2.current, {
                        type: 'doughnut',
                        data: {
                            labels: ['Top Tier', 'Strong Match', 'Review', 'Auto-Reject'],
                            datasets: [{ data: [top, strong, review, rejected], backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#71717a'], borderWidth: 0 }]
                        },
                        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
                    });
                }
            } catch (err) {
                console.error(err);
            }
        }

        loadAndRender();
        return () => {
            if (chart1) chart1.destroy();
            if (chart2) chart2.destroy();
        };
    }, []);

    return (
        <PageShell>
            <div className="flex-1 overflow-auto p-8" data-name="analytics">
                <div className="max-w-6xl mx-auto">
                    <div className="mb-8">
                        <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight mb-1">Analytics Dashboard</h1>
                        <p className="text-zinc-400 text-sm">Review key metrics on hiring pipeline and AI triage efficiency.</p>
                        {loadError && <p className="text-red-400 text-xs mt-2">Some data failed to load: {loadError}</p>}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                        <div className="card p-6">
                            <div className="text-zinc-400 text-sm mb-2">Time to Hire (Avg)</div>
                            <div className="text-3xl font-light text-zinc-100">18 days</div>
                            <div className="text-emerald-500 text-xs mt-2 flex items-center gap-1">
                                <div className="icon-arrow-down text-[10px]"></div> 12% vs last month
                            </div>
                        </div>
                        <div className="card p-6">
                            <div className="text-zinc-400 text-sm mb-2">AI Triage Accuracy</div>
                            <div className="text-3xl font-light text-zinc-100">94.2%</div>
                            <div className="text-emerald-500 text-xs mt-2 flex items-center gap-1">
                                <div className="icon-arrow-up text-[10px]"></div> 2% vs last month
                            </div>
                        </div>
                        <div className="card p-6">
                            <div className="text-zinc-400 text-sm mb-2">Successful Referrals</div>
                            <div className="text-3xl font-light text-zinc-100">{referralCount !== null ? referralCount : '—'}</div>
                            <div className="text-zinc-500 text-xs mt-2">From your team's pipeline</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="card p-6 h-[400px] flex flex-col">
                            <h3 className="text-lg font-medium text-zinc-100 mb-6">Application Volume</h3>
                            <div className="flex-1 relative">
                                <canvas ref={chartRef1}></canvas>
                            </div>
                        </div>
                        <div className="card p-6 h-[400px] flex flex-col">
                            <h3 className="text-lg font-medium text-zinc-100 mb-6">Candidate Distribution</h3>
                            <div className="flex-1 relative">
                                <canvas ref={chartRef2}></canvas>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </PageShell>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ErrorBoundary><AnalyticsDashboard /></ErrorBoundary>);