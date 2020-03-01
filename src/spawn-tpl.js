import { log_spawn } from './config'
import { insert_dom_nodes } from './vnode'
import { resolve_expr, spawn_model_tpl } from './expr_ops'

// sc { tpl, ofs, syms, fragment, spawn_children }

let g_sc = null
let in_spawn = false

// note: to avoid circular import, spawn_children cannot be imported here!

export function init_sc(tpl, syms, spawn_children) {
  // initialise the spawn-context object.
  // in_spawn tells us whether this is currently being used.
  g_sc = {
    tpl: tpl,
    ofs: tpl[0], // offset of main component.
    syms: syms,
    fragment: document['createDocumentFragment'](),
    spawn_children: spawn_children,
    resolve_expr: resolve_expr,
    spawn_model_tpl: spawn_model_tpl,
  }
}

export function spawn_tpl_into(tpl_id, scope, into_vnode) {
  // spawn a template: a sequence of child nodes.
  // called at page load, then incrementally as 'when'/'each' nodes change state.
  // * don't actually know on entry whether in_spawn is true or false.
  // called recursively when spawning a new sub-tree:
  // * must save and restore the tpl-ofs in the spawn-context,
  // * must insert the document fragment once when finished!
  if (log_spawn) console.log("spawn tpl: "+tpl_id);
  if (tpl_id) { // zero is the empty template.
    const sc = g_sc;
    const tpl_ofs = sc.tpl[tpl_id];
    // push context: save tpl-ofs and set to new template.
    const saved_ofs = sc.ofs ; sc.ofs = tpl_ofs; // seek to beginning of template.
    const was_in_spawn = in_spawn; in_spawn = true; // so we can detect outermost call!
    // spawn the template contents into the vnode.
    sc.spawn_children(sc, into_vnode, scope);
    // pop context: restore tpl-ofs and in_spawn.
    sc.ofs = saved_ofs;
    in_spawn = was_in_spawn;
    // insert DOM nodes into the DOM when final (recursive) spawn ends.
    if (!was_in_spawn) {
      insert_dom_nodes(sc.fragment, into_vnode);
    }
  }
}
