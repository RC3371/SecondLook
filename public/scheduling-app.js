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
    const [interviews, setInterviews] = React.useState(null); // null = not yet loaded
    const [newEvent, setNewEvent] = React.useState({ applicationId: '', date: '2026-05-10', time: '14:00', interviewType: 'Recruiter Screen (30m)' });

    const loadInterviews = React.useCallback(async (day) => {
        const dateStr = `2026-05-${String(day).padStart(2, '0')}`;
        try {
            const data = await window.api.getInterviews(dateStr);
            setInterviews(data);
        } catch (err) {
            console.error('Failed to load interviews:', err);
            setInterviews(null);
        }
    }, []);

    React.useEffect(() => { loadInterviews(selectedDate); }, [selectedDate]);

    const handleSync = () => {
        setSynced(true);
        if (window.showToast) window.showToast('Calendar successfully synced!', 'success');
    };

    const handleCreateEvent = async () => {
        try {
            await window.api.scheduleInterview({
                applicationId: newEvent.applicationId,
                date: newEvent.date,
                time: newEvent.time,
                interviewType: newEvent.interviewType,
            });
            setShowNewEventModal(false);
            if (window.showToast) window.showToast('Interview scheduled successfully.', 'success');
            loadInterviews(selectedDate);
        } catch (err) {
            if (window.showToast) window.showToast('Failed to schedule interview.', 'error');
        }
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
                                <label className="block text-sm font-medium text-zinc-400 mb-1.5">Application ID</label>
                                <input
                                    type="text"
                                    value={newEvent.applicationId}
                                    onChange={e => setNewEvent(p => ({ ...p, applicationId: e.target.value }))}
                                    placeholder="e.g. app-1"
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-100 text-sm focus:outline-none"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-1.5">Date</label>
                                    <input
                                        type="date"
                                        value={newEvent.date}
                                        onChange={e => setNewEvent(p => ({ ...p, date: e.target.value }))}
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-100 text-sm focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-1.5">Time</label>
                                    <input
                                        type="time"
                                        value={newEvent.time}
                                        onChange={e => setNewEvent(p => ({ ...p, time: e.target.value }))}
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-100 text-sm focus:outline-none"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-zinc-400 mb-1.5">Interview Type</label>
                                <select
                                    value={newEvent.interviewType}
                                    onChange={e => setNewEvent(p => ({ ...p, interviewType: e.target.value }))}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-100 text-sm focus:outline-none"
                                >
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
                                const hasInterviews = interviews && interviews.some(iv => new Date(iv.scheduled_at).getDate() === day);
                                
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

                        {interviews === null || interviews.length === 0 ? (
                            <div className="text-center py-16 border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/20">
                                <div className="icon-calendar-off text-4xl text-zinc-600 mb-4 mx-auto"></div>
                                <h3 className="text-zinc-300 font-medium mb-1">No Interviews Scheduled</h3>
                                <p className="text-zinc-500 text-sm">You have a clear calendar for this day.</p>
                            </div>
                        ) : (
                            <div className="space-y-4 animate-in fade-in duration-300">
                                {interviews.map((iv, i) => {
                                    const dt = new Date(iv.scheduled_at);
                                    const timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                    const candidateName = iv.applications?.candidates?.name || 'Candidate';
                                    const jobTitle = iv.applications?.job_postings?.title || '';
                                    const colors = ['border-l-blue-500', 'border-l-purple-500', 'border-l-emerald-500', 'border-l-amber-500'];
                                    return (
                                        <div key={iv.id || i} className={`card p-5 flex items-stretch gap-6 border-l-4 ${colors[i % colors.length]}`}>
                                            <div className="text-center w-24 shrink-0 flex flex-col justify-center border-r border-zinc-800 pr-6">
                                                <div className="text-zinc-100 font-medium text-lg">{timeStr}</div>
                                                <div className="text-zinc-500 text-xs">{iv.interview_type}</div>
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="text-lg font-medium text-zinc-100 mb-1">{candidateName}</h3>
                                                <div className="text-sm text-zinc-400 mb-3 flex items-center gap-2">
                                                    <div className="icon-briefcase text-xs"></div>
                                                    {jobTitle}
                                                </div>
                                                <div className="flex gap-2">
                                                    {iv.application_id && (
                                                        <a href={`applicant.html?id=${iv.application_id}`} className="btn-secondary text-xs py-1.5 px-3">View Profile</a>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
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