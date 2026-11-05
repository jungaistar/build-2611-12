/* 계산 규칙 고정 — node test/logic.test.js
 * 화면이 아니라 숫자가 틀리면 안 되는 도구다. 동의어 · 중량 · 기간 값 · 변동률 · 상관 · 매칭 · 단가 영향을 손으로 셀 수 있는 값과 대조한다. */
'use strict';
var C = require('../js/costidx.js');
var passed = 0, failed = 0;
function ok(c, label, detail) { if (c) passed++; else { failed++; console.log('  X ' + label + (detail != null ? '\n      ' + detail : '')); } }
function eq(g, w, label) { ok(JSON.stringify(g) === JSON.stringify(w), label, '기대: ' + JSON.stringify(w) + '  실제: ' + JSON.stringify(g)); }
function near(g, w, tol, label) { ok(g != null && Math.abs(g - w) <= tol, label, '기대: ' + w + ' ± ' + tol + '  실제: ' + g); }
function fam(s) { return C.normMaterial(s).family; }

// 재질 동의어 → 계열
eq(['SM45C', 'S45C', 'S 45 C', 'SM20C', '1045'].map(fam), ['carbon', 'carbon', 'carbon', 'carbon', 'carbon'], '기계구조용 탄소강 동의어');
eq(['SCM440', 'SCM440H (Q/T)', 'SCM 440', 'SCr420', 'SNCM439', '4140'].map(fam), ['alloy', 'alloy', 'alloy', 'alloy', 'alloy', 'alloy'], '합금강 동의어(공백·괄호·열처리 표기)');
eq(['SUS304', 'STS304', 'SUS 316L', '304', '스테인리스'].map(fam), ['sts', 'sts', 'sts', 'sts', 'sts'], '스테인리스 동의어');
eq(['AL6061', 'A6061-T6', '6061-T6', 'A5052', '알루미늄 합금'].map(fam), ['al', 'al', 'al', 'al', 'al'], '알루미늄 동의어');
eq(['C1100', 'C1020', 'C3604', 'C2600', 'C5191'].map(fam), ['cu', 'cu', 'brass', 'brass', 'bronze'], '구리 · 황동 · 청동을 가른다');
eq(['SS400', 'SM490A', 'SPHC', 'SPCC', 'SECC', 'FC250'].map(fam), ['hot', 'hot', 'hot', 'cold', 'coated', 'cast'], 'SM490(일반 구조용)과 SM45C(기계구조용)를 섞지 않는다 · 냉연 · 도금 · 주철');
eq(fam('XYZ-9'), '', '모르는 재질은 계열을 지어내지 않는다');
eq(C.normMaterial('SUS304').density, 7.93, '스테인리스 비중');

// Index 열 이름 → 계열
eq(['열연강판(원/톤)', '냉연강판', '특수강(합금강)', '스테인리스 STS304', '알루미늄 LME(USD/톤)', '구리 LME', '기준월'].map(C.indexFamily),
  ['hot', 'cold', 'alloy', 'sts', 'al', 'cu', ''], 'Index 이름에서 계열 읽기');

// 치수
eq(C.parseDims('Ø45 x 210 L'), { shape: 'bar', d: 45, L: 210 }, '봉재 Ø45 × 210');
eq(C.parseDims('φ45×210'), { shape: 'bar', d: 45, L: 210 }, '봉재 φ · × 기호');
eq(C.parseDims('PL t12 x 150 x 300'), { shape: 'plate', t: 12, w: 150, L: 300 }, '판재 t12 × 150 × 300');
eq(C.parseDims('OD60 x t8 x 80L'), { shape: 'pipe', od: 60, t: 8, L: 80 }, '파이프 OD60 × t8 × 80');
eq(C.parseDims('OD10 x t6 x 50'), null, '두께가 반지름보다 큰 파이프는 읽지 않는다');
eq(C.parseDims('REMOVE ALL BURRS'), null, '치수가 아닌 글');

