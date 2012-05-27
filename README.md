A simple stub (not tested) for a hypothetical GitHub bot written in NodeJS.

This bot handle `pull_request` events (GiHub API v3) and do the following steps.

-> Look for modified files in the pull request.
-> If there are files clone the collaborator repository to local.
    -> Checkout the git reference used in the pull_request.
    -> Run a cs-fixer
    -> If there are files changed
        -> Create a commit with the modifications.
        -> Open a GitHub's Pull Request to the collaborator with the fixes.
        -> Create a comment in the original pull request with a link to the PR opened to the collaborator.
    -> Else
        -> Create a comment in the original pull request with the CS status for that PR (clean status)


** Execute

node bin/csbot-github --config=<custom config file>

** Register the bot for pull_request events.

`GitHub Username` must have enough privileges in `<target repository>`

```bash
curl -u "<GitHub Username>" -H "Content-Type: application/json" -X POST -d '{
 "name": "web",
  "active": true,
  "events": ["pull_request"],
  "config": {
    "url": "<bot IP:PORT>",
    "content_type": "json"
  }
}' https://api.github.com/repos/<target user>/<target repository>/hooks
```

** Get an OAuth 2 token

```bash
curl -u "<GitHub Username>" -H "Content-Type: application/json" -X POST -d '{
  "scopes": [
    "public_repo"
  ],
  "note": "cs-bot"
}' https://api.github.com/authorizations
```