function ScheduleModal({ application, onClose, onConfirm }) {
    const [mode, setMode] = React.useState('propose'); // 'link' or 'propose'
    const [proposedTimes, setProposedTimes] = React.useState([]);
    const [newDate, setNewDate] = React.useState('2026-05-13');
    const [newTime, setNewTime] = React.useState('11:00');
    const [isSending, setIsSending] = React.useState(false);
    const [bookingUrl, setBookingUrl] = React.useState(null);

    const handleAddCustomTime = () => {
        if (!newDate || !newTime) return;
        setProposedTimes([...proposedTimes, { id: Date.now(), date: newDate, time: newTime }]);
    };

    const handleRemoveTime = (id) => {
        setProposedTimes(proposedTimes.filter(t => t.id !== id));
    };

    const handleSendInvites = async () => {
        if (proposedTimes.length === 0) return;
        setIsSending(true);
        try {
            const result = await window.api.createInvitation({
                applicationId: application?.id,
                proposedSlots: proposedTimes.map(({ date, time }) => ({ date, time })),
            });
            setBookingUrl(window.location.origin + result.bookingUrl);
        } catch (err) {
            console.error('Failed to create invitation:', err);
            if (window.showToast) window.showToast('Failed to create invitation.', 'error');
        } finally {
            setIsSending(false);
        }
    };

    const handleCopyLink = () => {
        navigator.clipboard.writeText(bookingUrl);
        if (window.showToast) window.showToast('Booking link copied!', 'success');
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" data-name="schedule-modal">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-5xl overflow-hidden shadow-2xl relative flex h-[650px]">
                
                {/* Left Pane - Mock Google Calendar View */}
                <div className="w-[55%] bg-zinc-950 border-r border-zinc-800 flex flex-col">
                    <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
                        <h3 className="text-zinc-100 font-medium flex items-center gap-2">
                            <div className="icon-calendar text-blue-500"></div> My Calendar
                        </h3>
                        <div className="flex gap-2">
                            <button className="p-1 text-zinc-400 hover:text-zinc-200"><div className="icon-chevron-left text-sm"></div></button>
                            <span className="text-sm font-medium text-zinc-300">May 10 - 14, 2026</span>
                            <button className="p-1 text-zinc-400 hover:text-zinc-200"><div className="icon-chevron-right text-sm"></div></button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4">
                        <div className="grid grid-cols-6 gap-2 h-full min-h-[500px]">
                            {/* Time column */}
                            <div className="col-span-1 flex flex-col gap-6 text-xs text-zinc-500 text-right pr-2 pt-8">
                                <div>9 AM</div>
                                <div>10 AM</div>
                                <div>11 AM</div>
                                <div>12 PM</div>
                                <div>1 PM</div>
                                <div>2 PM</div>
                                <div>3 PM</div>
                                <div>4 PM</div>
                                <div>5 PM</div>
                            </div>
                            {/* Day columns */}
                            {['Mon 10', 'Tue 11', 'Wed 12', 'Thu 13', 'Fri 14'].map((day, idx) => (
                                <div key={day} className="col-span-1 relative border-l border-zinc-800/50">
                                    <div className="text-center text-xs font-medium text-zinc-400 pb-2">{day}</div>
                                    <div className="absolute inset-0 top-8 flex flex-col">
                                        {/* Mock events */}
                                        {idx === 0 && <div className="absolute top-[60px] left-1 right-1 h-[40px] bg-zinc-800/80 rounded border border-zinc-700 text-[10px] p-1 text-zinc-300">Team Sync</div>}
                                        {idx === 1 && <div className="absolute top-[20px] left-1 right-1 h-[60px] bg-blue-500/20 rounded border border-blue-500/40 text-[10px] p-1 text-blue-300">Interview</div>}
                                        {idx === 2 && <div className="absolute top-[140px] left-1 right-1 h-[30px] bg-zinc-800/80 rounded border border-zinc-700 text-[10px] p-1 text-zinc-300">1:1</div>}
                                        {idx === 3 && <div className="absolute top-[180px] left-1 right-1 h-[60px] bg-purple-500/20 rounded border border-purple-500/40 text-[10px] p-1 text-purple-300">Focus Block</div>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Pane - Scheduling Form */}
                <div className="w-[45%] p-6 flex flex-col relative">
                    <button onClick={onClose} className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300">
                        <div className="icon-x text-lg"></div>
                    </button>
                    
                    <h2 className="text-xl font-semibold text-blue-400 mb-2 mt-2">Schedule Interview</h2>
                    <p className="text-zinc-400 text-sm mb-4">Book time with {application ? application.candidate.name : 'Candidate'}.</p>
                    
                    <div className="flex gap-2 mb-4 p-1 bg-zinc-950 rounded-lg border border-zinc-800 shrink-0">
                        <button onClick={() => setMode('link')} className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${mode === 'link' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}>Send Link</button>
                        <button onClick={() => setMode('propose')} className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${mode === 'propose' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}>Propose Times</button>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-2 pb-20">
                        {bookingUrl ? (
                            <div className="flex flex-col items-center justify-center h-full text-center py-8 animate-in fade-in">
                                <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
                                    <div className="icon-check text-emerald-500 text-2xl"></div>
                                </div>
                                <h3 className="text-lg font-semibold text-zinc-100 mb-2">Invite Created!</h3>
                                <p className="text-zinc-400 text-sm mb-6">Share this link with {application?.candidate?.name || 'the candidate'} so they can book a time.</p>
                                <div className="w-full flex gap-2">
                                    <input type="text" readOnly value={bookingUrl} className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-300 text-xs focus:outline-none" />
                                    <button onClick={handleCopyLink} className="btn-primary bg-blue-500 text-blue-950 hover:bg-blue-400 px-4 flex items-center gap-2">
                                        <div className="icon-copy text-sm"></div> Copy
                                    </button>
                                </div>
                            </div>
                        ) : mode === 'link' ? (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-1.5">Interview Type</label>
                                    <select className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-100 text-sm focus:outline-none">
                                        <option>Recruiter Screen (30m)</option>
                                        <option>Technical Interview (60m)</option>
                                        <option>Culture Fit (45m)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-1.5">Booking Link</label>
                                    <div className="flex gap-2">
                                        <input type="text" readOnly value="https://calendly.com/janedoe/recruiter-screen" className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-400 text-sm focus:outline-none" />
                                        <button className="btn-secondary px-3" title="Copy Link"><div className="icon-copy text-sm"></div></button>
                                    </div>
                                </div>
                                <textarea className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-100 text-sm h-32 focus:outline-none resize-none" placeholder="Add a custom message..." defaultValue={`Hi ${application ? application.candidate.name.split(' ')[0] : 'there'},\n\nWe'd love to schedule a time to chat. Please grab a time that works for you using the link below.`}></textarea>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 flex items-start gap-3">
                                    <div className="icon-info text-blue-400 mt-0.5"></div>
                                    <div className="text-xs text-blue-200">
                                        These times will be temporarily held on your calendar. Once the candidate selects a slot, the hold is confirmed, a Google Meet link is auto-generated, and the other holds will be automatically removed to free up your schedule.
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-1.5">Custom Availability</label>
                                    <div className="flex gap-2 mb-3">
                                        <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="w-1/2 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-zinc-100 text-sm focus:outline-none" />
                                        <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="w-1/3 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-zinc-100 text-sm focus:outline-none" />
                                        <button onClick={handleAddCustomTime} className="flex-1 btn-secondary py-1.5 px-0 flex justify-center items-center">
                                            <div className="icon-plus text-sm"></div>
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {proposedTimes.map(pt => (
                                            <div key={pt.id} className="bg-blue-500/20 border border-blue-500/50 text-blue-100 text-xs px-2 py-1 rounded-md flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></div>
                                                {pt.date} @ {pt.time} (Hold)
                                                <button onClick={() => handleRemoveTime(pt.id)} className="hover:text-white ml-1"><div className="icon-x text-[10px]"></div></button>
                                            </div>
                                        ))}
                                        {proposedTimes.length === 0 && <div className="text-xs text-zinc-500 italic">No times proposed yet. Add times above.</div>}
                                    </div>
                                </div>
                                <div className="mt-4 flex items-center gap-2 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-300">
                                    <input type="checkbox" id="generateMeet" defaultChecked className="accent-emerald-500 bg-zinc-800 border-zinc-700" />
                                    <label htmlFor="generateMeet" className="cursor-pointer">Automatically generate Google Meet/Zoom link</label>
                                </div>
                                <textarea className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-100 text-sm h-32 focus:outline-none resize-none mt-4" placeholder="Message..." defaultValue={`Hi ${application ? application.candidate.name.split(' ')[0] : 'there'},\n\nWould any of these times work for a 30-minute chat?\n\n${proposedTimes.map(pt => `- ${pt.date} at ${pt.time}`).join('\n')}`}></textarea>
                                
                                <div className="text-right">
                                    <a href="booking.html" target="_blank" className="text-xs text-blue-400 hover:text-blue-300 underline">Preview Candidate Experience →</a>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="absolute bottom-6 right-6 left-6 flex justify-end gap-3 pt-4 border-t border-zinc-800 bg-zinc-900">
                        <button onClick={onClose} className="btn-secondary">{bookingUrl ? 'Done' : 'Cancel'}</button>
                        {!bookingUrl && (
                            <button
                                onClick={mode === 'propose' ? handleSendInvites : () => onConfirm(mode)}
                                disabled={mode === 'propose' && (isSending || proposedTimes.length === 0)}
                                className="btn-primary bg-blue-500 text-blue-950 hover:bg-blue-400 disabled:opacity-50"
                            >
                                {mode === 'link' ? 'Send Link' : (isSending ? 'Creating...' : 'Send Invites')}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