// 중량 — mm³ × g/cm³ ÷ 10⁶
near(C.weightKg({ shape: 'bar', d: 45, L: 210 }, 7.85), Math.PI / 4 * 2025 * 210 * 7.85 / 1e6, 1e-9, '봉재 중량 식');
near(C.weightKg({ shape: 'bar', d: 45, L: 210 }, 7.85), 2.6218, 0.0005, '봉재 Ø45×210 강 ≈ 2.622 kg(손계산)');
near(C.weightKg({ shape: 'plate', t: 12, w: 150, L: 300 }, 7.85), 4.239, 1e-9, '판재 12×150×300 강 = 4.239 kg');
near(C.weightKg({ shape: 'pipe', od: 60, t: 8, L: 80 }, 7.85), Math.PI / 4 * (3600 - 1936) * 80 * 7.85 / 1e6, 1e-9, '파이프 = (OD² − ID²)·π/4·L');
near(C.weightKg({ shape: 'plate', t: 10, w: 100, L: 100 }, 2.70), 0.27, 1e-9, '알루미늄 비중 2.70');
near(C.weightKg({ shape: 'bar', d: 50, L: 215 }, 7.85, 3), Math.PI / 4 * 2500 * 218 * 7.85 / 1e6, 1e-9, '절단 여유는 길이에 더한다');

// 도면 글자에서 후보 뽑기
var ex = C.extractDrawing(C.SAMPLE_DRAWINGS[0].lines.join('\n'), 'a.pdf');
eq([ex.fields.material[0].value, ex.fields.material[0].line, ex.fields.dwg[0].value, ex.fields.weight[0].value, ex.fields.qty[0].value],
  ['SS400', 4, 'BRK-2611-A', 3.6, 1], '영문 표제란 — 재질 · 출처 줄 · 도번 · 중량 · 수량');
eq([ex.fields.stock[0].dims.shape, ex.fields.finished[0].dims.w], ['plate', 150], '소재 규격과 완성 치수를 따로 읽는다');
var ek = C.extractDrawing('품명: 축\n도면번호: AX-01\n재질 : SM45C\n중량 : 850 g\n수량: 4', 'k.pdf');
eq([ek.fields.name[0].value, ek.fields.dwg[0].value, ek.fields.material[0].norm.family, ek.fields.weight[0].value, ek.fields.qty[0].value],
  ['축', 'AX-01', 'carbon', 0.85, 4], '한글 표제란 · g → kg');
var es = C.extractDrawing('', 'scan.pdf');
ok(es.empty && /스캔/.test(es.notes.join()), '글자 없는 PDF 는 직접 입력 안내');
ok(/후보가 2개/.test(C.extractDrawing('MATERIAL: SS400\nMATERIAL: SPCC').notes.join()), '재질 후보가 여럿이면 확인하라고 알린다');
var it0 = C.itemFromDrawing(ex, 'x');
eq([it0.lines[0].src.material, it0.lines[0].src.finishedKg, it0.src.dwg], ['doc', 'doc', 'doc'], '도면에서 읽은 값은 출처 doc');

var pl = C.pdfLines([{ str: 'SS400', transform: [1, 0, 0, 1, 120, 700], width: 30 }, { str: 'MATERIAL:', transform: [1, 0, 0, 1, 50, 701], width: 50 }, { str: 'TITLE: PIN', transform: [1, 0, 0, 1, 50, 720], width: 50 }]);
eq(pl, ['TITLE: PIN', 'MATERIAL:  SS400'], 'PDF 글자 조각을 줄로 묶고(위→아래 · 왼→오) 벌어진 칸은 두 칸 띄움');
eq(C.extractDrawing(pl.join('\n')).fields.material[0].value, 'SS400', '줄로 묶은 PDF 글자에서 재질');

// 날짜
eq(['2022-03', '2022.3', '2022년 3월', '2022/03/15', '20220315', 44621].map(C.parseMonth), ['2022-03', '2022-03', '2022-03', '2022-03', '2022-03', '2022-03'], '날짜 표기 여러 가지 → 월');
eq(C.parseMonth(new Date(2023, 6, 9)), '2023-07', 'Date 값');
eq([C.parseMonth('2022-13'), C.parseMonth('abc'), C.parseMonth(1080000)], [null, null, null], '달이 아니거나 가격 숫자면 날짜가 아니다');

