var util = require('util');
var EventEmitter = require('events').EventEmitter;
var spawn = require('child_process').spawn;
var path = require('path');

var log = require('logmagic').local('csbot-github.csbot');

require('shelljs/global');
var utils = require('./utils');

function CsBot(csbotgithub, options) {
    EventEmitter.call(this);
    this._options = options;

    csbotgithub.on('new_pull_request', this._cloneRepository.bind(this));
    this.on('repository_cloned', this._referenceCheckout.bind(this));
    this.on('repository_cloned', this._addRemote.bind(this));
    this.on('repository_checkout', this._checkCs.bind(this));
    this.on('discard_clone', this._deleteRepository.bind(this));
    csbotgithub.on('discard_clone', this._deleteRepository.bind(this));
}

util.inherits(CsBot, EventEmitter);

CsBot.prototype._cloneRepository = function (pr, files) {
    var self    = this,
        user    = pr.head.user.login,
        repo    = pr.head.repo.name,
        git_url = pr.head.repo.git_url;

    var git = spawn(self._options['binaries']['git'],
        [ 'clone', '--quiet', git_url, path.join(user, repo) ],
        { cwd: this._options['general']['checkout_dir'] }
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
        log.infof('Respository clone completed, emitting "repository_cloned"...');
        self.emit('repository_cloned', pr, files);
    });
};

CsBot.prototype._referenceCheckout = function (pr, files) {
    var self = this,
        user = pr.head.user.login,
        repo = pr.head.repo.name,
        sha  = pr.head.sha;

    var git = spawn(self._options['binaries']['git'],
        [ 'checkout', '-qf', sha ],
        { cwd: path.join(this._options['general']['checkout_dir'], user, repo) }
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

CsBot.prototype._addRemote = function (pr, files) {
    var self = this,
        user = pr.head.user.login,
        repo = pr.head.repo.name;

    var git = spawn(self._options['binaries']['git'],
        [ 'remote', 'add', 'csbot', utils.getGitUrlWritable(self._options['github']['username'], repo) ],
        { cwd: path.join(this._options['general']['checkout_dir'], user, repo) }
    );
    git.stderr.on('data', function (data) {
        console.log('stderr: ' + data);
    });
    git.on('exit', function (code) {
        if (code !== 0) {
            log.errorf('git remote failed ' + code);
            self.emit('discard_clone', pr);
            return;
        }
        log.infof('Remote added, emitting "repository_remote"...');
        this.emit('repository_remote', pr, files);
    });
};

CsBot.prototype._checkCs = function (pr, files) {
    var self    = this,
        user    = pr.head.user.login,
        repo    = pr.head.repo.name,
        counter = files.length,
        output  = [];

    var callback = function () {
        counter--;
        if (counter == 0) {
            log.infof('CS Fix completed, emitting "cs-fixed"...');
            self.emit('cs-fixed', pr, output.join("\n"));
        }
    }

    for (var i = 0; i < counter; i++) {
        var csfixer = spawn(self._options['binaries']['php'],
            [ self._options['binaries']['php-cs-fixer'],
                '-v', 'fix', files[i] ],
            { cwd:path.join(this._options['general']['checkout_dir'], user, repo) }
        )
        csfixer.stdout.on('data', function (data) {
            output[i] = data;
        });
        csfixer.stderr.on('data', function (data) {
            console.log('stderr: ' + data);
        });
        csfixer.on('exit', callback);
    }
};

CsBot.prototype._deleteRepository = function (pr) {
    log.infof('Deleting Repository');
    var user = pr.head.user.login,
        repo = pr.head.repo.name;

    rm('-rf', path.join(this._options['general']['checkout_dir'], user, repo));
};

exports.CsBot = CsBot;
