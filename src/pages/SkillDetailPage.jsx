import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme, FONT_HEAD, FONT_UI, FONT_MONO } from '../tokens/theme';
import { PageWrap, VerifiedStamp, Stars, Downloads, SkillBdg, PTag, SellerBdg } from '../components/Shared.jsx';
import { GoldButton, GhostButton, Textarea, ErrorBox } from '../components/ui.jsx';
import { PLATFORMS } from '../data/constants.js';
import SkillIcon from '../components/SkillIcon.jsx';
import Loader from '../components/Loader.jsx';
import { Ic } from '../components/Icons.jsx';
import * as api from '../lib/api.js';
import useFetch from '../lib/useFetch.js';

/* The two-column shell collapses under 880px. On narrow screens the buy card
   moves ABOVE the long-form content (order:-1) — the price and CTA are the
   reason people opened the page; they should never be a scroll away. */
const SHELL_CSS = `
  @media (max-width: 880px) {
    .sd-shell { grid-template-columns: 1fr !important; }
    .sd-side { position: static !important; order: -1; }
  }
`;

export default function SkillDetailPage({ user, onShowAuth }) {
  const { c } = useTheme();
  const { id } = useParams();
  const nav = useNavigate();
  const skill = useFetch(() => api.getSkill(id), [id]);
  const reviews = useFetch(() => api.getReviews(id), [id]);
  // Ownership is unknown until the library loads — never flash the wrong button.
  const [owned, setOwned] = useState({ known: false, value: false });
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState("");
  const [userRating, setUserRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewDone, setReviewDone] = useState(false);
  const [reviewError, setReviewError] = useState("");

  useEffect(() => {
    let alive = true;
    if (!user) { setOwned({ known: true, value: false }); return; }
    setOwned({ known: false, value: false });
    api.getLibrary().then(
      lib => alive && setOwned({ known: true, value: lib.some(s => String(s.id) === String(id)) }),
      () => alive && setOwned({ known: true, value: false }),
    );
    return () => { alive = false; };
  }, [user, id]);

  if (skill.loading) return <PageWrap><Loader label="Loading skill" /></PageWrap>;
  if (skill.error) return <PageWrap><ErrorBox message={skill.error} onRetry={skill.retry} /></PageWrap>;
  const s = skill.data;
  const isFree = s.price === 0;
  const canDownload = isFree || owned.value;

  const doDownload = async () => {
    if (!user) { onShowAuth(); return; }
    setBuyError("");
    try {
      const { url } = await api.downloadSkill(s.id);
      setOwned({ known: true, value: true });
      const a = document.createElement('a');
      a.href = url; a.download = `${s.title.replace(/[^a-z0-9]+/gi, '-')}-SKILL.md`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { setBuyError(e.message); }
  };

  const doBuy = async () => {
    if (!user) { onShowAuth(); return; }
    setBuying(true); setBuyError("");
    try {
      const order = await api.buySkill(s.id);
      if (order.status === 'paid-mock') { setOwned({ known: true, value: true }); return; }
      await openRazorpay(order, s, user);
      setOwned({ known: true, value: true });
    } catch (e) {
      if (e?.message !== 'cancelled') setBuyError(e.message || 'Payment failed. You have not been charged.');
    } finally { setBuying(false); }
  };

  const submitReview = async () => {
    if (!userRating) { setReviewError('Pick a star rating first.'); return; }
    setReviewBusy(true); setReviewError("");
    try {
      await api.postReview(s.id, { rating: userRating, text: reviewText.trim() });
      setReviewDone(true); setReviewText(""); setUserRating(0);
      reviews.retry();
    } catch (e) { setReviewError(e.message); }
    finally { setReviewBusy(false); }
  };

  // Only non-empty facts reach the stats list — a "0 downloads" row reads as
  // failure, where an absent row reads as "too early to say".
  const stats = [
    ['Category', s.category, false],
    s.timeSaved ? ['Time saved', `~${s.timeSaved}h est.`, true] : null,
    s.downloads ? ['Downloads', Number(s.downloads).toLocaleString(), false] : null,
    s.reviews ? ['Rating', `${Number(s.rating).toFixed(1)}/5`, false] : null,
    s.reviews ? ['Reviews', Number(s.reviews).toLocaleString(), false] : null,
  ].filter(Boolean);

  const reviewList = reviews.data || [];

  return (
    <PageWrap>
      <style>{SHELL_CSS}</style>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '22px clamp(16px,3.5vw,32px) 60px' }}>
        <div style={{ marginBottom: 20 }}>
          <GhostButton size="sm" onClick={() => nav('/marketplace')}>← Back to marketplace</GhostButton>
        </div>

        <div className="sd-shell" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 316px', gap: 'clamp(24px,3.5vw,44px)', alignItems: 'start' }}>
          {/* ── Main column ── */}
          <main className="fade-up" style={{ minWidth: 0 }}>
            {/* Title block */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <SkillIcon skill={s} size={64} radius={14} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: FONT_UI, fontSize: 10, fontWeight: 700, color: c.slate, textTransform: 'uppercase', letterSpacing: '0.09em' }}>{s.category}</span>
                  {s.skillBadge && <SkillBdg label={s.skillBadge} />}
                </div>
                <h1 style={{ fontFamily: FONT_HEAD, fontSize: 'clamp(23px,3.4vw,32px)', fontWeight: 700, color: c.text, letterSpacing: '-0.02em', lineHeight: 1.18, margin: 0 }}>{s.title}</h1>
              </div>
              {s.verified && <VerifiedStamp size={34} />}
            </div>

            {/* Meta row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', margin: '14px 0 0' }}>
              <Stars rating={s.rating} count={s.reviews} size={12} />
              <Downloads count={s.downloads} size={12} />
              <span style={{ fontFamily: FONT_UI, fontSize: 12, color: c.textMuted }}>
                by <button onClick={() => nav(`/u/${s.author}`)}
                  style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: c.gold, cursor: 'pointer' }}>{s.author}</button>
              </span>
            </div>

            {/* Platforms + seller badges */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '16px 0 0' }}>
              {s.platforms.map(p => <PTag key={p} p={p} />)}
              {s.sellerBadges.map(b => <SellerBdg key={b} b={b} />)}
            </div>

            {/* Time saved — always labelled as the seller's own estimate */}
            {s.timeSaved && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, background: c.goldSoft, border: `1px solid ${c.gold}30`, borderRadius: 10, padding: '10px 15px', marginTop: 20 }}>
                <Ic.Clock s={15} c={c.gold} />
                <span style={{ fontFamily: FONT_UI, fontSize: 14, fontWeight: 700, color: c.gold }}>~{s.timeSaved} hours saved</span>
                <span style={{ fontFamily: FONT_UI, fontSize: 11, color: c.textMuted }}>· seller estimate</span>
              </div>
            )}

            <p style={{ fontFamily: FONT_UI, fontSize: 14.5, color: c.textSub, lineHeight: 1.75, margin: '22px 0 0' }}>{s.description}</p>

            {/* ── How to use ── */}
            <Section title="How to use this skill">
              <p style={{ fontFamily: FONT_UI, fontSize: 13.5, color: c.textSub, lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>{s.usage}</p>
              <LoadInAssistant platforms={s.platforms} />
            </Section>

            {/* ── Proof of concept — the screenshot is evidence, never cropped ── */}
            <Section title="Proof of concept">
              {s.pocScreenshot && (s.pocScreenshotUrl
                ? <img src={s.pocScreenshotUrl} alt={`${s.title} used in a real project`}
                    style={{ display: 'block', width: '100%', height: 'auto', maxHeight: 380, objectFit: 'contain', objectPosition: 'top', background: c.elevated, border: `1px solid ${c.border}`, borderRadius: 10, marginBottom: 14 }} />
                : <div style={{ background: c.elevated, border: `1px solid ${c.border}`, borderRadius: 10, height: 120, display: 'grid', placeItems: 'center', marginBottom: 14 }}>
                    <span style={{ fontFamily: FONT_UI, fontSize: 12, color: c.textMuted }}>Screenshot unavailable</span>
                  </div>
              )}
              <a href={s.pocUrl} target="_blank" rel="noreferrer"
                style={{ display: 'inline-block', fontFamily: FONT_MONO, fontSize: 12, color: c.gold, textDecoration: 'none', wordBreak: 'break-all' }}>
                {s.pocUrl} ↗
              </a>
            </Section>

            {/* ── Reviews ── */}
            <div style={{ borderTop: `1px solid ${c.border}`, marginTop: 34, paddingTop: 30 }}>
              <h2 style={{ fontFamily: FONT_HEAD, fontSize: 20, fontWeight: 700, color: c.text, letterSpacing: '-0.02em', margin: '0 0 16px' }}>
                Reviews {reviewList.length > 0 && <span style={{ fontFamily: FONT_UI, fontSize: 13, fontWeight: 400, color: c.textMuted }}>({reviewList.length})</span>}
              </h2>

              {reviews.loading ? <Loader label="Loading reviews" pad="28px 16px" mark={30} />
                : reviews.error ? <ErrorBox message={reviews.error} onRetry={reviews.retry} />
                : reviewList.length === 0 ? (
                  <p style={{ fontFamily: FONT_UI, fontSize: 13.5, color: c.textMuted, lineHeight: 1.6, margin: 0 }}>
                    No reviews yet. {canDownload ? 'Be the first to review it below.' : 'Buy this skill to leave the first review.'}
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {reviewList.map((r, i) => (
                      <div key={r.reviewId || i} style={{ padding: '16px 0', borderTop: i === 0 ? 'none' : `1px solid ${c.border}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
                          <button onClick={() => nav(`/u/${r.user}`)}
                            style={{ background: 'none', border: 'none', padding: 0, fontFamily: FONT_UI, fontSize: 13, fontWeight: 600, color: c.text, cursor: 'pointer' }}>{r.user}</button>
                          <ReviewStars rating={r.rating} />
                        </div>
                        <p style={{ fontFamily: FONT_UI, fontSize: 13.5, color: c.textSub, margin: 0, lineHeight: 1.65 }}>{r.text}</p>
                      </div>
                    ))}
                  </div>
                )}

              {/* Review composer — owners only */}
              {user && owned.known && canDownload && !reviewDone && (
                <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: 18, marginTop: 22 }}>
                  <h3 style={{ fontFamily: FONT_UI, fontSize: 13, fontWeight: 600, color: c.text, letterSpacing: 0, margin: '0 0 12px' }}>Leave a review</h3>
                  <div role="radiogroup" aria-label="Your rating" style={{ display: 'flex', gap: 7, marginBottom: 12 }}>
                    {[1, 2, 3, 4, 5].map(i => (
                      <span key={i} data-testid={`star-${i}`} role="radio" tabIndex={0}
                        aria-checked={i === userRating} aria-label={`${i} star${i > 1 ? 's' : ''}`}
                        onClick={() => setUserRating(i)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setUserRating(i); } }}
                        style={{ cursor: 'pointer', display: 'inline-flex', lineHeight: 0 }}>
                        <Ic.Star s={20} c={c.gold} filled={i <= userRating} />
                      </span>
                    ))}
                  </div>
                  <Textarea value={reviewText} onChange={e => setReviewText(e.target.value)} rows={3}
                    placeholder="What worked well? What could be improved?" testId="review-text" />
                  {reviewError && <p style={{ fontFamily: FONT_UI, fontSize: 12, color: c.coral, margin: '10px 0 0' }}>{reviewError}</p>}
                  <div style={{ marginTop: 12 }}>
                    <GoldButton size="sm" disabled={reviewBusy} onClick={submitReview}>{reviewBusy ? 'Submitting…' : 'Submit review'}</GoldButton>
                  </div>
                </div>
              )}
              {reviewDone && <p style={{ fontFamily: FONT_UI, fontSize: 13.5, color: c.green, marginTop: 18 }}>✓ Review submitted — thank you.</p>}
            </div>
          </main>

          {/* ── Sticky buy sidebar ── */}
          <aside className="sd-side" style={{ position: 'sticky', top: 68, minWidth: 0 }}>
            <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 16, padding: 22 }}>
              <div style={{ textAlign: 'center', marginBottom: 18 }}>
                <div style={{ fontFamily: FONT_UI, fontSize: 34, fontWeight: 700, letterSpacing: '-0.03em', color: isFree ? c.green : c.gold, lineHeight: 1.1 }}>
                  {isFree ? 'Free' : `$${s.price}`}
                </div>
                {/* "one-time payment" is a fact about a purchase — meaningless on a
                    free skill, where the honest note is that there's nothing to pay. */}
                <div style={{ fontFamily: FONT_UI, fontSize: 11, color: c.textMuted, marginTop: 4 }}>
                  {isFree ? 'Free forever · no payment required' : 'one-time payment'}
                </div>
              </div>

              {/* Ownership unknown → skeleton, so the wrong CTA never flashes */}
              {!owned.known && user
                ? <div aria-hidden style={{ height: 42, borderRadius: 10, background: c.elevated, animation: 'twinkle 1.4s ease-in-out infinite alternate', '--op': 0.6 }} />
                : canDownload
                  ? <GoldButton full testId="download-btn" onClick={doDownload}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        <Ic.Download s={14} c={c.onGold} />Download skill
                      </span>
                    </GoldButton>
                  : <GoldButton full testId="buy-btn" disabled={buying} onClick={doBuy}>
                      {buying ? 'Opening checkout…' : `Buy for $${s.price}`}
                    </GoldButton>
              }

              {buyError && <p style={{ fontFamily: FONT_UI, fontSize: 11.5, color: c.coral, textAlign: 'center', margin: '12px 0 0', lineHeight: 1.5 }}>{buyError}</p>}
              {/* Checkout reassurance belongs only under a checkout button. */}
              {!canDownload && (
                <div style={{ fontFamily: FONT_UI, fontSize: 11, color: c.textMuted, textAlign: 'center', marginTop: 12 }}>Secure checkout · Instant download</div>
              )}

              <div style={{ marginTop: 12 }}>
                <ShareButton skill={s} />
              </div>

              <div style={{ borderTop: `1px solid ${c.border}`, marginTop: 18, paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 9 }}>
                {stats.map(([k, v, gold]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ fontFamily: FONT_UI, fontSize: 12, color: c.textMuted }}>{k}</span>
                    <span style={{ fontFamily: FONT_UI, fontSize: 12, fontWeight: gold ? 600 : 400, color: gold ? c.gold : c.text, textAlign: 'right' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </PageWrap>
  );
}

/* ── "Load it in your assistant" ──
   The seller's prose says what the skill does; it almost never says the boring
   part — where the file goes once it's downloaded. Each line below is a real,
   documented mechanism for that platform. Anything we're not certain of is
   phrased generically ("paste the contents") rather than invented: a wrong path
   here costs the buyer more time than the skill saves. */
const LOAD_STEPS = {
  Claude: () => <>Keep the file in your project as <Mono>./SKILL.md</Mono> and reference it at the start of a session. In Claude Code, just tell it to read the file.</>,
  ChatGPT: () => <>Attach the <Mono>.md</Mono> file to the chat, or paste its contents as your first message.</>,
  Gemini: () => <>Paste the contents at the start of your session, or attach the file to the chat.</>,
  Cursor: () => <>Keep it in the project and reference it, or save the contents as a project rule under <Mono>.cursor/rules/</Mono> so it loads automatically.</>,
  Copilot: () => <>Save the contents as a workspace instruction file at <Mono>.github/copilot-instructions.md</Mono>, or paste them into Copilot Chat.</>,
};

function Mono({ children }) {
  const { c } = useTheme();
  return <code style={{ fontFamily: FONT_MONO, fontSize: 11.5, color: c.gold, background: c.goldSoft, borderRadius: 4, padding: '1px 5px', wordBreak: 'break-all' }}>{children}</code>;
}

function LoadInAssistant({ platforms }) {
  const { c } = useTheme();
  // PLATFORMS order, not the seller's — the list reads the same on every skill.
  const list = PLATFORMS.filter(p => (platforms || []).includes(p) && LOAD_STEPS[p]);
  if (!list.length) return null;
  return (
    <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: 16, marginTop: 18 }}>
      <h3 style={{ fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 600, color: c.text, letterSpacing: 0, margin: '0 0 11px' }}>Load it in your assistant</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.map(p => (
          <div key={p} style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ flexShrink: 0 }}><PTag p={p} /></span>
            <span style={{ flex: 1, minWidth: 180, fontFamily: FONT_UI, fontSize: 12.5, color: c.textSub, lineHeight: 1.65 }}>{LOAD_STEPS[p]()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Share ──
   navigator.share is the right answer on mobile — it reaches the apps people
   actually use. Everywhere else it doesn't exist, so we fall back to a themed
   popover (same open/close contract as Select.jsx). The share text states only
   what we know for certain: the title and the category. */
const SHARE_TARGETS = [
  { key: 'x', label: 'X', href: (u, t) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(t)}&url=${encodeURIComponent(u)}` },
  { key: 'linkedin', label: 'LinkedIn', href: (u) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(u)}` },
  { key: 'reddit', label: 'Reddit', href: (u, t) => `https://www.reddit.com/submit?url=${encodeURIComponent(u)}&title=${encodeURIComponent(t)}` },
  { key: 'hn', label: 'Hacker News', href: (u, t) => `https://news.ycombinator.com/submitlink?u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}` },
];

function ShareButton({ skill }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef(null);
  const text = `${skill.title} — a skill for ${skill.category} on Skill Exchange`;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  const url = typeof window !== 'undefined' ? window.location.href : '';

  const onShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ title: skill.title, text, url }); return; }
      catch { return; } // cancelled or blocked — never fall through to the popover
    }
    setOpen(o => !o);
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); }
    catch { /* clipboard blocked — the links below still work */ }
  };

  const row = {
    display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
    background: 'transparent', border: 'none', borderRadius: 7, padding: '8px 10px',
    fontFamily: FONT_UI, fontSize: 12.5, color: c.textSub, cursor: 'pointer', textDecoration: 'none',
  };
  const hover = {
    onMouseEnter: e => { e.currentTarget.style.background = c.surfaceHover; e.currentTarget.style.color = c.text; },
    onMouseLeave: e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = c.textSub; },
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <GhostButton full size="sm" testId="share-btn" onClick={onShare}>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
          <Ic.Share s={13} c="currentColor" />Share
        </span>
      </GhostButton>
      {open && (
        <div role="menu" aria-label="Share this skill"
          style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 120, minWidth: '100%', width: 'max-content', background: c.surface, border: `1px solid ${c.borderGold}`, borderRadius: 10, padding: 5, boxShadow: '0 12px 32px rgba(0,0,0,0.45)', animation: 'spotlightIn 0.14s ease' }}>
          <button type="button" role="menuitem" onClick={copy} data-testid="share-copy"
            style={{ ...row, color: copied ? c.green : c.textSub }} {...(copied ? {} : hover)}>
            {copied ? <Ic.Check s={13} c={c.green} /> : <Ic.Link s={13} c={c.gold} />}
            {copied ? 'Copied' : 'Copy link'}
          </button>
          {SHARE_TARGETS.map(t => (
            <a key={t.key} role="menuitem" href={t.href(url, text)} target="_blank" rel="noopener noreferrer"
              data-testid={`share-${t.key}`} onClick={() => setOpen(false)} style={row} {...hover}>
              {t.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/* A titled block with a hairline rule above it — the page's only section rhythm. */
function Section({ title, children }) {
  const { c } = useTheme();
  return (
    <div style={{ borderTop: `1px solid ${c.border}`, marginTop: 30, paddingTop: 24 }}>
      <h2 style={{ fontFamily: FONT_UI, fontSize: 11, fontWeight: 700, color: c.gold, textTransform: 'uppercase', letterSpacing: '0.09em', margin: '0 0 12px' }}>{title}</h2>
      {children}
    </div>
  );
}

/* One reviewer's own stars. Deliberately not <Stars>, which is an aggregate
   widget and renders "New" at count 0 — wrong for a single scored review. */
function ReviewStars({ rating }) {
  const { c } = useTheme();
  const r = Math.round(Number(rating) || 0);
  return (
    <span aria-label={`${r} out of 5`} style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => <Ic.Star key={i} s={11} c={c.gold} filled={i <= r} />)}
    </span>
  );
}

// Load Razorpay checkout on demand; resolve on successful payment confirmation.
function openRazorpay(order, skill, user) {
  return new Promise((resolve, reject) => {
    const launch = () => {
      const rzp = new window.Razorpay({
        key: order.razorpayKeyId,
        order_id: order.razorpayOrderId,
        amount: order.amountCents, // Razorpay uses smallest currency unit
        currency: order.currency || 'USD',
        name: 'Skill Exchange',
        description: skill.title,
        prefill: { email: user.email },
        theme: { color: '#C9A84C' },
        handler: async (resp) => {
          try {
            await api.confirmPurchase(skill.id, {
              razorpayPaymentId: resp.razorpay_payment_id,
              razorpayOrderId: resp.razorpay_order_id,
              razorpaySignature: resp.razorpay_signature,
            });
            resolve();
          } catch (e) { reject(e); }
        },
        modal: { ondismiss: () => reject(new Error('cancelled')) },
      });
      rzp.open();
    };
    if (window.Razorpay) { launch(); return; }
    const scr = document.createElement('script');
    scr.src = 'https://checkout.razorpay.com/v1/checkout.js';
    scr.onload = launch;
    scr.onerror = () => reject(new Error("Couldn't load the payment window. Check your connection and retry."));
    document.body.appendChild(scr);
  });
}
