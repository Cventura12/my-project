import { useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Eye, CircleCheck } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export const Landing = () => {
  const navigate = useNavigate();
  const navRef = useRef(null);
  const heroRef = useRef(null);
  const h1Ref = useRef(null);
  const h2Ref = useRef(null);
  const subtitleRef = useRef(null);
  const buttonsRef = useRef(null);
  const featuresRef = useRef(null);
  const footerRef = useRef(null);

  const features = [
    {
      icon: MessageSquare,
      title: 'Morning Check-in',
      description: "Tell us what's on your plate. No categories, no labels. Just what's there.",
    },
    {
      icon: Eye,
      title: 'Coach Signal',
      description: 'Your coach reads the AI-prepared brief and sends back one clear anchor for the day.',
    },
    {
      icon: CircleCheck,
      title: 'Evening Reflection',
      description: 'Did your attention go where it mattered? A single question. Honest answer.',
    },
  ];

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Navbar slide down
      gsap.from(navRef.current, {
        y: -30,
        opacity: 0,
        duration: 0.8,
        ease: 'power3.out',
      });

      // Hero title lines
      gsap.from(h1Ref.current, {
        y: 60,
        opacity: 0,
        duration: 1,
        delay: 0.3,
        ease: 'power3.out',
      });

      gsap.from(h2Ref.current, {
        y: 60,
        opacity: 0,
        duration: 1,
        delay: 0.5,
        ease: 'power3.out',
      });

      // Subtitle fade up
      gsap.from(subtitleRef.current, {
        y: 30,
        opacity: 0,
        duration: 0.8,
        delay: 0.8,
        ease: 'power2.out',
      });

      // Buttons pop in
      gsap.from(buttonsRef.current.children, {
        y: 20,
        opacity: 0,
        scale: 0.95,
        duration: 0.6,
        delay: 1.1,
        stagger: 0.15,
        ease: 'back.out(1.7)',
      });

      // Feature cards stagger with scroll trigger
      gsap.from(featuresRef.current.children, {
        y: 50,
        opacity: 0,
        duration: 0.7,
        stagger: 0.2,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: featuresRef.current,
          start: 'top 85%',
          toggleActions: 'play none none none',
        },
      });

      // Footer fade in
      gsap.from(footerRef.current, {
        opacity: 0,
        duration: 0.6,
        scrollTrigger: {
          trigger: footerRef.current,
          start: 'top 95%',
          toggleActions: 'play none none none',
        },
      });
    });

    return () => ctx.revert();
  }, []);

  return (
    <div className="min-h-screen bg-white overflow-hidden">
      {/* Navbar */}
      <nav ref={navRef} className="flex items-center justify-between px-8 py-4 max-w-6xl mx-auto">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
              <span className="text-white font-bold text-lg">O</span>
            </div>
            <span className="text-xl font-bold text-slate-900">OBLIGO</span>
          </div>
          <a
            href="#features"
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            Features
          </a>
        </div>
        <button
          onClick={() => navigate('/login')}
          className="px-5 py-2 bg-slate-900 text-white text-sm font-medium rounded-full hover:bg-slate-800 transition-colors"
        >
          Login
        </button>
      </nav>

      {/* Gradient line */}
      <div className="h-[1px] bg-gradient-to-r from-transparent via-gray-200 to-transparent" />

      {/* Hero */}
      <section ref={heroRef} className="max-w-4xl mx-auto px-8 pt-24 pb-16 text-center">
        <h1 ref={h1Ref} className="text-5xl font-bold text-slate-900 leading-tight">
          One signal. Every morning.
        </h1>
        <h2 ref={h2Ref} className="text-5xl font-bold text-gray-400 leading-tight mt-1">
          From a coach who knows what matters.
        </h2>
        <p ref={subtitleRef} className="text-lg text-gray-500 mt-6 max-w-2xl mx-auto leading-relaxed">
          AI prepares the brief. Your coach reads the signal. You get one clear
          anchor for where your attention should go today.
        </p>
        <div ref={buttonsRef} className="flex items-center justify-center gap-4 mt-8">
          <button
            onClick={() => navigate('/signup')}
            className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white text-sm font-medium rounded-full hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/10"
          >
            Get Started
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
          <button
            onClick={() => navigate('/login')}
            className="px-6 py-3 border border-gray-300 text-gray-700 text-sm font-medium rounded-full hover:bg-gray-50 transition-colors"
          >
            View Demo
          </button>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-5xl mx-auto px-8 py-20">
        <div ref={featuresRef} className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="p-6 rounded-2xl border border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6 text-slate-700" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {feature.title}
                </h3>
                <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <footer ref={footerRef} className="border-t border-gray-100 py-8 px-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <p className="text-sm text-gray-400">
            &copy; 2026 Obligo Inc. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <span className="text-sm text-gray-400 hover:text-gray-600 cursor-pointer transition-colors">
              Privacy
            </span>
            <span className="text-sm text-gray-400 hover:text-gray-600 cursor-pointer transition-colors">
              Terms
            </span>
            <span className="text-sm text-gray-400 hover:text-gray-600 cursor-pointer transition-colors">
              Contact
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
};
