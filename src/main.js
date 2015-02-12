#!/usr/bin/env node

var fs = require('fs');
var path = require('path');
var spawn = require('child_process').spawn;

var rimraf = require('rimraf');

var util    = require('./util');
var CI      = require('./instaci');

var program = require('commander')
    .version('0.0.1')
    .option('-n, --new', 'Create config file')
    .option('-d, --debug', 'Print debug information to the console')
    .option('-b, --build', 'Build all apps on startup')
    .option('-u, --update [app]', 'Update specified app')
    .option('-l, --log [app]', 'View deployment log of specified app')
    .parse(process.argv);

var cwd     = process.cwd();
var cfgName = '.instaci.json';
var cfgPath = cwd + '/' + cfgName;

(function () {
    if (program.update) {
        console.log('HTTP: ' + util.http.update(program.update));
        console.log('');
        return;
    }

    if (program.log) {
        process.stdin.pause();
        process.stdin.setRawMode(false);

        var child = spawn('less', ['+F', path.join('logs', program.log + '.log')], {
            detached: true,
            stdio: 'inherit'
        });

        child.on('exit', function () {
            process.exit(0);
        });

        process.on('SIGINT', function () {
            child.kill('SIGINT');
        });

        return;
    }

    if (program.new) {
        util.writeNewConfig(cfgPath);
        return;
    }

    if (program.debug) {
        util.enableDebug();
    }

    rimraf.sync('workspace');
    fs.mkdirSync('workspace');
    fs.mkdirSync(path.join('workspace', 'scripts'));
    if ( ! fs.existsSync('deployed') ) fs.mkdirSync('deployed');
    if ( ! fs.existsSync('logs') ) fs.mkdirSync('logs');

    console.log('');
    console.log('------------------------------------------------------------------------------------------------');
    console.log('------------------------------------------------------------------------------------------------');
    console.log('');
    var ci = new CI(cfgPath, true);
    ci.startHttpServer(program.build);
}());
