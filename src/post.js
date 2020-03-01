import { debug } from './config'

const json_re = new RegExp("^application/json", "i");

function postJson(url, token, data, callback) {
  let tries = 0;
  post();
  function retry(ret) {
    tries++;
    if (ret === true || tries < 5) {
      const delay = Math.min(tries * 1000, 5000); // back-off.
      setTimeout(post, delay);
    }
  }
  function post() {
    let req = new XMLHttpRequest();
    req.onreadystatechange = function () {
      if (!req || req.readyState !== 4) return;
      const code = req.status, ct = req.getResponseHeader('Content-Type');
      let data = req.responseText;
      if (debug) console.log("REQUEST", req);
      req.onreadystatechange = null;
      req = null; // GC.
      if (json_re.test(ct)) {
        try {
          data = JSON.parse(data);
        } catch (err) {
          console.log("bad JSON", url, err);
          return retry(callback(code||500));
        }
      }
      if (code < 300) {
        if (callback(code, data) === true) retry();
      } else {
        retry(callback(code||500, data));
      }
    };
    req.open('POST', location.protocol+'//'+location.host+url, true);
    req.setRequestHeader("Content-Type", "application/json");
    if (token) req.setRequestHeader("Authorization", "bearer "+token);
    req.send(JSON.stringify(data));
  }
}
