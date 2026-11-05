/* 브라우저에 실제로 띄워 화면이 그려지는지 본다 — node test/smoke.browser.js
 * 규칙 테스트가 다 통과해도 app.js 오타 하나면 빈 화면이 된다. playwright 가 없으면 건너뛴다.
 * PDF 는 pdf.js 를 동적으로 불러오는 길(워커 주소·cmaps)이 깨지기 쉬워서 samples/ 의 예제 PDF 를 실제로 올려 본다. */
'use strict';
var http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
var chromium;
try { chromium = require('playwright').chromium; }
catch (e) { console.log('playwright 가 없어 화면 연기 테스트를 건너뜁니다.'); process.exit(0); }
var XLSX = require('../lib/xlsx.full.min.js');
var ROOT = path.join(__dirname, '..');
var MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.pdf': 'application/pdf', '.bcmap': 'application/octet-stream' };
var srv = http.createServer(function (q, s) {
  var p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
  fs.readFile(p, function (e, b) { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); });
});
var passed = 0, failed = 0;
function ok(c, label, d) { if (c) passed++; else { failed++; console.log('  X ' + label + (d != null ? '  ' + d : '')); } }
var count = function (pg, sel) { return pg.$$eval(sel, function (t) { return t.length; }); };
srv.listen(0, async function () {
  var base = 'http://127.0.0.1:' + srv.address().port + '/';
  var br = await chromium.launch(); var ctx = await br.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  var pg = await ctx.newPage();
  var errs = []; pg.on('pageerror', function (e) { errs.push(e.message); });
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'b12-smoke-'));
  try {
    await pg.goto(base);
    ok(await pg.isHidden('#s-items') && await pg.isHidden('#s-result'), '처음엔 품목·결과가 숨어 있다');
    await pg.click('#btn-sample');
    await pg.waitForSelector('#impact tbody tr', { timeout: 8000 });
    ok(await count(pg, '.draw') === 3 && /스캔/.test(await pg.textContent('#draws')), '보조 추출 카드 3장(스캔 1장은 직접 입력 안내)');
    ok(/4째 줄: MATERIAL: SS400/.test(await pg.textContent('#draws')), '추출 값마다 출처 줄');
    ok(await count(pg, '.item') === 4, '품목 4개');
    ok(await count(pg, '#items .s-doc') >= 6 && await count(pg, '#items .s-assume') >= 3, '도면에서 읽음 · 가정 꼬리표');
    ok(/투입 .*kg/.test(await pg.textContent('#calc-0-0')), '투입·유효 중량 계산 칸');
    ok(await count(pg, '.mcard') === 4 && await count(pg, '.mcard.st-grade') === 1 && await count(pg, '.mcard.st-exact') === 1 && await count(pg, '.mcard.st-series') === 1 && await count(pg, '.mcard.st-estimate') === 1, '매칭: 규격 재질 일치 · 재질 계열 일치 · 계열 일치(SMxxC) · 추정');
    ok(/출처 가상 자료/.test(await pg.textContent('.mcard.st-grade .evid')) && /상세출처/.test(await pg.textContent('.mcard.st-grade .evid')), '적용 Index 의 출처 · 상세출처를 근거로 보여 준다');
    ok(/사내 구매가/.test(await pg.textContent('.mcard.st-exact')), 'SCM440 사내 구매가는 참고 계열로 알려 준다');
    ok(await count(pg, '#map tr[data-c]') === 21 && await count(pg, '#map tr.sheethead') === 5, '시트 5장 · 값 열 21개를 한 표에(증감률·분기 열 제외)');
    ok(await count(pg, '.mcard.st-estimate table.cands tbody tr') === 3, '추정 후보 3개와 근거');
    ok(/비교한 것/.test(await pg.textContent('.mcard.st-estimate')) && /대체 지표/.test(await pg.textContent('.mcard.st-estimate')), '무엇을 비교했는지 · 대체 지표 주의');
    ok(await count(pg, '.mcard.st-estimate .chart.cand polyline') === 3, '후보 움직임 비교 그래프');
    ok(await count(pg, '#price tbody tr') === 4 && await count(pg, '#price .unitgrp') === 1, '사용한 Index 4개의 기간 변동(단위별 표)');
    ok(/2025-04[\s\S]*없음 → 가까운 이전 값/.test(await pg.textContent('#price')), '종료월 값이 없으면 가까운 이전 월과 사용 날짜 표시');
    ok(await count(pg, '#trend svg rect.period') === 4 && await count(pg, '#trend svg polyline') >= 4, 'Index 추이 그래프 + 기간 음영');
    ok(await count(pg, '#waterfall svg') === 4 && await count(pg, '#waterfall rect.wf') >= 12, '폭포형 4개');
    ok(/설명되지 않는 차이/.test(await pg.textContent('#review')), '요청 단가의 설명 안 되는 차이를 검토 항목으로');
    await pg.check('#fx');
    ok(/원화 환산/.test(await pg.textContent('#index-status')) && /RMB\/ton → 원화 환산/.test(await pg.textContent('.mcard.st-estimate')), '환율 시트로 USD·RMB Index 원화 환산(선택)');
    await pg.uncheck('#fx');
    var before = await pg.textContent('#impact tbody tr:nth-child(4)');
    await pg.click('.mcard.st-estimate input[type=radio]:not(:checked) >> nth=0');
    await pg.waitForSelector('.mcard.st-manual');
    ok(await pg.textContent('#impact tbody tr:nth-child(4)') !== before, '다른 후보를 고르면 영향이 다시 계산된다');
    ok(/담당자 선택/.test(await pg.textContent('.mcard.st-manual')), '고른 후보는 담당자 선택으로 표시');
    var p1 = await pg.textContent('#impact tbody tr:nth-child(1)');
    await pg.fill('#p-start', '2023-01'); await pg.dispatchEvent('#p-start', 'change');
    ok(await pg.textContent('#impact tbody tr:nth-child(1)') !== p1 && /2023-01/.test(await pg.textContent('#price')), '분석 기간을 바꾸면 다시 계산');
    await pg.fill('#items .item:nth-child(1) input[data-k=price0]', '20000'); await pg.dispatchEvent('#items .item:nth-child(1) input[data-k=price0]', 'change');
    ok(/20,000원/.test(await pg.textContent('#impact tbody tr:nth-child(1)')), '단가를 고치면 결과에 반영');
    var dl = await Promise.all([pg.waitForEvent('download'), pg.click('#btn-export')]);
    var xf = path.join(tmp, 'r.xlsx'); await dl[0].saveAs(xf);
    var wb = XLSX.read(fs.readFileSync(xf));
    ok(wb.SheetNames.join() === '도면별분석,Index매칭,가격변동,단가영향,종합,근거가정', '엑셀 보고서 시트 6장', wb.SheetNames.join());
    var ds = await Promise.all([pg.waitForEvent('download'), pg.click('#btn-sample-xlsx')]);
    var sx = path.join(tmp, 'idx.xlsx'); await ds[0].saveAs(sx);
    // 새 화면 — 실제 PDF 3장과 예제 Index 엑셀을 올린다
    await pg.goto(base);
    await pg.setInputFiles('#file', ['BRK-2611-A_bracket.pdf', 'PIN-2611-B_pin.pdf', 'BSH-2611-C_scan.pdf'].map(function (f) { return path.join(ROOT, 'samples', f); }));
    await pg.waitForSelector('.draw', { timeout: 15000 });
    var dt = await pg.textContent('#draws');
    ok(/SS400/.test(dt) && /SCM440H/.test(dt) && /BRK-2611-A/.test(dt), 'PDF 에서 재질·도번을 읽는다(pdf.js 동봉)');
    ok(/Ø50 × 215 L/.test(dt) && /3\.6/.test(dt), 'PDF 에서 소재 규격·중량을 읽는다');
    ok(/글자가 없는 PDF/.test(dt), '스캔 PDF 는 직접 입력 안내');
    await pg.setInputFiles('#xfile', sx);
    await pg.waitForSelector('#match .mcard', { timeout: 8000 });
    ok(await count(pg, '#map tr[data-c]') === 21, '내려받은 예제 통합문서(병합 칸 포함)를 다시 읽는다');
    ok(await count(pg, '.mcard.st-grade') === 1 && await count(pg, '.mcard.st-exact') === 1 && await count(pg, '.mcard.st-unknown') === 1, '업로드 경로: 규격 일치 · 계열 일치 · 스캔(재질 없음)은 분석 불가');
    ok(/기준 단가가 없습니다/.test(await pg.textContent('#review')), '단가를 넣지 않으면 검토 항목으로 알린다');
    await pg.selectOption('#map tr[data-s="0"][data-c="11"] select[data-r=role]', 'skip');
    ok(!/후판/.test(await pg.textContent('#price')) && await count(pg, '.mcard.st-multi') === 1, '후판(SS400) 열을 빼면 열연·SS275 가 같은 순위라 고르지 않는다');
    // v1.0 단순 표도 그대로
    var simple = path.join(tmp, 'simple.xlsx'), swb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(swb, XLSX.utils.aoa_to_sheet(require('../js/costidx.js').sampleIndexAoa()), 'Index');
    fs.writeFileSync(simple, XLSX.write(swb, { type: 'buffer', bookType: 'xlsx' }));
    await pg.setInputFiles('#xfile', simple);
    await pg.waitForFunction(function () { return document.querySelectorAll('#map tr[data-c]').length === 6; }, null, { timeout: 5000 });
    ok(await count(pg, '#map select[data-date]') === 1 && await count(pg, '.mcard.st-exact') === 2, 'v1.0 단순 표(날짜 열 + Index 열)도 읽는다');
    // 좁은 화면
    await pg.setViewportSize({ width: 360, height: 800 });
    await pg.goto(base); await pg.click('#btn-sample'); await pg.waitForSelector('#waterfall svg');
    var over = await pg.evaluate(function () { return document.documentElement.scrollWidth - document.documentElement.clientWidth; });
    ok(over <= 0, '360px 에서 가로 넘침 없음', over);
    await pg.goto(base + 'guide.html');
    ok(/스크랩 회수율/.test(await pg.textContent('main')), '사용법 페이지');
  } catch (e) { failed++; console.log('  X 예외: ' + e.message); }
  ok(!errs.length, '페이지 오류 없음', errs.join(' | '));
  await br.close(); srv.close();
  console.log('\n화면 통과 ' + passed + ' · 실패 ' + failed);
  process.exit(failed ? 1 : 0);
});
