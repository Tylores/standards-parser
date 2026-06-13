import { KnowledgeGraph } from './semanticLinker.js';

export function generateExplorerHtml(kg: KnowledgeGraph): string {
  const serializedData = JSON.stringify({
    nodes: kg.nodes.map(n => ({
      id: n.id,
      label: n.label === "Requirement" ? n.id : (n.properties.title || n.properties.name || n.id),
      group: n.label,
      title: n.properties.text || n.properties.description || n.properties.title || n.properties.name || n.id,
      properties: n.properties
    })),
    edges: kg.edges.map((e, idx) => ({
      id: `edge-${idx}`,
      from: e.source,
      to: e.target,
      label: e.type,
      arrows: "to"
    }))
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Standards Knowledge Graph Explorer</title>
  <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-color: #0f0f11;
      --sidebar-bg: #16161a;
      --card-bg: #202024;
      --border-color: #2c2c35;
      --text-main: #f0f0f5;
      --text-muted: #a0a0b0;
      
      --color-requirement: #ef5350;
      --color-section: #66bb6a;
      --color-term: #29b6f6;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: var(--bg-color);
      color: var(--text-main);
      display: flex;
      height: 100vh;
      overflow: hidden;
    }

    #sidebar {
      width: 340px;
      background-color: var(--sidebar-bg);
      border-right: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      height: 100%;
      box-shadow: 2px 0 10px rgba(0,0,0,0.3);
      z-index: 10;
    }

    .sidebar-header {
      padding: 20px;
      border-bottom: 1px solid var(--border-color);
    }

    .sidebar-header h1 {
      font-size: 1.1rem;
      font-weight: 600;
      letter-spacing: 0.5px;
      color: var(--text-main);
    }

    .sidebar-header p {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 4px;
    }

    .search-container {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border-color);
    }

    .search-box {
      display: flex;
      gap: 8px;
    }

    .search-box input {
      flex: 1;
      background-color: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 8px 12px;
      color: var(--text-main);
      font-size: 0.85rem;
      font-family: inherit;
      outline: none;
      transition: border-color 0.2s;
    }

    .search-box input:focus {
      border-color: #555577;
    }

    .btn {
      background-color: #3b3b4f;
      color: var(--text-main);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 0.85rem;
      cursor: pointer;
      font-weight: 500;
      transition: background-color 0.2s;
    }

    .btn:hover {
      background-color: #4b4b6f;
    }

    .btn-reset {
      background-color: transparent;
      color: var(--text-muted);
    }

    .btn-reset:hover {
      color: var(--text-main);
      background-color: rgba(255,255,255,0.05);
    }

    .details-container {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
    }

    .detail-card {
      background-color: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .detail-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 8px;
    }

    .node-type-badge {
      font-size: 0.7rem;
      text-transform: uppercase;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 12px;
      letter-spacing: 0.5px;
    }

    .badge-requirement { background-color: rgba(239, 83, 80, 0.15); color: var(--color-requirement); }
    .badge-section { background-color: rgba(102, 187, 106, 0.15); color: var(--color-section); }
    .badge-term { background-color: rgba(41, 182, 246, 0.15); color: var(--color-term); }

    .detail-title {
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text-main);
    }

    .detail-desc {
      font-size: 0.85rem;
      line-height: 1.4;
      color: var(--text-muted);
      white-space: pre-wrap;
    }

    .detail-meta-table {
      font-size: 0.75rem;
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }

    .detail-meta-table td {
      padding: 6px 0;
      border-bottom: 1px solid rgba(255,255,255,0.04);
    }

    .detail-meta-table td:first-child {
      color: var(--text-muted);
      width: 35%;
      font-weight: 500;
    }

    .detail-meta-table td:last-child {
      color: var(--text-main);
      text-align: right;
    }

    .placeholder-text {
      text-align: center;
      color: var(--text-muted);
      font-size: 0.8rem;
      margin-top: 40px;
      line-height: 1.5;
    }

    .sidebar-footer {
      padding: 16px 20px;
      border-top: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .legend {
      display: flex;
      justify-content: space-between;
      font-size: 0.7rem;
      color: var(--text-muted);
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .legend-color {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .footer-controls {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    #network-container {
      flex: 1;
      height: 100%;
      position: relative;
    }

    #network {
      width: 100%;
      height: 100%;
      background-color: var(--bg-color);
    }

    .loading-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(15, 15, 17, 0.85);
      display: flex;
      justify-content: center;
      align-items: center;
      font-size: 1rem;
      font-weight: 500;
      color: var(--text-muted);
      z-index: 100;
      pointer-events: none;
      transition: opacity 0.5s;
    }

    .loading-overlay.hidden {
      opacity: 0;
    }

    /* Breadcrumbs Navigation */
    .breadcrumbs {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      font-size: 0.75rem;
      margin-bottom: 12px;
      background: rgba(255, 255, 255, 0.03);
      padding: 6px 10px;
      border-radius: 4px;
      border: 1px solid var(--border-color);
    }
    
    .breadcrumb-item {
      color: var(--text-muted);
      cursor: pointer;
      transition: color 0.2s;
    }
    
    .breadcrumb-item:hover {
      color: var(--text-main);
      text-decoration: underline;
    }
    
    .breadcrumb-item.active {
      color: #66bb6a;
      font-weight: 500;
      cursor: default;
    }
    
    .breadcrumb-item.active:hover {
      text-decoration: none;
    }
    
    .breadcrumb-separator {
      color: var(--text-muted);
      opacity: 0.5;
    }

    /* Hierarchy Context Panels */
    .hierarchy-section {
      margin-top: 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    
    .hierarchy-title {
      font-size: 0.8rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 4px;
      margin-bottom: 4px;
    }
    
    .hierarchy-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    
    .group-header {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-muted);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .group-items {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    
    .group-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 8px;
      background-color: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      cursor: pointer;
      transition: background-color 0.2s, border-color 0.2s, transform 0.1s;
      font-size: 0.75rem;
    }
    
    .group-item:hover {
      background-color: rgba(255, 255, 255, 0.06);
      border-color: #555577;
      transform: translateX(2px);
    }
    
    .item-icon-badge {
      font-size: 0.6rem;
      font-weight: 700;
      padding: 1px 4px;
      border-radius: 3px;
      text-transform: uppercase;
      flex-shrink: 0;
      margin-top: 1px;
    }
    
    .badge-req-sm { background-color: rgba(239, 83, 80, 0.15); color: var(--color-requirement); }
    .badge-sec-sm { background-color: rgba(102, 187, 106, 0.15); color: var(--color-section); }
    .badge-term-sm { background-color: rgba(41, 182, 246, 0.15); color: var(--color-term); }
    
    .item-label {
      flex: 1;
      color: var(--text-main);
      line-height: 1.3;
      word-break: break-word;
    }

    .item-rel-type {
      font-size: 0.65rem;
      font-weight: 600;
      margin-right: 6px;
      text-transform: uppercase;
    }

    .item-rel-type.depends { color: #ef5350; }
    .item-rel-type.implements { color: #66bb6a; }
    .item-rel-type.conflicts { color: #ef5350; font-weight: 700; animation: blinker 1.5s linear infinite; }
    
    @keyframes blinker {
      50% { opacity: 0.5; }
    }

    /* Search Results Hierarchy */
    .search-results-header {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-main);
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .search-results-tree {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 6px;
    }
    
    .tree-node {
      margin-left: 10px;
      border-left: 1px dashed var(--border-color);
      padding-left: 8px;
    }
    
    .tree-node.root-node {
      margin-left: 0;
      border-left: none;
      padding-left: 0;
    }
    
    .tree-item {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      padding: 6px 8px;
      border-radius: 4px;
      cursor: pointer;
      transition: background-color 0.2s;
      font-size: 0.75rem;
      margin-bottom: 2px;
    }
    
    .tree-item:hover {
      background-color: rgba(255, 255, 255, 0.05);
    }
    
    .tree-item.matched {
      background-color: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    
    .tree-item.matched:hover {
      background-color: rgba(255, 255, 255, 0.06);
    }
    
    .tree-item-text {
      color: var(--text-main);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }
    
    .tree-item.matched .tree-item-text {
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div id="sidebar">
    <div class="sidebar-header">
      <h1>Standards Knowledge Graph</h1>
      <p>Interactive Compliance Explorer</p>
    </div>
    
    <div class="search-container">
      <div class="search-box">
        <input type="text" id="search-input" placeholder="Search ID, term, section or text..." onkeydown="if(event.key === 'Enter') performSearch()">
        <button class="btn" onclick="performSearch()">Find</button>
        <button class="btn btn-reset" onclick="resetHighlight()">Clear</button>
      </div>
    </div>
    
    <div class="details-container">
      <div id="details-panel">
        <div class="placeholder-text">
          Click any node in the graph<br>to explore its metadata and connections.
        </div>
      </div>
    </div>
    
    <div class="sidebar-footer">
      <div class="legend">
        <div class="legend-item">
          <span class="legend-color" style="background-color: var(--color-requirement)"></span>
          <span>Requirement</span>
        </div>
        <div class="legend-item">
          <span class="legend-color" style="background-color: var(--color-section)"></span>
          <span>Section</span>
        </div>
        <div class="legend-item">
          <span class="legend-color" style="background-color: var(--color-term)"></span>
          <span>Term</span>
        </div>
      </div>
      <div class="footer-controls">
        <button id="toggle-physics-btn" class="btn btn-reset" style="font-size: 0.75rem; padding: 4px 8px;" onclick="togglePhysics()">Pause Physics</button>
        <button class="btn btn-reset" style="font-size: 0.75rem; padding: 4px 8px;" onclick="stabilizeGraph()">Stabilize</button>
      </div>
    </div>
  </div>
  
  <div id="network-container">
    <div id="loading-overlay" class="loading-overlay">Stabilizing graph layout...</div>
    <div id="network"></div>
  </div>

  <script>
    const graphData = ${serializedData};

    const nodeColors = {
      Requirement: {
        background: '#ef5350', border: '#d32f2f',
        highlight: { background: '#ef5350', border: '#b71c1c' },
        hover: { background: '#f44336', border: '#d32f2f' }
      },
      Section: {
        background: '#66bb6a', border: '#388e3c',
        highlight: { background: '#66bb6a', border: '#1b5e20' },
        hover: { background: '#81c784', border: '#388e3c' }
      },
      Term: {
        background: '#29b6f6', border: '#0288d1',
        highlight: { background: '#29b6f6', border: '#01579b' },
        hover: { background: '#4fc3f7', border: '#0288d1' }
      }
    };

    // --- INDEXING & RELATIONSHIPS FOR HIERARCHY & NAV ---
    const nodesMap = {};
    const adjList = {};
    const parentSectionMap = {};

    graphData.nodes.forEach(n => {
      nodesMap[n.id] = n;
      adjList[n.id] = [];
    });

    graphData.edges.forEach((e, idx) => {
      const edgeId = \`edge-\${idx}\`;
      if (adjList[e.from]) {
        adjList[e.from].push({ edgeId, neighborId: e.to, type: e.label, direction: 'out' });
      }
      if (adjList[e.to]) {
        adjList[e.to].push({ edgeId, neighborId: e.from, type: e.label, direction: 'in' });
      }
      
      // Map parent-child section relationships
      if (e.label === 'CONTAINS') {
        if (e.from.startsWith('SEC-') && e.to.startsWith('SEC-')) {
          parentSectionMap[e.to] = e.from;
        }
      }
    });

    // Helper to traverse and get the full path of section ancestors for any node
    function getSectionPath(nodeId) {
      const path = [];
      let current = nodeId;
      if (current.startsWith('REQ-')) {
        const edge = graphData.edges.find(e => e.label === 'CONTAINS' && e.to === current && e.from.startsWith('SEC-'));
        if (edge) {
          current = edge.from;
        } else {
          return [];
        }
      }
      while (current && current.startsWith('SEC-')) {
        path.unshift(current);
        current = parentSectionMap[current];
      }
      return path;
    }

    const nodesDataSet = new vis.DataSet(graphData.nodes.map(n => ({
      ...n,
      color: nodeColors[n.group] || { background: '#9e9e9e', border: '#616161' },
      size: n.group === 'Requirement' ? 14 : n.group === 'Section' ? 18 : 12
    })));

    const edgesDataSet = new vis.DataSet(graphData.edges);

    const container = document.getElementById('network');
    const data = { nodes: nodesDataSet, edges: edgesDataSet };
    
    const options = {
      physics: {
        forceAtlas2Based: {
          gravitationalConstant: -60,
          centralGravity: 0.012,
          springLength: 110,
          springStrength: 0.07,
          damping: 0.4
        },
        solver: 'forceAtlas2Based',
        stabilization: {
          enabled: true,
          iterations: 150,
          updateInterval: 25
        }
      },
      edges: {
        arrows: { to: { enabled: true, scaleFactor: 0.4 } },
        color: { color: '#3c3c45', highlight: '#7e7e8d', hover: '#545462' },
        font: { color: '#8e8e9d', size: 9, strokeWidth: 0, align: 'middle' },
        smooth: false // Performance optimization: disable smooth curves (draw straight lines)
      },
      nodes: {
        shape: 'dot',
        font: { color: '#f0f0f5', size: 11, face: 'Inter, sans-serif' },
        borderWidth: 2,
        shadow: false // Performance optimization: disable expensive dynamic shadows
      },
      interaction: {
        hover: true,
        tooltipDelay: 200,
        selectable: true,
        hideEdgesOnDrag: true, // Performance optimization: hide edges while panning/dragging
        hideEdgesOnZoom: true  // Performance optimization: hide edges while zooming
      }
    };

    const network = new vis.Network(container, data, options);

    // --- STATE TRACKING FOR DELTA STYLE UPDATES ---
    const nodeStates = {}; // nodeId -> 'default' | 'highlighted' | 'neighbor' | 'dimmed'
    const edgeStates = {}; // edgeId -> 'default' | 'highlighted' | 'dimmed'

    function getColorForGroup(group, opacity) {
      const colors = {
        Requirement: \`rgba(239, 83, 80, \${opacity})\`,
        Section: \`rgba(102, 187, 106, \${opacity})\`,
        Term: \`rgba(41, 182, 246, \${opacity})\`
      };
      return {
        background: colors[group] || \`rgba(158, 158, 158, \${opacity})\`,
        border: colors[group] || \`rgba(97, 97, 97, \${opacity})\`
      };
    }

    function updateNodeStyles(targetStates) {
      const updates = [];
      graphData.nodes.forEach(n => {
        const targetState = targetStates[n.id] || 'default';
        const currentState = nodeStates[n.id] || 'default';
        if (targetState !== currentState) {
          let opacity = 1.0;
          let size = n.group === 'Requirement' ? 14 : n.group === 'Section' ? 18 : 12;
          
          if (targetState === 'highlighted') {
            opacity = 1.0;
            size = n.group === 'Requirement' ? 18 : n.group === 'Section' ? 24 : 16;
          } else if (targetState === 'neighbor') {
            opacity = 0.85;
            size = n.group === 'Requirement' ? 14 : n.group === 'Section' ? 18 : 12;
          } else if (targetState === 'dimmed') {
            opacity = 0.15;
            size = n.group === 'Requirement' ? 12 : n.group === 'Section' ? 16 : 10;
          }
          
          updates.push({
            id: n.id,
            color: targetState === 'default' 
              ? (nodeColors[n.group] || { background: '#9e9e9e', border: '#616161' })
              : getColorForGroup(n.group, opacity),
            size: size
          });
          nodeStates[n.id] = targetState;
        }
      });
      if (updates.length > 0) {
        nodesDataSet.update(updates);
      }
    }

    function updateEdgeStyles(targetStates) {
      const updates = [];
      graphData.edges.forEach((e, idx) => {
        const edgeId = \`edge-\${idx}\`;
        const targetState = targetStates[edgeId] || 'default';
        const currentState = edgeStates[edgeId] || 'default';
        if (targetState !== currentState) {
          let color = '#3c3c45';
          let width = 1;
          if (targetState === 'highlighted') {
            color = '#88889a';
            width = 2;
          } else if (targetState === 'dimmed') {
            color = '#1b1b22';
            width = 1;
          }
          updates.push({
            id: edgeId,
            color: { color: color },
            width: width
          });
          edgeStates[edgeId] = targetState;
        }
      });
      if (updates.length > 0) {
        edgesDataSet.update(updates);
      }
    }

    let physicsEnabled = true;

    function updatePhysicsButton() {
      const btn = document.getElementById("toggle-physics-btn");
      if (btn) {
        btn.innerText = physicsEnabled ? "Pause Physics" : "Resume Physics";
      }
    }

    network.on("stabilizationIterationsDone", function () {
      document.getElementById('loading-overlay').classList.add('hidden');
      // Performance optimization: auto-pause physics once initial layout is stable
      physicsEnabled = false;
      network.setOptions({ physics: { enabled: false } });
      updatePhysicsButton();
    });

    setTimeout(() => {
      document.getElementById('loading-overlay').classList.add('hidden');
    }, 4000);

    network.on("click", function(params) {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        highlightNode(nodeId);
        showDetails(nodeId);
      } else {
        resetHighlight();
      }
    });

    function highlightNode(nodeId) {
      const connectedNodes = network.getConnectedNodes(nodeId);
      const connectedEdges = network.getConnectedEdges(nodeId);
      
      const targetNodeStates = {};
      const targetEdgeStates = {};
      
      graphData.nodes.forEach(n => {
        if (n.id === nodeId) {
          targetNodeStates[n.id] = 'highlighted';
        } else if (connectedNodes.includes(n.id)) {
          targetNodeStates[n.id] = 'neighbor';
        } else {
          targetNodeStates[n.id] = 'dimmed';
        }
      });
      
      graphData.edges.forEach((e, idx) => {
        const edgeId = \`edge-\${idx}\`;
        if (connectedEdges.includes(edgeId)) {
          targetEdgeStates[edgeId] = 'highlighted';
        } else {
          targetEdgeStates[edgeId] = 'dimmed';
        }
      });
      
      updateNodeStyles(targetNodeStates);
      updateEdgeStyles(targetEdgeStates);
    }

    function resetHighlight() {
      const targetNodeStates = {};
      const targetEdgeStates = {};
      
      graphData.nodes.forEach(n => {
        targetNodeStates[n.id] = 'default';
      });
      graphData.edges.forEach((e, idx) => {
        targetEdgeStates[\`edge-\${idx}\`] = 'default';
      });
      
      updateNodeStyles(targetNodeStates);
      updateEdgeStyles(targetEdgeStates);
      
      document.getElementById('details-panel').innerHTML = \`
        <div class="placeholder-text">
          Click any node in the graph<br>to explore its metadata and connections.
        </div>
      \`;
      document.getElementById('search-input').value = "";
    }

    // --- DETAIL & HIERARCHY RENDERING ---
    function showDetails(nodeId) {
      const node = graphData.nodes.find(n => n.id === nodeId);
      if (!node) return;

      const props = node.properties;
      let html = \`
        <div class="detail-card">
          <div class="detail-header">
            <span class="detail-title">\${node.id}</span>
            <span class="node-type-badge badge-\${node.group.toLowerCase()}">\${node.group}</span>
          </div>
      \`;

      if (node.group === 'Requirement') {
        html += \`
          <div class="detail-desc">"\${props.text}"</div>
          <table class="detail-meta-table">
            <tr><td>Constraint</td><td>\${props.constraint_type}</td></tr>
            <tr><td>Section</td><td><a href="#" style="color:#66bb6a;text-decoration:none;font-weight:600;" onclick="focusNode('SEC-\${props.section_number}')">\${props.section_number}</a></td></tr>
            <tr><td>Page</td><td>\${props.page_number}</td></tr>
          </table>
        \`;
      } else if (node.group === 'Section') {
        html += \`
          <div class="detail-desc" style="font-weight:600;">\${props.title}</div>
          <table class="detail-meta-table">
            <tr><td>Section No.</td><td>\${props.section_number}</td></tr>
          </table>
        \`;
      } else if (node.group === 'Term') {
        html += \`
          <div class="detail-desc" style="font-style:italic;">Keyword concept extracted from the standard.</div>
          <table class="detail-meta-table">
            <tr><td>Concept Name</td><td>\${props.name}</td></tr>
            <tr><td>Frequency</td><td>\${props.frequency} mentions</td></tr>
          </table>
        \`;
      }

      html += \`</div>\`; // Close detail-card
      
      // Append hierarchy section below
      html += \`<div class="hierarchy-section">\`;
      html += \`<div class="hierarchy-title">Hierarchy & Connections</div>\`;
      
      if (node.group === 'Requirement') {
        // Render section breadcrumbs
        const path = getSectionPath(nodeId);
        if (path.length > 0) {
          html += \`<div class="breadcrumbs">\`;
          path.forEach((pId, index) => {
            const pNode = nodesMap[pId];
            const pLabel = pNode ? pNode.properties.section_number : pId;
            const isLast = index === path.length - 1;
            if (isLast) {
              html += \`<span class="breadcrumb-item active">\${pLabel}</span>\`;
            } else {
              html += \`<span class="breadcrumb-item" onclick="focusNode('\${pId}')">\${pLabel}</span>\`;
              html += \`<span class="breadcrumb-separator">/</span>\`;
            }
          });
          html += \`</div>\`;
        }
        
        // Find links
        const connections = adjList[nodeId] || [];
        const relationships = {
          dependsOn: [],
          implements: [],
          references: [],
          conflicts: [],
          requiredBy: [],
          implementedBy: [],
          referencedBy: [],
          terms: []
        };
        
        connections.forEach(conn => {
          const neighbor = nodesMap[conn.neighborId];
          if (!neighbor) return;
          
          if (conn.direction === 'out') {
            if (neighbor.group === 'Term') {
              relationships.terms.push(neighbor);
            } else if (neighbor.group === 'Requirement') {
              if (conn.type === 'DEPENDS_ON') relationships.dependsOn.push(neighbor);
              else if (conn.type === 'IMPLEMENTS') relationships.implements.push(neighbor);
              else if (conn.type === 'CONFLICTS_WITH') relationships.conflicts.push(neighbor);
              else relationships.references.push(neighbor);
            } else if (neighbor.group === 'Section') {
              if (conn.type === 'IMPLEMENTS') relationships.implements.push(neighbor);
              else if (conn.type === 'DEPENDS_ON') relationships.dependsOn.push(neighbor);
              else relationships.references.push(neighbor);
            }
          } else { // direction === 'in'
            if (neighbor.group === 'Requirement') {
              if (conn.type === 'DEPENDS_ON') relationships.requiredBy.push(neighbor);
              else if (conn.type === 'IMPLEMENTS') relationships.implementedBy.push(neighbor);
              else if (conn.type === 'CONFLICTS_WITH') relationships.conflicts.push(neighbor);
              else relationships.referencedBy.push(neighbor);
            }
          }
        });
        
        // Render conflicts
        if (relationships.conflicts.length > 0) {
          html += \`
            <div class="hierarchy-group">
              <div class="group-header" style="color: #ef5350;">⚠️ Conflicts With</div>
              <div class="group-items">
          \`;
          relationships.conflicts.forEach(c => {
            const text = c.properties.text || c.id;
            html += \`
              <div class="group-item" style="border-color: rgba(239, 83, 80, 0.4); background-color: rgba(239, 83, 80, 0.05);" onclick="focusNode('\${c.id}')">
                <span class="item-icon-badge badge-req-sm">REQ</span>
                <span class="item-label"><span class="item-rel-type conflicts">Conflicts</span><strong>\${c.id}</strong>: \${text}</span>
              </div>
            \`;
          });
          html += \`</div></div>\`;
        }
        
        // Render upstream dependencies/implementations
        if (relationships.dependsOn.length > 0 || relationships.implements.length > 0) {
          html += \`
            <div class="hierarchy-group">
              <div class="group-header">Upstream (Requires/Implements)</div>
              <div class="group-items">
          \`;
          relationships.dependsOn.forEach(d => {
            const label = d.group === 'Requirement' ? (d.properties.text || d.id) : (d.properties.title || d.id);
            const badge = d.group === 'Requirement' ? 'badge-req-sm' : 'badge-sec-sm';
            html += \`
              <div class="group-item" onclick="focusNode('\${d.id}')">
                <span class="item-icon-badge \${badge}">\${d.group.substring(0, 3)}</span>
                <span class="item-label"><span class="item-rel-type depends">Depends On</span><strong>\${d.id}</strong>: \${label}</span>
              </div>
            \`;
          });
          relationships.implements.forEach(imp => {
            const label = imp.group === 'Requirement' ? (imp.properties.text || imp.id) : (imp.properties.title || imp.id);
            const badge = imp.group === 'Requirement' ? 'badge-req-sm' : 'badge-sec-sm';
            html += \`
              <div class="group-item" onclick="focusNode('\${imp.id}')">
                <span class="item-icon-badge \${badge}">\${imp.group.substring(0, 3)}</span>
                <span class="item-label"><span class="item-rel-type implements">Implements</span><strong>\${imp.id}</strong>: \${label}</span>
              </div>
            \`;
          });
          html += \`</div></div>\`;
        }
        
        // Render downstream dependencies/implementations
        if (relationships.requiredBy.length > 0 || relationships.implementedBy.length > 0) {
          html += \`
            <div class="hierarchy-group">
              <div class="group-header">Downstream (Required/Implemented By)</div>
              <div class="group-items">
          \`;
          relationships.requiredBy.forEach(r => {
            const text = r.properties.text || r.id;
            html += \`
              <div class="group-item" onclick="focusNode('\${r.id}')">
                <span class="item-icon-badge badge-req-sm">REQ</span>
                <span class="item-label"><span class="item-rel-type depends">Required By</span><strong>\${r.id}</strong>: \${text}</span>
              </div>
            \`;
          });
          relationships.implementedBy.forEach(imp => {
            const text = imp.properties.text || imp.id;
            html += \`
              <div class="group-item" onclick="focusNode('\${imp.id}')">
                <span class="item-icon-badge badge-req-sm">REQ</span>
                <span class="item-label"><span class="item-rel-type implements">Implemented By</span><strong>\${imp.id}</strong>: \${text}</span>
              </div>
            \`;
          });
          html += \`</div></div>\`;
        }
        
        // Render references
        if (relationships.references.length > 0 || relationships.referencedBy.length > 0) {
          html += \`
            <div class="hierarchy-group">
              <div class="group-header">References & Mentions</div>
              <div class="group-items">
          \`;
          relationships.references.forEach(r => {
            const label = r.group === 'Requirement' ? (r.properties.text || r.id) : (r.properties.title || r.id);
            const badge = r.group === 'Requirement' ? 'badge-req-sm' : 'badge-sec-sm';
            html += \`
              <div class="group-item" onclick="focusNode('\${r.id}')">
                <span class="item-icon-badge \${badge}">\${r.group.substring(0, 3)}</span>
                <span class="item-label"><span class="item-rel-type">References</span><strong>\${r.id}</strong>: \${label}</span>
              </div>
            \`;
          });
          relationships.referencedBy.forEach(r => {
            const label = r.group === 'Requirement' ? (r.properties.text || r.id) : (r.properties.title || r.id);
            const badge = r.group === 'Requirement' ? 'badge-req-sm' : 'badge-sec-sm';
            html += \`
              <div class="group-item" onclick="focusNode('\${r.id}')">
                <span class="item-icon-badge \${badge}">\${r.group.substring(0, 3)}</span>
                <span class="item-label"><span class="item-rel-type">Referenced By</span><strong>\${r.id}</strong>: \${label}</span>
              </div>
            \`;
          });
          html += \`</div></div>\`;
        }
        
        // Render terms
        if (relationships.terms.length > 0) {
          html += \`
            <div class="hierarchy-group">
              <div class="group-header">Keywords / Concept Terms</div>
              <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;">
          \`;
          relationships.terms.forEach(t => {
            html += \`
              <span class="item-icon-badge badge-term-sm" style="cursor: pointer; padding: 4px 8px; font-size: 0.7rem;" onclick="focusNode('\${t.id}')">
                \${t.properties.name}
              </span>
            \`;
          });
          html += \`</div></div>\`;
        }
      } else if (node.group === 'Section') {
        const path = getSectionPath(nodeId);
        if (path.length > 1) {
          html += \`<div class="breadcrumbs">\`;
          path.forEach((pId, index) => {
            const pNode = nodesMap[pId];
            const pLabel = pNode ? pNode.properties.section_number : pId;
            const isLast = index === path.length - 1;
            if (isLast) {
              html += \`<span class="breadcrumb-item active">\${pLabel}</span>\`;
            } else {
              html += \`<span class="breadcrumb-item" onclick="focusNode('\${pId}')">\${pLabel}</span>\`;
              html += \`<span class="breadcrumb-separator">/</span>\`;
            }
          });
          html += \`</div>\`;
        }
        
        // Find child sections (subsections)
        const childSections = [];
        graphData.nodes.forEach(n => {
          if (n.group === 'Section' && parentSectionMap[n.id] === nodeId) {
            childSections.push(n);
          }
        });
        childSections.sort((a, b) => (a.properties.section_number || "").localeCompare(b.properties.section_number || "", undefined, { numeric: true, sensitivity: 'base' }));
        
        // Find contained requirements
        const containedReqs = [];
        const connections = adjList[nodeId] || [];
        connections.forEach(conn => {
          if (conn.direction === 'out' && conn.type === 'CONTAINS') {
            const neighbor = nodesMap[conn.neighborId];
            if (neighbor && neighbor.group === 'Requirement') {
              containedReqs.push(neighbor);
            }
          }
        });
        containedReqs.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
        
        // Render subsections
        if (childSections.length > 0) {
          html += \`
            <div class="hierarchy-group">
              <div class="group-header">Subsections (\${childSections.length})</div>
              <div class="group-items">
          \`;
          childSections.forEach(s => {
            const title = s.properties.title || \`Section \${s.properties.section_number}\`;
            html += \`
              <div class="group-item" onclick="focusNode('\${s.id}')">
                <span class="item-icon-badge badge-sec-sm">SEC</span>
                <span class="item-label"><strong>\${s.properties.section_number}</strong>: \${title}</span>
              </div>
            \`;
          });
          html += \`</div></div>\`;
        }
        
        // Render requirements
        if (containedReqs.length > 0) {
          html += \`
            <div class="hierarchy-group">
              <div class="group-header">Contained Requirements (\${containedReqs.length})</div>
              <div class="group-items">
          \`;
          containedReqs.forEach(r => {
            const text = r.properties.text || "";
            html += \`
              <div class="group-item" onclick="focusNode('\${r.id}')">
                <span class="item-icon-badge badge-req-sm">REQ</span>
                <span class="item-label"><strong>\${r.id}</strong>: \${text}</span>
              </div>
            \`;
          });
          html += \`</div></div>\`;
        }
        
        if (childSections.length === 0 && containedReqs.length === 0) {
          html += \`<div class="placeholder-text" style="margin-top: 10px;">No subsections or requirements.</div>\`;
        }
      } else if (node.group === 'Term') {
        const referencingReqs = [];
        const connections = adjList[nodeId] || [];
        connections.forEach(conn => {
          if (conn.direction === 'in') {
            const neighbor = nodesMap[conn.neighborId];
            if (neighbor && neighbor.group === 'Requirement') {
              referencingReqs.push(neighbor);
            }
          }
        });
        referencingReqs.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
        
        if (referencingReqs.length > 0) {
          const sectionToReqs = {};
          referencingReqs.forEach(r => {
            const secEdge = graphData.edges.find(e => e.label === 'CONTAINS' && e.to === r.id && e.from.startsWith('SEC-'));
            const secId = secEdge ? secEdge.from : 'unknown';
            if (!sectionToReqs[secId]) {
              sectionToReqs[secId] = [];
            }
            sectionToReqs[secId].push(r);
          });
          
          html += \`
            <div class="hierarchy-group">
              <div class="group-header">References by Document Location</div>
              <div class="group-items">
          \`;
          
          Object.keys(sectionToReqs).forEach(secId => {
            const secNode = nodesMap[secId];
            const secTitle = secNode ? (secNode.properties.title || \`Section \${secNode.properties.section_number}\`) : "Uncategorized Requirements";
            const secNum = secNode ? secNode.properties.section_number : "";
            
            html += \`
              <div style="margin-bottom: 8px;">
                <div class="group-item" style="background-color: rgba(255,255,255,0.04); font-weight: 600;" onclick="focusNode('\${secId}')">
                  <span class="item-icon-badge badge-sec-sm">SEC</span>
                  <span class="item-label">\${secNum ? \`<strong>\${secNum}</strong>: \` : ''}\${secTitle} (\${sectionToReqs[secId].length} refs)</span>
                </div>
                <div style="padding-left: 12px; margin-top: 4px; display: flex; flex-direction: column; gap: 4px;">
            \`;
            
            sectionToReqs[secId].forEach(r => {
              const text = r.properties.text || "";
              html += \`
                <div class="group-item" onclick="focusNode('\${r.id}')">
                  <span class="item-icon-badge badge-req-sm">REQ</span>
                  <span class="item-label"><strong>\${r.id}</strong>: \${text}</span>
                </div>
              \`;
            });
            
            html += \`</div></div>\`;
          });
          
          html += \`</div></div>\`;
        } else {
          html += \`<div class="placeholder-text" style="margin-top: 10px;">This term is not referenced by any requirements.</div>\`;
        }
      }
      
      html += \`</div>\`; // Close hierarchy-section
      document.getElementById('details-panel').innerHTML = html;
    }

    function focusNode(nodeId) {
      if (!nodesDataSet.get(nodeId)) return;
      
      network.selectNodes([nodeId]);
      highlightNode(nodeId);
      showDetails(nodeId);
      network.focus(nodeId, {
        scale: 1.1,
        animation: {
          duration: 800,
          easingFunction: "easeInOutQuad"
        }
      });
    }

    // --- SEARCH HIERARCHY TREE BUILDER & RENDERER ---
    function buildSearchResultsTree(matchedNodeIds) {
      const matchedSections = [];
      const matchedRequirements = [];
      const matchedTerms = [];
      
      matchedNodeIds.forEach(id => {
        const node = nodesMap[id];
        if (!node) return;
        if (node.group === 'Section') matchedSections.push(node);
        else if (node.group === 'Requirement') matchedRequirements.push(node);
        else if (node.group === 'Term') matchedTerms.push(node);
      });
      
      const relevantSectionsSet = new Set();
      
      matchedSections.forEach(s => {
        relevantSectionsSet.add(s.id);
        const path = getSectionPath(s.id);
        path.forEach(pId => relevantSectionsSet.add(pId));
      });
      
      matchedRequirements.forEach(r => {
        const path = getSectionPath(r.id);
        path.forEach(pId => relevantSectionsSet.add(pId));
      });
      
      const sortedRelevantSections = Array.from(relevantSectionsSet).map(id => nodesMap[id]).sort((a, b) => {
        const aNum = a.properties.section_number || "";
        const bNum = b.properties.section_number || "";
        return aNum.localeCompare(bNum, undefined, { numeric: true, sensitivity: 'base' });
      });
      
      const tree = {};
      const roots = [];
      
      sortedRelevantSections.forEach(s => {
        tree[s.id] = {
          node: s,
          children: [],
          requirements: [],
          isMatched: matchedNodeIds.includes(s.id)
        };
      });
      
      sortedRelevantSections.forEach(s => {
        const parentId = parentSectionMap[s.id];
        if (parentId && tree[parentId]) {
          tree[parentId].children.push(tree[s.id]);
        } else {
          roots.push(tree[s.id]);
        }
      });
      
      matchedRequirements.forEach(r => {
        const secEdge = graphData.edges.find(e => e.label === 'CONTAINS' && e.to === r.id && e.from.startsWith('SEC-'));
        if (secEdge && tree[secEdge.from]) {
          tree[secEdge.from].requirements.push({
            node: r,
            isMatched: true
          });
        }
      });
      
      return { roots, matchedTerms };
    }

    function renderTreeHTML(treeNode, depth) {
      const isMatched = treeNode.isMatched;
      const node = treeNode.node;
      const id = node.id;
      const title = node.properties.title || \`Section \${node.properties.section_number}\`;
      const secNum = node.properties.section_number;
      
      let html = \`<div class="tree-node \${depth === 0 ? 'root-node' : ''}">\`;
      
      if (isMatched) {
        html += \`
          <div class="tree-item matched" onclick="focusNode('\${id}')">
            <span class="item-icon-badge badge-sec-sm">SEC</span>
            <span class="tree-item-text" title="\${secNum} \${title}"><strong>\${secNum}</strong> \${title}</span>
          </div>
        \`;
      } else {
        html += \`
          <div class="tree-item" onclick="focusNode('\${id}')">
            <span class="item-icon-badge badge-sec-sm">SEC</span>
            <span class="tree-item-text" title="\${secNum} \${title}"><strong>\${secNum}</strong> \${title}</span>
          </div>
        \`;
      }
      
      if (treeNode.children.length > 0 || treeNode.requirements.length > 0) {
        html += \`<div style="padding-left: 8px;">\`;
        treeNode.children.forEach(child => {
          html += renderTreeHTML(child, depth + 1);
        });
        
        treeNode.requirements.forEach(reqObj => {
          const req = reqObj.node;
          const reqId = req.id;
          const reqText = req.properties.text || "";
          html += \`
            <div class="tree-item matched" onclick="focusNode('\${reqId}')">
              <span class="item-icon-badge badge-req-sm">REQ</span>
              <span class="tree-item-text" title="\${reqId}: \${reqText}"><strong>\${reqId}</strong>: \${reqText}</span>
            </div>
          \`;
        });
        html += \`</div>\`;
      }
      
      html += \`</div>\`;
      return html;
    }

    function displaySearchResults(matchedIds, query) {
      const { roots, matchedTerms } = buildSearchResultsTree(matchedIds);
      
      let html = \`
        <div class="detail-card" style="gap: 8px;">
          <div class="search-results-header">
            <span>Search Results</span>
            <span class="node-type-badge" style="background-color: rgba(255,255,255,0.1); color: var(--text-muted); font-size: 0.65rem;">\${matchedIds.length} found</span>
          </div>
          <div class="detail-desc" style="font-size: 0.75rem; margin-bottom: 8px;">
            Matches for "\${query}" structured by document hierarchy:
          </div>
          <div class="search-results-tree">
      \`;
      
      if (roots.length === 0 && matchedTerms.length === 0) {
        html += \`<div class="placeholder-text" style="margin-top: 10px;">No matches found.</div>\`;
      } else {
        roots.forEach(root => {
          html += renderTreeHTML(root, 0);
        });
        
        if (matchedTerms.length > 0) {
          html += \`
            <div class="hierarchy-group" style="margin-top: 14px;">
              <div class="group-header">Matched Concept Terms (\${matchedTerms.length})</div>
              <div class="group-items">
          \`;
          matchedTerms.forEach(t => {
            html += \`
              <div class="group-item" onclick="focusNode('\${t.id}')">
                <span class="item-icon-badge badge-term-sm">TERM</span>
                <span class="item-label"><strong>\${t.properties.name}</strong> (\${t.properties.frequency} mentions)</span>
              </div>
            \`;
          });
          html += \`
              </div>
            </div>
          \`;
        }
      }
      
      html += \`
          </div>
        </div>
      \`;
      document.getElementById('details-panel').innerHTML = html;
    }

    function performSearch() {
      const query = document.getElementById("search-input").value.toLowerCase().trim();
      if (!query) {
        resetHighlight();
        return;
      }

      const matchedNodeIds = [];
      graphData.nodes.forEach(n => {
        const name = (n.properties.name || "").toLowerCase();
        const title = (n.properties.title || "").toLowerCase();
        const text = (n.properties.text || "").toLowerCase();
        const id = n.id.toLowerCase();
        const section = (n.properties.section_number || "").toLowerCase();
        
        if (name.includes(query) || title.includes(query) || text.includes(query) || id.includes(query) || section.includes(query)) {
          matchedNodeIds.push(n.id);
        }
      });

      if (matchedNodeIds.length === 0) {
        alert("No matching nodes found.");
        return;
      }

      const connectedNodeIds = new Set(matchedNodeIds);
      const connectedEdgeIds = new Set();

      matchedNodeIds.forEach(id => {
        const conn = network.getConnectedNodes(id);
        conn.forEach(c => connectedNodeIds.add(c));
        
        const edges = network.getConnectedEdges(id);
        edges.forEach(e => connectedEdgeIds.add(e));
      });

      const targetNodeStates = {};
      const targetEdgeStates = {};

      graphData.nodes.forEach(n => {
        if (matchedNodeIds.includes(n.id)) {
          targetNodeStates[n.id] = 'highlighted';
        } else if (connectedNodeIds.has(n.id)) {
          targetNodeStates[n.id] = 'neighbor';
        } else {
          targetNodeStates[n.id] = 'dimmed';
        }
      });

      graphData.edges.forEach((e, idx) => {
        const edgeId = \`edge-\${idx}\`;
        if (connectedEdgeIds.has(edgeId)) {
          targetEdgeStates[edgeId] = 'highlighted';
        } else {
          targetEdgeStates[edgeId] = 'dimmed';
        }
      });

      updateNodeStyles(targetNodeStates);
      updateEdgeStyles(targetEdgeStates);

      network.focus(matchedNodeIds[0], {
        scale: 1.0,
        animation: {
          duration: 1000,
          easingFunction: "easeInOutQuad"
        }
      });
      
      displaySearchResults(matchedNodeIds, query);
    }

    function togglePhysics() {
      physicsEnabled = !physicsEnabled;
      network.setOptions({ physics: { enabled: physicsEnabled } });
      updatePhysicsButton();
    }

    function stabilizeGraph() {
      document.getElementById('loading-overlay').classList.remove('hidden');
      network.stabilize();
    }
  </script>
</body>
</html>
`;
}
