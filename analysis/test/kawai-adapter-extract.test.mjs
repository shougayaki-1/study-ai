import { test } from 'node:test';
import assert from 'node:assert/strict';

function makePpm(width, height, fill) {
  const header = Buffer.from(`P6\n${width} ${height}\n255\n`, 'ascii');
  const body = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    const { r, g, b } = fill(i % width, Math.floor(i / width));
    body[i * 3] = r;
    body[i * 3 + 1] = g;
    body[i * 3 + 2] = b;
  }
  return Buffer.concat([header, body]);
}

test('parsePpm は P6 ヘッダと画素を読む', async () => {
  const { parsePpm } = await import('../helpers/adapters/ppm.mjs');
  const image = parsePpm(makePpm(4, 3, () => ({ r: 10, g: 20, b: 30 })));
  assert.equal(image.width, 4);
  assert.equal(image.height, 3);
  assert.equal(image.data.length, 36);
  assert.equal(image.data[0], 10);
  assert.equal(image.data[2], 30);
});

test('parsePpm はコメント行を読み飛ばす', async () => {
  const { parsePpm } = await import('../helpers/adapters/ppm.mjs');
  const image = parsePpm(Buffer.concat([
    Buffer.from('P6\n# created by pdftoppm\n2 1\n255\n', 'ascii'),
    Buffer.from([1, 2, 3, 4, 5, 6]),
  ]));
  assert.equal(image.width, 2);
  assert.equal(image.height, 1);
  assert.deepEqual(Array.from(image.data), [1, 2, 3, 4, 5, 6]);
});

test('parsePpm は P6 以外と不正な画素長を拒否する', async () => {
  const { parsePpm } = await import('../helpers/adapters/ppm.mjs');
  assert.throws(() => parsePpm(Buffer.from('P3\n1 1\n255\n0 0 0', 'ascii')), /P6/);
  assert.throws(() => parsePpm(Buffer.from('P6\n2 2\n255\nabc', 'binary')), /画素/);
});

test('sampleRect は矩形内だけを返し、範囲外を切り詰める', async () => {
  const { parsePpm, sampleRect } = await import('../helpers/adapters/ppm.mjs');
  const image = parsePpm(makePpm(10, 10, (x) => x < 5 ? { r: 255, g: 0, b: 0 } : { r: 0, g: 255, b: 0 }));
  const left = sampleRect(image, { x0: 0, y0: 0, x1: 4, y1: 1 });
  assert.equal(left.length, 10);
  assert.ok(left.every((pixel) => pixel.r === 255));
  const clipped = sampleRect(image, { x0: -5, y0: -5, x1: 1, y1: 0 });
  assert.equal(clipped.length, 2);
});
