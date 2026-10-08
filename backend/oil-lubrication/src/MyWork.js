// Phase 9 — My Work: what's waiting for this person, by role.
//
// The platform's My Work page (Platform Core shell) collects work from every
// module through the same request, GET getMyWork, and every module answers
// in the same shape, so new modules plug in without changing the page:
//
//   { moduleId, moduleName, sections: [
//       { id, title, hint, severity: "action"|"warning"|"info", total,
//         items: [{ id, title, subtitle, meta, flag, link: { page, recordId } }] } ] }
//
//   flag: "overdue" | "returned" | "due" | "" — shown as a badge.
//   summary: true on a section that only sums up records listed elsewhere
//     (team summary, overdue per technician) — not counted in the tiles.
//   link: the module page (and record) the item opens.
//
// Sections by role (a person with several roles gets them all). Engineer
// sections follow responsibility (Settings → Module Access responsible
// engineers, or a colleague covering through a delegation), not job title:
//   Technician — their routes are the interactive checklist the page already
//     shows; nothing extra here.
//   Contractor Engineer — routes to approve, Draft routes without a
//     technician, suggestions to turn into routes, lab reports to validate,
//     Draft actions to submit, overdue actions, closures to finish, low
//     stock, points due within 7 days.
//   ACC Engineer — closure requests to approve, lab reports to review, new
//     automatic Drafts, overdue actions (all contractors).
//   ACC Manager / Contractor Manager — escalations (overdue 10+ days), team
//     summary, overdue work per technician.
//   Managers and App Owner also see "Nobody responsible" when no engineer
//     is available today.
//   App Owner — the manager sections (+ engineer ones when listed/covering).
//   Visitor — nothing.

var MY_WORK_MAX_ITEMS = 15;
var MY_WORK_DUE_SOON_DAYS = 7;

// Engineer sections follow responsibility, not job title: only the people
// listed in Settings → Module Access as responsible engineers for this
// module (or covering for one through a delegation) get them. Managers
// keep their escalations; the App Owner gets the manager sections and the
// ACC Engineer ones only when listed or covering.
function myWorkRoles_(session) {
  var roles = (session && session.roles) || [];
  var has = function (r) { return roles.indexOf(r) !== -1; };
  var admin = has("ROLE-ADMIN");
  var resp = maResponsibility_(session);
  return {
    contractorEngineer: resp.responsible && resp.side !== "ACC" && !!getContractorScope_(session),
    accEngineer: resp.responsible && resp.side === "ACC" && !getContractorScope_(session),
    manager: admin || has("ROLE-MGR") || has("ROLE-CMGR"),
    covering: resp.covering,
    listed: resp.listed,
  };
}

function fmtDay_(d) {
  d = asDate_(d);
  return d ? Utilities.formatDate(d, Session.getScriptTimeZone() || "Etc/UTC", "yyyy-MM-dd") : "";
}

function section_(id, title, hint, severity, items) {
  return { id: id, title: title, hint: hint, severity: severity, total: items.length, items: items.slice(0, MY_WORK_MAX_ITEMS) };
}

