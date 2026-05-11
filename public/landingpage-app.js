function LandingPage() {
    return (
        <div className="min-h-screen flex flex-col font-sans" data-name="landing-page">
            {/* Navigation */}
            <header className="fixed top-0 w-full border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md z-50">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center">
                            <div className="icon-search text-zinc-900 font-bold"></div>
                        </div>
                        <span className="font-bold text-lg tracking-tight">Second Look</span>
                    </div>
                    <div className="flex items-center gap-4 ml-auto">
                        <a href="/sign-in" className="text-sm font-medium text-zinc-300 hover:text-white transition-colors">Sign in</a>
                        <a href="/sign-up" className="btn-primary">Get Started</a>
                    </div>
                </div>
            </header>

            {/* Hero Section */}
            <main className="flex-1 pt-32 pb-20">
                <div className="max-w-7xl mx-auto px-6 text-center">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium mb-8">
                        <div className="icon-sparkles text-xs"></div>
                        AI-Powered Triage is live
                    </div>
                    <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-6 max-w-4xl mx-auto leading-tight">
                        Hire smarter. <br/><span className="text-zinc-500">Move faster.</span>
                    </h1>
                    <p className="text-lg md:text-xl text-zinc-400 mb-10 max-w-2xl mx-auto leading-relaxed">
                        Second Look automatically triages inbound applications, identifies top talent, and bridges the gap between reviewing and scheduling with one seamless click.
                    </p>

                    {/* Dashboard Preview Mockup */}
                    <div className="mt-20 relative mx-auto max-w-5xl">
                        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent z-10"></div>
                        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-2 shadow-2xl relative overflow-hidden">
                            {/* Glowing gradient effect overlay */}
                            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-500/10 via-transparent to-transparent pointer-events-none"></div>
                            {/* Actual mockup image */}
                            <img src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80" alt="Dashboard Preview" className="rounded-xl opacity-40 mix-blend-overlay w-full object-cover h-[400px]" />
                        </div>
                    </div>
                </div>

                {/* Features Section */}
                <div id="features" className="max-w-7xl mx-auto px-6 py-32">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-bold mb-4">Everything you need to scale your team</h2>
                        <p className="text-zinc-400 max-w-2xl mx-auto">Stop digging through endless piles of resumes. Let our intelligent routing system bring the best candidates to the top.</p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        <div className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-2xl">
                            <div className="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 mb-6">
                                <div className="icon-bot text-emerald-500 text-xl"></div>
                            </div>
                            <h3 className="text-xl font-semibold mb-3">AI Triage & Scoring</h3>
                            <p className="text-zinc-400 leading-relaxed">Automatically evaluate incoming resumes against your job descriptions to instantly identify top, strong, and unqualified candidates.</p>
                        </div>

                        <div className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-2xl">
                            <div className="w-12 h-12 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/20 mb-6">
                                <div className="icon-arrow-right-left text-amber-500 text-xl"></div>
                            </div>
                            <h3 className="text-xl font-semibold mb-3">Cross-Team Referrals</h3>
                            <p className="text-zinc-400 leading-relaxed">Candidate didn't fit your role but is great for another? Automatically route them to other hiring managers internally.</p>
                        </div>

                        <div className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-2xl">
                            <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20 mb-6">
                                <div className="icon-calendar-check text-blue-500 text-xl"></div>
                            </div>
                            <h3 className="text-xl font-semibold mb-3">Seamless Scheduling</h3>
                            <p className="text-zinc-400 leading-relaxed">Advance a candidate and immediately propose open slots on your calendar or send a personalized booking link.</p>
                        </div>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="border-t border-zinc-900 bg-zinc-950 py-12">
                <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-2">
                        <div className="icon-search text-zinc-500"></div>
                        <span className="font-medium text-zinc-400">Second Look</span>
                    </div>
                    <div className="text-sm text-zinc-500">
                        &copy; {new Date().getFullYear()} Second Look Inc. All rights reserved.
                    </div>
                </div>
            </footer>
        </div>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ErrorBoundary><LandingPage /></ErrorBoundary>);
