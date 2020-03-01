
// destroy lists - contain pairs of (function, object) to run when a
// context is destroyed, i.e. 'when' and 'child-of-each' vnodes.

// when a d_list is run (always associated with some vnode), the caller
// will also clear all DOM nodes under that vnode and remove that vnode
// from its parent; therefore d_list functions don't need to remove
// any DOM nodes or vnodes they control if in_destroy == true (when
// in_destroy is false, there is no such caller to remove any nodes.)

export function d_list_add(d_list, func, arg) {
  d_list['push'](func, arg);
}

export function run_d_list(d_list, in_destroy) {
  // runs in the context of an application update action.
  // CONSIDER: d_list could be pairs of (fn, arg) to avoid making
  // deps for things just to add them to the d_list!
  for (let i=0; i < d_list['length']; i += 2) {
    d_list[i](d_list[i+1], in_destroy);
  }
  d_list['length'] = 0;
}
