import { debug } from './config'
import { modify_cell, null_dep, queue_action, run_updates } from './cells'
import { Collection, model_fields_to_json, json_to_model_fields } from './models'
import { post_json } from './network'
import { ActionType, Cell, CollectionType, ModelType, Scope, SpawnCtx } from './types';

function act_set_field(sc:SpawnCtx, scope:Scope, event:Event): void {
  const from = sc.resolve_expr(sc, scope) as Cell; // [1] from expr.
  const to = sc.resolve_expr(sc, scope) as Cell;   // [2] to expr.
  // XXX: -2 is "function dep" (HACK - SPECIAL CASE for event.target.value)
  // XXX: but this only works when the "function dep" is top-level i.e. not nested inside an expression.
  const val = from.wait === -2 ? (from.fn as unknown as (e:Event)=>string)(event) : from.val;
  modify_cell(to, val);
}

function act_set_items(sc:SpawnCtx, scope:Scope, _event:Event): void {
  const from = sc.resolve_expr(sc, scope); // [1] from expr.
  const to = sc.resolve_expr(sc, scope);   // [2] to expr.
  if (!(from.val instanceof Collection)) throw 5;
  if (!(to.val instanceof Collection)) throw 5;
  // make the 'to' collection contain all of the models that
  // the 'from' collection currently contains (a shallow snapshot)
  // FIXME: not quite the same thing as a cursor - quick hack for now.
  modify_cell((to.val as CollectionType).items, (from.val as CollectionType).items.val);
}

function act_post(sc:SpawnCtx, scope:Scope, _event:Event): void {
  const url = sc.resolve_expr(sc, scope);    // [1] url expr: string (required)
  const body = sc.resolve_expr(sc, scope);   // [2] body expr: Model (required)
  const to = sc.resolve_expr(sc, scope);     // [3] optional: Model (or expr_null)
  const token = sc.resolve_expr(sc, scope);  // [4] optional: bearer token (or expr_null)
  if (url.val) {
    const req_body = model_fields_to_json(body.val as ModelType)
    post_json(url.val as string, token.val as string|null, req_body, function(res:any) {
      if (to !== null_dep) {
        json_to_model_fields(to.val as ModelType, res, sc)
        const actSlot = (to.val as ModelType).loadAct;
        if (actSlot) {
          // destination model has an @load binding to an action.
          // MUST let the deps update first - queue the action.
          // XXX had to defer action lookup in scope locals,
          // because models spawn before actions do.
          const scope = (to.val as ModelType).scope! // NB! has scope when actSlot>0
          const action = scope.locals[actSlot-1]!.val as ActionType; // 1-bias, NB! must exist.
          queue_action(run_action, action)
        }
        run_updates() // network event - must run updates.
      }
    })
  }
}

export type ActOP = (sc:SpawnCtx, scope:Scope, event:Event) => void;

const act_ops: ActOP[] = [
  act_set_field, // 0
  act_post,      // 1
  act_set_items, // 2
]

export function run_action(action:ActionType, event?:Event): void {
  // NB? bind_event_to_action calls with event argument, but queue_action does not.
  const b_event:Event = event || {} as Event;
  const sc = action.sc, scope = action.scope;
  const saved_ofs = sc.ofs ; sc.ofs = action.tpl; // seek to action tpl!
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
  for (let i=0; i<num_cmds; i++) {
    const cmd_op = sc.tpl[sc.ofs++]!; // [] action op.
    if (debug && !act_ops[cmd_op]) throw 5; // bug: encoding error.
    act_ops[cmd_op]!(sc, scope, b_event);
  }
  sc.ofs = saved_ofs; // restore saved offset.
}
