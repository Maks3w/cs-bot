var util = require('util');
var EventEmitter = require('events').EventEmitter;
var spawn = require('child_process').spawn;
var path = require('path');

var GitHubApi = require("github");
var log = require('logmagic').local('csbot-github.core');

var CsBot = require('./csbot').CsBot;
var utils = require('./utils');
var server = require('./server');

function CsBotGithub(options) {
    EventEmitter.call(this);
    this._options = options;

    this._server = null;
}

util.inherits(CsBotGithub, EventEmitter);

CsBotGithub.prototype._initialize = function () {
    this._github = new GitHubApi({
        version: '3.0.0'
    });
    this._github.authenticate({
        type: 'oauth',
        token: this._options['github']['token']
    });

    // Set up server which listens for webhook events
    this._server = new server.WebServer(this._options['webserver']);

    // Set up CsBot instance
    this._csbot = new CsBot(this, this._options);

    // Register change handlers
    this._server.on('pull_request_closed', this._handlePullRequestClosed.bind(this));
    this._server.on('pull_request_synced', this._handlePullRequestSynced.bind(this));
    this._csbot.on('cs-fixed', this._handleCsFixed.bind(this));
    this.on('good_pull_request', this._handleGoodPullRequest.bind(this));
    this.on('commit_pushed', this._createPullRequest.bind(this));
    this.on('pull_request_created', this._handlePullRequestCreated.bind(this));
    this.on('comment_created', this._handleCommentCreated.bind(this));
};

CsBotGithub.prototype.start = function () {
    this._initialize();

    this._server.start();
};

CsBotGithub.prototype.stop = function () {
    this._server.stop();
};

/**
 * Delete a branch when the PR is closed
 *
 * @param pr pull_request
 * @private
 */
CsBotGithub.prototype._handlePullRequestClosed = function (pr) {
    var self       = this,
        user       = pr.head.user.login,
        repository = pr.head.repo.name;

    self._github.gitdata.deleteReference({
        user: user,
        repo: repository,
        ref: utils.genWorkName(pr)
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
    var self       = this,
        user       = pr.head.user.login,
        repository = pr.head.repo.name;

    self._github.pullRequests.getFiles({
        user: user,
        repo: repository,
        number: pr.number
    }, function(err, response) {
        if (err) {
            log.errorf('Getting files failed: ${err}', {'err': err});
            return;
        }
        var files = new Array();
        response.forEach(function(file){
            switch (file['status']) {
                case 'added':
                case 'modified':
                case 'renamed':
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
            log.infof("Pull Request doesn't have modified files, emitting 'good_pull_request'...");
            self.emit('good_pull_request', pr);
        }
    });
};

CsBotGithub.prototype._handleCsFixed = function (pr, output) {
    var self       = this,
        repository = pr.head.repo.name;

    if (output){
        output = "CS Fixer results\n\n" + output;
        var gitcommit = spawn(self._options['binaries']['git'],
            ['commit', '-am', output],
            { cwd:path.join(this._options['general']['work_dir'], utils.genWorkName(pr)) }
        );
        gitcommit.stderr.on('data', function (data) {
            console.log('stderr: ' + data);
        });
        gitcommit.on('exit', function (code) {
            if (code !== 0) {
                log.errorf('git commit failed ' + code);
                self.emit('discard_clone', pr);
                return;
            }
            log.infof('Changes committed');

            var gitpush = spawn(self._options['binaries']['git'],
                [
                    'push',
                    utils.getGitUrlWritable(self._options['github']['username'], repository),
                    'HEAD:refs/heads/' + utils.genWorkName(pr)
                ],
                { cwd:path.join(self._options['general']['work_dir'], utils.genWorkName(pr)) }
            );
            gitpush.stderr.on('data', function (data) {
                console.log('stderr: ' + data);
            });
            gitpush.on('exit', function (code) {
                if (code !== 0) {
                    log.errorf('git push failed ' + code);
                    self.emit('discard_clone', pr);
                    return;
                }
                log.infof('Changes pushed, emitting "commit_pushed"...');
                self.emit('commit_pushed', pr, output);
            });
        });
    } else {
        log.infof('Without changes, emitting "discard_clone"...');
        self.emit('discard_clone', pr);
    }
};

CsBotGithub.prototype._createPullRequest = function (pr, output) {
    var self       = this,
        repository = pr.head.repo.name;

    self._github.pullRequests.create({
        user: this._options['github']['username'],
        repo: repository,
        title: 'cs fixer',
        body: output,
        base: pr.base.ref,
        head: utils.genWorkName(pr)
    }, function(err, data) {
        if (err) {
            log.errorf('Pull request create failed: ${err}', {'err': err});
            self.emit('discard_clone', pr);
            return;
        }
        log.infof('GH Pull Request created, emitting "pull_request_created"...');
        self.emit('pull_request_created', pr, data);
    });
};

CsBotGithub.prototype._handleGoodPullRequest = function (pr) {
    var comment = "This Pull Request don't have CS issues";
    this._addCommentToPr(pr, comment);
};

CsBotGithub.prototype._handlePullRequestCreated = function (pr, prOffered) {
    var comment = 'There are CS issues, the bot has open in your fork the PR ' + prOffered.base.repo.owner.login
        + '/' + prOffered.base.repo.name  + '#' + prOffered.number + ' to fix them';
    this._addCommentToPr(pr, comment);
};

CsBotGithub.prototype._handleCommentCreated = function (pr) {
    this.emit('discard_clone', pr);
};


CsBotGithub.prototype._addCommentToPr = function (pr, comment) {
    var self = this;

    self._github.issues.createComment({
        user: pr.base.repo.owner.login,
        repo: pr.base.repo.name,
        number: pr.number,
        body: comment
    }, function(err, data) {
        if (err) {
            log.errorf('Comment create failed: ${err}', {'err': err});
            return;
        }
        log.infof('Comment created, emitting "comment_created"...');
        self.emit('comment_created', pr);
    });
};


exports.CsBotGithub = CsBotGithub;