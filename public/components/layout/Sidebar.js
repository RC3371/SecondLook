function Sidebar() {
    const currentPath = window.location.pathname;
    const [user, setUser] = React.useState(null);

    React.useEffect(() => {
        fetch('/api/me')
            .then(res => {
                if (res.status === 401) {
                    window.location.href = '/sign-in';
                    return null;
                }
                return res.json();
            })
            .then(data => { if (data) setUser(data); })
            .catch(() => { window.location.href = '/sign-in'; });
    }, []);

    const unreadReferrals = 0;

    const navItems = [
        { name: "Open Roles", icon: "briefcase", path: "index.html", match: ["/", "index.html"] },
        { name: "Talent Pool", icon: "users", path: "talent-pool.html", match: ["talent-pool.html"] },
        { name: "Referrals", icon: "inbox", path: "referrals.html", match: ["referrals.html"], badge: unreadReferrals > 0 ? unreadReferrals : null },
        { name: "Scheduling", icon: "calendar", path: "scheduling.html", match: ["scheduling.html"] },
        { name: "Settings", icon: "settings", path: "settings.html", match: ["settings.html"] }
    ];

    const isActive = (matches) => {
        return matches.some(m => currentPath.endsWith(m)) || (currentPath === "/" && matches.includes("/"));
    };

    return (
        <div className="w-64 h-screen bg-zinc-950 border-r border-zinc-900 flex flex-col" data-name="sidebar">
            <div className="p-4 flex items-center gap-2 mb-4">
                <div className="w-6 h-6 rounded bg-zinc-100 flex items-center justify-center">
                    <div className="icon-search text-sm text-zinc-900"></div>
                </div>
                <span className="font-semibold text-zinc-100 tracking-tight">Second Look</span>
            </div>
            
            <nav className="flex-1 px-2 space-y-1">
                {navItems.map(item => (
                    <a 
                        key={item.name}
                        href={item.path}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive(item.match) ? 'bg-zinc-900 text-zinc-100' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/50'}`}
                    >
                        <div className="flex items-center gap-3">
                            <div className={`icon-${item.icon} text-lg`}></div>
                            {item.name}
                        </div>
                        {item.badge && (
                            <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                                {item.badge}
                            </span>
                        )}
                    </a>
                ))}
            </nav>
            
            <div className="p-4 border-t border-zinc-900">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {user?.imageUrl
                            ? <img src={user.imageUrl} className="w-8 h-8 rounded-full object-cover" />
                            : <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-medium">
                                {user ? (user.firstName?.[0] ?? '') + (user.lastName?.[0] ?? '') || '?' : '…'}
                              </div>
                        }
                        <div className="text-sm">
                            <div className="text-zinc-100 font-medium">{user?.fullName ?? '…'}</div>
                            <div className="text-zinc-500 text-xs truncate max-w-[120px]">{user?.email ?? ''}</div>
                        </div>
                    </div>
                    <a href="/sign-out" className="text-zinc-500 hover:text-red-400 transition-colors p-2 rounded-lg hover:bg-zinc-900" title="Logout">
                        <div className="icon-log-out text-sm"></div>
                    </a>
                </div>
            </div>
        </div>
    );
}
