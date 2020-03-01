import { debug, hasOwn, log_spawn } from './config'
import { resolve_expr } from './expr_ops'
import { new_vnode, move_vnode, unlink_vnode, clear_child_nodes } from './vnode'
import { d_list_add, run_d_list } from './d_list'
import { new_dep, subscribe_dep, remove_dep, kill_dep, queue_action } from './deps'
import { spawn_tpl_into } from './spawn-tpl'
import { Collection } from './models'

// sc { tpl, ofs, syms, fragment, spawn_children }

export function create_each(sc, parent, scope) {
  // runs in the context of an application update action.
  // Creates a vnode representing the contents of the repeat node.
  // When the expression value changes, iterates over the new value creating
  // and destroying child vnodes to bring the view into sync with the value.
  const bind_as = sc.tpl[sc.ofs++]; // index in locals.
  const body_tpl = sc.tpl[sc.ofs++]; // body template to spawn.
  const coll = resolve_expr(sc, scope);
  if (!(coll instanceof Collection)) throw 5; // assert: must be a Collection.
  const vnode = new_vnode(parent, null);
  const state = { vnode:vnode, scope:scope, coll:coll, body_tpl:body_tpl, bind_as:bind_as, have_keys:{} };
  if (debug) { vnode.d_is = 'each'; vnode.d_in = scope.cssm; vnode.d_state = state }
  if (log_spawn) console.log("[s] create 'each':", state);
  const each_dep = new_dep(coll.items.val, update_each_dep, state);
  d_list_add(scope.d_list, destroy_each, each_dep);
  // create_each in two different contexts:
  // (a) initial render - (want to render the rep children now!)
  //     - subscribe_dep will mark_dirty(each_dep) and schedule an update transaction.
  // (b) an enclosing spawn_tpl due to a dep change - (want to render the rep children now!)
  //     - subscribe_dep will append each_dep to in_transaction
  // in both cases, create_each runs inside an existing spawn-context.
  // we can avoid an unnecessary update by creating each_dep with coll.items.val !
  subscribe_dep(coll.items, each_dep);
  // update the each-node now, within the current spawn-context.
  update_each_action(state);
}

// vnodes can have a 'd_list' so destroy_rep_children can find it easily.
// avoids having to loop over old 'have_keys' and run d_lists on
// the scopes that are no longer present in 'new_keys',
// which would require scopes to also have a 'key' field.
// it also allows destroy_each to find all the child d_lists easily.

// because vnodes can have a 'd_list', the 'have_keys' map can
// hold vnodes directly and does not need to hold scopes,
// and therefore scopes do not need to hold a 'vnode' either.

// it turns out that scopes are only ever used when spawning -
// the only things that need to hold on to scopes are 'when' and 'each'
// state objects - so they can spawn new children using that scope.
// all other nodes will pass through their scope while spawning.

function update_each_dep(when_dep, state) {
  // runs inside a dep-update transaction.
  // cannot change the dep network during a dep-update transaction,
  // so queue an action to add/remove nodes.
  queue_action(update_each_action, state)
}

function update_each_action(state) {
  // runs in the context of an application update action.
  // TODO FIXME: since update is queued, MUST check if the 'each' is dead (removed)
  const seq = state.coll.items.val; // Collection: always an Array.
  const have_keys = state.have_keys; // Set of { Model._id -> scope }
  const new_keys = {};
  const rep_vnode = state.vnode;
  let next_vnode = rep_vnode.first; // first existing child vnode (can be null)
  for (var i=0; i<seq['length']; i++) {
    const model = seq[i]; // instanceof Model from Collection.
    const key = model._id; // KEY function.
    let inst_vnode;
    if (hasOwn['call'](have_keys, key)) {
      inst_vnode = have_keys[key];
      if (inst_vnode) {
        // retained: move into place if necessary.
        if (inst_vnode === next_vnode) {
          // already in place: advance to the next existing vnode (can be null)
          next_vnode = next_vnode.next_s;
        } else {
          // move the vnode into the correct place.
          move_vnode(rep_vnode, inst_vnode, next_vnode);
        }
      }
    } else {
      // create a child vnode inserted before next_vnode.
      const d_list = [];
      inst_vnode = new_vnode(rep_vnode, next_vnode);
      inst_vnode.d_list = d_list; // attach d_list for destroy_rep_children, destroy_each.
      // clone the scope.
      const scope = state.scope;
      const new_locals = clone_locals(scope.locals);
      // new_scope: { locals, cssm, c_tpl, c_locals, c_cssm, d_list }
      const new_scope = { locals:new_locals, cssm:scope.cssm,
        c_tpl:scope.c_tpl, c_locals:scope.c_locals, c_cssm:scope.c_cssm, d_list:d_list };
      // assign the model into the new scope.
      new_locals[state.bind_as] = model;
      // spawn the contents of the repeat node.
      // ensure: if not inside a spawn-context, set up a new spawn-context here !!
      spawn_tpl_into(state.body_tpl, new_scope, inst_vnode);
    }
    new_keys[key] = inst_vnode;
  }
  state.have_keys = new_keys;
  // destroy all remaining child-of-repeat nodes,
  // because their keys are no longer in the coll.items collection.
  destroy_rep_children(next_vnode);
}

function clone_locals(locals) {
  const new_locals = new Array(locals.length);
  for (let i=0; i<locals.length; i++) new_locals[i] = locals[i];
  return new_locals;
}

function destroy_rep_children(next_child) {
  // runs in the context of an application update action.
  while (next_child) {
    const after = next_child.next_s; // capture before unlink.
    // destroy everything on the d_list for the child.
    // child vnodes of rep_vnode always have a d_list attached.
    run_d_list(next_child.d_list, false); // in_destroy=false.
    // remove the child vnode from its parent.
    unlink_vnode(next_child);
    // remove the DOM contents of the child from the DOM.
    clear_child_nodes(next_child);
    // advance to the next child.
    next_child = after;
  }
}

function destroy_each(each_dep) {
  // runs in the context of an application update action.
  // called from enclosing d_list (will be an 'if' or 'child-of-repeat' d_list)
  // must unsubscribe each_dep from the coll.items.
  const state = each_dep.arg;
  kill_dep(each_dep); // do not receive any more updates.
  remove_dep(state.coll.items, each_dep); // remove each_dep from coll.items fwd list.
  // must loop over child vnodes and run their d_lists.
  // note: (d_list) in_destroy == true : no need to remove child DOM nodes or vnodes.
  for (let child = state.vnode.first; child; child = child.next_s) {
    // destroy everything on the d_list for the child.
    // child vnodes of rep_vnode always have a d_list attached.
    run_d_list(child.d_list, true); // in_destroy=true.
  }
}
