#!/usr/bin/env node

var Promise = require('bluebird');
var _ = require('lodash');
var request = require('request-promise');
var throat = require('throat')(Promise);
var exec = Promise.promisifyAll(require('child_process')).execAsync;
var fs = Promise.promisifyAll(require('fs'));
var path = require('path');
var mkdirp = require('mkdirp-promise');
var args = require('minimist')(process.argv.slice(2));

var debug = args.d || args.debug;
if (debug) console.log('Args:', args);

if (args.h || args.help) {
    var i = (v) => '\n' + Array(v + 1).join('\t');

    console.log(
        'Options:' +
        i(1) + '-r' +
        i(2) + 'Greyhound resource path (required)' +
        i(2) + 'E.g.: http://greyhound:8080/resource/autzen' +
        '\n' +
        i(1) + '-n' +
        i(2) + 'Namespace for the dimension set being produced (required)' +
        '\n' +
        i(1) + '-p' +
        i(2) + 'File path to JSON array of PDAL pipeline filters (required)' +
        i(2) + 'See https://www.pdal.io/pipeline.html\n' +
        i(2) + 'Note: within this pipeline, any instances of NAME will be ' +
        i(2) + 'replaced with the value from the `-n` option' +
        '\n' +
        i(1) + '-o' +
        i(2) + 'Output location for pipelines (defaults to directory of `-p` ' +
        i(2) + 'parameter + "/pipelines")' +
        '\n' +
        i(1) + '-s' +
        i(2) + 'Number of steps by which to tile the resource (default: 6)' +
        i(2) + 'For example, `-s 6` splits the resource into a 6x6 grid' +
        '\n' +
        i(1) + '-b' +
        i(2) + 'Optional percentage by which to buffer each tile to remove ' +
        i(2) + 'edge effects.  A value of 0.10 increases the size of each ' +
        i(2) + 'tile by 10% (default: 0 - meaning tiles do not overlap)' +
        '\n' +
        i(1) + '-j' +
        i(2) + 'Number of pipelines to run concurrently (default: 4)' +
        '\n' +
        i(1) + '-h, --help' +
        i(2) + 'Print this message and exit' +
        '\n' +
        i(1) + '-d, --debug' +
        i(2) + 'Log extra information from PDAL' +
        '\n' +
        i(1) + '-x, --norun' +
        i(2) + 'Generate and write pipeline files, but don\'t execute them' +
        '\n'
    );

    process.exit();
}

if (!args.r) throw new Error('Resource is required (see --help)');
if (!args.p) throw new Error('Pipeline is required (see --help)');
if (!args.n) throw new Error('Name is required (see --help)');

var base = args.r;
if (!base.includes('/')) base = 'http://greyhound:8080/resource/' + base;
if (base[base.length - 1] != '/') base += '/';
var pipeline = require(args.p);
var name = args.n;
var buffer = args.b;
var steps = parseInt(args.s) || 6;
var threads = parseInt(args.j) || 4;
var output = args.o || path.join(path.dirname(args.p), 'pipelines');

pipeline = JSON.parse(JSON.stringify(pipeline).replace(/NAME/g, name));

console.log('Resource:', base);
console.log('Output:', output);
console.log('Tiles:', steps + 'x' + steps);
console.log('Threads:', threads);
console.log('Filters:', JSON.stringify(pipeline, null, 2));

var files = [];
var failed = false;

mkdirp(path.join(output, name))
.then(() => request({ uri: base + 'info', json: true }))
.then((info) => {
    var minx = info.bounds[0];
    var miny = info.bounds[1];
    var maxx = info.bounds[3];
    var maxy = info.bounds[4];
    var width = maxx - minx;
    var depth = maxy - miny;

    var tileDim = name + '/Tile';
    var tile = 0;
    var total = steps * steps;

    var writes = [];

    for (var i = 0; i < steps; ++i) {
        for (var j = 0; j < steps; ++j) {
            var bounds = [
                minx + (width / steps) * i,
                miny + (depth / steps) * j,
                minx + (width / steps) * (i + 1),
                miny + (depth / steps) * (j + 1)
            ];

            var reader = {
                type: 'readers.greyhound',
                url: base + 'read?bounds=' + JSON.stringify(bounds),
                buffer: buffer
            };
            var ferry = {
                type: 'filters.ferry',
                dimensions: 'OriginId=' + tileDim
            };
            var assign = {
                type: 'filters.assign',
                assignment: tileDim + '[:]=' + tile
            };

            // User pipeline is inserted at this point.

            var writer = {
                type: 'writers.greyhound',
                name: name
            };

            var f = path.join(output, name + '/' + tile + '.json');
            var p = [reader, ferry, assign]
                .concat(pipeline)
                .concat(writer);
            p = JSON.stringify({ pipeline: p }, null, 4);

            files.push(f);
            writes.push(fs.writeFileAsync(f, p));

            ++tile;
        }
    }

    return Promise.all(writes);
})
.then(() => console.log('Pipelines written'))
.then(() => {
    if (args.norun) return null;

    var c = 'pdal pipeline ' + (debug ? '--debug ' : '');
    var e = { encoding: 'utf8' };

    return Promise.all(files.map(throat(threads, (f, i) => {
        if (!failed) console.log((i + 1) + '/' + files.length);
        return exec(c + f, e).then((output) => {
            if (output) console.log(output)
        });
    })));
})
.then(() => {
    if (!args.norun) console.log('Pipelines executed');
})
.catch((e) => {
    failed = true;
    console.log('Failed:', e)
});

