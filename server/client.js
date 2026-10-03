(function () {
  "use strict";

  var sprite = {};
  try {
    var parsed = JSON.parse(document.getElementById("avatar-sprite").textContent);
    sprite = (parsed && parsed.svg) || {};
  } catch (error) {
    sprite = {};
  }

  var FLOOR_W = 1200;
  var FLOOR_H = 820;

  var RUNTIME = {
    running: ["Running", "var(--running)"],
    idle: ["Idle", "var(--idle)"],
    paused: ["Paused", "var(--paused)"],
    pending_approval: ["Pending approval", "var(--paused)"],
    error: ["Error", "var(--error)"],
    terminated: ["Terminated", "var(--muted)"]
  };
  var ISSUE = {
    in_progress: ["In progress", "var(--in-progress)"],
    in_review: ["In review", "var(--in-review)"],
    blocked: ["Blocked", "var(--blocked)"],
    todo: ["Todo", "var(--todo)"]
  };
  var POSE = { working: "Working", thinking: "Reviewing", confused: "Blocked", rest: "Resting", idle: "Idle" };
  var PLACE = { desk: "At their desk", break: "In the break room", coffee: "By the coffee machine" };

  var nodes = {};
  var cursor = null;
  var pollMs = Number(window.__POLL_MS__) || 5000;

  var agentsLayer = document.getElementById("agents");
  var tickerEl = document.getElementById("ticker");
  var tickerEmpty = document.getElementById("ticker-empty");
  var statusEl = document.getElementById("live-status");
  var statusText = document.getElementById("live-status-text");
  var stampEl = document.getElementById("live-stamp");
  var intervalEl = document.getElementById("poll-interval");

  function namespaceSvg(svg, key) {
    var prefix = String(key).replace(/[^a-zA-Z0-9_-]/g, "") + "-";
    return svg
      .replace(/id="agent-/g, 'id="' + prefix + 'agent-')
      .replace(/url\(#agent-/g, "url(#" + prefix + "agent-")
      .replace(/href="#agent-/g, 'href="#' + prefix + "agent-")
      .replace(/role="img"/, 'aria-hidden="true" focusable="false"')
      .replace(/<title>[\s\S]*?<\/title>/, "");
  }

  function span(cls, text) {
    var node = document.createElement("span");
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function ensureNode(agent) {
    if (nodes[agent.id]) return nodes[agent.id];
    var button = document.createElement("button");
    button.className = "agent";
    button.type = "button";
    button.setAttribute("data-agent-id", agent.id);

    var avatar = span("avatar");
    var name = span("name");
    var plaque = span("plaque");
    plaque.hidden = true;
    var review = span("badge badge-review", "Review");
    review.hidden = true;
    var blocked = span("badge badge-blocked", "Blocked");
    blocked.hidden = true;
    var dot = span("status-dot");

    var card = span("card");
    card.setAttribute("role", "presentation");
    var cn = span("card-name");
    var cr = span("card-role");
    var crow = span("card-row");
    var cdot = span("dot");
    var crt = span("card-runtime");
    crow.appendChild(cdot);
    crow.appendChild(crt);
    var ct = span("card-task");
    var cnote = span("card-note");
    card.appendChild(cn);
    card.appendChild(cr);
    card.appendChild(crow);
    card.appendChild(ct);
    card.appendChild(cnote);

    button.appendChild(avatar);
    button.appendChild(name);
    button.appendChild(plaque);
    button.appendChild(review);
    button.appendChild(blocked);
    button.appendChild(dot);
    button.appendChild(card);

    nodes[agent.id] = {
      button: button, avatar: avatar, name: name, plaque: plaque, review: review,
      blocked: blocked, dot: dot, cn: cn, cr: cr, cdot: cdot, crt: crt, ct: ct, cnote: cnote,
      lastPalette: null, lastPose: null
    };
    agentsLayer.appendChild(button);
    return nodes[agent.id];
  }

  function applyAgent(agent) {
    if (!agent || !agent.id || !agent.placement) return;
    var n = ensureNode(agent);
    n.button.style.display = "";
    n.button.style.left = ((agent.placement.x / FLOOR_W) * 100).toFixed(3) + "%";
    n.button.style.top = ((agent.placement.y / FLOOR_H) * 100).toFixed(3) + "%";
    n.button.setAttribute("data-card", agent.placement.y < 250 ? "below" : "above");
    n.button.setAttribute("data-edge", agent.placement.x > 950 ? "right" : agent.placement.x < 250 ? "left" : "center");

    n.name.textContent = agent.name;
    n.cr.textContent = agent.role || "";

    var runtime = RUNTIME[agent.runtimeStatus] || RUNTIME.idle;
    n.cdot.style.background = runtime[1];
    n.dot.style.background = runtime[1];
    n.dot.title = "Runtime: " + runtime[0];

    var placementLine = PLACE[agent.placement.location] || "";
    var poseLabel = POSE[agent.placement.pose] || agent.placement.pose || "";
    n.crt.textContent = runtime[0] + " \u00b7 " + placementLine + " \u00b7 " + poseLabel;

    var task = agent.currentTask;
    var issueStatus = task ? (ISSUE[task.status] || [task.status, "var(--muted)"]) : null;
    if (task) {
      n.ct.textContent = task.identifier + " \u00b7 " + issueStatus[0];
      n.ct.style.color = issueStatus[1];
    } else {
      n.ct.textContent = "No active task";
      n.ct.style.color = "var(--muted)";
    }

    if (agent.placement.plaque) {
      n.plaque.hidden = false;
      n.plaque.textContent = agent.placement.plaque;
    } else {
      n.plaque.hidden = true;
    }
    n.review.hidden = agent.placement.badge !== "review";
    n.blocked.hidden = agent.placement.badge !== "blocked";
    n.cnote.textContent = agent.note || "No recent note.";

    var palette = (agent.appearance && agent.appearance.paletteId) || "bubblegum-sky";
    var pose = agent.placement.pose || "idle";
    var svg = sprite[palette] && sprite[palette][pose];
    if (svg && (n.lastPalette !== palette || n.lastPose !== pose)) {
      n.avatar.innerHTML = namespaceSvg(svg, agent.id);
      n.lastPalette = palette;
      n.lastPose = pose;
    }

    var parts = [
      agent.name + ", " + (agent.role || "") + ".",
      "Runtime status " + runtime[0] + ".",
      placementLine + ".",
      poseLabel + "."
    ];
    if (task) parts.push("Current task " + task.identifier + ", " + issueStatus[0] + ".");
    else parts.push("No active task.");
    if (agent.note) parts.push("Latest note: " + agent.note);
    n.button.setAttribute("aria-label", parts.join(" "));
  }

  function applyState(state) {
    if (!state || !Array.isArray(state.agents)) return;
    if (state.pollIntervalMs) pollMs = Math.max(1500, Number(state.pollIntervalMs) || pollMs);
    if (intervalEl) intervalEl.textContent = String(Math.round(pollMs / 1000));

    var present = {};
    for (var i = 0; i < state.agents.length; i += 1) {
      present[state.agents[i].id] = true;
      applyAgent(state.agents[i]);
    }
    Object.keys(nodes).forEach(function (id) {
      if (!present[id]) nodes[id].button.style.display = "none";
    });

    if (stampEl && state.capturedAt) {
      stampEl.textContent = fmtTime(state.capturedAt);
      stampEl.setAttribute("datetime", state.capturedAt);
    }
    if (state.controlPlaneReachable) setStatus("live", "Live");
    else setStatus("down", "Control plane unreachable");
  }

  function addEvents(events) {
    if (!Array.isArray(events) || events.length === 0) return;
    tickerEmpty.hidden = true;
    for (var i = events.length - 1; i >= 0; i -= 1) {
      var event = events[i];
      var li = document.createElement("li");
      li.className = "event";
      var time = document.createElement("time");
      time.textContent = event.at ? fmtTime(event.at) : "\u2014";
      if (event.at) time.setAttribute("datetime", event.at);
      li.appendChild(time);
      li.appendChild(span("event-agent", event.agentName || "system"));
      li.appendChild(span("event-message", event.message || event.action || ""));
      tickerEl.insertBefore(li, tickerEl.firstChild);
    }
    while (tickerEl.children.length > 60) tickerEl.removeChild(tickerEl.lastChild);
  }

  function setStatus(state, text) {
    if (statusEl) statusEl.setAttribute("data-state", state);
    if (statusText) statusText.textContent = text;
  }

  function fmtTime(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return "\u2014";
    return date.toLocaleTimeString([], { hour12: false });
  }

  function fetchJson(url) {
    return fetch(url, { headers: { Accept: "application/json" } }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    });
  }

  function poll() {
    fetchJson("/live/state").then(applyState).catch(function () {
      setStatus("down", "Control plane unreachable");
    });
    var url = "/live/activity" + (cursor == null ? "" : "?since=" + encodeURIComponent(cursor));
    fetchJson(url).then(function (data) {
      if (data && typeof data.cursor === "number") cursor = data.cursor;
      addEvents(data && data.events);
    }).catch(function () {});
  }

  function loop() {
    poll();
    setTimeout(loop, pollMs);
  }

  if (window.__INITIAL_STATE__) applyState(window.__INITIAL_STATE__);
  loop();
})();
