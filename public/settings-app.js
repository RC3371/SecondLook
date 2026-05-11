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

function Settings() {
    const [saving, setSaving] = React.useState(false);
    
    const handleSave = () => {
        setSaving(true);
        setTimeout(() => {
            setSaving(false);
            if (window.showToast) window.showToast('Settings saved successfully.', 'success');
        }, 600);
    };

    const handleUpload = () => {
        if (window.showToast) window.showToast('Avatar updated.', 'success');
    };

    return (
        <PageShell>
            <div className="flex h-full w-full overflow-hidden" data-name="settings">
                {/* Settings Sidebar */}
                <div className="w-64 border-r border-zinc-900 bg-zinc-950 p-6 flex flex-col gap-2">
                    <h2 className="text-xl font-semibold text-zinc-100 mb-4">Settings</h2>
                    <button className="text-left px-3 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-zinc-100">Profile</button>
                    <button className="text-left px-3 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/50">Team & Users</button>
                    <button className="text-left px-3 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/50">Integrations</button>
                    <button className="text-left px-3 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/50">AI Preferences</button>
                </div>

                {/* Settings Content */}
                <div className="flex-1 overflow-auto p-8">
                    <div className="max-w-2xl">
                        <div className="card p-6 mb-6">
                            <h3 className="text-lg font-medium text-zinc-100 mb-6">Personal Profile</h3>
                            <div className="flex items-center gap-6 mb-8">
                                <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center text-xl font-medium text-zinc-400">JD</div>
                                <div>
                                    <button onClick={handleUpload} className="btn-secondary mb-2">Upload Avatar</button>
                                    <p className="text-xs text-zinc-500">JPG, GIF or PNG. Max size of 800K</p>
                                </div>
                            </div>
                            
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-1.5">Full Name</label>
                                    <input type="text" className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-100 text-sm focus:outline-none" defaultValue="Jane Doe" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-1.5">Email Address</label>
                                    <input type="email" className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-100 text-sm focus:outline-none" defaultValue="jane@example.com" />
                                </div>
                            </div>
                        </div>

                        <div className="card p-6">
                            <h3 className="text-lg font-medium text-zinc-100 mb-6">Notifications</h3>
                            <div className="space-y-4">
                                <label className="flex items-center justify-between">
                                    <div>
                                        <div className="text-sm font-medium text-zinc-200">New Referral Match</div>
                                        <div className="text-xs text-zinc-500">Email me when AI matches a candidate to my jobs</div>
                                    </div>
                                    <input type="checkbox" className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 accent-emerald-500" defaultChecked />
                                </label>
                                <hr className="border-zinc-800" />
                                <label className="flex items-center justify-between">
                                    <div>
                                        <div className="text-sm font-medium text-zinc-200">Daily Digest</div>
                                        <div className="text-xs text-zinc-500">Send a daily summary of new applicants and triage results</div>
                                    </div>
                                    <input type="checkbox" className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 accent-emerald-500" defaultChecked />
                                </label>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end">
                            <button 
                                onClick={handleSave} 
                                disabled={saving} 
                                className="btn-primary bg-emerald-500 text-emerald-950 hover:bg-emerald-400 min-w-[120px]"
                            >
                                {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </PageShell>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ErrorBoundary><Settings /></ErrorBoundary>);