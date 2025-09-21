document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURAÇÃO ---
    const IS_LOCAL = window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1');
    const API_BASE_URL = IS_LOCAL ? "http://127.0.0.1:8000/api" : "/api";
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

    // Botão hambúrguer e menu
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
            if (!isFiltered) map.setView(SAO_PAULO_VIEW.center, SAO_PAULO_VIEW.zoom);
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
        } catch {
            showInfo(`Erro ao carregar ${placeholder}`, 'danger');
            select.innerHTML = `<option>Erro</option>`;
        }
    };

    const buscarOcorrencias = async () => {
        showSpinner();
        const params = new URLSearchParams({
            periodo: selectPeriodo.value || 'last_quarter',
            ...(selectRegiao.value && { regiao: selectRegiao.value }),
            ...(selectMunicipio.value && { municipio: selectMunicipio.value }),
            ...(selectBairro.value && { bairro: selectBairro.value }),
            ...(selectCriminalidade.value && { delito: selectCriminalidade.value })
        });
        try {
            const res = await fetch(`${API_BASE_URL}/ocorrencias?${params}`);
            const data = await res.json();
            renderDataOnMap(data.geojson, params.size > 1);
        } catch (err) {
            showInfo(`Erro: ${err.message}`, 'danger');
        } finally {
            hideSpinner();
        }
    };

    // --- INSIGHTS ---
    const buscarInsights = async () => {
        insightsContent.innerHTML = '<p>Aguarde...</p>';
        insightsMessage.classList.remove('d-none');
        showSpinner();
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
            const data = await res.json();
            insightsContent.innerHTML = `
                <h5>Ocorrências: ${data.quantidade_total}</h5>
                <ul>${data.detalhamento_ocorrencias.map(i => `<li>${i.tipo} - ${i.quantidade}</li>`).join('')}</ul>
                <p><b>Análise:</b> ${data.analise_curta}</p>
                <p><b>Recomendação:</b> ${data.recomendacao_curta}</p>`;
        } catch (err) {
            insightsContent.innerHTML = `<div class="alert alert-danger">Erro: ${err.message}</div>`;
        } finally {
            hideSpinner();
        }
    };

    // --- MENU HAMBÚRGUER ---
    const toggleMenu = () => {
        const mapControls = document.getElementById("map-view-controls");
        const isMobile = window.innerWidth <= 992;

        mainMenu.classList.toggle("open");
        hamburgerBtn.classList.toggle("active");

        if (isMobile) {
            if (mainMenu.classList.contains("open")) {
                mapControls.style.display = "none";
            } else {
                mapControls.style.display = "block";
            }
        }
    };

    const closeMenuOnFilterClick = () => {
        if (window.innerWidth <= 992 && mainMenu.classList.contains("open")) {
            toggleMenu();
        }
    };

    // --- EVENTOS ---
    const initEventListeners = () => {
        selectRegiao.addEventListener('change', () => {
            fetchAndPopulate(`/municipios?regiao=${selectRegiao.value}`, selectMunicipio, 'Municípios');
            selectBairro.innerHTML = '<option>Selecione município</option>';
        });

        selectMunicipio.addEventListener('change', () => {
            fetchAndPopulate(`/bairros?municipio=${selectMunicipio.value}`, selectBairro, 'Bairros');
        });

        geralSearchInput.addEventListener('keyup', e => { if (e.key === 'Enter') buscarOcorrencias(); });
        btnBuscar.addEventListener('click', buscarOcorrencias);

        btnLimpar.addEventListener('click', () => {
            selectPeriodo.value = 'last_quarter';
            selectRegiao.value = '';
            selectMunicipio.value = '';
            selectBairro.value = '';
            selectCriminalidade.value = '';
            buscarOcorrencias();

            // Remove marcador de localização do usuário
            if (userLocationMarker) {
                map.removeLayer(userLocationMarker);
                userLocationMarker = null;
            }

            // Volta para visão inicial de São Paulo
            map.setView(SAO_PAULO_VIEW.center, SAO_PAULO_VIEW.zoom);
        });

        btnInsights.addEventListener('click', buscarInsights);
        closeInsightsBtn.addEventListener('click', () => insightsMessage.classList.add('d-none'));

        viewToggleBtn.addEventListener('click', () => {
            currentView = currentView === 'bubbles' ? 'heatmap' : 'bubbles';
            renderDataOnMap(lastGeoJsonData, true);
        });

        darkModeToggle.addEventListener('click', toggleDarkMode);

        btnLocalizacao.addEventListener('click', () => navigator.geolocation.getCurrentPosition(p => {
            const { latitude, longitude } = p.coords;
            if (userLocationMarker) map.removeLayer(userLocationMarker);
            map.setView([latitude, longitude], 15);
            userLocationMarker = L.marker([latitude, longitude]).addTo(map).bindPopup("Você está aqui!").openPopup();
        }));

        hamburgerBtn.addEventListener('click', toggleMenu);
    };

    // --- INICIALIZAÇÃO ---
    const initApp = async () => {
        inicializarMapa();
        initEventListeners();

        await Promise.all([
            fetchAndPopulate('/regioes', selectRegiao, 'Delegacias'),
            fetchAndPopulate('/municipios', selectMunicipio, 'Municípios'),
            fetchAndPopulate('/bairros', selectBairro, 'Bairros'),
            fetchAndPopulate('/delitos', selectCriminalidade, 'Crimes')
        ]);

        buscarOcorrencias();

        if (localStorage.getItem('darkMode') === 'enabled') toggleDarkMode();
    };

    initApp();
});
