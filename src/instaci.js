var http = require('http');
var fs = require('fs');
var async = require('async');
var rimraf = require('rimraf');
var util = require('./util');

//var ex = module.exports;

var CI = function (cfgPath) {
    this._starting = true;
    this.config = {};
    this._queue = [];

    this.loadConfig(cfgPath, true);
    this.watchConfig(cfgPath);
}

CI.prototype.loadConfig = function (cfgPath, isBooting) {
    var self = this;
    var config = require(cfgPath);
    var error = null;

    if ( ! config.apps || ! Object.keys(config.apps).length )  error = self.error(new Error("No apps specified."));
    if ( ! config.host )                                       error = self.error(new Error("Missing host param."));
    if ( ! config.port )                                       error = self.error(new Error("Missing port param."));
    Object.keys(config.apps).forEach(function (appName) {
        var app = config.apps[appName];
        app.name = appName;
        if ( ! app.repository )                                error = self.error(new Error("App '" + appName + "' missing repository."));
        if ( ! app.build )                                     error = self.error(new Error("App '" + appName + "' is missing a build script."));
        if ( ! app.install )                                   error = self.error(new Error("App '" + appName + "' is missing an install script."));

        //Object.keys(app).forEach(function (script) {
        //    if (app[script].indexOf('!s:') == 0) {
        //        var scriptName = app[script].slice(3);
        //        if (config.scripts[scriptName]) app[script] = config.scripts[scriptName];
        //        else                                           error = self.error(new Error('Invalid script: ' + scriptName));
        //    }
        //});
    });

    if ( ! error ) {
        this.config = config;
        console.log("Configuration loaded.");
        this._starting = false;
    }
}

CI.prototype.error = function (err) {
    if ( this._starting ) throw err;
    console.error(err);
    return err;
};

CI.prototype.startHttpServer = function (deployApps) {
    var self = this;

    http.createServer(function (req, res) {
        if (req.path == "/favicon.ico") return res.end();
        console.log(new Date().toString() + "    " + req.method + ": " + req.url);
        self.executeRequest(req, res);
    }).listen(this.config.port, this.config.host, function () {
        console.log('Server running at http://' + self.config.host + ":" + self.config.port);
        console.log('');

        if (deployApps) self.deployApps();
        else            self.startServices();
    });
}

CI.prototype.deployApps = function () {
    for (var appName in this.config.apps) {
        var app = this.config.apps[appName];
        if (app.service) {
            this.deployApp(app);
        }
    }
}

CI.prototype.startServices = function () {
    for (var appName in this.config.apps) {
        var app = this.config.apps[appName];
        if (app.service) {
            this.runApp(app);
        }
    }
}

CI.prototype.getCloneDir = function (appName) {
    return process.cwd() + '/workspace/' + appName;
}

CI.prototype.getDeployDir = function (appName) {
    return process.cwd() + '/deployed/' + appName;
}

CI.prototype.cloneRepository = function (app, cb) {
    var cloneDir = this.getCloneDir(app.name);
    rimraf(cloneDir, function (err) {
        if (err) return cb(err);
        console.log('Cloning ' + app.name);
        util.runCmd('git clone ' + app.repository + ' ' + cloneDir, {cwd: process.cwd(), app: app.name}, cb);
    }); 
}

CI.prototype.buildApp = function (app, cb) {
    var cloneDir = this.getCloneDir(app.name);
    this.cloneRepository(app, function (err) {
        if (err) return cb(err);
        console.log('Building ' + app.name);
        util.runCmd(app.build, {cwd: cloneDir, app: app.name, log: true}, cb); 
    });
}

CI.prototype.runApp = function (app, cb) {
    var deployDir = this.getDeployDir(app.name);
    if ( ! fs.existsSync(deployDir) ) {
        cb(new Error('"' + app.name + '" could not be run; needs to be built.'));
        if (this.config.deployServices) this.deployApp(app);
        return;
    }
    console.log('Running "' + app.name + '".');
    util.runCmd(app.install, {cwd: deployDir, app: app.name, log: true}, cb);
}

CI.prototype.deployApp = function (app) {
    var self = this;
    try {
        async.series([
            function (cb) {
                self.buildApp(app, cb);
            },  
            function (cb) {
                var cloneDir = self.getCloneDir(app.name);
                var deployDir = self.getDeployDir(app.name);
                rimraf(deployDir, function (err) {
                    if (err) return cb(err);
                    util.runCmd('mv ' + cloneDir + ' ' + deployDir, {cwd: process.cwd(), app: app.name}, cb);
                });
            },
            function (cb) { 
                self.runApp(app, cb);
            }
        ], function (err) {
            self.resolveDeploy(err, app);
        }); 
    } catch (err) {
        self.resolveDeploy(err, app);
    } 
}

CI.prototype.resolveDeploy = function (err, app) {
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
    if (this._queue.length) return this.deployApp(this._queue.pop(), this.resolveDeploy);
    //this._working = false;
}

CI.prototype.executeRequest = function (req, res) {
    var self = this;

    var app;
    Object.keys(this.config.apps).some(function (appName) {
        if (req.url == "/update/" + appName) {
            app = self.config.apps[appName];
            res.writeHead(200); res.write('updating ' + appName); res.end();
            self.deployApp(app);
            return true;
        }
    });

    if ( ! app ) {
        res.write('invalid-app'); res.end();
    }
};

CI.prototype.watchConfig = function (cfgPath) {
    var self = this;

    fs.watchFile(cfgPath, {interval: 2000}, function () {
        self.loadConfig(cfgPath);
        console.log("Configuration update detected. Configuration updates will be applied to future deployments.");
    });
};

/*CI.prototype.queueDeployment = function (app) {
    var self = this;

    if (this._working) {
        console.log("Queuing up " + app.name);
        return this._queue.push(app);
    }

    this._working = true;
    process.nextTick(function () {
        self.deployApp(app, self.resolveDeploy);
    });
}*/

module.exports = CI;