// 시트 구조 · 계열 만들기
var S = C.sample(), ins = C.inspectSheet(S.indexAoa);
eq([ins.headerRow, ins.dateCol, ins.columns.filter(function (c) { return c.role === 'index'; }).length], [2, 0, 6], '제목 줄을 건너뛰고 머리줄 · 날짜 열 · Index 6열을 찾는다');
var aoa = [['월', '열연', '메모'], ['2024-01', 100, 'a'], ['2024-01', 110, ''], ['2024-02', '', 'b'], ['몰라', 105, ''], ['2024-03', '1,200', '']];
var bi = C.inspectSheet(aoa), bs = C.buildSeries(aoa, bi, 't');
eq(bs.series[0].points, [{ m: '2024-01', v: 105 }, { m: '2024-03', v: 1200 }], '같은 달은 월평균 · 천 단위 쉼표 · 빈 칸은 비운다');
ok(bs.issues.length === 3 && /날짜를 읽지 못해/.test(bs.issues.map(function (i) { return i.msg; }).join()), '빈 값 · 날짜 오류 · 월평균을 모두 알린다', JSON.stringify(bs.issues));
eq(bi.columns[2].role, 'skip', '숫자가 아닌 열은 Index 로 쓰지 않는다');

// 기간 값 — 정확 · 가장 가까운 이전 · (이전이 없으면) 다음
var s1 = { name: 'A', family: 'hot', points: [{ m: '2022-03', v: 100 }, { m: '2022-04', v: 110 }, { m: '2022-06', v: 99 }, { m: '2025-04', v: 120 }] };
eq(C.valueAt(s1, '2022-04'), { m: '2022-04', v: 110, kind: 'exact' }, '그 달 값');
eq(C.valueAt(s1, '2022-05'), { m: '2022-04', v: 110, kind: 'prev' }, '없으면 가장 가까운 이전 값(2022-06 이 더 가까워도 미래 값은 쓰지 않음)');
eq(C.valueAt(s1, '2022-01'), { m: '2022-03', v: 100, kind: 'next' }, '이전 값이 없으면 다음 값 + 표시');
var ps = C.periodStats(s1, '2022-03', '2025-05');
near(ps.rate, 20, 1e-9, '변동률 (120 ÷ 100 − 1) = +20%');
eq([ps.end.m, ps.diff, ps.max.m, ps.min.m, ps.up, ps.down], ['2025-04', 20, '2025-04', '2022-06', 1, 0], '사용 월 · 변동액 · 최고 · 최저 · 연속 달만 오른/내린 달로 센다');
ok(/2025-04 값 사용/.test(ps.notes.join()), '사용한 날짜를 적는다');
ok(/시작 전 데이터 없음/.test(C.periodStats(s1, '2022-01', '2022-06').notes.join()), '시작 전 값이 없으면 확인 필요');

// 상관계수
near(C.pearson([1, 2, 3, 4], [2, 4, 6, 8]), 1, 1e-12, '같이 움직이면 +1');
near(C.pearson([1, 2, 3, 4], [8, 6, 4, 2]), -1, 1e-12, '거꾸로면 −1');
near(C.pearson([1, 2, 3, 4, 5], [2, 4, 5, 4, 5]), 0.7745967, 1e-6, '교과서 예 r = 0.7746');
eq(C.pearson([1, 2, 3], [5, 5, 5]), null, '변동이 없으면 상관을 계산하지 않는다');

