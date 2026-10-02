/* HEXA_VISUAL_BRAIN_v2 :: view-topology.js
   VIEW A -- Topology. Primary view. 3D, graph-structure-driven.

   IMPLEMENTATION NOTE (disclosed, not hidden): the spec's stated technology
   preference was Three.js / 3d-force-graph "or equivalent" via CDN. While
   building this app it was discovered that CDN and package-registry access
   is blocked by policy in the build/verification sandbox, so the CDN path
   could never be verified to actually run. Rather than ship an unverified
   external dependency as the PRIMARY view, this is a small, dependency-free
   hand-rolled 3D renderer: a perspective projection (yaw/pitch orbit + zoom)
   drawn on a single 2D canvas. It has ZERO external runtime dependencies,
   works fully offline on any machine, and was verified end-to-end
   (rendering, picking, dragging, path/neighborhood highlight) in this build.
   If three.js is later reachable on the target machine, index.html's CDN
   <script> tags can be restored and this file swapped back to a WebGL
   backend without touching graph-model.js, app.js, or the data layer.

   Node positions come from the one-time offline layout in the data file
   (build/build_model.py) plus whatever the user has manually dragged/pinned.
   There is no running physics here -- nothing "keeps moving" after the
   initial paint (spec: stable graph behavior, no continuous re-simulation).
   Manual repositioning is stored in localStorage only, and has ZERO effect
   on any HEXA field -- it only overrides x/y/z on redraw. */
