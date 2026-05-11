function ApplicantDrawer({ application, onClose }) {
    if (!application) return null;

    return (
        <div className="w-[400px] border-l border-zinc-900 bg-zinc-950 flex flex-col h-full" data-name="applicant-drawer">
            <div className="p-4 border-b border-zinc-900 flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold text-zinc-100">{application.candidate.name}</h2>
                        <a href={`applicant.html?id=${application.id}`} className="text-zinc-500 hover:text-zinc-300 transition-colors" title="View Full Profile">
                            <div className="icon-external-link text-sm"></div>
                        </a>
                    </div>
                    <p className="text-sm text-zinc-400 mt-1">{application.candidate.currentRole}</p>
                </div>
                <button onClick={onClose} className="p-1 text-zinc-500 hover:text-zinc-300 rounded">
                    <div className="icon-x text-xl"></div>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {/* AI Summary */}
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                        <div className="icon-bot text-sm"></div> AI Analysis
                    </div>
                    <div className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-800/50 text-sm text-zinc-300 leading-relaxed">
                        {application.aiSummary}
                    </div>
                </div>

                {/* Referral Card (The "Magical" Feature) */}
                {application.referralMatch && (
                    <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-2">
                            <div className="icon-sparkles text-amber-500/20 text-4xl"></div>
                        </div>
                        <h4 className="text-amber-500 font-medium text-sm flex items-center gap-1.5 mb-2">
                            <div className="icon-arrow-right-left text-sm"></div>
                            Better Match Found
                        </h4>
                        <div className="text-zinc-200 text-sm font-medium mb-1">{application.referralMatch.jobTitle}</div>
                        <div className="text-xs text-zinc-400 mb-4">{application.referralMatch.reasoning}</div>
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
                        }} className="w-full py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 text-sm font-medium rounded-lg border border-amber-500/20 transition-colors">
                            Refer to Team
                        </button>
                    </div>
                )}
            </div>

            <div className="p-4 border-t border-zinc-900 bg-zinc-950 flex flex-col gap-3">
                <a href={`applicant.html?id=${application.id}`} className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-sm font-medium rounded-lg border border-zinc-700 transition-colors flex items-center justify-center gap-2">
                    <div className="icon-file-text text-sm"></div>
                    View Full Resume
                </a>
                <div className="flex gap-2">
                    <button onClick={() => window.dispatchEvent(new CustomEvent('open-schedule', { detail: application }))} className="flex-1 btn-secondary text-blue-400 hover:text-blue-300 hover:border-blue-900/50">Schedule Only</button>
                    <button onClick={() => window.dispatchEvent(new CustomEvent('advance-schedule', { detail: application }))} className="flex-1 btn-primary bg-emerald-500 text-emerald-950 hover:bg-emerald-400">Advance & Schedule</button>
                </div>
                <button className="w-full py-2 btn-secondary text-red-400 hover:text-red-300 hover:border-red-900/50 text-xs">Reject</button>
            </div>
        </div>
    );
}
