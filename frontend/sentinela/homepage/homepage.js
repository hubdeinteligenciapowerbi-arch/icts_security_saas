document.addEventListener('DOMContentLoaded', async () => {
    const API_BASE_URL = "http://127.0.0.1:8000/api";
    const SAO_PAULO_VIEW = { center: [-22.19, -48.79], zoom: 7 };
    let map;
    let bubbleLayer;
    let heatLayer;
    let currentView = 'bubbles';
    let lastGeoJsonData = null;
    let userLocationMarker = null;

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

    function showInfo(message, type = 'info') {
        infoMessage.className = `alert alert-${type} text-center`;
        infoMessage.textContent = message;
        infoMessage.classList.remove('d-none');
        setTimeout(() => hideInfo(), 5000);
    }

    function hideInfo() {
        infoMessage.classList.add('d-none');
    }

    function showSpinner() {
        spinnerOverlay.classList.remove('d-none');
    }

    function hideSpinner() {
        spinnerOverlay.classList.add('d-none');
    }

    function toggleDarkMode() {
        document.body.classList.toggle('dark-mode');
        const isDarkMode = document.body.classList.contains('dark-mode');
        darkModeToggle.textContent = isDarkMode ? '☀️' : '🌙';
        localStorage.setItem('darkMode', isDarkMode ? 'enabled' : 'disabled');
    }

    function inicializarMapa() {
        map = L.map('map').setView(SAO_PAULO_VIEW.center, SAO_PAULO_VIEW.zoom);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        bubbleLayer = L.layerGroup().addTo(map);
        heatLayer = L.heatLayer([], { radius: 20, blur: 15, maxZoom: 12 });
    }

    function renderDataOnMap(geojson, isFiltered) {
        lastGeoJsonData = geojson;
        bubbleLayer.clearLayers();
        heatLayer.setLatLngs([]);

        if (!geojson || !geojson.features || geojson.features.length === 0) {
            dadosSegurancaDiv.innerHTML = '<p class="text-muted text-center">Nenhum dado encontrado.</p>';
            if (!isFiltered) map.setView(SAO_PAULO_VIEW.center, SAO_PAULO_VIEW.zoom);
            return;
        }

        dadosSegurancaDiv.innerHTML = '<p class="text-muted text-center">Passe o mouse ou clique nos pontos para ver o tipo de ocorrência.</p>';

        const validPoints = geojson.features.map(feature => {
            const [lng, lat] = feature.geometry.coordinates;
            if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
                return { lat, lng, delito: feature.properties.delito };
            }
            return null;
        }).filter(Boolean);

        if (validPoints.length === 0) {
            dadosSegurancaDiv.innerHTML = '<p class="text-muted text-center">Nenhum dado com coordenadas válidas.</p>';
            return;
        }

        if (currentView === 'bubbles') {
            if (!map.hasLayer(bubbleLayer)) map.addLayer(bubbleLayer);
            if (map.hasLayer(heatLayer)) map.removeLayer(heatLayer);

            validPoints.forEach(point => {
                const circle = L.circle([point.lat, point.lng], {
                    color: '#E60000', fillColor: '#f03', fillOpacity: 0.6, radius: 60, weight: 1
                })
                .bindTooltip(`<b>Ocorrência:</b><br>${(point.delito || 'N/A').replace(/_/g, ' ').toUpperCase()}`)
                .on('click', (e) => map.setView(e.latlng, 16));
                bubbleLayer.addLayer(circle);
            });
        } else {
            if (!map.hasLayer(heatLayer)) map.addLayer(heatLayer);
            if (map.hasLayer(bubbleLayer)) map.removeLayer(bubbleLayer);
            heatLayer.setLatLngs(validPoints.map(p => [p.lat, p.lng, 1.0]));
        }

        if (isFiltered && validPoints.length > 0) {
            const bounds = L.latLngBounds(validPoints.map(p => [p.lat, p.lng]));
            if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
        } else if (!isFiltered) {
            map.setView(SAO_PAULO_VIEW.center, SAO_PAULO_VIEW.zoom);
        }
    }

    async function fetchAndPopulate(endpoint, selectElement, placeholder, transformFn) {
        selectElement.disabled = true;
        selectElement.innerHTML = `<option value="">A carregar...</option>`;
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`);
            if (!response.ok) throw new Error(`Falha na resposta da API: ${response.statusText}`);
            const { data } = await response.json();
            selectElement.innerHTML = '';
            if (data && data.length > 0) {
                selectElement.innerHTML = `<option value="">-- ${placeholder} --</option>`;
                data.forEach(item => {
                    const option = document.createElement('option');
                    const transformedItem = transformFn(item);
                    option.value = transformedItem.value;
                    option.textContent = transformedItem.text;
                    selectElement.appendChild(option);
                });
                selectElement.disabled = false;
            } else {
                selectElement.innerHTML = `<option value="">Nenhum dado</option>`;
            }
        } catch (error) {
            console.error(`Erro ao buscar ${endpoint}:`, error);
            showInfo(`Não foi possível carregar ${placeholder.toLowerCase()}.`, 'danger');
            selectElement.innerHTML = `<option value="">Erro ao carregar</option>`;
        }
    }

    function handleGeneralSearch() {
        const searchTerm = geralSearchInput.value.trim().toUpperCase();
        if (!searchTerm) return;
        let found = false;
        for (const sel of [selectBairro, selectMunicipio, selectRegiao]) {
            for (const option of sel.options) {
                if (option.textContent.toUpperCase() === searchTerm) {
                    sel.value = option.value;
                    found = true;
                    break;
                }
            }
            if (found) break;
        }
        if (found) buscarOcorrencias();
        else showInfo("Local não encontrado nos filtros.", "warning");
    }

    async function buscarOcorrencias() {
        showSpinner();
        const params = new URLSearchParams();
        if (selectPeriodo.value) params.set('periodo', selectPeriodo.value);
        if (selectRegiao.value) params.set('regiao', selectRegiao.value);
        if (selectMunicipio.value) params.set('municipio', selectMunicipio.value);
        if (selectBairro.value) params.set('bairro', selectBairro.value);
        if (selectCriminalidade.value) params.set('delito', selectCriminalidade.value);

        const isFiltered = !!(selectRegiao.value || selectMunicipio.value || selectBairro.value || selectCriminalidade.value);

        try {
            const res = await fetch(`${API_BASE_URL}/ocorrencias?${params}`);
            const json = await res.json();
            if (!res.ok) throw new Error(json.detail || 'Erro na API');
            renderDataOnMap(json.geojson, isFiltered);
        } catch (err) {
            showInfo(`Erro: ${err.message}`, 'danger');
            dadosSegurancaDiv.innerHTML = '<p class="text-danger text-center">Falha ao carregar dados.</p>';
        } finally {
            hideSpinner();
        }
    }

    async function buscarInsights() {
        insightsContent.innerHTML = '<p class="text-center">Gerando análise, por favor aguarde...</p>';
        insightsMessage.classList.remove('d-none');
        showSpinner();

        const body = {
            periodo: selectPeriodo.value,
            regiao: selectRegiao.value,
            municipio: selectMunicipio.value,
            bairro: selectBairro.value,
            delito: selectCriminalidade.value
        };

        try {
            const res = await fetch(`${API_BASE_URL}/insights`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            
            const data = await res.json();
            
            if (!res.ok) {
                throw new Error(data.detail || `Erro ${res.status}`);
            }
            
            if (data && data.detalhamento_ocorrencias && data.analise_curta && data.recomendacao_curta) {
                
                let detalhesHtml = '';
                if (data.detalhamento_ocorrencias.length > 0) {
                    detalhesHtml = data.detalhamento_ocorrencias.map(item => `
                        <li class="list-group-item d-flex justify-content-between align-items-center">
                            ${item.tipo}
                            <span class="badge bg-primary rounded-pill">${item.quantidade}</span>
                        </li>
                    `).join(''); 
                }

                const insightsHtml = `
                    <div class="insight-item">
                        <h5 class="insight-title">Ocorrências (${data.quantidade_total})</h5>
                        <ul class="list-group list-group-flush">
                            ${detalhesHtml}
                        </ul>
                    </div>
                    <div class="insight-item mt-3">
                        <h5 class="insight-title">Análise</h5>
                        <p>${data.analise_curta}</p>
                    </div>
                    <div class="insight-item mt-3">
                        <h5 class="insight-title">Recomendação</h5>
                        <p>${data.recomendacao_curta}</p>
                    </div>
                `;
                insightsContent.innerHTML = insightsHtml;

            } else {
                throw new Error("O formato da resposta da IA é inválido ou está incompleto.");
            }

        } catch (err) {
            insightsContent.innerHTML = `<div class="alert alert-danger"><strong>Erro ao gerar insights:</strong> ${err.message}</div>`;
            console.error("Falha na busca por insights:", err);
        } finally {
            hideSpinner();
        }
    }

    function limparFiltros() {
        geralSearchInput.value = '';
        selectRegiao.value = '';
        selectMunicipio.value = '';
        selectBairro.value = '';
        selectCriminalidade.value = '';
        selectPeriodo.value = 'last_quarter';

        if (userLocationMarker) {
            map.removeLayer(userLocationMarker);
            userLocationMarker = null;
        }

        selectMunicipio.dispatchEvent(new Event('change'));
        buscarOcorrencias();
    }

    // Inicialização do mapa
    inicializarMapa();

    const itemTransform = item => ({ value: item.nome.toLowerCase(), text: item.nome });

    // Carrega selects e aguarda todos antes de buscar ocorrências
    await Promise.all([
        fetchAndPopulate('/regioes', selectRegiao, 'Todas as Delegacias', itemTransform),
        fetchAndPopulate('/municipios', selectMunicipio, 'Todos os Municípios', itemTransform),
        fetchAndPopulate('/bairros', selectBairro, 'Todos os Bairros', itemTransform),
        fetchAndPopulate('/delitos', selectCriminalidade, 'Todos os Crimes', itemTransform)
    ]);

    buscarOcorrencias();

    // Event listeners
    selectRegiao.addEventListener('change', () => {
        const endpoint = selectRegiao.value ? `/municipios?regiao=${encodeURIComponent(selectRegiao.value)}` : '/municipios';
        fetchAndPopulate(endpoint, selectMunicipio, 'Todos os Municípios', itemTransform);
        selectBairro.innerHTML = '<option value="">-- Selecione um município --</option>';
        selectBairro.disabled = true;
    });

    selectMunicipio.addEventListener('change', () => {
        const endpoint = selectMunicipio.value ? `/bairros?municipio=${encodeURIComponent(selectMunicipio.value)}` : '/bairros';
        fetchAndPopulate(endpoint, selectBairro, 'Todos os Bairros', itemTransform);
    });

    geralSearchInput.addEventListener('keyup', (event) => { if (event.key === 'Enter') handleGeneralSearch(); });
    btnBuscar.addEventListener('click', () => { geralSearchInput.value.trim() ? handleGeneralSearch() : buscarOcorrencias(); });
    btnLimpar.addEventListener('click', limparFiltros);
    btnInsights.addEventListener('click', buscarInsights);
    closeInsightsBtn.addEventListener('click', () => insightsMessage.classList.add('d-none'));

    viewToggleBtn.addEventListener('click', () => {
        currentView = currentView === 'bubbles' ? 'heatmap' : 'bubbles';
        viewToggleBtn.title = currentView === 'bubbles' ? 'Alternar para Mapa de Calor' : 'Alternar para Ocorrências';
        viewIcon.textContent = currentView === 'bubbles' ? '🔥' : '⚫';
        viewText.textContent = currentView === 'bubbles' ? 'Mapa de Calor' : 'Ocorrências';
        if (lastGeoJsonData) {
            const isFiltered = !!(selectRegiao.value || selectMunicipio.value || selectBairro.value || selectCriminalidade.value);
            renderDataOnMap(lastGeoJsonData, isFiltered);
        }
    });

    if (localStorage.getItem('darkMode') === 'enabled') toggleDarkMode();
    darkModeToggle.addEventListener('click', toggleDarkMode);

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.lang = 'pt-BR';
        recognition.interimResults = false;
        voiceSearchButton.addEventListener('click', () => {
            try { recognition.start(); showInfo("A ouvir...", "info"); } 
            catch (error) { console.log("O reconhecimento já começou."); }
        });
        recognition.onresult = (event) => {
            const text = event.results[event.results.length - 1][0].transcript;
            geralSearchInput.value = text;
            showInfo(`Você disse: "${text}". A buscar...`, "success");
            setTimeout(handleGeneralSearch, 1000);
        };
        recognition.onspeechend = () => { recognition.stop(); hideInfo(); };
        recognition.onerror = (event) => { showInfo(`Erro na busca por voz: ${event.error}`, "danger"); };
    } else {
        voiceSearchButton.disabled = true;
        voiceSearchButton.title = 'Busca por voz não suportada neste navegador.';
    }

    btnLocalizacao.addEventListener('click', () => {
        if (navigator.geolocation) {
            showInfo('Obtendo sua localização...', 'info');
            navigator.geolocation.getCurrentPosition(position => {
                const { latitude, longitude } = position.coords;

                if (userLocationMarker) map.removeLayer(userLocationMarker);

                map.setView([latitude, longitude], 15);
                userLocationMarker = L.marker([latitude, longitude]).addTo(map).bindPopup("Você está aqui!").openPopup();
                hideInfo();
            }, () => { showInfo('Não foi possível obter sua localização.', 'danger'); });
        } else {
            showInfo('Geolocalização não é suportada por este navegador.', 'warning');
        }
    });
});
