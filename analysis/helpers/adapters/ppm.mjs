// PPM (P6, 非圧縮バイナリRGB) の最小パーサ。

const WHITESPACE = new Set([0x20, 0x09, 0x0a, 0x0d]);

export function parsePpm(buffer) {
  let position = 0;
  const tokens = [];

  while (tokens.length < 4) {
    while (position < buffer.length && WHITESPACE.has(buffer[position])) position += 1;
    if (position >= buffer.length) throw new Error('PPM ヘッダが不完全です');
    if (buffer[position] === 0x23) {
      while (position < buffer.length && buffer[position] !== 0x0a) position += 1;
      continue;
    }
    const start = position;
    while (position < buffer.length && !WHITESPACE.has(buffer[position])) position += 1;
    tokens.push(buffer.toString('ascii', start, position));
  }

  if (tokens[0] !== 'P6') throw new Error(`P6 以外の PPM です: ${tokens[0]}`);
  const width = Number(tokens[1]);
  const height = Number(tokens[2]);
  const maxValue = Number(tokens[3]);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`PPM の寸法が不正です: ${tokens[1]}x${tokens[2]}`);
  }
  if (maxValue !== 255) throw new Error(`PPM の最大値は255のみ対応しています: ${tokens[3]}`);

  if (!WHITESPACE.has(buffer[position])) throw new Error('PPM ヘッダの終端が不正です');
  if (buffer[position] === 0x0d && buffer[position + 1] === 0x0a) position += 2;
  else position += 1;

  const data = buffer.subarray(position);
  const expected = width * height * 3;
  if (data.length !== expected) {
    throw new Error(`PPM の画素データ長が不正です: expected=${expected}, actual=${data.length}`);
  }
  return { width, height, data };
}

export function sampleRect(image, rect) {
  const x0 = Math.max(0, Math.round(rect.x0));
  const y0 = Math.max(0, Math.round(rect.y0));
  const x1 = Math.min(image.width - 1, Math.round(rect.x1));
  const y1 = Math.min(image.height - 1, Math.round(rect.y1));
  if (x1 < x0 || y1 < y0) return [];

  const pixels = [];
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const offset = (y * image.width + x) * 3;
      pixels.push({ r: image.data[offset], g: image.data[offset + 1], b: image.data[offset + 2] });
    }
  }
  return pixels;
}
