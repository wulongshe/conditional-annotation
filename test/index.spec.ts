import { transformAsync } from '@babel/core';
import { expect, test } from 'vitest';
import ConditionalAnnotationPlugin from '../src/index';

test('no node, array, no options', async () => {
  const code = `[
    // #if false
    // #endif
  ];`;
  const output = await transformAsync(code, { plugins: [[ConditionalAnnotationPlugin]] });
  expect(output?.code).toBe(`[];`);
});

test('one node, array, no options', async () => {
  const code = `[
    1,
    // #if false
    2,
    // #endif
    3,
  ];`;
  const output = await transformAsync(code, { plugins: [[ConditionalAnnotationPlugin]] });
  expect(output?.code).toBe(`[1, 3];`);
});

test('tow node, array, no options', async () => {
  const code = `[
    1,
    2,
    // #if false
    3,
    4,
    // #endif
    5,
    6,
  ];`;
  const output = await transformAsync(code, { plugins: [[ConditionalAnnotationPlugin]] });
  expect(output?.code).toBe(`[1, 2, 5, 6];`);
});

test('one node, array, elseif', async () => {
  const code = `[
    1,
    // #if false
    2,
    // #elseif true
    3,
    // #else
    4,
    // #endif
    5,
  ];`;
  const output = await transformAsync(code, { plugins: [[ConditionalAnnotationPlugin]] });
  expect(output?.code).toBe(`[1, 3, 5];`);
});

test('one node, array, else', async () => {
  const code = `[
    // #if false
    // #elseif false
    2,
    // #else
    3,
    // #endif
    4,
  ];`;
  const output = await transformAsync(code, { plugins: [[ConditionalAnnotationPlugin]] });
  expect(output?.code).toBe(`[3, 4];`);
});

test('one node, object, no options, elseif & else', async () => {
  const code = `({
    a: 1,
    // #if false
    b: 2,
    // #elseif true
    c: 3,
    // #else
    d: 4,
    // #endif
    e: 5,
  });`;
  const output = await transformAsync(code, { plugins: [[ConditionalAnnotationPlugin]] });
  expect(output?.code).toBe(`({\n  a: 1,\n  c: 3,\n  e: 5\n});`);
});

test('function, object, no options', async () => {
  const code = `function transverse(node) {
    // #if left
    transverse(node.left)
    // #endif
    console.log(node.value)
    // #if right
    transverse(node.right)
    // #endif
  }`;
  const output = await transformAsync(code, { plugins: [[ConditionalAnnotationPlugin, { left: true, right: false }]] });
  expect(output?.code).toBe(`function transverse(node) {
  transverse(node.left);
  console.log(node.value);
}`);
});

test('one node, array, has options', async () => {
  const code = `[
    1,
    // #if debug
    2,
    // #elseif mode === 'production'
    3,
    // #else
    4,
    // #endif
    5,
  ];`;
  const output = await transformAsync(code, {
    plugins: [[ConditionalAnnotationPlugin, { debug: false, mode: 'production' }]],
  });
  expect(output?.code).toBe(`[1, 3, 5];`);
});

test('nested', async () => {
  const code = `
// #if START
// start
console.log('start');
// #endif
function func() {
  // debug outer
  // #if DEBUG
  // debug inner prev
  console.log('debug');
  // debug inner next
  // #endif
  return {
    // #if MODE === 'development'
    development: true,
    // #elseif MODE === 'production'
    production: true,
    // #else
    mode: 'unknown',
    // #endif
  };
}`;
  const output = await transformAsync(code, {
    plugins: [[ConditionalAnnotationPlugin, { START: true, DEBUG: false, MODE: 'production' }]],
  });
  expect(output?.code).toBe(`// start
console.log('start');
function func() {
  // debug outer

  return {
    production: true
  };
}`);
});
