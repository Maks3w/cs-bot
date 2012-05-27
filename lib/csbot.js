var util = require('util');
var EventEmitter = require('events').EventEmitter;
var spawn = require('child_process').spawn;
var path = require('path');

require('shelljs/global');
var log = require('logmagic').local('csbot-github.csbot');

var utils = require('./utils');

function CsBot(csbotgithub, options) {
    EventEmitter.call(this);
    this._options = options;

    csbotgithub.on('new_pull_request', this._cloneRepository.bind(this));
    this.on('repository_cloned', this._checkoutReference.bind(this));
    this.on('repository_checkout', this._checkCs.bind(this));
    this.on('discard_clone', this._deleteRepository.bind(this));
    csbotgithub.on('discard_clone', this._deleteRepository.bind(this));
}

util.inherits(CsBot, EventEmitter);

CsBot.prototype._cloneRepository = function (pr, files) {
    var self    = this,
        git_url = pr.head.repo.git_url;

    var git = spawn(self._options['binaries']['git'],
        [ 'clone', '--quiet', git_url, utils.genWorkName(pr) ],
        { cwd: this._options['general']['work_dir'] }
    );
    git.stderr.on('data', function (data) {
        console.log('stderr: ' + data);
    });
    git.on('exit', function (code) {
        if (code !== 0) {
            log.errorf('git clone failed ' + code);
            self.emit('discard_clone', pr);
            return;
        }
        log.infof('Repository clone completed, emitting "repository_cloned"...');
        self.emit('repository_cloned', pr, files);
    });
};

CsBot.prototype._checkoutReference = function (pr, files) {
    var self = this,
        sha  = pr.head.sha;

    var git = spawn(self._options['binaries']['git'],
        [ 'checkout', '-qf', sha ],
        { cwd: path.join(this._options['general']['work_dir'], utils.genWorkName(pr)) }
    );
    git.stderr.on('data', function (data) {
        console.log('stderr: ' + data);
    });
    git.on('exit', function (code) {
        if (code !== 0) {
            log.errorf('git checkout failed ' + code);
            self.emit('discard_clone', pr);
            return;
        }
        log.infof('Repository checkout completed, emitting "repository_checkout"...');
        self.emit('repository_checkout', pr, files);
    });
};

CsBot.prototype._checkCs = function (pr, files) {
    var self     = this,
        nFiles   = files.length,
        outputs  = utils.makeArrayOf('', nFiles),
        workpath = path.join(this._options['general']['work_dir'], utils.genWorkName(pr));

    var outputCallback = function (index) {
        return function() {
            outputs[index] += arguments[0]; // output(data)
        }
    };

    var endCallback = function () {
        nFiles--;
        if (nFiles == 0) {
            for (var i = 0; i < outputs.length; i++) {
                outputs[i] = outputs[i].replace(workpath, '').replace(/^(\s+)\d+\)\s+[/\\]?/, '');
            }
            log.infof('CS Fix completed, emitting "cs-fixed"...');
            self.emit('cs-fixed', pr, outputs.join(''));
        }
    };

    for (var i = 0; i < files.length; i++) {
        var csfixer = spawn(self._options['binaries']['php'],
            [ self._options['binaries']['php-cs-fixer'],
                '-v', 'fix', files[i] ],
            { cwd: workpath }
        );
        csfixer.stdout.on('data', outputCallback(i));
        csfixer.stderr.on('data', function (data) {
            console.log('stderr: ' + data);
        });
        csfixer.on('exit', endCallback);
    }
};

CsBot.prototype._deleteRepository = function (pr) {
    log.infof('Deleting Repository');

    rm('-rf', path.join(this._options['general']['work_dir'], utils.genWorkName(pr)));
};

exports.CsBot = CsBot;