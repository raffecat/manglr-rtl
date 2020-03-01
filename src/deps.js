// -+-+-+-+-+-+-+-+-+ Dependency Updates -+-+-+-+-+-+-+-+-+

import { debug, log_deps } from './config'

export let in_transaction = null;
export let in_update = false;
let dep_n = 1;
let dirty_roots = [];
let app_queue = [];

export const null_dep = const_dep(null);

export function new_dep(val, fn, arg) {
  const d = { dirty:false, val:val, wait:0, fwd:[], dead:false, fn:(fn||null), arg:(arg||null) };
  if (debug) d.n = dep_n++;
  return d
}

export function const_dep(val) {
  const d = new_dep(val); d.wait = -1; return d
}

export function set_dep(dep, val) {
  if (in_transaction) throw 2; // assert: cannot modify deps inside a transaction.
  if (dep.val !== val && !dep.dead) {
    dep.val = val;
    mark_dirty(dep);
  }
}

export function kill_dep(dep) {
  // This is always allowed - the intent is to mark a sub-tree of deps
  // as dead as soon as possible to avoid unnecessary work.
  // However, there will be cases where some downstream deps are waiting
  // for this dep to update (they have been incremented) and we still
  // need to deliver decrements to those deps.
  dep.dead = true; // do not queue the dep in the future.
  dep.fn = null; // do not react to any more updates.
  dep.arg = null; // GC.
}

function recursive_inc(dep) {
  const old_wait = dep.wait++;
  if (log_deps) console.log("... dep #"+dep.n+" is now waiting for "+dep.wait);
  if (old_wait === 0) {
    // The dep was in ready state, and is now in dirty state.
    // Each downstream dep is now waiting for another upstream dep.
    const fwd = dep.fwd;
    for (let i=0; i<fwd['length']; i++) {
      recursive_inc(fwd[i]);
    }
  }
}

function recursive_dec(dep) {
  if (dep.wait < 1) throw 1; // assert: no decrement without increment first.
  const new_wait = --dep.wait;
  if (log_deps) console.log("... dep #"+dep.n+" is now waiting for "+new_wait);
  if (new_wait === 0) {
    // the dep is now ready to update.
    if (log_deps) console.log("... dep #"+dep.n+" is now ready (firing update)");
    // update the "val" on the dep (optional)
    const fn = dep.fn; if (fn) fn(dep, dep.arg);
    // Each downstream dep is now waiting for one less upstream dep.
    const fwd = dep.fwd;
    for (let i=0; i<fwd['length']; i++) {
      recursive_dec(fwd[i]);
    }
  }
}

export function queue_action(fn, arg) {
  // Queue an application update action - used within transactions
  // to queue work that will modify root deps or change the dep network.
  // Used from event handlers to queue work before doing run_updates()
  app_queue.push({ fn, arg })
}

export function run_updates() {
  // Run an update transaction (mark and sweep pass over dirty deps)
  // Any deps marked dirty dring processing will be queued for another transaction.
  // v1: lock roots in transaction; timer to spawn new deps.
  // v2: deps implement fixups; roots.length can grow during transaction!
  // v3: no fixups; mutations go in app_queue - simple and reliable.
  if (in_update) {
    // this can legitimately happen due to event handlers triggering other events.
    if (debug) console.log("[!] run_updates() ignored - already inside an update");
    return;
  }
  let num_cycles = 1000;
  in_update = true;
  while (dirty_roots['length'] || app_queue['length']) {
    // stop if updates keep triggering new updates.
    // note: update consumes one cycle per nested 'if'/'when' level.
    if (!--num_cycles) {
      console.log("[!] cycle break!");
      break;
    }
    const roots = dirty_roots; dirty_roots = []; // reset to capture dirty deps for next cycle.
    if (log_deps) console.log("[d] update all deps: "+roots['length']);
    // Increment wait counts on dirty deps and their downstream deps.
    // Mark the root deps clean so they will be queued if they become dirty again.
    for (let n=0; n<roots['length']; n++) {
      const dep = roots[n];
      dep.dirty = false; // mark clean (before any updates happen)
      recursive_inc(roots[n]);
    }
    // At this point all deps are clean and can be made dirty again during update.
    // Decrement wait counts on deps and run their update when ready.
    // was true: // NB. roots.length can change due to fix-ups - DO NOT CACHE LENGTH.
    in_transaction = roots; // expose for fix-ups.
    for (let n=0; n<roots['length']; n++) {
      // Each root dep is now waiting for one less upstream (scheduled update is "ready")
      if (log_deps) console.log("... queue decr for dep #"+roots[n].n);
      recursive_dec(roots[n]);
    }
    in_transaction = null;
    if (dirty_roots['length']) {
      console.log("[!] roots added during transaction!");
      break;
    }
    // Run queued application actions (outside the dep-update transaction)
    // In general, these actions will change the dep-network and/or mark
    // some of the root-deps dirty for the next update cycle.
    const queue = app_queue; app_queue = []; // reset to capture new actions.
    if (log_deps) console.log("[d] run queued actions: "+queue['length']);
    for (let n=0; n<queue['length']; n++) {
      const entry = queue[n];
      entry.fn(entry.arg); // XXX: make this a queue of pairs.
    }
  }
  // Go idle.
  in_update = false;
}

export function mark_dirty(dep) {
  // Queue the dep for the next update transaction.
  // POLICY: top-level event handlers must use queue_action() or call run_updates()
  // POLICY: deps are one of: const, root, derived; might want to tag them for debugging.
  if (in_transaction) throw 2; // assert: cannot modify deps inside a transaction.
  if (dep.dirty || dep.dead) return; // early out: already dirty.
  if (dep.wait < 0) return; // do not mark const deps dirty (would corrupt its "wait")
  dep.dirty = true;
  dirty_roots['push'](dep);
}

export function subscribe_dep(src_dep, sub_dep) {
  // Make sub_dep depend on src_dep. Policy: caller will immediately
  // update sub_dep (after subscribing it to ALL of its upstream deps)
  // therefore this does not need to queue sub_dep for updates.
  if (in_transaction) throw 2; // assert: cannot re-arrange deps inside a transaction.
  if (sub_dep.wait < 0) return; // cannot subscribe a const dep (would corrupt its "wait")
  if (debug && (src_dep.dead || sub_dep.dead)) throw 5; // assist debugging.
  var fwd = src_dep.fwd, len = fwd['length'];
  for (var i=0; i<len; i++) {
    if (fwd[i] === sub_dep) throw 2; // assert: already present (would corrupt "wait" by decr. twice)
  }
  fwd[len] = sub_dep; // append.
}

export function remove_dep(src_dep, sub_dep) {
  // Make sub_dep stop depending on src_dep. Policy: this ONLY happens
  // when sub_dep is being destroyed (it will never get updated again)
  if (in_transaction) throw 2; // assert: cannot modify deps inside a transaction.
  const fwd = src_dep.fwd, last = fwd['length'] - 1;
  for (let i=0; i<=last; i++) {
    if (fwd[i] === sub_dep) {
      // Remove sub_dep from the array by moving the last element down.
      fwd[i] = fwd[last]; // spurious if i === last.
      fwd['length'] = last; // discard the last element.
      return; // exit the search loop (no duplicates allowed)
    }
  }
}
