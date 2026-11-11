import test from 'node:test';
import assert from 'node:assert/strict';
import { getImageCrop, getSquareGuide, optimizeImage } from '../src/services/imageOptimizer.js';

test('square guide matches the centered crop for landscape, portrait and square frames', () => {
  for (const [width, height] of [[1920, 1080], [1080, 1920], [1000, 1000]]) {
    const crop = getImageCrop(width, height, 1600);
    const guide = getSquareGuide(width, height);
    assert.equal(parseFloat(guide.width), crop.sourceWidth / width * 100);
    assert.equal(parseFloat(guide.height), crop.sourceHeight / height * 100);
  }
  assert.deepEqual(getSquareGuide(0, 0), { width: '100%', height: '100%' });
});

test('landscape and portrait frames are centered and produce square images', () => {
  assert.deepEqual(getImageCrop(1920, 1080, 1600), { x: 420, y: 0, sourceWidth: 1080, sourceHeight: 1080, width: 1080, height: 1080 });
  assert.deepEqual(getImageCrop(3000, 4000, 1600), { x: 0, y: 500, sourceWidth: 3000, sourceHeight: 3000, width: 1600, height: 1600 });
});

test('image processing returns the actual encoded dimensions and applies mirroring', async () => {
  const previous = { Image: globalThis.Image, FileReader: globalThis.FileReader, document: globalThis.document };
  const calls = [];
  globalThis.Image = class {
    naturalWidth = 4000;
    naturalHeight = 3000;
    set src(value) { queueMicrotask(() => this.onload()); }
  };
  globalThis.FileReader = class {
    readAsDataURL() { this.result = 'data:image/webp;base64,eA=='; queueMicrotask(() => this.onload()); }
  };
  const context = { filter: '', translate: (...args) => calls.push(['translate', ...args]), scale: (...args) => calls.push(['scale', ...args]), drawImage: (...args) => calls.push(['draw', ...args.slice(1)]) };
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context, toBlob: callback => callback(new Blob(['x'], { type: 'image/webp' })) }) };
  try {
    const result = await optimizeImage('data:image/png;base64,eA==', 1600, 0.88, true, { mirror: true, brightness: 1.25 });
    assert.equal(result.width, 1600);
    assert.equal(result.height, 1600);
    assert.equal(result.mimeType, 'image/webp');
    assert.equal(context.filter, 'brightness(1.25)');
    assert.deepEqual(calls[0], ['translate', 1600, 0]);
    assert.deepEqual(calls[1], ['scale', -1, 1]);
    assert.deepEqual(calls[2], ['draw', 500, 0, 3000, 3000, 0, 0, 1600, 1600]);
  } finally {
    Object.assign(globalThis, previous);
  }
});
