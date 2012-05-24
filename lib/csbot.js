var util = require('util');
var EventEmitter = require('events').EventEmitter;
var spawn = require('child_process').spawn;

var log = require('logmagic').local('csbot-github.csbot');

var utils = require('./utils');

function CsBot(csbotgithub, options) {
    EventEmitter.call(this);
    this._options = options;

    csbotgithub.on('new_pull_request', this._cloneRepository.bind(this));
    this.on('repository_cloned', this._referenceCheckout.bind(this));
    this.on('repository_cloned', this._addRemote.bind(this));
    this.on('repository_checkout', this._checkCs.bind(this));
    this.on('discard_clone', this._deleteRepository.bind(this));
}

util.inherits(CsBot, EventEmitter);

CsBot.prototype._cloneRepository = function (pr, files) {
    var self    = this,
        user    = pr.head.user.login,
        repo    = pr.head.repo.name,
        git_url = pr.head.repo.git_url;

    var git = spawn(self._options['binaries']['git'],
        ['clone', '--depth=100', '--quiet', git_url, user + '/' + repo]);
    git.on('exit', function (code) {
        if (code !== 0) {
            log.errorf('git clone failed ' + code);
            self.emit('discard_clone', pr);
            return;
        }
        self.emit('repository_cloned', pr, files);
    });
};

CsBot.prototype._referenceCheckout = function (pr, files) {
    var self = this,
        user = pr.head.user.login,
        repo = pr.head.repo.name,
        sha  = pr.head.sha;

    var git = spawn(self._options['binaries']['git'],
        ['checkout', '-qf', sha],
        { cwd: user + '/' + repo });
    git.on('exit', function (code) {
        if (code !== 0) {
            log.errorf('git checkout failed ' + code);
            self.emit('discard_clone', pr);
            return;
        }
        self.emit('repository_checkout', pr, files);
    });
};

CsBot.prototype._addRemote = function (pr, files) {
    var self = this,
        user = pr.head.user.login,
        repo = pr.head.repo.name;

    var git = spawn(self._options['binaries']['git'],
        ['remote', 'add', 'csbot', utils.getGitUrlWritable(self._options['github']['username'], repo)],
        { cwd: user + '/' + repo });
    git.on('exit', function (code) {
        if (code !== 0) {
            log.errorf('git remote failed ' + code);
            self.emit('discard_clone', pr);
            return;
        }
        this.emit('repository_remote', pr, files);
    });
};

CsBot.prototype._checkCs = function (pr, files) {
    var self   = this,
        user   = pr.head.user.login,
        repo   = pr.head.repo.name,
        output = '';

    var csfixer = spawn(self._options['binaries']['php'],
        [self._options['binaries']['php-cs-fixer'], '-v', 'fix', files],
        { cwd: user + '/' + repo });
    csfixer.stdout.on('data', function (data) {
        output += data;
    });
    csfixer.on('exit', function (code) {
        if (code !== 0) {
            log.errorf('php-cs-fixer failed ' + code);
            self.emit('discard_clone', pr);
            return;
        }
        self.emit('cs-fixed', pr, output);
    });
};

CsBot.prototype._deleteRepository = function (pr) {
    var user = pr.head.user.login,
        repo = pr.head.repo.name;

    var rm = spawn('rm',
        ['-rf', user + '/' + repo]);
};

exports.CsBot = CsBot;