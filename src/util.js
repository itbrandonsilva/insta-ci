"use strict";

var fs = require("fs");
var exec = require('child_process').exec;
var request = require('request');
var ex = module.exports;

var debug = false;

exec = (function () {
    var orig = exec;
    return function (cmd, options, cb) {
        options = options || {};
        orig.call(this, cmd, options, function (err, stdout, stderr) {
            if (debug) {
                console.log("Error: "); console.log(err);
                console.log("stdout: "); console.log(stdout);
                console.log("stderr: "); console.log(stderr);
            }
            //if (stderr) return cb(stderr, stdout, stderr);
            cb(err, stdout, stderr);
        });
    };
}());

ex.exec = exec;

ex.writeNewConfig = function (path) {
    console.log("Writing insta-ci config: " + path);
    var result = fs.writeFileSync(path, JSON.stringify({
        "host": "127.0.0.1",
        "port": 11001,
        "apps": {
            "my-app": {
                "repository": "git@github.com:johndoe/my-app.git",
                "build": "npm install; npm test;",
                "install": "!s:deploy",
            },
        },
        "scripts": {
            "deploy": "echo 'Deploy my-app.';",
        },
        "plugins": []
    }, null, '\t'));
}

ex.enableDebug = function () {
    debug = true;
}

ex.http = {
    update: function (host, port, appName) {
        var url = "http://" + host + ":" + port + "/update/" + appName;
        request(url, function () {});
    }
}

/*ex.plugin = function (module) {
    var plugin;
    fs.exists(module + "/" + path, function (exists) {
        if (exists) plugin = require(module);
    });
    return plugin;
}*/
