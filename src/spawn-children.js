import { debug } from './config'
import { create_text, create_bound_text, create_element } from './dom_nodes'
import { create_component } from './component'
import { create_when } from './when'
import { create_each } from './each'
import { spawn_tpl_into } from './spawn-tpl'

// -+-+-+-+-+-+-+-+-+ DOM Spawn -+-+-+-+-+-+-+-+-+

// Spawn functions - spawn always happens within a spawning context,
// which means there's an active (global) DocumentFragment to append to.

// Child VNodes and DOM nodes are always appended when spawned;
// the only insertion that happens is at the site of a 'when' or 'each',
// and only when its bound value changes after initial spawn.

// sc { tpl, ofs, syms, fragment }

function create_contents(sc, parent, scope) {
  // new_scope: { locals, cssm, c_tpl, c_locals, c_cssm, d_list }
  const c_scope = { locals:scope.c_locals, cssm:scope.c_cssm, c_tpl:0, c_locals:[], c_cssm:"", d_list:scope.d_list }
  // spawn the contents injected into the component.
  spawn_tpl_into(scope.c_tpl, c_scope, parent);
}

const dom_create = [
  create_text,       // 0  DOM Vnode
  create_bound_text, // 1  DOM Vnode
  create_element,    // 2  DOM Vnode
  create_component,  // 3  (nothing)
  create_when,       // 4  When VNode
  create_each,       // 5  Each VNode
  create_contents,   // 6  (spawn outer contents)
];

export function spawn_children(sc, parent, scope) {
  // spawn a list of children within a tag vnode or component body.
  // in order to move scopes, they must capture their top-level nodes.
  let len = sc.tpl[sc.ofs++];
  while (len--) {
    const op = sc.tpl[sc.ofs++];
    if (debug && !dom_create[op]) {
      console.log("[bad] dom_create")
    }
    dom_create[op](sc, parent, scope);
  }
}
