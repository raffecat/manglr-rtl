// -+-+-+-+-+-+-+-+-+ Dependency Updates -+-+-+-+-+-+-+-+-+

import { debug, log_deps } from './config'
import { ActFunc, ActFuncArg, BoundTextState, Cell, CellState, CellVal, is_true, op, QueuedAct, to_text } from './types';
import { EachState, FieldProxyState, ModelType, WhenState, BoundExprState } from "./types";
import { dom_add_class, dom_remove_class } from "./dom";

export let in_transaction: Cell[] | null = null;
export let in_update = false;
let cell_n = 1;
let dirty_roots: Cell[] = [];
let app_queue: QueuedAct[] = [];

export const null_dep = const_cell(null);

export function new_cell(val: CellVal, op: op, arg: CellState | null): Cell {
    const d: Cell = { dirty: false, val: null, wait: 0, fwd: [], dead: false, op: op, state: arg };
    d.val = val; // ^ null first, to ensure common shape if val is an SMI.
    if (debug) d.n = cell_n++;
    return d
}

export function const_cell(val: CellVal): Cell {
    const d = new_cell(val, op.is_const, null); d.wait = -1; return d
}

export function modify_cell(cell: Cell, val: CellVal): void {
    if (in_transaction) throw 2; // assert: cannot modify cells inside a transaction.
    if (cell.val !== val && !cell.dead) {
        cell.val = val;
        mark_dirty(cell);
    }
}

export function kill_cell(cell: Cell): void {
    // Allowed at any time - the intent is to mark a sub-tree of
    // cells dead as soon as possible to avoid unnecessary work.
    // However, there will be cases where some downstream cells are waiting
    // for this cell to update (they have been incremented) and we still
    // need to deliver decrements to those cells.
    cell.dead = true; // do not queue the dep in the future.
    cell.op = op.is_const; // do not react to any more updates.
    cell.state = null; // GC.
}

