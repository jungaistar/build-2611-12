/* 예제 도면 PDF 만들기 — node samples/make-samples.js
 * 실제 회사 도면이 아니다. 엔진의 SAMPLE_DRAWINGS 글자를 표제란처럼 찍고 외곽선·형상 선을 그린다.
 * 세 번째(BSH-2611-C)는 스캔 도면 흉내 — 선만 있고 글자가 없다. */
'use strict';
var fs = require('fs'), path = require('path');
var E = require('../js/costidx.js');

function pdf(lines, shapes) {
  var pe = function (s) { return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); };
  var body = '0.6 w 20 20 802 555 re S\n1.2 w ' + shapes + '\n';
  if (lines.length) {
    body += '0.8 w 470 30 342 ' + (lines.length * 16 + 14) + ' re S\nBT /F1 10 Tf\n';
    lines.forEach(function (l, i) { body += '1 0 0 1 480 ' + (30 + lines.length * 16 - i * 16) + ' Tm (' + pe(l) + ') Tj\n'; });
    body += 'ET';
  }
  var objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    '<< /Length ' + Buffer.byteLength(body, 'latin1') + ' >>\nstream\n' + body + '\nendstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'];
  var out = '%PDF-1.4\n', offs = [];
  objs.forEach(function (o, i) { offs.push(Buffer.byteLength(out, 'latin1')); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  var x = Buffer.byteLength(out, 'latin1');
  out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map(function (o) { return String(o).padStart(10, '0') + ' 00000 n \n'; }).join('');
  out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + x + '\n%%EOF\n';
  return Buffer.from(out, 'latin1');
}
var SHAPES = [
  '80 300 300 150 re S 120 340 m 120 410 l S 340 340 m 340 410 l S 100 470 m 360 470 l S',      // 판재 브래킷 정면 · 치수선
  '80 330 330 70 re S 80 365 m 410 365 l S 450 330 70 70 re S 485 365 35 0 360 arc S',        // 봉재 핀
  '120 300 m 380 300 l 380 420 l 120 420 l h S 120 330 m 380 330 l S 120 390 m 380 390 l S'    // 파이프 부싱 단면
];
// arc 는 PDF 연산자가 아니다 — 원은 베지어 4개로 그린다
function circle(cx, cy, r) { var k = 0.5523 * r; return (cx + r) + ' ' + cy + ' m ' + (cx + r) + ' ' + (cy + k) + ' ' + (cx + k) + ' ' + (cy + r) + ' ' + cx + ' ' + (cy + r) + ' c ' + (cx - k) + ' ' + (cy + r) + ' ' + (cx - r) + ' ' + (cy + k) + ' ' + (cx - r) + ' ' + cy + ' c ' + (cx - r) + ' ' + (cy - k) + ' ' + (cx - k) + ' ' + (cy - r) + ' ' + cx + ' ' + (cy - r) + ' c ' + (cx + k) + ' ' + (cy - r) + ' ' + (cx + r) + ' ' + (cy - k) + ' ' + (cx + r) + ' ' + cy + ' c S'; }
SHAPES[1] = '80 330 330 70 re S 80 365 m 410 365 l S ' + circle(520, 365, 35);
E.SAMPLE_DRAWINGS.forEach(function (d, i) {
  var f = path.join(__dirname, d.file);
  fs.writeFileSync(f, pdf(d.lines, SHAPES[i]));
  console.log(f);
});

// 가짜 원자재 가격 통합문서(실무 「원자재 가격 동향」 형식 흉내 — 값 · 출처 · 주소는 지어낸 것)
var XLSX = require('../lib/xlsx.full.min.js');
var B = E.sampleBook(), wb = XLSX.utils.book_new();
B.names.forEach(function (n) { var ws = XLSX.utils.aoa_to_sheet(B.sheets[n]); ws['!merges'] = B.merges[n]; XLSX.utils.book_append_sheet(wb, ws, n); });
var xf = path.join(__dirname, 'index-workbook_sample.xlsx');
fs.writeFileSync(xf, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));   // 이 빌드의 writeFile 은 node 에서 fs 를 못 찾는다
console.log(xf);
