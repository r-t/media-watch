const IMG = 'https://image.tmdb.org/t/p/';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtSize = (b) => (b >= 1e12 ? (b / 1e12).toFixed(2) + ' TB' : b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : (b / 1e6).toFixed(0) + ' MB');

const state = { category: 'All', kind: '', genre: '', sort: 'title', order: '', q: '', unmatched: false };
let items = [];

// Restore last view
try { Object.assign(state, JSON.parse(localStorage.getItem('mw-state') || '{}'), { q: '' }); } catch {}
const persist = () => { try { localStorage.setItem('mw-state', JSON.stringify(state)); } catch {} };

async function loadStats() {
  const s = await fetch('/api/stats').then((r) => r.json());
  document.querySelectorAll('#tabs button').forEach((b) => {
    const c = b.dataset.cat;
    b.querySelector('span').textContent = c === 'All' ? s.total : s.counts[c] || 0;
  });
  const sel = $('#genre');
  sel.innerHTML = '<option value="">All genres</option>' + s.genres.map((g) => `<option>${esc(g)}</option>`).join('');
  sel.value = state.genre;

  const msgs = [];
  if (!s.mounted) msgs.push(`Media volume <b>${esc(s.mediaRoot)}</b> is not mounted — showing cached data.`);
  if (!s.hasKey) msgs.push('No <code>TMDB_API_KEY</code> in <code>.env</code> — titles will show without posters/metadata.');
  if (!s.total) msgs.push('Library is empty. Click <b>Rescan</b> (or run <code>npm run scan</code>) to index the NAS.');
  if (s.scanning) msgs.push(`Scan in progress… ${s.scanning.done}/${s.scanning.total}`);
  const n = $('#notice');
  n.hidden = !msgs.length;
  n.innerHTML = msgs.join('<br>');
  return s;
}

async function loadItems() {
  const p = new URLSearchParams();
  if (state.category !== 'All') p.set('category', state.category);
  if (state.kind) p.set('kind', state.kind);
  if (state.genre) p.set('genre', state.genre);
  if (state.unmatched) p.set('status', 'unmatched');
  p.set('sort', state.sort);
  if (state.order) p.set('order', state.order);
  if (state.q) p.set('q', state.q);
  const r = await fetch('/api/library?' + p).then((r) => r.json());
  items = r.items;
  render();
}

function card(i, idx) {
  const t = i.tmdb;
  const poster = t?.poster
    ? `<img loading="lazy" src="${IMG}w342${t.poster}" alt="">`
    : `<div class="ph">${esc(i.title)}</div>`;
  const sub = [i.year, i.kind === 'tv' ? (i.seasons ? `${i.seasons} season${i.seasons > 1 ? 's' : ''}` : `${i.episodeCount} files`) : t?.runtime ? `${t.runtime} min` : null]
    .filter(Boolean).join(' · ');
  const chips = [
    ...i.editions.map((e) => `<span class="chip">${esc(e)}</span>`),
    !t ? '<span class="chip warn">unmatched</span>' : '',
  ].join('');
  return `<article class="card" tabindex="0" data-idx="${idx}">
    <div class="poster">${poster}
      ${t?.rating ? `<span class="badge r">★ ${t.rating}</span>` : ''}
      ${i.category === 'Anime' ? `<span class="badge tv">${i.kind === 'tv' ? 'TV' : 'Film'}</span>` : ''}
    </div>
    <div class="meta"><div class="t">${esc(i.title)}</div><div class="s">${esc(sub)}</div>${chips ? `<div class="chips">${chips}</div>` : ''}</div>
  </article>`;
}

function render() {
  $('#count').textContent = `${items.length} title${items.length === 1 ? '' : 's'}`;
  $('#grid').innerHTML = items.length ? items.map(card).join('') : '<div class="empty">Nothing here.</div>';
}

