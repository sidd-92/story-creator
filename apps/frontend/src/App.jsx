import { useState, useRef, useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GENRES = [
  { label: '🌿 Nature', value: 'Nature' },
  { label: '🐾 Animals', value: 'Animals' },
  { label: '🚗 Cars', value: 'Cars' },
  { label: '🧸 Toys', value: 'Toys' },
  { label: '🌟 Mythology', value: 'Mythology' },
  { label: '🚀 Space', value: 'Space' },
];

const AGE_GROUPS = [
  { label: '👶 Under 3', value: 'Less than 3' },
  { label: '🌈 Ages 3–5', value: 'From 3 to 5' },
  { label: '⚡ Ages 6–8', value: '6 to 8' },
  { label: '🔭 Ages 8+', value: 'above 8' },
];

const DURATIONS = [
  { label: '20s',   value: 20,  desc: 'Quick Tale' },
  { label: '1 min', value: 60,  desc: 'Short Story' },
  { label: '2 min', value: 120, desc: 'Bedtime Story' },
  { label: '3 min', value: 180, desc: 'Long Story' },
  { label: '5 min', value: 300, desc: 'Epic Tale' },
];

const VIDEO_DURATIONS = [
  { label: '4s', value: 4 },
  { label: '5s', value: 5 },
  { label: '6s', value: 6 },
  { label: '7s', value: 7 },
  { label: '8s', value: 8 },
];

const LS_KEY = 'sc_google_api_key';
const POLL_MS = 3000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5)   return 'just now';
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// ---------------------------------------------------------------------------
// Notification History Sidebar
// ---------------------------------------------------------------------------