// 매칭
function series(name, family, vals, role) { return { name: name, family: family, role: role || 'index', points: vals.map(function (v, i) { return { m: C.mStr(2022 * 12 + i), v: v }; }) }; }
var up = [100, 102, 101, 104, 108, 107, 111, 115, 113, 118, 120, 119, 123];
var zig = [100, 97, 103, 99, 104, 98, 105, 100, 106, 99, 107, 101, 108];
var P = { start: '2022-01', end: '2023-01' };
var set = [series('열연', 'hot', up), series('냉연', 'cold', up.map(function (v, i) { return v * (1 + (i % 2 ? 0.002 : -0.002)); })), series('특수강', 'alloy', zig), series('구리', 'cu', zig)];
var mx = C.matchIndex('hot', set, P);
eq([mx.status, mx.chosen, mx.confidence, mx.candidates.length], ['exact', '열연', '높음', 0], '정확 일치면 그것만 쓰고 다른 후보를 고르지 않는다');
var mm = C.matchIndex('hot', set.concat([series('열연(수입)', 'hot', up)]), P);
eq([mm.status, mm.chosen, mm.candidates.length], ['multi', null, 2], '같은 계열 Index 가 여럿이면 고르지 않는다');
eq(C.matchIndex('al', set, P).status, 'none', '계열이 먼 후보뿐이면 분석 불가(알루미늄 ↔ 구리 · 철강을 고르지 않는다)');
eq(C.matchIndex('', set, P).status, 'unknown', '재질 계열을 모르면 분석 불가');
var me = C.matchIndex('carbon', set, P);
eq(me.candidates.map(function (c) { return c.name; }).sort(), ['냉연', '열연', '특수강'], '탄소강 후보 3개 — 구리는 넣지 않는다');
ok(me.status === 'estimate' && me.review && me.candidates[0].score >= me.candidates[1].score && me.candidates[1].score >= me.candidates[2].score, '추정 · 담당자 확인 · 점수 순');
ok(me.chosen !== '특수강', '재질 유사도가 가장 높아도(특수강 0.8) 가격 움직임이 다르면 1순위가 아니다', me.chosen);
var refd = set.concat([series('S45C 구매가', '', zig, 'ref')]);
var mr = C.matchIndex('carbon', refd, P, { refName: 'S45C 구매가' });
eq([mr.chosen, mr.candidates[0].corr > 0.99], ['특수강', true], '참고 계열을 주면 그것과 같이 움직이는 후보가 1순위');
ok(/참고 계열/.test(mr.basis) && !/참고 계열/.test(me.basis.split('.')[0]), '무엇과 비교했는지 적는다');
eq(C.matchIndex('hot', refd, P).chosen, '열연', '참고 계열(ref)은 Index 로 쓰지 않는다');
var mp = C.matchIndex('carbon', set, P, { pick: '특수강' });
eq([mp.status, mp.chosen, mp.review, mp.candidates.length], ['manual', '특수강', true, 3], '담당자가 고른 후보는 manual · 확인 표시 유지');
var ms = C.matchIndex('carbon', [set[0], set[2]], { start: '2022-01', end: '2022-04' });
ok(ms.candidates[0].corr == null && ms.confidence === '낮음', '비교할 달이 부족하면 상관을 내지 않고 신뢰도 낮음');

// 소재 한 줄
var L1 = C.lineMaterial({ material: 'SS400', finishedKg: 2, src: {} });
near(L1.input.kg, 2 / 0.85, 1e-9, '소재 규격이 없으면 투입 = 완성 ÷ 수율(가정 0.85)');
near(L1.effKg, 2 / 0.85 - 0.3 * (2 / 0.85 - 2), 1e-9, '유효 중량 = 투입 − 스크랩 × 회수율(가정 0.3)');
eq([L1.yield.src, L1.recovery.src, L1.finished.src], ['assume', 'assume', 'input'], '기본값은 가정으로 표시');
var L2 = C.lineMaterial({ material: 'SCM440', finishedDims: 'Ø45 x 210', stockDims: 'Ø50 x 215', cutMm: 0, recovery: 0, unitPrice: 1000, src: {} });
near(L2.yield.v, (2025 * 210) / (2500 * 215), 1e-9, '소재 규격이 있으면 수율은 계산(완성 ÷ 투입)');
near(L2.cost, C.weightKg({ shape: 'bar', d: 50, L: 215 }, 7.85) * 1000, 1e-9, '회수율 0 이면 소재 원가 = 투입 중량 × 단가');

