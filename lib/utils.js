function genWorkName(pr) {
    var user = pr.head.user.login,
        sha = pr.head.sha,
        repository = pr.head.repo.name;
    return user + '_' + repository + '_' + sha.substr(0,8);
}

function getGitUrlWritable(user, repo) {
    return 'git@github.com:' + user + '/' + repo + '.git';
}

function getPropertyValue(properties, name) {
    // Properties is a triple: [name, value, something]
    var i, propertiesLen, property;

    propertiesLen = properties.length;

    for (i = 0; i < propertiesLen; i++) {
        property = properties[i];
        if (property[0].toLowerCase() === name) {
            return property[1];
        }
    }

    return null;
}

/**
 * Initialize an array of <code>length</code> elements with <code>value</code> as default value.
 *
 * @param value  Default value
 * @param length Array length
 * @return {Array}
 */
function makeArrayOf(value, length) {
    var arr = [], i = length;
    while (i--) {
        arr[i] = value;
    }
    return arr;
}

exports.genWorkName = genWorkName;
exports.getGitUrlWritable = getGitUrlWritable;
exports.getPropertyValue = getPropertyValue;
exports.makeArrayOf = makeArrayOf;