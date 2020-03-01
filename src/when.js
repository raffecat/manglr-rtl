import { debug, log_spawn } from './config'
import { resolve_expr, is_true } from './expr_ops'
import { new_vnode, clear_child_nodes } from './vnode'
import { d_list_add, run_d_list } from './d_list'
import { new_dep, subscribe_dep, remove_dep, kill_dep, queue_action } from './deps'
import { spawn_tpl_into } from './spawn-tpl'

// sc { tpl, ofs, syms, fragment, spawn_children }

export function create_when(sc, parent, scope) {
  // runs in the context of an application update action.
  // Creates a vnode representing a 'when' node.
  // When the truth value of the bound expression changes, creates or
  // destroys the contents of this vnode to bring the view into sync.
  const body_tpl = sc.tpl[sc.ofs++]; // body template to spawn.
  const expr_dep = resolve_expr(sc, scope);
  const vnode = new_vnode(parent, null);
  const d_list = []; // local d_list to capture spawned contents.
  vnode.d_list = d_list; // for update_when, destroy_when.
  // new_scope: { locals, cssm, c_tpl, c_locals, c_cssm, d_list }
  const new_scope = { locals:scope.locals, cssm:scope.cssm,
    c_tpl:scope.c_tpl, c_locals:scope.c_locals, c_cssm:scope.c_cssm, d_list:d_list };
  const state = { vnode:vnode, scope:new_scope, expr_dep:expr_dep, body_tpl:body_tpl, in_doc:false };
  if (debug) { vnode.d_is = 'when'; vnode.d_in = scope.cssm; vnode.d_state = state }
  if (log_spawn) console.log("[s] create 'when':", state);
  const when_dep = new_dep(expr_dep.val, update_when_dep, state);
  d_list_add(scope.d_list, destroy_when, when_dep);
  // create_when in two different contexts:
  // (a) initial render - (want to render the children now!)
  //     - subscribe_dep will mark_dirty(when_dep) and schedule an update transaction.
  // (b) an enclosing spawn_tpl due to a dep change - (want to render the children now!)
  //     - subscribe_dep will append when_dep to in_transaction
  // in both cases, create_when runs inside an existing spawn-context.
  // we can avoid an unnecessary update by creating when_dep with expr_dep.val !
  subscribe_dep(expr_dep, when_dep);
  // update the when-node now, within the current spawn-context.
  update_when_action(state);
}

function update_when_dep(when_dep, state) {
  // runs inside a dep-update transaction.
  // cannot change the dep network during a dep-update transaction,
  // so queue an action to add/remove nodes (if dep value has changed)
  const new_val = is_true(state.expr_dep.val);
  if (new_val !== state.in_doc) {
    queue_action(update_when_action, state)
  }
}

function update_when_action(state) {
  // runs in the context of an application update action.
  // create or destroy the `contents` based on boolean `value`.
  // note: it's possible that that the boolean value has changed back
  // due to other actions - so check if it has changed again.
  // TODO FIXME: since update is queued, MUST check if the 'when' is dead (removed)
  const new_val = is_true(state.expr_dep.val);
  if (new_val !== state.in_doc) {
    state.in_doc = new_val;
    const when_vnode = state.vnode;
    if (new_val) {
      // spawn the contents of the when vnode.
      spawn_tpl_into(state.body_tpl, state.scope, when_vnode);
    } else {
      // destroy the current contents of the when vnode.
      // destroy everything on the d_list - a when_vnode always has d_list attached.
      // note: d_list could go on the state for when nodes (but not for each nodes)
      run_d_list(when_vnode.d_list, false); // in_destroy=false.
      // remove DOM contents of when_vnode from the DOM.
      // also removes all child vnodes (resets when_vnode to empty)
      clear_child_nodes(when_vnode);
    }
  }
}

function destroy_when(when_dep) {
  // runs in the context of an application update action.
  // called from enclosing d_list (will be a 'when' or 'child-of-repeat' d_list)
  const state = when_dep.arg;
  // must unsubscribe when_dep from the expr_dep.
  kill_dep(when_dep); // do not receive any more updates.
  remove_dep(state.expr_dep, when_dep); // remove when_dep from expr_dep's fwd list.
  // must run the d_list for the when_vnode.
  // note: (d_list) in_destroy == true : no need to remove child DOM nodes or vnodes.
  run_d_list(state.vnode.d_list, true); // in_destroy=true.
}
