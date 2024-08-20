import type { Node, NodePath, PluginObj } from '@babel/core';

const Conditions = <const>['#if', '#elseif', '#else', '#endif'];

type ConditionalType = (typeof Conditions)[number];

interface ConditionalAnnotationNode {
  type: ConditionalType;
  value: string;
  path: NodePath<Node>;
  key: CommentKey;
  index: number;
}

interface NormalNode {
  type: 'normal';
  path: NodePath<Node>;
}

type Nodes = (ConditionalAnnotationNode | NormalNode)[];

type CommentKey = 'leadingComments' | 'trailingComments' | 'innerComments';

/** 计算条件表达式 */
function calculateCondition(type: ConditionalType, condition: string, options: Record<string, any>): boolean {
  if (type === '#else') return true;
  if (type === '#endif') return false;
  return new Function(...Object.keys(options), `return ${condition};`)(...Object.values(options));
}

function remove(nodes: Nodes) {
  if (!nodes.length) return;
  if (nodes.length === 1) {
    if (nodes[0].type === 'normal') nodes[0].path.remove();
    else {
      const { key, index } = nodes[0];
      nodes[0].path.node[key]!.splice(index, 1);
    }
    return;
  }
  if (nodes.some((node) => node.type === 'normal')) {
    let i = 0;
    let node = nodes[i];

    if (node.type === 'normal') node.path.remove();
    else {
      const { key, index } = node;
      node.path.node[key]!.splice(index);
    }

    node = nodes[nodes.length - 1];
    if (node.type === 'normal') node.path.remove();
    else {
      const { key, index } = node;
      node.path.node[key]!.splice(0, index + 1);
    }

    while (++i < nodes.length - 1) {
      node = nodes[i];
      if (node.type === 'normal') node.path.remove();
      else node.path.node[node.key] = void 0;
    }
  } else {
    const { key, index: start } = <ConditionalAnnotationNode>nodes[0];
    const { index: end } = <ConditionalAnnotationNode>nodes[nodes.length - 1];
    nodes[0].path.node[key]!.splice(start, end - start + 1);
  }
}

/** 收集条件注释 */
function track(path: NodePath<Node>, key: CommentKey) {
  const nodes: Nodes = [];
  const comments = path.node[key];
  if (!comments) return [];
  for (let i = 0; i < comments.length; i++) {
    const val = comments[i].value.trim();
    const cond = Conditions.find((cond) => {
      if (!val.startsWith(cond)) return false;
      nodes.push({ type: cond, value: val.slice(cond.length + 1), path, key, index: i });
      return true;
    });
    if (cond === '#endif') break;
  }
  return nodes;
}

/** 验证条件注释是否合法 */
function validate(nodes: Nodes) {
  const start = nodes.findLastIndex((node) => node.type === '#if');
  const end = nodes.findIndex((node) => node.type === '#endif');
  return start === 0 && end === nodes.length - 1;
}

/**
 * @name 条件注释插件
 * @support 支持 #if、#elseif、#else、#endif 四种条件注释，支持多层嵌套
 * @notice 仅对数组、对象、代码块中的条件注释进行处理，且相关联的条件注释必须在同一层级
 * @example
 * ```ts
 * // #if TOP_LEVEL
 * console.log('top level');
 * // #endif
 * function func() {
 *   // #if DEBUG
 *   console.log('debug');
 *   // #endif
 *   return ({
 *     // #if MODE === 'development'
 *     development: true,
 *     // #elseif MODE === 'production'
 *     production: true,
 *     // #else
 *     mode: 'unknown',
 *     // #endif
 *   })
 * }
 * ```
 */
export default function (): PluginObj {
  return {
    visitor: {
      Program(path, state) {
        path.traverse({
          enter(path) {
            if (path.node.innerComments?.length) {
              remove(track(path, 'innerComments'));
            }

            if (!path.node.leadingComments?.length) return;

            // 收集条件注释，以及条件注释中的普通节点
            const nodes: Nodes = [];
            while (true) {
              nodes.push(...track(path, 'leadingComments'));
              if (nodes.length && nodes[nodes.length - 1].type === '#endif') break;

              nodes.push({ type: 'normal', path });

              if (!path.getNextSibling().node) {
                nodes.push(...track(path, 'trailingComments'));
                break;
              }

              // 删除当前节点的尾部注释，保留头部注释即可
              path.node.trailingComments = void 0;
              path = path.getNextSibling();
            }
            if (!nodes.length) return;

            // 删除上一个节点的尾部注释
            const prevNode = nodes[0].path.getPrevSibling().node;
            if (prevNode) prevNode.trailingComments = void 0;

            if (!validate(nodes)) {
              nodes.forEach((node) => node.type !== 'normal' && remove([node]));
              return;
            }

            // 查找第一个成立的条件
            const idx = nodes.findIndex((node, i) => {
              if (node.type === 'normal') return false;
              if (calculateCondition(node.type, node.value, state.opts)) return true;
            });
            // 没有匹配的条件，删除所有节点
            if (idx === -1) {
              remove(nodes);
              return;
            }
            remove(nodes.slice(0, idx + 1));
            const idx2 = nodes.findIndex((node, i) => i > idx && node.type !== 'normal');
            remove(nodes.slice(idx2));
          },
        });
      },
    },
  };
}
