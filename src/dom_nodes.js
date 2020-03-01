import { debug, log_spawn } from './config'
import { new_vnode } from './vnode'
import { resolve_expr, to_text } from './expr_ops'
import { new_dep, subscribe_dep, remove_dep } from './deps'
import { d_list_add } from './d_list'
import { attr_ops } from './dom_attrs'

// sc { tpl, ofs, syms, fragment, spawn_children }

// -+-+-+-+-+-+-+-+-+ Text Node -+-+-+-+-+-+-+-+-+

export function create_text(sc, parent) {
  // create a DOM Text node with literal text.
  const vnode = new_vnode(parent, null);
  const text = sc.syms[sc.tpl[sc.ofs++]];
  if (log_spawn) console.log("[s] createTextNode:", text);
  // create a DOM TextNode.
  // always inside a spawn-context: append to document fragment.
  const dom_node = document.createTextNode(text);
  sc.fragment.appendChild(dom_node);
  vnode.dom = dom_node; // attach dom_node to vnode.
}

// -+-+-+-+-+-+-+-+-+ Bound Text Node -+-+-+-+-+-+-+-+-+

export function create_bound_text(sc, parent, scope) {
  // create a DOM Text node with a bound expression.
  const vnode = new_vnode(parent, null);
  const expr_dep = resolve_expr(sc, scope); // always a dep.
  const text = to_text(expr_dep.val);
  if (log_spawn) console.log("[s] createTextNode:", expr_dep, text);
  // create a DOM TextNode.
  // always inside a spawn-context: append to document fragment.
  const dom_node = document.createTextNode(text);
  sc.fragment.appendChild(dom_node);
  vnode.dom = dom_node; // attach dom_node to vnode.
  // watch expr_dep for changes unless it is a const-dep.
  if (expr_dep.wait >= 0) {
    const state = { dom_node:dom_node, expr_dep:expr_dep };
    const text_dep = new_dep(expr_dep.val, update_bound_text, state);
    subscribe_dep(expr_dep, text_dep);
    d_list_add(scope.d_list, destroy_bound_text, text_dep);
    update_bound_text(text_dep, state); // update now.
  }
}

function update_bound_text(text_dep, state) {
  // update the DOM Text Node from the expr_dep's value.
  state.dom_node.data = to_text(state.expr_dep.val);
}

function destroy_bound_text(text_dep) {
  const state = text_dep.arg;
  remove_dep(state.expr_dep, text_dep); // remove from 'fwd' list.
}

// -+-+-+-+-+-+-+-+-+ Element Node -+-+-+-+-+-+-+-+-+

export function create_element(sc, parent, scope) {
  // create a DOM Element node with bound attributes.
  const vnode = new_vnode(parent, null);
  const tag = sc.syms[sc.tpl[sc.ofs++]];
  if (log_spawn) console.log("[s] createElement:", tag);
  // create a DOM Element.
  // always inside a spawn-context: append to document fragment.
  const dom_node = document.createElement(tag);
  dom_node.setAttribute(scope.cssm, ""); // tag with css_m.
  sc.fragment.appendChild(dom_node);
  vnode.dom = dom_node; // attach dom_node to vnode.
  // bind Element properties to bound expressions.
  let nattrs = sc.tpl[sc.ofs++];
  const cls = [];
  // apply attributes and bindings (grouped by type)
  while (nattrs--) {
    const op = sc.tpl[sc.ofs++];
    if (debug && !attr_ops[op]) {
      console.log("[bad] attr_op")
    }
    attr_ops[op](sc, dom_node, scope, cls);
  }
  // must append, because attr_cond_class can update first.
  if (cls.length) {
    const ocls = dom_node.className;
    dom_node.className = (ocls?ocls+' ':ocls) + cls.join(' '); // ugh messy.
  }
  // spawn any child nodes inside this DOM element.
  const saved_fragment = sc.fragment; sc.fragment = dom_node;
  sc.spawn_children(sc, vnode, scope);
  sc.fragment = saved_fragment;
}