// 품목 — 손계산 대조
var hot = series('열연', 'hot', [100, 110, 120]);
var PP = { start: '2022-01', end: '2022-03' };
function one(extra) {
  var it = C.blankItem('t');
  it.price0 = 10000; it.compMode = 'ratio'; it.comp = { material: null, process: 30, labor: 10, overhead: 5 };
  it.lines = [Object.assign(C.blankLine(), { material: 'SS400', finishedKg: 4, yield: 0.8, recovery: 0.5, unitPrice: 1000 })];
  Object.keys(extra || {}).forEach(function (k) { it[k] = extra[k]; });
  return C.analyzeItem(it, { series: [hot], period: PP });
}
var r = one();
// 투입 5 · 스크랩 1 · 유효 4.5 → 소재 원가 4,500 · +20% → 900
eq([Math.round(r.M0), r.M0src, Math.round(r.dM), +r.rateOnPrice.toFixed(6), Math.round(r.expected), +r.share.toFixed(6)], [4500, 'calc', 900, 9, 10900, 45], '소재 원가 4,500 × 20% = 900원 · 영향률 9% · 예상 10,900');
eq([r.others.process, r.others.labor, r.others.overhead, Math.round(r.others.rest)], [3000, 1000, 500, 1000], '가공비 · 인건비 · 경비는 따로 · 그 밖 = 단가 − 나머지');
ok(Math.round(r.expected - r.price0) === Math.round(r.dM), '가공비 등은 Index 영향을 받지 않는다');
eq(one({ priceNew: 11000 }).verify.verdict, 'explained', '요청 단가 변동(1,000)이 소재 영향(900) + 허용 1% 안이면 설명됨');
var rv = one({ priceNew: 11500 });
eq([rv.verify.verdict, Math.round(rv.verify.unexplained)], ['review', 600], '설명 안 되는 차이 600원 → 추가 검토');
var down = C.analyzeItem(Object.assign(C.blankItem('d'), { price0: 10000, priceNew: 10300, comp: {}, lines: [Object.assign(C.blankLine(), { material: 'SS400', finishedKg: 4, unitPrice: 1000 })] }),
  { series: [series('열연', 'hot', [120, 110, 100])], period: PP });
eq(down.verify.verdict, 'contradict', '원소재는 내렸는데 단가가 오르면 따로 표시');
var cm = C.analyzeItem(Object.assign(C.blankItem('c'), { price0: 9000, compMode: 'amount', comp: { material: 3000, process: 4000 }, lines: [Object.assign(C.blankLine(), { material: 'A6061', finishedKg: 1 })] }),
  { series: [hot], period: PP });
eq([cm.M0, cm.M0src, cm.lines[0].match.status], [3000, 'input', 'none'], '소재 단가가 없으면 원가 구성 소재비 · 후보가 없으면 분석 불가');
eq(cm.dM, null, '분석 불가 소재가 있으면 영향 금액을 내지 않는다');
var two = C.analyzeItem(Object.assign(C.blankItem('m'), { price0: 20000, comp: {}, lines: [
  Object.assign(C.blankLine(), { material: 'SS400', finishedKg: 1, yield: 1, unitPrice: 1000 }),
  Object.assign(C.blankLine(), { material: 'C1100', finishedKg: 1, yield: 1, unitPrice: 10000 })] }),
  { series: [hot, series('구리', 'cu', [100, 95, 90])], period: PP });
eq(Math.round(two.dM), 200 - 1000, '소재별 영향 합산(열연 +200 · 구리 −1,000)');
var dis = C.analyzeItem(Object.assign(C.blankItem('q'), { price0: 10000, compMode: 'amount', comp: { material: 2000 }, lines: [Object.assign(C.blankLine(), { material: 'SS400', finishedKg: 4, yield: 1, unitPrice: 1000 })] }),
  { series: [hot], period: PP });
