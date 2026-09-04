import './splash-screen.css';

export function SplashScreen() {
  return (
    <div className="splash-screen fixed inset-0 z-50 flex items-center justify-center overflow-hidden">
      {/* Background */}
      <div className="splash-background" aria-hidden="true" />
      <div className="splash-background-overlay" aria-hidden="true" />

      {/* Upper-right tagline */}
      <div className="splash-upper-right absolute right-8 top-8 text-xs font-medium tracking-wide text-white/80 sm:right-10 sm:top-10">
        Teams work better together
      </div>

      {/* Center branding */}
      <div className="relative z-10 flex flex-col items-center px-6 text-center">
        <img
          src="/Teamspace%20One.svg"
          alt="Teamspace One"
          className="splash-logo"
          draggable={false}
        />

        <img
          src="/Teamspace%20One-Splash-logo.svg"
          alt="Teamspace One"
          className="splash-product-name mt-4"
          draggable={false}
        />

        <p className="splash-tagline mt-2 text-[10px] font-medium uppercase tracking-[0.22em] text-white/60 sm:text-xs">
          PEOPLE{' · '}IDEAS{' · '}PROGRESS TOGETHER
        </p>

        <div className="splash-loader mt-8">
          <svg className="splash-spinner" viewBox="0 0 24 24" aria-hidden="true">
            <defs>
              <linearGradient
                id="splash-spinner-gradient"
                x1="0"
                y1="0"
                x2="24"
                y2="24"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor="#0ab2fe" />
                <stop offset="100%" stopColor="#a063fc" />
              </linearGradient>
            </defs>
            <circle cx="12" cy="12" r="9" />
          </svg>
        </div>

        <p className="splash-loading-text mt-3 text-xs text-white/50">Loading...</p>
      </div>

      {/* Bottom tagline */}
      <div className="splash-bottom absolute bottom-10 left-0 right-0 z-10 flex flex-col items-center px-6">
        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/60 sm:text-xs">
          A BRIGHTER WAY TO COLLABORATE
        </p>
        <div className="splash-bottom-line mt-3" />
      </div>
    </div>
  );
}