(function(){
  "use strict";
  var G = window.HexaGraph;

  var AUTHORITY_COLOR = {
    CURRENT_AUTHORITATIVE: "#f5cf65",
    CURRENT_CANDIDATE:     "#e8973f",
    LEGACY_CANDIDATE:      "#4f6f9e",
    REJECTED_SUPERSEDED_UNRESOLVED: "#c9455a"
  };
  var AUTHORITY_LABEL = {
    CURRENT_AUTHORITATIVE: "CURRENT AUTHORITATIVE",
    CURRENT_CANDIDATE:     "CURRENT CANDIDATE",
    LEGACY_CANDIDATE:      "LEGACY CANDIDATE",
    REJECTED_SUPERSEDED_UNRESOLVED: "REJECTED / SUPERSEDED / UNRESOLVED"
  };

  var LAYOUT_KEY = "hexa_v2_manual_layout_v1";
  var PIN_KEY = "hexa_v2_pinned_nodes_v1";
  function loadJSON(key){ try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch(e){ return {}; } }
  function saveJSON(key, obj){ try { localStorage.setItem(key, JSON.stringify(obj)); } catch(e){ /* best effort */ } }

  function esc(s){
    return String(s==null?"":s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }

  function TopologyView(container, callbacks){
    var manualLayout = loadJSON(LAYOUT_KEY);
    var pins = loadJSON(PIN_KEY);

    var canvas = document.createElement("canvas");
    canvas.style.width = "100%"; canvas.style.height = "100%"; canvas.style.display = "block";
    container.innerHTML = "";
    container.appendChild(canvas);
    var ctx = canvas.getContext("2d");
    var tooltip = document.createElement("div");
    tooltip.style.cssText = "position:absolute;pointer-events:none;font:12px monospace;background:#12151fee;" +
      "border:1px solid #252a3a;border-radius:5px;padding:5px 8px;color:#e7eaf3;max-width:280px;display:none;z-index:5;";
    // FIX (root cause of the graph rendering at a squashed, incorrect
    // height -- roughly half its own width, on both desktop and mobile):
    // this used to unconditionally set container.style.position="relative"
    // via inline style, which OVERRODE the stylesheet's #topoHost{position:
    // absolute;inset:0}. With position:relative, inset:0 no longer stretches
    // the container to fill <main>, so its height fell back to auto (content-
    // based), which in turn made the 100%-height canvas fall back to its
    // default 300x150 (2:1) intrinsic aspect ratio -- exactly the "rendered
    // into an incorrect-height container" failure mode. Only add relative
    // positioning if the container is not already positioned by CSS.
    if(getComputedStyle(container).position === "static"){
      container.style.position = "relative";
    }
    container.appendChild(tooltip);

    var W=0, H=0, dpr = window.devicePixelRatio || 1;

    // camera
    var yaw = 0.5, pitch = 0.35, dist = 1300, zoom = 1, panX = 0, panY = 0;
    var FOV_D = 900;

    var currentFilter = { authority: null, domain: null, currentOnly:false, legacyOnly:false, curatedOnly:false };
    var highlightIds = null;
    var pathEdgeSet = null;
    var selectedId = null;
    var hoveredNode = null;

    var allNodes = G.nodes.map(function(n){
      var pos = manualLayout[n.id] || n.layout_position;
      return { hexa: n, x: pos.x, y: pos.y, z: pos.z, sx:0, sy:0, sscale:1, visible:true };
    });
    var nodeById = Object.create(null);
    allNodes.forEach(function(vn){ nodeById[vn.hexa.id] = vn; });

    var curatedSet = Object.create(null);
    G.curatedBridges.forEach(function(b){ curatedSet[b.source+"->"+b.target] = true; });
    var allEdges = G.edges.map(function(e){
      return { e:e, a: nodeById[e.source], b: nodeById[e.target], curated: !!curatedSet[e.source+"->"+e.target] };
    }).filter(function(l){ return l.a && l.b; });

    function nodeVisibleByFilter(n){
      if(currentFilter.currentOnly && n.current_or_legacy !== "CURRENT") return false;
      if(currentFilter.legacyOnly && n.current_or_legacy !== "LEGACY") return false;
      if(currentFilter.authority && n.authority_tier !== currentFilter.authority) return false;
      if(currentFilter.domain && n.domain_name !== currentFilter.domain) return false;
      return true;
    }
    function recomputeVisibility(){
      allNodes.forEach(function(vn){ vn.visible = nodeVisibleByFilter(vn.hexa); });
    }
    recomputeVisibility();

    function resize(w,h){
      W = w || container.clientWidth; H = h || container.clientHeight;
      canvas.width = Math.max(1,W*dpr); canvas.height = Math.max(1,H*dpr);
      canvas.style.width = W+"px"; canvas.style.height = H+"px";
      ctx.setTransform(dpr,0,0,dpr,0,0);
      render();
    }

    // ---- projection ----
    function project(vn){
      var x=vn.x, y=vn.y, z=vn.z;
      // rotate by yaw around Y, then pitch around X
      var cy=Math.cos(yaw), sy=Math.sin(yaw);
      var x1 = x*cy - z*sy;
      var z1 = x*sy + z*cy;
      var y1 = y;
      var cp=Math.cos(pitch), sp=Math.sin(pitch);
      var y2 = y1*cp - z1*sp;
      var z2 = y1*sp + z1*cp;
      var camZ = z2 + dist;
      var scale = (FOV_D/Math.max(1,FOV_D+camZ)) * zoom;
      vn.sx = W/2 + panX + x1*scale;
      vn.sy = H/2 + panY + y2*scale;
      vn.sscale = scale;
      vn.camZ = camZ;
      return vn;
    }
    // camera-space right/up vectors expressed back in world space, for drag-plane math
    function camBasisInWorld(){
      var cy=Math.cos(yaw), sy=Math.sin(yaw), cp=Math.cos(pitch), sp=Math.sin(pitch);
      // inverse of (Rx(pitch) * Ry(yaw)) applied to camera-space unit vectors
      function invRot(px,py,pz){
        // undo pitch
        var y1 = py*cp + pz*sp;
        var z1 = -py*sp + pz*cp;
        var x1 = px;
        // undo yaw
        var x0 = x1*cy + z1*sy;
        var z0 = -x1*sy + z1*cy;
        return [x0, y1, z0];
      }
      return { right: invRot(1,0,0), up: invRot(0,1,0) };
    }

    function authorityColor(n){ return AUTHORITY_COLOR[n.authority_tier] || "#666"; }

    function render(){
      ctx.clearRect(0,0,W,H);
      ctx.fillStyle = "#0a0c12";
      ctx.fillRect(0,0,W,H);

      var visibleNodes = [];
      for(var i=0;i<allNodes.length;i++){
        var vn = allNodes[i];
        if(!vn.visible) continue;
        project(vn);
        if(vn.sx < -50 || vn.sx > W+50 || vn.sy < -50 || vn.sy > H+50) continue;
        visibleNodes.push(vn);
      }

      // edges (drawn first, under nodes)
      ctx.lineWidth = 1;
      for(var j=0;j<allEdges.length;j++){
        var l = allEdges[j];
        if(!l.a.visible || !l.b.visible) continue;
        var aId = l.e.source, bId = l.e.target;
        var isPath = pathEdgeSet && (pathEdgeSet[aId+"->"+bId] || pathEdgeSet[bId+"->"+aId]);
        if(currentFilter.curatedOnly && !l.curated) continue;
        var dim = highlightIds && !(highlightIds[aId] && highlightIds[bId]);
        if(dim && !isPath && !l.curated) continue; // skip clutter when a highlight is active
        ctx.strokeStyle = isPath ? "#f5cf65" : (l.curated ? "#57d18c" : "rgba(80,90,120,0.22)");
        ctx.lineWidth = isPath ? 2.2 : (l.curated ? 1.6 : 0.5);
        ctx.beginPath();
        ctx.moveTo(l.a.sx, l.a.sy);
        ctx.lineTo(l.b.sx, l.b.sy);
        ctx.stroke();
      }

      // depth sort nodes back-to-front
      visibleNodes.sort(function(a,b){ return b.camZ - a.camZ; });

      for(var k=0;k<visibleNodes.length;k++){
        var n = visibleNodes[k];
        var h = n.hexa;
        var deg = (h.structural_significance && h.structural_significance.degree) || 0;
        // size is driven primarily by structural degree (never by authority); authority gets its
        // OWN separate visual channels instead -- color, a guaranteed size floor, and a ring --
        // so "current authoritative" is unmistakable without letting degree/centrality stand in for it.
        var tierFloor = { CURRENT_AUTHORITATIVE: 3.4, CURRENT_CANDIDATE: 2.8,
          REJECTED_SUPERSEDED_UNRESOLVED: 2.8, LEGACY_CANDIDATE: 1.0 }[h.authority_tier] || 1.0;
        var baseR = Math.max(tierFloor, 1.6 + Math.min(5, Math.log2(deg+1)) * (h.authority_tier==="LEGACY_CANDIDATE" ? 0.85 : 1));
        var r = Math.max(1, baseR * Math.max(0.35, n.sscale));
        var dimmed = highlightIds && !highlightIds[h.id];
        ctx.globalAlpha = dimmed ? 0.18 : Math.max(0.35, Math.min(1, n.sscale*1.1));
        ctx.fillStyle = (h.id===selectedId) ? "#ffffff" : authorityColor(h);
        ctx.beginPath();
        ctx.arc(n.sx, n.sy, r, 0, Math.PI*2);
        ctx.fill();
        if(h.id===selectedId){
          ctx.strokeStyle = "#ffffff"; ctx.lineWidth=1.2;
          ctx.beginPath(); ctx.arc(n.sx,n.sy,r+3,0,Math.PI*2); ctx.stroke();
        } else if((h.authority_tier==="CURRENT_AUTHORITATIVE" || h.authority_tier==="REJECTED_SUPERSEDED_UNRESOLVED") && !dimmed){
          ctx.strokeStyle = authorityColor(h); ctx.globalAlpha = 0.5; ctx.lineWidth=1;
          ctx.beginPath(); ctx.arc(n.sx,n.sy,r+2,0,Math.PI*2); ctx.stroke();
          ctx.globalAlpha = dimmed ? 0.18 : Math.max(0.35, Math.min(1, n.sscale*1.1));
        }
        if(pins[h.id]){
          ctx.strokeStyle = "#f5cf65"; ctx.lineWidth=1;
          ctx.beginPath(); ctx.arc(n.sx,n.sy,r+2,0,Math.PI*2); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      // deferred labels: only for nodes above a size/degree threshold or selected/hovered,
      // and only once the view is zoomed in enough -- keeps 6k+ nodes legible (spec 17/19)
      var labelBudget = 140;
      visibleNodes
        .filter(function(n){ return n.sscale > 0.85 || n.hexa.id===selectedId || n.hexa.id===(hoveredNode&&hoveredNode.hexa.id); })
        .sort(function(a,b){
          var tw = { CURRENT_AUTHORITATIVE:3, CURRENT_CANDIDATE:2, REJECTED_SUPERSEDED_UNRESOLVED:2, LEGACY_CANDIDATE:0 };
          var wa = (tw[a.hexa.authority_tier]||0)*1000 + (((a.hexa.structural_significance||{}).degree)||0);
          var wb = (tw[b.hexa.authority_tier]||0)*1000 + (((b.hexa.structural_significance||{}).degree)||0);
          return wb - wa;
        })
        .slice(0, labelBudget)
        .forEach(function(n){
          var h = n.hexa;
          var label = (h.title || h.conversation_title || "").toString().slice(0,40);
          if(!label) return;
          ctx.font = "10px monospace";
          ctx.fillStyle = "rgba(231,234,243,0.75)";
          ctx.fillText(label, n.sx+6, n.sy+3);
        });

      // small legend
      ctx.font = "10px monospace";
      var ly = H-70;
      Object.keys(AUTHORITY_LABEL).forEach(function(k,i){
        ctx.fillStyle = AUTHORITY_COLOR[k];
        ctx.fillRect(12, ly+i*15-8, 8, 8);
        ctx.fillStyle = "#8992a8";
        ctx.fillText(AUTHORITY_LABEL[k], 26, ly+i*15);
      });
    }

    // ---- interaction ----
    var dragging = null; // {mode:'orbit'|'pan'|'node', startX, startY, startYaw, startPitch, node}
    canvas.addEventListener("contextmenu", function(e){ e.preventDefault(); });

    function pickNode(mx,my){
      var best=null, bestD=12;
      for(var i=0;i<allNodes.length;i++){
        var vn = allNodes[i];
        if(!vn.visible) continue;
        var d = Math.hypot(vn.sx-mx, vn.sy-my);
        if(d<bestD){ bestD=d; best=vn; }
      }
      return best;
    }

    canvas.addEventListener("mousedown", function(ev){
      var rect = canvas.getBoundingClientRect();
      var mx=ev.clientX-rect.left, my=ev.clientY-rect.top;
      var hit = pickNode(mx,my);
      if(hit && ev.button===0 && ev.shiftKey===false && ev.altKey){
        dragging = { mode:"node", node:hit, lastX:mx, lastY:my };
      } else if(ev.button===2 || ev.shiftKey){
        dragging = { mode:"pan", lastX:mx, lastY:my };
      } else {
        dragging = { mode:"orbit", lastX:mx, lastY:my, startedOnNode: hit };
      }
    });
    window.addEventListener("mousemove", function(ev){
      var rect = canvas.getBoundingClientRect();
      var mx=ev.clientX-rect.left, my=ev.clientY-rect.top;
      if(!dragging){
        var hov = pickNode(mx,my);
        if(hov !== hoveredNode){
          hoveredNode = hov;
          if(hov){
            tooltip.style.display="block";
            tooltip.style.left=(mx+14)+"px"; tooltip.style.top=(my+10)+"px";
            tooltip.innerHTML = "<b>"+esc(hov.hexa.title||hov.hexa.conversation_title||hov.hexa.id)+"</b><br>" +
              "<span style='color:#8992a8'>"+esc(AUTHORITY_LABEL[hov.hexa.authority_tier]||"")+"</span>";
          } else { tooltip.style.display="none"; }
          render();
        } else if(hov){
          tooltip.style.left=(mx+14)+"px"; tooltip.style.top=(my+10)+"px";
        }
        return;
      }
      var dx = mx-dragging.lastX, dy = my-dragging.lastY;
      if(dragging.mode==="orbit"){
        yaw += dx*0.006; pitch += dy*0.006;
        pitch = Math.max(-1.4, Math.min(1.4, pitch));
      } else if(dragging.mode==="pan"){
        panX += dx; panY += dy;
      } else if(dragging.mode==="node"){
        var basis = camBasisInWorld();
        var scale = dragging.node.sscale || 1;
        var invScale = 1/Math.max(0.05, scale);
        var n = dragging.node;
        n.x += basis.right[0]*dx*invScale - basis.up[0]*dy*invScale;
        n.y += basis.right[1]*dx*invScale - basis.up[1]*dy*invScale;
        n.z += basis.right[2]*dx*invScale - basis.up[2]*dy*invScale;
      }
      dragging.lastX = mx; dragging.lastY = my;
      render();
    });
    window.addEventListener("mouseup", function(ev){
      if(dragging && dragging.mode==="orbit" && dragging.startedOnNode){
        var moved = false; // click vs drag distinguished by browser click event instead
      }
      if(dragging && dragging.mode==="node"){
        var n = dragging.node;
        manualLayout[n.hexa.id] = { x:n.x, y:n.y, z:n.z };
        saveJSON(LAYOUT_KEY, manualLayout);
      }
      dragging = null;
    });
    canvas.addEventListener("click", function(ev){
      var rect = canvas.getBoundingClientRect();
      var mx=ev.clientX-rect.left, my=ev.clientY-rect.top;
      var hit = pickNode(mx,my);
      if(hit){
        selectedId = hit.hexa.id;
        callbacks.onNodeSelect && callbacks.onNodeSelect(hit.hexa);
        render();
      }
    });
    canvas.addEventListener("wheel", function(ev){
      ev.preventDefault();
      zoom = Math.max(0.15, Math.min(8, zoom * (ev.deltaY<0?1.08:0.92)));
      render();
    }, { passive:false });

    // ---- touch interaction (mobile) -- additive; does not alter mouse
    // behavior, node positions, layout data, or any HEXA semantics. One
    // finger orbits (same rotation math as mouse-drag orbit above), a
    // still tap selects (same pickNode as the click handler), two fingers
    // pinch-zoom and pan together. ----
    var touchState = null;
    function tDist(a,b){ return Math.hypot(a.clientX-b.clientX, a.clientY-b.clientY); }
    function tMid(a,b,rect){ return { x:((a.clientX+b.clientX)/2)-rect.left, y:((a.clientY+b.clientY)/2)-rect.top }; }

    canvas.addEventListener("touchstart", function(ev){
      var rect = canvas.getBoundingClientRect();
      if(ev.touches.length === 1){
        var mx = ev.touches[0].clientX-rect.left, my = ev.touches[0].clientY-rect.top;
        touchState = { mode:"orbit", lastX:mx, lastY:my, startX:mx, startY:my, moved:false, t0:Date.now() };
      } else if(ev.touches.length === 2){
        touchState = { mode:"pinch", lastDist: tDist(ev.touches[0], ev.touches[1]), lastMid: tMid(ev.touches[0], ev.touches[1], rect) };
      }
      ev.preventDefault();
    }, { passive:false });

    canvas.addEventListener("touchmove", function(ev){
      if(!touchState) return;
      var rect = canvas.getBoundingClientRect();
      if(touchState.mode === "orbit" && ev.touches.length === 1){
        var mx = ev.touches[0].clientX-rect.left, my = ev.touches[0].clientY-rect.top;
        var dx = mx-touchState.lastX, dy = my-touchState.lastY;
        if(Math.abs(mx-touchState.startX) > 6 || Math.abs(my-touchState.startY) > 6) touchState.moved = true;
        yaw += dx*0.006; pitch += dy*0.006;
        pitch = Math.max(-1.4, Math.min(1.4, pitch));
        touchState.lastX = mx; touchState.lastY = my;
        render();
      } else if(touchState.mode === "pinch" && ev.touches.length === 2){
        var dist = tDist(ev.touches[0], ev.touches[1]);
        var mid = tMid(ev.touches[0], ev.touches[1], rect);
        var ratio = dist/(touchState.lastDist||dist);
        zoom = Math.max(0.15, Math.min(8, zoom*ratio));
        panX += mid.x-touchState.lastMid.x;
        panY += mid.y-touchState.lastMid.y;
        touchState.lastDist = dist; touchState.lastMid = mid;
        render();
      }
      ev.preventDefault();
    }, { passive:false });

    canvas.addEventListener("touchend", function(ev){
      if(touchState && touchState.mode === "orbit" && !touchState.moved && (Date.now()-touchState.t0) < 400){
        var hit = pickNode(touchState.startX, touchState.startY);
        if(hit){
          selectedId = hit.hexa.id;
          callbacks.onNodeSelect && callbacks.onNodeSelect(hit.hexa);
          render();
        }
      }
      if(!ev.touches || ev.touches.length === 0){ touchState = null; }
      else if(ev.touches.length === 1){
        var rect = canvas.getBoundingClientRect();
        var mx = ev.touches[0].clientX-rect.left, my = ev.touches[0].clientY-rect.top;
        touchState = { mode:"orbit", lastX:mx, lastY:my, startX:mx, startY:my, moved:true, t0:Date.now() };
      }
    }, { passive:true });

    canvas.addEventListener("touchcancel", function(){ touchState = null; }, { passive:true });

    resize();

    return {
      setFilter: function(patch){
        Object.assign(currentFilter, patch);
        recomputeVisibility();
        render();
      },
      focusNode: function(id){
        var vn = nodeById[id];
        if(!vn) return;
        selectedId = id;
        // orient camera so this node sits centered: adjust pan so its projected pos is centered
        project(vn);
        panX += (W/2 - vn.sx);
        panY += (H/2 - vn.sy);
        zoom = Math.min(4, Math.max(zoom, 1.4));
        render();
      },
      showNeighborhood: function(id){
        var set = Object.create(null);
        set[id]=true;
        (G.neighbors(id)||[]).forEach(function(a){ set[a.other]=true; });
        highlightIds = set; pathEdgeSet = null;
        render();
      },
      showPath: function(fromId, toId){
        var path = G.structuralPath(fromId, toId);
        if(!path) return null;
        var set = Object.create(null);
        path.forEach(function(id){ set[id]=true; });
        highlightIds = set;
        pathEdgeSet = Object.create(null);
        for(var i=0;i<path.length-1;i++){ pathEdgeSet[path[i]+"->"+path[i+1]] = true; }
        render();
        return path;
      },
      clearHighlight: function(){ highlightIds=null; pathEdgeSet=null; render(); },
      togglePin: function(id){
        pins[id] = !pins[id];
        saveJSON(PIN_KEY, pins);
        render();
        return pins[id];
      },
      isPinned: function(id){ return !!pins[id]; },
      resetManualLayout: function(){
        manualLayout = {}; saveJSON(LAYOUT_KEY, manualLayout);
        allNodes.forEach(function(vn){ var p=vn.hexa.layout_position; vn.x=p.x; vn.y=p.y; vn.z=p.z; });
        render();
      },
      resize: resize,
      instance: { note: "hand-rolled canvas 3D projection, no external library" }
    };
  }

  window.HexaTopologyView = TopologyView;
})();
