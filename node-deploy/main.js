(function() {
  var exec, fs, http, log, options, path, port, querystring, server, util, _;

  fs = require("fs");

  util = require("util");

  http = require("http");

  querystring = require("querystring");

  _ = require("underscore");

  exec = require("child_process").exec;

  path = require("path");

  log = function(item) {
    var output;

    output = new Date().toISOString() + " " + util.format.apply(null, arguments);
    return util.puts(output);
  };

  options = JSON.parse(fs.readFileSync("" + __dirname + "/config.json"));

  port = options.port || 9001;

  server = http.createServer(function(req, res) {
    var data;

    if (req.method === "POST") {
      data = "";
      req.on("data", function(chunk) {
        return data += chunk;
      });
      return req.on("end", function() {
        var branchOk, commit, payload, repo, repoOk, _i, _j, _len, _len1, _ref, _ref1, _ref2;

        payload = JSON.parse(querystring.unescape(data.replace(/(^payload=)|(\+)/ig, "")));
        _ref = options.repositories;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          repo = _ref[_i];
          repoOk = repo.repo.match(new RegExp("" + (((_ref1 = payload.repository.owner) != null ? _ref1.name : void 0) || payload.repository.owner) + "/" + payload.repository.name)).length > 0;
          branchOk = new RegExp("refs\/heads\/" + repo.branch).test(payload.ref || payload.base_ref || "");
          if (!branchOk) {
            _ref2 = payload.commits;
            for (_j = 0, _len1 = _ref2.length; _j < _len1; _j++) {
              commit = _ref2[_j];
              if (_.contains(commit.branches || [], repo.branch) || commit.branch === repo.branch) {
                branchOk = true;
              }
              if (branchOk) {
                break;
              }
            }
          }
          if (repoOk && branchOk) {
            log("POST received for " + repo.repo + " ... ");
            exec("sudo /bin/sh " + (path.join(repo.local_path, '.hooks/deploy.sh')), function(error, stdout, stderr) {
              if (error) {
                return log(error);
              }
              if (stderr) {
                return log(stderr);
              }
              log(stdout);
            });
          }
        }
        res.writeHead(200, {
          "Content-type": "text/html"
        });
        return res.end();
      });
    }
  });

  server.listen(port, function() {
    var e;

    try {
      process.setgid("node");
      process.setuid("node");
      log("Downgraded to node user.");
    } catch (_error) {
      e = _error;
      log("Unable to downgrade permissions.");
    }
    return log("Listening on port " + port + " ...");
  });

}).call(this);