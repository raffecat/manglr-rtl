import { debug } from './config'
import { modify_cell, null_dep, queue_action, run_updates } from './cells'
import { Collection, model_fields_to_json, json_to_model_fields } from './models'
import { post_json } from './network'
import { ActionType, CollectionType, is_true, ModelType, op, Scope, SpawnCtx } from './types';

// FIXME: when actions evaluate expressions, they "bind" them…
// which leaves behind subscribed Cells in the d_list of the scope.
// TODO: use a non-binding evaluator for action expressions!

function act_set_field(sc: SpawnCtx, scope: Scope): void {
    const from = sc.resolve_expr[sc.tpl[sc.ofs++]!]!(sc, scope); // [1] from expr.
    const to = sc.resolve_expr[sc.tpl[sc.ofs++]!]!(sc, scope);   // [2] to expr.
    if (to.op !== op.is_field) { throw "not mutable"; }
    modify_cell(to, from.val);
}

function act_set_items(sc: SpawnCtx, scope: Scope): void {
    const from = sc.resolve_expr[sc.tpl[sc.ofs++]!]!(sc, scope); // [1] from expr.
    const to = sc.resolve_expr[sc.tpl[sc.ofs++]!]!(sc, scope);   // [2] to expr.
    if (!(from.val instanceof Collection)) throw 5;
    if (!(to.val instanceof Collection)) throw 5;
    // make the 'to' collection contain all of the models that
    // the 'from' collection currently contains (a shallow snapshot)
    // FIXME: not quite the same thing as a cursor - quick hack for now.
    modify_cell((to.val as CollectionType).items, (from.val as CollectionType).items.val);
}

function act_post(sc: SpawnCtx, scope: Scope): void {
    const url = sc.resolve_expr[sc.tpl[sc.ofs++]!]!(sc, scope);    // [1] url expr: string (required)
    const body = sc.resolve_expr[sc.tpl[sc.ofs++]!]!(sc, scope);   // [2] body expr: Model (required)
    const to = sc.resolve_expr[sc.tpl[sc.ofs++]!]!(sc, scope);     // [3] optional: Model (or expr_null)
    const token = sc.resolve_expr[sc.tpl[sc.ofs++]!]!(sc, scope);  // [4] optional: bearer token (or expr_null)
    if (url.val) {
        const req_body = model_fields_to_json(body.val as ModelType)
        post_json(url.val as string, token.val as string | null, req_body, function (res: any) {
            if (to !== null_dep) {
                json_to_model_fields(to.val as ModelType, res, sc)
                const actSlot = (to.val as ModelType).loadAct;
                if (actSlot) {
                    // destination model has an @load binding to an action.
                    // MUST let the deps update first - queue the action.
                    // XXX had to defer action lookup in scope locals,
                    // because models spawn before actions do.
                    const scope = (to.val as ModelType).scope! // NB! has scope when actSlot>0
                    const action = scope.locals[actSlot - 1]!.val as ActionType; // 1-bias, NB! must exist.
                    queue_action(run_action, action)
                }
                run_updates() // network event - must run updates.
            }
        })
    }
}

function act_trigger(sc: SpawnCtx, scope: Scope): void {
    const act_slot = sc.tpl[sc.ofs++]!; // [1] action slot to trigger.
    const act = scope.locals[act_slot]!;
    if (act.op !== op.is_action) throw 5; // OK unless we dynamically select actions?
    run_action(act.val as ActionType);
}

function act_fullscreen(_sc: SpawnCtx, _scope: Scope): void {
    throw 2; // TODO: lost code.
}

function act_play(sc: SpawnCtx, _scope: Scope): void {
    const ref_slot = sc.tpl[sc.ofs++]!; // [1] DOM 'ref' slot.
    throw 2; // TODO: lost code.
}

function act_if(sc: SpawnCtx, scope: Scope): void {
    const cond = sc.resolve_expr[sc.tpl[sc.ofs++]!]!(sc, scope); // [1] cond expr.
    const if_tpl = sc.tpl[sc.ofs++]!;                            // [2] if-body action tpl.
    if (is_true(cond.val)) {
        const saved_ofs = sc.ofs; sc.ofs = sc.tpl[if_tpl]!; // seek to action tpl!
        const num_cmds = sc.tpl[sc.ofs++]!;                  // [1] number of commands.
        for (let i = 0; i < num_cmds; i++) {
            const cmd_op = sc.tpl[sc.ofs++]!;                  // [n] action op.
            act_ops[cmd_op]!(sc, scope);
        }
        sc.ofs = saved_ofs; // restore saved offset.
    }
}

export type ActOP = (sc: SpawnCtx, scope: Scope) => void;

const act_ops: ActOP[] = [
    act_set_field,  // 0
    act_post,       // 1
    act_set_items,  // 2
    act_trigger,    // 3
    act_fullscreen, // 4
    act_play,       // 5
    act_if,         // 6
]

export function run_action(action: ActionType): void {
    const sc = action.sc, scope = action.scope;
    const saved_ofs = sc.ofs; sc.ofs = action.tpl; // seek to action tpl!
    const arg_slot = sc.tpl[sc.ofs++]!; // [0] argument slot for cmds to access.
    if (arg_slot) {
        // bind the bound_arg into the arg-slot for cmds to access.
        // note: there must be at least this action taking up a prior slot,
        // so args will never use slot zero (no need to encode as slot + 1)
        // FIXME: can create sparse-holes in the locals array! (need to pre-fill)
        if (debug && !action.arg) throw 5; // bug: action requires an arg.
        scope.locals[arg_slot] = action.arg!;
    }
    const num_cmds = sc.tpl[sc.ofs++]!; // [1] number of commands.
    for (let i = 0; i < num_cmds; i++) {
        const cmd_op = sc.tpl[sc.ofs++]!; // [] action op.
        act_ops[cmd_op]!(sc, scope);
    }
    sc.ofs = saved_ofs; // restore saved offset.
}
