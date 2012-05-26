var util = require('util');
var http = require('http');
var EventEmitter = require('events').EventEmitter;

var log = require('logmagic').local('csbot-github.server');

/**
 * Web server which listens for webhook events and emits the following events:
 *
 * - pull_request_synced - emitted when a pull request has been opened or updated
 * - pull_request_closed - emitted when a pull request has been closed
 */
function WebServer(options) {
    EventEmitter.call(this);

    this._options = options;

    this._ip = options['ip'];
    this._port = options['port'];

    this._server = null;
}

util.inherits(WebServer, EventEmitter);

WebServer.prototype.start = function () {
    this._listen(this._ip, this._port);
};

WebServer.prototype.stop = function () {
    var self = this;

    if (this._server) {
        this._server.close();
        this._server.on('close', function onClose() {
            self.server = null;
        });
    }
};

WebServer.prototype._listen = function (ip, port) {
    this._server = http.createServer(this._handleRequest.bind(this));
    this._server.listen(port, ip);

    log.infof('Server listening at http://${ip}:${port}/',
        {'ip':ip, 'port':port});
};

WebServer.prototype._handleRequest = function (req, res) {
    var self = this,
        payload = '';

    req.on('data', function onData(chunk) {
        payload += chunk;
    });

    req.on('end', function onEnd() {
        try {
            payload = JSON.parse(payload);
            self._handlePayload(payload);
        }
        catch (err) {
            log.errorf('Failed to parse request body: ${err}', {'err':err.toString()});
        }
        finally {
            res.end();
        }
    });
};

WebServer.prototype._handlePayload = function (payload) {
    if (payload.action && payload.pull_request) {
        this._handlePullRequestEvent(payload);
    }
    else {
        log.errorf('Invalid pull request event: ${payload}, ignoring...', {'payload': payload});
    }
};

WebServer.prototype._handlePullRequestEvent = function (payload) {
    switch (payload.action) {
        case 'opened':
        case 'reopened':
        case 'synchronize':
            log.infof('Pull Request synced, emitting "pull_request_synced"...');
            this.emit('pull_request_synced', payload.pull_request);
            break;
        case 'closed':
            log.infof('Pull Request closed, emitting "pull_request_closed"...');
            this.emit('pull_request_closed', payload.pull_request);
            break;
        default:
            // do nothing
    }
};

exports.WebServer = WebServer;
