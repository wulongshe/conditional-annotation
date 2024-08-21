import type { Node, NodePath, PluginObj } from '@babel/core';

const Conditions = <const>['#if', '#elseif', '#else', '#endif'];

type ConditionalType = (typeof Conditions)[number];

interface ConditionalAnnotationItem {
  type: ConditionalType;
  value: string;
  path: NodePath<Node>;
  key: CommentKey;
  index: number;
}

interface NormalItem {
  type: 'normal';
  path: NodePath<Node>;
}

type List = (ConditionalAnnotationItem | NormalItem)[];

type CommentKey = 'leadingComments' | 'trailingComments' | 'innerComments';

/** 计算条件表达式 */
function calculateCondition(type: ConditionalType, condition: string, options: Record<string, any>): boolean {
  if (type === '#else') return true;
  if (type === '#endif') return false;
  return new Function(...Object.keys(options), `return ${condition};`)(...Object.values(options));
}

/** 给列表中的条件注释节点打上忽略标记 */
function markListRemove(list: List) {
  list.forEach((item) => {
    if (item.type !== 'normal') {
      item.path.node[item.key]![item.index].ignore = true;
    }
  });
}

/** 给节点的注释打上忽略标记 */
function markCommentsRemove(path: NodePath<Node>, key: CommentKey, start: number, end?: number) {
  path.node[key]!.slice(start, end).forEach((comment) => (comment.ignore = true));
}

function remove(list: List) {
  if (!list.length) return;
  if (list.length === 1) {
    if (list[0].type === 'normal') list[0].path.remove();
    else markCommentsRemove(list[0].path, list[0].key, list[0].index, list[0].index + 1);
    return;
  }
  if (list.every((item) => item.type !== 'normal')) {
    const { key, index: start } = <ConditionalAnnotationItem>list[0];
    const { index: end } = <ConditionalAnnotationItem>list[list.length - 1];
    markCommentsRemove(list[0].path, key, start, end + 1);
    return;
  }

  let item = list[0];
  if (item.type === 'normal') item.path.remove();
  else markCommentsRemove(item.path, item.key, item.index);

  item = list[list.length - 1];
  if (item.type === 'normal') item.path.remove();
  else markCommentsRemove(item.path, item.key, 0, item.index + 1);

  let i = 0;
  while (++i < list.length - 1) {
    item = list[i];
    if (item.type === 'normal') item.path.remove();
    else item.path.node[item.key] = void 0;
  }
}

/** 收集条件注释 */
function track(path: NodePath<Node>, key: CommentKey) {
  const list: List = [];
  const comments = path.node[key];
  if (!comments) return [];
  for (let i = 0; i < comments.length; i++) {
    if (comments[i].ignore) continue;
    const val = comments[i].value.trim();
    const cond = Conditions.find((cond) => {
      if (!val.startsWith(cond)) return false;
      list.push({ type: cond, value: val.slice(cond.length + 1), path, key, index: i });
      return true;
    });
    if (cond === '#endif') break;
  }
  return list;
}

/** 验证条件注释是否合法 */
function validate(list: List) {
  const start = list.findLastIndex((item) => item.type === '#if');
  const end = list.findIndex((item) => item.type === '#endif');
  return start === 0 && end === list.length - 1;
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
 * // #if FUNC
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
 * #endif
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
            const list: List = [];
            while (true) {
              list.push(...track(path, 'leadingComments'));
              if (!list.length || list[list.length - 1].type === '#endif') break;

              list.push({ type: 'normal', path });

              if (!path.getNextSibling().node) {
                list.push(...track(path, 'trailingComments'));
                break;
              }

              // 删除当前节点的尾部注释，保留头部注释即可
              path.node.trailingComments = void 0;
              path = path.getNextSibling();
            }
            if (!list.length) return;

            // 删除上一个节点的尾部注释
            const prevNode = list[0].path.getPrevSibling().node;
            if (prevNode) prevNode.trailingComments = void 0;

            if (!validate(list)) {
              markListRemove(list);
              return;
            }

            let hasError = false;
            // 查找第一个成立的条件
            const idx = list.findIndex((item) => {
              if (item.type === 'normal') return false;
              try {
                if (calculateCondition(item.type, item.value, state.opts)) return true;
              } catch (e: any) {
                const { key, index } = item;
                const { line, column } = item.path.node[key]![index].loc!.start;
                console.warn(`[WARN] ${e.message} at ${state.filename}:${line}:${column}`);
                hasError = true;
              }
            });
            if (hasError) {
              markListRemove(list);
              return;
            }
            // 没有匹配的条件，删除所有节点
            if (idx === -1) {
              remove(list);
              return;
            }
            remove(list.slice(0, idx + 1));
            const idx2 = list.findIndex((item, i) => i > idx && item.type !== 'normal');
            remove(list.slice(idx2));
          },
          exit(path) {
            (<const>['innerComments', 'leadingComments', 'trailingComments']).forEach((key) => {
              if (path.node[key]) path.node[key] = path.node[key]!.filter((comment) => !comment.ignore);
            });
          },
        });
      },
    },
  };
}
