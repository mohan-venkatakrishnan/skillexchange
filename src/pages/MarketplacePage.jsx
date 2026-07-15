import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTheme, FONT_DISPLAY, FONT_UI } from '../tokens/theme';
import SkillCard from '../components/SkillCard.jsx';
import Select from '../components/Select.jsx';
import Loader from '../components/Loader.jsx';
import { Ic } from '../components/Icons.jsx';
import { PageWrap } from '../components/Shared.jsx';
import { ErrorBox, EmptyState, GhostButton } from '../components/ui.jsx';
import { CATEGORIES, PLATFORMS } from '../data/constants.js';
import * as api from '../lib/api.js';
import useFetch from '../lib/useFetch.js';

const PER_PAGE = 24;

const SORTS = [
  { value: 'featured', label: 'Featured' },
  { value: 'rating', label: 'Top rated' },
  { value: 'downloads', label: 'Most downloaded' },
  { value: 'newest', label: 'Newest' },
  { value: 'time', label: 'Most time saved' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
];

export default function MarketplacePage() {
  const { c } = useTheme();
  const [params, setParams] = useSearchParams();
  const skills = useFetch(() => api.listSkills(), []);

  const cat = params.get('cat') || 'All';
  const platform = params.get('platform') || 'All';
  const price = params.get('price') || 'All';
  const verifiedOnly = params.get('verified') === '1';
  const sort = params.get('sort') || 'featured';
  const q = params.get('q') || '';
  const page = Math.max(1, Number(params.get('page') || 1));

  const [search, setSearch] = useState(q);
  useEffect(() => { setSearch(q); }, [q]);

  // One writer for the whole filter state — every change resets to page 1
  // except an explicit page change.
  const patch = (next, keepPage = false) => {
    const p = new URLSearchParams(params);
    Object.entries(next).forEach(([k, v]) => {
      if (v === null || v === '' || v === 'All' || v === false) p.delete(k);
      else p.set(k, String(v));
    });
    if (!keepPage) p.delete('page');
    setParams(p, { replace: true });
  };

  // Debounce the search box into the URL so typing doesn't thrash history.
  useEffect(() => {
    if (search === q) return;
    const t = setTimeout(() => patch({ q: search || null }), 220);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const all = skills.data || [];

  const counts = useMemo(() => {
    const m = {};
    all.forEach(s => { m[s.category] = (m[s.category] || 0) + 1; });
    return m;
  }, [all]);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = all.filter(s => {
      if (term && !s.title.toLowerCase().includes(term) && !s.description.toLowerCase().includes(term) && !s.author.toLowerCase().includes(term)) return false;
      if (cat !== 'All' && s.category !== cat) return false;
      if (platform !== 'All' && !s.platforms.includes(platform)) return false;
      if (price === 'Free' && s.price !== 0) return false;
      if (price === 'Paid' && s.price === 0) return false;
      if (verifiedOnly && !s.verified) return false;
      return true;
    });
    const by = {
      rating: (a, b) => (b.rating || 0) - (a.rating || 0) || (b.reviews || 0) - (a.reviews || 0),
      downloads: (a, b) => (b.downloads || 0) - (a.downloads || 0),
      newest: (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
      time: (a, b) => (b.timeSaved || 0) - (a.timeSaved || 0),
      'price-asc': (a, b) => a.price - b.price,
      'price-desc': (a, b) => b.price - a.price,
      featured: (a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || (b.downloads || 0) - (a.downloads || 0),
    };
    return [...list].sort(by[sort] || by.featured);
  }, [all, q, cat, platform, price, verifiedOnly, sort]);

  const pages = Math.max(1, Math.ceil(results.length / PER_PAGE));
  const current = Math.min(page, pages);
  const slice = results.slice((current - 1) * PER_PAGE, current * PER_PAGE);
  const goPage = (p) => { patch({ page: p === 1 ? null : p }, true); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const activeFilters = (cat !== 'All' ? 1 : 0) + (platform !== 'All' ? 1 : 0) + (price !== 'All' ? 1 : 0) + (verifiedOnly ? 1 : 0);

  return (
    <PageWrap>
      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '26px clamp(16px,3.5vw,32px) 0' }}>
        {/* ── Search header ── */}
        <div className="fade-up" style={{ marginBottom: 22 }}>
          <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 'clamp(21px,3vw,27px)', color: c.text, margin: '0 0 14px' }}>Browse skills</h1>
          <div style={{ position: 'relative', maxWidth: 620 }}>
            <div style={{ position: 'absolute', left: 15, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><Ic.Search s={15} c={c.textMuted} /></div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search skills, authors, categories…" data-testid="marketplace-search"
              style={{ width: '100%', background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: '12px 40px 12px 42px', color: c.text, fontFamily: FONT_UI, fontSize: 13.5, boxSizing: 'border-box', outline: 'none' }} />
            {search && (
              <button onClick={() => setSearch('')} aria-label="Clear search"
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                <Ic.X s={13} c={c.textMuted} />
              </button>
            )}
          </div>
        </div>

        <div className="mk-shell" style={{ display: 'grid', gridTemplateColumns: '224px 1fr', gap: 28, alignItems: 'start' }}>
          {/* ── Category rail ── */}
          <aside className="mk-rail" style={{ position: 'sticky', top: 68 }}>
            <RailSection title="Categories">
              <RailItem label="All skills" count={all.length} active={cat === 'All'} onClick={() => patch({ cat: null })} />
              {CATEGORIES.filter(x => counts[x]).map(x => (
                <RailItem key={x} label={x} count={counts[x]} active={cat === x} onClick={() => patch({ cat: x })} />
              ))}
            </RailSection>

            <RailSection title="Price">
              {['All', 'Free', 'Paid'].map(p => (
                <RailItem key={p} label={p === 'All' ? 'Any price' : p} active={price === p} onClick={() => patch({ price: p })} />
              ))}
            </RailSection>

            <RailSection title="Works with">
              <RailItem label="Any assistant" active={platform === 'All'} onClick={() => patch({ platform: null })} />
              {PLATFORMS.map(p => (
                <RailItem key={p} label={p} active={platform === p} onClick={() => patch({ platform: p })} />
              ))}
            </RailSection>

            <RailSection title="Trust">
              <label style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', cursor: 'pointer', fontFamily: FONT_UI, fontSize: 12.5, color: verifiedOnly ? c.gold : c.textSub }}>
                <input type="checkbox" checked={verifiedOnly} onChange={e => patch({ verified: e.target.checked ? '1' : null })}
                  style={{ accentColor: c.gold, width: 14, height: 14, cursor: 'pointer' }} />
                Verified creators only
              </label>
            </RailSection>

            {activeFilters > 0 && (
              <div style={{ padding: '4px 10px' }}>
                <GhostButton size="sm" full onClick={() => setParams(q ? { q } : {}, { replace: true })}>Clear filters</GhostButton>
              </div>
            )}
          </aside>

          {/* ── Results ── */}
          <main style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <p data-testid="results-count" style={{ fontFamily: FONT_UI, fontSize: 12.5, color: c.textMuted, margin: 0 }}>
                {skills.loading ? 'Loading…' : <>
                  <strong style={{ color: c.text, fontWeight: 600 }}>{results.length.toLocaleString()}</strong> skill{results.length !== 1 ? 's' : ''}
                  {cat !== 'All' ? ` in ${cat}` : ''}{q ? ` for “${q}”` : ''}
                  {pages > 1 && <span> · page {current} of {pages}</span>}
                </>}
              </p>
              <Select value={sort} onChange={v => patch({ sort: v === 'featured' ? null : v })} options={SORTS} ariaLabel="Sort skills" minWidth={186} size="sm" />
            </div>

            {/* mobile category picker — the rail is hidden under 900px */}
            <div className="mk-rail-mobile" style={{ display: 'none', marginBottom: 14 }}>
              <Select full value={cat} onChange={v => patch({ cat: v })} ariaLabel="Category"
                options={[{ value: 'All', label: `All categories (${all.length})` }, ...CATEGORIES.filter(x => counts[x]).map(x => ({ value: x, label: `${x} (${counts[x]})` }))]} />
            </div>

            {skills.loading ? <Loader label="Loading skills" />
              : skills.error ? <ErrorBox message={skills.error} onRetry={skills.retry} />
              : results.length === 0 ? (
                <EmptyState title="No skills match those filters"
                  body="Try a different category, or clear the filters to see everything on the exchange."
                  action={<GhostButton onClick={() => setParams({}, { replace: true })}>Clear all filters</GhostButton>} />
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                    {slice.map((s, i) => <SkillCard key={s.id} skill={s} className={i < 8 ? 'fade-up' : undefined} />)}
                  </div>
                  {pages > 1 && <Pagination current={current} pages={pages} onGo={goPage} />}
                </>
              )}
          </main>
        </div>
      </div>
    </PageWrap>
  );
}

function RailSection({ title, children }) {
  const { c } = useTheme();
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontFamily: FONT_UI, fontSize: 10, fontWeight: 700, color: c.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0 10px', marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>{children}</div>
    </div>
  );
}

function RailItem({ label, count, active, onClick }) {
  const { c } = useTheme();
  return (
    <button onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%', textAlign: 'left', background: active ? c.goldSoft : 'transparent', border: 'none', borderRadius: 8, padding: '7px 10px', fontFamily: FONT_UI, fontSize: 12.5, fontWeight: active ? 600 : 400, color: active ? c.gold : c.textSub, cursor: 'pointer', transition: 'background 0.14s, color 0.14s' }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = c.surfaceHover; e.currentTarget.style.color = c.text; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = c.textSub; } }}>
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      {count !== undefined && <span style={{ fontSize: 11, color: c.textMuted, flexShrink: 0 }}>{count}</span>}
    </button>
  );
}

/* Windowed pager: first · … · current±1 · … · last */
function Pagination({ current, pages, onGo }) {
  const { c } = useTheme();
  const nums = [];
  const push = (n) => { if (!nums.includes(n) && n >= 1 && n <= pages) nums.push(n); };
  push(1); push(2);
  for (let i = current - 1; i <= current + 1; i++) push(i);
  push(pages - 1); push(pages);
  nums.sort((a, b) => a - b);

  const btn = (label, onClick, opts = {}) => (
    <button key={opts.key || label} onClick={onClick} disabled={opts.disabled} aria-current={opts.active ? 'page' : undefined}
      style={{ minWidth: 34, height: 34, padding: '0 9px', borderRadius: 8, cursor: opts.disabled ? 'default' : 'pointer', fontFamily: FONT_UI, fontSize: 12.5, fontWeight: opts.active ? 700 : 500, background: opts.active ? c.goldSoft : 'transparent', border: `1px solid ${opts.active ? c.gold : c.border}`, color: opts.disabled ? c.textMuted : opts.active ? c.gold : c.textSub, opacity: opts.disabled ? 0.4 : 1, transition: 'border-color 0.15s, color 0.15s' }}
      onMouseEnter={e => { if (!opts.disabled && !opts.active) { e.currentTarget.style.borderColor = c.gold; e.currentTarget.style.color = c.gold; } }}
      onMouseLeave={e => { if (!opts.disabled && !opts.active) { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.textSub; } }}>
      {label}
    </button>
  );

  const out = [];
  let prev = 0;
  nums.forEach(n => {
    if (prev && n - prev > 1) out.push(<span key={`gap${n}`} style={{ color: c.textMuted, fontFamily: FONT_UI, fontSize: 12, padding: '0 2px' }}>…</span>);
    out.push(btn(n, () => onGo(n), { active: n === current, key: `p${n}` }));
    prev = n;
  });

  return (
    <nav data-testid="pagination" aria-label="Pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap', marginTop: 30, paddingBottom: 8 }}>
      {btn('‹ Prev', () => onGo(current - 1), { disabled: current === 1, key: 'prev' })}
      {out}
      {btn('Next ›', () => onGo(current + 1), { disabled: current === pages, key: 'next' })}
    </nav>
  );
}
