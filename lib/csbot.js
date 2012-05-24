var spawn = require('child_process').spawn;

var log = require('logmagic').local('csbot-github.csbot');

var utils = require('./utils');

function CsBot(csbotgithub, options) {
    this._options = options;

    csbotgithub.on('new_pull_request', this._cloneRepository.bind(this));
    this.on('repository_cloned', this._referenceCheckout.bind(this));
    this.on('repository_cloned', this._addRemote.bind(this));
    this.on('repository_checkout', this._checkCs.bind(this));
    this.on('discard_clone', this._removeRepository.bind(this));
}

CsBot.prototype._cloneRepository = function (pr, files) {
    var self    = this,
        owner   = pr.head.owner.login,
        repo    = pr.head.repo.name,
        git_url = pr.head.repo.git_url;

    git = spawn('git',
        ['clone', '--depth=100', '--quiet', git_url, owner + '/' + repo]);
    git.on('exit', function (code) {
        if (code !== 0) {
            log.errorf('git clone failed ' + code);
        }
        this.emit('repository_cloned', pr, files);
    });
};

CsBot.prototype._referenceCheckout = function (pr, files) {
    var self  = this,
        owner = pr.head.owner.login,
        repo  = pr.head.repo.name,
        sha   = pr.head.sha;

    git = spawn('git',
        ['checkout', '-qf', sha],
        { cwd: owner + '/' + repo });
    git.on('exit', function (code) {
        if (code !== 0) {
            log.errorf('git checkout failed ' + code);
        }
        this.emit('repository_checkout', pr, files);
    });
};

CsBot.prototype._addRemote = function (pr, files) {
    var self    = this,
        owner   = pr.head.owner.login,
        repo    = pr.head.repo.name,
        sha     = pr.head.sha;

    git = spawn('git',
        ['remote', 'add', 'csbot', utils.getGitUrlWritable(self._options['github_username'], repo)],
        { cwd: owner + '/' + repo });
    git.on('exit', function (code) {
        if (code !== 0) {
            log.errorf('git remote failed ' + code);
        }
        this.emit('repository_remote', pr, files);
    });
};

CsBot.prototype._checkCs = function (pr, files) {
    var self = this,
        repo = pr.head.repo.name;

    csfixer = spawn('php',
        ['php-cs-fixer', '-v', 'fix', files],
        { cwd: owner + '/' + repo });
    csfixer.stdout.on('data', function (data) {
        output += data;
    });
    csfixer.on('exit', function (code) {
        if (code !== 0) {
            log.errorf('php-cs-fixer failed ' + code);
        }
        this.emit('cs-fixed', pr, output);
    });
};

CsBot.prototype._removeRepository = function (pr) {
    var self    = this,
        owner   = pr.head.owner.login,
        repo    = pr.head.repo.name;

    rm = spawn('rm',
        ['-rf', owner + '/' + repo]);
};

exports.CsBot = CsBot;