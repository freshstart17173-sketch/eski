/* eski-polish measurement overlay
 * Injects numeric alignment / spacing / distribution values ON TOP of every element
 * in a container, so a screenshot carries the real px numbers and no small fumble hides.
 *
 * Usage (inside Playwright page.evaluate, or paste into a page context):
 *   __pm('.umodal .ubody')          // measure one container's direct children
 *   __pm('.arena .meta', {edges:1}) // also label each child's inset to container edges
 *   __pmClear()                     // remove all overlays
 *
 * What it draws per container:
 *   - a blue outline around each direct child + its W×H
 *   - x<n>  : each child's LEFT offset from the container's content box (alignment ruler —
 *             equal numbers down a column = aligned; a stray value = a misalignment)
 *   - <n>   : the GAP between consecutive children (red if it differs from the group's
 *             most-common gap → uneven distribution; green if consistent)
 *   - pl/pr/pt/pb : the container's own padding on each side
 *   - (edges:1) e<n> : each child's distance to the nearest container edge
 *
 * Read the numbers against the token scale — every gap/padding should be a --s value
 * (4 / 8 / 12 / 16 / 24). A "13" or "15" is the bug.
 */
(function () {
  function clear() {
    document.querySelectorAll('.__pm').forEach(function (n) { n.remove(); });
  }
  function layer() {
    var l = document.querySelector('#__pmLayer');
    if (!l) {
      l = document.createElement('div');
      l.id = '__pmLayer'; l.className = '__pm';
      l.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;font:10px/1 ui-monospace,monospace';
      document.body.appendChild(l);
    }
    return l;
  }
  function tag(x, y, txt, bg) {
    var d = document.createElement('div'); d.className = '__pm';
    d.style.cssText = 'position:fixed;left:' + x + 'px;top:' + y + 'px;transform:translate(-50%,-50%);'
      + 'background:' + bg + ';color:#fff;padding:1px 3px;border-radius:2px;white-space:nowrap;font-weight:600';
    d.textContent = txt; layer().appendChild(d);
  }
  function mode(arr) {
    var m = {}, best = arr[0], n = 0;
    arr.forEach(function (v) { m[v] = (m[v] || 0) + 1; if (m[v] > n) { n = m[v]; best = v; } });
    return best;
  }
  window.__pmClear = clear;
  window.__pm = function (selector, opts) {
    opts = opts || {};
    layer();
    document.querySelectorAll(selector).forEach(function (c) {
      var cr = c.getBoundingClientRect();
      var cs = getComputedStyle(c);
      var pad = { l: parseFloat(cs.paddingLeft) || 0, r: parseFloat(cs.paddingRight) || 0, t: parseFloat(cs.paddingTop) || 0, b: parseFloat(cs.paddingBottom) || 0 };
      // container outline + paddings
      var box = document.createElement('div'); box.className = '__pm';
      box.style.cssText = 'position:fixed;left:' + cr.left + 'px;top:' + cr.top + 'px;width:' + cr.width + 'px;height:' + cr.height + 'px;outline:1px solid rgba(0,200,120,.7)';
      layer().appendChild(box);
      tag(cr.left + 12, cr.top + 6, 'pl' + Math.round(pad.l), '#0a7');
      tag(cr.right - 12, cr.top + 6, 'pr' + Math.round(pad.r), '#0a7');
      tag(cr.left + 16, cr.top + 6 + 12, 'pt' + Math.round(pad.t), '#0a7');
      tag(cr.left + 16, cr.bottom - 6, 'pb' + Math.round(pad.b), '#0a7');

      var kids = [].slice.call(c.children).filter(function (k) {
        var r = k.getBoundingClientRect(); return r.width && r.height && getComputedStyle(k).display !== 'none';
      });
      if (!kids.length) return;
      var horizontal = kids.length > 1 &&
        Math.abs(kids[0].getBoundingClientRect().top - kids[1].getBoundingClientRect().top) < 4;

      var gaps = [];
      for (var i = 1; i < kids.length; i++) {
        var pr = kids[i - 1].getBoundingClientRect(), r = kids[i].getBoundingClientRect();
        gaps.push(Math.round(horizontal ? r.left - pr.right : r.top - pr.bottom));
      }
      var gmode = gaps.length ? mode(gaps) : null;

      kids.forEach(function (k, i) {
        var r = k.getBoundingClientRect();
        var o = document.createElement('div'); o.className = '__pm';
        o.style.cssText = 'position:fixed;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;outline:1px solid rgba(30,130,255,.6)';
        layer().appendChild(o);
        // size
        tag(r.left + r.width / 2, r.bottom - 6, Math.round(r.width) + '×' + Math.round(r.height), 'rgba(30,30,30,.85)');
        // alignment ruler: left offset from content box
        tag(r.left, r.top - 7, 'x' + Math.round(r.left - (cr.left + pad.l)), '#18f');
        // gap to previous sibling
        if (i > 0) {
          var pv = kids[i - 1].getBoundingClientRect();
          var gap = Math.round(horizontal ? r.left - pv.right : r.top - pv.bottom);
          var col = (gap === gmode) ? '#0a7' : '#e11';
          var mx = horizontal ? (pv.right + r.left) / 2 : (cr.left + pad.l + 8);
          var my = horizontal ? (r.top + r.height / 2) : (pv.bottom + r.top) / 2;
          tag(mx, my, gap + '', col);
        }
        // edges to container (optional)
        if (opts.edges) {
          tag((r.left + cr.left + pad.l) / 2, r.top + r.height / 2, 'e' + Math.round(r.left - (cr.left + pad.l)), '#a06');
          tag((r.right + cr.right - pad.r) / 2, r.top + r.height / 2, 'e' + Math.round((cr.right - pad.r) - r.right), '#a06');
        }
      });
    });
  };
})();