function recursive_inc(cell: Cell): void {
    const old_wait = cell.wait++;
    if (log_deps) console.log("... cell #" + cell.n + " is now waiting for " + cell.wait);
    if (old_wait === 0) {
        // The cell was in ready state, and is now in dirty state.
        // Each downstream cell must now wait for an additional upstream cell.
        const fwd = cell.fwd, len = fwd.length;
        for (let i = 0; i < len; i++) {
            recursive_inc(fwd[i]!);
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
//     for (let i=0; i<fwd.length; i++) {
//       recursive_dec(fwd[i]!);
//     }
//   }
// }

export function queue_action(fn: ActFunc, arg: ActFuncArg): void {
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
    while (dirty_roots.length || app_queue.length) {
        // stop if updates keep triggering new updates.
        // note: update consumes one cycle per nested 'if'/'when' level.
        if (!--num_cycles) {
            console.log("[!] cycle break!");
            break;
        }
        const roots = dirty_roots; dirty_roots = []; // reset to capture dirty deps for next cycle.
        if (log_deps) console.log("[d] update all deps: " + roots.length);
        // Increment wait counts on dirty deps and their downstream deps.
        // Mark the root deps clean so they will be queued if they become dirty again.
        for (let n = 0; n < roots.length; n++) {
            const dep = roots[n]!;
            dep.dirty = false; // mark clean (before any updates happen)
            recursive_inc(dep);
        }
        // At this point all deps are clean and can be made dirty again during update.
        // Decrement wait counts on deps and run their update when ready.
        // was true: // NB. roots.length can change due to fix-ups - DO NOT CACHE LENGTH.
        in_transaction = roots; // expose for fix-ups.
        for (let n = 0; n < roots.length; n++) {
            // Each root dep is now waiting for one less upstream (scheduled update is "ready")
            if (log_deps) console.log("... queue decr for dep #" + roots[n]!.n);
            decr_and_update(roots[n]!, true);
        }
        in_transaction = null;
        if (dirty_roots.length) {
            console.log("[!] roots added during transaction!");
            break;
        }
        // Run queued application actions (outside the dep-update transaction)
        // In general, these actions will change the dep-network and/or mark
        // some of the root-deps dirty for the next update cycle.
        const queue = app_queue; app_queue = []; // reset to capture new actions.
        if (log_deps) console.log("[d] run queued actions: " + queue.length);
        for (let n = 0; n < queue.length; n++) {
            const entry = queue[n]!;
            entry.fn(entry.arg as any); // XXX: make this a queue of pairs.
        }
    }
    // Go idle.
    in_update = false;
}

export function mark_dirty(dep: Cell): void {
    // Queue the dep for the next update transaction.
    // POLICY: top-level event handlers must use queue_action() or call run_updates()
    // POLICY: deps are one of: const, root, derived; might want to tag them for debugging.
    if (dep.dirty || dep.dead) return; // early out: already dirty.
    if (in_transaction) throw 2; // assert: cannot modify deps inside a transaction.
    if (dep.wait < 0) return; // do not mark const deps dirty (would corrupt its "wait")
    dep.dirty = true;
    dirty_roots.push(dep);
}

export function subscribe_dep(from: Cell, to: Cell): void {
    // Make sub_dep depend on src_dep. Policy: caller will immediately
    // update sub_dep (after subscribing it to ALL of its upstream deps)
    // therefore this does not need to queue sub_dep for updates.
    if (in_transaction) throw 2; // assert: cannot re-arrange deps inside a transaction.
    if (to.wait < 0) return; // cannot subscribe a const dep (would corrupt its "wait")
    if (debug && (from.dead || to.dead)) throw 5; // assist debugging.
    const fwd = from.fwd, len = fwd.length;
    for (let i = 0; i < len; i++) {
        if (fwd[i] === to) throw 2; // assert: already present (would corrupt "wait" by decr. twice)
    }
    fwd.push(to); // append.
}

export function remove_fwd(from: Cell, to: Cell): void {
    // Make sub_dep stop depending on src_dep.
    if (in_transaction) throw 2; // assert: cannot modify deps inside a transaction.
    const fwd = from.fwd, last = fwd.length - 1; // -1 if empty
    for (let i = 0; i <= last; i++) { // 0<=-1 if empty (skip)
        if (fwd[i] === to) {
            // Remove sub_dep from the array by moving the last element-pair down.
            fwd[i] = fwd[last]!; // spurious if i === last (re-assigns itself)
            fwd.length = last; // discard the last element.
            return; // exit the search loop (no duplicates allowed)
        }
    }
}

export function decr_and_update(from: Cell, is_dirty: boolean): void {
    if (from.wait < 1) throw 1; // assert: no decrement without increment first.
    const new_wait = --from.wait;
    if (new_wait > 0) {
        // this cell isn't ready to update yet.
        // however, the other remaining upstream(s) may pass is_dirty=false:
        if (is_dirty) from.dirty = true; // make sure this cell updates when wait drops to zero.
        if (log_deps) console.log("... cell #" + from.n + " is now waiting for " + new_wait);
        return;
    }
    // the cell is ready to update now.
    if (from.dirty || is_dirty) {
        from.dirty = false; // reset.
        is_dirty = true; // default true, unless op detects equal value.
        if (log_deps) console.log("... cell #" + from.n + " is now ready (dirty - applying update)");
        if (from.op > op.last_non_update_op) {
            const old_val = from.val;
            const new_val = update_expr(from);
            if (from.wait > 0) return; // suspend and wait again (due to graph changes)
            is_dirty = (new_val !== old_val);
            from.val = new_val;
        }
    } else {
        if (log_deps) console.log("... cell #" + from.n + " is now ready (clean - skipping update)");
    }
    const fwd = from.fwd, len = fwd.length;
    for (let i = 0; i < len; i++) {
        decr_and_update(fwd[i]!, is_dirty);
    }
}

export function update_expr(cell: Cell): CellVal {
    switch (cell.op) {
        case op.field_proxy: {
            // subscribes to two different upstreams, both of which are now at wait==0:
            // (a) a Cell that yields a Model or null.
            // (b) a Cell that is a field of the current Model being proxied.
            // we don't know which one 'from' is, so we must ignore it.
            const state = cell.state as FieldProxyState;
            const new_model = state.left.val as ModelType | null; // new upstream Model|null
            if (new_model !== state.model) {
                const must_stop = change_field_proxy_model(cell, state, new_model);
                if (must_stop) return false;
            }
            const field = state.field;
            return field !== null ? field.val : null;
        }
        case op.concat: {
            // concatenate text fragments from each input cell.
            // has "no value" until every fragment "has value",
            // which makes it safe to bind to DOM src props, etc.
            const args = cell.state as Cell[];
            let text = "";
            for (let i = 0; i < args.length; i++) {
                const val = args[i]!.val;
                if (val === null) return null; // has "no value".
                text += to_text(val);
            }
            return text;
        }
        case op.ternary: {
            // XXX stays subscribed to both sides at all times (receives and ignores spurious updates)
            const args = cell.state as Cell[];
            const cond = args[0]!.val;
            return (cond === null) ? null : is_true(cond) ? args[1]!.val : args[2]!.val;
        }
        case op.elvis: {
            const args = cell.state as Cell[];
            const cond = args[0]!.val
            return (cond === null) ? null : is_true(cond) ? args[0]!.val : args[1]!.val;
        }
        case op.equals: {
            const args = cell.state as Cell[];
            const left = args[0]!.val, right = args[1]!.val
            return (left !== null && right !== null) ? (left === right) : null
        }
        case op.not_equal: {
            const args = cell.state as Cell[];
            const left = args[0]!.val, right = args[1]!.val
            return (left !== null && right !== null) ? (left !== right) : null
        }
        case op.ge: {
            const args = cell.state as Cell[];
            const left = args[0]!.val, right = args[1]!.val
            return (left !== null && right !== null) ? (left >= right) : null
        }
        case op.le: {
            const args = cell.state as Cell[];
            const left = args[0]!.val, right = args[1]!.val
            return (left !== null && right !== null) ? (left <= right) : null
        }
        case op.gt: {
            const args = cell.state as Cell[];
            const left = args[0]!.val, right = args[1]!.val
            return (left !== null && right !== null) ? (left > right) : null
        }
        case op.lt: {
            const args = cell.state as Cell[];
            const left = args[0]!.val, right = args[1]!.val
            return (left !== null && right !== null) ? (left < right) : null
        }
        case op.add: {
            const args = cell.state as Cell[];
            const left = args[0]!.val, right = args[1]!.val
            return (left !== null && right !== null) ? ((left as number) + (right as number)) : null;
        }
        case op.sub: {
            const args = cell.state as Cell[];
            const left = args[0]!.val, right = args[1]!.val
            return (left !== null && right !== null) ? ((left as number) - (right as number)) : null;
        }
        case op.mul: {
            const args = cell.state as Cell[];
            const left = args[0]!.val, right = args[1]!.val
            return (left !== null && right !== null) ? ((left as number) * (right as number)) : null;
        }
        case op.div: {
            const args = cell.state as Cell[];
            const left = args[0]!.val, right = args[1]!.val
            return (left !== null && right !== null) ? ((left as number) / (right as number)) : null;
        }
        case op.mod: {
            const args = cell.state as Cell[];
            const left = args[0]!.val, right = args[1]!.val
            return (left !== null && right !== null) ? ((left as number) % (right as number)) : null;
        }
        case op.or: {
            const args = cell.state as Cell[];
            const left = args[0]!.val, right = args[1]!.val
            if (left === true || right === true) return true; // short-circuit.
            return (left !== null || right !== null) ? (left || right) : null;
        }
        case op.and: {
            const args = cell.state as Cell[];
            const left = args[0]!.val, right = args[1]!.val
            if (left === false || right === false) return false; // short-circuit.
            return (left !== null && right !== null) ? (left && right) : null;
        }
        case op.not: {
            const arg = cell.state as Cell
            return (arg.val === null) ? null : !is_true(arg.val);
        }
        case op.is_empty: {
            // can only be applied to a Collection (never "no value")
            const arg = cell.state as Cell
            return !(arg.val as ModelType[]).length;
        }
        case op.not_empty: {
            // can only be applied to a Collection (never "no value")
            const arg = cell.state as Cell
            return !!(arg.val as ModelType[]).length;
        }
        case op.count: {
            // can only be applied to a Collection (never "no value")
            const arg = cell.state as Cell
            return (arg.val as ModelType[]).length;
        }
        case op.bound_when: {
            // runs inside a dep-update transaction.
            // cannot change the dep network during a dep-update transaction,
            // so queue an action to add/remove nodes (if dep value has changed)
            const state = cell.state as WhenState;
            const new_val = is_true(state.cond_cell.val);
            if (new_val !== state.in_doc) {
                queue_action(state.update_when, state);
            }
            return false; // stays false (leaf)
        }
        case op.bound_each: {
            // runs inside a dep-update transaction.
            // cannot change the dep network during a dep-update transaction,
            // so queue an action to add/remove nodes.
            const state = cell.state as EachState;
            queue_action(state.update_each, state);
            return false; // stays false (leaf)
        }
        case op.bound_text: {
            // update the DOM Text Node from the expr_dep's value.
            const state = cell.state as BoundTextState;
            state.dom_node.data = to_text(state.expr_dep.val);
            return false;
        }
        case op.bound_attr: {
            // update a DOM Element attribute from an input dep's value.
            const state = cell.state as BoundExprState;
            const val = to_text(state.expr_dep.val);
            if (val) {
                state.dom_node['setAttribute'](state.name, val);
            } else {
                state.dom_node['removeAttribute'](state.name);
            }
            return false;
        }
        case op.bound_prop_text: {
            const state = cell.state as BoundExprState;
            // update a DOM Element property from an input dep's value.
            const dom = state.dom_node, name = state.name;
            const val = state.expr_dep.val;
            // avoid page re-flows if the value hasn't actually changed.
            // avoid setting to empty-string e.g. src="" can load this page!
            const new_val = val != null ? to_text(val) : null;
            if ((dom as any)[name] !== new_val) {
                (dom as any)[name] = new_val;
            }
            return false;
        }
        case op.bound_prop_bool: {
            // update a DOM Element property from an input dep's value.
            const state = cell.state as BoundExprState;
            const dom = state.dom_node, name = state.name;
            const val = is_true(state.expr_dep.val);
            // avoid page re-flows if the value hasn't actually changed.
            if ((dom as any)[name] !== val) {
                (dom as any)[name] = val;
            }
            return false;
        }
        case op.bound_class: {
            // single class bound to a boolean expression.
            const state = cell.state as BoundExprState;
            const val = is_true(state.expr_dep.val);
            (val ? dom_add_class : dom_remove_class)(state.dom_node, state.name);
            return false;
        }
        case op.bound_style_text: {
            // update a DOM Element style from an input dep's value.
            const state = cell.state as BoundExprState;
            (state.dom_node.style as any)[state.name] = to_text(state.expr_dep.val);
            return false; // stays false (leaf)
        }
        default:
            throw 2;
    }
}

function change_field_proxy_model(cell: Cell, state: FieldProxyState, new_model: ModelType | null): boolean {
    // upstream model has changed.
    let must_stop: boolean = false
    const new_field = new_model !== null ? new_model.fields[state.name]! as Cell : null;
    if (debug && new_field === undefined) throw 5; // MUST exist.
    const old_field = state.field;
    if (new_field !== old_field) {
        // upstream field has actually changed:
        state.field = new_field;
        // must unsubscribe from the old field-cell.
        if (old_field !== null) {
            // SAFE: all upstreams are at wait==0 and downstream cells are waiting for US.
            remove_fwd(old_field, cell);
        }
        // subscribe to the new field-cell and copy the value.
        if (new_field !== null) {
            new_field.fwd.push(cell);
            // CHECK: new upstream might be queued (wait > 0)
            // in that case, this cell to suspend and wait again.
            if (new_field.wait > 0) {
                cell.wait++;
                must_stop = true;
            }
        }
    }
    return must_stop;
}
