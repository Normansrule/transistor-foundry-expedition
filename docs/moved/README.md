# Note for the old site address

GitHub renames forward the repository and `git` URLs, but **not** the GitHub Pages site. After the rename, the old address (formerly normansrule.github.io/transistor-odyssey) returns 404. These two files put a short "we moved" page there that also forwards deep links, so `…/devices.html#finfet` lands on the same page at the new address.

- `index.html`: the note, which forwards after a moment (or at once with JavaScript).
- `404.html`: the same page; GitHub Pages serves it for every other path, which is how deep links keep working.

Two ways to publish them. Pick one.

1. **You already have a user site** (a repository named `Normansrule/normansrule.github.io`): create the folder named after the old repository there (formerly transistor-odyssey/) and copy `index.html` into it. Deep links other than the front page will not forward this way, because a user site has one 404 page for everything.
2. **No user site:** make a new public repository with the old name (formerly transistor-odyssey), put both files at its root, and turn on Pages from the `main` branch. Deep links forward. Catch: once a repository with the old name exists, GitHub stops forwarding the old *repository* URL to the renamed one, so update any `git remote` that still points at the old name first.

The commands are in the v1.11 release notes.
