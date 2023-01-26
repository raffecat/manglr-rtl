// -+-+-+-+-+-+-+-+-+ Dependency Updates -+-+-+-+-+-+-+-+-+

import { debug, log_deps } from './config'
import { decr_and_update } from './expr_update';
import { ActFunc, ActFuncArg, Cell, CellFunc, CellFuncArg, CellVal, QueuedAct } from './types';

export let in_transaction: Cell[]|null = null;
export let in_update = false;
let cell_n = 1;
let dirty_roots:Cell[] = [];
let app_queue:QueuedAct[] = [];

export const null_dep = const_cell(null);

export function new_cell(val:CellVal, fn:CellFunc|null, arg:CellFuncArg|null): Cell {
  const d:Cell = { dirty:false, val:null, wait:0, fwd:[], dead:false, fn:fn, state:arg };
  d.val = val; // ^ null first, to ensure common shape if val is an SMI.
  if (debug) d.n = cell_n++;
  return d
}

export function const_cell(val:CellVal): Cell {
  const d = new_cell(val, null, null); d.wait = -1; return d
}

export function modify_cell(cell:Cell, val:CellVal): void {
  if (in_transaction) throw 2; // assert: cannot modify cells inside a transaction.
  if (cell.val !== val && !cell.dead) {
    cell.val = val;
    mark_dirty(cell);
  }
}

export function kill_cell(cell:Cell): void {
  // Allowed at any time - the intent is to mark a sub-tree of
  // cells dead as soon as possible to avoid unnecessary work.
  // However, there will be cases where some downstream cells are waiting
  // for this cell to update (they have been incremented) and we still
  // need to deliver decrements to those cells.
  cell.dead = true; // do not queue the dep in the future.
  cell.fn = null; // do not react to any more updates.
  cell.state = null; // GC.
}

function recursive_inc(cell:Cell): void {
  const old_wait = cell.wait++;
  if (log_deps) console.log("... cell #"+cell.n+" is now waiting for "+cell.wait);
  if (old_wait === 0) {
    // The cell was in ready state, and is now in dirty state.
    // Each downstream cell must now wait for an additional upstream cell.
    const fwd = cell.fwd, len = fwd.length;
    for (let i=0; i<len; i += 2) {
      recursive_inc(fwd[i] as Cell);
    }
  }
}

// function recursive_dec(cell:Cell): void {
//   if (cell.wait < 1) throw 1; // assert: no decrement without increment first.
//   const new_wait = --cell.wait;
//   if (log_deps) console.log("... cell #"+cell.n+" is now waiting for "+new_wait);
//   if (new_wait === 0) {
//     // the cell is now ready to update.
//     if (log_deps) console.log("... cell #"+cell.n+" is now ready (firing update)");
//     // update the "val" on the cell (optional)
//     const fn = cell.fn; if (fn) fn(cell, cell.state as any);
//     // Each downstream cell is now waiting for one less upstream cell.
//     const fwd = cell.fwd;
//     for (let i=0; i<fwd['length']; i++) {
//       recursive_dec(fwd[i]!);
//     }
//   }
// }

export function queue_action(fn:ActFunc, arg:ActFuncArg): void {
  // Queue an application update action - used within transactions
  // to queue work that will modify root deps or change the dep network.
  // Used from event handlers to queue work before doing run_updates()
  app_queue.push({ fn, arg })
}

export function run_updates(): void {
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
      const dep = roots[n]!;
      dep.dirty = false; // mark clean (before any updates happen)
      recursive_inc(dep);
    }
    // At this point all deps are clean and can be made dirty again during update.
    // Decrement wait counts on deps and run their update when ready.
    // was true: // NB. roots.length can change due to fix-ups - DO NOT CACHE LENGTH.
    in_transaction = roots; // expose for fix-ups.
    for (let n=0; n<roots['length']; n++) {
      // Each root dep is now waiting for one less upstream (scheduled update is "ready")
      if (log_deps) console.log("... queue decr for dep #"+roots[n]!.n);
      decr_and_update(roots[n]!, true);
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
      const entry = queue[n]!;
      entry.fn(entry.arg as any); // XXX: make this a queue of pairs.
    }
  }
  // Go idle.
  in_update = false;
}

export function mark_dirty(dep:Cell): void {
  // Queue the dep for the next update transaction.
  // POLICY: top-level event handlers must use queue_action() or call run_updates()
  // POLICY: deps are one of: const, root, derived; might want to tag them for debugging.
  if (dep.dirty || dep.dead) return; // early out: already dirty.
  if (in_transaction) throw 2; // assert: cannot modify deps inside a transaction.
  if (dep.wait < 0) return; // do not mark const deps dirty (would corrupt its "wait")
  dep.dirty = true;
  dirty_roots['push'](dep);
}

export function subscribe_dep(src_dep:Cell, sub_dep:Cell): void {
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

export function remove_fwd(from:Cell, to:Cell): void {
  // Make sub_dep stop depending on src_dep.
  if (in_transaction) throw 2; // assert: cannot modify deps inside a transaction.
  const fwd = from.fwd, last = fwd['length'] - 2; // -2 if empty
  for (let i = 0; i <= last; i += 2) { // 0<=-2 if empty (skip)
    if (fwd[i] === to) {
      // Remove sub_dep from the array by moving the last element-pair down.
      fwd[i] = fwd[last]!; // spurious if i === last (re-assigns itself)
      fwd[i+1] = fwd[last+1]!; // spurious if i === last (re-assigns itself)
      fwd['length'] = last; // discard the last element.
      return; // exit the search loop (no duplicates allowed)
    }
  }
}
