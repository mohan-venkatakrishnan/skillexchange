import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme, FONT_DISPLAY, FONT_UI } from '../tokens/theme';
import { PageWrap, TimeSaved, Stars, Downloads, Price } from '../components/Shared.jsx';
import { Card, PageTitle, ErrorBox, EmptyState, GoldButton, GhostButton } from '../components/ui.jsx';
import SkillIcon from '../components/SkillIcon.jsx';
import Loader from '../components/Loader.jsx';
import { Ic } from '../components/Icons.jsx';
import * as api from '../lib/api.js';
import useFetch from '../lib/useFetch.js';

export default function LibraryPage() {
  const { c } = useTheme();
  const nav = useNavigate();
  const lib = useFetch(() => api.getLibrary(), []);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  const download = async (s) => {
    setBusy(s.id); setErr(null);
    try {
      const { url } = await api.downloadSkill(s.id);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${s.title.replace(/[^a-z0-9]+/gi, '-')}-SKILL.md`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) {
      setErr(e.message || 'Download failed. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const items = lib.data || [];

  return (
    <PageWrap>
      <div style={{ maxWidth: 940, margin: '0 auto', padding: '26px clamp(16px,4vw,40px) 48px' }}>
        <PageTitle eyebrow="Your collection" title="My Library"
          sub="Every skill you've purchased or downloaded. Yours to re-download any time — one-time purchase, no expiry." />

        {err && (
          <div style={{ background: c.coralSoft, border: `1px solid ${c.coral}35`, borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontFamily: FONT_UI, fontSize: 12.5, color: c.coral }}>
            {err}
          </div>
        )}

        {lib.loading ? <Loader label="Loading your library" />
          : lib.error ? <ErrorBox message={lib.error} onRetry={lib.retry} />
          : items.length === 0 ? (
            <EmptyState title="Your library is empty"
              body="Skills you buy or download for free land here, ready to drop into your next project."
              action={<GoldButton onClick={() => nav('/marketplace')}>Browse the marketplace</GoldButton>} />
          ) : (
            <>
              <p style={{ fontFamily: FONT_UI, fontSize: 12.5, color: c.textMuted, margin: '0 0 14px' }}>
                <strong style={{ color: c.text, fontWeight: 600 }}>{items.length}</strong> skill{items.length !== 1 ? 's' : ''}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {items.map((s, i) => (
                  <Card key={s.id} className={i < 8 ? 'fade-up' : undefined} testId="library-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                      <SkillIcon skill={s} size={48} radius={11} />

                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ fontFamily: FONT_UI, fontSize: 10, fontWeight: 700, color: c.slate, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                          {s.category}
                        </div>
                        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 600, color: c.text, letterSpacing: '-0.01em', marginBottom: 6 }}>
                          {s.title}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: FONT_UI, fontSize: 11.5, color: c.textMuted }}>
                            by <span onClick={() => nav(`/u/${s.author}`)} style={{ color: c.gold, cursor: 'pointer' }}>{s.author}</span>
                          </span>
                          <span style={{ color: c.border }}>·</span>
                          {s.price === 0
                            ? <Price dollars={0} size={11.5} />
                            : <span style={{ fontFamily: FONT_UI, fontSize: 11.5, color: c.textMuted }}>
                                <Price dollars={s.price} size={11.5} /> purchased
                              </span>}
                          <Stars rating={s.rating} count={s.reviews} showEmpty={false} size={11} />
                          <Downloads count={s.downloads} />
                          <TimeSaved hours={s.timeSaved} compact />
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                        <GhostButton size="sm" onClick={() => nav(`/skills/${s.id}`)}>View</GhostButton>
                        <GoldButton size="sm" disabled={busy === s.id} testId="library-download" onClick={() => download(s)}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <Ic.Download s={12} c={c.onGold} />
                            {busy === s.id ? 'Preparing…' : 'Download'}
                          </span>
                        </GoldButton>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
      </div>
    </PageWrap>
  );
}
