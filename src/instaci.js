var fs = require('fs');
var async = require("async");
var rimraf = require('rimraf');
var util = require("./util");
var cwd = process.cwd();

var queue = [];
var working = false;

var ex = module.exports;

ex.loadConfig = function (cfgPath, isInitializing) {
    var config = {};
    var error = null;

    function handleError(err) {
        if ( isInitializing ) throw err;
        error = err;
        return console.error(err);
    }

    var config = require(cfgPath);
    if ( ! config.apps || ! Object.keys(config.apps).length ) return handleError(new Error("No apps specified."));
    if ( ! config.host ) return handleError(new Error("Missing host param."));
    if ( ! config.port ) return handleError(new Error("Missing port param."));
    Object.keys(config.apps).forEach(function (appName) {
        var app = config.apps[appName];
        if ( ! app.repository ) return handleError(new Error("App '" + appName + "' missing repository."));
        if ( ! app.build ) return handleError(new Error("App '" + appName + "' is missing a build script."));
        if ( ! app.install ) return handleError(new Error("App '" + appName + "' is missing an install script."));
        Object.keys(app).forEach(function (script) {
            if (app[script].indexOf('!s:') == 0) {
                var scriptName = app[script].slice(3);
                if (config.scripts[scriptName]) app[script] = config.scripts[scriptName];
                else handleError(new Error('Invalid script: ' + scriptName));
            }
        });
    });

    if ( ! error ) return config;
};

ex.queueApp = function (app) {
    if (working) {
        console.log("Queuing up " + app.name);
        return queue.push(app);
    }

    working = true;
    process.nextTick(function () {
        ex.deployApp(app, ex.handleDeploy);
    });
}

ex.deployApp = function (app, cb) {
    try {
        var cloneDir  = cwd + '/workspace/' + app.name;
        var deployDir = cwd + '/deployed/'  + app.name;
        async.series([
            function (cb) {
                rimraf(cloneDir, function (err) {
                    if (err) return cb(err);
                    console.log('Cloning ' + app.name);
                    util.exec('git clone ' + app.repository + ' ' + cloneDir, cb);
                }); 
            },  
            //function (cb) { process.chdir(cloneDir); cb() },
            function (cb) { console.log('Building ' + app.name); util.exec(app.build, {cwd: cloneDir}, cb); },
            //function (cb) { if ( ! app.preinstall ) return cb(); console.log('Preinstalling ' + app.name); util.exec(app.preinstall, cb); },
            function (cb) {
                console.log('Installing ' + app.name);
                rimraf(deployDir, function (err) {
                    if (err) return cb(err);
                    util.exec('mv ' + cloneDir + ' ' + deployDir, function (err) {
                        if (err) return cb(err);
                        process.chdir(deployDir);
                        util.exec(app.install, {cwd: deployDir}, cb);
                    }); 
                }); 
            },  
        ], function (err) {
            process.chdir(cwd);
            cb(err, app);
        }); 
    } catch (err) {
        process.chdir(cwd);
        cb(err, app);
    } 
}

ex.handleDeploy = function (err, app) {
    console.log('');
    if (err) {
        console.log("Build failed for " + app.name);
        console.log('');
        console.log(err);
        console.log('');
        //mailer.send({error: err, appName: app.name});
    } else {
        console.log("Successfully built: " + app.name);
        //mailer.send({appName: app.name});
    }   
    console.log("-----------------------------");
    if (queue.length) return ex.deployApp(queue.pop(), ex.handleDeploy);
    working = false;
}

ex.resolveRequest = function (urlPath, config) {
    var app;
    Object.keys(config.apps).some(function (appName) {
        if (urlPath == "/update/" + appName) {
            app = config.apps[appName];
            app.name = appName;
            return true;
        }
    });
    return app;
};

ex.watchConfig = function (cfgPath, cb) {
    fs.watchFile(cfgPath, {interval: 2000}, function () {
        console.log("Configuration update detected."); 
        if (working) return console.log("Currently building an application; configuration update will be deferred until the build is resolved.");
        var config = ex.loadConfig(cfgPath);
        cb(null, config);
    });
};
