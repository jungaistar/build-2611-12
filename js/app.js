/* app.js — 화면. 판정·계산은 하지 않는다(전부 js/costidx.js). 여기서는 입력을 모으고 결과를 그린다. */
(function () {
  'use strict';
  var E = window.CostIdx;
  var $ = function (id) { return document.getElementById(id); };
  var state = { items: [], draws: [], book: null, sheet: '', map: null, aoa: null, series: [], issues: [], res: null, ai: {}, seq: 0 };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(v, d) { if (v == null || !isFinite(v)) return '—'; return Number(v).toLocaleString('ko-KR', { maximumFractionDigits: d == null ? 0 : d }); }
  function won(v) { return v == null || !isFinite(v) ? '—' : fmt(Math.round(v)) + '원'; }
  function sgnWon(v) { return v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(Math.round(v))) + '원'; }
  function pct(v) { return v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2) + '%'; }
  function badge(src) { return src ? '<span class="src s-' + src + '">' + E.SRC_LABEL[src] + '</span>' : ''; }
  function numOrNull(v) { v = String(v == null ? '' : v).replace(/,/g, '').trim(); if (v === '') return null; var n = parseFloat(v); return isFinite(n) ? n : null; }
  function show(id, on) { $(id).hidden = !on; }
  function period() { return { start: $('p-start').value, end: $('p-end').value }; }

  /* ───────────── 도면 PDF ───────────── */
  // pdf.js 는 모듈이라 필요할 때만 불러온다. 파일을 더블클릭해 열면(file://) 브라우저가 막는다.
  var pdfjsP = null;
  function readPdfText(f) {
    if (!pdfjsP) pdfjsP = import(new URL('lib/pdf.min.mjs', document.baseURI).href).then(function (m) {
      m.GlobalWorkerOptions.workerSrc = new URL('lib/pdf.worker.min.mjs', document.baseURI).href; return m;
    });
    return Promise.all([pdfjsP, f.arrayBuffer()]).then(function (r) {
      return r[0].getDocument({ data: r[1], cMapUrl: new URL('lib/cmaps/', document.baseURI).href, cMapPacked: true }).promise.then(function (doc) {
        var jobs = [];
        for (var p = 1; p <= doc.numPages; p++) jobs.push(doc.getPage(p).then(function (pg) { return pg.getTextContent(); }));
        return Promise.all(jobs).then(function (pages) {
          doc.destroy();
          return pages.map(function (tc) { return E.pdfLines(tc.items).join('\n'); }).join('\n');
        });
      });
    }, function (e) { throw new Error('PDF 읽기 모듈을 불러오지 못했습니다. 웹 주소(https://…)로 열었는지 확인하세요(' + e.message + ')'); });
  }
  function readPdfs(files) {
    files = Array.prototype.filter.call(files, function (f) { return /\.pdf$/i.test(f.name); });
    if (!files.length) { $('draw-status').innerHTML = '<div class="warn">PDF 파일만 올릴 수 있습니다.</div>'; return; }
    $('draw-status').innerHTML = '<div class="note">도면 ' + files.length + '개를 읽는 중…</div>';
    var jobs = files.map(function (f) {
      return readPdfText(f).then(function (text) { return E.extractDrawing(text, f.name); }, function (e) { return { file: f.name, empty: true, fields: E.extractDrawing('', f.name).fields, notes: ['읽지 못했습니다 — ' + e.message] }; });
    });
    Promise.all(jobs).then(function (exs) {
      exs.forEach(function (ex) { state.draws.push(ex); state.items.push(E.itemFromDrawing(ex, 'i' + (++state.seq))); });
      $('draw-status').innerHTML = '<div class="ok">도면 ' + exs.length + '개를 읽었습니다. 아래 보조 추출 결과를 확인하고 품목에서 고치세요.</div>';
      renderDraws(); renderItems(); update();
    });
  }
  var FIELD_NAME = { name: '제품명', dwg: '도면번호', material: '재질', weight: '중량', qty: '수량', finished: '완성 치수', stock: '소재 규격' };
  function renderDraws() {
    $('draws').innerHTML = state.draws.map(function (ex) {
      var rows = Object.keys(FIELD_NAME).map(function (k) {
        var c = ex.fields[k] || [];
        if (!c.length) return '<tr><th>' + FIELD_NAME[k] + '</th><td class="sub">찾지 못함</td><td></td></tr>';
        return c.map(function (x, j) {
          var v = k === 'weight' ? fmt(x.value, 3) + ' kg' + (x.unit ? ' (' + x.unit + ')' : '') : (x.dims ? E.dimsText(x.dims) + ' · ' + E.SHAPE_LABEL[x.dims.shape] : x.value);
          if (k === 'material') v += x.norm.family ? ' → ' + x.norm.label : ' → 계열 모름';
          return '<tr><th>' + (j ? '' : FIELD_NAME[k]) + '</th><td>' + esc(v) + (j ? ' <span class="sub">(후보 ' + (j + 1) + ')</span>' : '') + '</td><td class="srcline">' + x.line + '째 줄: ' + esc(x.text) + '</td></tr>';
        }).join('');
      }).join('');
      return '<div class="draw"><div class="draw-head"><b>' + esc(ex.file) + '</b> <span class="src s-doc">보조 추출</span></div>' +
        (ex.empty ? '' : '<div class="tablewrap"><table class="ext">' + rows + '</table></div>') +
        ex.notes.map(function (n) { return '<div class="' + (ex.empty ? 'warn' : 'note') + '">' + esc(n) + '</div>'; }).join('') + '</div>';
    }).join('');
  }

  /* ───────────── 품목 편집 ───────────── */
  var FAM_OPTS = function (cur, auto) {
    return '<option value="">' + (auto ? '자동: ' + esc(auto) : '자동(모름)') + '</option>' + Object.keys(E.FAM).map(function (k) { return '<option value="' + k + '"' + (cur === k ? ' selected' : '') + '>' + E.FAM[k].label + '</option>'; }).join('');
  };
  function srcOf(obj, k) { var v = k.indexOf('.') > 0 ? obj.comp[k.split('.')[1]] : obj[k]; return v == null || v === '' ? '' : ((obj.src || {})[k] || 'input'); }
  function inp(k, v, attrs, ph) { return '<input data-k="' + k + '" value="' + esc(v == null ? '' : v) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + (attrs || '') + '>'; }
  function renderItems() {
    show('s-items', state.items.length > 0);
    $('items').innerHTML = state.items.map(function (it, i) {
      var cm = it.compMode === 'amount';
      var lines = it.lines.map(function (L, l) {
        var auto = E.normMaterial(L.material);
        var as = function (k, def) { var v = L[k]; return v == null || v === '' ? (def ? badge('assume') : '') : badge((L.src || {})[k] || 'input'); };
        return '<tr data-l="' + l + '">' +
          '<td><div class="cell">' + inp('material', L.material, ' class="w-mat"', '예: SCM440') + as('material') + '</div></td>' +
          '<td><select data-k="family">' + FAM_OPTS(L.family, auto.label) + '</select></td>' +
          '<td><div class="cell">' + inp('finishedKg', L.finishedKg, ' inputmode="decimal" class="w-n"') + as('finishedKg') + '</div></td>' +
          '<td><div class="cell">' + inp('finishedDims', L.finishedDims, ' class="w-dim"', 'Ø45 x 210') + as('finishedDims') + '</div></td>' +
          '<td><div class="cell">' + inp('stockDims', L.stockDims, ' class="w-dim"', 'Ø50 x 215') + as('stockDims') + '</div></td>' +
          '<td><div class="cell">' + inp('cutMm', L.cutMm, ' inputmode="decimal" class="w-s"', String(E.DEF.cutMm)) + as('cutMm', 1) + '</div></td>' +
          '<td><div class="cell">' + inp('yield', L.yield, ' inputmode="decimal" class="w-s"', L.stockDims ? '규격으로 계산' : String(E.DEF.yield)) + as('yield', !L.stockDims) + '</div></td>' +
          '<td><div class="cell">' + inp('recovery', L.recovery, ' inputmode="decimal" class="w-s"', String(E.DEF.recovery)) + as('recovery', 1) + '</div></td>' +
          '<td><div class="cell">' + inp('unitPrice', L.unitPrice, ' inputmode="decimal" class="w-n"', '선택') + as('unitPrice') + '</div></td>' +
          '<td class="calc" id="calc-' + i + '-' + l + '"></td>' +
          '<td>' + (it.lines.length > 1 ? '<button class="x" data-act="del-line">빼기</button>' : '') + '</td></tr>';
      }).join('');
      return '<div class="item" data-i="' + i + '">' +
        '<div class="item-head"><b>품목 ' + (i + 1) + '</b>' + (it.file ? ' <span class="sub">' + esc(it.file) + '</span>' : '') + ' <button class="x" data-act="del-item">품목 빼기</button></div>' +
        '<div class="form">' +
        '<label>제품명 ' + badge(srcOf(it, 'name')) + inp('name', it.name) + '</label>' +
        '<label>도면번호 ' + badge(srcOf(it, 'dwg')) + inp('dwg', it.dwg) + '</label>' +
        '<label>도면 수량(참고) ' + badge(srcOf(it, 'qty')) + inp('qty', it.qty, ' inputmode="numeric"') + '</label>' +
        '<label>기준 단가(원/EA) ' + badge(srcOf(it, 'price0')) + inp('price0', it.price0, ' inputmode="decimal"', '필수') + '</label>' +
        '<label>요청·현재 단가(원, 선택) ' + badge(srcOf(it, 'priceNew')) + inp('priceNew', it.priceNew, ' inputmode="decimal"', '단가 인상 요청 검토 시') + '</label>' +
        '</div>' +
        '<div class="form comp">' +
        '<label>원가 구성 입력 방식 <select data-k="compMode"><option value="ratio"' + (cm ? '' : ' selected') + '>기준 단가 대비 비율(%)</option><option value="amount"' + (cm ? ' selected' : '') + '>금액(원)</option></select></label>' +
        ['material', 'process', 'labor', 'overhead'].map(function (k) {
          var lab = { material: '소재비', process: '가공비', labor: '인건비', overhead: '제조경비' }[k];
          return '<label>' + lab + (cm ? '(원)' : '(%)') + ' ' + badge(srcOf(it, 'comp.' + k)) + inp('comp.' + k, it.comp[k], ' inputmode="decimal"', k === 'material' ? '비우면 중량 × 소재 단가' : '선택') + '</label>';
        }).join('') + '</div>' +
        '<div class="tablewrap"><table class="lines"><thead><tr><th>재질</th><th>재질 계열</th><th>완성 중량(kg)</th><th>완성 치수</th><th>소재 규격(가공 전)</th><th>절단 여유(mm)</th><th>수율</th><th>스크랩 회수율</th><th>소재 단가(원/kg)</th><th>계산</th><th></th></tr></thead><tbody>' + lines + '</tbody></table></div>' +
        '<div class="btnrow tight2"><button class="btn sm" data-act="add-line">소재 줄 추가(소재가 여럿일 때)</button></div></div>';
    }).join('');
  }
  var NUMK = { finishedKg: 1, cutMm: 1, yield: 1, recovery: 1, unitPrice: 1, price0: 1, priceNew: 1, qty: 1, 'comp.material': 1, 'comp.process': 1, 'comp.labor': 1, 'comp.overhead': 1 };
  $('items').addEventListener('change', function (e) {
    var el = e.target, k = el.getAttribute('data-k'); if (!k) return;
    var box = el.closest('.item'), it = state.items[+box.getAttribute('data-i')];
    var tr = el.closest('tr[data-l]');
    var v = NUMK[k] ? numOrNull(el.value) : el.value.trim();
    if (tr) { var L = it.lines[+tr.getAttribute('data-l')]; L[k] = v == null ? (NUMK[k] ? null : '') : v; L.src = L.src || {}; L.src[k] = 'input'; if (k === 'material') { var sel = tr.querySelector('select[data-k=family]'); sel.innerHTML = FAM_OPTS(L.family, E.normMaterial(L.material).label); } }
    else if (k === 'compMode') { it.compMode = v; renderItems(); }
    else if (k.indexOf('comp.') === 0) { it.comp[k.slice(5)] = v; it.src['comp.' + k.slice(5)] = 'input'; }
    else { it[k] = v; it.src[k] = 'input'; }
    var b = el.parentNode.querySelector('.src');
    if (b && k !== 'family') { var nb = document.createElement('span'); nb.innerHTML = v == null || v === '' ? (/^(cutMm|yield|recovery)$/.test(k) ? badge('assume') : '') : badge('input'); if (nb.firstChild) b.replaceWith(nb.firstChild); else b.remove(); }
    else if (!b && v != null && v !== '' && k !== 'family' && k !== 'compMode') { var s = document.createElement('span'); s.innerHTML = badge('input'); el.parentNode.insertBefore(s.firstChild, el.parentNode.tagName === 'LABEL' ? el : el.nextSibling); }
    update();
  });
  $('items').addEventListener('click', function (e) {
    var act = e.target.getAttribute('data-act'); if (!act) return;
    var i = +e.target.closest('.item').getAttribute('data-i'), it = state.items[i];
    if (act === 'del-item') state.items.splice(i, 1);
    if (act === 'add-line') it.lines.push(E.blankLine());
    if (act === 'del-line') it.lines.splice(+e.target.closest('tr').getAttribute('data-l'), 1);
    renderItems(); update();
  });
  function renderCalc() {
    if (!state.res || !state.res.ok) return;
    state.res.items.forEach(function (r, i) {
      r.lines.forEach(function (L, l) {
        var td = $('calc-' + i + '-' + l); if (!td) return;
        var p = [];
        p.push('계열 ' + (L.famLabel ? esc(L.famLabel) : '<span class="bad">모름</span>') + (L.family ? ' · 비중 ' + L.density : ''));
        p.push('완성 ' + (L.finished.kg != null ? fmt(L.finished.kg, 3) + 'kg ' + badge(L.finished.src) : '<span class="bad">없음</span>'));
        if (L.input.kg != null) p.push('투입 ' + fmt(L.input.kg, 3) + 'kg ' + badge('calc') + ' · 유효 ' + fmt(L.effKg, 3) + 'kg');
        if (L.input.kg != null) p.push('수율 ' + fmt(L.yield.v, 3) + ' ' + badge(L.yield.src));
        p.push('소재 원가 ' + (L.base != null ? won(L.base) + ' ' + badge(L.baseSrc) : '<span class="bad">정할 수 없음</span>'));
        td.innerHTML = p.join('<br>');
      });
    });
  }

  /* ───────────── Index 엑셀 ───────────── */
  function readBook(f) {
    return f.arrayBuffer().then(function (ab) {
      var wb;
      if (/\.csv$/i.test(f.name)) {
        var text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(ab); } catch (e) { text = new TextDecoder('euc-kr').decode(ab); }
        wb = XLSX.read(text, { type: 'string', raw: true });
      } else wb = XLSX.read(ab, { type: 'array' });
      var sheets = {};
      wb.SheetNames.forEach(function (n) { sheets[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }); });
      return { file: f.name, names: wb.SheetNames, sheets: sheets };
    });
  }
  function loadBook(book) {
    state.book = book;
    state.insp = E.inspectBook(book);   // 시트 전부 — 머리 블록 형식이든 단순 표든
    $('index-status').innerHTML = '';
    renderMap(); update();
  }
  var ROLE_OPTS = function (c) {
    return '<option value="index"' + (c.role === 'index' ? ' selected' : '') + '>Index 로 사용</option><option value="ref"' + (c.role === 'ref' ? ' selected' : '') + '>참고 계열' + (c.inhouse ? '(사내 구매가)' : '(매칭 비교만)') + '</option><option value="skip"' + (c.role === 'skip' ? ' selected' : '') + '>쓰지 않음</option>';
  };
  var KIND = { material: '재료 가격', fx: '환율 — 원화 환산용', macro: '경기·운임 지표' };
  function renderMap() {
    if (!state.insp) { $('map').innerHTML = ''; return; }
    var body = state.insp.sheets.map(function (sh, si) {
      if (!sh.ok) return '<tr class="sheethead"><td colspan="6">시트 「' + esc(sh.sheet) + '」 — 읽지 않음: ' + esc(sh.error) + '</td></tr>';
      var info = sh.kind === 'block'
        ? '머리 블록 형식 · ' + KIND[sh.sheetKind] + ' · ' + esc(sh.firstMonth) + ' ~ ' + esc(sh.lastMonth) + (sh.newestFirst ? '(최신이 위 → 오래된 순으로 정렬)' : '') + ' · 값 열 ' + sh.columns.length + '개 · 증감률 열 ' + sh.skipped.rate + '개' + (sh.skipped.quarter ? ' · 분기 열' : '') + ' 건너뜀'
        : '단순 표 · 날짜 열 <select data-date="' + si + '" aria-label="날짜 열">' + sh.columns.map(function (c) { return '<option value="' + c.col + '"' + (c.col === sh.dateCol ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select>';
      var rows = sh.columns.filter(function (c) { return sh.kind === 'block' || c.col !== sh.dateCol; }).map(function (c) {
        var ev = [c.source, c.detail].filter(Boolean).join(' · ');
        return '<tr data-s="' + si + '" data-c="' + c.col + '"><td class="mono">' + esc(c.letter || '') + '</td><td class="wrap">' + esc(c.name) + (c.inhouse ? ' <span class="src s-est">사내 구매가</span>' : '') + (c.grades && c.grades.length ? '<br><span class="sub">규격 재질 ' + esc(c.grades.join(', ')) + '</span>' : '') + '</td>' +
          '<td>' + esc(c.unit || '—') + '</td><td class="wrap ev">' + (ev ? esc(ev) : '<span class="sub">—</span>') + (c.why ? '<br><span class="sub">' + esc(c.why) + '</span>' : '') + '</td>' +
          '<td><select data-r="role">' + ROLE_OPTS(c) + '</select></td>' +
          '<td><select data-r="family"><option value="">계열 모름</option>' + Object.keys(E.FAM).map(function (k) { return '<option value="' + k + '"' + (c.family === k ? ' selected' : '') + '>' + E.FAM[k].label + '</option>'; }).join('') + '</select></td></tr>';
      }).join('');
      return '<tr class="sheethead"><td colspan="6"><b>시트 「' + esc(sh.sheet) + '」</b> <span class="sub">' + info + '</span></td></tr>' + rows;
    }).join('');
    $('map').innerHTML = '<table><thead><tr><th>열</th><th>Index 이름(품목 · 규격 · 기준 · 지역 · 단위)</th><th>단위</th><th>출처 · 상세출처</th><th>역할</th><th>재질 계열</th></tr></thead><tbody>' + body + '</tbody></table>';
  }
  $('map').addEventListener('change', function (e) {
    var t = e.target;
    if (t.hasAttribute('data-date')) {
      var sh = state.insp.sheets[+t.getAttribute('data-date')], v = +t.value;
      sh.columns.forEach(function (c) { if (c.col === sh.dateCol) c.role = 'skip'; if (c.col === v) c.role = 'date'; });
      sh.dateCol = v; renderMap(); update(); return;
    }
    var tr = t.closest('tr'), k = t.getAttribute('data-r'); if (!k) return;
    var s = state.insp.sheets[+tr.getAttribute('data-s')], col = +tr.getAttribute('data-c');
    s.columns.forEach(function (c) { if (c.col === col) c[k] = t.value; });
    update();
  });
  ['p-start', 'p-end', 'tol', 'fx'].forEach(function (id) { $(id).addEventListener('change', update); });
  function buildIndex() {
    if (!state.insp) { state.series = []; state.issues = []; return; }
    var b = E.buildBook(state.book, state.insp, state.book.file);
    var hasFx = b.series.some(function (s) { return s.meta && s.meta.kind === 'fx'; });
    $('fx').disabled = !hasFx; if (!hasFx) $('fx').checked = false;
    var fxNotes = [];
    if ($('fx').checked) { var fc = E.fxConvert(b.series); b.series = fc.series; fxNotes = fc.notes; }
    state.series = b.series; state.issues = b.issues;
    var idx = b.series.filter(function (s) { return s.role === 'index'; }), ref = b.series.filter(function (s) { return s.role === 'ref'; });
    var units = {}; idx.forEach(function (s) { var u = (s.meta && s.meta.unit) || '(단위 없음)'; units[u] = (units[u] || 0) + 1; });
    var first = null, last = null;
    idx.forEach(function (s) { s.points.forEach(function (p) { if (!first || p.m < first) first = p.m; if (!last || p.m > last) last = p.m; }); });
    var sheetsOk = state.insp.sheets.filter(function (s) { return s.ok; }).length;
    $('index-status').innerHTML = '<div class="stats"><div class="stat"><b>' + sheetsOk + ' / ' + state.insp.sheets.length + '</b>읽은 시트</div><div class="stat"><b>' + idx.length + '</b>Index 열</div><div class="stat"><b>' + ref.length + '</b>참고 계열</div><div class="stat"><b>' + esc(first || '—') + ' ~ ' + esc(last || '—') + '</b>Index 데이터 기간(월)</div><div class="stat"><b>' + b.issues.length + '</b>읽기 알림</div></div>' +
      '<p class="sub" style="margin-top:8px">단위별 Index 수: ' + Object.keys(units).map(function (u) { return esc(u) + ' ' + units[u]; }).join(' · ') + ' — 단위가 다른 Index 는 결과 표에서 따로 묶습니다.</p>' +
      (fxNotes.length ? '<div class="note">원화 환산: ' + fxNotes.map(esc).join('<br>') + '</div>' : '') +
      (b.issues.length ? '<details class="issues"><summary>엑셀 읽기 알림 ' + b.issues.length + '건 — 빈 칸·날짜 오류·월평균</summary><ul>' + b.issues.map(function (i) { return '<li>' + esc(i.msg) + '</li>'; }).join('') + '</ul></details>' : '');
  }

  /* ───────────── 분석 · 그리기 ───────────── */
  function update() {
    buildIndex();
    var has = state.items.length > 0;
    show('s-items', has); show('s-index', has || !!state.book);
    var res = has ? E.analyze({ items: state.items, index: { series: state.series, issues: state.issues, source: state.book ? state.book.file : '' }, period: period(), tolPct: numOrNull($('tol').value) }) : null;
    state.res = res;
    var ready = !!(res && res.ok);
    show('s-match', ready); show('s-result', ready); show('s-out', ready);
    $('index-err').innerHTML = has && res && !res.ok ? '<div class="warn">' + res.errors.map(esc).join('<br>') + '</div>' : '';
    if (!ready) return;
    renderCalc(); renderMatch(); renderResult();
  }

  var TAG = { grade: 't-ok', series: 't-ok', exact: 't-ok', manual: 't-warn', estimate: 't-warn', multi: 't-bad', none: 't-bad', unknown: 't-bad' };
  /** Index 근거 — 시트 · 열 · 단위 · 기준 · 지역 · 출처 · 상세출처 · 주소(값의 출처를 늘 보여 준다) */
  function evid(s, short) {
    if (!s) return '';
    var m = s.meta || {}, a = [];
    if (m.sheet) a.push('시트 「' + esc(m.sheet) + '」' + (m.letter ? ' ' + esc(m.letter) + '열' : ''));
    if (m.unit) a.push('단위 ' + esc(m.unit));
    if (!short && m.basis) a.push('기준 ' + esc(m.basis));
    if (!short && m.region) a.push('지역 ' + esc(m.region));
    if (m.source) a.push('출처 ' + esc(m.source));
    if (!short && m.detail) a.push('상세출처 ' + esc(m.detail));
    if (!short && m.url) a.push(/^https?:\/\//.test(m.url) ? '<a href="' + esc(m.url) + '" target="_blank" rel="noopener noreferrer">주소</a>' : '주소 ' + esc(m.url));
    if (s.converted) a.push('<span class="src s-calc">계산</span> 원화 환산(' + esc(m.origUnit) + ' × ' + esc(m.fx) + ')');
    return a.join(' · ') || esc(s.source || '');
  }
  function renderMatch() {
    var res = state.res, idxNames = state.series.filter(function (s) { return s.role === 'index'; }).map(function (s) { return s.name; });
    var refNames = state.series.filter(function (s) { return s.role === 'ref'; }).map(function (s) { return s.name; });
    var html = '';
    res.items.forEach(function (r, i) {
      r.lines.forEach(function (L, l) {
        var M = L.match, key = i + '-' + l, line = state.items[i].lines[l];
        var head = '<div class="mhead"><b>' + esc(r.name || '품목 ' + (i + 1)) + '</b> <span class="sub">' + esc(r.dwg || '') + '</span> · ' + esc(L.material || '재질 미입력') + ' → ' + (L.famLabel ? esc(L.famLabel) : '<span class="bad">계열 모름</span>') +
          ' <span class="tag ' + TAG[M.status] + '">' + esc(E.matchLabel(M)) + (M.status === 'estimate' ? ' — 담당자 확인' : '') + '</span> <span class="conf">신뢰도 ' + esc(M.confidence) + '</span></div>';
        var body = '<p>적용 Index: <b>' + (M.chosen && M.status !== 'multi' ? esc(M.chosen) : '없음') + '</b> — ' + esc(M.reason) + '</p>';
        var cs = M.status === 'multi' ? null : state.series.filter(function (x) { return x.name === M.chosen; })[0];
        if (cs) body += '<p class="evid">근거: ' + evid(cs) + '</p>';
        if (M.refHint && M.refHint.length) body += '<div class="note">참고 계열(사내 구매가) 「' + M.refHint.map(esc).join('」 「') + '」 에 같은 재질이 있습니다. Index 로는 쓰지 않고, 아래 「움직임 비교 기준」으로 비교할 수 있습니다.</div>';
        if (M.basis) body += '<p class="sub">비교한 것: ' + esc(M.basis) + '</p>';
        if (M.candidates.length && !/^(exact|grade|series)$/.test(M.status)) {
          body += '<div class="tablewrap"><table class="cands"><thead><tr><th>고르기</th><th>후보 Index</th><th>재질 유사도</th><th>근거</th><th>가격 움직임 상관</th><th>방향 일치</th><th>비교한 달</th><th>기간 변동률</th><th>점수</th><th>단위 · 출처</th></tr></thead><tbody>' +
            M.candidates.map(function (c, j) {
              return '<tr' + (c.name === M.chosen ? ' class="sel"' : '') + '><td><input type="radio" name="pick-' + key + '" data-pick="' + key + '" value="' + esc(c.name) + '"' + (c.name === M.chosen ? ' checked' : '') + ' aria-label="' + esc(c.name) + ' 고르기"></td><td>' + (j + 1) + '. ' + esc(c.name) + '</td><td class="num">' + (c.matSim != null ? c.matSim.toFixed(2) : '—') + '</td><td class="wrap">' + esc(c.why || '') + '</td>' +
                '<td class="num">' + (c.corr != null ? c.corr.toFixed(3) : '—') + '</td><td class="num">' + (c.dirAgree != null ? Math.round(c.dirAgree * 100) + '%' : '—') + '</td><td class="num">' + (c.n || '—') + '</td><td class="num">' + pct(c.rate) + '</td><td class="num">' + (c.score != null ? c.score.toFixed(3) : '—') + '</td><td class="wrap ev">' + evid(state.series.filter(function (x) { return x.name === c.name; })[0], 1) + '</td></tr>';
            }).join('') + '</tbody></table></div>';
        }
        if (M.status === 'estimate' || M.status === 'manual') body += '<div class="warn">유사 Index 는 실제 원소재 가격이 아니라 가격 변동을 추정하기 위한 대체 지표입니다. 결과를 확정하기 전에 담당자가 확인하세요.</div>';
        M.notes.forEach(function (n) { body += '<div class="note">' + esc(n) + '</div>'; });
        body += '<div class="form mctl"><label>Index 직접 고르기 <select data-pick="' + key + '"><option value="">자동</option>' + idxNames.map(function (n) { return '<option' + (line.indexPick === n ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '</select></label>' +
          (!/^(exact|grade|series)$/.test(M.status) && L.family || (M.refHint && M.refHint.length) ? '<label>움직임 비교 기준 <select data-ref="' + key + '"><option value="">후보끼리 비교(자동)</option>' + refNames.map(function (n) { return '<option' + (line.refName === n ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '</select></label>' : '') + '</div>';
        if (M.candidates.length > 1) body += '<div class="chart cand" id="cand-' + key + '">' + candChart(M, line.refName) + '</div>';
        if (!/^(exact|grade|series)$/.test(M.status)) body += '<div class="btnrow tight2"><button class="btn sm" data-ai="' + key + '">AI 의견(선택)</button></div>' + (state.ai[key] ? '<div class="aibox"><b>AI 초안 — 검토 필요</b> <span class="sub">계산에는 쓰지 않습니다</span><p>' + esc(state.ai[key]) + '</p></div>' : '');
        html += '<div class="mcard st-' + M.status + '">' + head + body + '</div>';
      });
    });
    $('match').innerHTML = html;
  }
  $('match').addEventListener('change', function (e) {
    var k = e.target.getAttribute('data-pick') || e.target.getAttribute('data-ref'); if (!k) return;
    var p = k.split('-'), line = state.items[+p[0]].lines[+p[1]];
    if (e.target.hasAttribute('data-pick')) line.indexPick = e.target.value; else line.refName = e.target.value;
    update();
  });
  $('match').addEventListener('click', function (e) { var k = e.target.getAttribute('data-ai'); if (k) callAI(k, e.target); });

  function renderResult() {
    var res = state.res, S = res.summary;
    $('summary').innerHTML = '<div class="stats">' +
      '<div class="stat"><b>' + esc(res.period.start) + ' ~ ' + esc(res.period.end) + '</b>분석 기간</div>' +
      '<div class="stat"><b>' + S.done + ' / ' + S.count + '</b>영향 계산 완료 품목</div>' +
      '<div class="stat"><b>' + S.estimated + '</b>유사 Index(추정) 적용 품목</div>' +
      '<div class="stat"><b>' + sgnWon(S.dM) + '</b>원소재 영향 합(1 EA 씩)</div>' +
      '<div class="stat"><b>' + res.review.length + '</b>추가 검토 항목</div></div>';
    var units = [];
    res.indexes.forEach(function (x) { var u = (x.meta && x.meta.unit) || '(단위 없음)'; if (units.indexOf(u) < 0) units.push(u); });
    var mk = function (want, got) { return esc(got.m) + (got.kind !== 'exact' ? ' <span class="src s-est">' + esc(want) + ' 없음 → 가까운 ' + (got.kind === 'prev' ? '이전' : '다음') + ' 값</span>' : ''); };
    // 단위가 다른 Index 를 한 표에 섞지 않는다
    $('price').innerHTML = units.map(function (u) {
      return '<div class="unitgrp"><div class="unithead">단위 <b>' + esc(u) + '</b></div><div class="tablewrap"><table><thead><tr><th>Index</th><th>시작 · 사용 월</th><th>시작 값</th><th>종료 · 사용 월</th><th>종료 값</th><th>변동액</th><th>변동률</th><th>기간 최고</th><th>기간 최저</th><th>오른 달 · 내린 달</th><th>근거</th></tr></thead><tbody>' +
        res.indexes.filter(function (x) { return ((x.meta && x.meta.unit) || '(단위 없음)') === u; }).map(function (x) {
          var s = x.stats, sv = state.series.filter(function (q) { return q.name === x.name; })[0];
          return '<tr><td class="wrap">' + esc(x.name) + '</td><td>' + mk(res.period.start, s.start) + '</td><td class="num">' + fmt(s.start.v, 2) + '</td><td>' + mk(res.period.end, s.end) + '</td><td class="num">' + fmt(s.end.v, 2) + '</td><td class="num">' + (s.diff > 0 ? '+' : '') + fmt(s.diff, 2) + '</td><td class="num ' + (s.rate > 0 ? 'up' : 'down') + '">' + pct(s.rate) + '</td><td>' + esc(s.max.m) + ' · ' + fmt(s.max.v, 2) + '</td><td>' + esc(s.min.m) + ' · ' + fmt(s.min.v, 2) + '</td><td class="num">' + s.up + ' · ' + s.down + '</td><td class="wrap ev">' + evid(sv) + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';
    }).join('');
    $('trend').innerHTML = res.indexes.map(function (x) {
      var s = state.series.filter(function (q) { return q.name === x.name; })[0];
      return '<div><h3>' + esc(x.name) + ' <small class="sub">기간 ' + pct(x.stats.rate) + '</small></h3>' + trendChart(s, res.period, x.stats) + '</div>';
    }).join('');
    $('impact').innerHTML = '<table><thead><tr><th>제품</th><th>기준 단가</th><th>소재 원가</th><th>소재 비중</th><th>적용 Index · 변동률</th><th>원가 증감액</th><th>단가 대비 영향률</th><th>예상 단가</th><th>가공비</th><th>인건비</th><th>경비</th><th>그 밖(이윤 등)</th><th>요청·현재 단가</th><th>판정</th><th>신뢰도</th></tr></thead><tbody>' +
      res.items.map(function (r) {
        var o = r.others || {}, v = r.verify;
        var idx = r.lines.map(function (L) { return esc(L.match.status === 'multi' ? '선택 필요' : (L.match.chosen || '없음')) + ' ' + (L.stats && L.stats.ok ? pct(L.stats.rate) : '') + (L.match.status === 'estimate' || L.match.status === 'manual' ? ' <span class="src s-est">추정</span>' : ''); }).join('<br>');
        return '<tr' + (r.review.length ? ' class="flag"' : '') + '><td>' + esc(r.name) + '<br><span class="sub">' + esc(r.dwg || '') + '</span></td><td class="num">' + won(r.price0) + '</td><td class="num">' + won(r.M0) + ' ' + badge(r.M0src) + '</td><td class="num">' + (r.share != null ? r.share.toFixed(1) + '%' : '—') + '</td><td>' + idx + '</td>' +
          '<td class="num ' + (r.dM > 0 ? 'up' : r.dM < 0 ? 'down' : '') + '"><b>' + sgnWon(r.dM) + '</b> ' + (r.dM != null ? badge('calc') : '') + '</td><td class="num">' + pct(r.rateOnPrice) + '</td><td class="num">' + won(r.expected) + '</td>' +
          '<td class="num">' + won(o.process) + '</td><td class="num">' + won(o.labor) + '</td><td class="num">' + won(o.overhead) + '</td><td class="num">' + won(o.rest) + '</td>' +
          '<td class="num">' + (r.priceNew != null ? won(r.priceNew) + '<br><span class="sub">' + sgnWon(v.actual) + ' (' + pct(v.actualRate) + ')</span>' : '—') + '</td>' +
          '<td class="rev v-' + (v ? v.verdict : 'none') + '">' + (v ? esc(v.text) : '<span class="sub">요청·현재 단가를 넣으면 비교합니다</span>') + '</td><td>' + esc(r.confidence) + '</td></tr>';
      }).join('') + '</tbody></table>';
    $('waterfall').innerHTML = res.items.map(function (r) { return '<div><h3>' + esc(r.name) + ' <small class="sub">' + esc(r.dwg || '') + '</small></h3>' + waterfall(r) + '</div>'; }).join('');
    $('review').innerHTML = res.review.length ? '<ul class="revlist">' + res.review.map(function (v) { return '<li><b>' + esc(v.item) + '</b> — ' + esc(v.text) + '</li>'; }).join('') + '</ul>' : '<div class="ok">추가로 검토할 항목이 없습니다.</div>';
  }

  /* ───────────── SVG 그래프 ───────────── */
  function ticks(lo, hi, n) {
    var span = hi - lo || Math.abs(hi) || 1, step = Math.pow(10, Math.floor(Math.log10(span / n))), err = span / n / step;
    step *= err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
    var out = []; for (var k = Math.ceil(lo / step); k * step <= hi + 1e-9; k++) out.push(Math.round(k * step * 1e6) / 1e6); return out;
  }
  function short(v) { var a = Math.abs(v); return a >= 1e6 ? (v / 1e6).toFixed(a >= 1e7 ? 0 : 2).replace(/\.?0+$/, '') + 'M' : a >= 1e4 ? (v / 1e3).toFixed(0) + 'k' : fmt(v); }
  function trendChart(s, P, st) {
    var W = 560, H = 250, ml = 56, mr = 14, mt = 22, mb = 34;
    var pts = s.points; if (!pts.length) return '';
    var x0 = E.mIdx(pts[0].m), x1 = E.mIdx(pts[pts.length - 1].m);
    var vs = pts.map(function (p) { return p.v; }), lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs), pad = (hi - lo) * 0.08 || 1;
    lo -= pad; hi += pad;
    var X = function (m) { return ml + (E.mIdx(m) - x0) / Math.max(1, x1 - x0) * (W - ml - mr); };
    var Y = function (v) { return mt + (hi - v) / (hi - lo) * (H - mt - mb); };
    var g = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(s.name) + ' 월별 추이">';
    var a = Math.max(E.mIdx(P.start), x0), b = Math.min(E.mIdx(P.end), x1);
    if (b >= a) g += '<rect class="period" x="' + X(E.mStr(a)).toFixed(1) + '" y="' + mt + '" width="' + Math.max(1, X(E.mStr(b)) - X(E.mStr(a))).toFixed(1) + '" height="' + (H - mt - mb) + '"/>';
    ticks(lo, hi, 4).forEach(function (t) { var y = Y(t).toFixed(1); g += '<line class="grid" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y + '" y2="' + y + '"/><text class="ax" x="' + (ml - 6) + '" y="' + (+y + 4) + '" text-anchor="end">' + short(t) + '</text>'; });
    for (var k = x0; k <= x1; k++) if (k % 12 === 0) { var xx = X(E.mStr(k)).toFixed(1); g += '<line class="axl" x1="' + xx + '" x2="' + xx + '" y1="' + (H - mb) + '" y2="' + (H - mb + 4) + '"/><text class="ax" x="' + xx + '" y="' + (H - mb + 17) + '" text-anchor="middle">' + Math.floor(k / 12) + '</text>'; }
    var seg = [], segs = [];
    pts.forEach(function (p, i) { if (i && E.mIdx(p.m) - E.mIdx(pts[i - 1].m) > 1) { segs.push(seg); seg = []; } seg.push(X(p.m).toFixed(1) + ',' + Y(p.v).toFixed(1)); });
    segs.push(seg);
    segs.forEach(function (sg) { g += '<polyline class="l-idx" points="' + sg.join(' ') + '"/>'; });
    [['시작', st.start], ['종료', st.end]].forEach(function (q, j) {
      var cx = X(q[1].m), cy = Y(q[1].v);
      g += '<circle class="mark" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="5"/><text class="axt" x="' + (cx + (j ? -6 : 6)).toFixed(1) + '" y="' + (cy - 9).toFixed(1) + '" text-anchor="' + (j ? 'end' : 'start') + '">' + q[0] + ' ' + q[1].m + ' · ' + short(q[1].v) + '</text>';
    });
    g += '<text class="ax" x="' + (W - mr) + '" y="14" text-anchor="end">음영 = 분석 기간</text></svg>';
    return g;
  }
  var CC = ['#154b6e', '#d9822b', '#0a6045', '#8a3ab9'];
  function candChart(M, refName) {
    var P = state.res.period, W = 560, H = 220, ml = 44, mr = 14, mt = 16, mb = 30;
    var list = M.candidates.map(function (c) { return state.series.filter(function (s) { return s.name === c.name; })[0]; });
    if (refName) list.push(state.series.filter(function (s) { return s.name === refName; })[0]);
    var a = E.mIdx(P.start), b = E.mIdx(P.end), lines = [], lo = Infinity, hi = -Infinity;
    list.forEach(function (s) {
      if (!s) return; var base = E.valueAt(s, P.start); if (!base) return;
      var pts = s.points.filter(function (p) { var k = E.mIdx(p.m); return k >= a && k <= b; }).map(function (p) { var v = p.v / base.v * 100; lo = Math.min(lo, v); hi = Math.max(hi, v); return { m: p.m, v: v }; });
      lines.push({ name: s.name, pts: pts, ref: s.role === 'ref' });
    });
    if (!lines.length) return '';
    var pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
    var X = function (m) { return ml + (E.mIdx(m) - a) / Math.max(1, b - a) * (W - ml - mr); }, Y = function (v) { return mt + (hi - v) / (hi - lo) * (H - mt - mb); };
    var g = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="후보 Index 움직임 비교">';
    ticks(lo, hi, 4).forEach(function (t) { var y = Y(t).toFixed(1); g += '<line class="grid" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y + '" y2="' + y + '"/><text class="ax" x="' + (ml - 6) + '" y="' + (+y + 4) + '" text-anchor="end">' + t + '</text>'; });
    [a, b].forEach(function (k, j) { g += '<text class="ax" x="' + X(E.mStr(k)).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="' + (j ? 'end' : 'start') + '">' + E.mStr(k) + '</text>'; });
    lines.forEach(function (L, j) { g += '<polyline class="' + (L.ref ? 'l-ref' : '') + '" stroke="' + (L.ref ? '#5b6b7b' : CC[j % CC.length]) + '" points="' + L.pts.map(function (p) { return X(p.m).toFixed(1) + ',' + Y(p.v).toFixed(1); }).join(' ') + '"/>'; });
    g += '</svg><div class="legend">' + lines.map(function (L, j) { return '<span><i class="sw" style="background:' + (L.ref ? '#5b6b7b' : CC[j % CC.length]) + '"></i>' + esc(L.name) + (L.ref ? ' (참고 계열)' : '') + '</span>'; }).join('') + '<span class="sub">분석 시작월 = 100</span></div>';
    return g;
  }
  function waterfall(r) {
    if (r.price0 == null) return '<p class="sub">기준 단가가 없어 그리지 않습니다.</p>';
    var W = 560, H = 260, ml = 56, mr = 14, mt = 18, mb = 44;
    var o = r.others || {}, bars = [];
    var segs = [];
    if (r.M0 != null) {
      segs.push(['소재', r.M0, '#154b6e']);
      if (o.process != null) segs.push(['가공', o.process, '#6c8aa3']);
      if (o.labor != null) segs.push(['인건', o.labor, '#93a7bd']);
      if (o.overhead != null) segs.push(['경비', o.overhead, '#b9c7d5']);
      var restv = o.process == null && o.labor == null && o.overhead == null ? o.total : o.rest;
      if (restv != null && restv > 0.5) segs.push([o.process == null && o.labor == null && o.overhead == null ? '소재 외' : '그 밖', restv, '#dde4ea']);
    } else segs.push(['기준 단가', r.price0, '#93a7bd']);
    bars.push({ label: '기준 단가', stack: segs, total: r.price0 });
    if (r.dM != null) {
      bars.push({ label: '소재 영향', from: r.price0, to: r.price0 + r.dM, color: r.dM >= 0 ? '#c8341f' : '#0a6045', text: sgnWon(r.dM) });
      bars.push({ label: '예상 단가', stack: [['예상', r.expected, '#0b6e99']], total: r.expected });
      if (r.priceNew != null) {
        bars.push({ label: '설명 안 됨', from: r.expected, to: r.priceNew, color: '#d9822b', text: sgnWon(r.priceNew - r.expected) });
        bars.push({ label: '요청 단가', stack: [['요청', r.priceNew, '#5b6b7b']], total: r.priceNew });
      }
    }
    var top = Math.max.apply(null, bars.map(function (b) { return b.total != null ? b.total : Math.max(b.from, b.to); })) * 1.12;
    var Y = function (v) { return mt + (top - v) / top * (H - mt - mb); }, bw = (W - ml - mr) / bars.length;
    var g = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="단가 폭포형 그래프">';
    ticks(0, top, 4).forEach(function (t) { var y = Y(t).toFixed(1); g += '<line class="grid" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y + '" y2="' + y + '"/><text class="ax" x="' + (ml - 6) + '" y="' + (+y + 4) + '" text-anchor="end">' + short(t) + '</text>'; });
    bars.forEach(function (b, i) {
      var x = ml + i * bw + bw * 0.18, w = bw * 0.64, cx = x + w / 2;
      if (b.stack) {
        var acc = 0;
        b.stack.forEach(function (s) { var y1 = Y(acc + s[1]), y0 = Y(acc); g += '<rect class="wf" x="' + x.toFixed(1) + '" y="' + y1.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + Math.max(0.5, y0 - y1).toFixed(1) + '" fill="' + s[2] + '"><title>' + esc(s[0]) + ' ' + won(s[1]) + '</title></rect>'; if (b.stack.length > 1 && y0 - y1 > 13) g += '<text class="wl" fill="' + (/^#(b9|dd|93)/.test(s[2]) ? '#152232' : '#fff') + '" x="' + cx.toFixed(1) + '" y="' + ((y0 + y1) / 2 + 4).toFixed(1) + '" text-anchor="middle">' + esc(s[0]) + '</text>'; acc += s[1]; });
        g += '<text class="axt" x="' + cx.toFixed(1) + '" y="' + (Y(b.total) - 5).toFixed(1) + '" text-anchor="middle">' + won(b.total) + '</text>';
      } else {
        var ya = Y(Math.max(b.from, b.to)), yb = Y(Math.min(b.from, b.to));
        g += '<rect class="wf" x="' + x.toFixed(1) + '" y="' + ya.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + Math.max(1.5, yb - ya).toFixed(1) + '" fill="' + b.color + '"/>';
        g += '<line class="conn" x1="' + (x - bw * 0.36).toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + Y(b.from).toFixed(1) + '" y2="' + Y(b.from).toFixed(1) + '"/>';
        g += '<text class="axt" x="' + cx.toFixed(1) + '" y="' + (ya - 5).toFixed(1) + '" text-anchor="middle">' + b.text + '</text>';
      }
      g += '<text class="ax" x="' + cx.toFixed(1) + '" y="' + (H - mb + 16) + '" text-anchor="middle">' + b.label + '</text>';
    });
    g += '<line class="axl" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + Y(0) + '" y2="' + Y(0) + '"/></svg>';
    return g;
  }

  /* ───────────── 내보내기 · AI ───────────── */
  function exportXlsx() {
    var sh = E.exportSheets(state.res), wb = XLSX.utils.book_new();
    Object.keys(sh).forEach(function (n) { XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sh[n]), n); });
    XLSX.writeFile(wb, '원소재단가영향_' + state.res.period.start + '_' + state.res.period.end + '.xlsx');
  }
  function sampleXlsx() {
    var B = E.sampleBook(), wb = XLSX.utils.book_new();
    B.names.forEach(function (n) { var ws = XLSX.utils.aoa_to_sheet(B.sheets[n]); ws['!merges'] = B.merges[n]; XLSX.utils.book_append_sheet(wb, ws, n); });
    XLSX.writeFile(wb, '원자재가격동향_예제(가상).xlsx');
  }
  function callAI(key, btn) {
    var p = key.split('-'), L = state.res.items[+p[0]].lines[+p[1]];
    var k = $('ai-key').value.trim(), prov = $('ai-prov').value;
    if (!k) { alert('아래 「AI 의견 받기」에서 API 키를 넣어 주세요. 키가 없어도 매칭·계산은 그대로 됩니다.'); $('s-out').querySelector('details').open = true; return; }
    var names = state.series.filter(function (s) { return s.role === 'index'; }).map(function (s) { return s.name; });
    if (!confirm('도면·단가·Index 값은 보내지 않습니다.\n담당자가 확인한 재질명 「' + L.material + '」과 Index 이름 ' + names.length + '개만 외부 AI(' + (prov === 'openai' ? 'OpenAI' : 'Anthropic') + ')로 보냅니다.\n사내 자료를 외부로 보내도 되는지 확인하셨습니까?')) return;
    var prompt = E.aiPrompt(L.material + (L.famLabel ? ' (' + L.famLabel + ')' : ''), names);
    btn.disabled = true; btn.textContent = '받는 중…';
    var req = prov === 'openai'
      ? fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + k }, body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }] }) })
      : fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': k, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model: 'claude-haiku-5-5', max_tokens: 500, messages: [{ role: 'user', content: prompt }] }) });
    req.then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j.error && j.error.message) || r.status); return j; }); })
      .then(function (j) { state.ai[key] = prov === 'openai' ? j.choices[0].message.content : j.content.map(function (c) { return c.text || ''; }).join(''); renderMatch(); })
      .catch(function (e) { alert('AI 호출 실패: ' + e.message); btn.disabled = false; btn.textContent = 'AI 의견(선택)'; });
  }

  /* ───────────── 연결 ───────────── */
  function dropZone(zone, input, fn) {
    input.addEventListener('change', function (e) { fn(e.target.files); e.target.value = ''; });
    ['dragover', 'dragenter'].forEach(function (t) { zone.addEventListener(t, function (e) { e.preventDefault(); zone.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (t) { zone.addEventListener(t, function () { zone.classList.remove('over'); }); });
    zone.addEventListener('drop', function (e) { e.preventDefault(); fn(e.dataTransfer.files); });
  }
  dropZone($('drop'), $('file'), readPdfs);
  dropZone($('xdrop'), $('xfile'), function (files) {
    if (!files.length) return;
    readBook(files[0]).then(loadBook, function (e) { $('index-status').innerHTML = '<div class="warn">엑셀을 읽지 못했습니다 — ' + esc(e.message) + '</div>'; });
  });
  $('btn-sample').addEventListener('click', function () {
    var S = E.sample();
    state.draws = S.drawings; state.items = S.items; state.seq = S.items.length; state.ai = {};
    $('p-start').value = S.period.start; $('p-end').value = S.period.end;
    $('draw-status').innerHTML = '<div class="ok">예제 도면 3장(1장은 스캔)과 예제 Index 엑셀을 불러왔습니다 — 실제 사내 데이터가 아닙니다.</div>';
    renderDraws(); renderItems();
    loadBook({ file: S.indexFile, names: S.indexBook.names, sheets: S.indexBook.sheets });
  });
  $('btn-add').addEventListener('click', function () { state.items.push(E.blankItem('i' + (++state.seq))); renderItems(); update(); $('s-items').scrollIntoView(); });
  $('btn-sample-xlsx').addEventListener('click', sampleXlsx);
  $('btn-export').addEventListener('click', exportXlsx);
  $('ai-key').value = localStorage.getItem('b12-ai-key') || '';
  $('ai-prov').value = localStorage.getItem('b12-ai-prov') || 'anthropic';
  $('ai-key').addEventListener('change', function () { localStorage.setItem('b12-ai-key', $('ai-key').value.trim()); });
  $('ai-prov').addEventListener('change', function () { localStorage.setItem('b12-ai-prov', $('ai-prov').value); });
})();
