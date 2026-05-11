window.showToast = (message, type = 'success') => {
    window.dispatchEvent(new CustomEvent('app-toast', { detail: { message, type } }));
};

function Toast() {
    const [toast, setToast] = React.useState(null);
    React.useEffect(() => {
        const handler = (e) => {
            setToast(e.detail);
            setTimeout(() => setToast(null), 3000);
        };
        window.addEventListener('app-toast', handler);
        return () => window.removeEventListener('app-toast', handler);
    }, []);
    if (!toast) return null;
    return (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
            <div className="bg-zinc-800 border border-zinc-700 text-zinc-100 px-4 py-3 rounded-lg shadow-xl flex items-center gap-3">
                <div className={`icon-${toast.type === 'success' ? 'circle-check' : 'info'} text-${toast.type === 'success' ? 'emerald' : 'blue'}-500 text-lg`}></div>
                <p className="text-sm font-medium">{toast.message}</p>
            </div>
        </div>
    );
}

function PageShell({ children }) {
    return (
        <div className="flex h-screen w-full bg-zinc-950" data-name="page-shell">
            <Sidebar />
            <main className="flex-1 h-screen overflow-hidden flex flex-col relative">
                {children}
                <Toast />
            </main>
        </div>
    );
}
