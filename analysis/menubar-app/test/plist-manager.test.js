const assert = require('node:assert/strict');
const test = require('node:test');
const { toInteger } = require('../lib/plist-manager');

test('toInteger returns parsed values and safe fallback', () => {
  assert.equal(toInteger('23', 0), 23);
  assert.equal(toInteger(null, 30), 30);
  assert.equal(toInteger('not-a-number', 30), 30);
});
