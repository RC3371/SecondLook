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

function ApplicantProfile() {
    const urlParams = new URLSearchParams(window.location.search);
    const appId = urlParams.get('id') || 'app-1';
    const [application, setApplication] = React.useState(() => {
        const fromMock = (typeof MOCK_APPLICATIONS !== 'undefined') ? MOCK_APPLICATIONS.find(a => a.id === appId) || MOCK_APPLICATIONS[0] : null
        return fromMock
    });
    const job = typeof MOCK_JOBS !== 'undefined' ? (MOCK_JOBS.find(j => j.id === (application?.jobId)) || MOCK_JOBS[0]) : { id: 'job-1', title: 'Job' };

    React.useEffect(() => {
        async function load() {
            if (window.api && appId) {
                try {
                    const app = await window.api.fetchApplication(appId)
                    setApplication(app)
                } catch (err) {
                    console.error('Failed to fetch application, using mock:', err)
                }
            }
        }
        load()
    }, [appId]);
    const [activeModal, setActiveModal] = React.useState(null);
    const [availableJobs, setAvailableJobs] = React.useState([]);
    const [referJobId, setReferJobId] = React.useState('');
    const [referNote, setReferNote] = React.useState('');
    const [advanceStage, setAdvanceStage] = React.useState('Recruiter Screen');

    React.useEffect(() => {
        async function loadJobs() {
            try {
                if (window.api) {
                    const jobs = await window.api.fetchJobs();
                    setAvailableJobs(jobs);
                }
            } catch (err) {
                console.error('Failed to load jobs for refer modal:', err);
            }
        }
        loadJobs();
    }, []);

    const handleAction = async () => {
        if (!application) return;
        try {
            if (activeModal === 'reject') {
                await window.api?.updateApplicationStatus(application.id, 'rejected');
                if (window.showToast) window.showToast(application.candidate.name + ' has been rejected.', 'success');
            } else if (activeModal === 'refer') {
                await window.api?.createReferral({
                    from_application_id: application.id,
                    to_job_posting_id: referJobId,
                    message: referNote,
                });
                if (window.showToast) window.showToast('Referral sent to the hiring team.', 'success');
            } else if (activeModal === 'message') {
                if (window.showToast) window.showToast('Message sent to ' + application.candidate.name, 'success');
            } else if (activeModal === 'schedule') {
                if (window.showToast) window.showToast('Interview invitation sent to ' + application.candidate.name, 'success');
            } else {
                if (window.showToast) window.showToast('Action completed.', 'success');
            }
        } catch (err) {
            console.error('Action failed:', err);
            if (window.showToast) window.showToast('Action failed. Please try again.', 'error');
            return;
        }
        setActiveModal(null);
    };

    return (
        <PageShell>
            {activeModal === 'schedule' && (
                <ScheduleModal 
                    application={application} 
                    onClose={() => setActiveModal(null)} 
                    onConfirm={handleAction} 
                />
            )}
            
            {activeModal && activeModal !== 'schedule' && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl relative">
                        <button onClick={() => setActiveModal(null)} className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300">
                            <div className="icon-x text-lg"></div>
                        </button>
                        
                        <div className="p-6">
                            {activeModal === 'message' && (
                                <div>
                                    <h2 className="text-xl font-semibold text-zinc-100 mb-4">Message {application.candidate.name}</h2>
                                    <input type="text" className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-100 text-sm mb-4 focus:outline-none" placeholder="Subject" defaultValue="Regarding your application for Senior Frontend Engineer" />
                                    <textarea className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-100 text-sm h-40 focus:outline-none resize-none mb-4" placeholder="Type your message here..."></textarea>
                                    <div className="flex justify-end gap-3">
                                        <button onClick={() => setActiveModal(null)} className="btn-secondary">Cancel</button>
                                        <button onClick={handleAction} className="btn-primary bg-emerald-500 text-emerald-950 hover:bg-emerald-400">Send Message</button>
                                    </div>
                                </div>
                            )}

                            {activeModal === 'reject' && (
                                <div>
                                    <h2 className="text-xl font-semibold text-red-400 mb-2">Reject Candidate</h2>
                                    <p className="text-zinc-400 text-sm mb-6">Are you sure you want to reject {application.candidate.name}? They will be notified via email based on your template settings.</p>
                                    <textarea className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-100 text-sm h-24 focus:outline-none resize-none mb-4" placeholder="Optional internal reasoning..."></textarea>
                                    <div className="flex justify-end gap-3">
                                        <button onClick={() => setActiveModal(null)} className="btn-secondary">Cancel</button>
                                        <button onClick={handleAction} className="btn-primary bg-red-500 text-red-950 hover:bg-red-400">Confirm Rejection</button>
                                    </div>
                                </div>
                            )}

                            {activeModal === 'refer' && (
                                <div>
                                    <h2 className="text-xl font-semibold text-amber-500 mb-2">Refer Cross-Team</h2>
                                    <p className="text-zinc-400 text-sm mb-6">Share this profile with another team. If they accept, the candidate moves to their pipeline.</p>
                                    <select
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-100 text-sm mb-4 focus:outline-none"
                                        value={referJobId}
                                        onChange={e => setReferJobId(e.target.value)}
                                    >
                                        <option value="">Select a role...</option>
                                        {availableJobs.map(j => (
                                            <option key={j.id} value={j.id}>{j.title}</option>
                                        ))}
                                    </select>
                                    <textarea
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-100 text-sm h-24 focus:outline-none resize-none mb-4"
                                        placeholder="Why is this candidate a good fit for them?"
                                        value={referNote}
                                        onChange={e => setReferNote(e.target.value)}
                                    ></textarea>
                                    <div className="flex justify-end gap-3">
                                        <button onClick={() => setActiveModal(null)} className="btn-secondary">Cancel</button>
                                        <button onClick={handleAction} disabled={!referJobId} className="btn-primary bg-amber-500 text-amber-950 hover:bg-amber-400 disabled:opacity-50">Send Referral</button>
                                    </div>
                                </div>
                            )}

                            {activeModal === 'advance' && (
                                <div>
                                    <h2 className="text-xl font-semibold text-emerald-500 mb-2">Advance Candidate</h2>
                                    <p className="text-zinc-400 text-sm mb-6">Move {application.candidate.name} to the next stage.</p>
                                    <select
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-100 text-sm mb-4 focus:outline-none"
                                        value={advanceStage}
                                        onChange={e => setAdvanceStage(e.target.value)}
                                    >
                                        <option>Recruiter Screen</option>
                                        <option>Hiring Manager Interview</option>
                                        <option>Technical Assessment</option>
                                    </select>
                                    
                                    <label className="flex items-center gap-3 p-3 rounded-lg border border-zinc-800 bg-zinc-950 mb-6 cursor-pointer">
                                        <input type="checkbox" id="advanceAndSchedule" defaultChecked className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 accent-emerald-500" />
                                        <div className="text-sm text-zinc-200">Automatically open Scheduling</div>
                                    </label>

                                    <div className="flex justify-end gap-3">
                                        <button onClick={() => setActiveModal(null)} className="btn-secondary">Cancel</button>
                                        <button onClick={async () => {
                                            const shouldSchedule = document.getElementById('advanceAndSchedule').checked;
                                            try {
                                                await window.api?.advanceApplication(application.id, advanceStage);
                                            } catch (err) {
                                                console.error('Failed to advance:', err);
                                                if (window.showToast) window.showToast('Failed to advance candidate.', 'error');
                                                return;
                                            }
                                            if (shouldSchedule) {
                                                if (window.showToast) window.showToast(`${application.candidate.name} advanced. Please schedule the interview.`, 'success');
                                                setActiveModal('schedule');
                                            } else {
                                                if (window.showToast) window.showToast(`${application.candidate.name} advanced to ${advanceStage}.`, 'success');
                                                setActiveModal(null);
                                            }
                                        }} className="btn-primary bg-emerald-500 text-emerald-950 hover:bg-emerald-400">
                                            Advance Stage
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col h-full w-full" data-name="applicant-profile">
                {/* Header */}
                <div className="px-6 py-4 border-b border-zinc-900 shrink-0 flex justify-between items-center bg-zinc-950">
                    <div className="flex items-center gap-4">
                        <a href={`triage.html?jobId=${job.id}`} className="p-2 -ml-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 rounded-lg transition-colors">
                            <div className="icon-arrow-left text-lg"></div>
                        </a>
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <h1 className="text-xl font-semibold text-zinc-100">{application.candidate.name}</h1>
                                <span className={`px-2 py-0.5 rounded text-xs font-medium border uppercase tracking-wider bg-zinc-900 border-zinc-800 text-zinc-300`}>
                                    {application.aiTier.replace('_', ' ')}
                                </span>
                            </div>
                            <div className="text-sm text-zinc-400 flex items-center gap-2">
                                <span>{job.title}</span>
                                <span>&bull;</span>
                                <span>Applied 2 days ago</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <button onClick={() => setActiveModal('message')} className="btn-secondary text-zinc-400 hover:text-zinc-100 flex items-center gap-2">
                            <div className="icon-message-square text-sm"></div>
                            Message
                        </button>
                        <div className="w-px h-6 bg-zinc-800 mx-2"></div>
                        <button onClick={() => setActiveModal('reject')} className="btn-secondary text-red-400 hover:text-red-300 hover:border-red-900/50">Reject</button>
                        <button onClick={() => setActiveModal('refer')} className="btn-secondary text-amber-500 hover:text-amber-400">Refer</button>
                        <button onClick={() => setActiveModal('schedule')} className="btn-secondary text-blue-400 hover:text-blue-300 border-blue-900/30">Schedule</button>
                        <button onClick={() => setActiveModal('advance')} className="btn-primary bg-emerald-500 text-emerald-950 hover:bg-emerald-400">Advance</button>
                    </div>
                </div>

                {/* Content Split */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Left Column - Profile Details */}
                    <div className="w-[450px] border-r border-zinc-900 flex flex-col bg-zinc-950 overflow-y-auto">
                        <div className="p-6 space-y-8">
                            {/* Contact Info */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-3 text-sm text-zinc-300">
                                    <div className="icon-mail text-zinc-500 w-4"></div>
                                    {application.candidate.email}
                                </div>
                                <div className="flex items-center gap-3 text-sm text-zinc-300">
                                    <div className="icon-phone text-zinc-500 w-4"></div>
                                    {application.candidate.phone}
                                </div>
                                <div className="flex items-center gap-3 text-sm text-zinc-300">
                                    <div className="icon-map-pin text-zinc-500 w-4"></div>
                                    {application.candidate.location}
                                </div>
                            </div>

                            {/* AI Summary */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-medium text-zinc-100 flex items-center gap-2">
                                    <div className="icon-bot text-zinc-400"></div> AI Analysis
                                </h3>
                                <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 text-sm text-zinc-300 leading-relaxed">
                                    {application.aiSummary}
                                </div>
                                <div className="flex flex-wrap gap-2 pt-2">
                                    {application.insights.map((insight, i) => (
                                        <span key={i} className="px-2 py-1 bg-zinc-900 text-zinc-400 border border-zinc-800 rounded-md text-xs font-medium">
                                            {insight}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Referral Match */}
                            {application.referralMatch && (
                                <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 relative overflow-hidden">
                                    <h4 className="text-amber-500 font-medium text-sm flex items-center gap-2 mb-2">
                                        <div className="icon-sparkles"></div>
                                        Cross-team Referral Match
                                    </h4>
                                    <div className="text-zinc-200 text-sm font-medium mb-1">{application.referralMatch.jobTitle}</div>
                                    <div className="text-sm text-zinc-400 mb-4">{application.referralMatch.reasoning}</div>
                                    <button onClick={async () => {
                                        try {
                                            await window.api?.createReferral({
                                                from_application_id: application.id,
                                                to_job_posting_id: application.referralMatch.jobId,
                                                message: application.referralMatch.reasoning,
                                            });
                                            if (window.showToast) window.showToast('Referral sent!', 'success');
                                        } catch (err) {
                                            if (window.showToast) window.showToast('Failed to send referral.', 'error');
                                        }
                                    }} className="w-full py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 text-sm font-medium rounded-lg border border-amber-500/20 transition-colors">
                                        Refer to Team
                                    </button>
                                </div>
                            )}

                        </div>
                    </div>

                    {/* Right Column - Resume Viewer */}
                    <div className="flex-1 bg-zinc-900/50 p-8 overflow-y-auto flex justify-center">
                        {/* Mock PDF Viewer */}
                        <div className="w-full max-w-[800px] bg-white rounded shadow-2xl p-12 min-h-[1056px] text-zinc-900">
                            <div className="border-b-2 border-zinc-200 pb-6 mb-8">
                                <h1 className="text-4xl font-bold mb-2">{application.candidate.name}</h1>
                                <p className="text-lg text-zinc-600">{application.candidate.currentRole}</p>
                                <div className="flex gap-4 text-sm text-zinc-500 mt-4">
                                    <span>{application.candidate.email}</span>
                                    <span>•</span>
                                    <span>{application.candidate.phone}</span>
                                    <span>•</span>
                                    <span>{application.candidate.location}</span>
                                </div>
                            </div>

                            <div className="space-y-8">
                                <section>
                                    <h2 className="text-xl font-semibold border-b border-zinc-200 pb-2 mb-4 uppercase tracking-wider text-zinc-800">Experience</h2>
                                    <div className="space-y-6">
                                        <div>
                                            <div className="flex justify-between items-start mb-2">
                                                <h3 className="font-semibold text-lg">{application.candidate.currentRole.split(' @ ')[0]}</h3>
                                                <span className="text-zinc-500">2021 - Present</span>
                                            </div>
                                            <div className="text-zinc-600 font-medium mb-3">{application.candidate.currentRole.split(' @ ')[1] || 'Current Company'}</div>
                                            <ul className="list-disc pl-5 space-y-2 text-zinc-700">
                                                <li>Led development of core platform features using React and Next.js, improving load times by 40%.</li>
                                                <li>Mentored junior engineers and established frontend testing standards.</li>
                                                <li>Collaborated with design team to implement comprehensive design system.</li>
                                            </ul>
                                        </div>
                                        <div>
                                            <div className="flex justify-between items-start mb-2">
                                                <h3 className="font-semibold text-lg">Software Engineer</h3>
                                                <span className="text-zinc-500">2018 - 2021</span>
                                            </div>
                                            <div className="text-zinc-600 font-medium mb-3">Previous Tech Co</div>
                                            <ul className="list-disc pl-5 space-y-2 text-zinc-700">
                                                <li>Built and maintained highly scalable web applications serving 1M+ users.</li>
                                                <li>Integrated multiple third-party REST and GraphQL APIs.</li>
                                            </ul>
                                        </div>
                                    </div>
                                </section>

                                <section>
                                    <h2 className="text-xl font-semibold border-b border-zinc-200 pb-2 mb-4 uppercase tracking-wider text-zinc-800">Education</h2>
                                    <div>
                                        <div className="flex justify-between items-start mb-2">
                                            <h3 className="font-semibold text-lg">B.S. Computer Science</h3>
                                            <span className="text-zinc-500">2014 - 2018</span>
                                        </div>
                                        <div className="text-zinc-600">State University</div>
                                    </div>
                                </section>

                                <section>
                                    <h2 className="text-xl font-semibold border-b border-zinc-200 pb-2 mb-4 uppercase tracking-wider text-zinc-800">Skills</h2>
                                    <p className="text-zinc-700 leading-relaxed">
                                        JavaScript (ES6+), TypeScript, React, Next.js, Node.js, HTML5, CSS3/Tailwind, GraphQL, REST APIs, Git, CI/CD, Agile Methodologies
                                    </p>
                                </section>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </PageShell>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ErrorBoundary><ApplicantProfile /></ErrorBoundary>);