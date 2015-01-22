#!/usr/bin/env node
console.log('');

var http = require('http');
var fs = require('fs');
var exec = require('child_process').exec;
var rimraf = require('rimraf');

var cwd = process.cwd();
var cfgDir = cwd;
var cfgName = ".instaci.json";
var cfgPath = cfgDir + "/" + cfgName;

exec = function () {
    var orig = exec;
    return function (cmd, cb) {
        orig.call(this, cmd, function (err, stdout, stderr) {
            if (debug) {
                console.log("Error: "); console.log(err);
                console.log("stdout: "); console.log(stdout);
                console.log("stderr: "); console.log(stderr);
            }
            //if (stderr) return cb(stderr, stdout, stderr);
            cb(err, stdout, stderr);
        });
    };
}();

var async = require('async');
var program = require('commander')
    .version('0.0.1')
    .option('-n, --new', 'Create config file.')
    .option('-d, --debug', 'Print debug information to the console.')
    .parse(process.argv);

var nodemailer = require('nodemailer');
var jade = require('jade');

if (program.new) {
    console.log("Writing insta-ci config: " + cfgPath);
    var result = fs.writeFileSync(cfgPath, JSON.stringify({
        "host": "127.0.0.1",
        "port": 11001,
        "admin": true,
        "apps": {
            "my-app": {
                "repository": "git@github.com:johndoe/my-app.git",
                "build": "npm install; npm test;",
                "install": "!s:deploy",
            },
        },
        "scripts": {
            "deploy": "echo 'Deploy';",
        }
    }, null, '\t'));
    process.exit(0);
}

var debug = false;
if (program.debug) debug = true;

if ( ! fs.existsSync("workspace") ) fs.mkdirSync("workspace");
if ( ! fs.existsSync("deployed") ) fs.mkdirSync("deployed");

var init = true;
var config = null;
function loadConfig() {

    var error = null;
    function ret(err) {
        if ( init ) throw err;
        error = err;
        return console.error(err);
    }

    var cfg = require(cfgPath);
    if ( ! cfg.apps || ! Object.keys(cfg.apps).length ) return ret(new Error("No apps specified."));
    if ( ! cfg.host ) return ret(new Error("Missing host param."));
    if ( ! cfg.port ) return ret(new Error("Missing port param."));
    Object.keys(cfg.apps).forEach(function (appName) {
        var app = cfg.apps[appName];
        if ( ! app.repository ) return ret(new Error("App '" + appName + "' missing repository."));
        if ( ! app.build ) return ret(new Error("App '" + appName + "' is missing a build script."));
        if ( ! app.install ) return ret(new Error("App '" + appName + "' is missing an install script."));
    });

    Object.keys(cfg.apps).forEach(function (appName) {
        var app = cfg.apps[appName];
        Object.keys(app).forEach(function (script) {
            if (app[script].indexOf('!s:') == 0) {
                var scriptName = app[script].slice(3, app[script].length);
                if (cfg.scripts[scriptName]) app[script] = cfg.scripts[scriptName];
                else ret(new Error('Invalid script: ' + scriptName));
            }
        });
    });

    if ( ! error ) config = cfg;
    init = false;
};
console.log("Loading " + cfgPath);
loadConfig();
fs.watchFile(cfgPath, {interval: 2000}, function () {
    console.log("Configuration update detected."); 
    if (working) return console.log("Currently building an application; configuration update will be deferred until the build is resolved.");
    loadConfig();
});

var mailer = {
    send: function (options, cb) { if (cb) cb() },
};

(function () {
    if ( ! config.mailer ) return;
    transport = nodemailer.createTransport("SMTP", config.mailer.settings);
    console.log("Mailer configured.");

    /* Options

        {
            error: [Object],
            appName: String
        }

    */

    mailer.send = function (options) {
        var view; options.error ? view = config.mailer.views.error : view = config.mailer.views.success;
        jade.renderFile(view, {error: options.error ? options.error.message : null}, function (err, html) {
            if (err) return console.log(err);

            var subject = "Build " + (options.error ? "failed: " : "successful: ") + options.appName;
    
            config.mailer.recipients.forEach(function (recipient) {
                transport.sendMail({
                    from: "Brandon Silva <build@brandonsilva.net>",
                    to: recipient,
                    subject: subject,
                    text: "Text version unavailable.",
                    html: html,
                }, function (err) {
                    if (err) return console.log(err);
                    console.log( (options.error ? "Error" : "Success") + " email sent to " + recipient + "." );
                });
            });
        });
    };
}());

var queue = [];
var working = false;
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

function deployApp(app, cb) {
    try {
        var cloneDir = cwd + '/workspace/' + app.name;
        async.series([
            function (cb) {
                rimraf(cloneDir, function (err) {
                    if (err) return cb(err);
                    console.log('Cloning ' + app.name);
                    exec('git clone ' + app.repository + ' ' + cloneDir, cb);
                });
            },
            function (cb) { process.chdir(cloneDir); cb() },
            function (cb) { console.log('Building ' + app.name); exec(app.build, cb); },
            function (cb) { if ( ! app.preinstall ) return cb(); console.log('Preinstalling ' + app.name); exec(app.preinstall, cb); },
            function (cb) {
                console.log('Installing ' + app.name);
                var deployDir = cwd + '/deployed/' + app.name;
                rimraf(deployDir, function (err) {
                    if (err) return cb(err);
                    exec('mv ' + cloneDir + ' ' + deployDir, function (err) {
                        if (err) return cb(err);
                        process.chdir(deployDir);
                        exec(app.install, cb);
                    });
                });
            },
        ], function (err) {
            process.chdir(cwd); cb(err, app);
        });
    } catch (e) {
        process.chdir(cwd);
        return cb(e, app);
    }
}

function handleDeploy(err, app) {
    console.log('');
    process.chdir(cwd);
    if (err) {
        console.log("Build failed for " + app.name);
        console.log('');
        console.log(err);
        console.log('');
        mailer.send({error: err, appName: app.name});
    } else {
        console.log("Successfully built: " + app.name);
        mailer.send({appName: app.name});
    }
    console.log("-----------------------------");
    if (queue.length) return deployApp(queue.pop(), handleDeploy);
    working = false;
    loadConfig();
}

/* if (config.admin) http.createServer(function (req, res) {
    var html;
}).listen(config.port, config.host); */

http.createServer(function (req, res) {
    if (req.path == "/favicon.ico") return res.end();

    console.log(new Date().toString() + "    " + req.method + ": " + req.url);

    var app = resolve(req.url);
    res.writeHead(200);
    if (app) res.write('ok');
    else res.write('invalid');
    res.end();
    if (!app) return;

    if (working) { console.log("Queuing up " + app.name); return queue.push(app); }
    working = true;

    process.nextTick(function () {
        deployApp(app, handleDeploy);
    });

}).listen(config.port, config.host);

console.log('Server running at http://' + config.host + ":" + config.port);
console.log('');

var request = require('request');
Object.keys(config.apps).forEach(function (app) {
    var url = "http://" + config.host + ":" + config.port + "/update/" + app;
    request(url, function () {});
});
