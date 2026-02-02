import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import gsap from 'gsap';

export const CoachResponse = () => {
  const [response, setResponse] = useState(null);
  const [entryId, setEntryId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [eveningSignal, setEveningSignal] = useState(null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const eveningRef = useRef(null);

  const isEvening = new Date().getHours() >= 17;

  useEffect(() => {
    const fetchToday = async () => {
      try {
        const data = await api.getTodayStatus(user.id);
        if (data.status === 'no_entry') {
          navigate('/check-in', { replace: true });
          return;
        }
        if (data.response) {
          setResponse(data.response);
          setEntryId(data.entry?.id);
          if (data.evening_signal) {
            setEveningSignal(data.evening_signal.response);
          }
        } else {
          // Still processing, poll
          const interval = setInterval(async () => {
            const updated = await api.getTodayStatus(user.id);
            if (updated.response) {
              setResponse(updated.response);
              setEntryId(updated.entry?.id);
              clearInterval(interval);
            }
          }, 3000);
          return () => clearInterval(interval);
        }
      } catch {
        navigate('/check-in', { replace: true });
      } finally {
        setLoading(false);
      }
    };
    fetchToday();
  }, [user, navigate]);

  useEffect(() => {
    if (response && containerRef.current) {
      const sections = containerRef.current.querySelectorAll('[data-animate]');
      gsap.from(sections, {
        y: 15,
        opacity: 0,
        duration: 0.5,
        stagger: 0.2,
        ease: 'power2.out',
        delay: 0.2,
      });
    }
  }, [response]);

  const handleEveningSignal = async (value) => {
    try {
      await api.submitEveningSignal(entryId, value);
      setEveningSignal(value);
      if (eveningRef.current) {
        gsap.from(eveningRef.current, {
          y: 10,
          opacity: 0,
          duration: 0.4,
          ease: 'power2.out',
        });
      }
    } catch {
      // Silently fail
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-gray-400 text-sm">Your coach is reviewing...</p>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-gray-400 text-sm">Your coach is reviewing...</p>
      </div>
    );
  }

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div ref={containerRef}>
      <p className="text-sm text-gray-400 font-medium" data-animate>
        {today}
      </p>

      <div className="mt-8" data-animate>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          What stands out
        </h2>
        <p className="mt-2 text-lg text-slate-900 leading-relaxed">
          {response.what_stands_out}
        </p>
      </div>

      <div className="mt-8" data-animate>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Why it matters
        </h2>
        <p className="mt-2 text-lg text-slate-900 leading-relaxed">
          {response.why_it_matters}
        </p>
      </div>

      <div className="mt-8 p-6 bg-gray-50 rounded-lg" data-animate>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Today's anchor
        </h2>
        <p className="mt-2 text-lg text-slate-900 leading-relaxed font-medium">
          {response.todays_anchor}
        </p>
      </div>

      {isEvening && !eveningSignal && (
        <div className="mt-12 pt-8 border-t border-gray-100" data-animate>
          <p className="text-base text-slate-900">
            Did your attention go where it mattered today?
          </p>
          <div className="flex gap-3 mt-4">
            {['Yes', 'Partially', 'No'].map((option) => (
              <button
                key={option}
                onClick={() => handleEveningSignal(option.toLowerCase())}
                className="px-5 py-2 border border-gray-200 rounded-full text-sm text-gray-600 hover:border-gray-400 hover:text-slate-900 transition-colors"
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )}

      {eveningSignal && (
        <div ref={eveningRef} className="mt-12 pt-8 border-t border-gray-100">
          <p className="text-sm text-gray-400">
            Noted. See you tomorrow.
          </p>
        </div>
      )}
    </div>
  );
};
