import { useState } from 'react'
import {
  Sparkles, TrendingUp, LineChart, Target, PieChart, BarChart3,
  Lock, User, Eye, EyeOff, ArrowRight, ShieldCheck, AlertCircle,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

/** Plays the exit animation on successful submit, then commits the auth flip. */
const EXIT_DURATION_MS = 550

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isExiting, setIsExiting] = useState(false)
  const { validate, login } = useAuth()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!validate(username, password)) {
      setError('Invalid username or password. Please try again.')
      return
    }
    setIsExiting(true)
    window.setTimeout(() => {
      login(username, password)
    }, EXIT_DURATION_MS)
  }

  return (
    <div
      className={`min-h-screen relative overflow-hidden text-white
                  bg-gradient-to-br from-[#070d1f] via-[#0a1428] to-[#091020]
                  ${isExiting ? 'animate-login-exit pointer-events-none' : 'animate-fade-in'}`}
    >
      {/* ====================================================================
          SHARED BACKGROUND LAYER — spans full viewport so the seam between
          the two panels disappears. Aurora, grid, particles all live here.
      ==================================================================== */}

      {/* Aurora blobs that cross the center seam */}
      <div
        className="absolute -top-40 left-1/4 w-[720px] h-[600px] rounded-full
                   bg-gradient-to-br from-blue-600/35 via-cyan-500/30 to-sky-500/25
                   blur-3xl animate-aurora pointer-events-none"
      />
      <div
        className="absolute -bottom-44 right-1/4 w-[680px] h-[560px] rounded-full
                   bg-gradient-to-br from-cyan-500/30 via-blue-600/30 to-indigo-700/25
                   blur-3xl animate-aurora pointer-events-none"
        style={{ animationDelay: '6s' }}
      />
      <div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full
                   bg-gradient-to-br from-teal-500/20 via-cyan-500/20 to-blue-600/15
                   blur-3xl animate-aurora pointer-events-none"
        style={{ animationDelay: '3s' }}
      />

      {/* Continuous grid across whole viewport */}
      <div
        className="absolute inset-0 pointer-events-none
                   bg-[linear-gradient(rgba(125,211,252,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(125,211,252,0.05)_1px,transparent_1px)]
                   bg-[size:60px_60px]
                   [mask-image:radial-gradient(ellipse_85%_70%_at_50%_50%,black,transparent)]"
      />

      {/* Horizontal scan line — slow sweep across full width */}
      <div
        aria-hidden
        className="absolute top-[40%] w-[20%] h-px pointer-events-none animate-scan-x"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.6), transparent)',
          boxShadow: '0 0 14px rgba(34,211,238,0.5)',
        }}
      />
      <div
        aria-hidden
        className="absolute top-[70%] w-[15%] h-px pointer-events-none animate-scan-x"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(125,211,252,0.5), transparent)',
          boxShadow: '0 0 10px rgba(125,211,252,0.4)',
          animationDelay: '3s',
        }}
      />

      {/* Floating particles across the entire width */}
      {[
        { left: '6%',  delay: '0s',   size: 4 },
        { left: '14%', delay: '1.6s', size: 3 },
        { left: '22%', delay: '3.2s', size: 4 },
        { left: '32%', delay: '5.0s', size: 3 },
        { left: '42%', delay: '2.4s', size: 5 },
        { left: '58%', delay: '0.8s', size: 3 },
        { left: '68%', delay: '4.2s', size: 4 },
        { left: '78%', delay: '1.2s', size: 4 },
        { left: '86%', delay: '3.6s', size: 3 },
        { left: '94%', delay: '5.8s', size: 4 },
      ].map((p, i) => (
        <span
          key={i}
          className="pointer-events-none absolute bottom-0 rounded-full bg-cyan-400 animate-float-up"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            animationDelay: p.delay,
            animationDuration: '9s',
            boxShadow: '0 0 12px rgba(34, 211, 238, 0.85)',
          }}
        />
      ))}

      {/* ====================================================================
          PANEL ROW — 60/40 split. Left panel slightly wider so it bleeds
          into the right side rather than feeling like two separate halves.
      ==================================================================== */}
      <div className="relative z-10 min-h-screen flex flex-col lg:flex-row">

        {/* ============ LEFT PANEL — animated MF visual ============ */}
        <div className="relative hidden lg:flex lg:basis-[58%] items-center justify-center px-12 overflow-hidden">

          {/* Center content */}
          <div className="relative z-10 max-w-xl animate-fade-in-up">

            {/* Logo block with pulsing rings */}
            <div className="flex items-center gap-3 mb-10 relative">
              {/* Concentric pulse rings */}
              <span
                aria-hidden
                className="absolute left-0 top-0 w-14 h-14 rounded-2xl
                           ring-2 ring-cyan-400/40 animate-ring-pulse pointer-events-none"
              />
              <span
                aria-hidden
                className="absolute left-0 top-0 w-14 h-14 rounded-2xl
                           ring-2 ring-cyan-400/30 animate-ring-pulse pointer-events-none"
                style={{ animationDelay: '1s' }}
              />
              <span
                aria-hidden
                className="absolute left-0 top-0 w-14 h-14 rounded-2xl
                           ring-2 ring-cyan-400/20 animate-ring-pulse pointer-events-none"
                style={{ animationDelay: '2s' }}
              />

              <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500
                              flex items-center justify-center shadow-glow ring-1 ring-white/20">
                <Sparkles className="w-7 h-7 text-white animate-sparkle" strokeWidth={2.4} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white leading-tight">MF Analytics</h1>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  </span>
                  <p className="text-xs text-cyan-200/80 tracking-wider uppercase font-semibold">AMFI Data Portal · Live</p>
                </div>
              </div>
            </div>

            {/* Headline */}
            <h2 className="text-[2.6rem] font-bold leading-[1.05] mb-6 text-white">
              Decode India's{' '}
              <span className="bg-gradient-to-r from-blue-300 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                mutual fund universe
              </span>
            </h2>

            <p className="text-base text-slate-300/80 leading-relaxed mb-8 max-w-lg">
              ₹50+ lakh crore AUM. 16,000+ active schemes. Live NAV, returns, AUM trends,
              risk metrics &amp; goal planning — all in one premium analytics suite.
            </p>

            {/* Live stats row */}
            <div className="grid grid-cols-3 gap-4 mb-8 max-w-md">
              {[
                { value: '16,379', label: 'Schemes' },
                { value: '53',     label: 'AMCs' },
                { value: '₹50L+',  label: 'Cr AUM' },
              ].map((s, idx) => (
                <div
                  key={s.label}
                  className="relative px-3 py-2.5 rounded-xl bg-white/[0.04] backdrop-blur-md ring-1 ring-cyan-400/15
                             hover:ring-cyan-400/40 transition-all duration-300 group"
                  style={{ animation: `fade-in-up 0.5s ease-out ${0.4 + idx * 0.12}s both` }}
                >
                  <div className="text-lg font-bold bg-gradient-to-r from-white to-cyan-200 bg-clip-text text-transparent animate-count-pulse"
                       style={{ animationDelay: `${idx * 0.7}s` }}>
                    {s.value}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mt-0.5">
                    {s.label}
                  </div>
                  {/* tiny live dot per card */}
                  <span className="absolute top-2 right-2 flex h-1.5 w-1.5">
                    <span className="absolute inset-0 rounded-full bg-cyan-400 animate-ping opacity-60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-400" />
                  </span>
                </div>
              ))}
            </div>

            {/* Feature pills */}
            <div className="flex flex-wrap gap-2">
              {[
                { I: TrendingUp,  label: 'Daily NAV' },
                { I: LineChart,   label: 'Returns & Risk' },
                { I: PieChart,    label: 'Analytics' },
                { I: Target,      label: 'Goal Planning' },
                { I: BarChart3,   label: 'AUM Trends' },
              ].map(({ I, label }, idx) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
                             bg-white/[0.06] backdrop-blur-md ring-1 ring-white/15
                             text-xs font-medium text-white
                             hover:bg-white/[0.1] hover:ring-cyan-400/40 transition-all duration-300
                             animate-fade-in-up"
                  style={{ animationDelay: `${idx * 100 + 700}ms` }}
                >
                  <I size={13} className="text-cyan-300" />
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Floating currency / percent symbols (left side only) */}
          {[
            { glyph: '₹',  left: '6%',   delay: '0s',   size: 'text-4xl' },
            { glyph: '%',  left: '16%',  delay: '1.4s', size: 'text-3xl' },
            { glyph: '↑',  left: '85%',  delay: '0.7s', size: 'text-4xl' },
            { glyph: '%',  left: '92%',  delay: '2.1s', size: 'text-2xl' },
            { glyph: '↑',  left: '75%',  delay: '3.5s', size: 'text-3xl' },
          ].map(({ glyph, left, delay, size }, i) => (
            <span
              key={i}
              className={`pointer-events-none absolute bottom-0 ${size} font-bold
                          bg-gradient-to-br from-cyan-300 to-sky-400 bg-clip-text text-transparent
                          animate-float-up`}
              style={{ left, animationDelay: delay, animationDuration: '7s' }}
            >
              {glyph}
            </span>
          ))}

          {/* Animated chart line at bottom — with traveling pulse dot */}
          <svg
            className="absolute bottom-0 left-0 w-full h-44 pointer-events-none"
            preserveAspectRatio="none"
            viewBox="0 0 800 200"
          >
            <defs>
              <linearGradient id="login-chart-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#22d3ee" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="login-chart-stroke" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%"   stopColor="#60a5fa" />
                <stop offset="50%"  stopColor="#22d3ee" />
                <stop offset="100%" stopColor="#5eead4" />
              </linearGradient>
            </defs>
            <path
              d="M 0,170 L 80,150 L 160,160 L 240,120 L 320,135 L 400,90 L 480,105 L 560,60 L 640,75 L 720,40 L 800,30 L 800,200 L 0,200 Z"
              fill="url(#login-chart-fill)"
            />
            <path
              id="login-chart-line"
              d="M 0,170 L 80,150 L 160,160 L 240,120 L 320,135 L 400,90 L 480,105 L 560,60 L 640,75 L 720,40 L 800,30"
              fill="none"
              stroke="url(#login-chart-stroke)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ strokeDasharray: 800, animation: 'draw-line 3.2s ease-out forwards' }}
            />
            {/* Pulsing data-point circles */}
            {[
              [80, 150], [240, 120], [400, 90], [560, 60], [720, 40],
            ].map(([x, y], i) => (
              <g key={i}>
                {/* outer expanding ring */}
                <circle
                  cx={x}
                  cy={y}
                  r="4"
                  fill="none"
                  stroke="#22d3ee"
                  strokeWidth="1.5"
                  opacity="0"
                  style={{
                    transformOrigin: `${x}px ${y}px`,
                    animation: `ring-pulse 2.4s ease-out ${2.5 + i * 0.4}s infinite`,
                  }}
                />
                {/* solid core */}
                <circle
                  cx={x}
                  cy={y}
                  r="4"
                  fill="#fff"
                  stroke="#22d3ee"
                  strokeWidth="2"
                  opacity="0"
                  style={{ animation: `fade-in 0.5s ease-out ${1.5 + i * 0.3}s forwards` }}
                />
              </g>
            ))}
            {/* A traveling pulse along the line — uses CSS offset-path */}
            <circle
              r="5"
              fill="#22d3ee"
              opacity="0"
              style={{
                offsetPath: 'path("M 0,170 L 80,150 L 160,160 L 240,120 L 320,135 L 400,90 L 480,105 L 560,60 L 640,75 L 720,40 L 800,30")',
                animation: 'travel-dot 5s ease-in-out 3.5s infinite, fade-in 0.4s ease-out 3.5s forwards',
                filter: 'drop-shadow(0 0 8px rgba(34,211,238,0.9))',
              } as React.CSSProperties}
            />
          </svg>
        </div>

        {/* ============ RIGHT PANEL — minimal glass form ============ */}
        <div className="relative flex-1 lg:basis-[42%] flex flex-col items-center justify-center px-6 py-12">

          <div className="relative z-10 w-full max-w-md">

            {/* Mobile-only logo */}
            <div className="lg:hidden flex items-center gap-2.5 justify-center mb-8">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500
                              flex items-center justify-center shadow-glow">
                <Sparkles className="w-5 h-5 text-white animate-sparkle" />
              </div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-white to-cyan-200 bg-clip-text text-transparent">
                MF Analytics
              </h1>
            </div>

            {/* Eyebrow with live cyan dot */}
            <div className="flex justify-center mb-5 animate-fade-in-down">
              <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em]
                               text-cyan-200
                               bg-white/[0.04] backdrop-blur-md
                               ring-1 ring-cyan-400/25
                               px-3.5 py-1.5 rounded-full">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inset-0 rounded-full bg-cyan-400 animate-ping opacity-70" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-400" />
                </span>
                <ShieldCheck size={11} strokeWidth={2.5} className="text-cyan-300" />
                Secure sign in
              </span>
            </div>

            {/* Headline */}
            <div className="text-center mb-2 animate-fade-in-down" style={{ animationDelay: '60ms' }}>
              <h2 className="text-[2.3rem] font-bold leading-[1.05] tracking-tight">
                <span className="bg-gradient-to-br from-white via-sky-100 to-cyan-200 bg-clip-text text-transparent">
                  Welcome to MF Analytics
                </span>
              </h2>
            </div>
            <p className="text-center text-sm font-medium text-slate-400 mb-8 animate-fade-in-down"
               style={{ animationDelay: '110ms' }}>
              Sign in to explore India's mutual fund universe
            </p>

            {/* Glass form card — true frosted dark glass */}
            <div className="relative animate-fade-in-up" style={{ animationDelay: '160ms' }}>
              <form
                onSubmit={handleSubmit}
                className="relative
                           bg-white/[0.04]
                           backdrop-blur-2xl
                           rounded-2xl
                           ring-1 ring-white/[0.08]
                           shadow-[0_24px_60px_-15px_rgba(0,0,0,0.5)]
                           p-7 space-y-5"
              >
                {/* Top edge highlight */}
                <div
                  aria-hidden
                  className="absolute top-0 left-6 right-6 h-px
                             bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent
                             pointer-events-none"
                />

                {/* Username / Mobile */}
                <div>
                  <label className="text-[11px] font-bold text-slate-100 mb-2 block tracking-wide">
                    Email or Mobile Number
                  </label>
                  <div className="relative group">
                    <User
                      size={16}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2
                                 text-slate-300 group-focus-within:text-cyan-400
                                 transition-colors duration-200 pointer-events-none z-10"
                    />
                    <input
                      type="text"
                      inputMode="text"
                      autoComplete="username"
                      required
                      value={username}
                      onChange={(e) => { setUsername(e.target.value); if (error) setError(null) }}
                      placeholder="9167058416"
                      className="w-full pl-10 pr-4 py-3 rounded-xl
                                 border border-white/10
                                 bg-white/[0.03]
                                 text-sm font-medium text-white placeholder-slate-300
                                 hover:border-white/20 hover:bg-white/[0.05]
                                 focus:outline-none focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20
                                 focus:bg-white/[0.06]
                                 transition-all duration-300"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="text-[11px] font-bold text-slate-100 mb-2 block tracking-wide">
                    Password
                  </label>
                  <div className="relative group">
                    <Lock
                      size={16}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2
                                 text-slate-300 group-focus-within:text-cyan-400
                                 transition-colors duration-200 pointer-events-none z-10"
                    />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); if (error) setError(null) }}
                      placeholder="Enter your password"
                      className="w-full pl-10 pr-11 py-3 rounded-xl
                                 border border-white/10
                                 bg-white/[0.03]
                                 text-sm font-medium text-white placeholder-slate-300
                                 hover:border-white/20 hover:bg-white/[0.05]
                                 focus:outline-none focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20
                                 focus:bg-white/[0.06]
                                 transition-all duration-300"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg z-10
                                 text-slate-500 hover:text-cyan-300
                                 hover:bg-white/[0.06]
                                 transition-all duration-200 hover:scale-110"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Error banner */}
                {error && (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 p-3.5 rounded-xl
                               bg-rose-500/10 backdrop-blur-sm
                               ring-1 ring-rose-500/30
                               text-sm font-medium text-rose-300
                               animate-fade-in-up"
                  >
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={!username || !password || isExiting}
                  className="group/btn relative w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-xl
                             text-sm font-bold tracking-wide text-white
                             bg-gradient-to-r from-blue-600 to-purple-600
                             hover:from-blue-700 hover:to-purple-700
                             shadow-lg shadow-blue-500/40
                             transition-all duration-300 ease-out
                             hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-purple-500/50
                             active:scale-[0.98] active:translate-y-0
                             disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:shadow-lg
                             overflow-hidden"
                >
                  <span
                    aria-hidden
                    className="absolute inset-0 pointer-events-none
                               bg-gradient-to-r from-transparent via-white/30 to-transparent
                               -translate-x-full group-hover/btn:translate-x-full
                               transition-transform duration-700 ease-out"
                  />
                  {isExiting ? (
                    <>
                      <span className="relative w-4 h-4 border-[2.5px] border-white/30 border-t-white rounded-full animate-spin" />
                      <span className="relative">Entering dashboard…</span>
                    </>
                  ) : (
                    <>
                      <span className="relative">Sign in to dashboard</span>
                      <ArrowRight size={16} className="relative transition-transform duration-300 group-hover/btn:translate-x-1" />
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Footer */}
            <div className="mt-8 text-center space-y-2 animate-fade-in-up" style={{ animationDelay: '260ms' }}>
              <p className="text-xs font-semibold text-slate-300">
                ©&nbsp;2026&nbsp;
                <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent font-bold">
                  K2VS Finance and Investment Private Limited
                </span>
              </p>
              <p className="text-[10px] font-medium text-slate-500 tracking-[0.22em] uppercase">
                v2.0.2&nbsp;·&nbsp;AMFI-licensed&nbsp;data
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
