import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import gsap from 'gsap';

export const CheckIn = () => {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();
  const containerRef = useRef(null);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const displayName = user?.email?.split('@')[0]?.replace(/\d+$/, '') || '';
  const capitalizedName = displayName.charAt(0).toUpperCase() + displayName.slice(1);

  useEffect(() => {
    const checkToday = async () => {
      try {
        const data = await api.getTodayStatus(user.id);
        if (data.status === 'complete' && data.response) {
          navigate('/response', { replace: true });
          return;
        }
      } catch {
        // No entry yet, show check-in form
      }
      setChecking(false);
    };
    checkToday();
  }, [user, navigate]);

  useEffect(() => {
    if (!checking && containerRef.current) {
      const ctx = gsap.context(() => {
        gsap.from(containerRef.current.children, {
          y: 20,
          opacity: 0,
          duration: 0.6,
          stagger: 0.15,
          ease: 'power2.out',
        });
      });
      return () => ctx.revert();
    }
  }, [checking]);

  const handleSubmit = async () => {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    try {
      const data = await api.submitCheckIn(user.id, text.trim());
      if (data.status === 'complete' || data.status === 'already_submitted') {
        navigate('/response');
      }
    } catch {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && e.metaKey) {
      handleSubmit();
    }
  };

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <h1 className="text-2xl font-semibold text-slate-900">
        {getGreeting()}{capitalizedName ? `, ${capitalizedName}` : ''}.
      </h1>

      <p className="text-gray-500 mt-2 text-lg">
        What's on your plate today?
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Just write what comes to mind. No categories, no tags. Just what's there."
        className="w-full mt-8 p-4 border border-gray-200 rounded-lg text-base text-slate-900 placeholder:text-gray-300 resize-none focus:outline-none focus:border-gray-400 transition-colors min-h-[160px] font-sans"
        autoFocus
        disabled={submitting}
      />

      <div className="mt-6 flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || submitting}
          className="px-6 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-full hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {submitting ? 'Handing off...' : 'Hand off to coach'}
        </button>
      </div>
    </div>
  );
};