ok(/10% 넘게 다릅니다/.test(dis.review.join()), '중량 × 단가와 원가 구성 소재비가 다르면 알린다');

// 기간 · 일괄 · 내보내기
ok(C.checkPeriod({ start: '2025-05', end: '2022-03' }).length === 1 && C.checkPeriod({ start: '2022-03', end: '2025-05' }).length === 0, '기간 순서 검사');
ok(!C.analyze({ items: [], index: { series: [] }, period: PP }).ok, 'Index 가 없으면 분석하지 않는다');
var res = C.analyze({ items: S.items.slice(0, 3), index: { series: C.buildSeries(S.indexAoa, ins, '예제').series }, period: S.period });
var est = res.items[2].lines[0].match;
eq([res.items.length, res.items[0].lines[0].match.status, res.items[1].lines[0].match.status, est.status, est.candidates.length], [3, 'exact', 'exact', 'estimate', 3], '예제: 정확 2 · 추정 1(후보 3개)');
eq(res.items[1].lines[0].stats.end.m, '2025-04', '예제: 특수강 2025-05 가 비어 2025-04 값 사용');
eq(res.items[1].verify.verdict, 'contradict', '예제: 핀은 소재 하락인데 요청 단가 상승');
var sh = C.exportSheets(res);
eq(Object.keys(sh), ['도면별분석', 'Index매칭', '가격변동', '단가영향', '종합', '근거가정'], '엑셀 시트 6장');
eq(sh['단가영향'].length, 4, '단가영향: 머리줄 + 품목 3');
var mrow = sh['가격변동'].filter(function (row) { return row[0] === '2022-03' || row[0] === '2025-05'; });
eq(mrow.length, 2, '가격변동 시트에 분석 기간 월별 원자료');
ok(/대체 지표/.test(sh['Index매칭'][3].join()), '추정 줄에 대체 지표 주의 문구');
var prompt = C.aiPrompt('S45C', ['열연강판', '냉연강판']);
ok(/S45C/.test(prompt) && /냉연강판/.test(prompt) && !/DWG|BRK-2611/.test(prompt), 'AI 에는 재질명과 Index 이름만 보낸다');


