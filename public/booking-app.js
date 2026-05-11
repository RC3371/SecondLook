
function CandidateBooking() {
    const [status, setStatus] = React.useState('selecting'); // 'selecting', 'error', 'success', 'loading'
    const [selectedTime, setSelectedTime] = React.useState(null);
    const [bookingToken, setBookingToken] = React.useState(null);
    const [recruiterName, setRecruiterName] = React.useState('Jane Doe');
    const [interviewLabel, setInterviewLabel] = React.useState('Recruiter Screen • 30 mins');

    // Demo fallback times shown when there's no real booking token
    const demoTimes = [
        { id: 1, date: 'Monday, May 11', time: '10:00 AM PST', available: true },
        { id: 2, date: 'Tuesday, May 12', time: '2:30 PM PST', available: false },
        { id: 3, date: 'Wednesday, May 13', time: '11:00 AM PST', available: true }
    ];
    const [proposedTimes, setProposedTimes] = React.useState(demoTimes);

    React.useEffect(() => {
        const token = new URLSearchParams(window.location.search).get('token');
        if (!token) return;
        setBookingToken(token);
        setStatus('loading');
        window.api?.getBooking(token).then(data => {
            if (data?.proposed_slots) {
                setProposedTimes(data.proposed_slots.map((s, i) => ({ id: i + 1, ...s })));
            }
            if (data?.applications?.candidates?.name) setRecruiterName(data.applications.candidates.name);
            setStatus('selecting');
        }).catch(() => {
            setStatus('error');
        });
    }, []);

    const handleConfirm = async () => {
        if (!selectedTime) return;
        const timeObj = proposedTimes.find(t => t.id === selectedTime);
        if (!timeObj?.available) { setStatus('error'); return; }

        if (bookingToken) {
            try {
                await window.api.confirmBooking(bookingToken, selectedTime);
                setStatus('success');
            } catch {
                setStatus('error');
            }
        } else {
            setStatus('success');
        }
    };

    return (
        <div className="w-full max-w-xl mx-auto p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl p-8">
                <div className="flex items-center gap-3 mb-8 pb-6 border-b border-zinc-800">
                    <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
                        <div className="icon-calendar text-blue-500 text-xl"></div>
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold text-zinc-100">{recruiterName}</h1>
                        <p className="text-zinc-400 text-sm">{interviewLabel}</p>
                    </div>
                </div>

                {status === 'loading' && (
                    <div className="text-center py-12">
                        <div className="icon-loader text-2xl text-zinc-500 animate-spin mx-auto mb-4"></div>
                        <div className="text-zinc-400 text-sm">Loading your available times...</div>
                    </div>
                )}

                {status === 'selecting' && (
                    <div className="animate-in fade-in slide-in-from-bottom-4">
                        <h2 className="text-lg font-medium text-zinc-100 mb-2">Select a time</h2>
                        <p className="text-zinc-400 text-sm mb-6">Jane has proposed the following times. Please select one that works for you.</p>

                        <div className="space-y-3 mb-8">
                            {proposedTimes.map(pt => (
                                <div 
                                    key={pt.id}
                                    onClick={() => setSelectedTime(pt.id)}
                                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                                        selectedTime === pt.id 
                                        ? 'border-blue-500 bg-blue-500/10' 
                                        : 'border-zinc-800 bg-zinc-950 hover:border-zinc-600'
                                    }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${selectedTime === pt.id ? 'border-blue-500 bg-blue-500' : 'border-zinc-600'}`}>
                                                {selectedTime === pt.id && <div className="icon-check text-white text-xs"></div>}
                                            </div>
                                            <div>
                                                <div className="font-medium text-zinc-100">{pt.date}</div>
                                                <div className="text-sm text-zinc-400">{pt.time}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button 
                            onClick={handleConfirm}
                            disabled={!selectedTime}
                            className={`w-full py-3 rounded-xl font-medium text-sm transition-all ${
                                selectedTime ? 'bg-zinc-100 text-zinc-900 hover:bg-white' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                            }`}
                        >
                            Confirm Interview
                        </button>
                    </div>
                )}

                {status === 'error' && (
                    <div className="text-center py-8 animate-in zoom-in-95">
                        <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4 border border-red-500/30">
                            <div className="icon-calendar-x text-red-500 text-2xl"></div>
                        </div>
                        <h2 className="text-xl font-semibold text-zinc-100 mb-2">Time No Longer Available</h2>
                        <p className="text-zinc-400 text-sm mb-8">Another candidate has just booked this time slot, or the recruiter's calendar has been updated.</p>
                        <button 
                            onClick={() => { setStatus('selecting'); setSelectedTime(null); }}
                            className="bg-zinc-100 text-zinc-900 px-6 py-2.5 rounded-lg font-medium text-sm hover:bg-white transition-colors"
                        >
                            Select Another Time
                        </button>
                    </div>
                )}

                {status === 'success' && (
                    <div className="text-center py-8 animate-in zoom-in-95">
                        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
                            <div className="icon-check text-emerald-500 text-2xl"></div>
                        </div>
                        <h2 className="text-xl font-semibold text-zinc-100 mb-2">Interview Scheduled!</h2>
                        <p className="text-zinc-400 text-sm mb-2">A calendar invitation with Google Meet details has been sent to your email.</p>
                        <div className="inline-block mt-4 p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-left w-full max-w-sm">
                            <div className="text-zinc-400 text-xs uppercase tracking-wider mb-1">When</div>
                            <div className="text-zinc-100 font-medium mb-3">{proposedTimes.find(t => t.id === selectedTime)?.date} at {proposedTimes.find(t => t.id === selectedTime)?.time}</div>
                            
                            <div className="text-zinc-400 text-xs uppercase tracking-wider mb-1">Where</div>
                            <div className="text-blue-400 font-medium flex items-center gap-2">
                                <div className="icon-video text-sm"></div> Google Meet
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ErrorBoundary><CandidateBooking /></ErrorBoundary>);