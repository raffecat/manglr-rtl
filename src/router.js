import { debug } from './config'
import { mkdep, set_dep } from './deps'
import { sym_list, rd } from './tpl'
import { Model } from './models'

function dep_bind_to_hash_change(dep) {
  // closure to capture `dep` for `hashchange` event.
  addEventListener('hashchange', function(){ set_dep(dep, location.hash); }, false);
}

export function create_router(scope) {
  // Create a Router Controller in the local scope.
  var bind_as = sym_list[rd()];
  var router = new Model(bind_as);
  scope.binds[bind_as] = router;
  var route_dep = mkdep(location.hash); // dep.
  if (debug) route_dep._nom = 'route';
  router._deps['route'] = route_dep;
  dep_bind_to_hash_change(route_dep); // avoids capturing doc, dom_parent, etc.
}