function openDetail(i) {
  const t = i.tmdb || {};
  const kv = [
    ['Category', `${i.category} · ${i.kind === 'tv' ? 'TV series' : 'Movie'}`],
    ['Released', t.releaseDate],
    ['Genres', t.genres?.join(', ')],
    ['Rating', t.rating ? `★ ${t.rating} (${t.votes?.toLocaleString()} votes)` : null],
    ['Runtime', t.runtime ? `${t.runtime} min${i.kind === 'tv' ? ' / episode' : ''}` : null],
    ['Seasons', i.kind === 'tv' ? `${i.seasons ?? '?'} on disk${t.seasons ? ` · ${t.seasons} total (${t.status})` : ''}` : null],
    ['Episodes', i.kind === 'tv' ? `${i.episodeCount} files${t.episodes ? ` · ${t.episodes} aired` : ''}` : null],
    ['Editions', i.editions.join(', ')],
    ['Total size', fmtSize(i.size)],
    ['Added', new Date(i.addedAt).toLocaleDateString()],
    ['TMDB', t.url ? `<a href="${t.url}" target="_blank" rel="noopener">${t.id}</a>` : '<span style="color:var(--bad)">not matched</span>'],
  ].filter(([, v]) => v);

  $('#detail-body').innerHTML = `
    <div class="hero" style="${t.backdrop ? `background-image:url(${IMG}w1280${t.backdrop})` : ''}"></div>
    <div class="d-main">
      <div class="poster">${t.poster ? `<img src="${IMG}w342${t.poster}" alt="">` : `<div class="ph">${esc(i.title)}</div>`}</div>
      <div>
        <h2>${esc(t.title || i.title)}</h2>
        <div class="sub">${esc([i.year, t.originalTitle && t.originalTitle !== t.title ? t.originalTitle : null].filter(Boolean).join(' · '))}</div>
        ${t.overview ? `<p>${esc(t.overview)}</p>` : ''}
        <dl class="kv">${kv.map(([k, v]) => `<dt>${k}</dt><dd>${k === 'TMDB' ? v : esc(v)}</dd>`).join('')}</dl>
      </div>
    </div>
    <div class="files"><h3>Files (${i.files.length})</h3><ul>
      ${i.files.map((f) => `<li><code>${esc(f.path)}</code><span class="sz">${fmtSize(f.size)}</span></li>`).join('')}
    </ul></div>
    <div class="fix"><h3>${i.tmdb ? 'Wrong match?' : 'Match manually'}</h3>
      <form id="fix-form"><input name="tmdb" placeholder="TMDB id or URL, e.g. https://www.themoviedb.org/${i.kind === 'tv' ? 'tv' : 'movie'}/78" required>
      <button class="btn">Apply</button></form>
      <div class="muted" style="font-size:12px;margin-top:6px">Searched as “${esc(i.title)}”${i.year ? ` (${i.year})` : ''}. <a target="_blank" rel="noopener" href="https://www.themoviedb.org/search/${i.kind === 'tv' ? 'tv' : 'movie'}?query=${encodeURIComponent(i.title)}">Search TMDB ↗</a></div>
    </div>`;

  $('#fix-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    const r = await fetch('/api/items/' + encodeURIComponent(i.id), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tmdbId: e.target.tmdb.value }),
    });
    const body = await r.json();
    btn.disabled = false;
    if (!r.ok) return alert(body.error);
    Object.assign(i, body);
    openDetail(i);
    render();
    loadStats();
  };
  const dlg = $('#detail');
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
}

// --- Wiring ---
function syncControls() {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.cat === state.category));
  $('#kind').value = state.kind;
  $('#sort').value = state.sort;
  $('#unmatched').checked = state.unmatched;
}
const update = () => { persist(); syncControls(); loadItems(); };

$('#tabs').onclick = (e) => {
  const b = e.target.closest('button');
  if (b) { state.category = b.dataset.cat; update(); }
};
$('#kind').onchange = (e) => { state.kind = e.target.value; update(); };
$('#genre').onchange = (e) => { state.genre = e.target.value; update(); };
$('#sort').onchange = (e) => { state.sort = e.target.value; state.order = ''; update(); };
$('#order').onclick = () => {
  const def = state.sort === 'title' ? 'asc' : 'desc';
  state.order = (state.order || def) === 'asc' ? 'desc' : 'asc';
  update();
};
$('#unmatched').onchange = (e) => { state.unmatched = e.target.checked; update(); };

let qTimer;
$('#q').oninput = (e) => {
  clearTimeout(qTimer);
  qTimer = setTimeout(() => { state.q = e.target.value.trim(); loadItems(); }, 120);
};
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== $('#q') && !$('#detail').open) { e.preventDefault(); $('#q').focus(); }
});

$('#grid').onclick = (e) => {
  const c = e.target.closest('.card');
  if (c) openDetail(items[c.dataset.idx]);
};
$('#grid').onkeydown = (e) => {
  if (e.key === 'Enter' && e.target.classList.contains('card')) openDetail(items[e.target.dataset.idx]);
};
$('#detail').onclick = (e) => { if (e.target === $('#detail')) $('#detail').close(); };

$('#rescan').onclick = async () => {
  const btn = $('#rescan');
  btn.disabled = true;
  btn.textContent = 'Scanning…';
  const poll = setInterval(async () => {
    const s = await loadStats();
    if (s.scanning) btn.textContent = `Scanning ${s.scanning.done}/${s.scanning.total}`;
  }, 1000);
  try {
    const r = await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const body = await r.json();
    if (!r.ok) alert(body.error);
    else alert(`Scan complete: ${body.total} titles, ${body.added} new, ${body.removed} removed, ${body.enriched} matched, ${body.failed} unmatched.${body.warning ? '\n' + body.warning : ''}`);
  } finally {
    clearInterval(poll);
    btn.disabled = false;
    btn.textContent = 'Rescan';
    await loadStats();
    loadItems();
  }
};

syncControls();
loadStats();
loadItems();
