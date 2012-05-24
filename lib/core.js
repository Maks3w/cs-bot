var util = require('util');
var EventEmitter = require('events').EventEmitter;
var spawn = require('child_process').spawn;

var GitHubApi = require("github");
var log = require('logmagic').local('csbot-github.core');

var CsBot = require('./csbot').CsBot;
var utils = require('./utils');
var server = require('./server');

function CsBotGithub(options) {
    this._options = options;

    this._buildbotPoller = null;
    this._server = null;
}

util.inherits(CsBotGithub, EventEmitter);

CsBotGithub.prototype._initialize = function () {
    var options;

    this._github = new GitHubApi({
        version: '3.0.0'
    });
    this._github.authenticate({
        type: "token",
        username: this._options['github']['username'],
        token: this._options['github']['token']
    });

    // Set up server which listens for webhook events
    this._server = new server.WebServer(this._options['webserver']);

    // Set up CsBot instance
    this._csbot = new CsBot(this);

    // Register change handlers
    this._server.on('pull_request_closed', this._handlePullRequestClosed.bind(this));
    this._server.on('pull_request_synced', this._handlePullRequestSynced.bind(this));
    this._csbot.on('cs-fixed', this._handleCsFixed.bind(this));
    this.on('commit_pushed', this._createPullRequest.bind(this));
};

CsBotGithub.prototype.start = function () {
    this._initialize();

    this._server.start();
    this._buildbotPoller.start();
};

CsBotGithub.prototype.stop = function () {
    this._server.stop();
    this._buildbotPoller.stop();
};

/**
 * Delete a branch when the PR is closed
 *
 * @param pr pull_request
 * @private
 */
CsBotGithub.prototype._handlePullRequestClosed = function (pr) {
    var self        = this,
        owner       = pr.head.owner.login,
        repository  = pr.repo.name,
        reference   = pr.head.ref;

    self._github.gitData.deleteReference({
        user: author,
        repo: repository,
        ref: utils.genBranchName(owner, reference)
    }, function(err, data) {
        // Do nothing
    });
};

/**
 * Clone the repo if there is at least one file added or modified.
 *
 * @param pr pull_request
 * @private
 */
CsBotGithub.prototype._handlePullRequestSynced = function (pr) {
    var self = this,
        author = pr.head.user.login,
        repository = pr.head.repo.name;

    self._github.pullRequests.getFiles({
        user: author,
        repo: repository,
        number: pr.number
    }, function(err, data) {
        if (err) {
            log.errorf('Getting files failed: ${err}', {'err': err});
            return;
        }
        files = new Array();
        pullFiles = JSON.parse(data);
        pullFiles.forEach(function(file){
            switch (file['status']) {
                case 'added':
                case 'modified':
                    files.push(file['filename']);
                    break;
                default:
                    // Do nothing
            }
        });
        if(files.length != 0) {
            log.infof('Pull Request modified, emitting "new_pull_request"...');
            self.emit('new_pull_request', pr, files);
        } else {
            log.infof("Pull Request doesn't have modified files");
        }
    });
};

CsBotGithub.prototype._handleCsFixed = function (pr, output) {
    var self  = this,
        owner = pr.head.owner.login,
        repo  = pr.head.repo.name,
        sha   = pr.head.sha;

    if (output){
        gitcommit = spawn('git',
            ['commit', '-am', output],
            { cwd: owner + '/' + repo });

        gitcommit.on('exit', function (code) {
            if (code !== 0) {
                log.errorf('git commit failed ' + code);
            }
            gitpush = spawn('git',
                ['push', 'csbot'],
                { cwd: owner + '/' + repo });

            gitpush.on('exit', function (code) {
                if (code !== 0) {
                    log.errorf('git push failed ' + code);
                }
                self.emit('commit_pushed', pr, output);
            });
        });
    } else {
        self.emit('discard_clone', pr);
    }
};

CsBotGithub.prototype._createPullRequest = function (pr, output) {
    var self        = this,
        owner       = pr.head.owner.login,
        repository  = pr.repo.namel,
        reference   = pr.head.rf;

    self._github.pullRequests.create({
        user: this._options['github']['username'],
        repo: repository,
        title: 'cs fixer',
        body: output,
        base: reference,
        head: utils.genBranchName(owner, reference)
    }, function(err, data) {
        if (err) {
            log.errorf('Pull request create failed: ${err}', {'err': err});
        } else {
            // Add comment
        }
        self.emit('discard_clone', pr);
    });
};


exports.CsBotGithub = CsBotGithub;