// ───── v1.1 실무 통합문서(머리 블록) 형식 ─────
var B = C.sampleBook(), BI = C.inspectBook(B);
function shOf(n) { return BI.sheets.filter(function (x) { return x.sheet === n; })[0]; }
function col(n, letter) { return shOf(n).columns.filter(function (c) { return c.letter === letter; })[0]; }
var steel = shOf('철판');
eq([steel.kind, steel.firstRow, steel.dateWidth, steel.columns.length], ['block', 9, 2, 5], '머리 블록 인식 — 데이터 10행부터 · 연·월 두 칸 · 값 열 5개');
eq([steel.skipped.rate, steel.skipped.quarter], [5, 1], '증감률 열 5개 · 분기 열 1개를 건너뛴다');
eq(steel.columns.map(function (c) { return c.letter; }), ['D', 'F', 'H', 'J', 'L'], '단위가 빈 숫자 열(증감률)은 Index 후보가 아니다');
eq([col('철판', 'F').item, col('철판', 'F').region, col('철판', 'F').unit], ['냉연강판(CR)', '중국', 'RMB/ton'], '가로 병합 품목명을 오른쪽 열이 물려받는다');
eq(col('철판', 'L').name, '후판 · SS400 20t · 유통가(가상) · 한국 · KRW/kg', 'Index 이름 = 품목 · 규격 · 기준 · 지역 · 단위');
ok(steel.newestFirst, '최신 월이 위인 시트를 알아본다');
var BB = C.buildBook(B, BI, 'x.xlsx');
function sr(re) { return BB.series.filter(function (x) { return re.test(x.name); })[0]; }
var plate = sr(/^후판/);
eq([plate.points[0].m, plate.points[plate.points.length - 1].m, plate.points.length], ['2020-01', '2026-10', 82], '최신이 위인 데이터를 오래된 순으로 정렬');
eq(plate.points.filter(function (p) { return p.m === '2026-09'; })[0].v, B.sheets['철판'][10][11], '연이 위 행에만 있어도(세로 병합) 아래 행이 물려받는다');
var bar = shOf('특수강,환봉');
eq([bar.skipped.quarter, bar.columns[0].letter], [0, 'C'], '분기 열이 없는 시트는 C 가 바로 값');
eq([col('비철금속', 'E').source, col('비철금속', 'E').spec, col('비철금속', 'E').unit], ['가상 자료', '전기동', 'KRW/kg(환산)'], '줄 순서가 달라도(비철 6행 출처) A열 낱말로 찾는다 · 원화 열이 출처를 물려받는다');
eq([col('비철금속', 'D').role, col('비철금속', 'E').role], ['skip', 'index'], '같은 금속의 USD/ton ↔ KRW/kg 짝은 원화 열이 기본');
eq([col('특수강,환봉', 'I').role, col('특수강,환봉', 'I').inhouse], ['ref', true], '출처가 구매팀인 열은 사내 구매가 → 참고 계열');
eq([shOf('환율').sheetKind, shOf('환율').columns.map(function (c) { return c.role; }).join()], ['fx', 'skip,skip'], '환율 시트는 환산용(기본 제외)');
var pmiS = sr(/^China/);
eq([shOf('제조업 PMI').dateWidth, pmiS.points[pmiS.points.length - 1].m, pmiS.role, shOf('제조업 PMI').columns.length], [1, '2026-05', 'skip', 3], 'PMI: 「2026-5」 날짜 · 지역 이름 · 기본 제외');
eq(C.inspectBlock([['제목'], ['품목', '', '', 'A'], ['상세\n출처', '', '', 's'], ['단 위', '', '', 'KRW/kg'], ['2026년', '1월', '26.1Q', 10], ['', '2월', '26.1Q', '12,0']]).columns[0].detail, 's', '칸 안 줄바꿈 · 띄어 쓴 낱말도 머리 줄로 읽는다');
var bad = C.buildBlockSeries([['제목'], ['품목', '', 'A'], ['단위', '', 'KRW/kg'], ['2026년', '2월', 10], ['', '1월', '확인중']], C.inspectBlock([['제목'], ['품목', '', 'A'], ['단위', '', 'KRW/kg'], ['2026년', '2월', 10], ['', '1월', '확인중']], 's'));
ok(bad.issues.length === 1 && /숫자가 아님/.test(bad.issues[0].msg), '값 칸의 글자는 그 달을 비우고 알린다');
var simple = C.inspectBook({ names: ['Index'], sheets: { Index: C.sampleIndexAoa() } }).sheets[0];
eq([simple.kind, simple.columns.filter(function (c) { return c.role === 'index'; }).length], ['simple', 6], 'v1.0 단순 표(날짜 열 + Index 열)도 그대로 읽는다');

// 규격 재질 · 계열 일치
eq(['SS275 마환봉 Φ31~80', 'STS 304 CR 2.0mm', 'SMxxC Φ260~350', 'Q235 1mm', 'SCRxxx Φ25~160', 'SM355A', '페로몰리브덴'].map(C.gradeTokens),
  [['SS275'], ['STS304'], ['SMXXC'], ['Q235'], ['SCRXXX'], ['SM355A'], []], '규격 글자에서 재질 기호만 뽑는다(치수는 빼고)');
