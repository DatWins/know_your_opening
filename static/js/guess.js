/* Guess the Move: type each of the winning side's moves and score against par.
   Each game page holds one <div class="gtm" data-game='{...}'> made by the "guessgame" shortcode. */
(function () {
  "use strict";
  var PIECES = window.GTM_PIECES;

  function ordinal(n) { var s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function moveNo(ply) { return Math.floor(ply / 2) + 1; }
  function label(ply, san) { return ply % 2 === 0 ? moveNo(ply) + "." + san : moveNo(ply) + "..." + san; }
  function norm(s) { return s.replace(/[\s+#!?()=\/x:\-]/gi, "").replace(/0/g, "O").replace(/e\.?p\.?$/i, ""); }

  function drawBoard(el, fen, last, flip) {
    el.innerHTML = "";
    var rows = fen.split(" ")[0].split("/");
    if (flip) rows = rows.slice().reverse();
    rows.forEach(function (row, r) {
      var files = [];
      for (var i = 0; i < row.length; i++) {
        var ch = row[i];
        if (/\d/.test(ch)) { for (var k = 0; k < +ch; k++) files.push(null); }
        else files.push(ch);
      }
      if (flip) files = files.slice().reverse();
      files.forEach(function (piece, f) { addSq(el, r, f, piece, last, flip); });
    });
  }
  function addSq(el, r, f, piece, last, flip) {
    var d = document.createElement("div");
    var name = "abcdefgh"[flip ? 7 - f : f] + (flip ? r + 1 : 8 - r);
    d.className = "gtm-sq " + ((r + f) % 2 ? "d" : "l") + (last && (last.from === name || last.to === name) ? " last" : "");
    if (piece) {
      var img = document.createElement("img");
      img.alt = ""; img.src = "data:image/svg+xml;utf8," + encodeURIComponent(PIECES[piece]);
      d.appendChild(img);
    }
    el.appendChild(d);
  }

  function setup(root) {
    var GAME = JSON.parse(root.getAttribute("data-game"));
    var q = function (sel) { return root.querySelector(sel); };
    var MOVES = GAME.moves.trim().split(/\s+/);
    var mine = GAME.side === "w";
    var SIDE = mine ? "White" : "Black", OPP = mine ? "Black" : "White";
    var plies = [];
    for (var p = GAME.startPly; p < MOVES.length; p++) if ((p % 2 === 0) === mine) plies.push(p);
    var pars = GAME.pars.slice(0, plies.length);
    while (pars.length < plies.length) pars.push(5);
    var MAX = pars.reduce(function (a, b) { return a + b; }, 0);
    var KEY = "gtm:" + location.pathname;
    var chess, step, wrong, points, lastMove, hinted, hintedMoves, armed = false;

    function keysFor(m) {
      var k = [norm(m.san), m.from + m.to + (m.promotion || "")];
      if (m.piece !== "p") k.push(m.piece.toUpperCase() + m.from + m.to);
      if (m.promotion === "q") k.push(norm(m.san).replace(/Q$/, ""), m.from + m.to);
      return k;
    }
    function findMove(text) {
      var t = norm(text);
      if (!t) return null;
      var legal = chess.moves({ verbose: true });
      var hit = legal.filter(function (m) { return keysFor(m).indexOf(t) >= 0; });
      if (hit.length === 1) return hit[0];
      hit = legal.filter(function (m) { return keysFor(m).some(function (k) { return k.toLowerCase() === t.toLowerCase(); }); });
      return hit.length === 1 ? hit[0] : (hit.length > 1 ? "ambiguous" : null);
    }
    function say(text, kind) { var m = q(".gtm-msg"); m.textContent = text; m.className = "gtm-msg " + (kind || ""); }
    function total() { return points.reduce(function (a, b) { return a + (b || 0); }, 0); }

    function render() {
      var done = step >= plies.length;
      q(".gtm-prompt").hidden = done;
      if (!done) {
        var par = pars[step];
        q(".gtm-ask").innerHTML = SIDE + "'s " + ordinal(moveNo(plies[step])) + ' move? <span class="gtm-par">par ' + par + "</span>";
        var dots = "";
        for (var i = 0; i < par; i++) dots += '<span class="gtm-dot' + (i < wrong ? " used" : "") + '"></span>';
        q(".gtm-tries").innerHTML = "Tries left:" + dots + (hinted ? ' <span class="gtm-hintcost">hint −1</span>' : "");
        q(".gtm-hint").hidden = q(".gtm-showlive").checked || hinted;
      }
      q(".gtm-score").textContent = total();
      var soFar = pars.slice(0, Math.min(step, plies.length)).reduce(function (a, b) { return a + b; }, 0);
      q(".gtm-scoreof").textContent = "points · par so far " + soFar + " of " + MAX;
      rows();
      if (q(".gtm-showlive").checked) drawBoard(q(".gtm-liveboard"), chess.fen(), lastMove, !mine);
      if (!q(".gtm-hintbox").hidden) drawBoard(q(".gtm-hintboard"), chess.fen(), lastMove, !mine);
    }

    function rows() {
      var html = "";
      for (var p = 0; p < GAME.startPly; p += 2) {
        var w = MOVES[p], b = p + 1 < GAME.startPly ? MOVES[p + 1] : "";
        html += '<tr class="opening"><td class="n">' + moveNo(p) + ".</td><td>" + w + '</td><td class="num">–</td><td class="num">–</td><td>' + b + "</td></tr>";
      }
      plies.forEach(function (ply, i) {
        var solved = i < step;
        var me = solved ? MOVES[ply] : '<span class="q">?</span>';
        var cls = points[i] === pars[i] ? "full" : points[i] === 0 ? "zero" : "";
        var pts = solved ? '<span class="' + cls + '">' + points[i] + "</span>" + (hintedMoves[i] ? '<span class="hinted">hint −1</span>' : "") : "";
        var opp = solved && MOVES[ply + 1] ? MOVES[ply + 1] : "";
        var first = mine ? '<td class="w">' + me + "</td>" : '<td>' + (MOVES[ply - 1] || "") + "</td>";
        if (mine) html += '<tr class="' + (i === step ? "now" : "") + '"><td class="n">' + moveNo(ply) + ".</td>" + first +
          '<td class="num">' + pars[i] + '</td><td class="num">' + pts + "</td><td>" + opp + "</td></tr>";
        else html += '<tr class="' + (i === step ? "now" : "") + '"><td class="n">' + moveNo(ply) + ".</td><td>" + (MOVES[ply - 1] || "") +
          '</td><td class="num">' + pars[i] + '</td><td class="num">' + pts + '</td><td class="w">' + me + "</td></tr>";
      });
      q(".gtm-rows").innerHTML = html;
    }

    function advance(scored, how) {
      var ply = plies[step];
      points[step] = scored;
      lastMove = chess.move(MOVES[ply]);
      var text = how + " " + label(ply, MOVES[ply]);
      var reply = MOVES[ply + 1];
      if (reply) { lastMove = chess.move(reply); text += ". " + OPP + " answers " + label(ply + 1, reply) + "."; }
      else text += ".";
      step++; wrong = 0; hinted = false; q(".gtm-hintbox").hidden = true;
      say(text, scored > 0 ? "ok" : "no");
      if (step >= plies.length) finish();
      render();
      q(".gtm-guess").value = "";
      if (step < plies.length) q(".gtm-guess").focus();
    }

    function finish() {
      var t = total(), best = t;
      try { best = Math.max(t, +(localStorage.getItem(KEY) || 0)); localStorage.setItem(KEY, best); } catch (e) {}
      var mate = /#$/.test(MOVES[MOVES.length - 1]) ? " The game ends in checkmate." : "";
      var d = q(".gtm-done");
      d.hidden = false;
      d.innerHTML = "<h3>Game over: " + t + " of " + MAX + "</h3><p>You scored " + Math.round(100 * t / MAX) + "% of par." + mate +
        "</p><p>Your best on this game: " + best + ".</p>";
    }

    function onGuess(e) {
      e.preventDefault();
      if (step >= plies.length) return;
      var text = q(".gtm-guess").value.trim();
      if (!text) return;
      var m = findMove(text);
      if (m === "ambiguous") { say('"' + text + '" could mean more than one move. Add the starting file or rank, for example Ngxe4.', "info"); return; }
      if (!m) { say('"' + text + "\" isn't a legal move in this position. No points lost, try again.", "info"); q(".gtm-guess").select(); return; }
      var want = new Chess(chess.fen()).move(MOVES[plies[step]]);
      if (m.from === want.from && m.to === want.to && (m.promotion || "") === (want.promotion || "")) {
        var got = Math.max(0, pars[step] - wrong - (hinted ? 1 : 0));
        var how = wrong === 0 ? "Right first time" : "Right";
        if (hinted) how += " (hint −1)";
        advance(got, how + ", +" + got + ":");
      } else {
        wrong++;
        if (wrong >= pars[step]) { advance(0, "Out of tries for this move. The game move was"); return; }
        var left = pars[step] - wrong;
        say(m.san + " is not the move. " + left + " tr" + (left === 1 ? "y" : "ies") + " left on this move.", "no");
        render(); q(".gtm-guess").select();
      }
    }

    function start() {
      chess = new Chess(); lastMove = null;
      for (var p = 0; p < GAME.startPly; p++) lastMove = chess.move(MOVES[p]);
      // If the first move to guess is not immediately after startPly,
      // play the opponent's move(s) in between so the engine is in the right position.
      if (plies.length > 0 && plies[0] > GAME.startPly) {
        for (var p = GAME.startPly; p < plies[0]; p++) lastMove = chess.move(MOVES[p]);
      }
      step = 0; wrong = 0; points = []; hinted = false; hintedMoves = [];
      q(".gtm-done").hidden = true; q(".gtm-hintbox").hidden = true; say("", ""); q(".gtm-guess").value = "";
      try { var b = localStorage.getItem(KEY); q(".gtm-best").textContent = b ? "· your best " + b : ""; } catch (e) {}
      drawBoard(q(".gtm-startboard"), chess.fen(), lastMove, !mine);
      render();
    }

    var opening = MOVES.slice(0, GAME.startPly).map(function (s, p) { return p % 2 === 0 ? moveNo(p) + "." + s : s; }).join(" ");
    q(".gtm-intro").textContent = "You have the " + SIDE + " pieces. After " + opening + ", find each of " + SIDE +
      "'s moves through to the end of the game. Try to keep the position in your head; the board shows only where you start.";
    q(".gtm-startlabel").textContent = "Start position, after " + label(GAME.startPly - 1, MOVES[GAME.startPly - 1]);
    q(".gtm-th-w").textContent = mine ? "White's move" : "White's move";
    q(".gtm-th-b").textContent = "Black's move";
    q(".gtm-form").addEventListener("submit", onGuess);
    q(".gtm-hint").addEventListener("click", function () {
      if (step >= plies.length || hinted) return;
      hinted = true; hintedMoves[step] = true;
      say("Here is the board. 1 point comes off this move's score when you find it.", "info");
      drawBoard(q(".gtm-hintboard"), chess.fen(), lastMove, !mine);
      q(".gtm-hintbox").hidden = false;
      render(); q(".gtm-guess").focus();
    });
    q(".gtm-reveal").addEventListener("click", function () { if (step < plies.length) advance(0, "Shown:"); });
    q(".gtm-showlive").addEventListener("change", function (e) {
      q(".gtm-livewrap").hidden = !e.target.checked; q(".gtm-blind").hidden = e.target.checked;
      render();
    });
    q(".gtm-restart").addEventListener("click", function (e) {
      if (!armed) { armed = true; e.target.textContent = "Click again to start over"; setTimeout(function () { armed = false; e.target.textContent = "Start over"; }, 3000); return; }
      armed = false; e.target.textContent = "Start over"; start();
    });
    start();
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (typeof Chess === "undefined") return;
    Array.prototype.forEach.call(document.querySelectorAll(".gtm"), setup);
  });
})();
