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

function Scheduling() {
    const [synced, setSynced] = React.useState(false);
    const [selectedDate, setSelectedDate] = React.useState(10);
    const [showNewEventModal, setShowNewEventModal] = React.useState(false);

    const handleSync = () => {
        setSynced(true);
        if (window.showToast) window.showToast('Calendar successfully synced!', 'success');
    };

    const handleCreateEvent = () => {
        setShowNewEventModal(false);
        if (window.showToast) window.showToast('Interview scheduled successfully.', 'success');
    };

    return (
        <PageShell>
            {showNewEventModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl relative p-6">
                        <button onClick={() => setShowNewEventModal(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300">
                            <div className="icon-x text-lg"></div>
                        </button>
                        <h2 className="text-xl font-semibold text-zinc-100 mb-6">Schedule Interview</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-zinc-400 mb-1.5">Candidate</label>
                                <select className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-100 text-sm focus:outline-none">
                                    <option>Sarah Jenkins (Senior Frontend)</option>
                                    <option>Elena Rodriguez (Senior Frontend)</option>
                                    <option>David Chen (Backend Engineer)</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-1.5">Date</label>
                                    <input type="date" defaultValue={`2026-05-${selectedDate.toString().padStart(2, '0')}`} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-100 text-sm focus:outline-none" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-1.5">Time</label>
                                    <input type="time" defaultValue="14:00" className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-100 text-sm focus:outline-none" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-zinc-400 mb-1.5">Interview Type</label>
                                <select className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-100 text-sm focus:outline-none">
                                    <option>Recruiter Screen (30m)</option>
                                    <option>Technical Assessment (60m)</option>
                                    <option>Hiring Manager (45m)</option>
                                </select>
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button onClick={() => setShowNewEventModal(false)} className="btn-secondary">Cancel</button>
                                <button onClick={handleCreateEvent} className="btn-primary bg-emerald-500 text-emerald-950 hover:bg-emerald-400">Save to Calendar</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex h-full" data-name="scheduling">
                {/* Calendar Sidebar */}
                <div className="w-[350px] border-r border-zinc-900 bg-zinc-950 p-6 flex flex-col">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-semibold text-zinc-100">Calendar</h2>
                    </div>
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 mb-6">
                        <div className="flex justify-between items-center mb-4">
                            <button className="text-zinc-400 hover:text-zinc-100"><div className="icon-chevron-left text-sm"></div></button>
                            <span className="text-sm font-medium text-zinc-200">May 2026</span>
                            <button className="text-zinc-400 hover:text-zinc-100"><div className="icon-chevron-right text-sm"></div></button>
                        </div>
                        <div className="grid grid-cols-7 gap-1 text-center text-xs mb-2 text-zinc-500">
                            <div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div><div>Su</div>
                        </div>
                        <div className="grid grid-cols-7 gap-1 text-center text-sm">
                            {/* Mock days */}
                            {Array.from({length: 31}).map((_, i) => {
                                const day = i + 1;
                                const isSelected = day === selectedDate;
                                const hasInterviews = day === 10 || day === 12;
                                
                                return (
                                    <div 
                                        key={i} 
                                        onClick={() => setSelectedDate(day)}
                                        className={`p-1.5 rounded-md cursor-pointer relative ${isSelected ? 'bg-emerald-500 text-emerald-950 font-bold shadow-md' : 'text-zinc-300 hover:bg-zinc-800'}`}
                                    >
                                        {day}
                                        {hasInterviews && !isSelected && (
                                            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-emerald-500 rounded-full"></div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <button 
                        onClick={handleSync}
                        className={`btn-secondary w-full flex items-center justify-center gap-2 mb-4 transition-colors ${synced ? 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20' : ''}`}
                    >
                        <div className={`icon-${synced ? 'circle-check' : 'calendar-plus'} text-sm`}></div> 
                        {synced ? 'Calendar Synced!' : 'Sync Google Calendar'}
                    </button>
                </div>

                {/* Upcoming Interviews Content */}
                <div className="flex-1 overflow-auto p-8">
                    <div className="max-w-3xl">
                        <div className="flex justify-between items-end mb-8">
                            <div>
                                <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight mb-1">Upcoming Interviews</h1>
                                <p className="text-zinc-400 text-sm">Your schedule for May {selectedDate}, 2026</p>
                            </div>
                            <button onClick={() => setShowNewEventModal(true)} className="btn-primary bg-emerald-500 text-emerald-950 hover:bg-emerald-400 flex items-center gap-2">
                                <div className="icon-plus text-sm"></div> Add Interview
                            </button>
                        </div>

                        {selectedDate !== 10 && selectedDate !== 12 ? (
                            <div className="text-center py-16 border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/20">
                                <div className="icon-calendar-off text-4xl text-zinc-600 mb-4 mx-auto"></div>
                                <h3 className="text-zinc-300 font-medium mb-1">No Interviews Scheduled</h3>
                                <p className="text-zinc-500 text-sm">You have a clear calendar for this day.</p>
                            </div>
                        ) : (
                        <div className="space-y-4 animate-in fade-in duration-300">
                            {/* Mock Interview 1 */}
                            <div className="card p-5 flex items-stretch gap-6 border-l-4 border-l-blue-500">
                                <div className="text-center w-24 shrink-0 flex flex-col justify-center border-r border-zinc-800 pr-6">
                                    <div className="text-zinc-100 font-medium text-lg">10:00</div>
                                    <div className="text-zinc-500 text-xs">AM (45m)</div>
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-lg font-medium text-zinc-100 mb-1">Sarah Jenkins</h3>
                                    <div className="text-sm text-zinc-400 mb-3 flex items-center gap-2">
                                        <div className="icon-briefcase text-xs"></div>
                                        Senior Frontend Engineer • Technical Screen
                                    </div>
                                    <div className="flex gap-2">
                                        <button className="btn-primary bg-zinc-800 text-zinc-100 hover:bg-zinc-700 text-xs py-1.5 px-3">Join Zoom</button>
                                        <a href="applicant.html?id=app-1" className="btn-secondary text-xs py-1.5 px-3">View Profile</a>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Mock Interview 2 */}
                            <div className="card p-5 flex items-stretch gap-6 border-l-4 border-l-purple-500">
                                <div className="text-center w-24 shrink-0 flex flex-col justify-center border-r border-zinc-800 pr-6">
                                    <div className="text-zinc-100 font-medium text-lg">1:30</div>
                                    <div className="text-zinc-500 text-xs">PM (30m)</div>
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-lg font-medium text-zinc-100 mb-1">Elena Rodriguez</h3>
                                    <div className="text-sm text-zinc-400 mb-3 flex items-center gap-2">
                                        <div className="icon-briefcase text-xs"></div>
                                        Senior Frontend Engineer • Culture Fit
                                    </div>
                                    <div className="flex gap-2">
                                        <button className="btn-primary bg-zinc-800 text-zinc-100 hover:bg-zinc-700 text-xs py-1.5 px-3">Join Zoom</button>
                                        <a href="applicant.html?id=app-3" className="btn-secondary text-xs py-1.5 px-3">View Profile</a>
                                    </div>
                                </div>
                            </div>
                        </div>
                        )}
                    </div>
                </div>
            </div>
        </PageShell>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ErrorBoundary><Scheduling /></ErrorBoundary>);