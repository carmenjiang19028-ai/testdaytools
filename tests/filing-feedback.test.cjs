const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../content/filing_order.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function display('), source.indexOf('\nfunction render(')), context);

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
    if (rule !== 'alpha') assert.ok(result.includes(`${context.display(later, rule)} comes later.`));
  });
}

test('equal dates use the published ID tie-break without claiming an earlier date', () => {
  const first = { date: '2026-01-08', id: 'D-20' };
  const later = { date: '2026-01-08', id: 'D-30' };
  const result = context.explain('date', first, later);
  assert.ok(result.includes('record ID A-Z as a tie-break'));
  assert.ok(!result.includes('earlier than'));
});