function NotificationSidebar({ history, onClose, onClearAll }) {
  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 999 }}
        onClick={onClose}
      />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 340,
        zIndex: 1000,
        background: 'linear-gradient(160deg, rgba(18,12,40,0.98) 0%, rgba(10,8,28,0.98) 100%)',
        borderLeft: '1px solid var(--border-color)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '-12px 0 40px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 18px 16px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 8 }}>
            🔔 Creation History
          </span>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {history.length > 0 && (
              <button
                onClick={onClearAll}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'var(--font-family)', padding: 0 }}
              >
                Clear all
              </button>
            )}
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.4rem', lineHeight: 1, padding: 0 }}
            >×</button>
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {history.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '48px 20px' }}>
              <div style={{ fontSize: '2rem', marginBottom: 10 }}>📖</div>
              <p style={{ margin: 0, fontSize: '0.85rem' }}>No creations yet — stories you generate will appear here.</p>
            </div>
          ) : (
            [...history].reverse().map(item => (
              <div key={item.jobId} style={{
                padding: '12px 14px', borderRadius: 12,
                background: item.status === 'completed'
                  ? 'rgba(72,187,120,0.07)' : 'rgba(220,50,50,0.07)',
                border: `1px solid ${item.status === 'completed' ? 'rgba(72,187,120,0.2)' : 'rgba(220,50,50,0.2)'}`,
                display: 'flex', gap: 12, alignItems: 'flex-start',
              }}>
                <span style={{ fontSize: '1.1rem', flexShrink: 0, marginTop: 1 }}>
                  {item.status === 'completed' ? '✅' : '❌'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.title || 'Untitled Story'}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    {item.status === 'completed' ? '✨ Added to your library' : (
                      <>
                        <span style={{ color: 'var(--error)' }}>⚠️ {item.error || 'Generation failed'}</span>
                        {item.error && (
                          <div style={{ marginTop: 4, fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace', opacity: 0.8 }}>
                            {item.error.length > 100 ? item.error.slice(0, 100) + '…' : item.error}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 5, opacity: 0.7 }}>
                    {timeAgo(item.timestamp)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Active-Job Notification Bar (pending + brief completion flash)
// ---------------------------------------------------------------------------

function NotificationBar({ jobs, onDismiss }) {
  if (jobs.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
      {jobs.map(job => {
        const isPending = job.status === 'pending';
        const isDone    = job.status === 'completed';
        const isFailed  = job.status === 'failed';
        const bg     = isPending ? 'rgba(172,107,255,0.08)' : isDone ? 'rgba(72,187,120,0.1)'  : 'rgba(220,50,50,0.08)';
        const border = isPending ? 'rgba(172,107,255,0.25)' : isDone ? 'rgba(72,187,120,0.3)'  : 'rgba(220,50,50,0.3)';

        return (
          <div key={job.jobId} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 16px', borderRadius: 12,
            background: bg, border: `1px solid ${border}`,
            fontSize: '0.85rem', color: 'var(--text-main)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {isPending && (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  style={{ animation: 'spin 1.2s linear infinite', flexShrink: 0 }}>
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              )}
              {isDone && <span>✅</span>}
              {isFailed && <span>❌</span>}
              <span>
                {isPending && 'Creating your story in the background…'}
                {isDone && <><strong style={{ color: 'var(--accent-light)' }}>{job.title}</strong> is ready in your library!</>}
                {isFailed && <span style={{ color: 'var(--error)' }}>Failed: {job.error}</span>}
              </span>
            </div>
            {/* Manual dismiss for failed; completed auto-dismisses */}
            {isFailed && (
              <button onClick={() => onDismiss(job.jobId)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, flexShrink: 0 }}>×</button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Image Mode Modal
// ---------------------------------------------------------------------------

function ImageModeModal({ onSelect, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={onCancel}>
      <div className="glass"
        style={{ width: '100%', maxWidth: 500, padding: 32, borderRadius: 24, display: 'flex', flexDirection: 'column', gap: 20 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent-light)' }}>🖼️ Choose Image Style</h2>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.4rem', lineHeight: 1 }}>×</button>
        </div>
        <div style={{
          background: 'rgba(247,185,74,0.08)', border: '1px solid rgba(247,185,74,0.3)',
          borderRadius: 14, padding: '14px 16px', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6,
        }}>
          <strong style={{ color: 'var(--accent-light)' }}>⚡ Nano Banana model notice</strong><br />
          <strong>AI Image</strong> uses Google's Nano Banana model (<code style={{ fontSize: '0.78rem', background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: '1px 5px' }}>gemini-2.5-flash-image</code>) which may incur API costs. If it fails, the story will not be saved — try SVG instead.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button className="btn-magic" style={{ marginTop: 0 }} onClick={() => onSelect('ai')}>
            🤖 Use AI Image (Nano Banana)
          </button>
          <button onClick={() => onSelect('svg')} style={{
            background: 'rgba(99,179,237,0.1)', border: '1px solid rgba(99,179,237,0.3)',
            borderRadius: 16, color: 'var(--text-main)', fontFamily: 'var(--font-family)',
            fontWeight: 600, fontSize: '1rem', cursor: 'pointer', padding: '16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>
            🎨 Use SVG Illustration <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400 }}>(free &amp; fast)</span>
          </button>
          <button onClick={onCancel} style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)',
            borderRadius: 16, color: 'var(--text-muted)', fontFamily: 'var(--font-family)',
            fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', padding: '12px',
          }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error Modal
// ---------------------------------------------------------------------------

function ErrorModal({ message, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1001,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={onClose}>
      <div className="glass"
        style={{ width: '100%', maxWidth: 480, padding: 32, borderRadius: 24, display: 'flex', flexDirection: 'column', gap: 20 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--error)' }}>❌ Story Generation Failed</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.4rem', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ background: 'rgba(220,50,50,0.08)', border: '1px solid rgba(220,50,50,0.3)', borderRadius: 14, padding: '14px 16px', fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          {message}
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          💡 Tip: If AI image generation keeps failing, try <strong>SVG Illustration</strong> mode — it's free and always works.
        </div>
        <button className="btn-magic" style={{ marginTop: 0 }} onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings Modal
// ---------------------------------------------------------------------------

function SettingsModal({ onClose }) {
  const [draft, setDraft] = useState(() => localStorage.getItem(LS_KEY) || '');
  const [saved, setSaved] = useState(false);

  function handleSave() {
    const trimmed = draft.trim();
    if (trimmed) localStorage.setItem(LS_KEY, trimmed);
    else localStorage.removeItem(LS_KEY);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 800);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={onClose}>
      <div className="glass"
        style={{ width: '100%', maxWidth: 480, padding: 32, borderRadius: 24, display: 'flex', flexDirection: 'column', gap: 20 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, color: 'var(--accent-light)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>
            </svg>
            Settings
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.4rem', lineHeight: 1 }}>×</button>
        </div>
        <div className="form-group">
          <label style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.9rem' }}>Google AI Studio API Key</label>
          <div style={{ position: 'relative' }}>
            <input
              type="password" className="input-text"
              style={{ height: 'auto', padding: '14px 48px 14px 14px', width: '100%', borderRadius: 14 }}
              placeholder="AIza…" value={draft}
              onChange={e => setDraft(e.target.value)} autoComplete="off"
            />
            {draft && (
              <button onClick={() => { localStorage.removeItem(LS_KEY); setDraft(''); }} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem' }}>×</button>
            )}
          </div>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Stored only in your browser — never sent to the server. Get a free key at{' '}
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ color: 'var(--primary-light)' }}>aistudio.google.com</a>.
          </p>
        </div>
        <div style={{ background: 'rgba(172,107,255,0.08)', border: '1px solid rgba(172,107,255,0.2)', borderRadius: 14, padding: '14px 16px', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--primary-light)' }}>Why is this needed?</strong><br />
          Story Creator uses the Gemini API to write stories, generate illustrations, and narrate them.
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn-magic" style={{ flex: 1, marginTop: 0 }} onClick={handleSave}>{saved ? '✓ Saved!' : 'Save Key'}</button>
          <button onClick={onClose} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: 16, color: 'var(--text-main)', fontFamily: 'var(--font-family)', fontWeight: 600, fontSize: '1rem', cursor: 'pointer', padding: '16px' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story Card
// ---------------------------------------------------------------------------

function StoryCard({ story, onClick }) {
  const genreKey = (story.genre || '').toLowerCase();
  return (
    <div className="glass story-card" onClick={() => onClick(story)}>
      <div className="card-image-container">
        {story.coverImageUrl ? (
          <img className="card-image" src={story.coverImageUrl} alt={story.title}
            onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
        ) : null}
        <div style={{ width: '100%', height: '100%', display: story.coverImageUrl ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3.5rem', background: 'rgba(0,0,0,0.15)' }}>
          {GENRES.find(g => g.value === story.genre)?.label.split(' ')[0] || '📖'}
        </div>
        <span className={`card-badge ${genreKey}`}>{story.genre}</span>
      </div>
      <div className="card-content">
        <div><h3>{story.title}</h3><p>{story.storyText}</p></div>
        <div className="card-footer">
          <span>👶 {story.ageGroup}</span>
          <span>🎙 {story.voiceName || 'narrator'}</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audio Bar
// ---------------------------------------------------------------------------

function AudioBar({ story, audioRef, isPlaying, setIsPlaying }) {
  if (!story.narrationAudioUrl) return null;
  function togglePlay() {
    if (!audioRef.current) return;
    if (isPlaying) { audioRef.current.pause(); setIsPlaying(false); }
    else { audioRef.current.play(); setIsPlaying(true); }
  }
  return (
    <div className="audio-bar">
      <audio ref={audioRef} src={story.narrationAudioUrl} onEnded={() => setIsPlaying(false)} />
      <button className="play-circle-btn" onClick={togglePlay}>
        {isPlaying
          ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
          : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>}
      </button>
      <div className="audio-track-info">
        <span className="title">{story.title}</span>
        <span className="voice">🎙 {story.voiceName || 'narrator'}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Book Viewer
// ---------------------------------------------------------------------------

function BookViewer({ story, onBack }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentScene, setCurrentScene] = useState(0);

  function handleBack() { if (audioRef.current) audioRef.current.pause(); setIsPlaying(false); onBack(); }
  const sceneImages = story.storyboard?.length > 0 ? story.storyboard : [];

  useEffect(() => {
    if (!isPlaying || sceneImages.length <= 1) return;
    const i = setInterval(() => setCurrentScene(p => (p + 1) % sceneImages.length), 5000);
    return () => clearInterval(i);
  }, [isPlaying, sceneImages.length]);

  return (
    <div className="book-viewer">
      <button className="btn-back" onClick={handleBack}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        All Stories
      </button>
      <div className="book-layout">
        <div className="book-visuals">
          <div className="book-media-box">
            {story.videoUrl ? (
              <video src={story.videoUrl} controls autoPlay muted loop playsInline />
            ) : sceneImages.length > 0 ? (
              <img src={sceneImages[currentScene]?.imageUrl} alt={`Scene ${currentScene + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : story.coverImageUrl ? (
              <img src={story.coverImageUrl} alt={story.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '5rem' }}>
                {GENRES.find(g => g.value === story.genre)?.label.split(' ')[0] || '📖'}
              </div>
            )}
          </div>
          {sceneImages.length > 1 && (
            <div className="storyboard-dots">
              {sceneImages.map((_, i) => (
                <button key={i} className={`dot${currentScene === i ? ' active' : ''}`} onClick={() => setCurrentScene(i)} />
              ))}
            </div>
          )}
          <AudioBar story={story} audioRef={audioRef} isPlaying={isPlaying} setIsPlaying={setIsPlaying} />
        </div>
        <div className="glass book-content-card">
          <div>
            <div className="book-header">
              <h2>{story.title}</h2>
              <div className="book-meta">
                <span className="meta-pill">📚 {story.genre}</span>
                <span className="meta-pill">👶 {story.ageGroup}</span>
              </div>
            </div>
            <div className="book-text">{story.storyText}</div>
          </div>
          <div className="moral-box">
            <span className="moral-icon">💡</span>
            <div className="moral-text"><h4>Today's Moral</h4><p>{story.moral}</p></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings Button
// ---------------------------------------------------------------------------

function SettingsBtn({ hasKey, onClick }) {
  return (
    <button onClick={onClick} style={{
      position: 'relative', background: 'rgba(255,255,255,0.05)',
      border: `1px solid ${hasKey ? 'var(--border-color)' : 'var(--accent)'}`,
      borderRadius: 12, padding: '8px 14px',
      color: hasKey ? 'var(--text-muted)' : 'var(--accent)',
      fontFamily: 'var(--font-family)', fontWeight: 600, fontSize: '0.85rem',
      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3"/>
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
      </svg>
      {hasKey ? 'API Key ✓' : 'Add API Key'}
      {!hasKey && <span style={{ position: 'absolute', top: -4, right: -4, width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)', border: '2px solid var(--bg-main)' }} />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Bell Button
// ---------------------------------------------------------------------------

function BellBtn({ unread, onClick }) {
  return (
    <button onClick={onClick} style={{
      position: 'relative', background: 'rgba(255,255,255,0.05)',
      border: '1px solid var(--border-color)', borderRadius: 12, padding: '8px 12px',
      color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center',
    }}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 01-3.46 0"/>
      </svg>
      {unread > 0 && (
        <span style={{
          position: 'absolute', top: -2, right: -2,
          background: 'var(--accent)', width: 10, height: 10,
          borderRadius: '50%', border: '2px solid var(--bg-main)',
        }} />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------

export default function App() {
  const stories = useQuery(api.stories.list);

  const [genre, setGenre]               = useState('Nature');
  const [ageGroup, setAgeGroup]         = useState('From 3 to 5');
  const [prompt, setPrompt]             = useState('');
  const [durationSeconds, setDuration]  = useState(20);
  const [enableVeo, setEnableVeo]       = useState(false);
  const [videoDurationSeconds, setVideoDuration] = useState(5);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedStory, setSelectedStory] = useState(null);
  const [showSettings, setShowSettings]   = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [errorModal, setErrorModal]       = useState(null);

  // Active jobs shown in the inline bar (pending + brief flash on done/failed)
  const [activeJobs, setActiveJobs]     = useState([]);
  // Full history shown in the sidebar (persisted in localStorage)
  const [history, setHistory]           = useState(() => {
    try {
      const saved = localStorage.getItem('sc_creation_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showSidebar, setShowSidebar]   = useState(false);
  const [unread, setUnread]             = useState(0);

  const apiKey = localStorage.getItem(LS_KEY) || '';

  // Persist history to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('sc_creation_history', JSON.stringify(history));
  }, [history]);

  // Keep a ref so the polling interval can always see fresh activeJobs
  // without being recreated every render (prevents the 304-spam loop).
  const activeJobsRef = useRef(activeJobs);
  useEffect(() => { activeJobsRef.current = activeJobs; }, [activeJobs]);

  // Single polling interval — created once, reads from ref
  useEffect(() => {
    const interval = setInterval(async () => {
      const pending = activeJobsRef.current.filter(j => j.status === 'pending');
      if (pending.length === 0) return;

      const updates = await Promise.all(
        pending.map(async job => {
          try {
            const res = await fetch(`/api/job/${job.jobId}`);
            if (!res.ok) return null;
            return await res.json(); // {jobId, status, title, error, storyId}
          } catch { return null; }
        })
      );

      const finished = updates.filter(u => u && u.status !== 'pending');
      if (finished.length === 0) return;

      // Update job statuses in the bar
      setActiveJobs(prev =>
        prev.map(j => {
          const u = updates.find(u => u && u.jobId === j.jobId);
          return u ? { ...j, ...u } : j;
        })
      );

      // For each finished job: add to history, auto-dismiss bar entry
      finished.forEach(job => {
        let alreadyRecorded = false;
        setHistory(prev => {
          if (prev.some(h => h.jobId === job.jobId)) {
            alreadyRecorded = true;
            return prev;
          }
          const updated = [...prev, {
            jobId: job.jobId,
            title: job.title,
            status: job.status,
            error: job.error,
            timestamp: Date.now(),
          }];
          // Keep last 50 items in history
          return updated.slice(-50);
        });
        if (alreadyRecorded) return;

        // Increment unread badge only when sidebar is closed
        setUnread(prev => prev + 1);

        // Completed → auto-dismiss bar after 3 s
        // Failed    → auto-dismiss bar after 8 s (user has time to read)
        const delay = job.status === 'completed' ? 3000 : 8000;
        setTimeout(() => {
          setActiveJobs(prev => prev.filter(j => j.jobId !== job.jobId));
        }, delay);
      });
    }, POLL_MS);

    return () => clearInterval(interval);
  }, []); // ← intentionally empty; uses ref above

  function dismissJob(jobId) { setActiveJobs(prev => prev.filter(j => j.jobId !== jobId)); }

  function openSidebar() { setShowSidebar(true); setUnread(0); }

  function handleGenerate() {
    if (!apiKey) { setShowSettings(true); return; }
    setShowImageModal(true);
  }

  async function handleImageModeSelected(imageMode) {
    setShowImageModal(false);
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Google-Api-Key': apiKey },
        body: JSON.stringify({ genre, ageGroup, prompt: prompt.trim() || undefined, imageMode, durationSeconds, enableVeo, videoDurationSeconds }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error ${res.status}`);
      }
      const { jobId } = await res.json();
      setActiveJobs(prev => [...prev, { jobId, status: 'pending', title: null, error: null }]);
      setPrompt('');
    } catch (e) {
      setErrorModal(e.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const selectedDuration = DURATIONS.find(d => d.value === durationSeconds) || DURATIONS[0];

  const header = (
    <header className="app-header glass">
      <div className="logo-container">
        <span className="logo-icon">✨</span>
        <div className="logo-text">
          <h1>Story Creator</h1>
          <p>Where Imagination Comes Alive</p>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {stories !== undefined && (
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            {stories.length} stor{stories.length === 1 ? 'y' : 'ies'}
          </span>
        )}
        <BellBtn unread={unread} onClick={openSidebar} />
        <SettingsBtn hasKey={!!apiKey} onClick={() => setShowSettings(true)} />
      </div>
    </header>
  );

  const modals = (
    <>
      {showSettings   && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showImageModal && <ImageModeModal onSelect={handleImageModeSelected} onCancel={() => setShowImageModal(false)} />}
      {errorModal     && <ErrorModal message={errorModal} onClose={() => setErrorModal(null)} />}
      {showSidebar    && <NotificationSidebar history={history} onClose={() => setShowSidebar(false)} onClearAll={() => setHistory([])} />}
    </>
  );

  if (selectedStory) {
    const live = stories?.find(s => s._id === selectedStory._id) || selectedStory;
    return (
      <div className="container">
        {header}{modals}
        <BookViewer story={live} onBack={() => setSelectedStory(null)} />
      </div>
    );
  }

  return (
    <div className="container">
      {header}{modals}
      <div className="creator-grid">
        {/* ── Control Panel ── */}
        <h2 className="control-title" style={{ marginBottom: 4 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
          Craft a Story
        </h2>

        <aside className="glass control-panel">
          {!apiKey && (
            <div onClick={() => setShowSettings(true)} style={{
              background: 'rgba(247,185,74,0.1)', border: '1px solid var(--accent)',
              borderRadius: 10, padding: '8px 12px', fontSize: '0.75rem',
              color: 'var(--accent-light)', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center',
              whiteSpace: 'nowrap',
            }}>
              <span style={{ fontSize: '1rem' }}>🔑</span>
              <span>Add API key</span>
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label title="Choose the story theme or category">Genre</label>
            <div className="pill-grid">
              {GENRES.map(g => (
                <button key={g.value} className={`pill-btn${genre === g.value ? ' active' : ''}`} onClick={() => setGenre(g.value)} title={g.label}>{g.label.split(' ')[0]}</button>
              ))}
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label title="Select the target age group for the story">Age</label>
            <div className="pill-grid">
              {AGE_GROUPS.map(a => (
                <button key={a.value} className={`pill-btn${ageGroup === a.value ? ' active' : ''}`} onClick={() => setAgeGroup(a.value)} title={a.label}>{a.label.split(' ')[0]}</button>
              ))}
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label title="How long should the story be?">Story Len</label>
            <div className="pill-grid">
              {DURATIONS.map(d => (
                <button key={d.value} className={`pill-btn${durationSeconds === d.value ? ' active' : ''}`} onClick={() => setDuration(d.value)} title={`${d.desc} - ${d.label}`}>{d.label}</button>
              ))}
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label title="Generate a video from the story using Veo 3.1 AI">🎬 Veo</label>
            <div
              onClick={() => setEnableVeo(v => !v)}
              style={{
                width: 36, height: 20, borderRadius: 99, flexShrink: 0,
                background: enableVeo ? 'var(--accent)' : 'rgba(255,255,255,0.12)',
                position: 'relative', transition: 'background 0.2s', cursor: 'pointer',
              }}
              title={enableVeo ? 'Veo video generation enabled' : 'Enable Veo video generation'}
            >
              <div style={{
                position: 'absolute', top: 2, left: enableVeo ? 18 : 2,
                width: 16, height: 16, borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              }} />
            </div>
          </div>

          {enableVeo && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label title="Duration of the generated video (4-8 seconds)">Video Dur</label>
              <select
                value={videoDurationSeconds}
                onChange={e => setVideoDuration(parseInt(e.target.value))}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-main)',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  fontFamily: 'var(--font-family)',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                {VIDEO_DURATIONS.map(d => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 0, flexBasis: '100%', marginTop: 8 }}>
            <label title="Add character names, personality traits, setting details, or specific plot elements">Details (optional) <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 400 }}>({prompt.length}/1024)</span></label>
            <textarea
              className="input-text"
              placeholder="Add character details, setting, or plot hints…"
              value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={1024}
              style={{ height: '60px', padding: '8px 12px', width: '100%', resize: 'vertical', minHeight: '36px' }}
            />
          </div>

          <button className="btn-magic" onClick={handleGenerate} disabled={isSubmitting} style={{ marginLeft: 'auto' }}>
            {isSubmitting ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 1.2s linear infinite' }}>
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                </svg>
                Creating…
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
                </svg>
                Create ✨
              </>
            )}
          </button>
        </aside>

        {/* ── Story Library ── */}
        <section className="stories-section">
          <div className="section-header">
            <h2>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>
              </svg>
              Story Library
            </h2>
          </div>

          <NotificationBar jobs={activeJobs} onDismiss={dismissJob} />

          <div className="stories-grid">
            {stories === undefined && (
              <div className="glass empty-feed">
                <span style={{ fontSize: '2.5rem', marginBottom: 16 }}>🌙</span>
                <p style={{ color: 'var(--text-muted)' }}>Loading stories…</p>
              </div>
            )}
            {stories?.length === 0 && activeJobs.filter(j => j.status === 'pending').length === 0 && (
              <div className="glass empty-feed">
                <span style={{ fontSize: '3rem', marginBottom: 16 }}>📖</span>
                <h3 style={{ margin: '0 0 8px', color: 'var(--accent-light)' }}>No stories yet!</h3>
                <p style={{ color: 'var(--text-muted)', margin: 0 }}>Pick a genre and age group, then hit <strong>Create Story</strong> to begin.</p>
              </div>
            )}
            {stories?.map(story => (
              <StoryCard key={story._id} story={story} onClick={setSelectedStory} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
