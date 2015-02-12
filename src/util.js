"use strict";

var fs = require('fs');
var path = require('path');
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var util = require('util');

var async = require('async');
var request = require('request');
var uuid = require('node-uuid');
var ex = module.exports;

var debug = false;

try {
    var config = require(process.cwd() + '/.instaci.json');
} catch (err) {
    console.error('.instaci.json not found in working directory. Use "insta-ci --new" to create one.');
    console.log('');
    process.exit(1);
}

console.log = (function () {
    var log = fs.createWriteStream(path.join(process.cwd(), 'logs', 'insta-ci.log'), {encoding: 'utf8', flags: 'a'});
    var original = console.log;
    return function () {
        log.write(util.format.apply(null, arguments) + '\n');
        original.apply(null, arguments);
    }
}());

ex.runCmd = function (cmd, options, cb) {
    var script = path.join(process.cwd(), 'workspace', 'scripts', uuid.v1());
    fs.writeFileSync(script, cmd, {encoding: 'utf8'});

    async.waterfall([
        function (cb) {
            if (options.log) {
                var log = fs.createWriteStream(path.join(process.cwd(), 'logs', options.app + '.log'), {encoding: 'utf8', flags: 'a'});
                log.on('open', function () {
                    log.write('\n');
                    log.write('\n');
                    log.write('\n------------------------------------------------------------------------');
                    log.write('\n-- ' + new Date().toString());
                    log.write('\n-- ' + cmd);
                    log.write('\n------------------------------------------------------------------------');
                    log.write('\n');
                    log.write('\n');
                    cb(null, log);
                });
            } else {
                cb(null, null);
            }
            delete options.app;
        },
        function (log, cb) {
            var p = spawn('bash', [script], options);

            // I have a try/catch around each log write because stdout and stderr still receive events
            // even after the 'exit' event callback is called, for some reason.

            p.stdout.on('data', function (data) {
                if (log) try { log.write('' + data); } catch (e) { }
                else process.stdout.write('' + data);
            });

            p.stderr.on('data', function (data) {
                if (log) try { log.write('' + data); } catch (e) { }
                else process.stdout.write('' + data);
            });

            p.on('exit', function (code) {
                try { fs.unlinkSync(script); } catch (e) { }
                if (log) log.end();
                cb(code);
            });
        },
    ], cb);
};

ex.enableDebug = function () {
    debug = true;
}

ex.http = {
    update: function (appName, cb) {
        if ( !config.port || !config.host ) throw new Error('"host" or "port" missing from .instaci.json.');
        var url = 'http://' + config.host + ':' + config.port + '/update/' + appName;
        request(url, function () {});
        return url;
    }
}

ex.writeNewConfig = function (path) {
    console.log('Writing insta-ci config: ' + path);
    var result = fs.writeFileSync(path, JSON.stringify({
        host: '127.0.0.1',
        port: 11001,
        apps: {
            'my-app': {
                repository: 'git@github.com:johndoe/my-app.git',
                build: 'npm install; npm test;',
                install: '!s:deploy',
            },
        },
        scripts: {
            deploy: 'echo "Deploy my-app.";',
        },
        plugins: []
    }, null, '\t'));
}

/*ex.plugin = function (module) {
    var plugin;
    fs.exists(module + '/' + path, function (exists) {
        if (exists) plugin = require(module);
    });
    return plugin;
}*/
