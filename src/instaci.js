var http = require('http');
var fs = require('fs');
var async = require('async');
var rimraf = require('rimraf');
var util = require('./util');
var cwd = process.cwd();

//var ex = module.exports;

var CI = function (cfgPath) {
    this._starting = true;
    this.config = {};
    this._queue = [];
    this._working = false;

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
        if ( ! app.repository )                                error = self.error(new Error("App '" + appName + "' missing repository."));
        if ( ! app.build )                                     error = self.error(new Error("App '" + appName + "' is missing a build script."));
        if ( ! app.install )                                   error = self.error(new Error("App '" + appName + "' is missing an install script."));

        Object.keys(app).forEach(function (script) {
            if (app[script].indexOf('!s:') == 0) {
                var scriptName = app[script].slice(3);
                if (config.scripts[scriptName]) app[script] = config.scripts[scriptName];
                else                                           error = self.error(new Error('Invalid script: ' + scriptName));
            }
        });
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

        if (deployApps) Object.keys(self.config.apps).forEach(function (app) {
            util.http.update(app);
        }); 
    });
}

CI.prototype.queueDeployment = function (app) {
    var self = this;

    if (this._working) {
        console.log("Queuing up " + app.name);
        return this._queue.push(app);
    }

    this._working = true;
    process.nextTick(function () {
        self.deployApp(app, self.resolveDeploy);
    });
}

CI.prototype.deployApp = function (app, cb) {
    var self = this;

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
            function (cb) { console.log('Building ' + app.name); util.exec(app.build, {cwd: cloneDir}, cb); },
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
            cb.call(self, err, app);
        }); 
    } catch (err) {
        process.chdir(cwd);
        cb.call(self, err, app);
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
    this._working = false;
}

CI.prototype.executeRequest = function (req, res) {
    var self = this;

    var app;
    Object.keys(this.config.apps).some(function (appName) {
        if (req.url == "/update/" + appName) {
            app = self.config.apps[appName];
            app.name = appName;
            res.writeHead(200); res.write('updating ' + appName); res.end();
            self.queueDeployment(app);
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
        console.log("Configuration update detected."); 
        if (this._working) return console.log("Currently deploying an application; configuration updates will be applied to future deployments.");
        self.loadConfig(cfgPath);
    });
};

module.exports = CI;
