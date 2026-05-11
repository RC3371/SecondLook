
function NewRole() {
    const [files, setFiles] = React.useState([]);
    const [isDragging, setIsDragging] = React.useState(false);
    const [title, setTitle] = React.useState('')
    const [department, setDepartment] = React.useState('Engineering')
    const [description, setDescription] = React.useState('')
    const [publishing, setPublishing] = React.useState(false)

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFiles(Array.from(e.dataTransfer.files));
        }
    };

    const handleFiles = (newFiles) => {
        const fileNames = newFiles.map(f => f.name);
        setFiles(prev => [...prev, ...fileNames]);
        if(window.showToast) window.showToast(`${newFiles.length} file(s) added for processing.`, 'success');
    };

    return (
        <PageShell>
            <div className="flex-1 overflow-auto p-8" data-name="new-role">
                <div className="max-w-3xl mx-auto">
                    <div className="flex items-center gap-4 mb-8">
                        <a href="index.html" className="p-2 -ml-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 rounded-lg transition-colors">
                            <div className="icon-arrow-left text-lg"></div>
                        </a>
                        <div>
                            <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight mb-1">Create New Role</h1>
                            <p className="text-zinc-400 text-sm">Configure job details and AI triage parameters.</p>
                        </div>
                    </div>

                    <div className="space-y-8 pb-12">
                        {/* Basic Info */}
                        <section className="card p-6">
                            <h2 className="text-lg font-medium text-zinc-100 mb-6 flex items-center gap-2">
                                <div className="icon-briefcase text-zinc-400 text-sm"></div>
                                Job Details
                            </h2>
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-400 mb-1.5">Job Title</label>
                                        <input type="text" className="input-field" placeholder="e.g. Senior Frontend Engineer" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-400 mb-1.5">Department</label>
                                        <select className="input-field appearance-none">
                                            <option>Engineering</option>
                                            <option>Design</option>
                                            <option>Product</option>
                                            <option>Marketing</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-1.5">Job Description</label>
                                    <textarea className="input-field h-32 resize-none" placeholder="Paste full job description here..."></textarea>
                                </div>
                            </div>
                        </section>

                        {/* Applicant Import */}
                        <section className="card p-6 border-blue-500/20">
                            <h2 className="text-lg font-medium text-blue-500 mb-6 flex items-center gap-2">
                                <div className="icon-cloud-upload text-blue-500/70 text-sm"></div>
                                Batch Applicant Import
                            </h2>
                            <div className="space-y-4">
                                <p className="text-sm text-zinc-400">Upload a ZIP of PDF resumes or an Excel spreadsheet. The AI will automatically parse, normalize, and score these initial candidates against your criteria once the role is published.</p>
                                <div 
                                    className={`w-full border-2 border-dashed ${isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-zinc-700 bg-zinc-900/30'} hover:border-blue-500/50 rounded-xl p-8 flex flex-col items-center justify-center transition-colors cursor-pointer group`}
                                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                    onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                                    onDrop={handleDrop}
                                    onClick={() => {
                                        const input = document.createElement('input');
                                        input.type = 'file';
                                        input.multiple = true;
                                        input.accept = '.pdf,.zip,.xlsx,.csv';
                                        input.onchange = (e) => handleFiles(Array.from(e.target.files));
                                        input.click();
                                    }}
                                >
                                    <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                                        <div className="icon-cloud-upload text-blue-500 text-xl"></div>
                                    </div>
                                    <div className="text-sm font-medium text-zinc-200 mb-1">Click to upload or drag & drop files</div>
                                    <div className="text-xs text-zinc-500">Supports .PDF, .ZIP, .XLSX, .CSV up to 50MB</div>
                                </div>
                                
                                {files.length > 0 && (
                                    <div className="bg-zinc-950 rounded-lg border border-zinc-800 p-4 mt-4 space-y-2">
                                        <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">Files to process ({files.length})</div>
                                        {files.map((file, idx) => (
                                            <div key={idx} className="flex items-center justify-between text-sm text-zinc-300">
                                                <div className="flex items-center gap-2">
                                                    <div className="icon-file-text text-zinc-500 text-xs"></div>
                                                    {file}
                                                </div>
                                                <button onClick={(e) => {
                                                    e.stopPropagation();
                                                    setFiles(files.filter((_, i) => i !== idx));
                                                }} className="text-zinc-500 hover:text-red-400 p-1">
                                                    <div className="icon-x text-xs"></div>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* AI Triage Configuration */}
                        <section className="card p-6 border-emerald-500/20">
                            <h2 className="text-lg font-medium text-emerald-500 mb-6 flex items-center gap-2">
                                <div className="icon-bot text-emerald-500/70 text-sm"></div>
                                AI Triage Parameters
                            </h2>
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">Must-Have Skills (Auto-Reject if missing)</label>
                                    <input type="text" className="input-field" placeholder="e.g. React, Next.js, TypeScript (comma separated)" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">Nice-to-Have Skills (Boosts Match Score)</label>
                                    <input type="text" className="input-field" placeholder="e.g. GraphQL, Tailwind CSS, Node.js" />
                                </div>
                                <div className="flex items-center gap-3 bg-zinc-950 p-4 rounded-xl border border-zinc-800/50 mt-4">
                                    <input type="checkbox" id="referrals" className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 accent-emerald-500" defaultChecked />
                                    <label htmlFor="referrals" className="text-sm text-zinc-300">
                                        Enable Cross-Team Referrals (Recommend rejected candidates to other departments)
                                    </label>
                                </div>
                            </div>
                        </section>

                        <div className="flex justify-end gap-3">
                            <a href="index.html" className="btn-secondary">Cancel</a>
                            <button onClick={async () => {
                                setPublishing(true)
                                try {
                                    const job = await window.api.createJob({ title, description, department })
                                    if (files.length > 0) {
                                        const fd = new FormData()
                                        fd.append('file', new File([], files[0]))
                                        fd.append('job_id', job.id)
                                        await window.api.uploadImport(fd)
                                    }
                                    window.location.href = 'index.html'
                                } catch (err) {
                                    console.error('Publish failed', err)
                                    if (window.showToast) window.showToast('Publish failed', 'error')
                                } finally { setPublishing(false) }
                            }} className={`btn-primary bg-emerald-500 text-emerald-950 hover:bg-emerald-400 ${publishing ? 'opacity-60 pointer-events-none' : ''}`}>{publishing ? 'Publishing...' : 'Publish Role'}</button>
                        </div>
                    </div>
                </div>
            </div>
        </PageShell>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ErrorBoundary><NewRole /></ErrorBoundary>);