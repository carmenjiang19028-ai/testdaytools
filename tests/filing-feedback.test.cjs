const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../content/filing_order.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(source.slice(source.indexOf('const textCmp='), source.indexOf('\nfunction render(')), context);

for (const rule of ['name', 'date', 'alpha']) {
  const first = { last: 'Bennett', first: 'Ari', date: '2026-01-08', code: 'A-2', id: 'R-20' };
  const later = { last: 'Diaz', first: 'Rafael', date: '2026-02-14', code: 'A-10', id: 'R-30' };
  test(`${rule}: correct feedback never orders a record after itself`, () => {
    const result = context.explain(rule, first, first);
    assert.ok(result.includes(context.display(first, rule)));
    assert.ok(!result.includes('comes later'));
    assert.ok(!result.includes('earlier than'));
  });
  test(`${rule}: incorrect feedback identifies the first record`, () => {
    const result = context.explain(rule, first, later);
    assert.ok(result.includes(context.display(first, rule)));
    assert.ok(result.includes('decides:'));
  });
}

test('equal dates use the published ID tie-break without claiming an earlier date', () => {
  const first = { date: '2026-01-08', id: 'D-20' };
  const later = { date: '2026-01-08', id: 'D-30' };
  const result = context.explain('date', first, later);
  assert.ok(result.includes('Both dates match, so the record ID decides'));
  assert.ok(!result.includes('earlier than'));
});

for (const [rule, first, second, reason] of [
  ['name', { last: 'Bennett', first: 'Zoe', id: 'R-91' }, { last: 'Diaz', first: 'Ari', id: 'R-11' }, /Last name decides: Bennett comes before Diaz/],
  ['name', { last: 'Bennett', first: 'Ari', id: 'R-91' }, { last: 'Bennett', first: 'Zoe', id: 'R-11' }, /First name decides: Ari comes before Zoe/],
  ['name', { last: 'Bennett', first: 'Ari', id: 'R-11' }, { last: 'Bennett', first: 'Ari', id: 'R-91' }, /Both names match, so the record ID decides: R-11/],
  ['date', { date: '2025-12-24', id: 'D-91' }, { date: '2026-01-24', id: 'D-11' }, /Date decides: 2025-12-24 comes before 2026-01-24/],
  ['alpha', { code: 'A-2', id: 'C-91' }, { code: 'A-10', id: 'C-11' }, /Numeric value decides: 2 is less than 10/],
  ['alpha', { code: 'A-2', id: 'C-91' }, { code: 'A-02', id: 'C-11' }, /same value \(2\).*fewer leading zeros/],
  ['alpha', { code: 'A-2', id: 'C-91' }, { code: 'A-2B', id: 'C-11' }, /shorter exact prefix comes first/],
  ['alpha', { code: 'A-2', id: 'C-11' }, { code: 'A-2', id: 'C-91' }, /Both codes match, so the record ID decides/],
]) {
  test(`${rule}: ${reason.source}`, () => {
    assert.equal(context.ordered([second, first], rule)[0], first);
    assert.ok(context.decision(second, first, rule).order > 0);
    assert.match(context.explain(rule, first, second), reason);
  });
}

test('all four records are filed by number and then digit length, not visible position', () => {
  const displayOrder = ['A-02', 'B-2', 'A-10', 'A-2'];
  const rows = displayOrder.map(code => ({ code, id: `C-${code}` }));
  assert.deepEqual(Array.from(context.ordered(rows, 'alpha'), row => row.code), ['A-2', 'A-02', 'A-10', 'B-2']);
});
