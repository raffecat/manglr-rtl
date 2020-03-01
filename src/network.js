export function post_json(url, data, done) {
  var tries = 0;
  url = window.location.protocol+"//"+window.location.host+url;
  post();
  function retry(reason, msg) {
    tries++;
    if (tries > 0) return done({ error:'too many retries', reason:reason, message:msg })
    var delay = Math.min(tries * 250, 2000); // back-off.
    window.setTimeout(post, delay);
  }
  function post() {
    var req = new XMLHttpRequest();
    req.onreadystatechange = function () {
      if (!req || req.readyState !== 4) return;
      var status = req.status, result = req.responseText;
      req.onreadystatechange = null;
      req = null;
      if (status != 200) return retry('http', status);
      var res;
      try { res = JSON.parse(result); }
      catch (err) { return retry('json', String(err)) }
      if (!res) return retry('null', '');
      if (res.retry) return retry('retry', res.retry);
      return done(res);
    };
    req.open('POST', url, true);
    req.setRequestHeader("Content-Type", "application/json");
    req.setRequestHeader("X-Muncha", "54D08EF5-7286-46BE-BF75-21D48DF98B9A");
    req.send(JSON.stringify(data));
  }
}
