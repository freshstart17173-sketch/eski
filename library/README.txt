eski library folder
===================

Drop .eski files in here. The library page (index.html, the home page) reads this folder,
pulls the cover + title straight out of each file's manifest, and shows them
as a grid. Clicking a cover opens it in the reader.

Zero config on any server that lists directories (local dev servers, Apache /
nginx autoindex, `python -m http.server`, `npx serve`).

On a host that does NOT list directories (e.g. GitHub Pages), add an
index.json next to this file listing the filenames, for example:

  { "entries": ["my-comic.eski", "another.eski"] }

or just an array:

  ["my-comic.eski", "another.eski"]

Either form works; entries may also be objects like
{ "file": "my-comic.eski", "title": "override title" }.
