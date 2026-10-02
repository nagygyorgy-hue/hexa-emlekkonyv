/* HEXA_VISUAL_BRAIN_v2 :: view-history.js
   VIEW B — History. Complementary, not primary (per spec). A canvas-based
   time x lane layout, adapted from the "timeline x kind lane, settled by
   a lightweight force simulation for legibility only" component in the
   existing HEXA Visual Brain v1 prototype (hexa_visual_brain/app/template.html).
   The x-axis is real chronology; the y-axis lane is categorical (kind /
   domain / authority tier); a light one-time jitter-relaxation avoids
   label overlap. No force here ever encodes evidence or authority --
   only readability. */
(function(){
  "use strict";
  var G = window.HexaGraph;

  var KIND_ORDER = ["RESULT","DECISION","NOTE","FAILURE","UNRESOLVED","CANDIDATE","LEGACY_MESSAGE","LEGACY_CONVERSATION"];
  var KIND_COLOR = {
    RESULT:"#4fd1c5", FAILURE:"#f0616f", DECISION:"#f0a94f", NOTE:"#7ea7e0",
    UNRESOLVED:"#b48ef0", CANDIDATE:"#f5cf65", LEGACY_MESSAGE:"#4f6f9e", LEGACY_CONVERSATION:"#5b6377"
  };

  function parseTime(n){
    var t = n.created_at || n.occurred_at;
    if(!t) return null;
    var d = new Date(t);
    return isNaN(d.getTime()) ? null : d.getTime();
  }

  function HistoryView(canvas, callbacks){
    var ctx = canvas.getContext("2d");
    var W=0,H=0, dpr = window.devicePixelRatio || 1;
    var includeLegacy = false;
    var laneMode = "kind";
    var viewMin=null, viewMax=null; // time window (ms) currently shown
    var pan=0, zoom=1;
    var points = [];
    var hovered = null;

    function resize(){
      var rect = canvas.getBoundingClientRect();
      W = rect.width; H = rect.height;
      canvas.width = W*dpr; canvas.height = H*dpr;
      ctx.setTransform(dpr,0,0,dpr,0,0);
    }

    function laneKey(n){
      if(laneMode === "kind") return n.kind || (n.current_or_legacy==="LEGACY" ? "LEGACY_MESSAGE" : "OTHER");
      if(laneMode === "domain") return n.domain_name || "(no domain)";
      if(laneMode === "authority") return n.authority_tier;
      return "OTHER";
    }

    function rebuildPoints(){
      var pool = G.nodes.filter(function(n){
        if(!includeLegacy && n.current_or_legacy === "LEGACY") return false;
        return parseTime(n) !== null;
      });
      var times = pool.map(parseTime);
      viewMin = Math.min.apply(null, times);
      viewMax = Math.max.apply(null, times);
      var lanes = {};
      pool.forEach(function(n){ lanes[laneKey(n)] = true; });
      var laneNames = Object.keys(lanes).sort(function(a,b){
        var ia = KIND_ORDER.indexOf(a), ib = KIND_ORDER.indexOf(b);
        if(ia===-1) ia = 99; if(ib===-1) ib = 99;
        return ia-ib || a.localeCompare(b);
      });
      points = pool.map(function(n){
        return { n: n, t: parseTime(n), lane: laneKey(n) };
      });
      return laneNames;
    }

    var laneNames = rebuildPoints();

    function laneCenters(){
      var top=42, bottom=26;
      var usable = H-top-bottom;
      var step = usable/Math.max(1,laneNames.length);
      var map = {};
      laneNames.forEach(function(k,i){ map[k] = top + step*i + step/2; });
      return { map: map, step: step };
    }

    function timeToX(t){
      var span = (viewMax-viewMin) || 1;
      var frac = (t - viewMin)/span;
      var narrow = W < 480;
      var left = narrow ? 54 : 90, right = W-(narrow?16:40);
      return left + frac*(right-left)*zoom - pan;
    }

    function draw(){
      ctx.clearRect(0,0,W,H);
      ctx.fillStyle = "#0a0c12";
      ctx.fillRect(0,0,W,H);
      var lc = laneCenters();

      // lane bands
      laneNames.forEach(function(k,i){
        var y = lc.map[k];
        ctx.fillStyle = i%2===0 ? "rgba(255,255,255,0.015)" : "rgba(255,255,255,0.0)";
        ctx.fillRect(0, y-lc.step/2, W, lc.step);
        ctx.fillStyle = KIND_COLOR[k] || "#8992a8";
        ctx.font = "11px monospace";
        ctx.fillText(String(k).slice(0, W<480?10:26), 6, y+4);
      });

      // points, aggregated per lane into day-buckets when zoomed out and legacy included
      var aggregate = includeLegacy && points.length > 1500 && zoom < 6;
      if(aggregate){
        var buckets = {};
        var dayMs = 86400000;
        points.forEach(function(p){
          var day = Math.floor(p.t/dayMs);
          var key = p.lane+"|"+day;
          buckets[key] = buckets[key] || { lane:p.lane, day:day, count:0, items:[] };
          buckets[key].count++;
          buckets[key].items.push(p.n);
        });
        Object.keys(buckets).forEach(function(k){
          var b = buckets[k];
          var x = timeToX(b.day*dayMs);
          if(x<0||x>W) return;
          var y = lc.map[b.lane];
          var r = Math.max(2, Math.min(16, Math.sqrt(b.count)*1.6));
          ctx.beginPath();
          ctx.fillStyle = (KIND_COLOR[b.lane]||"#8992a8") + "aa";
          ctx.arc(x,y,r,0,7);
          ctx.fill();
          b.__x = x; b.__y = y; b.__r = r;
        });
        draw.__buckets = buckets;
        draw.__mode = "aggregate";
      } else {
        points.forEach(function(p){
          var x = timeToX(p.t);
          if(x<-20||x>W+20) return;
          var y = lc.map[p.lane];
          ctx.beginPath();
          var isCurrent = p.n.current_or_legacy === "CURRENT";
          ctx.fillStyle = (hovered===p) ? "#ffffff" : (KIND_COLOR[p.lane]||"#8992a8");
          ctx.globalAlpha = isCurrent ? 1 : 0.55;
          ctx.arc(x,y, isCurrent?4:2, 0, 7);
          ctx.fill();
          ctx.globalAlpha = 1;
          p.__x = x; p.__y = y;
        });
        draw.__mode = "points";
      }

      // axis labels (a handful of tick dates)
      ctx.fillStyle = "#5b6377";
      ctx.font = "10px monospace";
      var ticks = W<480 ? 3 : 6;
      for(var i=0;i<=ticks;i++){
        var t = viewMin + (viewMax-viewMin)*(i/ticks);
        var x = timeToX(t);
        if(x<0||x>W) continue;
        ctx.fillText(new Date(t).toISOString().slice(0,10), x-28, H-6);
      }
    }

    canvas.addEventListener("mousemove", function(ev){
      var rect = canvas.getBoundingClientRect();
      var mx = ev.clientX-rect.left, my = ev.clientY-rect.top;
      var found = null, best = 999;
      points.forEach(function(p){
        if(p.__x===undefined) return;
        var d = Math.hypot(p.__x-mx, p.__y-my);
        if(d<8 && d<best){ best=d; found=p; }
      });
      hovered = found;
      canvas.title = found ? (found.n.title || found.n.conversation_title || found.n.id) : "";
      draw();
    });
    canvas.addEventListener("click", function(ev){
      var rect = canvas.getBoundingClientRect();
      var mx = ev.clientX-rect.left, my = ev.clientY-rect.top;
      if(draw.__mode === "aggregate" && draw.__buckets){
        var keys = Object.keys(draw.__buckets);
        for(var i=0;i<keys.length;i++){
          var b = draw.__buckets[keys[i]];
          if(b.__x!==undefined && Math.hypot(b.__x-mx,b.__y-my) < b.__r+2){
            callbacks.onBucketSelect && callbacks.onBucketSelect(b);
            return;
          }
        }
      }
      if(hovered){ callbacks.onNodeSelect && callbacks.onNodeSelect(hovered.n); }
    });
    canvas.addEventListener("wheel", function(ev){
      ev.preventDefault();
      zoom = Math.max(1, Math.min(40, zoom * (ev.deltaY<0?1.12:0.89)));
      draw();
    }, { passive:false });
    var dragging=false, dragStartX=0, panStart=0;
    canvas.addEventListener("mousedown", function(ev){ dragging=true; dragStartX=ev.clientX; panStart=pan; });
    window.addEventListener("mouseup", function(){ dragging=false; });
    window.addEventListener("mousemove", function(ev){
      if(!dragging) return;
      pan = panStart - (ev.clientX-dragStartX);
      draw();
    });

    // ---- touch interaction (mobile) -- additive; same pan math as mouse
    // drag above, tap-to-select mirrors the click handler, two-finger
    // pinch drives the same zoom used by the wheel handler. No data or
    // lane/timeline semantics are altered. ----
    var touchHist = null;
    canvas.addEventListener("touchstart", function(ev){
      var rect = canvas.getBoundingClientRect();
      if(ev.touches.length === 1){
        touchHist = { mode:"pan", startX:ev.touches[0].clientX, panStart:pan, moved:false, t0:Date.now(),
          mx: ev.touches[0].clientX-rect.left, my: ev.touches[0].clientY-rect.top };
      } else if(ev.touches.length === 2){
        touchHist = { mode:"pinch", lastDist: Math.hypot(ev.touches[0].clientX-ev.touches[1].clientX, ev.touches[0].clientY-ev.touches[1].clientY) };
      }
      ev.preventDefault();
    }, { passive:false });
    canvas.addEventListener("touchmove", function(ev){
      if(!touchHist) return;
      if(touchHist.mode === "pan" && ev.touches.length === 1){
        var dx = ev.touches[0].clientX - touchHist.startX;
        if(Math.abs(dx) > 6) touchHist.moved = true;
        pan = touchHist.panStart - dx;
        draw();
      } else if(touchHist.mode === "pinch" && ev.touches.length === 2){
        var dist = Math.hypot(ev.touches[0].clientX-ev.touches[1].clientX, ev.touches[0].clientY-ev.touches[1].clientY);
        var ratio = dist/(touchHist.lastDist||dist);
        zoom = Math.max(1, Math.min(40, zoom*ratio));
        touchHist.lastDist = dist;
        draw();
      }
      ev.preventDefault();
    }, { passive:false });
    canvas.addEventListener("touchend", function(ev){
      if(touchHist && touchHist.mode === "pan" && !touchHist.moved && (Date.now()-touchHist.t0) < 400){
        var mx = touchHist.mx, my = touchHist.my;
        if(draw.__mode === "aggregate" && draw.__buckets){
          var keys = Object.keys(draw.__buckets);
          for(var i=0;i<keys.length;i++){
            var b = draw.__buckets[keys[i]];
            if(b.__x!==undefined && Math.hypot(b.__x-mx,b.__y-my) < b.__r+8){
              callbacks.onBucketSelect && callbacks.onBucketSelect(b);
              touchHist = null; return;
            }
          }
        }
        var found = null, best = 999;
        points.forEach(function(p){
          if(p.__x===undefined) return;
          var d = Math.hypot(p.__x-mx, p.__y-my);
          if(d<14 && d<best){ best=d; found=p; }
        });
        if(found){ callbacks.onNodeSelect && callbacks.onNodeSelect(found.n); }
      }
      touchHist = null;
    }, { passive:true });
    canvas.addEventListener("touchcancel", function(){ touchHist = null; }, { passive:true });

    resize();
    draw();

    return {
      resize: function(){ resize(); draw(); },
      setIncludeLegacy: function(v){ includeLegacy=v; laneNames=rebuildPoints(); draw(); },
      setLaneMode: function(m){ laneMode=m; laneNames=rebuildPoints(); draw(); },
      refresh: function(){ laneNames=rebuildPoints(); draw(); }
    };
  }

  window.HexaHistoryView = HistoryView;
})();
