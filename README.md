# Conditional Annotation

## 💡 Description

Remove the code during the compilation phase through conditional annotations, is babel plugin.

## 🚀 Features

- 支持 #if、#elseif、#else、#endif 四种条件注释
- 支持多层嵌套，相关联的条件注释必须在同一层级
- 仅对数组、对象、代码块中的条件注释进行处理

## 📦 Install

```bash
npm i -D babel-plugin-conditional-annotation
```

## ⚡ Usage

```ts
// #if TOP_LEVEL
// top level
console.log('top level');
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
}
```

## 📄 License

[MIT License](https://github.com/wulongshe/conditional-annotation/blob/master/LICENSE.md) © 2024 [shewulong](https://github.com/wulongshe)

