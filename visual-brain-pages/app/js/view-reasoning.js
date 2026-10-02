/* HEXA_VISUAL_BRAIN_v2 :: view-reasoning.js
   VIEW C — Reasoning. An interface over a ReasoningRun object -- never a
   simulated/faked live reasoning process. Ships with ONE real sample
   (reasoning_run_sample.js), which is the actual, unmodified output of a
   real run of the existing engine.py Project Reasoning Engine against
   real current HEXA_MASTER_REAL data (topic: whether the Alpha.3 history
   candidate is authorized for project-root promotion -- nothing about
   this run's content was written or edited for this app). A file picker
   lets the user load any other real saved ReasoningRun JSON with the
   same shape; nothing here invents one. */
(function(){
  "use strict";
  var G = window.HexaGraph;

  function esc(s){
    return String(s==null?"":s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }
  function pill(text, cls){ return '<span class="rr-pill '+(cls||"")+'">'+esc(text)+'</span>'; }

  function renderEventRef(e){
    if(!e) return '<p class="dim">none</p>';
    return '<div class="rr-evt" data-jump="'+esc(e.event_id)+'">' +
      '<div class="rr-evt-title">'+esc(e.title||e.event_id)+'</div>' +
      '<div class="rr-evt-meta">'+pill(e.status||"")+pill(e.evidence_classification||e.evidence_certainty||"","cert")+
        (e.lifecycle?pill(e.lifecycle,"life"):"")+'</div>' +
      (e.details? '<div class="rr-evt-details">'+esc(e.details)+'</div>' : '') +
      '</div>';
  }

  function renderRun(run, mount, onJump){
    if(!run){
      mount.innerHTML = '<div class="empty-state">' +
        '<p>No ReasoningRun is loaded.</p>' +
        '<p class="dim">This view never fabricates a run. Load a real saved ReasoningRun JSON, or restore the bundled real sample.</p>' +
        '</div>';
      return;
    }
    if(run.trace_replay){ renderTraceReplay(run, mount, onJump); return; }
    if(run.blind_run){ renderBlindRun(run, mount, onJump); return; }
    var html = "";
    html += '<div class="rr-status-row">' +
      pill(run.reasoning_status || "UNKNOWN_STATUS", "status") +
      (run.scope_mode? pill(run.scope_mode,"scope") : "") +
      (run.authority_boundary_preserved!==undefined ? pill("authority_boundary_preserved="+run.authority_boundary_preserved, run.authority_boundary_preserved?"ok":"bad") : "") +
      '</div>';

    html += '<div class="rr-section"><h4>Selected problem</h4>' + renderEventRef(run.selected_problem) + '</div>';

    html += '<div class="rr-section"><h4>Authoritative evidence</h4>' + renderEventRef(run.authoritative_evidence) + '</div>';

    if(run.authoritative_constraints){
      var confirmed = run.authoritative_constraints.confirmed_current || [];
      html += '<div class="rr-section"><h4>Authoritative constraints ('+confirmed.length+' confirmed current)</h4>';
      confirmed.forEach(function(c){ html += renderEventRef(c); });
      var ua = run.authoritative_constraints.unresolved_assumptions || [];
      if(ua.length){
        html += '<div class="rr-subhead">Unresolved assumptions</div>';
        ua.forEach(function(a){ html += '<div class="rr-evt-details">'+esc(typeof a==="string"?a:JSON.stringify(a))+'</div>'; });
      }
      html += '</div>';
    }

    if(run.topology_candidates && run.topology_candidates.length){
      html += '<div class="rr-section"><h4>Topology candidates (discovery only, never authoritative)</h4>';
      run.topology_candidates.forEach(function(c){
        html += '<div class="rr-evt" data-jump="'+esc(c.event_id)+'">' +
          '<div class="rr-evt-title">'+esc(c.event_id)+' '+pill("rank "+c.rank)+pill((c.discovery_roles||[]).join(","),"role")+'</div>' +
          '<div class="rr-evt-meta">'+pill(c.authority||"CANDIDATE_DISCOVERY_ONLY","cand")+pill(c.evidence_classification||"")+'</div>' +
          (c.details? '<div class="rr-evt-details">'+esc(c.details)+'</div>' : '') +
          '</div>';
      });
      html += '</div>';
    }

    function depList(title, deps){
      if(!deps || !deps.length) return "";
      var h = '<div class="rr-section"><h4>'+esc(title)+'</h4>';
      deps.forEach(function(d){
        h += '<div class="rr-evt" data-jump="'+esc(d.event_id)+'"><div class="rr-evt-title">'+esc(d.title||d.event_id)+'</div>' +
          '<div class="rr-evt-meta">'+(d.linked_via?pill(d.linked_via,"link"):"")+(d.authority?pill(d.authority,"cand"):"")+'</div></div>';
      });
      return h + '</div>';
    }
    html += depList("Direct dependencies", run.direct_dependencies);
    html += depList("Latent dependencies (bridge-path activation)", run.latent_dependencies);

    if(run.rejected_or_superseded && ((run.rejected_or_superseded.rejected||[]).length || (run.rejected_or_superseded.superseded||[]).length)){
      html += '<div class="rr-section"><h4>Rejected / superseded</h4>';
      (run.rejected_or_superseded.rejected||[]).forEach(function(r){ html += renderEventRef(r); });
      (run.rejected_or_superseded.superseded||[]).forEach(function(r){ html += renderEventRef(r); });
      html += '</div>';
    }

    if(run.hypothesis){
      html += '<div class="rr-section"><h4>Hypothesis</h4><p class="rr-prose">'+esc(run.hypothesis)+'</p>' +
        (run.hypothesis_basis? '<p class="rr-prose dim">'+esc(run.hypothesis_basis)+'</p>' : '') + '</div>';
    }

    if(run.clarification_action){
      html += '<div class="rr-section"><h4>Clarification needed</h4><p class="rr-prose">'+esc(run.clarification_action)+'</p>' +
        (run.clarification_validation? pill(run.clarification_validation,"status") : "") +
        (run.yes_outcome? '<div class="rr-evt-details"><b>If yes:</b> '+esc(run.yes_outcome)+'</div>' : "") +
        (run.no_outcome? '<div class="rr-evt-details"><b>If no:</b> '+esc(run.no_outcome)+'</div>' : "") +
        '</div>';
    }

    if(run.uncertainties && run.uncertainties.length){
      html += '<div class="rr-section"><h4>Uncertainties</h4><ul class="rr-ul">' +
        run.uncertainties.map(function(u){ return '<li>'+esc(u)+'</li>'; }).join("") + '</ul></div>';
    }

    if(run.remaining_solution_space && run.remaining_solution_space.length){
      html += '<div class="rr-section"><h4>Remaining solution space</h4><ul class="rr-ul">' +
        run.remaining_solution_space.map(function(u){ return '<li>'+esc(u)+'</li>'; }).join("") + '</ul></div>';
    }

    html += '<div class="rr-section"><h4>Next action / final status</h4>' +
      '<p class="rr-prose">'+esc(run.next_action||"(none recorded)")+'</p>' +
      pill("reasoning_status = "+(run.reasoning_status||"?"),"status") + '</div>';

    mount.innerHTML = html;
    mount.querySelectorAll("[data-jump]").forEach(function(el){
      el.addEventListener("click", function(){
        var id = el.getAttribute("data-jump");
        if(G.byId[id]) onJump(G.byId[id]);
      });
    });
  }


  /* ---------- Blind-run reasoning render (additive; does not touch renderRun above) ----------
     Renders a HEXA_FULL_RECONNECTED_BLIND_RUN artifact (run.blind_run === true). Shape is
     deliberately different from the engine.py ReasoningRun sample: node/vector/cross-domain
     discovery over legacy topology + current HEXA_MASTER_REAL, not an event-dependency graph. */

  function authChip(cls){
    return cls ? '<span class="rr-authclass '+esc(cls)+'">'+esc(cls)+'</span>' : "";
  }

  function nodeChip(id, opts){
    opts = opts || {};
    var n = G.byId ? G.byId[id] : null;
    if(!n){
      return '<span class="rr-unresolved-id" title="Referenced by the run but not loaded as a node in this Visual Brain build">' +
        'UNRESOLVED: '+esc(id) + '</span>';
    }
    var cls = "rr-evt" + (opts.cls ? " "+opts.cls : "");
    return '<div class="'+cls+'" data-jump="'+esc(id)+'">' +
      '<div class="rr-evt-title">'+esc(n.title || n.conversation_title || id)+'</div>' +
      '<div class="rr-evt-meta">'+authChip(opts.authorityClass)+
        (n.authority_tier? '<span class="authtag auth-'+esc(n.authority_tier)+'">'+esc(n.authority_tier)+'</span>' : "")+
        (n.domain_name? pill(n.domain_name) : "")+'</div>' +
      (opts.detail ? '<div class="rr-evt-details">'+esc(opts.detail)+'</div>' : "") +
      '</div>';
  }

  function section(title, innerHtml){
    return '<div class="rr-section"><h4>'+esc(title)+'</h4>'+innerHtml+'</div>';
  }

  function renderBlindRun(run, mount, onJump){
    var html = "";

    html += '<div class="rr-status-row">' +
      pill(run.run_kind || "HEXA_FULL_RECONNECTED_BLIND_RUN", "status") +
      pill("input_title = "+(run.input_title||"?")) +
      (run.authority_boundary_preserved!==undefined ? pill("authority_boundary_preserved="+run.authority_boundary_preserved, run.authority_boundary_preserved?"ok":"bad") : "") +
      '</div>';
    if(run.protocol_note) html += '<p class="rr-prose dim">'+esc(run.protocol_note)+'</p>';

    if(run.phase_a_structural_model){
      var pa = run.phase_a_structural_model;
      var body = (pa.structural_relations||[]).map(function(r){
        return '<div class="rr-evt-details"><b>'+esc(r.id)+' -- '+esc(r.name)+':</b> '+esc(r.description)+'</div>';
      }).join("");
      if(pa.invariant_candidate) body += '<div class="rr-evt-details" style="margin-top:6px;"><b>Invariant candidate:</b> '+esc(pa.invariant_candidate)+'</div>';
      if(pa.deliberately_unresolved_open_loop) body += '<div class="rr-evt-details"><b>Deliberately unresolved:</b> '+esc(pa.deliberately_unresolved_open_loop)+'</div>';
      html += section("A -- Independent structural reading (frozen before corpus access)", body);
    }

    if(run.current_authoritative_matches){
      var cam = run.current_authoritative_matches;
      var body = '<p class="rr-prose">'+pill(cam.result,"status")+'</p>';
      if(cam.reasoning) body += '<p class="rr-prose dim">'+esc(cam.reasoning)+'</p>';
      (cam.near_miss_events_considered_and_not_promoted||[]).forEach(function(e){
        body += nodeChip(e.id, {authorityClass:e.authority_class, detail:(e.relation_to_run||"")+(e.bounded_source_excerpt? " — “"+e.bounded_source_excerpt+"”" : "")});
      });
      html += section("B -- Current HEXA correspondence (Required Result 1)", body);
    }

    if(run.source_backed_legacy_matches && run.source_backed_legacy_matches.length){
      var body = (run.direct_historical_link ? '<p class="rr-prose">'+pill("DIRECT_HISTORICAL_LINK = "+run.direct_historical_link.value,"status")+
        (run.direct_historical_link.scope? ' <span class="dim">'+esc(run.direct_historical_link.scope)+'</span>' : '')+'</p>' : "");
      body += run.source_backed_legacy_matches.map(function(m){
        return nodeChip(m.id, {cls:"sbl", authorityClass:m.authority_class,
          detail: (m.conversation_title? m.conversation_title+" — " : "") + (m.relation_to_run||"") +
            (m.bounded_source_excerpt? " — “"+m.bounded_source_excerpt+"”" : "")});
      }).join("");
      html += section("C -- Source-backed legacy correspondence (Required Result 2)", body);
    }

    if(run.topology_candidates && run.topology_candidates.length){
      var body = run.topology_candidates.map(function(c){
        return nodeChip(c.id, {cls:"topocand", authorityClass:c.authority_class, detail:c.relation_to_run});
      }).join("");
      html += section("D -- Topology / vector candidates (discovery only, never authoritative)", body);
    }

    if(run.vector_neighbors){
      var vn = run.vector_neighbors;
      var body = vn.method_note ? '<p class="rr-prose dim">'+esc(vn.method_note)+'</p>' : "";
      Object.keys(vn).forEach(function(k){
        if(k === "method_note") return;
        body += '<div class="rr-subhead">'+esc(k.replace(/^from_/,"from "))+'</div>';
        (vn[k]||[]).forEach(function(nb){
          body += '<div class="rr-hop">' + nodeChip(nb.target, {}) + '<b>'+ (nb.cosine_similarity!=null? nb.cosine_similarity.toFixed(4):"?") +'</b> cosine (DERIVED_VECTOR_NEIGHBOR)</div>';
        });
      });
      html += section("Vector neighbors (36D cosine similarity, live-computed)", body);
    }

    if(run.cross_domain_paths && run.cross_domain_paths.length){
      var body = run.cross_domain_paths.map(function(p){
        var h = '<p class="rr-prose">'+pill(p.path_type||"STRUCTURAL_PATH","status")+
          (p.not_causal? pill("not a causal path") : "")+'</p>';
        h += nodeChip(p.source, {detail:"SOURCE ("+esc(p.source_domain||"")+")"});
        (p.hops||[]).forEach(function(hop){
          h += '<div class="rr-hop">hop '+hop.hop+' &rarr; <span class="rr-authclass" style="color:var(--ink-dim);border-color:var(--line);">'+esc(hop.relation_origin)+'</span>' +
            (hop.edge_type? ' edge='+esc(hop.edge_type)+' conf='+esc(hop.edge_confidence) : '') +
            (hop.cosine_similarity!=null? ' cosine='+hop.cosine_similarity.toFixed(4) : '') + '</div>';
          if(hop.target_resolution === "UNRESOLVED_IN_VISUAL_BRAIN_BUILD"){
            h += '<div class="rr-gap"><div class="rr-gap-label">unresolved path endpoint -- not a fake node</div>' +
              '<span class="rr-unresolved-id">'+esc(hop.target)+'</span>' +
              (hop.note? '<div class="rr-evt-details">'+esc(hop.note)+'</div>' : "") + '</div>';
          } else {
            h += nodeChip(hop.target, {});
          }
        });
        if(p.target_description) h += '<p class="rr-prose dim">'+esc(p.target_description)+'</p>';
        return h;
      }).join("<hr style='border-color:var(--line);opacity:.4;margin:10px 0;'>");
      html += section("E -- Cross-domain structural path (Required Result 4)", body);
    }

    if(run.strongest_mismatch){
      var sm = run.strongest_mismatch;
      var body = '<div class="rr-gap"><div class="rr-gap-label">Unsupported / missing semantic region -- represented_as_node = '+esc(!!sm.represented_as_node)+'</div>' +
        '<div class="rr-evt-details">'+esc(sm.description||"")+'</div>' +
        (sm.evidence_of_absence? '<div class="rr-evt-details" style="margin-top:4px;">'+esc(sm.evidence_of_absence)+'</div>' : "") +
        '</div>';
      html += section("F -- Strongest mismatch (Required Result 5)", body);
    }

    if(run.rejected_superficial_matches && run.rejected_superficial_matches.length){
      var body = run.rejected_superficial_matches.map(function(r){
        return nodeChip(r.id, {cls:"rejectedmatch", authorityClass:r.authority_class,
          detail: "TEMPTING: "+(r.tempting_because||"") + "  |  REJECTED: "+(r.rejected_because||"")});
      }).join("");
      html += section("G -- Rejected superficial match (Required Result 6)", body);
    }

    if(run.deep_invariant){
      var di = run.deep_invariant;
      var body = '<p class="rr-prose"><b>'+esc(di.invariant_name||"")+'</b> -- '+pill(di.status||"?","status")+'</p>';
      body += '<p class="rr-prose">'+esc(di.structural_form||"")+'</p>';
      if(di.text_evidence) body += '<div class="rr-evt-details"><b>Text evidence:</b> '+esc(di.text_evidence)+'</div>';
      if(di.hexa_evidence) body += nodeChip(di.hexa_evidence.id, {authorityClass: di.hexa_evidence.authority_class, detail: di.hexa_evidence.excerpt});
      if(di.counterexample_or_limit) body += '<div class="rr-evt-details"><b>Limit:</b> '+esc(di.counterexample_or_limit)+'</div>';
      html += section("H -- Deep invariant (Required Result 7)", body);
    }

    if(run.directionality_challenge){
      var dc = run.directionality_challenge;
      var body = Object.keys(dc).map(function(k){
        return '<div class="rr-evt-details"><b>'+esc(k)+':</b> '+esc(dc[k])+'</div>';
      }).join("");
      html += section("I -- Directionality / prior challenge", body);
    }

    if(run.legacy_added_explanatory_depth){
      var le = run.legacy_added_explanatory_depth;
      var body = '<p class="rr-prose">'+pill("LEGACY_ADDED_MORE_DATA = "+run.legacy_added_more_data)+pill("LEGACY_ADDED_EXPLANATORY_DEPTH = "+le.value)+'</p>';
      if(le.reasoning) body += '<p class="rr-prose dim">'+esc(le.reasoning)+'</p>';
      if(le.domains_newly_reached) body += '<div class="rr-evt-details"><b>Domains newly reached:</b> '+esc(le.domains_newly_reached.join(", "))+'</div>';
      if(le.where_reconnection_added_nothing) body += '<div class="rr-evt-details"><b>Where reconnection added nothing:</b> '+esc(le.where_reconnection_added_nothing)+'</div>';
      html += section("L -- What the legacy reconnection actually added", body);
    }

    if(run.novel_cross_medium_transformation){
      var t = run.novel_cross_medium_transformation;
      var body = '<p class="rr-prose"><b>'+esc(t.title||"")+'</b> ('+esc(t.medium||"")+')</p>' +
        '<p class="rr-prose">'+esc(t.description||"")+'</p>' +
        (t.new_inference? '<div class="rr-evt-details"><b>New inference:</b> '+esc(t.new_inference)+'</div>' : "");
      html += section("K -- Novel cross-medium transformation", body);
    }

    if(run.phase_a_vs_hexa_comparison && run.phase_a_vs_hexa_comparison.length){
      var body = run.phase_a_vs_hexa_comparison.map(function(c){
        return '<div class="rr-cmp-row"><span>'+esc(c.claim)+'</span>'+pill(c.verdict)+'</div>';
      }).join("");
      html += section("M -- Phase-A vs full-HEXA comparison", body);
    }

    if(run.final_status_block){
      var fsb = run.final_status_block;
      var body = Object.keys(fsb).map(function(k){ return pill(k+" = "+fsb[k]); }).join("");
      html += section("Final status block", body);
    }

    mount.innerHTML = html;
    mount.querySelectorAll("[data-jump]").forEach(function(el){
      el.addEventListener("click", function(){
        var id = el.getAttribute("data-jump");
        if(G.byId[id]) onJump(G.byId[id]);
      });
    });
  }

  /* ---------- Trace-replay render (additive; does not touch renderRun/renderBlindRun) ----------
     Renders a HEXA_LIVE_TRACE_REPLAY artifact (run.trace_replay === true): a temporally-ordered
     record of exactly what an earlier live-use run retrieved/computed from real HEXA state, with
     no new creative content. Reuses nodeChip (already renders a real node, or a clearly-labeled
     "Referenced by the run but not loaded as a node in this Visual Brain build" placeholder for a
     real-but-unresolved id -- never a fabricated node) and pill/section/esc from above. */

  function relPill(relationOrigin){
    if(!relationOrigin) return "";
    var cls = String(relationOrigin).replace(/[^A-Za-z0-9]+/g, "_");
    return '<span class="rr-authclass rel-'+cls+'">'+esc(relationOrigin)+'</span>';
  }

  function renderTraceReplay(run, mount, onJump){
    var html = "";
    html += '<div class="rr-status-row">' +
      pill(run.run_kind || "HEXA_LIVE_TRACE_REPLAY", "status") +
      pill("input_title = "+(run.input_title||"?")) +
      (run.authority_boundary_preserved!==undefined ? pill("authority_boundary_preserved="+run.authority_boundary_preserved, run.authority_boundary_preserved?"ok":"bad") : "") +
      '</div>';
    if(run.protocol_note) html += '<p class="rr-prose dim">'+esc(run.protocol_note)+'</p>';

    var steps = run.trace_timeline || [];
    var body = steps.map(function(st, idx){
      var catCls = "cat-"+String(st.category||"").replace(/[^A-Za-z0-9]+/g, "_");
      var h = '<div class="rr-trace-step">';
      h += '<div class="rr-trace-step-head"><span class="rr-trace-num">'+(idx+1)+'</span>' +
        '<span class="rr-authclass '+catCls+'">'+esc(st.category||"")+'</span></div>';
      if(st.label) h += '<div class="rr-evt-title">'+esc(st.label)+'</div>';
      if(st.node_id){
        h += nodeChip(st.node_id, {detail: st.detail});
        if(st.node_status_in_build === "UNRESOLVED_IN_VISUAL_BRAIN_BUILD"){
          h += '<div class="rr-gap"><div class="rr-gap-label">real HEXA event -- not loaded as a node in this Visual Brain build</div></div>';
        } else if(st.node_status_in_build === "MATERIALIZED_FOR_TRACE_REPLAY_PRESENT"){
          h += '<div class="rr-materialized"><div class="rr-materialized-label">MATERIALIZED 2026-09-19 -- real, source-backed HEXA node added to the Visual Brain display layer for this replay (was UNRESOLVED at run time); authority/candidate status unchanged</div></div>';
        }
      } else if(st.detail){
        h += '<div class="rr-evt-details">'+esc(st.detail)+'</div>';
      }
      if(st.edge_from_previous){
        var e = st.edge_from_previous;
        h += '<div class="rr-hop">&uarr; '+relPill(e.relation_origin) +
          (e.edge_type? ' edge='+esc(e.edge_type) : '') +
          (e.weight!=null? ' weight='+esc(e.weight) : '') +
          (e.note? ' &mdash; '+esc(e.note) : '') + '</div>';
      }
      h += '</div>';
      return h;
    }).join("");
    html += section("Temporal trace -- what HEXA actually activated, and where the model began to create", body);

    if(run.authority_boundary_note) html += '<p class="rr-prose dim">'+esc(run.authority_boundary_note)+'</p>';

    if(run.final_status_block){
      var fsb = run.final_status_block;
      var fb = Object.keys(fsb).map(function(k){ return pill(k+" = "+fsb[k]); }).join("");
      html += section("Final status block", fb);
    }

    mount.innerHTML = html;
    mount.querySelectorAll("[data-jump]").forEach(function(el){
      el.addEventListener("click", function(){
        var id = el.getAttribute("data-jump");
        if(G.byId[id]) onJump(G.byId[id]);
      });
    });
  }

  window.HexaReasoningView = { render: renderRun };
})();
