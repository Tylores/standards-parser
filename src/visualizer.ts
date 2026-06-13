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
        <button class="btn btn-reset" style="font-size: 0.75rem; padding: 4px 8px;" onclick="togglePhysics()">Pause Physics</button>
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
        smooth: { type: 'continuous' }
      },
      nodes: {
        shape: 'dot',
        font: { color: '#f0f0f5', size: 11, face: 'Inter, sans-serif' },
        borderWidth: 2,
        shadow: { enabled: true, color: 'rgba(0,0,0,0.5)', size: 4, x: 1, y: 1 }
      },
      interaction: {
        hover: true,
        tooltipDelay: 200,
        selectable: true
      }
    };

    const network = new vis.Network(container, data, options);

    network.on("stabilizationIterationsDone", function () {
      document.getElementById('loading-overlay').classList.add('hidden');
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

    function highlightNode(nodeId) {
      const connectedNodes = network.getConnectedNodes(nodeId);
      const connectedEdges = network.getConnectedEdges(nodeId);
      
      const updateNodes = [];
      graphData.nodes.forEach(n => {
        let opacity = 0.15;
        let size = n.group === 'Requirement' ? 12 : n.group === 'Section' ? 16 : 10;
        
        if (n.id === nodeId) {
          opacity = 1.0;
          size = n.group === 'Requirement' ? 18 : n.group === 'Section' ? 24 : 16;
        } else if (connectedNodes.includes(n.id)) {
          opacity = 0.85;
          size = n.group === 'Requirement' ? 14 : n.group === 'Section' ? 18 : 12;
        }
        
        updateNodes.push({
          id: n.id,
          color: getColorForGroup(n.group, opacity),
          size: size
        });
      });
      nodesDataSet.update(updateNodes);

      const updateEdges = [];
      graphData.edges.forEach((e, idx) => {
        const edgeId = \`edge-\${idx}\`;
        let color = '#202025';
        let width = 1;
        if (connectedEdges.includes(edgeId)) {
          color = '#88889a';
          width = 2;
        }
        updateEdges.push({
          id: edgeId,
          color: { color: color },
          width: width
        });
      });
      edgesDataSet.update(updateEdges);
    }

    function resetHighlight() {
      const updateNodes = [];
      graphData.nodes.forEach(n => {
        updateNodes.push({
          id: n.id,
          color: nodeColors[n.group] || { background: '#9e9e9e', border: '#616161' },
          size: n.group === 'Requirement' ? 14 : n.group === 'Section' ? 18 : 12
        });
      });
      nodesDataSet.update(updateNodes);

      const updateEdges = [];
      graphData.edges.forEach((e, idx) => {
        updateEdges.push({
          id: \`edge-\${idx}\`,
          color: { color: '#3c3c45' },
          width: 1
        });
      });
      edgesDataSet.update(updateEdges);
      
      document.getElementById('details-panel').innerHTML = \`
        <div class="placeholder-text">
          Click any node in the graph<br>to explore its metadata and connections.
        </div>
      \`;
      document.getElementById('search-input').value = "";
    }

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
            <tr><td>Section</td><td><a href="#" style="color:#50fa7b;text-decoration:none;" onclick="focusNode('SEC-\${props.section_number}')">\${props.section_number}</a></td></tr>
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

      html += \`</div>\`;
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

      const updateNodes = [];
      graphData.nodes.forEach(n => {
        let opacity = 0.15;
        let size = n.group === 'Requirement' ? 12 : n.group === 'Section' ? 16 : 10;
        
        if (matchedNodeIds.includes(n.id)) {
          opacity = 1.0;
          size = n.group === 'Requirement' ? 18 : n.group === 'Section' ? 24 : 16;
        } else if (connectedNodeIds.has(n.id)) {
          opacity = 0.8;
          size = n.group === 'Requirement' ? 14 : n.group === 'Section' ? 18 : 12;
        }
        updateNodes.push({
          id: n.id,
          color: getColorForGroup(n.group, opacity),
          size: size
        });
      });
      nodesDataSet.update(updateNodes);

      const updateEdges = [];
      graphData.edges.forEach((e, idx) => {
        const edgeId = \`edge-\${idx}\`;
        let color = '#202025';
        let width = 1;
        if (connectedEdgeIds.has(edgeId)) {
          color = '#88889a';
          width = 2;
        }
        updateEdges.push({
          id: edgeId,
          color: { color: color },
          width: width
        });
      });
      edgesDataSet.update(updateEdges);

      network.focus(matchedNodeIds[0], {
        scale: 1.0,
        animation: {
          duration: 1000,
          easingFunction: "easeInOutQuad"
        }
      });
      showDetails(matchedNodeIds[0]);
    }

    let physicsEnabled = true;
    function togglePhysics() {
      physicsEnabled = !physicsEnabled;
      network.setOptions({ physics: { enabled: physicsEnabled } });
      
      const btn = document.querySelector(".sidebar-footer button");
      btn.innerText = physicsEnabled ? "Pause Physics" : "Resume Physics";
    }

    function stabilizeGraph() {
      document.getElementById('loading-overlay').classList.remove('hidden');
      network.stabilize();
    }
  </script>
</body>
</html>`;
}
