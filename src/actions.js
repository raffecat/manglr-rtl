import { debug } from './config'
import { set_dep, null_dep, queue_action, run_updates } from './deps'
import { Collection, model_fields_to_json, json_to_model_fields } from './models'
import { post_json } from './network'

function act_set_field(sc, scope, event) { // (sc, scope, event)
  const from = sc.resolve_expr(sc, scope); // [1] from expr.
  const to = sc.resolve_expr(sc, scope);   // [2] to expr.
  // XXX: -2 is "function dep" (HACK - SPECIAL CASE for event.target.value)
  // XXX: but this only works when the "function dep" is top-level i.e. not nested inside an expression.
  const val = from.wait === -2 ? from.fn(event) : from.val;
  set_dep(to, val);
}

function act_set_items(sc, scope) { // (sc, scope, event)
  const from = sc.resolve_expr(sc, scope); // [1] from expr.
  const to = sc.resolve_expr(sc, scope);   // [2] to expr.
  if (!(from instanceof Collection)) throw 5;
  if (!(to instanceof Collection)) throw 5;
  // make the 'to' collection contain all of the models that
  // the 'from' collection currently contains (a snapshot)
  // not quite the same thing as a cursor - quick hack for now.
  set_dep(to.items, from.items.val);
}

function act_post(sc, scope) { // (sc, scope, event)
  const url = sc.resolve_expr(sc, scope);   // [1] url expr.
  const body = sc.resolve_expr(sc, scope);  // [2] body expr.
  const to = sc.resolve_expr(sc, scope);    // [3] optional: to expr.
  const token = sc.resolve_expr(sc, scope); // [4] optional: bearer token expr.
  if (url.val) {
    const req_body = model_fields_to_json(body)
    post_json(url.val, token.val, req_body, function(res) {
      if (to !== null_dep) {
        json_to_model_fields(to, res, sc)
        const actSlot = to.loadAct;
        if (actSlot) {
          // destination model has an @load binding to an action.
          // MUST let the deps update first - queue the action.
          // XXX had to defer action lookup in scope locals,
          // because models spawn before actions do.
          const action = to.scope.locals[actSlot-1]; // 1-bias.
          queue_action(run_action, action)
        }
        run_updates() // network event - must run updates.
      }
    })
  }
}

const act_ops = [
  act_set_field, // 0
  act_post,      // 1
  act_set_items, // 2
]

export function run_action(action, event) {
  // action { sc, scope, tpl, arg }
  const b_event = event || {};
  const sc = action.sc, scope = action.scope;
  const saved_ofs = sc.ofs ; sc.ofs = action.tpl; // seek to action tpl!
  const arg_slot = sc.tpl[sc.ofs++]; // [0] argument slot for cmds to access.
  if (arg_slot) {
    // bind the bound_arg into the arg-slot for cmds to access.
    if (debug && !action.arg) throw 5; // bug: action requires an arg.
    scope.locals[arg_slot-1] = action.arg;
  }
  const num_cmds = sc.tpl[sc.ofs++]; // [1] number of commands.
  for (let i=0; i<num_cmds; i++) {
    const cmd_op = sc.tpl[sc.ofs++]; // [] action op.
    if (debug && !act_ops[cmd_op]) throw 5; // bug: encoding error.
    act_ops[cmd_op](sc, scope, b_event);
  }
  sc.ofs = saved_ofs; // restore saved offset.
}
