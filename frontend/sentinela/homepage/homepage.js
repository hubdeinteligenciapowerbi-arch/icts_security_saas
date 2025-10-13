document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURAÇÃO ---
    const IS_LOCAL = window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1');
    const API_BASE_URL = IS_LOCAL ? "http://127.0.0.1:8080/api" : "/api";
    const SAO_PAULO_VIEW = { center: [-22.19, -48.79], zoom: 7 };

    // --- VARIÁVEIS ---
    let map, bubbleLayer, heatLayer, userLocationMarker = null;
    let currentView = 'bubbles';
    let lastGeoJsonData = null;

    // --- DOM ---
    const spinnerOverlay = document.getElementById('spinner-overlay');
    const geralSearchInput = document.getElementById('geral-search-input');
    const voiceSearchButton = document.getElementById('voice-search-button');
    const selectPeriodo = document.getElementById('periodo');
    const selectRegiao = document.getElementById('regiao');
    const selectMunicipio = document.getElementById('municipio');
    const selectBairro = document.getElementById('bairro');
    const selectCriminalidade = document.getElementById('criminalidade');
    const btnBuscar = document.getElementById('search-button');
    const btnLimpar = document.getElementById('btn-limpar');
    const btnLocalizacao = document.getElementById('btn-localizacao');
    const btnInsights = document.getElementById('btn-insights');
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const dadosSegurancaDiv = document.getElementById('dados-seguranca');
    const infoMessage = document.getElementById('info-message');
    const insightsMessage = document.getElementById('insights-message');
    const insightsContent = insightsMessage.querySelector('.insights-content');
    const closeInsightsBtn = insightsMessage.querySelector('.close-btn');
    const viewToggleBtn = document.getElementById('view-toggle-btn');
    const viewIcon = document.getElementById('view-icon');
    const viewText = document.getElementById('view-text');
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const mainMenu = document.getElementById('main-menu');

    // --- UI ---
    const showInfo = (msg, type = 'info') => {
        infoMessage.className = `alert alert-${type} text-center`;
        infoMessage.textContent = msg;
        infoMessage.classList.remove('d-none');
        setTimeout(() => infoMessage.classList.add('d-none'), 5000);
    };

    const showSpinner = () => spinnerOverlay.classList.remove('d-none');
    const hideSpinner = () => spinnerOverlay.classList.add('d-none');

    const toggleDarkMode = () => {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        darkModeToggle.textContent = isDark ? '☀️' : '🌙';
        localStorage.setItem('darkMode', isDark ? 'enabled' : 'disabled');
    };

    // --- MAPA ---
    const inicializarMapa = () => {
        map = L.map('map').setView(SAO_PAULO_VIEW.center, SAO_PAULO_VIEW.zoom);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map);
        bubbleLayer = L.layerGroup().addTo(map);
        heatLayer = L.heatLayer([], { radius: 20, blur: 15, maxZoom: 12 });
    };

    const renderDataOnMap = (geojson, isFiltered) => {
        lastGeoJsonData = geojson;
        bubbleLayer.clearLayers();
        heatLayer.setLatLngs([]);

        if (!geojson?.features?.length) {
            dadosSegurancaDiv.innerHTML = '<p class="text-muted text-center">Nenhum dado encontrado.</p>';
            if (!isFiltered) {
                map.setView(SAO_PAULO_VIEW.center, SAO_PAULO_VIEW.zoom);
            }
            return;
        }

        const validPoints = geojson.features
            .map(f => {
                const [lng, lat] = f.geometry.coordinates;
                return (lat && lng) ? { lat, lng, delito: f.properties.delito } : null;
            })
            .filter(Boolean);

        if (!validPoints.length) return;

        if (currentView === 'bubbles') {
            if (!map.hasLayer(bubbleLayer)) map.addLayer(bubbleLayer);
            if (map.hasLayer(heatLayer)) map.removeLayer(heatLayer);

            validPoints.forEach(p => {
                L.circle([p.lat, p.lng], { color: '#E60000', fillColor: '#f03', fillOpacity: 0.6, radius: 60 })
                    .bindTooltip(`<b>Ocorrência:</b><br>${(p.delito || 'N/A').replace(/_/g, ' ').toUpperCase()}`)
                    .on('click', e => map.setView(e.latlng, 16))
                    .addTo(bubbleLayer);
            });
        } else {
            if (!map.hasLayer(heatLayer)) map.addLayer(heatLayer);
            if (map.hasLayer(bubbleLayer)) map.removeLayer(bubbleLayer);
            heatLayer.setLatLngs(validPoints.map(p => [p.lat, p.lng, 1.0]));
        }

        if (isFiltered) {
            const bounds = L.latLngBounds(validPoints.map(p => [p.lat, p.lng]));
            if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
        }
    };

    // --- API ---
    const fetchAndPopulate = async (endpoint, select, placeholder, transformFn = i => ({ value: i.nome.toLowerCase(), text: i.nome })) => {
        select.disabled = true;
        select.innerHTML = `<option>A carregar...</option>`;
        try {
            const res = await fetch(`${API_BASE_URL}${endpoint}`);
            if (!res.ok) throw new Error('Falha na resposta da rede');
            const { data } = await res.json();
            select.innerHTML = `<option value="">-- ${placeholder} --</option>`;
            if (data?.length) {
                data.forEach(i => {
                    const t = transformFn(i);
                    const opt = document.createElement('option');
                    opt.value = t.value;
                    opt.textContent = t.text;
                    select.appendChild(opt);
                });
                select.disabled = false;
            } else {
                select.innerHTML = `<option>Nenhum dado</option>`;
            }
        } catch (err) {
            showInfo(`Erro ao carregar ${placeholder}`, 'danger');
            select.innerHTML = `<option>Erro</option>`;
        }
    };

    const buscarOcorrencias = async () => {
        showSpinner();
        
        // CORREÇÃO: Lê o valor da caixa de busca principal
        const termoBusca = geralSearchInput.value;

        const params = new URLSearchParams({
            periodo: selectPeriodo.value || 'last_quarter',
            ...(selectRegiao.value && { regiao: selectRegiao.value }),
            ...(selectMunicipio.value && { municipio: selectMunicipio.value }),
            ...(selectBairro.value && { bairro: selectBairro.value }),
            ...(selectCriminalidade.value && { delito: selectCriminalidade.value }),
            // CORREÇÃO: Adiciona o termo de busca aos parâmetros se ele existir
            ...(termoBusca && { termo_busca: termoBusca })
        });
        
        const isFilteredSearch = termoBusca || selectRegiao.value || selectMunicipio.value || selectBairro.value || selectCriminalidade.value;

        try {
            const res = await fetch(`${API_BASE_URL}/ocorrencias?${params}`);
            if (!res.ok) throw new Error('Falha ao buscar ocorrências');
            const data = await res.json();
            renderDataOnMap(data.geojson, isFilteredSearch);
        } catch (err) {
            showInfo(`Erro: ${err.message}`, 'danger');
        } finally {
            hideSpinner();
        }
    };

    // --- INSIGHTS ---
    const popularInsightsPanel = (data) => {
        if (!data || data.quantidade_total === undefined) {
            insightsContent.innerHTML = `<div class="alert alert-warning">Não foi possível carregar os insights.</div>`;
            return;
        }
        if (data.quantidade_total === 0) {
            insightsContent.innerHTML = `
                <div class="insights-header"><h5>Ocorrências: 0</h5></div>
                <div class="insights-footer">
                    <p><b>Análise:</b> ${data.analise_curta}</p>
                    <p><b>Recomendação:</b> ${data.recomendacao_curta}</p>
                </div>`;
            return;
        }
        const sortedCrimes = [...data.detalhamento_ocorrencias].sort((a, b) => b.quantidade - a.quantidade);
        const top10Crimes = sortedCrimes.slice(0, 10);
        const otherCrimes = sortedCrimes.slice(10);
        const createListItemHTML = crime => `
            <li class="crime-item">
                <span class="crime-name">${crime.tipo}</span>
                <span class="crime-quantity">${crime.quantidade.toLocaleString('pt-BR')}</span>
            </li>`;
        const top10Html = top10Crimes.map(createListItemHTML).join('');
        const otherHtml = otherCrimes.map(createListItemHTML).join('');
        insightsContent.innerHTML = `
            <div class="insights-header">
                <h5>Ocorrências: ${data.quantidade_total.toLocaleString('pt-BR')}</h5>
            </div>
            <div class="insights-body">
                <h6 class="top-crimes-title">Principais Ocorrências (Top 10)</h6>
                <ul class="crime-list">${top10Html}</ul>
                ${otherCrimes.length > 0 ? `<button id="toggle-more-crimes">Ver Mais (${otherCrimes.length})</button>` : ''}
                <div class="more-crimes-container" id="more-crimes-container">
                    <ul class="crime-list">${otherHtml}</ul>
                </div>
            </div>
            <div class="insights-footer">
                <p><b>Análise:</b> ${data.analise_curta}</p>
                <p><b>Recomendação:</b> ${data.recomendacao_curta}</p>
            </div>
        `;
        if (otherCrimes.length > 0) {
            const toggleButton = document.getElementById('toggle-more-crimes');
            const moreContainer = document.getElementById('more-crimes-container');
            toggleButton.addEventListener('click', () => {
                moreContainer.classList.toggle('visible');
                const isVisible = moreContainer.classList.contains('visible');
                toggleButton.textContent = isVisible ? 'Ver Menos' : `Ver Mais (${otherCrimes.length})`;
            });
        }
    };

    const buscarInsights = async () => {
        insightsContent.innerHTML = '<div class="text-center p-3">Aguarde, gerando análise...</div>';
        insightsMessage.classList.remove('d-none');
        showSpinner();
        btnInsights.disabled = true;
        try {
            const res = await fetch(`${API_BASE_URL}/insights`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    periodo: selectPeriodo.value,
                    regiao: selectRegiao.value,
                    municipio: selectMunicipio.value,
                    bairro: selectBairro.value,
                    delito: selectCriminalidade.value
                })
            });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.detail || 'Erro na comunicação com o servidor.');
            }
            const data = await res.json();
            popularInsightsPanel(data);
        } catch (err) {
            insightsContent.innerHTML = `<div class="alert alert-danger">Erro ao gerar análise: ${err.message}</div>`;
        } finally {
            hideSpinner();
            btnInsights.disabled = false;
        }
    };

    // --- MENU HAMBÚRGUER ---
    const toggleMenu = () => {
        const mapControls = document.getElementById("map-view-controls");
        const isMobile = window.innerWidth <= 992;
        mainMenu.classList.toggle("open");
        hamburgerBtn.classList.toggle("active");
        if (isMobile) {
            mapControls.style.display = mainMenu.classList.contains("open") ? "none" : "block";
        }
    };

    // --- EVENTOS ---
    const initEventListeners = () => {
        // CORREÇÃO: Lógica de filtros em cascata refeita para resetar corretamente
        selectRegiao.addEventListener('change', () => {
            const regiao = selectRegiao.value;
            selectMunicipio.innerHTML = '<option value="">-- Carregando... --</option>';
            selectMunicipio.disabled = true;
            selectBairro.innerHTML = '<option value="">-- Selecione um Município --</option>';
            selectBairro.disabled = true;
            if (regiao) {
                fetchAndPopulate(`/municipios?regiao=${regiao}`, selectMunicipio, 'Municípios');
            } else {
                fetchAndPopulate(`/municipios`, selectMunicipio, 'Municípios');
            }
        });

        // CORREÇÃO: Lógica de filtros em cascata refeita para resetar corretamente
        selectMunicipio.addEventListener('change', () => {
            const municipio = selectMunicipio.value;
            selectBairro.innerHTML = '<option value="">-- Carregando... --</option>';
            selectBairro.disabled = true;
            if (municipio) {
                fetchAndPopulate(`/bairros?municipio=${municipio}`, selectBairro, 'Bairros');
            } else {
                fetchAndPopulate(`/bairros`, selectBairro, 'Bairros');
            }
        });

        geralSearchInput.addEventListener('keyup', e => { if (e.key === 'Enter') btnBuscar.click(); });
        btnBuscar.addEventListener('click', buscarOcorrencias);

        // CORREÇÃO: Lógica do botão Limpar refeita para resetar a visão do mapa
        btnLimpar.addEventListener('click', () => {
            geralSearchInput.value = '';
            selectPeriodo.value = 'last_quarter';
            selectRegiao.value = '';
            selectMunicipio.value = '';
            selectBairro.value = '';
            selectCriminalidade.value = '';
            
            // Reseta a visão do mapa para a configuração inicial
            map.setView(SAO_PAULO_VIEW.center, SAO_PAULO_VIEW.zoom);

            // Busca os dados iniciais (sem filtros)
            buscarOcorrencias();
        });

        btnInsights.addEventListener('click', buscarInsights);
        closeInsightsBtn.addEventListener('click', () => insightsMessage.classList.add('d-none'));

        viewToggleBtn.addEventListener('click', () => {
            currentView = currentView === 'bubbles' ? 'heatmap' : 'bubbles';
            viewIcon.className = currentView === 'bubbles' ? 'fas fa-fire' : 'fas fa-circle';
            viewText.textContent = currentView === 'bubbles' ? 'Mapa de Calor' : 'Ocorrências';
            renderDataOnMap(lastGeoJsonData, true);
        });

        darkModeToggle.addEventListener('click', toggleDarkMode);

        btnLocalizacao.addEventListener('click', () => {
            if (!navigator.geolocation) {
                showInfo('Geolocalização não é suportada pelo seu navegador.', 'warning');
                return;
            }
            navigator.geolocation.getCurrentPosition(p => {
                const { latitude, longitude } = p.coords;
                if (userLocationMarker) map.removeLayer(userLocationMarker);
                map.setView([latitude, longitude], 15);
                userLocationMarker = L.marker([latitude, longitude]).addTo(map).bindPopup("Você está aqui!").openPopup();
            }, () => {
                showInfo('Não foi possível obter sua localização.', 'danger');
            });
        });

        hamburgerBtn.addEventListener('click', toggleMenu);
    };

    // --- INICIALIZAÇÃO ---
    const initApp = async () => {
        showSpinner();
        await Promise.all([
            fetchAndPopulate('/regioes', selectRegiao, 'Delegacias'),
            fetchAndPopulate('/municipios', selectMunicipio, 'Municípios'),
            fetchAndPopulate('/bairros', selectBairro, 'Bairros'),
            fetchAndPopulate('/delitos', selectCriminalidade, 'Crimes')
        ]);
        await buscarOcorrencias();
        hideSpinner();
    };

    if (localStorage.getItem('darkMode') === 'enabled') {
        document.body.classList.add('dark-mode');
        darkModeToggle.textContent = '☀️';
    }

    inicializarMapa();
    initEventListeners();
    initApp();
});