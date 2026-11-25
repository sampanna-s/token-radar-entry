// Token Radar dashboard: renders window.RADAR (written by main.ts) with no
// network. Sorting, filtering and the detail view all run in this file.

(function () {
  var D = window.RADAR;
  if (!D || !Array.isArray(D.rows)) {
    document.getElementById('rows').innerHTML = '<tr><td colspan="8">No radar data was loaded.</td></tr>';
    return;
  }

  var $ = function (id) { return document.getElementById(id); };

  function money(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n;
  }
  function pct(n) {
    if (n === null || n === undefined) return '—';
    var s = (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
    return '<span class="' + (n >= 0 ? 'up' : 'down') + '">' + s + '</span>';
  }
  function ageText(days) {
    if (days === null || days === undefined) return '—';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return days + 'd';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---- header stats -------------------------------------------------------
  $('stats').innerHTML =
    '<div class="stat"><b>' + D.board_size + '</b><span>ranked</span></div>' +
    '<div class="stat"><b>' + D.watchlist_size + '</b><span>watchlist</span></div>' +
    '<div class="stat"><b>' + D.early_size + '</b><span>early finds</span></div>' +
    '<div class="stat"><b>' + money(D.rows[0].implied_value_usd) + '</b><span>top implied value</span></div>';

  // ---- model box ----------------------------------------------------------
  var m = D.model;
  $('model-box').innerHTML =
    '<h2>How the ranking works — model ' + esc(D.model_version) + '</h2>' +
    '<p>Implied value = <code>TVL × ' + m.base_multiple + '</code> × growth × maturity. ' +
    'Growth is the seven-day TVL change, clamped to ' + m.growth_floor + '%…+' + m.growth_cap +
    '%, weighted ×' + m.growth_weight + '. Maturity rewards time running with no token recorded: ' +
    '<code>0.55 + 0.45 × √(age ÷ ' + m.maturity_days + ' days)</code>, so the first years count most. ' +
    'A protocol with no listing date is scored as ' + m.unknown_age_days + ' days old.</p>' +
    '<p>Only protocols that record no token are ranked. Wrapped, staked and bridged products, exchanges and versioned pools are left out, and the live-token protocols sit apart below at their market values. Snapshot ' +
    esc(D.as_of) + ' · watchlist floor ' + money(D.floor_usd) + '.</p>';

  // ---- filter options -----------------------------------------------------
  function fillSelect(el, values) {
    values.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v; o.textContent = v;
      el.appendChild(o);
    });
  }
  var cats = [], chains = [];
  D.rows.forEach(function (r) {
    if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
    (r.chains || []).forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  cats.sort(); chains.sort();
  fillSelect($('cat'), cats);
  fillSelect($('chain'), chains);

  // ---- state from the hash ------------------------------------------------
  function hashState() {
    var out = {};
    var h = window.location.hash.replace(/^#/, '');
    h.split('&').forEach(function (pair) {
      var kv = pair.split('=');
      if (kv[0]) out[kv[0]] = decodeURIComponent(kv[1] || '');
    });
    return out;
  }
  var state = {
    q: '',
    cat: '',
    chain: '',
    watch: false,
    sort: 'rank',
    detail: null
  };
  var h0 = hashState();
  if (h0.q) state.q = h0.q;
  if (h0.cat) state.cat = h0.cat;
  if (h0.chain) state.chain = h0.chain;
  if (h0.watch === '1') state.watch = true;
  if (h0.sort) state.sort = h0.sort;
  if (h0.detail) state.detail = h0.detail;

  function writeHash() {
    var parts = [];
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.cat) parts.push('cat=' + encodeURIComponent(state.cat));
    if (state.chain) parts.push('chain=' + encodeURIComponent(state.chain));
    if (state.watch) parts.push('watch=1');
    if (state.sort !== 'rank') parts.push('sort=' + state.sort);
    if (state.detail) parts.push('detail=' + encodeURIComponent(state.detail));
    var h = parts.length ? '#' + parts.join('&') : '#';
    if (window.location.hash !== h) history.replaceState(null, '', h);
  }

  // ---- filtering and sorting ----------------------------------------------
  var SORTS = {
    rank: function (a, b) { return a.rank - b.rank; },
    value: function (a, b) { return b.implied_value_usd - a.implied_value_usd || a.rank - b.rank; },
    tvl: function (a, b) { return b.tvl_usd - a.tvl_usd || a.rank - b.rank; },
    growth: function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0) || a.rank - b.rank; },
    age: function (a, b) { return (b.age_days || 0) - (a.age_days || 0) || a.rank - b.rank; },
    name: function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : a.rank - b.rank; },
    category: function (a, b) { return (a.category || '') < (b.category || '') ? -1 : 1; }
  };

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var rows = D.rows.filter(function (r) {
      if (state.watch && !r.on_watchlist) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (q && (r.name + ' ' + r.slug).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    rows.sort(SORTS[state.sort] || SORTS.rank);
    return rows;
  }

  function rowHtml(r) {
    return '<tr data-slug="' + esc(r.slug) + '"' + (state.detail === r.slug ? ' class="open"' : '') + '>' +
      '<td class="num">' + r.rank + '</td>' +
      '<td><b>' + esc(r.name) + '</b>' + (r.on_watchlist ? '<span class="badge">WATCHLIST</span>' : '') +
      '<br><span class="slug">' + esc(r.slug) + '</span></td>' +
      '<td>' + esc(r.category || '—') + '</td>' +
      '<td>' + esc((r.chains || []).slice(0, 2).join(', ') || '—') + '</td>' +
      '<td class="num">' + money(r.tvl_usd) + '</td>' +
      '<td class="num">' + pct(r.change_7d) + '</td>' +
      '<td class="num">' + ageText(r.age_days) + '</td>' +
      '<td class="num value">' + money(r.implied_value_usd) + '</td></tr>';
  }

  function renderBoard() {
    var rows = filtered();
    $('rows').innerHTML = rows.map(rowHtml).join('');
    $('empty').hidden = rows.length > 0;
    $('count').textContent = rows.length + ' of ' + D.board_size + ' shown';
  }

  // ---- detail view ----------------------------------------------------------
  function renderDetail() {
    var box = $('detail');
    var r = null;
    if (state.detail) {
      for (var i = 0; i < D.rows.length; i++) if (D.rows[i].slug === state.detail) { r = D.rows[i]; break; }
    }
    if (!r) { box.hidden = true; box.innerHTML = ''; document.body.classList.remove('detail-open'); return; }
    var base = Math.round(r.tvl_usd * D.model.base_multiple);
    var steps = r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    box.innerHTML =
      '<button class="back" data-close>← Back to the board</button>' +
      '<h2>#' + r.rank + ' · ' + esc(r.name) + (r.on_watchlist ? ' <span class="badge">WATCHLIST</span>' : '') + '</h2>' +
      '<p class="sub">' + esc(r.slug) + ' · ' + esc(r.category || 'No category') + ' · ' + esc((r.chains || []).join(', ') || 'No chain listed') +
      ' · tracked since ' + esc(r.listed_at || 'unknown') + ' · records no token in the snapshot.</p>' +
      '<div class="grid">' +
      '<div class="cell"><span>Implied value</span><b>' + money(r.implied_value_usd) + '</b></div>' +
      '<div class="cell"><span>TVL</span><b>' + money(r.tvl_usd) + '</b></div>' +
      '<div class="cell"><span>7-day change</span><b>' + pct(r.change_7d) + '</b></div>' +
      '<div class="cell"><span>Age with no token</span><b>' + ageText(r.age_days) + '</b></div>' +
      '</div>' +
      '<h3>How the value is worked out</h3>' +
      '<p class="note">Base ' + money(base) + ' (TVL × ' + D.model.base_multiple + ') × growth ×' + r.growth_multiplier +
      ' × maturity ×' + r.maturity_multiplier + ' = ' + money(r.implied_value_usd) + '. The growth multiplier follows the ' +
      'seven-day TVL change; the maturity multiplier follows how long the protocol has run with no token recorded.</p>' +
      '<h3>How to farm it</h3><ol>' + steps + '</ol>';
    box.hidden = false;
    document.body.classList.add('detail-open');
  }

  // ---- live view ------------------------------------------------------------
  $('live').innerHTML = D.live.map(function (p) {
    return '<div class="live-card"><b>' + esc(p.name) + '</b>' +
      '<span>' + esc(p.category || 'No category') + ' · ' + esc((p.chains || []).slice(0, 2).join(', ') || '—') + '</span><br>' +
      '<span class="mcap">' + money(p.mcap_usd) + ' market cap</span> · <span>' + money(p.tvl_usd) + ' TVL</span></div>';
  }).join('');

  // ---- wiring ---------------------------------------------------------------
  $('q').value = state.q;
  $('cat').value = state.cat;
  $('chain').value = state.chain;
  $('watch').checked = state.watch;
  $('sort').value = state.sort in SORTS ? state.sort : 'rank';

  function sync() { writeHash(); renderBoard(); renderDetail(); }
  $('q').addEventListener('input', function () { state.q = this.value; sync(); });
  $('cat').addEventListener('change', function () { state.cat = this.value; sync(); });
  $('chain').addEventListener('change', function () { state.chain = this.value; sync(); });
  $('watch').addEventListener('change', function () { state.watch = this.checked; sync(); });
  $('sort').addEventListener('change', function () { state.sort = this.value; sync(); });

  var lastSortKey = 'rank', lastDir = 1;
  document.querySelectorAll('#board th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var key = th.getAttribute('data-sort');
      if (key === 'name' || key === 'category') { state.sort = key; }
      else if (lastSortKey === key) { lastDir = -lastDir; }
      else { lastSortKey = key; lastDir = 1; state.sort = key; }
      if (lastDir < 0 && SORTS[key]) {
        var base = SORTS[key];
        SORTS[key + '_rev'] = function (a, b) { return base(b, a); };
        state.sort = key + '_rev';
      }
      $('sort').value = state.sort in SORTS && ['rank', 'value', 'tvl', 'growth', 'age'].indexOf(state.sort) >= 0 ? state.sort : 'rank';
      sync();
    });
  });

  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (!tr) return;
    var slug = tr.getAttribute('data-slug');
    state.detail = state.detail === slug ? null : slug;
    sync();
  });

  $('detail').addEventListener('click', function (e) {
    if (e.target.closest('[data-close]')) { state.detail = null; sync(); }
  });

  renderBoard();
  renderDetail();
})();
