/* HEXA_VISUAL_BRAIN_v2 :: graph-model.js
   NormalizedGraphModel -> in-memory indices. Pure data layer: no rendering,
   no mutation of authority/evidence fields, no vector regeneration.
   Consumes window.HEXA_NODES / HEXA_EDGES / HEXA_SUMMARY / HEXA_CURATED_BRIDGES
   which are produced once by build/build_model.py and never edited by hand. */
(function(){
  "use strict";

  var nodes = window.HEXA_NODES || [];
  var edges = window.HEXA_EDGES || [];
  var summary = window.HEXA_SUMMARY || {};
  var curatedBridges = window.HEXA_CURATED_BRIDGES || [];
  var archaeology = window.HEXA_ARCHAEOLOGY || {};
  var reasoningSample = window.HEXA_REASONING_SAMPLE || null;
  var reasoningSzeretett = window.HEXA_REASONING_SZERETETT || null;
  var reasoningRecskHatarertek = window.HEXA_REASONING_RECSK_HATARERTEK_LIVE_01 || null;

  var byId = Object.create(null);
  nodes.forEach(function(n){ byId[n.id] = n; });

  var adjacency = Object.create(null); // id -> [{other, edge}]
  nodes.forEach(function(n){ adjacency[n.id] = []; });
  edges.forEach(function(e){
    if(!adjacency[e.source] || !adjacency[e.target]) return; // guard against dangling refs
    adjacency[e.source].push({ other: e.target, edge: e });
    adjacency[e.target].push({ other: e.source, edge: e });
  });

  function neighbors(id){ return adjacency[id] || []; }

  /* ---------- structural path (BFS, unweighted, undirected) ----------
     Deliberately named STRUCTURAL, never CAUSAL: an edge here means
     "graph-adjacent", not "caused" or "led to". */
  function structuralPath(fromId, toId, maxNodes){
    maxNodes = maxNodes || 20000;
    if(fromId === toId) return [fromId];
    if(!byId[fromId] || !byId[toId]) return null;
    var visited = Object.create(null);
    visited[fromId] = null;
    var queue = [fromId];
    var seen = 0;
    while(queue.length){
      var cur = queue.shift();
      seen++;
      if(seen > maxNodes) return null;
      var adj = neighbors(cur);
      for(var i=0;i<adj.length;i++){
        var nb = adj[i].other;
        if(visited[nb] === undefined){
          visited[nb] = cur;
          if(nb === toId){
            var path = [nb];
            var walk = cur;
            while(walk !== null){ path.push(walk); walk = visited[walk]; }
            path.reverse();
            return path;
          }
          queue.push(nb);
        }
      }
    }
    return null; // provably no path within the examined component
  }

  /* ---------- vector neighborhood (cosine similarity over 36D) ----------
     Read-only: never mutates vector_36d. Restricted to nodes with
     has_vector true (4,839 of them). A brute-force pass over ~4.8k x 36
     floats is well within interactive budget client-side. */
  function cosine(a, b){
    var dot=0, na=0, nb=0;
    for(var i=0;i<a.length;i++){ dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
    if(na===0||nb===0) return 0;
    return dot / (Math.sqrt(na)*Math.sqrt(nb));
  }
  var vectorNodes = null;
  function getVectorNodes(){
    if(vectorNodes) return vectorNodes;
    vectorNodes = nodes.filter(function(n){ return n.has_vector && n.vector_36d; });
    return vectorNodes;
  }
  function nearestNeighbors(nodeId, k){
    k = k || 12;
    var target = byId[nodeId];
    if(!target || !target.has_vector) return [];
    var pool = getVectorNodes();
    var scored = [];
    for(var i=0;i<pool.length;i++){
      var cand = pool[i];
      if(cand.id === nodeId) continue;
      scored.push({ node: cand, score: cosine(target.vector_36d, cand.vector_36d) });
    }
    scored.sort(function(a,b){ return b.score - a.score; });
    return scored.slice(0, k);
  }

  /* ---------- search ---------- */
  function search(query, opts){
    opts = opts || {};
    var q = (query||"").trim().toLowerCase();
    if(!q) return [];
    var out = [];
    for(var i=0;i<nodes.length;i++){
      var n = nodes[i];
      if(opts.authorityTier && n.authority_tier !== opts.authorityTier) continue;
      if(opts.domain && n.domain_name !== opts.domain) continue;
      var hay = [
        n.id, n.title, n.snippet, n.subject, n.conversation_title,
        n.conversation_id, n.message_node_id, n.domain_name, n.status, n.kind
      ].filter(Boolean).join(" ␟ ").toLowerCase();
      if(hay.indexOf(q) !== -1){
        out.push(n);
        if(out.length >= 300) break;
      }
    }
    return out;
  }

  /* ---------- domain / lifecycle facets ---------- */
  function distinctValues(field){
    var set = Object.create(null);
    nodes.forEach(function(n){ if(n[field]) set[n[field]] = true; });
    return Object.keys(set).sort();
  }

  window.HexaGraph = {
    nodes: nodes,
    edges: edges,
    summary: summary,
    curatedBridges: curatedBridges,
    archaeology: archaeology,
    reasoningSample: reasoningSample,
    reasoningSzeretett: reasoningSzeretett,
    reasoningRecskHatarertek: reasoningRecskHatarertek,
    byId: byId,
    neighbors: neighbors,
    structuralPath: structuralPath,
    nearestNeighbors: nearestNeighbors,
    cosine: cosine,
    search: search,
    distinctValues: distinctValues
  };
})();
