function genBranchName(user, ref) {
    return user + ref;
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

exports.genBranchName     = genBranchName;
exports.getGitUrlWritable = getGitUrlWritable;
exports.getPropertyValue  = getPropertyValue;