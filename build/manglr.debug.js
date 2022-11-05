/* <~> Manglr 0.1.33 | by Andrew Towers | MIT License | https://github.com/raffecat/manglr-rtl */
(function () {
  'use strict';

  var hasOwn = Object['prototype']['hasOwnProperty'];

  // -+-+-+-+-+-+-+-+-+ VNodes -+-+-+-+-+-+-+-+-+
  //
  //                  VNode [parent]
  //                      | 
  //                      | up
  //                      | 
  //     prev_s ------- VNode ------- next_s
  //            __________|_________
  //           |                    |
  //           |                    |
  // [first] VNode ----- ~~~ ---- VNode [last]
  //
  // A VNode can contain:
  // dom - a DOM Node (Text or Element) OR
  // first, last, d_list - linked list of child VNodes (optional d_list)

  function new_vnode(up, before) { // before can be null (append)
    var vnode = { up:null, next_s:null, prev_s:null, first:null, last:null, dom:null, d_list:null };
    if (up) { link_before(up, vnode, before); } // insert in 'up' before 'before'.
    return vnode;
  }

  function unlink_vnode(node) {
    // remove the vnode from its parent vnode's chain of children.
    var parent = node.up;
    if (parent) {
      var behind = node.prev_s, ahead = node.next_s;
      if (behind) { behind.next_s = ahead; } else { parent.first = ahead; }
      if (ahead) { ahead.prev_s = behind; } else { parent.last = behind; }
      node.up = null; node.prev_s = null; node.next_s = null;
    } else {
      { throw 5; } // no parent!
    }
  }

  function link_before(parent, node, ahead) { // ahead can be null (append)
    if ( node.up) { throw 5; } // already in a chain!
    node.up = parent;
    var behind = ahead ? ahead.prev_s : parent.last;
    node.prev_s = behind;
    node.next_s = ahead;
    if (behind) { behind.next_s = node; } else { parent.first = node; }
    if (ahead) { ahead.prev_s = node; } else { parent.last = node; }
  }

  function move_vnode(parent, node, ahead) { // ahead can be null (append)
    // unlink the vnode from its siblings.
    unlink_vnode(node);
    // insert it back in before next_vnode.
    link_before(parent, node, ahead);
    // move the vnode's dom nodes into the correct place.
    // this means finding every DOM node that is a child of this vnode,
    // and re-inserting those before first_dom_node_after(vnode).
    // ...
  }

  function clear_child_nodes(vnode) {
    // remove the DOM contents of a vnode (for 'if' vnodes)
    var dom = vnode.dom;
    if (dom !== null) {
      dom.parentNode.removeChild(dom);
      vnode.dom = null; // GC.
      return; // no need to recurse beyond DOM nodes!
    }
    for (var child = vnode.first; child; ) {
      var next_s = child.next_s; // save before clear.
      clear_child_nodes(child);
      child.up = child.next_s = child.prev_s = null; // GC.
      child = next_s;
    }
    vnode.first = vnode.last = null; // reset children list.
  }

  function first_dom_node_in_tree(vnode) {
    // search all contents of these nodes first.
    for (; vnode; vnode = vnode.next_s) {
      // if (debug) console.log("... search node:", vnode);
      var found = vnode.dom;
      if (found) { return found; }
      var subtree = vnode.first;
      if (subtree) {
        { console.log("... entering sub-tree:", vnode); }
        var found$1 = first_dom_node_in_tree(subtree);
        { console.log("... leaving sub-tree:", vnode); }
        if (found$1) { return found$1; }
      }
    }
  }

  function insert_dom_nodes(fragment, vnode) {
    // insert the DOM nodes inside 'fragment' into the DOM at 'vnode',
    // which is typically a 'when' or 'child-of-each' node, but can also
    // be a DOM vnode during initial page render.
    { console.log("insert_dom_nodes:", fragment, vnode); }
    for (;;) {
      if (vnode.dom) {
        // arrived at a DOM node above the node being populated (which means there
        // were not any sibling DOM nodes to find within the same parent DOM node) -
        // or the vnode being populated is itself a DOM node.
        { console.log("... INSERTED at the parent DOM node:", vnode); }
        vnode.dom.appendChild(fragment);
        return;
      }
      // always ignore the children of the starting vnode (want a node _after_ those)
      // always ignore the `dom` of the starting node (want a node _after_ this one)
      // check all siblings that follow the starting node.
      var found = first_dom_node_in_tree(vnode.next_s); // note: argument can be null.
      if (found) {
        { console.log("... FOUND:", found); }
        found.parentNode.insertBefore(fragment, found);
        return;
      }
      // didn't find a dom node in any later sibling of the vnode.
      // move up one level and check all siblings that follow the parent.
      //  A [B] C D    <-- vnode.up is [B] - will start from [C] - unless [B] is DOM node (found parent)
      //     1 [2] 3   <-- starting vnode [2] - have checked [3]
      vnode = vnode.up;
      { console.log("... go up to:", vnode); }
      if (!vnode) {
        { console.log("... CANNOT INSERT - no parent DOM node found."); }
        return;
      }
    }
  }

  // Thoughts:
  // A vnode is created for every DOM Node (Text and Element)
  // A vnode is created for each 'if', 'repeat' and 'child-of-repeat' (not for components!)
  // An 'if' node is CLEARED when the condition becomes false (destroy children)
  // - does not have a DOM node (if nodes never do)
  // - does have children (DOM VNodes and other if/repeat VNodes)
  // - does have a scope -> destroy the scope (models, containers, all bound deps!)
  // A 'repeat' node functions as a placeholder when empty.
  // - does have a scope -> on destroy, 
  // A 'child-of-repeat' is keyed on the Model id (vector of binds is immutable)
  // A component has a scope, i.e. models, collections, bound deps; a VNode does not!
  // Any components inside an 'if' or 'child-of-repeat' need to be attached to it!
  // Prefer to append component Scope to parent scope-list (a component, if, child-of-repeat)
  // A scope-list never changes:
  // - if: destroy scope-list when false; spawn new scope-list when true; destroy scope-list on parent destroy [**]
  // - rep: spawn new scope-list on insert; destroy scope-list on remove; destroy scope-list on parent destroy [**]
  // - com: spawn new scope-list on spawn; destroy scope-list on parent destroy [ALWAYS in a scope-list]
  // - actually appears to be a destroy list (list of destroy closures?)
  // - so 'if' or 'child-of-repeat' start their own d_list; all other nodes pass it through.
  // - when a component spawns a Model, Collection or Dep - append destructor to d_list.
  // - d_list is not part of VNode - it belongs to private IfState or RepeatChild tracker objects.
  // - tracker objects are placed into Deps along with an update function.

  // -+-+-+-+-+-+-+-+-+ Dependency Updates -+-+-+-+-+-+-+-+-+

  var in_transaction = null;
  var in_update = false;
  var dep_n = 1;
  var dirty_roots = [];
  var app_queue = [];

  var null_dep = const_dep(null);

  function new_dep(val, fn, arg) {
    var d = { dirty:false, val:val, wait:0, fwd:[], dead:false, fn:(fn||null), arg:(arg||null) };
    { d.n = dep_n++; }
    return d
  }

  function const_dep(val) {
    var d = new_dep(val); d.wait = -1; return d
  }

  function set_dep(dep, val) {
    if (in_transaction) { throw 2; } // assert: cannot modify deps inside a transaction.
    if (dep.val !== val && !dep.dead) {
      dep.val = val;
      mark_dirty(dep);
    }
  }

  function kill_dep(dep) {
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
    var old_wait = dep.wait++;
    { console.log("... dep #"+dep.n+" is now waiting for "+dep.wait); }
    if (old_wait === 0) {
      // The dep was in ready state, and is now in dirty state.
      // Each downstream dep is now waiting for another upstream dep.
      var fwd = dep.fwd;
      for (var i=0; i<fwd['length']; i++) {
        recursive_inc(fwd[i]);
      }
    }
  }

  function recursive_dec(dep) {
    if (dep.wait < 1) { throw 1; } // assert: no decrement without increment first.
    var new_wait = --dep.wait;
    { console.log("... dep #"+dep.n+" is now waiting for "+new_wait); }
    if (new_wait === 0) {
      // the dep is now ready to update.
      { console.log("... dep #"+dep.n+" is now ready (firing update)"); }
      // update the "val" on the dep (optional)
      var fn = dep.fn; if (fn) { fn(dep, dep.arg); }
      // Each downstream dep is now waiting for one less upstream dep.
      var fwd = dep.fwd;
      for (var i=0; i<fwd['length']; i++) {
        recursive_dec(fwd[i]);
      }
    }
  }

  function queue_action(fn, arg) {
    // Queue an application update action - used within transactions
    // to queue work that will modify root deps or change the dep network.
    // Used from event handlers to queue work before doing run_updates()
    app_queue.push({ fn: fn, arg: arg });
  }

  function run_updates() {
    // Run an update transaction (mark and sweep pass over dirty deps)
    // Any deps marked dirty dring processing will be queued for another transaction.
    // v1: lock roots in transaction; timer to spawn new deps.
    // v2: deps implement fixups; roots.length can grow during transaction!
    // v3: no fixups; mutations go in app_queue - simple and reliable.
    if (in_update) {
      // this can legitimately happen due to event handlers triggering other events.
      { console.log("[!] run_updates() ignored - already inside an update"); }
      return;
    }
    var num_cycles = 1000;
    in_update = true;
    while (dirty_roots['length'] || app_queue['length']) {
      // stop if updates keep triggering new updates.
      // note: update consumes one cycle per nested 'if'/'when' level.
      if (!--num_cycles) {
        console.log("[!] cycle break!");
        break;
      }
      var roots = dirty_roots; dirty_roots = []; // reset to capture dirty deps for next cycle.
      { console.log("[d] update all deps: "+roots['length']); }
      // Increment wait counts on dirty deps and their downstream deps.
      // Mark the root deps clean so they will be queued if they become dirty again.
      for (var n=0; n<roots['length']; n++) {
        var dep = roots[n];
        dep.dirty = false; // mark clean (before any updates happen)
        recursive_inc(roots[n]);
      }
      // At this point all deps are clean and can be made dirty again during update.
      // Decrement wait counts on deps and run their update when ready.
      // was true: // NB. roots.length can change due to fix-ups - DO NOT CACHE LENGTH.
      in_transaction = roots; // expose for fix-ups.
      for (var n$1=0; n$1<roots['length']; n$1++) {
        // Each root dep is now waiting for one less upstream (scheduled update is "ready")
        { console.log("... queue decr for dep #"+roots[n$1].n); }
        recursive_dec(roots[n$1]);
      }
      in_transaction = null;
      if (dirty_roots['length']) {
        console.log("[!] roots added during transaction!");
        break;
      }
      // Run queued application actions (outside the dep-update transaction)
      // In general, these actions will change the dep-network and/or mark
      // some of the root-deps dirty for the next update cycle.
      var queue = app_queue; app_queue = []; // reset to capture new actions.
      { console.log("[d] run queued actions: "+queue['length']); }
      for (var n$2=0; n$2<queue['length']; n$2++) {
        var entry = queue[n$2];
        entry.fn(entry.arg); // XXX: make this a queue of pairs.
      }
    }
    // Go idle.
    in_update = false;
  }

  function mark_dirty(dep) {
    // Queue the dep for the next update transaction.
    // POLICY: top-level event handlers must use queue_action() or call run_updates()
    // POLICY: deps are one of: const, root, derived; might want to tag them for debugging.
    if (in_transaction) { throw 2; } // assert: cannot modify deps inside a transaction.
    if (dep.dirty || dep.dead) { return; } // early out: already dirty.
    if (dep.wait < 0) { return; } // do not mark const deps dirty (would corrupt its "wait")
    dep.dirty = true;
    dirty_roots['push'](dep);
  }

  function subscribe_dep(src_dep, sub_dep) {
    // Make sub_dep depend on src_dep. Policy: caller will immediately
    // update sub_dep (after subscribing it to ALL of its upstream deps)
    // therefore this does not need to queue sub_dep for updates.
    if (in_transaction) { throw 2; } // assert: cannot re-arrange deps inside a transaction.
    if (sub_dep.wait < 0) { return; } // cannot subscribe a const dep (would corrupt its "wait")
    if ( (src_dep.dead || sub_dep.dead)) { throw 5; } // assist debugging.
    var fwd = src_dep.fwd, len = fwd['length'];
    for (var i=0; i<len; i++) {
      if (fwd[i] === sub_dep) { throw 2; } // assert: already present (would corrupt "wait" by decr. twice)
    }
    fwd[len] = sub_dep; // append.
  }

  function remove_dep(src_dep, sub_dep) {
    // Make sub_dep stop depending on src_dep. Policy: this ONLY happens
    // when sub_dep is being destroyed (it will never get updated again)
    if (in_transaction) { throw 2; } // assert: cannot modify deps inside a transaction.
    var fwd = src_dep.fwd, last = fwd['length'] - 1;
    for (var i=0; i<=last; i++) {
      if (fwd[i] === sub_dep) {
        // Remove sub_dep from the array by moving the last element down.
        fwd[i] = fwd[last]; // spurious if i === last.
        fwd['length'] = last; // discard the last element.
        return; // exit the search loop (no duplicates allowed)
      }
    }
  }

  // -+-+-+-+-+-+-+-+-+ Models -+-+-+-+-+-+-+-+-+

  // A model is a set of named fields of known types (statically determined)
  // Create a Dep for each field. Bindings subscribe to those deps.
  // When loading data, load per-field into those deps (coerce to known type)

  var g_model = 1;

  function Model() {
    this._id = 'm'+(g_model++);
    this._key = '';
    this.fields = {};
  }

  function Collection(scope) {
    this._id = 'c'+(g_model++);
    this.scope = scope; // for spawning new models.
    this.items = new_dep([]);
  }

  function model_fields_to_json(model) {
    if ( !(model instanceof Model)) { throw 5; }
    var fields = model.fields;
    var req = {};
    for (var key in fields) {
      if (hasOwn.call(fields, key)) {
        var field = fields[key];
        if (field instanceof Model) {
          req[key] = model_fields_to_json(field);
        } else if (field instanceof Collection) {
          var list = [];
          var items = field.items;
          for (var i=0; i<items.length; i++) {
            list[i] = model_fields_to_json(items[i]);
          }
          req[key] = list;
        } else {
          req[key] = field.val; // dep.
        }
      }
    }
    return req
  }

  function json_to_model_fields(model, values, sc) {
    if ( !(model instanceof Model)) { throw 5; }
    var fields = model.fields;
    for (var f_name in fields) {
      if (hasOwn.call(fields, f_name)) {
        var field = fields[f_name];
        var val = values[f_name];
        if (field instanceof Model) {
          json_to_model_fields(field, val, sc);
        } else if (field instanceof Collection) {
          // index existing models in the collection by key (_id)
          var old_models = field.items.val; // dep.
          var known_keys = {}; // known keys in THIS collection (local keys)
          for (var i=0; i<old_models.length; i++) {
            var model$1 = old_models[i];
            known_keys[model$1._key] = model$1;
          }
          // update existing models; create models for new keys.
          var src_elems = val instanceof Array ? val : [];
          var new_items = [];
          for (var i$1=0; i$1<src_elems.length; i$1++) {
            var elem = src_elems[i$1];
            var key = '$'+String(elem.id||i$1); // TODO FIXME assuming key on "id" (allow config)
            var model$2 = known_keys[key];
            if (!model$2) {
              var saved_ofs = sc.ofs ; sc.ofs = field.model_tpl; // seek to Model template!
              sc.ofs++; // skip E_MODEL (TODO: remove it from model-tpl?)
              model$2 = sc.spawn_model_tpl(sc, field.scope); // create Model instance with defaults.
              sc.ofs = saved_ofs; // restore saved offset.
              model$2._key = key; // save for known_keys later - [bug] DO NOT REPLACE _id !!
              known_keys[key] = model$2; // protect against duplicate keys.
            }
            json_to_model_fields(model$2, elem, sc);
            new_items[i$1] = model$2; // use the order in the received data.
          }
          set_dep(field.items, new_items);
        } else {

          // FIXME: MUST cast value to model field type!
          // BUG here: (post) if the field is missing from the response,
          // we end up setting fields to 'undefined' (e.g. flag becomes 'undefined')
          var t = typeof field.val; // HACK: old value tells us the type!
          if (t === 'boolean') { val = !! val; }
          else if (t === 'string') { val = (val || '').toString(); }
          else if (t === 'number') { val = + val; }
          else { val = null; }

          set_dep(field, val);
        }
      }
    }
  }

  function post_json(url, token, data, done) {
    var tries = 0;
    url = window.location.protocol+"//"+window.location.host+url;
    post();
    function retry(reason, msg) {
      tries++;
      if (tries > 0) { return done({ error:'too many retries', reason:reason, message:msg }) }
      var delay = Math.min(tries * 250, 2000); // back-off.
      setTimeout(post, delay);
    }
    function post() {
      var req = new XMLHttpRequest();
      req.onreadystatechange = function () {
        if (!req || req.readyState !== 4) { return; }
        var status = req.status, result = req.responseText;
        req.onreadystatechange = null;
        req = null;
        if (status === 0) { return done({ error:'offline', offline:true }); }
        if (status !== 200) { return retry('http', status); }
        var res;
        try { res = JSON.parse(result); } catch (err) { return retry('json', String(err)) }
        if (!res) { return retry('null', ''); }
        if (res.retry) { return retry('retry', res.retry); }
        return done(res);
      };
      req.open('POST', url, true);
      req.setRequestHeader("Content-Type", "application/json");
      if (token) { req.setRequestHeader("Authorization", "bearer "+token); }
      req.send(JSON.stringify(data));
    }
  }

  function act_set_field(sc, scope, event) { // (sc, scope, event)
    var from = sc.resolve_expr(sc, scope); // [1] from expr.
    var to = sc.resolve_expr(sc, scope);   // [2] to expr.
    // XXX: -2 is "function dep" (HACK - SPECIAL CASE for event.target.value)
    // XXX: but this only works when the "function dep" is top-level i.e. not nested inside an expression.
    var val = from.wait === -2 ? from.fn(event) : from.val;
    set_dep(to, val);
  }

  function act_set_items(sc, scope) { // (sc, scope, event)
    var from = sc.resolve_expr(sc, scope); // [1] from expr.
    var to = sc.resolve_expr(sc, scope);   // [2] to expr.
    if (!(from instanceof Collection)) { throw 5; }
    if (!(to instanceof Collection)) { throw 5; }
    // make the 'to' collection contain all of the models that
    // the 'from' collection currently contains (a snapshot)
    // not quite the same thing as a cursor - quick hack for now.
    set_dep(to.items, from.items.val);
  }

  function act_post(sc, scope) { // (sc, scope, event)
    var url = sc.resolve_expr(sc, scope);   // [1] url expr.
    var body = sc.resolve_expr(sc, scope);  // [2] body expr.
    var to = sc.resolve_expr(sc, scope);    // [3] optional: to expr.
    var token = sc.resolve_expr(sc, scope); // [4] optional: bearer token expr.
    if (url.val) {
      var req_body = model_fields_to_json(body);
      post_json(url.val, token.val, req_body, function(res) {
        if (to !== null_dep) {
          json_to_model_fields(to, res, sc);
          var actSlot = to.loadAct;
          if (actSlot) {
            // destination model has an @load binding to an action.
            // MUST let the deps update first - queue the action.
            // XXX had to defer action lookup in scope locals,
            // because models spawn before actions do.
            var action = to.scope.locals[actSlot-1]; // 1-bias.
            queue_action(run_action, action);
          }
          run_updates(); // network event - must run updates.
        }
      });
    }
  }

  var act_ops = [
    act_set_field, // 0
    act_post,      // 1
    act_set_items ];

  function run_action(action, event) {
    // action { sc, scope, tpl, arg }
    var b_event = event || {};
    var sc = action.sc, scope = action.scope;
    var saved_ofs = sc.ofs ; sc.ofs = action.tpl; // seek to action tpl!
    var arg_slot = sc.tpl[sc.ofs++]; // [0] argument slot for cmds to access.
    if (arg_slot) {
      // bind the bound_arg into the arg-slot for cmds to access.
      if ( !action.arg) { throw 5; } // bug: action requires an arg.
      scope.locals[arg_slot-1] = action.arg;
    }
    var num_cmds = sc.tpl[sc.ofs++]; // [1] number of commands.
    for (var i=0; i<num_cmds; i++) {
      var cmd_op = sc.tpl[sc.ofs++]; // [] action op.
      if ( !act_ops[cmd_op]) { throw 5; } // bug: encoding error.
      act_ops[cmd_op](sc, scope, b_event);
    }
    sc.ofs = saved_ofs; // restore saved offset.
  }

  function is_true(val) {
    return !!(val instanceof Array ? val['length'] : val);
  }

  function to_text(val) {
    return (val == null || val instanceof Object) ? '' : (''+val);
  }

  // DEPS

  function bind_to_args(sc, scope, len, update_fn) {
    var args = [];
    var dep = new_dep(null, update_fn, args);
    { console.log(("[e] " + (update_fn.name) + ":"), args); }
    var ins = 0;
    while (len--) {
      var src = resolve_expr(sc, scope);
      args['push'](src);
      if (src.wait >= 0) { src.fwd.push(dep); ++ins; } // depend on.
    }
    update_fn(dep, args);
    if (ins) { scope.d_list['push'](destroy_args, dep); } else { dep.wait = -1; } // constant.
    return dep;
  }

  function bind_one_arg(sc, scope, update_fn, is_collection) {
    var arg = resolve_expr(sc, scope);
    if (is_collection) {
      // collection-type expressions always result in a Collection instance (not a Cell)
      if ( !(arg instanceof Collection)) { throw 5; }
      arg = arg.items;
    }
    { console.log(("[e] " + (update_fn.name) + ":"), arg); }
    var dep = new_dep(null, update_fn, arg);
    if (arg.wait >= 0) {
      arg.fwd.push(dep); // depend on.
      scope.d_list['push'](destroy_one_arg, dep);
    } else {
      dep.wait = -1; // constant.
    }
    update_fn(dep, arg);
    return dep;
  }

  function destroy_args(dep) {
    for (var i = 0, list = dep.arg; i < list.length; i += 1) {
      var arg = list[i];

      remove_dep(arg, dep);
    }
  }

  function destroy_one_arg(dep) {
    remove_dep(dep.arg, dep);
  }

  // CONCAT

  function expr_concat(sc, scope) {
    // create a dep that updates when arguments have updated.
    var len = sc.tpl[sc.ofs++];
    return bind_to_args(sc, scope, len, update_concat);
  }

  function update_concat(dep, args) {
    // concatenate text fragments from each input dep.
    // has "no value" until every fragment "has value",
    // which makes it safe to bind to DOM src props, etc.
    var text = "";
    var has_value = true;
    for (var i=0; i<args['length']; i++) {
      var val = args[i].val;
      if (val == null) { has_value = false; } // has "no value".
      text += to_text(val);
    }
    dep.val = has_value ? text : null;
  }

  // TERNARY

  function expr_ternary(sc, scope) { return bind_to_args(sc, scope, 3, update_ternary) }
  function update_ternary(dep, args) {
    // has "no value" until the condition "has value".
    var cond = args[0].val;
    dep.val = (cond === null) ? null : is_true(cond) ? args[1].val : args[2].val;
  }

  // EQUALS

  function expr_equals(sc, scope) { return bind_to_args(sc, scope, 2, update_equals) }
  function update_equals(dep, args) {
    var left = args[0].val, right = args[1].val;
    dep.val = (left !== null && right !== null) ? (left === right) : null;
  }

  // NOT_EQUAL

  function expr_not_equal(sc, scope) { return bind_to_args(sc, scope, 2, update_not_equal) }
  function update_not_equal(dep, args) {
    var left = args[0].val, right = args[1].val;
    dep.val = (left !== null && right !== null) ? (left !== right) : null;
  }

  // GREATER_EQUAL

  function expr_ge(sc, scope) { return bind_to_args(sc, scope, 2, update_ge) }
  function update_ge(dep, args) {
    var left = args[0].val, right = args[1].val;
    dep.val = (left !== null && right !== null) ? (left >= right) : null;
  }

  // LESS_EQUAL

  function expr_le(sc, scope) { return bind_to_args(sc, scope, 2, update_le) }
  function update_le(dep, args) {
    var left = args[0].val, right = args[1].val;
    dep.val = (left !== null && right !== null) ? (left <= right) : null;
  }

  // GREATER

  function expr_gt(sc, scope) { return bind_to_args(sc, scope, 2, update_gt) }
  function update_gt(dep, args) {
    var left = args[0].val, right = args[1].val;
    dep.val = (left !== null && right !== null) ? (left > right) : null;
  }

  // LESS

  function expr_lt(sc, scope) { return bind_to_args(sc, scope, 2, update_lt) }
  function update_lt(dep, args) {
    var left = args[0].val, right = args[1].val;
    dep.val = (left !== null && right !== null) ? (left < right) : null;
  }

  // ADD

  function expr_add(sc, scope) { return bind_to_args(sc, scope, 2, update_add) }
  function update_add(dep, args) {
    var left = args[0].val, right = args[1].val;
    dep.val = (left !== null && right !== null) ? (left + right) : null;
  }

  // SUBTRACT

  function expr_sub(sc, scope) { return bind_to_args(sc, scope, 2, update_sub) }
  function update_sub(dep, args) {
    var left = args[0].val, right = args[1].val;
    dep.val = (left !== null && right !== null) ? (left - right) : null;
  }

  // MULTIPLY

  function expr_multiply(sc, scope) { return bind_to_args(sc, scope, 2, update_multiply) }
  function update_multiply(dep, args) {
    var left = args[0].val, right = args[1].val;
    dep.val = (left !== null && right !== null) ? (left * right) : null;
  }

  // DIVIDE

  function expr_div(sc, scope) { return bind_to_args(sc, scope, 2, update_div) }
  function update_div(dep, args) {
    var left = args[0].val, right = args[1].val;
    dep.val = (left !== null && right !== null) ? (left / right) : null;
  }

  // MODULO

  function expr_mod(sc, scope) { return bind_to_args(sc, scope, 2, update_mod) }
  function update_mod(dep, args) {
    var left = args[0].val, right = args[1].val;
    dep.val = (left !== null && right !== null) ? (left % right) : null;
  }

  // OR

  function expr_or(sc, scope) { return bind_to_args(sc, scope, 2, update_or) }
  function update_or(dep, args) {
    var left = args[0].val, right = args[1].val;
    if (left === true || right === true) { dep.val = true; return } // short-circuit.
    dep.val = (left !== null || right !== null) ? (left || right) : null;
  }

  // AND

  function expr_and(sc, scope) { return bind_to_args(sc, scope, 2, update_and) }
  function update_and(dep, args) {
    var left = args[0].val, right = args[1].val;
    if (left === false || right === false) { dep.val = false; return } // short-circuit.
    dep.val = (left !== null && right !== null) ? (left && right) : null;
  }

  // NOT

  function expr_not(sc, scope) { return bind_one_arg(sc, scope, update_not) }
  function update_not(dep, arg) {
    dep.val = (arg.val === null) ? null : !is_true(arg.val);
  }

  // EMPTY - COLLECTIONS

  function expr_is_empty(sc, scope) {
    return bind_one_arg(sc, scope, update_is_empty, true); // is_collection.
  }

  function update_is_empty(dep, arg) {
    // can only be applied to a Collection (never "no value")
    dep.val = ! arg.val.length;
  }

  function expr_not_empty(sc, scope) {
    return bind_one_arg(sc, scope, update_not_empty, true); // is_collection.
  }

  function update_not_empty(dep, arg) {
    // can only be applied to a Collection (never "no value")
    dep.val = !! arg.val.length;
  }

  function expr_count(sc, scope) {
    return bind_one_arg(sc, scope, update_count, true); // is_collection.
  }

  function update_count(dep, arg) {
    // can only be applied to a Collection (never "no value")
    dep.val = arg.val.length;
  }

  // CONSTANTS

  function expr_null() {
    // expression op=0 is "no binding" (const null value)
    return null_dep;
  }

  function expr_const(sc) {
    // syms contains javascript strings, numbers, booleans (maybe also lists, objects)
    var val = sc.syms[sc.tpl[sc.ofs++]];
    { console.log("[e] const value: "+val); }
    return const_dep(val);
  }

  // LOCALS

  function expr_local(sc, scope) {
    var n = sc.tpl[sc.ofs++];
    var dep = scope.locals[n];
    { console.log(("[e] local " + n + ":"), dep); }
    return dep;
  }

  // MODEL FIELDS

  function expr_field(sc, scope) {
    var name = sc.syms[sc.tpl[sc.ofs++]];
    var left = resolve_expr(sc, scope);
    { console.log(("[e] field '" + name + "' from:"), left); }
    // model-type expressions always result in a Model instance (not a Cell)
    if (left instanceof Model) {
      var dep = left.fields[name];
      if ( !dep) { throw 5; } // MUST exist.
      return dep;
    }
    { throw 5; } // MUST exist.
  }

  // MODEL

  // local slots hold one of: Model, Collection, Action, Cell [dep]

  // local model slots always hold actual Model instances (not Cells)
  // likewise, nested model fields always hold actual Model instances.
  // component props of model-type bind the outer Model instance into the inner component's slot.

  // each [non-model] field of a Model is a distinct, live Cell [root-dep]
  // component props bind outer Cell instances into the inner component's slots.
  // DOM attribute bindings subscribe to those Cell instances directly.

  function spawn_model_tpl(sc, scope) {
    var mod = new Model();
    // XXX cannot look up the action in local slots here, because
    // XXX models are spawned before actions are! (make actions into tpls anyway...)
    // TODO FIXME: all model templates have loadAct - nested models and collections don't need it!!
    mod.loadAct = sc.tpl[sc.ofs++];
    mod.scope = scope; // to spawn collection models; to look up load-action.
    // XXX for now, compiler emits inline init values for every field.
    var num = sc.tpl[sc.ofs++];
    while (num--) {
      var name = sc.syms[sc.tpl[sc.ofs++]];
      // XXX: timing issue here - can copy from init-dep before it "has value" (a non-null value)
      var init = resolve_expr(sc, scope); // XXX wasteful new const deps all the time.
      if (init instanceof Model || init instanceof Collection) {
        mod.fields[name] = init; // not wrapped in a field-value dep.
      } else {
        mod.fields[name] = new_dep(init.val); // ALWAYS a root-dep.
      }
      { // extra info for Inspector.
        mod.fields[name].d_field = name;
        mod.fields[name].d_model = mod;
      }
    }
    return mod;
  }

  function expr_l_model(sc, scope) {
    // inline model template follows for local models.
    return spawn_model_tpl(sc, scope);
  }

  function expr_l_collection(sc, scope) {
    var col = new Collection(scope);
    var tpl_id = sc.tpl[sc.ofs++];
    col.model_tpl = sc.tpl[tpl_id]; // look up tpl in template index table (could patch out)
    return col;
  }

  // ACTIONS

  // an Action slot holds a closure that captures the local scope (slots)

  function expr_action(sc, scope) {
    var refresh = sc.tpl[sc.ofs++]; // [1] auto refresh (ms)
    var tpl_id = sc.tpl[sc.ofs++];  // [2] action tpl index.
    var act_tpl = sc.tpl[tpl_id];   // look up tpl in template index table (could patch out)
    // action { sc, scope, tpl, arg }
    var act = { sc:sc, scope:scope, tpl:act_tpl, arg:null };
    { act.d_is = 'action'; }
    if (refresh > 0) { make_timer(act, refresh); }
    return act;
  }

  // TIMERS

  function make_timer(act, refresh) {
    var timer = { act:act, timer:0, dead:false };
    { timer.d_is = 'timer'; }
    var timer_fun = bind_auto_refresh(timer);
    act.scope.d_list['push'](stop_auto_refresh, timer);
    timer.timer = setInterval(timer_fun, refresh);
    queue_action(run_action, act);
  }

  function bind_auto_refresh(timer) {
    return function() {
      if (timer.dead) { return; }
      queue_action(run_action, timer.act);
      run_updates(); // timer event - must run updates.
    }
  }

  function stop_auto_refresh(timer) {
    timer.dead = true;
    if (timer.timer) {
      clearInterval(timer.timer); timer.timer = 0;
    }
  }

  // EVENT TARGET

  function expr_event_target() { // (sc, scope)
    // XXX: not a dep, not a constant !!!
    // XXX: needs to be evaluated "pull mode" instead.
    var dep = new_dep("", update_event_target); // ALWAYS a root-dep.
    dep.wait = -2; // MARK as a "function dep" (HACK - SPECIAL CASE)
    return dep;
  }

  function update_event_target(event) {
    return event.target.value;
  }

  // EXPR

  var expr_ops = [
    expr_null,          // 0 - get null dep.
    expr_const,         // 1 - get syms constant as a [new] dep.
    expr_local,         // 2 - get local slot (dep, model, collection)
    expr_field,         // 3 - get field of a model.
    expr_concat,        // 4 - concatenate text.
    expr_equals,        // 5 - left == right.
    expr_not,           // 6 - ! arg.
    expr_l_model,       // 7 - create local model.
    expr_l_collection,  // 8 - create local collection.
    expr_ternary,       // 9 - cond ? left : right.
    expr_action,        // 10 - create local action (like a closure over locals)
    expr_event_target,  // 11 - event.target generator (*** not a dep, not a constant !!!)
    expr_not_equal,     // 12 - left ~= right.
    expr_multiply,      // 13 - left * right.
    expr_is_empty,      // 14 - collection is empty.
    expr_not_empty,     // 15 - collection is not empty.
    expr_ge,            // 16 - left >= right.
    expr_le,            // 17 - left <= right.
    expr_gt,            // 18 - left > right.
    expr_lt,            // 19 - left < right.
    expr_count,         // 20 - count collection size.
    expr_sub,           // 21 - left - right.
    expr_add,           // 22 - left + right.
    expr_div,           // 23 - left / right.
    expr_mod,           // 24 - left % right.
    expr_or,            // 25 - left OR right.
    expr_and ];

  function resolve_expr(sc, scope) {
    if (in_transaction) { throw 2; } // assert: cannot fwd.push inside a transaction.
    var op = sc.tpl[sc.ofs++];
    if ( !expr_ops[op]) {
      console.log("[bad] expr_op");
    }
    return expr_ops[op](sc, scope);
  }

  // destroy lists - contain pairs of (function, object) to run when a
  // context is destroyed, i.e. 'when' and 'child-of-each' vnodes.

  // when a d_list is run (always associated with some vnode), the caller
  // will also clear all DOM nodes under that vnode and remove that vnode
  // from its parent; therefore d_list functions don't need to remove
  // any DOM nodes or vnodes they control if in_destroy == true (when
  // in_destroy is false, there is no such caller to remove any nodes.)

  function d_list_add(d_list, func, arg) {
    d_list['push'](func, arg);
  }

  function run_d_list(d_list, in_destroy) {
    // runs in the context of an application update action.
    // CONSIDER: d_list could be pairs of (fn, arg) to avoid making
    // deps for things just to add them to the d_list!
    for (var i=0; i < d_list['length']; i += 2) {
      d_list[i](d_list[i+1], in_destroy);
    }
    d_list['length'] = 0;
  }

  // import { debug } from './config'

  // -+-+-+-+-+-+-+-+-+ DOM Manipulation -+-+-+-+-+-+-+-+-+

  function dom_add_class(elem, cls) {
    var clist = elem.classList;
    if (clist) {
      // classList is fast and avoids spurious reflows.
      clist['add'](cls);
    } else {
      // check if the class is already present.
      var classes = elem['className'];
      var list = classes['split'](' ');
      for (var i=0; i<list['length']; i++) {
        if (list[i] === cls) { return; }
      }
      // cls was not found: add the class.
      elem['className'] = classes + ' ' + cls;
    }
  }

  function dom_remove_class(elem, cls) {
    var clist = elem.classList;
    if (clist) {
      // classList is fast and avoids spurious reflows.
      clist['remove'](cls);
    } else {
      var list = elem['className']['split'](' ');
      var dirty = false;
      for (var i=0; i<list['length']; i++) {
        if (list[i] === cls) {
          list['splice'](i--, 1);
          dirty = true;
        }
      }
      // avoid setting className unless we actually changed it.
      if (dirty) { elem['className'] = list['join'](' '); }
    }
  }

  // sc { tpl, ofs, syms, fragment }
  // attr_func(sc, dom_node, scope, cls)

  var attr_ops = [
    attr_const_attr,       // 0 // A_CONST_TEXT (setAttribute)
    attr_const_class,      // 1 // A_CONST_CLASS (class name)
    attr_bound_attr,       // 2 // A_BOUND_ATTR (setAttribute)
    attr_bound_prop_text,  // 3 // A_BOUND_PROP_TEXT (DOM property)
    attr_bound_prop_bool,  // 4 // A_BOUND_PROP_BOOL (DOM property)
    attr_bound_class,      // 5 // A_BOUND_CLASS (class name)
    attr_bound_style_prop, // 6 // A_BOUND_STYLE_TEXT (DOM property)
    attr_on_event ];

  function bind_to_expr(name, expr_dep, dom_node, scope, update_func) {
    var state = { name:name, dom_node:dom_node, expr_dep:expr_dep };
    var bind_dep = new_dep(expr_dep.val, update_func, state);
    subscribe_dep(expr_dep, bind_dep);
    d_list_add(scope.d_list, destroy_bound_expr, bind_dep);
    update_func(bind_dep, state); // update now.
  }

  function destroy_bound_expr(bind_dep) {
    var state = bind_dep.arg;
    remove_dep(state.expr_dep, bind_dep); // remove from 'fwd' list.
  }

  // -+-+-+-+-+-+-+-+-+ Literal Attribute / Class -+-+-+-+-+-+-+-+-+

  function attr_const_attr(sc, dom_node) {
    // used for custom attributes such as aria-role.
    var attr = sc.syms[sc.tpl[sc.ofs++]];
    var text = sc.syms[sc.tpl[sc.ofs++]];
    { console.log("[a] literal attribute: "+attr+" = "+text); }
    dom_node['setAttribute'](attr, text);
  }

  function attr_const_class(sc, dom_node, scope, cls) {
    var name = sc.syms[sc.tpl[sc.ofs++]];
    { console.log("[a] literal class: "+name); }
    cls['push'](name);
  }

  // -+-+-+-+-+-+-+-+-+ Bound Attribute -+-+-+-+-+-+-+-+-+

  function attr_bound_attr(sc, dom_node, scope) {
    // bound attribute.
    var name = sc.syms[sc.tpl[sc.ofs++]];
    var expr_dep = resolve_expr(sc, scope);
    { console.log("[a] bound attribute: "+name, expr_dep); }
    if (expr_dep.wait<0) {
      // constant value.
      var val = to_text(expr_dep.val);
      if (val) { dom_node['setAttribute'](name, val); }
    } else {
      // varying value.
      bind_to_expr(name, expr_dep, dom_node, scope, update_bound_attr);
    }
  }

  function update_bound_attr(bind_dep, state) {
    // update a DOM Element attribute from an input dep's value.
    var val = to_text(state.expr_dep.val);
    if (val) {
      state.dom_node['setAttribute'](state.name, val);
    } else {
      state.dom_node['removeAttribute'](state.name);
    }
  }

  // -+-+-+-+-+-+-+-+-+ Bound Text Property -+-+-+-+-+-+-+-+-+

  function attr_bound_prop_text(sc, dom_node, scope) {
    // bound property.
    var name = sc.syms[sc.tpl[sc.ofs++]];
    var expr_dep = resolve_expr(sc, scope);
    { console.log("[a] bound property: "+name, expr_dep); }
    if (expr_dep.wait<0) {
      // constant value.
      // avoid setting to empty-string e.g. src="" can load this page!
      var val = expr_dep.val;
      if (val != null) { dom_node[name] = to_text(val); }
    } else {
      // varying value.
      bind_to_expr(name, expr_dep, dom_node, scope, update_bound_prop_text);
    }
  }

  function update_bound_prop_text(bind_dep, state) {
    // update a DOM Element property from an input dep's value.
    var dom = state.dom_node, name = state.name;
    var val = state.expr_dep.val;
    // avoid page re-flows if the value hasn't actually changed.
    // avoid setting to empty-string e.g. src="" can load this page!
    var new_val = val != null ? to_text(val) : null;
    if (dom[name] !== new_val) {
      dom[name] = new_val;
    }
  }

  // -+-+-+-+-+-+-+-+-+ Bound Bool Property -+-+-+-+-+-+-+-+-+

  function attr_bound_prop_bool(sc, dom_node, scope) {
    // bound property.
    var name = sc.syms[sc.tpl[sc.ofs++]];
    var expr_dep = resolve_expr(sc, scope);
    { console.log("[a] bound property: "+name, expr_dep); }
    if (expr_dep.wait<0) {
      // constant value.
      dom_node[name] = is_true(expr_dep.val);
    } else {
      // varying value.
      bind_to_expr(name, expr_dep, dom_node, scope, update_bound_prop_bool);
    }
  }

  function update_bound_prop_bool(bind_dep, state) {
    // update a DOM Element property from an input dep's value.
    var dom = state.dom_node, name = state.name;
    var val = is_true(state.expr_dep.val);
    // avoid page re-flows if the value hasn't actually changed.
    if (dom[name] !== val) {
      dom[name] = val;
    }
  }

  // -+-+-+-+-+-+-+-+-+ Bound Class -+-+-+-+-+-+-+-+-+

  function attr_bound_class(sc, dom_node, scope, cls) {
    var name = sc.syms[sc.tpl[sc.ofs++]];
    var expr_dep = resolve_expr(sc, scope);
    { console.log("[a] bound property: "+name, expr_dep); }
    if (expr_dep.wait<0) {
      // constant value.
      if (is_true(expr_dep.val)) {
        cls['push'](name);
      }
    } else {
      // varying value.
      bind_to_expr(name, expr_dep, dom_node, scope, update_bound_class);
    }
  }

  function update_bound_class(bind_dep, state) {
    // single class bound to a boolean expression.
    var val = is_true(state.expr_dep.val);
    (val ? dom_add_class : dom_remove_class)(state.dom_node, state.name);
  }

  // -+-+-+-+-+-+-+-+-+ Bound Style -+-+-+-+-+-+-+-+-+

  function attr_bound_style_prop(sc, dom_node, scope) {
    var name = sc.syms[sc.tpl[sc.ofs++]];
    var expr_dep = resolve_expr(sc, scope);
    { console.log("[a] bound style: "+name, expr_dep); }
    if (expr_dep.wait<0) {
      // constant value.
      dom_node.style[name] = to_text(expr_dep.val);
    } else {
      // varying value.
      bind_to_expr(name, expr_dep, dom_node, scope, update_bound_style_text);
    }
  }

  function update_bound_style_text(bind_dep, state) {
    // update a DOM Element style from an input dep's value.
    state.dom_node.style[state.name] = to_text(state.expr_dep.val);
  }

  // -+-+-+-+-+-+-+-+-+ On Event -+-+-+-+-+-+-+-+-+

  function attr_on_event(sc, dom_node, scope) {
    var name = sc.syms[sc.tpl[sc.ofs++]];    // [1] name of the event to bind.
    var slot = sc.tpl[sc.ofs++];             // [2] local action slot.
    var bound_arg = resolve_expr(sc, scope); // [3] bound argument to the action.
    var ref_act = scope.locals[slot];
    // action { sc, scope, tpl, arg } - arg should be null (not yet bound)
    // make a copy of the action closure, but with args actually bound.
    var action = { sc:sc, scope:ref_act.scope, tpl:ref_act.tpl, arg:bound_arg };
    { action.d_is = 'action'; }
    { console.log(("[a] on event: '" + name + "' n=" + slot + ":"), action); }
    var handler = bind_event_to_action(name, action);
    dom_node.addEventListener(name, handler, false);
    d_list_add(scope.d_list, unbind_event_handler, { dom_node: dom_node, name: name, handler: handler });
  }

  function bind_event_to_action(name, action) {
    // XXX prefer not to use a closure for this - delegate to document.body
    // and register in a global map - unregister in d_list.
    function action_event_handler(event) {
      { console.log(("[] event '" + name + "': "), event); }
      run_action(action, event);
      run_updates(); // dom event - must run updates.
    }
    return action_event_handler;
  }

  function unbind_event_handler(b) {
    b.dom_node.removeEventListener(b.name, b.handler, false);
  }

  // sc { tpl, ofs, syms, fragment, spawn_children }

  // -+-+-+-+-+-+-+-+-+ Text Node -+-+-+-+-+-+-+-+-+

  function create_text(sc, parent) {
    // create a DOM Text node with literal text.
    var vnode = new_vnode(parent, null);
    var text = sc.syms[sc.tpl[sc.ofs++]];
    { console.log("[s] createTextNode:", text); }
    // create a DOM TextNode.
    // always inside a spawn-context: append to document fragment.
    var dom_node = document.createTextNode(text);
    sc.fragment.appendChild(dom_node);
    vnode.dom = dom_node; // attach dom_node to vnode.
  }

  // -+-+-+-+-+-+-+-+-+ Bound Text Node -+-+-+-+-+-+-+-+-+

  function create_bound_text(sc, parent, scope) {
    // create a DOM Text node with a bound expression.
    var vnode = new_vnode(parent, null);
    var expr_dep = resolve_expr(sc, scope); // always a dep.
    var text = to_text(expr_dep.val);
    { console.log("[s] createTextNode:", expr_dep, text); }
    // create a DOM TextNode.
    // always inside a spawn-context: append to document fragment.
    var dom_node = document.createTextNode(text);
    sc.fragment.appendChild(dom_node);
    vnode.dom = dom_node; // attach dom_node to vnode.
    // watch expr_dep for changes unless it is a const-dep.
    if (expr_dep.wait >= 0) {
      var state = { dom_node:dom_node, expr_dep:expr_dep };
      var text_dep = new_dep(expr_dep.val, update_bound_text, state);
      subscribe_dep(expr_dep, text_dep);
      d_list_add(scope.d_list, destroy_bound_text, text_dep);
      update_bound_text(text_dep, state); // update now.
    }
  }

  function update_bound_text(text_dep, state) {
    // update the DOM Text Node from the expr_dep's value.
    state.dom_node.data = to_text(state.expr_dep.val);
  }

  function destroy_bound_text(text_dep) {
    var state = text_dep.arg;
    remove_dep(state.expr_dep, text_dep); // remove from 'fwd' list.
  }

  // -+-+-+-+-+-+-+-+-+ Element Node -+-+-+-+-+-+-+-+-+

  function create_element(sc, parent, scope) {
    // create a DOM Element node with bound attributes.
    var vnode = new_vnode(parent, null);
    var tag = sc.syms[sc.tpl[sc.ofs++]];
    { console.log("[s] createElement:", tag); }
    // create a DOM Element.
    // always inside a spawn-context: append to document fragment.
    var dom_node = document.createElement(tag);
    dom_node.setAttribute(scope.cssm, ""); // tag with css_m.
    sc.fragment.appendChild(dom_node);
    vnode.dom = dom_node; // attach dom_node to vnode.
    // bind Element properties to bound expressions.
    var nattrs = sc.tpl[sc.ofs++];
    var cls = [];
    // apply attributes and bindings (grouped by type)
    while (nattrs--) {
      var op = sc.tpl[sc.ofs++];
      if ( !attr_ops[op]) {
        console.log("[bad] attr_op");
      }
      attr_ops[op](sc, dom_node, scope, cls);
    }
    // must append, because attr_cond_class can update first.
    if (cls.length) {
      var ocls = dom_node.className;
      dom_node.className = (ocls?ocls+' ':ocls) + cls.join(' '); // ugh messy.
    }
    // spawn any child nodes inside this DOM element.
    var saved_fragment = sc.fragment; sc.fragment = dom_node;
    sc.spawn_children(sc, vnode, scope);
    sc.fragment = saved_fragment;
  }

  // sc { tpl, ofs, syms, fragment, spawn_children }

  // -+-+-+-+-+-+-+-+-+ Component Spawn -+-+-+-+-+-+-+-+-+

  function create_component(sc, parent, outer_scope) {
    // spawn a component instance:
    var tpl_id = sc.tpl[sc.ofs++]; //[0] = tpl index of component to create.
    var c_tpl = sc.tpl[sc.ofs++]; // [1] = tpl index of component tag's contents (0 if empty)
    var tpl_ofs = sc.tpl[tpl_id]; // look up tpl in template index table (could patch out)
    var cssm = sc.syms[sc.tpl[tpl_ofs]]; // tpl[0] symbol for CSS namespacing.
    var nins = sc.tpl[tpl_ofs+1]; // tpl[1] is number of bindings.
    var ndefs = sc.tpl[tpl_ofs+2]; // tpl[2] is number of local slots.
    { console.log(("[s] create component: " + cssm + ", tpl=" + tpl_id + ", contents=" + c_tpl + ", nins=" + nins + ", ndefs=" + ndefs)); }
    // component binds: one expression per input.
    // each binding (evaluated in the outer scope) becomes a local in the new scope.
    var locals = [];
    var lp = 0;
    while (nins--) {
      // [2...] = expressions bound to component inputs.
      locals[lp++] = resolve_expr(sc, outer_scope);
    }
    // note: contents of component tag (c_tpl) must be spawned using the outer locals!
    // note: components pass through the 'd_list' of the enclosing 'when' or 'each'.
    // new_scope: { locals, cssm, c_tpl, c_locals, c_cssm, d_list }
    var new_scope = { locals:locals, cssm:cssm,
      c_tpl:c_tpl, c_locals:outer_scope.locals, c_cssm:outer_scope.cssm, d_list:outer_scope.d_list };
    // component locals: bind expressions inside the component.
    // note: compiler MUST ensure locals are bound before they are used,
    // i.e. each resolve_expr can only access previous local slots!
    // push context: save tpl-ofs and set to component's template.
    var saved_ofs = sc.ofs ; sc.ofs = tpl_ofs+3; // tpl[3] is the first local binding.
    while (ndefs--) {
      locals[lp++] = resolve_expr(sc, new_scope);
    }
    // component body: spawn vnodes that make up the component body.
    sc.spawn_children(sc, parent, new_scope);
    // pop context: restore saved tpl-ofs.
    sc.ofs = saved_ofs;
  }

  // sc { tpl, ofs, syms, fragment, spawn_children }

  var g_sc = null;
  var in_spawn = false;

  // note: to avoid circular import, spawn_children cannot be imported here!

  function init_sc(tpl, syms, spawn_children) {
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
    };
  }

  function spawn_tpl_into(tpl_id, scope, into_vnode) {
    // spawn a template: a sequence of child nodes.
    // called at page load, then incrementally as 'when'/'each' nodes change state.
    // * don't actually know on entry whether in_spawn is true or false.
    // called recursively when spawning a new sub-tree:
    // * must save and restore the tpl-ofs in the spawn-context,
    // * must insert the document fragment once when finished!
    { console.log("spawn tpl: "+tpl_id); }
    if (tpl_id) { // zero is the empty template.
      var sc = g_sc;
      var tpl_ofs = sc.tpl[tpl_id];
      // push context: save tpl-ofs and set to new template.
      var saved_ofs = sc.ofs ; sc.ofs = tpl_ofs; // seek to beginning of template.
      var was_in_spawn = in_spawn; in_spawn = true; // so we can detect outermost call!
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

  // sc { tpl, ofs, syms, fragment, spawn_children }

  function create_when(sc, parent, scope) {
    // runs in the context of an application update action.
    // Creates a vnode representing a 'when' node.
    // When the truth value of the bound expression changes, creates or
    // destroys the contents of this vnode to bring the view into sync.
    var body_tpl = sc.tpl[sc.ofs++]; // [1] body template to spawn.
    var expr_dep = resolve_expr(sc, scope); // [2..] expr
    var vnode = new_vnode(parent, null);
    var d_list = []; // local d_list to capture spawned contents.
    vnode.d_list = d_list; // for update_when, destroy_when.
    // new_scope: { locals, cssm, c_tpl, c_locals, c_cssm, d_list }
    var new_scope = { locals:scope.locals, cssm:scope.cssm,
      c_tpl:scope.c_tpl, c_locals:scope.c_locals, c_cssm:scope.c_cssm, d_list:d_list };
    var state = { vnode:vnode, scope:new_scope, expr_dep:expr_dep, body_tpl:body_tpl, in_doc:false };
    { vnode.d_is = 'when'; vnode.d_in = scope.cssm; vnode.d_state = state; }
    { console.log("[s] create 'when':", state); }
    var when_dep = new_dep(expr_dep.val, update_when_dep, state);
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
    var new_val = is_true(state.expr_dep.val);
    if (new_val !== state.in_doc) {
      queue_action(update_when_action, state);
    }
  }

  function update_when_action(state) {
    // runs in the context of an application update action.
    // create or destroy the `contents` based on boolean `value`.
    // note: it's possible that that the boolean value has changed back
    // due to other actions - so check if it has changed again.
    // TODO FIXME: since update is queued, MUST check if the 'when' is dead (removed)
    var new_val = is_true(state.expr_dep.val);
    if (new_val !== state.in_doc) {
      state.in_doc = new_val;
      var when_vnode = state.vnode;
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
    var state = when_dep.arg;
    // must unsubscribe when_dep from the expr_dep.
    kill_dep(when_dep); // do not receive any more updates.
    remove_dep(state.expr_dep, when_dep); // remove when_dep from expr_dep's fwd list.
    // must run the d_list for the when_vnode.
    // note: (d_list) in_destroy == true : no need to remove child DOM nodes or vnodes.
    run_d_list(state.vnode.d_list, true); // in_destroy=true.
  }

  // sc { tpl, ofs, syms, fragment, spawn_children }

  function create_each(sc, parent, scope) {
    // runs in the context of an application update action.
    // Creates a vnode representing the contents of the repeat node.
    // When the expression value changes, iterates over the new value creating
    // and destroying child vnodes to bring the view into sync with the value.
    var bind_as = sc.tpl[sc.ofs++]; // index in locals.
    var body_tpl = sc.tpl[sc.ofs++]; // body template to spawn.
    var coll = resolve_expr(sc, scope);
    if (!(coll instanceof Collection)) { throw 5; } // assert: must be a Collection.
    var vnode = new_vnode(parent, null);
    var state = { vnode:vnode, scope:scope, coll:coll, body_tpl:body_tpl, bind_as:bind_as, have_keys:{} };
    { vnode.d_is = 'each'; vnode.d_in = scope.cssm; vnode.d_state = state; }
    { console.log("[s] create 'each':", state); }
    var each_dep = new_dep(coll.items.val, update_each_dep, state);
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
    queue_action(update_each_action, state);
  }

  function update_each_action(state) {
    // runs in the context of an application update action.
    // TODO FIXME: since update is queued, MUST check if the 'each' is dead (removed)
    var seq = state.coll.items.val; // Collection: always an Array.
    var have_keys = state.have_keys; // Set of { Model._id -> scope }
    var new_keys = {};
    var rep_vnode = state.vnode;
    var next_vnode = rep_vnode.first; // first existing child vnode (can be null)
    for (var i=0; i<seq['length']; i++) {
      var model = seq[i]; // instanceof Model from Collection.
      var key = model._id; // KEY function.
      var inst_vnode = (void 0);
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
        var d_list = [];
        inst_vnode = new_vnode(rep_vnode, next_vnode);
        inst_vnode.d_list = d_list; // attach d_list for destroy_rep_children, destroy_each.
        // clone the scope.
        var scope = state.scope;
        var new_locals = clone_locals(scope.locals);
        // new_scope: { locals, cssm, c_tpl, c_locals, c_cssm, d_list }
        var new_scope = { locals:new_locals, cssm:scope.cssm,
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
    var new_locals = new Array(locals.length);
    for (var i=0; i<locals.length; i++) { new_locals[i] = locals[i]; }
    return new_locals;
  }

  function destroy_rep_children(next_child) {
    // runs in the context of an application update action.
    while (next_child) {
      var after = next_child.next_s; // capture before unlink.
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
    var state = each_dep.arg;
    kill_dep(each_dep); // do not receive any more updates.
    remove_dep(state.coll.items, each_dep); // remove each_dep from coll.items fwd list.
    // must loop over child vnodes and run their d_lists.
    // note: (d_list) in_destroy == true : no need to remove child DOM nodes or vnodes.
    for (var child = state.vnode.first; child; child = child.next_s) {
      // destroy everything on the d_list for the child.
      // child vnodes of rep_vnode always have a d_list attached.
      run_d_list(child.d_list, true); // in_destroy=true.
    }
  }

  // -+-+-+-+-+-+-+-+-+ DOM Spawn -+-+-+-+-+-+-+-+-+

  // Spawn functions - spawn always happens within a spawning context,
  // which means there's an active (global) DocumentFragment to append to.

  // Child VNodes and DOM nodes are always appended when spawned;
  // the only insertion that happens is at the site of a 'when' or 'each',
  // and only when its bound value changes after initial spawn.

  // sc { tpl, ofs, syms, fragment }

  function create_contents(sc, parent, scope) {
    // new_scope: { locals, cssm, c_tpl, c_locals, c_cssm, d_list }
    var c_scope = { locals:scope.c_locals, cssm:scope.c_cssm, c_tpl:0, c_locals:[], c_cssm:"", d_list:scope.d_list };
    // spawn the contents injected into the component.
    spawn_tpl_into(scope.c_tpl, c_scope, parent);
  }

  var dom_create = [
    create_text,       // 0  DOM Vnode
    create_bound_text, // 1  DOM Vnode
    create_element,    // 2  DOM Vnode
    create_component,  // 3  (nothing)
    create_when,       // 4  When VNode
    create_each,       // 5  Each VNode
    create_contents ];

  function spawn_children(sc, parent, scope) {
    // spawn a list of children within a tag vnode or component body.
    // in order to move scopes, they must capture their top-level nodes.
    var len = sc.tpl[sc.ofs++];
    while (len--) {
      var op = sc.tpl[sc.ofs++];
      if ( !dom_create[op]) {
        console.log("[bad] dom_create");
      }
      dom_create[op](sc, parent, scope);
    }
  }

  // import { b93_decode } from './b93'

  window['manglr'] = function(tpl_str, syms) {
    var tpl = tpl_str; // b93_decode(tpl_str); // unpack tpl data to an array of integers.
    init_sc(tpl, syms, spawn_children);
    // new_scope: { locals, cssm, c_tpl, c_locals, c_cssm, d_list }
    var scope = { locals:[], cssm:"", c_tpl:0, c_locals:[], c_cssm:"", d_list:[] };
    var vnode = new_vnode(null, null);
    vnode.dom = document.body;
    // spawn template #1 into the DOM body.
    spawn_tpl_into(1, scope, vnode);
    run_updates();
  };

}());
