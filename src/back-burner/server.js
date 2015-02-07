var http = require('http');
var request = require('request');
var instaci = require("./instaci");

var ex = module.exports;

ex.startServer = function (config, deploy) {
    http.createServer(function (req, res) {
        if (req.path == "/favicon.ico") return res.end();

        console.log(new Date().toString() + "    " + req.method + ": " + req.url);

        var app = instaci.resolveRequest(req.url, config);

        res.writeHead(200);
        if (app) { res.write('ok'); res.end(); }
        else { res.write('invalid-app'); res.end(); return; }

        return instaci.queueApp(app);
    }).listen(config.port, config.host);

    console.log('Server running at http://' + config.host + ":" + config.port);
    console.log('');

    if (deploy) Object.keys(config.apps).forEach(function (app) {
        util.http.update(config.host, config.port, app);
    });
}
