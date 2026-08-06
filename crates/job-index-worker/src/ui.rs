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
