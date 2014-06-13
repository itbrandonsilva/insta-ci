#!/usr/bin/env node

var http = require('http');
var fs = require('fs');
var exec = require('child_process').exec;
exec = function () {
    var orig = exec;
    return function (cmd, cb) {
        orig.call(this, cmd, function (err, stdout, stderr) {
            console.log('stdout: ');
            console.log(stdout);
            if (stderr) return cb(stderr, stdout, stderr);
            cb(err, stdout, stderr);
        });
    };
}();

var async = require('async');
var program = require('commander')
    .version('0.0.1')
    .option('-n, --new', 'Create config file.')
    .parse(process.argv);

var winston = require('winston');

if (program.new) {
    var cfgPath = process.cwd() + "/.instaci.json";
    console.log("Writing insta-ci config: " + cfgPath);
    var result = fs.writeFileSync(cfgPath, JSON.stringify({
        "host": "127.0.0.1",
        "port": 11001,
        "apps": {
            "yourapp": {
                "path": "/yourpath",
                "start": "start.js",
                "stop": "stop.js",
                "build": "build.js",
                "test": "test.js",
            },
        },
    }, null, '\t'));
    process.exit(0);
}

var config = require(process.cwd() + "/.instaci.json");

var cwd = process.cwd();

var instaci = {
    queue: [],
    status: "",
};

(function () {
    console.log('');
    if ( ! config.host ) throw new Error("Missing host param.");
    if ( ! config.port ) throw new Error("Missing port param.");
    Object.keys(config.apps).forEach(function (appName) {
        var app = config.apps[appName];
        if ( ! app.path ) throw new Error("App '" + appName + "' missing path.");
        if ( ! app.build ) throw new Error("App '" + appName + "' is missing a build script.");
        if ( ! app.start ) throw new Error("App '" + appName + "' is missing a start script.");
        if ( ! app.stop ) throw new Error("App '" + appName + "' is missing a start script.");
        if ( ! app.test ) console.warn("WARNING: App '" + appName + "' is missing a test script.");
    });
}());

function resolve(path) {
    var app;
    Object.keys(config.apps).some(function (appName) {
        if (path == "/update/" + appName) {
            app = config.apps[appName];
            app.name = appName;
            return true;
        }
    });
    return app;
}

http.createServer(function (req, res) {
    if (req.path == "/favicon.ico") return res.end();

    console.log(req.method + ": " + req.url);

    var app = resolve(req.url);
    res.writeHead(200);
    if (app) res.write('ok');
    else res.write('invalid');
    res.end();

    if (!app) return;
    console.log('');
    console.log('');
    console.log('----------------------');
    console.log(new Date().toString());
    console.log('');

    try {
        process.chdir(app.path);
        async.series([
            function (cb) { console.log('Building ' + app.name); exec(app.build, cb); },
            function (cb) { if ( ! app.test ) return cb(); console.log('Testing ' + app.name); exec(app.test, cb); },
            function (cb) { console.log('Stopping ' + app.name); exec(app.stop, cb); },
            function (cb) { console.log('Starting ' + app.name); exec(app.start, cb); },
        ], function (err) {
            console.log('');
            process.chdir(cwd);
            if (err) {
                console.error("Build failed for " + app.name);
                return console.error(err);
            }
            console.log("Successfully built: " + app.name);
        });
    } catch (e) {
        console.log("Caught exception: ");
        console.log(e);
        process.chdir(cwd);
    }
}).listen(config.port, config.host);

console.log('Server running at http://' + config.host + ":" + config.port);
console.log('');
