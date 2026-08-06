pub const INDEX_HTML: &str = r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Job Index — reliable ingestion slice</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; background: #0b1020; color: #e8eefc; }
    main { width: min(1080px, calc(100% - 32px)); margin: 0 auto; padding: 40px 0 72px; }
    h1 { font-size: clamp(2rem, 5vw, 4rem); max-width: 880px; margin: 0; letter-spacing: -0.04em; }
    h2 { margin-top: 40px; }
    p { color: #aebbd5; line-height: 1.6; }
    code { color: #b9e5ff; }
    .controls, .metrics, .jobs { display: grid; gap: 12px; }
    .controls { grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); margin: 28px 0; }
    .metrics { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
    .metric, .job, .report, .source-state, .search-state { border: 1px solid #273553; background: #111a2e; border-radius: 16px; padding: 18px; }
    .metric strong { display: block; font-size: 2rem; margin-top: 6px; }
    button { border: 1px solid #456088; background: #182744; color: inherit; border-radius: 12px; padding: 12px 16px; font: inherit; cursor: pointer; }
    button.primary { background: #dbeafe; color: #10203b; border-color: #dbeafe; }
    button.live { background: #c7f9df; color: #102b20; border-color: #c7f9df; }
    button:disabled { opacity: .5; cursor: wait; }
    .job header { display: flex; justify-content: space-between; gap: 16px; align-items: start; }
    .job h3 { margin: 0 0 6px; }
    .source { display: inline-block; padding: 5px 9px; margin: 8px 6px 0 0; border-radius: 999px; background: #24385e; color: #cfe3ff; font-size: .85rem; }
    .source.inactive { opacity: .58; text-decoration: line-through; }
    .status { display: inline-block; padding: 4px 8px; border-radius: 999px; background: #25314a; font-size: .8rem; text-transform: uppercase; }
    .muted { color: #8fa1c1; font-size: .9rem; }
    .report { white-space: pre-wrap; overflow-wrap: anywhere; }
    .success { border-color: #2b7959; }
    .error { border-color: #a54555; }
    dl { display: grid; grid-template-columns: minmax(150px, 220px) 1fr; gap: 8px 16px; margin: 0; }
    dt { color: #8fa1c1; }
    dd { margin: 0; overflow-wrap: anywhere; }
  </style>
</head>
<body>
<main>
  <p class="muted">Cloudflare Worker · Rust · D1 · reliable NAV ingestion</p>
  <h1>A bounded collector that keeps the corpus current.</h1>
  <p>Collect NAV pages under a lease, checkpoint complete pages, recover failures, and evaluate saved searches incrementally.</p>

  <div class="controls">
    <button id="reset">Reset D1 demo</button>
    <button id="collect" class="primary">Collect fixture</button>
    <button id="replay">Replay fixture</button>
    <button id="nav-sync" class="live">Run bounded NAV sync</button>
    <button id="create-search">Create Oslo support search</button>
    <button id="evaluate-search" class="primary">Evaluate changed jobs</button>
  </div>

  <section class="metrics" aria-live="polite">
    <div class="metric"><span>Canonical jobs</span><strong id="canonical">—</strong></div>
    <div class="metric"><span>Source occurrences</span><strong id="occurrences">—</strong></div>
    <div class="metric"><span>Canonical changes</span><strong id="changes">—</strong></div>
    <div class="metric"><span>Completed runs</span><strong id="runs">—</strong></div>
  </section>

  <h2>NAV source state</h2>
  <div id="nav-state" class="source-state">No NAV sync has run yet.</div>

  <h2>Saved search state</h2>
  <div id="search-state" class="search-state">No saved search created yet.</div>

  <h2>Latest operation</h2>
  <div id="report" class="report">Run a fixture or live NAV operation.</div>

  <h2>Canonical corpus</h2>
  <div id="jobs" class="jobs"><p>No jobs collected yet.</p></div>

  <p class="muted" id="source-offer"></p>
</main>
<script>
  const controls = [...document.querySelectorAll('button')];
  const report = document.querySelector('#report');
  const jobsNode = document.querySelector('#jobs');
  const navStateNode = document.querySelector('#nav-state');
  const searchStateNode = document.querySelector('#search-state');
  const sourceOfferNode = document.querySelector('#source-offer');
  let activeSearchId = null;

  async function request(path, options = {}) {
    controls.forEach(button => button.disabled = true);
    report.className = 'report';
    try {
      const response = await fetch(path, options);
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
      report.textContent = JSON.stringify(value, null, 2);
      report.classList.add('success');
      await refresh();
    } catch (error) {
      report.textContent = String(error);
      report.classList.add('error');
    } finally {
      controls.forEach(button => button.disabled = false);
    }
  }

  async function refresh() {
    const [jobsResponse, navResponse, searchesResponse, aboutResponse] = await Promise.all([
      fetch('/api/jobs'),
      fetch('/api/sources/nav/status'),
      fetch('/api/searches'),
      fetch('/api/about')
    ]);
    if (aboutResponse.ok) {
      const about = await aboutResponse.json();
      sourceOfferNode.innerHTML = about.source_code_url
        ? `Licensed ${escapeHtml(about.license)} · <a href="${escapeHtml(about.source_code_url)}">Corresponding source code</a>`
        : `Licensed ${escapeHtml(about.license)}`;
    }
    if (!jobsResponse.ok) {
      jobsNode.innerHTML = '<p>Apply D1 migrations before running the demo.</p>';
      return;
    }
    const payload = await jobsResponse.json();
    document.querySelector('#canonical').textContent = payload.meta.canonical_jobs;
    document.querySelector('#occurrences').textContent = payload.meta.source_occurrences;
    document.querySelector('#changes').textContent = payload.meta.canonical_changes;
    document.querySelector('#runs').textContent = payload.meta.collection_runs;
    jobsNode.innerHTML = payload.data.length ? payload.data.map(job => `
      <article class="job">
        <header>
          <div><h3>${escapeHtml(job.title)}</h3><div>${escapeHtml(job.employer_name)} · ${escapeHtml(job.location)}</div></div>
          <div><span class="status">${escapeHtml(job.status)}</span><div class="muted">sequence ${job.sequence}</div></div>
        </header>
        <p>${escapeHtml(job.description)}</p>
        <div>${job.sources.map(source => `<span class="source ${source.active ? '' : 'inactive'}">${escapeHtml(source.source_name)} · ${escapeHtml(source.external_id)}</span>`).join('')}</div>
      </article>`).join('') : '<p>No jobs collected yet.</p>';



    if (searchesResponse.ok) {
      const searches = (await searchesResponse.json()).data;
      const search = searches[0];
      activeSearchId = search ? search.id : null;
      if (search) {
        const matchesResponse = await fetch(`/api/searches/${encodeURIComponent(search.id)}/matches`);
        const matches = matchesResponse.ok ? (await matchesResponse.json()).data : [];
        searchStateNode.innerHTML = `<dl>
          <dt>Name</dt><dd>${escapeHtml(search.name)}</dd>
          <dt>Query signature</dt><dd><code>${escapeHtml(search.query_signature)}</code></dd>
          <dt>Last evaluated sequence</dt><dd>${search.last_evaluated_sequence}</dd>
          <dt>Current matches</dt><dd>${matches.length}</dd>
          <dt>Locations</dt><dd>${escapeHtml(search.definition.locations.join(', ') || 'Any')}</dd>
          <dt>Include any</dt><dd>${escapeHtml(search.definition.include_terms.join(', ') || 'Any')}</dd>
          <dt>Exclude</dt><dd>${escapeHtml(search.definition.exclude_terms.join(', ') || 'None')}</dd>
        </dl>`;
      } else {
        searchStateNode.textContent = 'No saved search created yet.';
      }
    }
    if (navResponse.ok) {
      const nav = (await navResponse.json()).data;
      navStateNode.innerHTML = nav ? `<dl>
        <dt>Mode</dt><dd>${escapeHtml(nav.mode)}${nav.paused ? ' · paused' : ''}</dd>
        <dt>Cursor</dt><dd><code>${escapeHtml(nav.cursor)}</code></dd>
        <dt>Lease owner</dt><dd>${escapeHtml(nav.lease_owner || '—')}</dd>
        <dt>Retry after</dt><dd>${escapeHtml(nav.retry_after_at || '—')}</dd>
        <dt>Feed lag</dt><dd>${nav.lag_seconds == null ? '—' : `${nav.lag_seconds}s`}</dd>
        <dt>Last attempt</dt><dd>${escapeHtml(nav.last_attempt_at || '—')}</dd>
        <dt>Last success</dt><dd>${escapeHtml(nav.last_success_at || '—')}</dd>
        <dt>Failures</dt><dd>${nav.consecutive_failures} · ${escapeHtml(nav.last_failure_class || 'none')}</dd>
        <dt>Pages processed</dt><dd>${nav.pages_processed}</dd>
        <dt>Observations</dt><dd>${nav.observations_processed}</dd>
        <dt>Last run duration</dt><dd>${nav.last_run_duration_ms}ms</dd>
        <dt>Last error</dt><dd>${escapeHtml(nav.last_error || '—')}</dd>
      </dl>` : 'No NAV sync has run yet.';
    }
  }



  async function createDemoSearch() {
    await request('/api/searches', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Oslo support and customer service',
        definition: {
          locations: ['Oslo'],
          include_terms: ['support', 'customer'],
          exclude_terms: ['senior']
        }
      })
    });
  }

  async function evaluateSearch() {
    if (!activeSearchId) {
      await createDemoSearch();
    }
    if (activeSearchId) {
      await request(`/api/searches/${encodeURIComponent(activeSearchId)}/evaluate`, { method: 'POST' });
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]));
  }

  document.querySelector('#reset').addEventListener('click', () => request('/api/demo/reset', { method: 'POST' }));
  document.querySelector('#collect').addEventListener('click', () => request('/api/demo/collect', { method: 'POST' }));
  document.querySelector('#replay').addEventListener('click', () => request('/api/demo/collect', { method: 'POST' }));
  document.querySelector('#nav-sync').addEventListener('click', () => request('/api/sources/nav/sync', { method: 'POST' }));
  document.querySelector('#create-search').addEventListener('click', createDemoSearch);
  document.querySelector('#evaluate-search').addEventListener('click', evaluateSearch);
  refresh();
</script>
</body>
</html>"#;

pub const PRODUCTION_INDEX_HTML: &str = r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Job Index API</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; background: #0b1020; color: #e8eefc; }
    main { width: min(760px, calc(100% - 32px)); margin: 0 auto; padding: 64px 0; }
    h1 { font-size: clamp(2rem, 6vw, 4rem); letter-spacing: -.04em; }
    p, li { color: #aebbd5; line-height: 1.6; }
    a { color: #b9e5ff; }
    code { color: #c7f9df; }
  </style>
</head>
<body>
<main>
  <p>Rust · Cloudflare Workers · D1</p>
  <h1>Job Index API</h1>
  <p>The production service exposes a bounded, versioned Norwegian job corpus API. Demo mutation controls are disabled in this environment.</p>
  <ul>
    <li><a href="/api/health">Health</a></li>
    <li><a href="/api/about">License and corresponding source</a></li>
    <li><a href="/api/v1/jobs?status=active&amp;limit=25">Active jobs</a></li>
    <li><a href="/api/v1/changes?limit=25">Corpus changes</a></li>
    <li><a href="/api/v1/sources">Source health</a></li>
  </ul>
</main>
</body>
</html>"#;

/// The browse-and-inspect page: the corpus as something a person can search.
///
/// It reads the same public `/api/v1` endpoints an external client would, so a
/// regression in the API surfaces here rather than being masked by a private
/// query path.
pub const BROWSE_HTML: &str = r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Job Index — browse</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #0b1020; color: #e8eefc; }
    main { width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 32px 0 72px; }
    h1 { font-size: clamp(1.6rem, 3vw, 2.4rem); margin: 0 0 4px; letter-spacing: -0.03em; }
    p { color: #aebbd5; line-height: 1.6; }
    .muted { color: #8fa1c1; font-size: .9rem; }
    form { display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 10px; margin: 22px 0 10px; }
    input, select, button { font: inherit; border-radius: 12px; padding: 11px 13px; }
    input, select { border: 1px solid #273553; background: #111a2e; color: inherit; }
    button { border: 1px solid #456088; background: #182744; color: inherit; cursor: pointer; }
    button.primary { background: #dbeafe; color: #10203b; border-color: #dbeafe; }
    button:disabled { opacity: .5; cursor: wait; }
    .layout { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 18px; align-items: start; }
    @media (max-width: 900px) { .layout, form { grid-template-columns: 1fr; } }
    .card { border: 1px solid #273553; background: #111a2e; border-radius: 16px; padding: 16px; }
    .result { cursor: pointer; margin-bottom: 10px; }
    .result:hover, .result[aria-selected="true"] { border-color: #6f8fc4; }
    .result h3 { margin: 0 0 4px; font-size: 1.02rem; }
    .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 8px; }
    .tag { padding: 4px 9px; border-radius: 999px; background: #24385e; color: #cfe3ff; font-size: .78rem; }
    .tag.warn { background: #4a3722; color: #ffd9a8; }
    .tag.ok { background: #1f4535; color: #b7f0d2; }
    .detail h2 { margin: 0 0 6px; font-size: 1.25rem; }
    .detail .body { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 46vh; overflow-y: auto; color: #cbd7ee; line-height: 1.65; }
    dl { display: grid; grid-template-columns: minmax(110px, 150px) 1fr; gap: 6px 14px; margin: 12px 0; }
    dt { color: #8fa1c1; } dd { margin: 0; overflow-wrap: anywhere; }
    .coverage { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    .empty { padding: 28px; text-align: center; }
  </style>
</head>
<body>
<main>
  <p class="muted">Browse · inspect · save — <a href="/apply">my applications →</a></p>
  <h1>Find a job in the corpus</h1>
  <p id="coverage" class="muted">Loading source coverage…</p>

  <form id="search" autocomplete="off">
    <input id="term" name="term" type="search" placeholder="Search title, employer, or description">
    <input id="location" name="location" type="text" placeholder="Location (e.g. Oslo)">
    <select id="status" name="status">
      <option value="active">Active only</option>
      <option value="">Any status</option>
      <option value="closed">Closed</option>
    </select>
    <button class="primary" type="submit">Search</button>
  </form>

  <div class="layout">
    <section>
      <p id="summary" class="muted">Searching…</p>
      <div id="results"></div>
      <button id="more" hidden>Load more</button>
    </section>
    <aside id="detail" class="card detail">
      <p class="muted empty">Select a listing to inspect it.</p>
    </aside>
  </div>
</main>
<script>
  const resultsNode = document.querySelector('#results');
  const detailNode = document.querySelector('#detail');
  const summaryNode = document.querySelector('#summary');
  const moreButton = document.querySelector('#more');
  let cursor = null;
  let loaded = [];

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]
  ));

  function queryString(withCursor) {
    const params = new URLSearchParams();
    const term = document.querySelector('#term').value.trim();
    const location = document.querySelector('#location').value.trim();
    const status = document.querySelector('#status').value;
    if (term) params.set('term', term);
    if (location) params.set('location', location);
    if (status) params.set('status', status);
    params.set('limit', '25');
    if (withCursor && cursor) params.set('cursor', cursor);
    return params.toString();
  }

  function renderResults(append) {
    if (!loaded.length) {
      resultsNode.innerHTML = '<div class="card empty"><p class="muted">No listings match that search.</p></div>';
      return;
    }
    const markup = loaded.map((job, index) => `
      <article class="card result" data-index="${index}" tabindex="0" aria-selected="false">
        <h3>${escapeHtml(job.title)}</h3>
        <div class="muted">${escapeHtml(job.employer_name)} · ${escapeHtml(job.location)}</div>
        <div class="row">
          <span class="tag ${job.status === 'active' ? 'ok' : ''}">${escapeHtml(job.status)}</span>
          ${job.deadline ? `<span class="tag warn">apply by ${escapeHtml(job.deadline)}</span>` : ''}
          ${(job.source_ids || []).map((id) => `<span class="tag">${escapeHtml(id)}</span>`).join('')}
        </div>
      </article>`).join('');
    resultsNode.innerHTML = markup;
    if (!append) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showDetail(job) {
    document.querySelectorAll('.result').forEach((node) => node.setAttribute('aria-selected', 'false'));
    const selected = document.querySelector(`.result[data-index="${loaded.indexOf(job)}"]`);
    if (selected) selected.setAttribute('aria-selected', 'true');
    detailNode.innerHTML = `
      <h2>${escapeHtml(job.title)}</h2>
      <p class="muted">${escapeHtml(job.employer_name)} · ${escapeHtml(job.location)}</p>
      <dl>
        <dt>Status</dt><dd>${escapeHtml(job.status)}</dd>
        <dt>Published</dt><dd>${escapeHtml(job.published_at)}</dd>
        <dt>Deadline</dt><dd>${job.deadline ? escapeHtml(job.deadline) : 'not stated'}</dd>
        <dt>Sources</dt><dd>${escapeHtml((job.source_ids || []).join(', '))}</dd>
      </dl>
      <div class="row">
        <a class="tag" href="${escapeHtml(job.application_url)}" target="_blank" rel="noopener noreferrer">Open advert</a>
        <button id="save" data-job="${escapeHtml(job.id)}">Save to shortlist</button>
      </div>
      <p id="save-status" class="muted"></p>
      <h3>Description</h3>
      <div class="body">${escapeHtml(job.description)}</div>`;
  }

  async function search(append) {
    moreButton.disabled = true;
    try {
      const response = await fetch(`/api/v1/jobs?${queryString(append)}`);
      if (!response.ok) throw new Error(`search failed: ${response.status}`);
      const payload = await response.json();
      loaded = append ? loaded.concat(payload.data) : payload.data;
      cursor = payload.meta.next_cursor;
      moreButton.hidden = !cursor;
      summaryNode.textContent = `${loaded.length} listing${loaded.length === 1 ? '' : 's'}${cursor ? ' so far' : ''}`;
      renderResults(append);
    } catch (error) {
      summaryNode.textContent = String(error);
    } finally {
      moreButton.disabled = false;
    }
  }

  detailNode.addEventListener('click', async (event) => {
    const button = event.target.closest('#save');
    if (!button) return;
    const status = document.querySelector('#save-status');
    let key = sessionStorage.getItem('jobIndexKey');
    if (!key) {
      key = window.prompt('API key for your account (kept in this browser only):') || '';
      if (!key.trim()) return;
      sessionStorage.setItem('jobIndexKey', key.trim());
    }
    button.disabled = true;
    status.textContent = 'Saving…';
    try {
      const response = await fetch('/api/v1/me/saved', {
        method: 'POST',
        headers: { 'x-api-key': sessionStorage.getItem('jobIndexKey'), 'content-type': 'application/json' },
        body: JSON.stringify({ job_id: button.dataset.job }),
      });
      const payload = await response.json().catch(() => ({}));
      status.innerHTML = response.ok
        ? 'Saved — <a href="/apply">draft and apply</a>.'
        : escapeHtml(payload?.error?.message || `save failed: ${response.status}`);
    } catch (error) {
      status.textContent = String(error);
    } finally {
      button.disabled = false;
    }
  });

  resultsNode.addEventListener('click', (event) => {
    const card = event.target.closest('.result');
    if (card) showDetail(loaded[Number(card.dataset.index)]);
  });
  document.querySelector('#search').addEventListener('submit', (event) => {
    event.preventDefault();
    cursor = null;
    search(false);
  });
  moreButton.addEventListener('click', () => search(true));

  fetch('/api/v1/sources/catalog?limit=1').then((response) => response.json()).then((payload) => {
    const tiers = (payload.meta.tiers || []).map((tier) => `${tier.count} ${tier.acquisition_tier}`).join(' · ');
    document.querySelector('#coverage').textContent =
      `${payload.meta.total} researched platforms — ${tiers}`;
  }).catch(() => {
    document.querySelector('#coverage').textContent = 'Source coverage unavailable.';
  });

  search(false);
</script>
</body>
</html>"#;

/// The application workspace: shortlist, drafts, and submissions.
///
/// Drives the same `/api/v1/me` endpoints an external client would, with the
/// account's API key held only in this browser session, so the page never
/// becomes a second, weaker authentication path.
pub const APPLY_HTML: &str = r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Job Index — my applications</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #0b1020; color: #e8eefc; }
    main { width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 32px 0 72px; }
    h1 { font-size: clamp(1.6rem, 3vw, 2.4rem); margin: 0 0 4px; letter-spacing: -0.03em; }
    p, li { color: #aebbd5; line-height: 1.6; }
    .muted { color: #8fa1c1; font-size: .9rem; }
    a { color: #b9e5ff; }
    input, textarea, button, select { font: inherit; border-radius: 12px; padding: 11px 13px; }
    input, textarea, select { border: 1px solid #273553; background: #111a2e; color: inherit; width: 100%; }
    textarea { min-height: 92px; resize: vertical; }
    button { border: 1px solid #456088; background: #182744; color: inherit; cursor: pointer; }
    button.primary { background: #dbeafe; color: #10203b; border-color: #dbeafe; }
    button:disabled { opacity: .5; cursor: wait; }
    .card { border: 1px solid #273553; background: #111a2e; border-radius: 16px; padding: 16px; margin-bottom: 12px; }
    .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 10px; }
    .tag { padding: 4px 9px; border-radius: 999px; background: #24385e; color: #cfe3ff; font-size: .78rem; }
    .tag.stage-applied { background: #1f4535; color: #b7f0d2; }
    .tag.stage-drafted { background: #4a3722; color: #ffd9a8; }
    .tag.premium { background: #3b2a55; color: #dcc9ff; }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 18px; align-items: start; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #0d1526; border: 1px solid #22304d;
          border-radius: 12px; padding: 12px; max-height: 40vh; overflow-y: auto; color: #cbd7ee; }
    .notice { border-left: 3px solid #6f8fc4; padding-left: 10px; }
    .error { color: #ffb4c0; }
  </style>
</head>
<body>
<main>
  <p class="muted"><a href="/browse">← browse</a> · save · draft · apply</p>
  <h1>My applications</h1>

  <section class="card">
    <p class="muted">The key is kept in this browser only, and sent as <code>x-api-key</code>.</p>
    <div class="row">
      <input id="key" type="password" placeholder="Your API key" style="flex:1 1 320px">
      <button id="connect" class="primary">Connect</button>
    </div>
    <p id="who" class="muted"></p>
  </section>

  <div class="grid">
    <section>
      <h2>Shortlist</h2>
      <div id="saved"><p class="muted">Connect to load your shortlist.</p></div>
    </section>
    <section>
      <h2>Drafts and submission</h2>
      <div id="workspace"><p class="muted">Select a shortlisted vacancy.</p></div>
    </section>
  </div>
</main>
<script>
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const savedNode = document.querySelector('#saved');
  const workNode = document.querySelector('#workspace');
  const whoNode = document.querySelector('#who');
  let apiKey = sessionStorage.getItem('jobIndexKey') || '';
  let selected = null;

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { 'x-api-key': apiKey, 'content-type': 'application/json', ...(options.headers || {}) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.error?.message || `request failed: ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  async function connect() {
    apiKey = document.querySelector('#key').value.trim();
    if (!apiKey) return;
    sessionStorage.setItem('jobIndexKey', apiKey);
    try {
      const me = await api('/api/v1/me');
      const capabilities = me.data.capabilities;
      const premium = capabilities.model_drafting;
      whoNode.innerHTML = `Signed in as ${escapeHtml(me.data.user.display_name)} ·
        <span class="tag ${premium ? 'premium' : ''}">${escapeHtml(me.data.user.subscription_tier)}</span>
        ${premium ? '' : '<span class="muted">— model drafting and automated apply need premium</span>'}`;
      await loadSaved();
    } catch (error) {
      whoNode.innerHTML = `<span class="error">${escapeHtml(error.message)}</span>`;
    }
  }

  async function loadSaved() {
    const page = await api('/api/v1/me/saved');
    if (!page.data.length) {
      savedNode.innerHTML = '<p class="muted">Nothing saved yet — <a href="/browse">find a job</a>.</p>';
      return;
    }
    savedNode.innerHTML = page.data.map((job) => `
      <article class="card">
        <strong>${escapeHtml(job.title)}</strong>
        <div class="muted">${escapeHtml(job.employer_name)} · ${escapeHtml(job.location)}</div>
        <div class="row">
          <span class="tag stage-${escapeHtml(job.stage)}">${escapeHtml(job.stage)}</span>
          ${job.deadline ? `<span class="tag">apply by ${escapeHtml(job.deadline)}</span>` : ''}
          <button data-open="${escapeHtml(job.id)}">Open</button>
          <button data-remove="${escapeHtml(job.id)}">Remove</button>
        </div>
      </article>`).join('');
  }

  async function openJob(savedId) {
    selected = savedId;
    workNode.innerHTML = '<p class="muted">Loading…</p>';
    const applications = await api('/api/v1/me/applications');
    const existing = applications.data.find((item) => item.saved_job_id === savedId);
    workNode.innerHTML = `
      <div class="card">
        <div class="row">
          <button id="draft" class="primary">Draft CV + letter</button>
          <button id="draft-model">Draft with model (premium)</button>
          <button id="apply">Prepare application</button>
          <button id="apply-auto">Submit automatically (premium)</button>
        </div>
        <p id="status" class="muted"></p>
        ${existing ? `<p class="notice muted">Recorded as <strong>${escapeHtml(existing.status)}</strong>
           via ${escapeHtml(existing.method)}.</p>` : ''}
      </div>
      <div id="documents"></div>`;

    document.querySelector('#draft').onclick = () => runDraft('template');
    document.querySelector('#draft-model').onclick = () => runDraft('model');
    document.querySelector('#apply').onclick = () => runApply('assisted');
    document.querySelector('#apply-auto').onclick = () => runApply('automated');
  }

  function setStatus(message, isError) {
    const node = document.querySelector('#status');
    if (node) node.innerHTML = isError ? `<span class="error">${escapeHtml(message)}</span>` : escapeHtml(message);
  }

  async function runDraft(generator) {
    setStatus('Drafting…');
    try {
      const result = await api(`/api/v1/me/saved/${selected}/draft`, {
        method: 'POST', body: JSON.stringify({ generator }),
      });
      document.querySelector('#documents').innerHTML = result.data.map((draft) => `
        <div class="card">
          <strong>${escapeHtml(draft.kind)} · v${draft.version} · ${escapeHtml(draft.generator)}</strong>
          <pre>${escapeHtml(draft.content)}</pre>
        </div>`).join('');
      setStatus('Drafted.');
      await loadSaved();
    } catch (error) {
      setStatus(error.status === 402 ? `${error.message}` : error.message, true);
    }
  }

  async function runApply(method) {
    setStatus('Preparing…');
    try {
      const result = await api(`/api/v1/me/saved/${selected}/apply`, {
        method: 'POST', body: JSON.stringify({ method }),
      });
      const data = result.data;
      document.querySelector('#documents').innerHTML = `
        <div class="card">
          <strong>${escapeHtml(data.application.method)} · ${escapeHtml(data.application.status)}</strong>
          ${data.automation_note ? `<p class="notice">${escapeHtml(data.automation_note)}</p>` : ''}
          <p><a href="${escapeHtml(data.application.application_url)}" target="_blank" rel="noopener noreferrer">Open the advert to submit</a></p>
          <pre>${escapeHtml(data.letter)}</pre>
          <pre>${escapeHtml(data.cv)}</pre>
        </div>`;
      setStatus('Ready.');
      await loadSaved();
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  savedNode.addEventListener('click', async (event) => {
    const open = event.target.dataset.open;
    const remove = event.target.dataset.remove;
    if (open) await openJob(open);
    if (remove) {
      await api(`/api/v1/me/saved/${remove}`, { method: 'DELETE' });
      await loadSaved();
    }
  });
  document.querySelector('#connect').onclick = connect;
  if (apiKey) { document.querySelector('#key').value = apiKey; connect(); }
</script>
</body>
</html>"#;
