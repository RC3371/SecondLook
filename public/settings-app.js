
function ProfileTab() {
    const [saving, setSaving] = React.useState(false);
    const [fullName, setFullName] = React.useState('');
    const [email, setEmail] = React.useState('');
    const [notifReferral, setNotifReferral] = React.useState(true);
    const [notifDigest, setNotifDigest] = React.useState(true);

    React.useEffect(() => {
        window.api?.getSettings().then(data => {
            if (data?.fullName !== undefined) setFullName(data.fullName);
            if (data?.email !== undefined) setEmail(data.email);
            if (data?.notifications?.newReferralMatch !== undefined) setNotifReferral(data.notifications.newReferralMatch);
            if (data?.notifications?.dailyDigest !== undefined) setNotifDigest(data.notifications.dailyDigest);
        }).catch(err => console.error('Failed to load settings:', err));
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            await window.api?.saveSettings({
                fullName,
                email,
                notifications: { newReferralMatch: notifReferral, dailyDigest: notifDigest },
            });
            if (window.showToast) window.showToast('Settings saved successfully.', 'success');
        } catch (err) {
            if (window.showToast) window.showToast('Failed to save settings.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const initials = fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';

    return (
        <div className="max-w-2xl">
            <div className="card p-6 mb-6">
                <h3 className="text-lg font-medium text-zinc-100 mb-6">Personal Profile</h3>
                <div className="flex items-center gap-6 mb-8">
                    <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center text-xl font-medium text-zinc-400">{initials}</div>
                    <div>
                        <p className="text-xs text-zinc-500">Avatar upload coming soon</p>
                    </div>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-1.5">Full Name</label>
                        <input
                            type="text"
                            value={fullName}
                            onChange={e => setFullName(e.target.value)}
                            className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-100 text-sm focus:outline-none"
                            placeholder="Your name"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-1.5">Email Address</label>
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-100 text-sm focus:outline-none"
                            placeholder="you@example.com"
                        />
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
                        <input
                            type="checkbox"
                            checked={notifReferral}
                            onChange={e => setNotifReferral(e.target.checked)}
                            className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 accent-emerald-500"
                        />
                    </label>
                    <hr className="border-zinc-800" />
                    <label className="flex items-center justify-between">
                        <div>
                            <div className="text-sm font-medium text-zinc-200">Daily Digest</div>
                            <div className="text-xs text-zinc-500">Send a daily summary of new applicants and triage results</div>
                        </div>
                        <input
                            type="checkbox"
                            checked={notifDigest}
                            onChange={e => setNotifDigest(e.target.checked)}
                            className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 accent-emerald-500"
                        />
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
    );
}

function RoleBadge({ role }) {
    const isAdmin = role === 'admin' || role === 'org:admin';
    return (
        <span className={`px-2 py-0.5 rounded text-xs font-medium border ${isAdmin ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
            {isAdmin ? 'Admin' : 'Recruiter'}
        </span>
    );
}

function MemberRow({ member, currentUserId, isAdmin, onRefresh }) {
    const [loading, setLoading] = React.useState(false);
    const isSelf = member.clerk_user_id === currentUserId;
    const memberIsAdmin = member.role === 'admin';
    const initials = (member.full_name || member.email || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    const handleRoleChange = async () => {
        setLoading(true);
        try {
            const newRole = memberIsAdmin ? 'org:member' : 'org:admin';
            await window.api.changeMemberRole(member.clerk_user_id, newRole);
            onRefresh();
        } catch {
            if (window.showToast) window.showToast('Failed to change role.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleRemove = async () => {
        if (!confirm(`Remove ${member.full_name || member.email} from the organization?`)) return;
        setLoading(true);
        try {
            await window.api.removeMember(member.clerk_user_id);
            onRefresh();
        } catch {
            if (window.showToast) window.showToast('Failed to remove member.', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center gap-4 py-3">
            <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-sm font-medium text-zinc-400 shrink-0">
                {initials}
            </div>
            <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-zinc-100 truncate">{member.full_name || '—'}</div>
                <div className="text-xs text-zinc-500 truncate">{member.email}</div>
            </div>
            <RoleBadge role={member.role} />
            {isAdmin && !isSelf && (
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={handleRoleChange}
                        disabled={loading}
                        className="text-xs text-zinc-400 hover:text-zinc-100 transition-colors px-2 py-1 rounded hover:bg-zinc-800 disabled:opacity-50"
                    >
                        {loading ? '...' : memberIsAdmin ? 'Make Recruiter' : 'Make Admin'}
                    </button>
                    <button
                        onClick={handleRemove}
                        disabled={loading}
                        className="text-xs text-red-500 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-zinc-800 disabled:opacity-50"
                    >
                        Remove
                    </button>
                </div>
            )}
            {isSelf && (
                <span className="text-xs text-zinc-600 shrink-0">You</span>
            )}
        </div>
    );
}

function TeamTab() {
    const [loading, setLoading] = React.useState(true);
    const [members, setMembers] = React.useState([]);
    const [invitations, setInvitations] = React.useState([]);
    const [currentUserRole, setCurrentUserRole] = React.useState('recruiter');
    const [currentUserId, setCurrentUserId] = React.useState(null);
    const [inviteEmail, setInviteEmail] = React.useState('');
    const [inviteRole, setInviteRole] = React.useState('org:member');
    const [inviting, setInviting] = React.useState(false);

    const loadTeam = async () => {
        setLoading(true);
        try {
            const data = await window.api.getTeam();
            setMembers(data.members ?? []);
            setInvitations(data.invitations ?? []);
            setCurrentUserRole(data.currentUserRole ?? 'recruiter');
            setCurrentUserId(data.currentUserId ?? null);
        } catch {
            if (window.showToast) window.showToast('Failed to load team.', 'error');
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => { loadTeam(); }, []);

    const handleInvite = async (e) => {
        e.preventDefault();
        if (!inviteEmail.trim()) return;
        setInviting(true);
        try {
            await window.api.inviteMember(inviteEmail.trim(), inviteRole);
            if (window.showToast) window.showToast(`Invite sent to ${inviteEmail.trim()}.`, 'success');
            setInviteEmail('');
            loadTeam();
        } catch {
            if (window.showToast) window.showToast('Failed to send invite.', 'error');
        } finally {
            setInviting(false);
        }
    };

    const isAdmin = currentUserRole === 'admin';

    if (loading) {
        return (
            <div className="max-w-2xl flex items-center justify-center py-20">
                <span className="text-zinc-500 text-sm">Loading team...</span>
            </div>
        );
    }

    return (
        <div className="max-w-2xl space-y-6">
            <div className="card p-6">
                <h3 className="text-lg font-medium text-zinc-100 mb-1">Team Members</h3>
                <p className="text-xs text-zinc-500 mb-5">{members.length} member{members.length !== 1 ? 's' : ''} in your organization</p>
                <div className="divide-y divide-zinc-800">
                    {members.map(member => (
                        <MemberRow
                            key={member.id}
                            member={member}
                            currentUserId={currentUserId}
                            isAdmin={isAdmin}
                            onRefresh={loadTeam}
                        />
                    ))}
                </div>
            </div>

            {invitations.length > 0 && (
                <div className="card p-6">
                    <h3 className="text-lg font-medium text-zinc-100 mb-5">Pending Invitations</h3>
                    <div className="space-y-3">
                        {invitations.map(inv => (
                            <div key={inv.id} className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                                    <i className="icon-mail" style={{fontSize: '14px', color: '#71717a'}}></i>
                                </div>
                                <div className="flex-1 text-sm text-zinc-300 truncate">{inv.email}</div>
                                <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-950 text-amber-400 border border-amber-800 shrink-0">Pending</span>
                                <RoleBadge role={inv.role} />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {isAdmin && (
                <div className="card p-6">
                    <h3 className="text-lg font-medium text-zinc-100 mb-1">Invite a Teammate</h3>
                    <p className="text-xs text-zinc-500 mb-5">They'll receive an email with a link to join your organization.</p>
                    <form onSubmit={handleInvite} className="flex gap-3">
                        <input
                            type="email"
                            value={inviteEmail}
                            onChange={e => setInviteEmail(e.target.value)}
                            placeholder="colleague@company.com"
                            required
                            className="flex-1 bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-100 text-sm focus:outline-none placeholder:text-zinc-600"
                        />
                        <select
                            value={inviteRole}
                            onChange={e => setInviteRole(e.target.value)}
                            className="bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none"
                        >
                            <option value="org:member">Recruiter</option>
                            <option value="org:admin">Admin</option>
                        </select>
                        <button
                            type="submit"
                            disabled={inviting || !inviteEmail.trim()}
                            className="btn-primary disabled:opacity-50 shrink-0"
                        >
                            {inviting ? 'Sending...' : 'Send Invite'}
                        </button>
                    </form>
                </div>
            )}

            {!isAdmin && (
                <p className="text-xs text-zinc-600 text-center">Only admins can invite or manage team members.</p>
            )}
        </div>
    );
}

function Settings() {
    const [activeTab, setActiveTab] = React.useState('profile');

    const tabs = [
        { id: 'profile', label: 'Profile' },
        { id: 'team', label: 'Team & Users' },
        { id: 'integrations', label: 'Integrations' },
        { id: 'ai', label: 'AI Preferences' },
    ];

    return (
        <PageShell>
            <div className="flex h-full w-full overflow-hidden" data-name="settings">
                <div className="w-64 border-r border-zinc-900 bg-zinc-950 p-6 flex flex-col gap-2">
                    <h2 className="text-xl font-semibold text-zinc-100 mb-4">Settings</h2>
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                activeTab === tab.id
                                    ? 'bg-zinc-900 text-zinc-100'
                                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/50'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-auto p-8">
                    {activeTab === 'profile' && <ProfileTab />}
                    {activeTab === 'team' && <TeamTab />}
                    {activeTab === 'integrations' && (
                        <div className="max-w-2xl">
                            <div className="card p-6">
                                <h3 className="text-lg font-medium text-zinc-100 mb-2">Integrations</h3>
                                <p className="text-sm text-zinc-500">Integrations coming soon.</p>
                            </div>
                        </div>
                    )}
                    {activeTab === 'ai' && (
                        <div className="max-w-2xl">
                            <div className="card p-6">
                                <h3 className="text-lg font-medium text-zinc-100 mb-2">AI Preferences</h3>
                                <p className="text-sm text-zinc-500">AI preferences coming soon.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </PageShell>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ErrorBoundary><Settings /></ErrorBoundary>);
