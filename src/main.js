#!/usr/bin/env node

var fs = require("fs");

var util    = require("./util");
var CI      = require("./instaci");

var program = require('commander')
    .version('0.0.1')
    .option('-n, --new', 'Create config file.')
    .option('-d, --debug', 'Print debug information to the console.')
    .option('-b, --build', 'Build all apps on startup.')
    .parse(process.argv);

var cwd     = process.cwd();
var cfgName = ".instaci.json";
var cfgPath = cwd + "/" + cfgName;

if (program.new) {
    util.writeNewConfig(cfgPath);
    process.exit(0);
}

if (program.debug) {
    util.enableDebug();
}

if ( ! fs.existsSync("workspace") ) fs.mkdirSync("workspace");
if ( ! fs.existsSync("deployed") ) fs.mkdirSync("deployed");

console.log('');
//var config = instaci.loadConfig(cfgPath, true);
//if ( ! config ) return console.error("Configuration failed to load.");

var ci = new CI(cfgPath, true);
ci.startHttpServer(program.build);
