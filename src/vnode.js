import { debug } from './config'

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

export function new_vnode(up, before) { // before can be null (append)
  const vnode = { up:null, next_s:null, prev_s:null, first:null, last:null, dom:null, d_list:null };
  if (up) link_before(up, vnode, before); // insert in 'up' before 'before'.
  return vnode;
}

export function unlink_vnode(node) {
  // remove the vnode from its parent vnode's chain of children.
  const parent = node.up;
  if (parent) {
    const behind = node.prev_s, ahead = node.next_s;
    if (behind) behind.next_s = ahead; else parent.first = ahead;
    if (ahead) ahead.prev_s = behind; else parent.last = behind;
    node.up = null; node.prev_s = null; node.next_s = null;
  } else {
    if (debug) throw 5; // no parent!
  }
}

export function link_before(parent, node, ahead) { // ahead can be null (append)
  if (debug && node.up) throw 5; // already in a chain!
  node.up = parent;
  const behind = ahead ? ahead.prev_s : parent.last;
  node.prev_s = behind;
  node.next_s = ahead;
  if (behind) behind.next_s = node; else parent.first = node;
  if (ahead) ahead.prev_s = node; else parent.last = node;
}

export function move_vnode(parent, node, ahead) { // ahead can be null (append)
  // unlink the vnode from its siblings.
  unlink_vnode(node);
  // insert it back in before next_vnode.
  link_before(parent, node, ahead);
  // move the vnode's dom nodes into the correct place.
  // this means finding every DOM node that is a child of this vnode,
  // and re-inserting those before first_dom_node_after(vnode).
  // ...
}

export function clear_child_nodes(vnode) {
  // remove the DOM contents of a vnode (for 'if' vnodes)
  const dom = vnode.dom;
  if (dom !== null) {
    dom.parentNode.removeChild(dom);
    vnode.dom = null; // GC.
    return; // no need to recurse beyond DOM nodes!
  }
  for (let child = vnode.first; child; ) {
    const next_s = child.next_s; // save before clear.
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
    const found = vnode.dom;
    if (found) return found;
    const subtree = vnode.first;
    if (subtree) {
      if (debug) console.log("... entering sub-tree:", vnode);
      const found = first_dom_node_in_tree(subtree);
      if (debug) console.log("... leaving sub-tree:", vnode);
      if (found) return found;
    }
  }
}

export function insert_dom_nodes(fragment, vnode) {
  // insert the DOM nodes inside 'fragment' into the DOM at 'vnode',
  // which is typically a 'when' or 'child-of-each' node, but can also
  // be a DOM vnode during initial page render.
  if (debug) console.log("insert_dom_nodes:", fragment, vnode);
  for (;;) {
    if (vnode.dom) {
      // arrived at a DOM node above the node being populated (which means there
      // were not any sibling DOM nodes to find within the same parent DOM node) -
      // or the vnode being populated is itself a DOM node.
      if (debug) console.log("... INSERTED at the parent DOM node:", vnode);
      vnode.dom.appendChild(fragment);
      return;
    }
    // always ignore the children of the starting vnode (want a node _after_ those)
    // always ignore the `dom` of the starting node (want a node _after_ this one)
    // check all siblings that follow the starting node.
    const found = first_dom_node_in_tree(vnode.next_s); // note: argument can be null.
    if (found) {
      if (debug) console.log("... FOUND:", found);
      found.parentNode.insertBefore(fragment, found);
      return;
    }
    // didn't find a dom node in any later sibling of the vnode.
    // move up one level and check all siblings that follow the parent.
    //  A [B] C D    <-- vnode.up is [B] - will start from [C] - unless [B] is DOM node (found parent)
    //     1 [2] 3   <-- starting vnode [2] - have checked [3]
    vnode = vnode.up;
    if (debug) console.log("... go up to:", vnode);
    if (!vnode) {
      if (debug) console.log("... CANNOT INSERT - no parent DOM node found.");
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