function getMyWork(session) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var who = myWorkRoles_(session);
  var scope = getContractorScope_(session);
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var sections = [];
  var out = { moduleId: MA_CONFIG.moduleId, moduleName: MA_CONFIG.moduleName, sections: sections, generatedAt: new Date().toISOString() };
  out.covering = who.covering;
  out.listed = who.listed;
  var nobody = who.manager ? maNobodyResponsibleFor_(session) : [];
  if (nobody.length) {
    sections.push(section_("nobody-responsible", "Nobody responsible", "No engineer is responsible today — add one in Settings → Module Access, or cover it yourself in Settings → My delegations.", "warning",
      nobody.map(function (c) { return { id: "nobody|" + c, title: c, subtitle: "No responsible engineer available for " + MA_CONFIG.moduleName, meta: "", flag: "", link: { page: "settings", recordId: "" } }; })));
  }
  if (!who.contractorEngineer && !who.accEngineer && !who.manager) return out;

  var inScope = function (c) { return !scope || c === scope; };
  var routes = readSheet(ss, "ROUTINES", true).filter(function (r) { return String(r[0] || "").trim() && inScope(String(r[3] || "").trim()); });
  var actions = readSheet(ss, "Action Tracker", true).filter(function (r) { return String(r[ACTION_COL.AC_NO] || "").trim() && inScope(actionContractor_(r)); });
  var lpContractor = getLpContractorMap_();
  var labPending = readSheet(ss, "Data_Entry", true).filter(function (r) {
    return String(r[LAB_COL.STATUS] || "").trim() === LAB_STATUS.PENDING && inScope(lpContractor[String(r[0] || "").trim()] || "");
  });

  function routeItem(r, extra) {
    var id = String(r[0] || "").trim();
    var overdue = isRouteRowOverdue_(r, today);
    return {
      id: "route|" + id,
      title: String(r[12] || id),
      subtitle: (String(r[13] || "") + " · " + (String(r[2] || "").trim() || "no technician") + (scope ? "" : " · " + String(r[3] || ""))).replace(/^ · /, ""),
      meta: extra || (r[14] ? "due " + fmtDay_(r[14]) : ""),
      flag: overdue ? "overdue" : "",
      link: { page: "routines", recordId: id },
    };
  }
  function actionItem(r, meta, flag) {
    var acNo = String(r[ACTION_COL.AC_NO] || "").trim();
    var lp = String(r[ACTION_COL.LP] || "").trim();
    return {
      id: "action|" + acNo + "|" + lp,
      title: acNo + " · " + lp,
      subtitle: String(r[ACTION_COL.AGREED] || "").trim() || String(r[ACTION_COL.SAMPLE_ANALYSIS] || "").trim() || "No agreed action yet",
      meta: (scope ? "" : actionContractor_(r) + " · ") + (meta || ""),
      flag: flag || (isActionRowOverdue_(r, today) ? "overdue" : ""),
      link: { page: "actions", recordId: acNo },
    };
  }
  function labItem(r) {
    return {
      id: "lab|" + String(r[LAB_COL.UID] || r[3] || ""),
      title: String(r[0] || "") + " · " + String(r[3] || ""),
      subtitle: (String(r[5] || "").trim() || "No result") + (r[4] ? " · sampled " + fmtDay_(r[4]) : ""),
      meta: "uploaded by " + (String(r[LAB_COL.UPLOADED_BY] || "").trim() || "—"),
      flag: "",
      link: { page: "oilreport", recordId: String(r[0] || "") },
    };
  }
  var overdueActions = actions.filter(function (r) { return isActionRowOverdue_(r, today); });

  // ── Contractor Engineer ────────────────────────────────────────────────
  if (who.contractorEngineer) {
    sections.push(section_("approve-routes", "Routes waiting your approval", "Confirm or return them.", "action",
      routes.filter(function (r) { return normRouteStatus_(r[5]) === ROUTE_STATUS.WAITING; })
        .map(function (r) { return routeItem(r, r[6] ? "submitted " + fmtDay_(r[6]) : ""); })));
    sections.push(section_("unassigned-routes", "Draft routes without a technician", "Assign a technician so the work can start.", "action",
      routes.filter(function (r) { return normRouteStatus_(r[5]) === ROUTE_STATUS.DRAFT && !String(r[2] || "").trim(); }).map(function (r) { return routeItem(r); })));
    sections.push(section_("suggestions", "Suggestions to turn into routes", "From submitted actions — create the route in Routines.", "action",
      getSuggestions(scope, false).suggestions.map(function (sg) {
        return { id: "sg|" + sg.suggestionId, title: sg.lpId + " · " + sg.workType, subtitle: sg.reason, meta: sg.requiredDate ? "needed by " + sg.requiredDate.slice(0, 10) : "", flag: "", link: { page: "routines", recordId: "" } };
      })));
    sections.push(section_("lab-validate", "Lab reports to validate", "Check each report against the lab's PDF.", "action", labPending.map(labItem)));
    sections.push(section_("draft-actions", "Draft actions to submit", "Fill in the agreed action, person, due date and duration, then Submit.", "action",
      actions.filter(function (r) { return normActionStatus_(r[ACTION_COL.STATUS]) === ACTION_STATUS.DRAFT; })
        .map(function (r) { return actionItem(r, String(r[ACTION_COL.RULE] || "").trim() ? "made by rule: " + r[ACTION_COL.RULE] : "draft"); })));
    sections.push(section_("closures-to-finish", "Closures approved — close the action", "ACC approved the closure; press Close action.", "action",
      actions.filter(function (r) {
        return normActionStatus_(r[ACTION_COL.STATUS]) === ACTION_STATUS.CLOSURE_REQUESTED && String(r[ACTION_COL.DECISION] || "").trim() === "Approved";
      }).map(function (r) { return actionItem(r, "approved by " + String(r[ACTION_COL.DECISION_BY] || "ACC")); })));
    sections.push(section_("overdue-actions", "Actions overdue", "Past due date + duration + 5 days.", "warning",
      overdueActions.map(function (r) { return actionItem(r, r[ACTION_COL.DUE_DATE] ? "due " + fmtDay_(r[ACTION_COL.DUE_DATE]) : ""); })));
    var stocks = productStocksFromLog_(ss);
    sections.push(section_("low-stock", "Low-stock oils", "At or below the low-stock level — order more.", "warning",
      readSheet(ss, "Oil Inventory", true).filter(function (p) {
        var level = parseFloat(p[7]);
        return String(p[0] || "").trim() && inScope(String(p[16] || "").trim()) && !isNaN(level) && (stocks[String(p[0]).trim()] || 0) <= level && String(p[11] || "").trim() !== "Discontinued";
      }).map(function (p) {
        var id = String(p[0] || "").trim();
        return { id: "stock|" + id, title: oilLabel_(p[1], p[2]), subtitle: (stocks[id] || 0) + " " + (p[5] || "L") + " in stock", meta: "low-stock level " + p[7], flag: "", link: { page: "inventory", recordId: id } };
      })));
    sections.push(section_("due-soon", "Points due within " + MY_WORK_DUE_SOON_DAYS + " days", "Not on a route yet — create the route.", "info",
      lpsDueSoon_(ss, today, MY_WORK_DUE_SOON_DAYS).filter(function (it) { return inScope(it.contractor); })
        .sort(function (a, b) { return a.due.getTime() - b.due.getTime(); })
        .map(function (it) { return { id: "due|" + it.code + "|" + it.type, title: it.code, subtitle: it.type, meta: "due " + fmtDay_(it.due), flag: "due", link: { page: "routines", recordId: "" } }; })));
  }

  // ── ACC Engineer ───────────────────────────────────────────────────────
  if (who.accEngineer) {
    sections.push(section_("closure-requests", "Closure requests to approve", "Approve or reject each closure.", "action",
      actions.filter(function (r) {
        return normActionStatus_(r[ACTION_COL.STATUS]) === ACTION_STATUS.CLOSURE_REQUESTED && !String(r[ACTION_COL.DECISION] || "").trim();
      }).map(function (r) { return actionItem(r, "requested by " + String(r[ACTION_COL.CLOSURE_BY] || "—")); })));
    sections.push(section_("lab-review", "Lab reports to review", "Waiting for the contractor's validation — return any that are wrong or missing.", "info", labPending.map(labItem)));
    sections.push(section_("auto-drafts", "New automatic Drafts", "Made by the lab and leakage rules — waiting to be submitted.", "info",
      actions.filter(function (r) { return normActionStatus_(r[ACTION_COL.STATUS]) === ACTION_STATUS.DRAFT && String(r[ACTION_COL.RULE] || "").trim(); })
        .map(function (r) { return actionItem(r, String(r[ACTION_COL.RULE])); })));
    if (!who.contractorEngineer) {
      sections.push(section_("overdue-actions", "Actions overdue", "Past due date + duration + 5 days, all contractors.", "warning",
        overdueActions.map(function (r) { return actionItem(r, r[ACTION_COL.DUE_DATE] ? "due " + fmtDay_(r[ACTION_COL.DUE_DATE]) : ""); })));
    }
  }

  // ── Managers ───────────────────────────────────────────────────────────
  if (who.manager) {
    var cutoff = today.getTime() - ESCALATE_AFTER_DAYS * 86400000;
    var escalations = [];
    routes.forEach(function (r) {
      if (!isRouteRowOverdue_(r, today)) return;
      var from = routeOverdueFrom_(r);
      if (from.getTime() <= cutoff) escalations.push(routeItem(r, "overdue since " + fmtDay_(from)));
    });
    actions.forEach(function (r) {
      if (!isActionRowOverdue_(r, today)) return;
      var since = new Date(actionDueEnd_(r).getTime() + 86400000);
      if (since.getTime() <= cutoff) escalations.push(actionItem(r, "overdue since " + fmtDay_(since), "overdue"));
    });
    sections.push(section_("escalations", "Overdue " + ESCALATE_AFTER_DAYS + "+ days", "Still overdue " + ESCALATE_AFTER_DAYS + " days after becoming overdue.", "warning", escalations));

    var wl = getTeamWorkload(scope);
    sections.push(section_("team", "Team summary", "Open the Team Workload tab for the full picture.", "info",
      wl.contractors.filter(function (c) { return c.contractor !== "—"; }).map(function (c) {
        return {
          id: "team|" + c.contractor,
          title: c.contractor,
          subtitle: c.routes.overdue + " route(s) overdue · " + c.actions.overdue + " action(s) overdue · " + c.labReportsPending + " lab report(s) to validate",
          meta: (c.routes.assigned + c.routes.inProgress) + " route(s) in hand · " + c.actions.open + " open action(s)",
          flag: c.routes.overdue + c.actions.overdue > 0 ? "overdue" : "",
          link: { page: "team", recordId: "" },
        };
      })));
    var perTech = [];
    wl.contractors.forEach(function (c) {
      c.technicians.forEach(function (t) {
        if (t.overdue > 0) perTech.push({ id: "tech|" + t.email, title: t.email, subtitle: t.overdue + " overdue route(s)" + (t.returned ? " · " + t.returned + " returned" : ""), meta: c.contractor, flag: "overdue", link: { page: "team", recordId: "" }, n: t.overdue });
      });
    });
    perTech.sort(function (a, b) { return b.n - a.n; });
    perTech.forEach(function (x) { delete x.n; });
    sections.push(section_("tech-overdue", "Overdue work per technician", "Technicians with overdue routes.", "warning", perTech));
    // overviews of records already counted elsewhere: My Work's tiles skip them
    sections.forEach(function (sc) { if (sc.id === "team" || sc.id === "tech-overdue") sc.summary = true; });
  }

  out.sections = sections.filter(function (s) { return s.total > 0; });
  return out;
}
