/* HEXA_VISUAL_BRAIN_v2 :: app.js -- wiring only. No HEXA data is computed,
   inferred, or mutated here; this file only reads window.HexaGraph and
   drives the three views + inspector panels. */
(function(){
  "use strict";
  var G = window.HexaGraph;

  var AUTHORITY_LABEL = {
    CURRENT_AUTHORITATIVE: "CURRENT AUTHORITATIVE",
    CURRENT_CANDIDATE:     "CURRENT CANDIDATE",
    LEGACY_CANDIDATE:      "LEGACY CANDIDATE",
    REJECTED_SUPERSEDED_UNRESOLVED: "REJECTED / SUPERSEDED / UNRESOLVED"
  };
  var FAB_IDS = (G.summary.recsk_fabrication_safety && G.summary.recsk_fabrication_safety.fabricated_message_ids) || [];

  function $(sel){ return document.querySelector(sel); }
  function $all(sel){ return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function esc(s){
    return String(s==null?"":s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }

  // ---------- header stats ----------
  function paintHeader(){
    var c = G.summary.counts || {};
    $("#statNodes").textContent = (c.total_nodes||0).toLocaleString();
    $("#statEdges").textContent = (c.total_edges||0).toLocaleString();
    $("#statVectors").textContent = (c.nodes_with_vector||0).toLocaleString();
    $("#statBridges").textContent = (c.curated_transform_bridges||0);
    $("#modeChip").textContent = "CURRENT_LAYER_MODE = " + (G.summary.current_layer_mode||"?");
    $("#fingerprintChip").title = "state_fingerprint " + ((G.summary.current_layer_source||{}).state_fingerprint||"") +
      " | retrieved_at " + ((G.summary.current_layer_source||{}).retrieved_at||"");
  }

  // ---------- filters ----------
  function populateDomainFilter(){
    var sel = $("#domainFilter");
    (G.summary.counts.domains_present || []).forEach(function(d){
      var o = document.createElement("option"); o.value = d; o.textContent = d;
      sel.appendChild(o);
    });
  }

  var topoView, historyView;
  var topologyAvailable = true;
  var currentTab = "topology";

  var STUB_TOPO_VIEW = {
    setFilter:function(){}, focusNode:function(){}, showNeighborhood:function(){},
    showPath:function(){ return null; }, clearHighlight:function(){}, togglePin:function(){ return false; },
    isPinned:function(){ return false; }, resetManualLayout:function(){}, resize:function(){}
  };
  var selectedNode = null, selectedEdge = null;

  function setTab(tab){
    currentTab = tab;
    $all(".view-pane").forEach(function(p){ p.hidden = (p.dataset.view !== tab); });
    $all(".tab-btn").forEach(function(b){ b.classList.toggle("active", b.dataset.tab === tab); });
    if(tab === "topology"){ topoView.resize($("#topoHost").clientWidth, $("#topoHost").clientHeight); }
    if(tab === "history"){ historyView.resize(); }
  }

  function applyFilters(){
    var authority = $("#authorityFilter").value || null;
    var domain = $("#domainFilter").value || null;
    var mode = $("#curLegMode").value; // all | current | legacy
    topoView.setFilter({
      authority: authority,
      domain: domain,
      currentOnly: mode === "current",
      legacyOnly: mode === "legacy",
      curatedOnly: $("#curatedOnlyToggle").checked
    });
  }

  // ---------- inspector ----------
  function radarSVG(values, keys, color){
    var size=150, cx=size/2, cy=size/2, r=size/2-16;
    var n = keys.length;
    var pts = keys.map(function(k,i){
      var v = Math.max(0, Math.min(1, values[k]==null?0:values[k]));
      var ang = -Math.PI/2 + i*2*Math.PI/n;
      return [cx+Math.cos(ang)*r*v, cy+Math.sin(ang)*r*v];
    });
    var axisLines = keys.map(function(k,i){
      var ang = -Math.PI/2 + i*2*Math.PI/n;
      return '<line x1="'+cx+'" y1="'+cy+'" x2="'+(cx+Math.cos(ang)*r)+'" y2="'+(cy+Math.sin(ang)*r)+'" stroke="#252a3a" stroke-width="1"/>';
    }).join("");
    var poly = pts.map(function(p){ return p[0].toFixed(1)+","+p[1].toFixed(1); }).join(" ");
    return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'">' + axisLines +
      '<polygon points="'+poly+'" fill="'+color+'33" stroke="'+color+'" stroke-width="1.5"/></svg>';
  }

  function renderNodeInspector(n){
    selectedNode = n; selectedEdge = null;
    var el = $("#inspector");
    var isFab = FAB_IDS.indexOf(n.message_node_id) !== -1;
    var html = "";
    html += '<div class="insp-head">'+
      '<span class="authtag auth-'+n.authority_tier+'">'+esc(AUTHORITY_LABEL[n.authority_tier]||n.authority_tier)+'</span>' +
      '</div>';
    html += '<h3>'+esc(n.title || n.conversation_title || n.id)+'</h3>';
    html += '<div class="insp-grid">' +
      kv("id", n.id) + kv("source_type", n.source_type) + kv("origin", n.origin) +
      kv("current_or_legacy", n.current_or_legacy) +
      kv("evidence_certainty (not authority)", n.evidence_certainty) +
      kv("structural degree (not authority)", n.structural_significance && n.structural_significance.degree) +
      kv("curated_transform_endpoint", n.structural_significance && n.structural_significance.is_curated_transform_endpoint) +
      kv("domain", n.domain_name || (n.domains_list||[]).join(", ")) +
      kv("domain_inferred", n.domain_inferred) +
      kv("phase", n.phase_name) +
      kv("lifecycle", n.lifecycle) + kv("status", n.status) + kv("kind", n.kind) +
      kv("created/occurred", n.created_at || n.occurred_at) +
      kv("conversation", n.conversation_title) +
      kv("has_vector", n.has_vector) +
      kv("source_ref", n.source_ref) + kv("source_sha256", n.source_sha256) +
      '</div>';

    if(isFab){
      html += '<div class="fab-warning">This node corresponds to a message classified FALSE_MATCH ' +
        '(a rejected, fabricated "recreation" -- see Archaeology overlay). It is not present in this graph ' +
        'and its wording is never shown here by design.</div>';
    } else if(n.snippet){
      html += '<button class="btn small" id="btnOpenSource">OPEN SOURCE TEXT</button>' +
        '<div class="source-text" id="sourceText" hidden>'+esc(n.snippet)+'</div>';
    }

    if(n.state10 || n.topology_signature || n.aux_vector_10d){
      html += '<div class="insp-radars">';
      if(n.state10) html += '<div class="radar-box">'+radarSVG(n.state10, Object.keys(n.state10), "#7ea7e0")+'<div class="cap">state10</div></div>';
      if(n.topology_signature) html += '<div class="radar-box">'+radarSVG(n.topology_signature, Object.keys(n.topology_signature), "#f0a94f")+'<div class="cap">topology_signature</div></div>';
      if(n.aux_vector_10d){
        var auxKeyed = {}; n.aux_vector_10d.forEach(function(v,i){ auxKeyed["a"+i]=v; });
        html += '<div class="radar-box">'+radarSVG(auxKeyed, Object.keys(auxKeyed), "#57d18c")+'<div class="cap">aux_vector_10d (legacy)</div></div>';
      }
      html += '</div>';
    }

    html += '<div class="insp-actions">' +
      '<button class="btn small" id="btnFocus">FOCUS NODE</button>' +
      '<button class="btn small" id="btnNeighborhood">FOCUS NEIGHBORHOOD</button>' +
      '<button class="btn small" id="btnPin">'+(topoView.isPinned(n.id)?"UNPIN":"PIN")+'</button>' +
      (n.has_vector ? '<button class="btn small" id="btnNeighbors">NEAREST NEIGHBORS</button>' : '') +
      '<button class="btn small ghost" id="btnPathFrom">SET AS PATH START</button>' +
      '<button class="btn small ghost" id="btnPathTo">SHOW STRUCTURAL PATH TO SELECTED START</button>' +
      '</div>';
    html += '<div id="neighborResults"></div>';

    el.innerHTML = html;
    openInspectorSheet();

    var srcBtn = $("#btnOpenSource");
    if(srcBtn) srcBtn.addEventListener("click", function(){
      var t = $("#sourceText"); t.hidden = !t.hidden;
    });
    $("#btnFocus").addEventListener("click", function(){ if(currentTab==="topology") topoView.focusNode(n.id); });
    $("#btnNeighborhood").addEventListener("click", function(){ if(currentTab==="topology") topoView.showNeighborhood(n.id); });
    $("#btnPin").addEventListener("click", function(){ topoView.togglePin(n.id); renderNodeInspector(n); });
    $("#btnPathFrom").addEventListener("click", function(){ window.__hexaPathStart = n.id; toast("Path start set: "+n.id); });
    $("#btnPathTo").addEventListener("click", function(){
      if(!window.__hexaPathStart){ toast("Set a path start first."); return; }
      var path = topoView.showPath(window.__hexaPathStart, n.id);
      if(!path){ toast("STRUCTURAL PATH: none found within the examined component."); }
      else { toast("STRUCTURAL PATH ("+path.length+" hops): not a causal path."); }
    });
    var nbBtn = $("#btnNeighbors");
    if(nbBtn) nbBtn.addEventListener("click", function(){
      var res = G.nearestNeighbors(n.id, 10);
      var host = $("#neighborResults");
      host.innerHTML = '<div class="rr-subhead">Nearest neighbors (36D cosine similarity -- a view projection, not new topology)</div>' +
        res.map(function(r){
          return '<div class="rr-evt" data-jump="'+esc(r.node.id)+'"><div class="rr-evt-title">'+esc(r.node.title||r.node.conversation_title||r.node.id)+
            '</div><div class="rr-evt-meta">similarity '+r.score.toFixed(3)+'</div></div>';
        }).join("");
      host.querySelectorAll("[data-jump]").forEach(function(elx){
        elx.addEventListener("click", function(){ selectById(elx.getAttribute("data-jump")); });
      });
    });
  }

  function kv(k,v){
    if(v===undefined||v===null||v==="") return "";
    return '<div class="kv-row"><span class="k">'+esc(k)+'</span><span class="v">'+esc(v)+'</span></div>';
  }

  function renderEdgeInspector(e){
    selectedEdge = e; selectedNode = null;
    var s = G.byId[e.source], t = G.byId[e.target];
    var el = $("#inspector");
    el.innerHTML = '<h3>Edge</h3>' +
      kv("relation_type", e.relation_type) + kv("label", e.label) +
      kv("weight/confidence", e.weight) + kv("directed", e.directed) +
      kv("explicit", e.explicit) + kv("curated_transform", e.curated) +
      kv("current_or_legacy", e.current_or_legacy) + kv("authority", e.authority) +
      (e.invariant? kv("invariant", e.invariant) : "") +
      (e.carrier_change? kv("carrier_change", e.carrier_change) : "") +
      (e.relation_note? kv("relation_note", e.relation_note) : "") +
      '<div class="rr-subhead">Endpoints</div>' +
      '<div class="rr-evt" data-jump="'+esc(e.source)+'"><div class="rr-evt-title">'+esc(s?(s.title||s.conversation_title||s.id):e.source)+'</div></div>' +
      '<div class="rr-evt" data-jump="'+esc(e.target)+'"><div class="rr-evt-title">'+esc(t?(t.title||t.conversation_title||t.id):e.target)+'</div></div>';
    el.querySelectorAll("[data-jump]").forEach(function(elx){
      elx.addEventListener("click", function(){ selectById(elx.getAttribute("data-jump")); });
    });
    openInspectorSheet();
  }

  function selectById(id){
    var n = G.byId[id];
    if(n) renderNodeInspector(n);
  }

  var toastTimer=null;
  function toast(msg){
    var t = $("#toast");
    t.textContent = msg; t.hidden=false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ t.hidden=true; }, 4200);
  }

  // ---------- mobile drawers / bottom sheet (additive; no effect on desktop
  // layout or on any HEXA data/semantics -- purely open/close UI state) ----------
  function isFiltersOpen(){ var a=$("aside.left"); return !!(a && a.classList.contains("open")); }
  function isInspectorOpen(){ var a=$("aside.right"); return !!(a && a.classList.contains("open")); }
  function showBackdrop(show){ var b=$("#mobileBackdrop"); if(b) b.classList.toggle("show", !!show); }
  function openFiltersDrawer(){ var a=$("aside.left"); if(a) a.classList.add("open"); showBackdrop(true); }
  function closeFiltersDrawer(){ var a=$("aside.left"); if(a) a.classList.remove("open"); showBackdrop(isInspectorOpen()); }
  function openInspectorSheet(){
    if(!(window.matchMedia && window.matchMedia("(max-width:860px)").matches)) return;
    var a=$("aside.right"); if(a) a.classList.add("open"); showBackdrop(true);
  }
  function closeInspectorSheet(){
    var a=$("aside.right"); if(a){ a.classList.remove("open"); a.classList.remove("expanded"); }
    showBackdrop(isFiltersOpen());
  }
  function closeAllMobilePanels(){ closeFiltersDrawer(); closeInspectorSheet(); }

  // ---------- search ----------
  function runSearch(){
    var q = $("#searchBox").value;
    var results = G.search(q);
    var host = $("#searchResults");
    if(!q){ host.innerHTML = ""; return; }
    host.innerHTML = results.slice(0,80).map(function(n){
      return '<div class="rr-evt" data-jump="'+esc(n.id)+'"><div class="rr-evt-title">'+esc(n.title||n.conversation_title||n.id)+
        '</div><div class="rr-evt-meta"><span class="authtag auth-'+n.authority_tier+'">'+esc(n.authority_tier)+'</span></div></div>';
    }).join("") + '<div class="dim" style="padding:6px;">'+results.length+' match(es)</div>';
    host.querySelectorAll("[data-jump]").forEach(function(elx){
      elx.addEventListener("click", function(){
        var id = elx.getAttribute("data-jump");
        selectById(id);
        if(currentTab==="topology") topoView.focusNode(id);
        closeFiltersDrawer();
      });
    });
  }

  // ---------- curated transforms panel ----------
  function renderCuratedPanel(){
    var host = $("#curatedPanel");
    host.innerHTML = '<div class="rr-subhead">10 curated cross-domain bridges -- discovery structures, not authority promotion paths</div>' +
      G.curatedBridges.map(function(b, i){
        var sn = G.byId[b.source], tn = G.byId[b.target];
        return '<div class="rr-evt">' +
          '<div class="rr-evt-title">'+esc(b.label)+' ('+ (b.confidence!=null? b.confidence.toFixed(2):"?") +')</div>' +
          '<div class="rr-evt-meta">'+pill(b.source_domain)+' &rarr; '+pill(b.target_domain)+'</div>' +
          (b.invariant? '<div class="rr-evt-details"><b>Invariant:</b> '+esc(b.invariant)+'</div>' : "") +
          (b.carrier_change? '<div class="rr-evt-details"><b>Carrier change:</b> '+esc(b.carrier_change)+'</div>' : "") +
          '<div class="rr-evt-actions">' +
            '<button class="btn tiny" data-jump="'+esc(b.source)+'">'+esc(sn?(sn.title||"source"):"source")+'</button>' +
            '<button class="btn tiny" data-jump="'+esc(b.target)+'">'+esc(tn?(tn.title||"target"):"target")+'</button>' +
            '<button class="btn tiny" data-edge="'+i+'">INSPECT EDGE</button>' +
          '</div></div>';
      }).join("");
    host.querySelectorAll("[data-jump]").forEach(function(elx){
      elx.addEventListener("click", function(){
        var id = elx.getAttribute("data-jump");
        selectById(id);
        setTab("topology");
        topoView.focusNode(id);
      });
    });
    host.querySelectorAll("[data-edge]").forEach(function(elx){
      elx.addEventListener("click", function(){
        var b = G.curatedBridges[+elx.getAttribute("data-edge")];
        var edge = G.edges.find(function(e){ return e.source===b.source && e.target===b.target && e.curated; });
        if(edge) renderEdgeInspector(edge);
      });
    });
  }
  function pill(t){ return t? '<span class="rr-pill">'+esc(t)+'</span>' : ""; }

  // ---------- archaeology overlay panel (read-only, never graph truth) ----------
  function renderArchaeologyPanel(){
    var host = $("#archaeologyPanel");
    var deep = (G.archaeology.deep_recovery || {});
    var candidates = deep.candidates || [];
    var html = '<div class="rr-subhead">HEXA_INFORMATION_REVIVAL_v1 overlay -- optional, read-only, never rewritten into graph truth.</div>';
    html += '<p class="dim">Recsk deep-recovery conclusion: <b>'+esc(deep.conclusion||"n/a")+'</b></p>';
    html += candidates.map(function(c){
      var cls = c.classification === "FALSE_MATCH" ? "fab" : "";
      return '<div class="rr-evt '+cls+'">' +
        '<div class="rr-evt-title">'+esc(c.classification)+' -- '+esc(c.conversation_title||"")+'</div>' +
        '<div class="rr-evt-meta">'+pill(c.timestamp_utc)+'</div>' +
        '<div class="rr-evt-details">'+esc(c.reason||"")+'</div>' +
        (c.new_finding? '<div class="rr-evt-details" style="color:#f0a94f">Newly logged in this run.</div>' : "") +
        '</div>';
    }).join("");
    var proj = (G.archaeology.project_archaeology || {});
    if(proj.returning_ideas){
      html += '<div class="rr-subhead">Returning ideas</div>';
      (proj.returning_ideas||[]).forEach(function(r){
        html += '<div class="rr-evt-details">'+esc(JSON.stringify(r).slice(0,400))+'</div>';
      });
    }
    host.innerHTML = html;
  }

  // ---------- reasoning view ----------
  var currentReasoningRun = G.reasoningSample;
  function renderReasoning(){
    window.HexaReasoningView.render(currentReasoningRun, $("#reasoningMount"), function(n){
      selectById(n.id);
    });
    $("#reasoningSourceNote").textContent = !currentReasoningRun ? "No run loaded."
      : currentReasoningRun.blind_run
        ? "Real HEXA FULL-RECONNECTED BLIND RUN over current HEXA_MASTER_REAL + legacy topology/archive. Read-only; zero project-state writes."
        : "Real run, engine.py / Project Reasoning Engine, over live current HEXA_MASTER_REAL data. Not fabricated for this app.";
  }

  // ---------- init ----------
  document.addEventListener("DOMContentLoaded", function(){
    paintHeader();
    populateDomainFilter();

    try {
      topoView = window.HexaTopologyView($("#topoHost"), { onNodeSelect: renderNodeInspector });
    } catch(err){
      topologyAvailable = false;
      topoView = STUB_TOPO_VIEW;
      $("#topoHost").innerHTML = '<div class="empty-state" style="padding-top:120px;">' +
        '<p><b>3D Topology view failed to initialize.</b></p><p class="dim">Every other view and feature ' +
        '(History, Reasoning, search, inspector, Archaeology overlay) works independently and is unaffected.</p>' +
        '<p class="dim">Error: '+esc(err.message)+'</p></div>';
      console.error("Topology view unavailable:", err);
    }
    historyView = window.HexaHistoryView($("#historyCanvas"), {
      onNodeSelect: renderNodeInspector,
      onBucketSelect: function(b){
        toast(b.count+" legacy items in "+ new Date(b.day*86400000).toISOString().slice(0,10) + " / " + b.lane);
      }
    });

    $all(".tab-btn").forEach(function(b){ b.addEventListener("click", function(){ setTab(b.dataset.tab); closeAllMobilePanels(); }); });

    var filtersOpenBtn = $("#filtersOpenBtn");
    if(filtersOpenBtn) filtersOpenBtn.addEventListener("click", openFiltersDrawer);
    var filtersCloseBtn = $("#filtersCloseBtn");
    if(filtersCloseBtn) filtersCloseBtn.addEventListener("click", closeFiltersDrawer);
    var inspectorCloseBtn = $("#inspectorCloseBtn");
    if(inspectorCloseBtn) inspectorCloseBtn.addEventListener("click", closeInspectorSheet);
    var mobileBackdropEl = $("#mobileBackdrop");
    if(mobileBackdropEl) mobileBackdropEl.addEventListener("click", closeAllMobilePanels);
    var searchOpenBtn = $("#searchOpenBtn");
    if(searchOpenBtn) searchOpenBtn.addEventListener("click", function(){
      openFiltersDrawer();
      var sb = $("#searchBox"); if(sb) sb.focus();
    });
    var inspSheetHandle = $("#inspectorSheetHandle");
    if(inspSheetHandle) inspSheetHandle.addEventListener("click", function(){
      var a = $("aside.right"); if(a) a.classList.toggle("expanded");
    });

    $("#authorityFilter").addEventListener("change", applyFilters);
    $("#domainFilter").addEventListener("change", applyFilters);
    $("#curLegMode").addEventListener("change", applyFilters);
    $("#curatedOnlyToggle").addEventListener("change", applyFilters);
    $("#resetLayoutBtn").addEventListener("click", function(){
      topoView.resetManualLayout();
      toast("Manual layout reset to computed positions (zero semantic effect either way).");
    });
    $("#clearHighlightBtn").addEventListener("click", function(){ topoView.clearHighlight(); });

    $("#searchBox").addEventListener("input", debounce(runSearch, 120));

    $("#includeLegacyHistory").addEventListener("change", function(){ historyView.setIncludeLegacy(this.checked); });
    $("#laneModeSelect").addEventListener("change", function(){ historyView.setLaneMode(this.value); });

    renderCuratedPanel();
    renderArchaeologyPanel();
    renderReasoning();

    var loadRunInput = $("#loadRunInput");
    $("#loadRunBtn").addEventListener("click", function(){ loadRunInput.click(); });
    loadRunInput.addEventListener("change", function(){
      var f = this.files[0]; if(!f) return;
      var reader = new FileReader();
      reader.onload = function(){
        try {
          var parsed = JSON.parse(reader.result);
          currentReasoningRun = parsed;
          renderReasoning();
          toast("Loaded external ReasoningRun from " + f.name);
        } catch(e){ toast("Could not parse that file as JSON."); }
      };
      reader.readAsText(f);
    });
    $("#restoreSampleBtn").addEventListener("click", function(){
      currentReasoningRun = G.reasoningSample;
      $("#runSelect").value = "sample";
      renderReasoning();
    });

    $("#runSelect").addEventListener("change", function(){
      var v = this.value;
      if(v === "szeretett" && G.reasoningSzeretett){
        currentReasoningRun = G.reasoningSzeretett;
      } else if(v === "recsk_hatarertek_live_01" && G.reasoningRecskHatarertek){
        currentReasoningRun = G.reasoningRecskHatarertek;
      } else {
        currentReasoningRun = G.reasoningSample;
      }
      renderReasoning();
    });

    window.addEventListener("resize", function(){
      if(currentTab==="topology") topoView.resize($("#topoHost").clientWidth, $("#topoHost").clientHeight);
      if(currentTab==="history") historyView.resize();
    });

    setTab("topology");
  });

  function debounce(fn, ms){
    var t; return function(){ var args=arguments, ctx=this; clearTimeout(t); t=setTimeout(function(){ fn.apply(ctx,args); }, ms); };
  }
})();
