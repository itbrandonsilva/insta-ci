#!/usr/bin/env node

var fs = require("fs");

var util    = require("./util");
var CI      = require("./instaci");

var program = require('commander')
    .version('0.0.1')
    .option('-n, --new', 'Create config file')
    .option('-d, --debug', 'Print debug information to the console')
    .option('-b, --build', 'Build all apps on startup')
    .option('-u, --update [app]', 'Update specified app')
    .parse(process.argv);

var cwd     = process.cwd();
var cfgName = ".instaci.json";
var cfgPath = cwd + "/" + cfgName;

(function () {
    if (program.update) {
        console.log("HTTP: " + util.http.update(program.update) + "\n");
        return;
    }

    if (program.new) {
        util.writeNewConfig(cfgPath);
        return;
    }

    if (program.debug) {
        util.enableDebug();
    }

    if ( ! fs.existsSync("workspace") ) fs.mkdirSync("workspace");
    if ( ! fs.existsSync("deployed") ) fs.mkdirSync("deployed");

    console.log('');
    var ci = new CI(cfgPath, true);
    ci.startHttpServer(program.build);
}());
