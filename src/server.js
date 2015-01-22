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
        if (app) res.send('ok');
        else { res.send('invalid-app'); return; }

        return instaci.queueApp(app);
    }).listen(config.port, config.host);

    console.log('Server running at http://' + config.host + ":" + config.port);
    console.log('');

    if (deploy) Object.keys(config.apps).forEach(function (app) {
        var url = "http://" + config.host + ":" + config.port + "/update/" + app;
        request(url, function () {});
    });
}