eq(['SCM440H (Q/T)', 'S45C', 'SUS 304', 'SM45C', '특수강봉강'].map(C.gradeOf), ['SCM440', 'SM45C', 'STS304', 'SM45C', ''], '비교용 표준 표기(H · S/SM · SUS/STS)');
var PP2 = { start: '2022-03', end: '2025-05' };
var mg = C.matchIndex('hot', BB.series, PP2, { grade: 'SS400' });
eq([mg.status, /^후판/.test(mg.chosen)], ['grade', true], 'SS400 → 규격 칸이 SS400 인 후판(열연 · Q235 를 고르지 않는다)');
var mw = C.matchIndex('carbon', BB.series, PP2, { grade: 'SM45C' });
eq([mw.status, /SMxxC/.test(mw.chosen)], ['series', true], 'SM45C ↔ SMxxC 는 계열 일치');
var ma = C.matchIndex('alloy', BB.series, PP2, { grade: 'SCM440' });
eq([ma.status, /SCRxxx/.test(ma.chosen), /SCM440/.test(ma.refHint.join())], ['exact', true, true], 'SCRxxx 는 SCM440 을 담지 않는다 · 사내 구매가 SCM440 은 Index 가 아니라 참고 계열로 알려 준다');
var two = [{ name: 'A중국', family: 'hot', role: 'index', grades: ['SS400'], points: plate.points, meta: { region: '중국', unit: 'RMB/ton' } }, { name: 'B한국', family: 'hot', role: 'index', grades: ['SS400'], points: plate.points, meta: { region: '한국', unit: 'KRW/kg' } }];
var mp2 = C.matchIndex('hot', two, PP2, { grade: 'SS400' });
eq([mp2.chosen, mp2.alts, /지역/.test(mp2.notes.join())], ['B한국', ['A중국'], true], '같은 재질이 여럿이면 한국 · KRW/kg 우선, 고른 이유를 남긴다');
two[0].meta = { region: '한국', unit: 'KRW/kg' };
eq(C.matchIndex('hot', two, PP2, { grade: 'SS400' }).status, 'multi', '지역 · 단위까지 같으면 고르지 않는다');

// 원화 환산(선택)
var cuUsd = Object.assign({}, sr(/^구리.*USD/), { role: 'index' });
var fxr = C.fxConvert(BB.series.map(function (x) { return x.name === cuUsd.name ? cuUsd : x; }));
var cv = fxr.series.filter(function (x) { return x.converted && /^구리/.test(x.name); })[0], cuK = sr(/^구리.*KRW/);
var m5 = function (x) { return x.points.filter(function (p) { return p.m === '2026-05'; })[0].v; };
near(m5(cv) / 1000, m5(cuK), 0.06, 'USD/ton × 환율 ÷ 1000 = 같은 통합문서의 KRW/kg(환산)');
eq([cv.meta.unit, cv.points[cv.points.length - 1].m, /환율이 없는 달 4개/.test(fxr.notes.join())], ['KRW/ton(환산)', '2026-05', true], '환산 단위 표시 · 환율이 없는 달은 빼고 알린다');
ok(/알 수 없어/.test(C.fxConvert([{ name: 'X', role: 'index', points: [], meta: { unit: 'USD/bbl', kind: 'material' } }, { name: 'USD', role: 'skip', points: [], meta: { kind: 'fx' } }]).notes.join()), '단위를 모르면 환산하지 않는다');

// 예제(통합문서)로 끝까지
var S2 = C.sample(), RB = C.buildBook(S2.indexBook, C.inspectBook(S2.indexBook), S2.indexFile);
var R2 = C.analyze({ items: S2.items, index: { series: RB.series }, period: S2.period });
eq(R2.items.map(function (r) { return r.lines[0].match.status; }), ['grade', 'exact', 'series', 'estimate'], '예제: 규격 일치 · 계열(재질) 일치 · 계열 일치(SMxxC) · 추정');
eq(R2.items[1].lines[0].stats.end.m, '2025-04', '예제: SCRxxx 2025-05 가 비어 2025-04 값 사용');
var PS = C.exportSheets(R2)['가격변동'];
eq([PS[0][0], PS[0][4]], ['단위', '출처'], '가격변동 시트는 단위 · 출처 칸부터');
ok(C.exportSheets(R2)['Index매칭'].some(function (r) { return /가상 자료/.test(r.join()); }), 'Index매칭 시트에 적용 Index 출처');

console.log('\n규칙 통과 ' + passed + ' · 실패 ' + failed);
process.exit(failed ? 1 : 0);
