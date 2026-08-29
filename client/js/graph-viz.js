'use strict';

// D3.js force-directed vizualizace vztahu mezi indexovanymi strankami.

// Uzly = stranky (velikost dle word_count,, barva dle domeny).
// Po kliknuti se stranka otevre v novem tabu; drag & drop + zoom jsou aktivni.


const GRAPH_COLORS = [
  '#d1495b', '#0072b5', '#2e8540', '#c05621', '#5f6b7a',
  '#8e44ad', '#16a085', '#d4a017', '#7f8c8d', '#34495e',
];

function graphDomainColor(domain, map) {
  if (!map.has(domain)) map.set(domain, GRAPH_COLORS[map.size % GRAPH_COLORS.length]);
  return map.get(domain);
}


/**
 * Inicializuje graf do elementu #graph-viz.ang
 * Data rozume: { nodes: [{id|url, title, wordCount, domain}], links: [{source, target, weight}] }.
 */
async function initGraphViz() {
  const container = document.getElementById('graph-viz');
  if (!container) return;
  let g;
  try {
    g = await fetch('/api/graph').then(r => r.json());
  } catch (e) {
    container.innerHTML = '<p class="hint">Graf se nepodarilo nacist: ' + String(e.message || e) + '</p>';
    return;
  }

  const nodes = (g.nodes || []).map(n => ({ ...n, id: n.url }));
  const links = (g.links || []).map(l => ({ source: l.source || l.source_url, target: l.target || l.target_url, weight: l.weight || 1 }));


  if (!nodes.length) {
    container.innerHTML = '<p class="hint">Zatim zadne uzly — pridej nejaky web pres dashboard.</p>';
    return;
  }


  container.innerHTML = '';

  // Sirka a vyska se ridi velikosti kontejneru (predvolene hodnoty pro pripad skryteho panelu).
  const width = container.clientWidth ||   800;
  const height = container.clientHeight ||  600;

  const svg = d3.select(container).append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', [0, 0, width, height])


    .style('display', 'block')
    .style('background', '#fafafa');

  // Zoom & pan
  const zoom = d3.zoom()
    .scaleExtent([0.2, 4])
    .on('zoom', (ev) => {
      gEl.attr('transform', ev.transform);
    });
  svg.call(zoom);

  const gEl = svg.append('g');

  // Tooltip
  const tip = d3.select(container).append('div')
    .attr('class', 'graph-tip')
    .style('position', 'absolute')
    .style('display', 'none')
    .style('background', 'rgba(30,30,30,0.9)')
    .style('color', '#fff')
    .style('padding', '6px 10px')
    .style('border-radius', '6px')
    .style('font-size', '12px')
    .style('pointer-events', 'none')
    .style('z-index', '10')
    .style('max-width', '280px')
    .style('word-break', 'break-word');

  const colorMap = new Map();

  // Simulace
  const sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(100))
    .force('charge', d3.forceManyBody().strength(-300))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collide', d3.forceCollide(24));

  const strokeColor = '#999';

  const link = gEl.append('g').attr('class', 'links').selectAll('line')
    .data(links).join('line')
    .attr('stroke', strokeColor)
    .attr('stroke-opacity', 0.45)
    .attr('stroke-width', d => Math.max(1, Math.min(4, (d.weight || 1) * 1.5)));

  const node = gEl.append('g').attr('class', 'nodes').selectAll('g')
    .data(nodes).join('g')
    .call(d3.drag()
      .on('start', (ev, d) => {
        if (!ev.active) sim.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (ev, d) => {
        d.fx = ev.x;
        d.fy = ev.y;
      })
      .on('end', (ev, d) => {
        if (!ev.active) sim.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      }));

  node.append('circle')
    .attr('r', d => Math.max(7, Math.min(28, Math.sqrt(d.wordCount ||  500) * 0.1)))
    .attr('fill', d => graphDomainColor(d.domain || 'unknown', colorMap))
    .attr('stroke', '#fff')
    .attr('stroke-width',  1.5)
    .style('cursor', 'pointer');

  node.append('title').text(d => (d.title || d.url));

  const label = node.append('text')
    .attr('dx',  10)
    .attr('dy',  4)
    .attr('class', 'graph-label')
    .text(d => (d.domain || '').split('.')[0])
    .style('font-size', '11px')
    .style('fill', '#333')
    .style('user-select', 'none');

  // Interakce: hover + kliknuti
  node.on('mouseover', (ev, d) => {
    tip.style('display', 'block')
      .html('<strong>' + String(d.title || d.id).replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</strong><br>' + String(d.id).replace(/</g, '&lt;').replace(/>/g, '&gt;'));
    container.style.position = 'relative';
  })
  .on('mousemove', (ev) => {
    const r = container.getBoundingClientRect();
    tip.style('left', (ev.clientX - r.left +  12) + 'px')
      .style('top', (ev.clientY - r.top +  12) + 'px');
  })
  .on('mouseleave', () => tip.style('display', 'none'))
  .on('click', (ev, d) => window.open(d.id, '_blank', 'noopener'));

  sim.on('tick', () => {
    link.attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);
    node.attr('transform', d => 'translate(' + d.x + ',' + d.y + ')');
  });

  // Ovládaci prvky
  const resetBtn = document.getElementById('graph-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity);
      sim.alpha(0.6).restart();
    });
  }

  const labelsCheck = document.getElementById('graph-labels');
  if (labelsCheck) {
    labelsCheck.addEventListener('change', (e) => {
      label.style('display', e.target.checked ? null : 'none');
    });
  }
}

// Automaticky spustit po nacteni DOMu (pokud je grafova sekce pritomna).
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('graph-viz')) initGraphViz();
});

// Vystav pro app.js (kde se graf nacita s ostatnimi daty)
window.initGraphViz = initGraphViz;
