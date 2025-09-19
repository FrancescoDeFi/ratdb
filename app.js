// SHA-256 hash of the chosen access password (update if the password changes)
const ACCESS_PASSWORD_HASH = 'db10d83c7f566143d779929c0f036ad21d021009598a31fb4e98ab2895347082';

async function sha256(message) {
    if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
        throw new Error('Web Crypto API is unavailable');
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function initAccessGate(onGranted) {
    const gateElement = document.getElementById('access-gate');
    const formElement = document.getElementById('access-form');
    const passwordInput = document.getElementById('access-password');
    const errorElement = document.getElementById('access-error');
    const contentElement = document.getElementById('app-content');

    if (!gateElement || !formElement || !passwordInput || !errorElement || !contentElement) {
        onGranted();
        return;
    }

    const unlock = () => {
        sessionStorage.setItem('ratwebapp_access', ACCESS_PASSWORD_HASH);
        gateElement.classList.add('hidden');
        contentElement.classList.remove('hidden');
        onGranted();
    };

    const storedHash = sessionStorage.getItem('ratwebapp_access');
    if (storedHash === ACCESS_PASSWORD_HASH) {
        unlock();
        return;
    }

    formElement.addEventListener('submit', async (event) => {
        event.preventDefault();
        const candidate = passwordInput.value.trim();
        passwordInput.value = '';

        try {
            const digest = await sha256(candidate);
            if (digest === ACCESS_PASSWORD_HASH) {
                errorElement.classList.add('hidden');
                unlock();
            } else {
                errorElement.classList.remove('hidden');
            }
        } catch (err) {
            errorElement.textContent = 'Secure access is unavailable in this browser.';
            errorElement.classList.remove('hidden');
        }
    });
}

class GeneExpressionViewer {
    constructor() {
        this.geneData = [];
        this.geneList = [];
        this.selectedGenes = new Set();
        this.init();
    }

    async init() {
        try {
            this.showLoading(true);
            await this.loadData();
            this.setupEventListeners();
            this.showLoading(false);
        } catch (error) {
            this.showError('Failed to load data: ' + error.message);
            this.showLoading(false);
        }
    }

    async loadData() {
        const [geneDataResponse, geneListResponse] = await Promise.all([
            fetch('Gene_Expression_Summary_by_Condition.tsv'),
            fetch('gene_list_unique.txt')
        ]);

        if (!geneDataResponse.ok || !geneListResponse.ok) {
            throw new Error('Failed to load data files');
        }

        const geneDataText = await geneDataResponse.text();
        const geneListText = await geneListResponse.text();

        this.parseGeneData(geneDataText);
        this.parseGeneList(geneListText);
    }

    parseGeneData(text) {
        const lines = text.trim().split('\n');
        const headers = lines[0].split('\t');

        this.geneData = lines.slice(1).map(line => {
            const values = line.split('\t');
            return {
                GeneName: values[0],
                CellType: values[1],
                Condition: values[2],
                AvgExpressing: parseFloat(values[3]),
                PctExpress: parseFloat(values[4])
            };
        });
    }

    parseGeneList(text) {
        this.geneList = text.trim().split('\n').filter(gene => gene.length > 0);
    }

    setupEventListeners() {
        const geneInput = document.getElementById('gene-input');
        const plotBtn = document.getElementById('plot-btn');
        const clearBtn = document.getElementById('clear-btn');

        geneInput.addEventListener('input', (e) => this.handleAutocomplete(e));
        geneInput.addEventListener('keydown', (e) => this.handleKeydown(e));
        plotBtn.addEventListener('click', () => this.generatePlot());
        clearBtn.addEventListener('click', () => this.clearSelection());

        document.addEventListener('click', (e) => {
            if (!e.target.matches('#gene-input')) {
                this.closeAutocomplete();
            }
        });
    }

    handleAutocomplete(event) {
        const value = event.target.value.toUpperCase();
        this.closeAutocomplete();

        if (!value) return;

        const matches = this.geneList.filter(gene =>
            gene.toUpperCase().startsWith(value)
        ).slice(0, 10);

        if (matches.length === 0) return;

        const autocompleteList = document.getElementById('autocomplete-list');

        matches.forEach((gene, index) => {
            const item = document.createElement('div');
            item.innerHTML = `<strong>${gene.substr(0, value.length)}</strong>${gene.substr(value.length)}`;
            item.addEventListener('click', () => {
                this.addGene(gene);
                event.target.value = '';
                this.closeAutocomplete();
            });
            autocompleteList.appendChild(item);
        });
    }

    handleKeydown(event) {
        const autocompleteList = document.getElementById('autocomplete-list');
        const items = autocompleteList.getElementsByTagName('div');

        if (event.key === 'Enter') {
            event.preventDefault();
            if (this.currentFocus >= 0 && items[this.currentFocus]) {
                items[this.currentFocus].click();
            } else if (event.target.value) {
                const gene = event.target.value.toUpperCase();
                if (this.geneList.includes(gene)) {
                    this.addGene(gene);
                    event.target.value = '';
                    this.closeAutocomplete();
                }
            }
        } else if (event.key === 'ArrowDown') {
            this.currentFocus = (this.currentFocus || -1) + 1;
            this.addActive(items);
        } else if (event.key === 'ArrowUp') {
            this.currentFocus = (this.currentFocus || 0) - 1;
            this.addActive(items);
        }
    }

    addActive(items) {
        if (!items) return false;
        this.removeActive(items);
        if (this.currentFocus >= items.length) this.currentFocus = 0;
        if (this.currentFocus < 0) this.currentFocus = items.length - 1;
        items[this.currentFocus].classList.add('autocomplete-active');
    }

    removeActive(items) {
        for (let item of items) {
            item.classList.remove('autocomplete-active');
        }
    }

    closeAutocomplete() {
        document.getElementById('autocomplete-list').innerHTML = '';
        this.currentFocus = -1;
    }

    addGene(gene) {
        if (this.selectedGenes.has(gene)) return;

        this.selectedGenes.add(gene);
        this.updateSelectedGenesDisplay();
    }

    removeGene(gene) {
        this.selectedGenes.delete(gene);
        this.updateSelectedGenesDisplay();
    }

    updateSelectedGenesDisplay() {
        const container = document.getElementById('selected-genes');
        container.innerHTML = '';

        this.selectedGenes.forEach(gene => {
            const tag = document.createElement('div');
            tag.className = 'gene-tag';
            tag.innerHTML = `
                ${gene}
                <span class="remove">×</span>
            `;
            tag.querySelector('.remove').addEventListener('click', () => this.removeGene(gene));
            container.appendChild(tag);
        });
    }

    clearSelection() {
        this.selectedGenes.clear();
        this.updateSelectedGenesDisplay();
        document.getElementById('plot-area').innerHTML = '';
        document.getElementById('gene-input').value = '';
    }

    generatePlot() {
        if (this.selectedGenes.size === 0) {
            this.showError('Please select at least one gene');
            return;
        }

        const filteredData = this.geneData.filter(d =>
            this.selectedGenes.has(d.GeneName)
        );

        if (filteredData.length === 0) {
            this.showError('No data found for selected genes');
            return;
        }

        this.createDotPlot(filteredData);
    }

    createDotPlot(data) {
        document.getElementById('plot-area').innerHTML = '';

        const margin = {top: 100, right: 50, bottom: 100, left: 150};
        const width = Math.max(800, document.getElementById('plot-area').offsetWidth) - margin.left - margin.right;
        const height = 600 - margin.top - margin.bottom;

        const cellTypes = [...new Set(data.map(d => d.CellType))].sort();
        const conditions = [...new Set(data.map(d => d.Condition))].sort();
        const genes = [...this.selectedGenes];

        const xScale = d3.scaleBand()
            .domain(conditions)
            .range([0, width])
            .padding(0.1);

        const yScale = d3.scaleBand()
            .domain(cellTypes)
            .range([height, 0])
            .padding(0.1);

        const colorScale = d3.scaleSequential()
            .domain([0, d3.max(data, d => d.AvgExpressing)])
            .interpolator(d3.interpolateBlues);

        const sizeScale = d3.scaleSqrt()
            .domain([0, 100])
            .range([0, Math.min(xScale.bandwidth(), yScale.bandwidth()) / 2]);

        const svg = d3.select('#plot-area')
            .append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom);

        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        g.append('g')
            .attr('class', 'grid')
            .attr('transform', `translate(0,${height})`)
            .call(d3.axisBottom(xScale)
                .tickSize(-height)
                .tickFormat(''));

        g.append('g')
            .attr('class', 'grid')
            .call(d3.axisLeft(yScale)
                .tickSize(-width)
                .tickFormat(''));

        const xAxis = g.append('g')
            .attr('transform', `translate(0,${height})`)
            .call(d3.axisBottom(xScale));

        xAxis.selectAll('text')
            .attr('transform', 'rotate(-45)')
            .style('text-anchor', 'end')
            .attr('dx', '-0.8em')
            .attr('dy', '0.15em');

        g.append('g')
            .call(d3.axisLeft(yScale));

        g.append('text')
            .attr('class', 'axis-label')
            .attr('transform', 'rotate(-90)')
            .attr('y', -margin.left + 20)
            .attr('x', -height / 2)
            .style('text-anchor', 'middle')
            .text('Cell Type');

        g.append('text')
            .attr('class', 'axis-label')
            .attr('x', width / 2)
            .attr('y', height + margin.bottom - 10)
            .style('text-anchor', 'middle')
            .text('Condition');

        const tooltip = d3.select('body').append('div')
            .attr('class', 'tooltip')
            .style('opacity', 0);

        if (genes.length > 1) {
            const geneGroups = {};
            data.forEach(d => {
                const key = `${d.CellType}-${d.Condition}`;
                if (!geneGroups[key]) geneGroups[key] = [];
                geneGroups[key].push(d);
            });

            Object.entries(geneGroups).forEach(([key, geneData]) => {
                const [cellType, condition] = key.split('-');
                const avgPct = d3.mean(geneData, d => d.PctExpress);
                const avgExpr = d3.mean(geneData, d => d.AvgExpressing);

                g.append('circle')
                    .attr('class', 'dot')
                    .attr('cx', xScale(condition) + xScale.bandwidth() / 2)
                    .attr('cy', yScale(cellType) + yScale.bandwidth() / 2)
                    .attr('r', sizeScale(avgPct))
                    .style('fill', colorScale(avgExpr))
                    .style('opacity', 0.8)
                    .on('mouseover', function(event) {
                        tooltip.transition().duration(200).style('opacity', .9);
                        tooltip.html(`
                            <strong>Cell Type:</strong> ${cellType}<br>
                            <strong>Condition:</strong> ${condition}<br>
                            <strong>Genes:</strong> ${geneData.map(d => d.GeneName).join(', ')}<br>
                            <strong>Avg % Express:</strong> ${avgPct.toFixed(1)}%<br>
                            <strong>Avg Expression:</strong> ${avgExpr.toFixed(2)}
                        `)
                        .style('left', (event.pageX + 10) + 'px')
                        .style('top', (event.pageY - 28) + 'px');
                    })
                    .on('mouseout', function() {
                        tooltip.transition().duration(500).style('opacity', 0);
                    });
            });
        } else {
            g.selectAll('.dot')
                .data(data)
                .enter().append('circle')
                .attr('class', 'dot')
                .attr('cx', d => xScale(d.Condition) + xScale.bandwidth() / 2)
                .attr('cy', d => yScale(d.CellType) + yScale.bandwidth() / 2)
                .attr('r', d => sizeScale(d.PctExpress))
                .style('fill', d => colorScale(d.AvgExpressing))
                .style('opacity', 0.8)
                .on('mouseover', function(event, d) {
                    tooltip.transition().duration(200).style('opacity', .9);
                    tooltip.html(`
                        <strong>Gene:</strong> ${d.GeneName}<br>
                        <strong>Cell Type:</strong> ${d.CellType}<br>
                        <strong>Condition:</strong> ${d.Condition}<br>
                        <strong>% Express:</strong> ${d.PctExpress.toFixed(1)}%<br>
                        <strong>Avg Expression:</strong> ${d.AvgExpressing.toFixed(2)}
                    `)
                    .style('left', (event.pageX + 10) + 'px')
                    .style('top', (event.pageY - 28) + 'px');
                })
                .on('mouseout', function() {
                    tooltip.transition().duration(500).style('opacity', 0);
                });
        }

        this.createLegends(sizeScale, colorScale);

        svg.append('text')
            .attr('x', width / 2 + margin.left)
            .attr('y', 30)
            .style('text-anchor', 'middle')
            .style('font-size', '18px')
            .style('font-weight', 'bold')
            .text(`Expression: ${[...this.selectedGenes].join(', ')}`);
    }

    createLegends(sizeScale, colorScale) {
        const sizeLegend = d3.select('#size-legend');
        sizeLegend.selectAll('*').remove();

        const sizes = [25, 50, 75, 100];
        sizes.forEach(size => {
            const container = sizeLegend.append('div')
                .style('display', 'flex')
                .style('flex-direction', 'column')
                .style('align-items', 'center');

            container.append('svg')
                .attr('width', sizeScale(100) * 2)
                .attr('height', sizeScale(100) * 2)
                .append('circle')
                .attr('cx', sizeScale(100))
                .attr('cy', sizeScale(100))
                .attr('r', sizeScale(size))
                .style('fill', '#667eea')
                .style('opacity', 0.6);

            container.append('span')
                .style('font-size', '10px')
                .style('margin-top', '2px')
                .text(size + '%');
        });

        const colorLegend = d3.select('#color-legend');
        colorLegend.selectAll('*').remove();

        const gradient = colorLegend.append('svg')
            .attr('width', '100%')
            .attr('height', '20px')
            .append('defs')
            .append('linearGradient')
            .attr('id', 'color-gradient');

        const nStops = 10;
        const colorDomain = colorScale.domain();

        for (let i = 0; i <= nStops; i++) {
            gradient.append('stop')
                .attr('offset', (i / nStops * 100) + '%')
                .attr('stop-color', colorScale(colorDomain[0] + i * (colorDomain[1] - colorDomain[0]) / nStops));
        }

        d3.select('#color-legend svg')
            .append('rect')
            .attr('width', '100%')
            .attr('height', '20px')
            .style('fill', 'url(#color-gradient)');
    }

    showLoading(show) {
        document.getElementById('loading').classList.toggle('hidden', !show);
    }

    showError(message) {
        const errorElement = document.getElementById('error-message');
        errorElement.textContent = message;
        errorElement.classList.remove('hidden');
        setTimeout(() => {
            errorElement.classList.add('hidden');
        }, 5000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initAccessGate(() => {
        new GeneExpressionViewer();
    });
});
