document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = "http://127.0.0.1:8000/api";
    const SAO_PAULO_VIEW = { center: [-22.19, -48.79], zoom: 7 };
    let map;
    let bubbleLayer;
    let heatLayer;
    let currentView = 'bubbles'; 
    let lastGeoJsonData = null; 

    const spinnerOverlay = document.getElementById('spinner-overlay');
    const geralSearchInput = document.getElementById('geral-search-input');
    const voiceSearchButton = document.getElementById('voice-search-button');
    const selectPeriodo = document.getElementById('periodo');
    const selectRegiao = document.getElementById('regiao');
    const selectMunicipio = document.getElementById('municipio');
    const selectBairro = document.getElementById('bairro');
    const btnBuscar = document.getElementById('search-button');
    const btnLimpar = document.getElementById('btn-limpar');
    const btnLocalizacao = document.getElementById('btn-localizacao');
    const btnInsights = document.getElementById('btn-insights');
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const dadosSegurancaDiv = document.getElementById('dados-seguranca');
    const infoMessage = document.getElementById('info-message');
    const insightsMessage = document.getElementById('insights-message');
    const closeInsightsBtn = insightsMessage.querySelector('.close-btn');
    const viewToggleBtn = document.getElementById('view-toggle-btn');
    const viewIcon = document.getElementById('view-icon');
    const viewText = document.getElementById('view-text');

    // STATUS E UI 
    function showInfo(message, type = 'primary') {
        infoMessage.className = `alert alert-${type} text-center`;
        infoMessage.textContent = message;
        infoMessage.classList.remove('d-none');
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
    
    // FUNÇÕES DO MAPA
    function inicializarMapa() {
        map = L.map('map').setView(SAO_PAULO_VIEW.center, SAO_PAULO_VIEW.zoom);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
        
        bubbleLayer = L.layerGroup().addTo(map); 
        heatLayer = L.heatLayer([], { radius: 20, blur: 15, maxZoom: 12 });
    }

    const isWithinBrazil = (lat, lng) => {
        const south = -33.75; 
        const north = 5.27;   
        const west = -73.99;  
        const east = -34.79; 
        return lat >= south && lat <= north && lng >= west && lng <= east;
    };

    function renderDataOnMap(geojson, isFiltered) {
        lastGeoJsonData = geojson; 

        bubbleLayer.clearLayers();
        heatLayer.setLatLngs([]);

        if (!geojson || !geojson.features || geojson.features.length === 0) {
            dadosSegurancaDiv.innerHTML = '<p class="text-muted text-center">Nenhum dado encontrado.</p>';
            map.setView(SAO_PAULO_VIEW.center, SAO_PAULO_VIEW.zoom);
            return;
        }

        dadosSegurancaDiv.innerHTML = '<p class="text-muted text-center">Passe o mouse por cima das ocorrências para ver a tipicidade.</p>';

        const validPoints = geojson.features.map(feature => {
            const [lng, lat] = feature.geometry.coordinates;
            // Valida se a coordenada é numérica E se está dentro do Brasil
            if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng) && isWithinBrazil(lat, lng)) {
                return { lat, lng, delito: feature.properties.delito };
            }
            return null;
        }).filter(Boolean); 

        if (validPoints.length === 0) {
            dadosSegurancaDiv.innerHTML = '<p class="text-muted text-center">Nenhum dado encontrado no território brasileiro para este filtro.</p>';
            return;
        };

        if (currentView === 'bubbles') {
            if (!map.hasLayer(bubbleLayer)) map.addLayer(bubbleLayer);
            if (map.hasLayer(heatLayer)) map.removeLayer(heatLayer);
            
            validPoints.forEach(point => {
                const circle = L.circle([point.lat, point.lng], {
                    color: '#E60000',
                    fillColor: '#f03',
                    fillOpacity: 0.6,
                    radius: 60,
                    weight: 1
                }).bindTooltip(`<b>Ocorrência:</b><br>${point.delito.replace(/_/g, ' ').toUpperCase()}`);
                bubbleLayer.addLayer(circle);
            });
        } else { // Heatmap
            if (!map.hasLayer(heatLayer)) map.addLayer(heatLayer);
            if (map.hasLayer(bubbleLayer)) map.removeLayer(bubbleLayer);

            const heatData = validPoints.map(p => [p.lat, p.lng, 1.0]); 
            heatLayer.setLatLngs(heatData);
        }

        if (isFiltered) {
            const bounds = L.latLngBounds(validPoints.map(p => [p.lat, p.lng]));
            if (bounds.isValid()) {
                map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
            }
        } else {
            map.setView(SAO_PAULO_VIEW.center, SAO_PAULO_VIEW.zoom);
        }
    }
    
    async function fetchAndPopulate(endpoint, selectElement, placeholder, transformFn) {
        selectElement.disabled = true;
        selectElement.innerHTML = `<option value="">A carregar...</option>`;
         try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`);
            if (!response.ok) throw new Error('Falha na resposta da API');
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
                selectElement.innerHTML = `<option value="">Nenhum dado encontrado</option>`;
            }
        } catch (error) {
            console.error(`Erro ao buscar ${endpoint}:`, error);
            showInfo(`Não foi possível carregar ${placeholder.toLowerCase()}.`, 'danger');
            selectElement.innerHTML = `<option value="">Erro ao carregar</option>`;
        }
    }

    // BUSCA 
    function handleGeneralSearch() {
        const searchTerm = geralSearchInput.value.trim().toUpperCase();
        if (!searchTerm) return;
        let found = false;
        for (const option of selectMunicipio.options) {
            if (option.textContent.toUpperCase() === searchTerm) {
                selectMunicipio.value = option.value;
                found = true; break;
            }
        }
        if (!found) {
            for (const option of selectBairro.options) {
                if (option.textContent.toUpperCase() === searchTerm) {
                    selectBairro.value = option.value;
                    found = true; break;
                }
            }
        }
        if (!found) {
             for (const option of selectRegiao.options) {
                if (option.textContent.toUpperCase() === searchTerm) {
                    selectRegiao.value = option.value;
                    found = true; break;
                }
            }
        }
        if (found) {
            buscarOcorrencias();
        } else {
            showInfo("Local não encontrado nos filtros.", "warning");
        }
    }
    
    async function buscarOcorrencias() {
        showSpinner();
        const params = new URLSearchParams();
        if (selectPeriodo.value) params.set('periodo', selectPeriodo.value);
        if (selectRegiao.value) params.set('regiao', selectRegiao.value);
        if (selectMunicipio.value) params.set('municipio', selectMunicipio.value);
        if (selectBairro.value) params.set('bairro', selectBairro.value);

        const isFiltered = !!(selectRegiao.value || selectMunicipio.value || selectBairro.value);

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
    
    function limparFiltros() {
        geralSearchInput.value = '';
        selectRegiao.value = '';
        selectMunicipio.value = '';
        selectBairro.value = '';
        selectPeriodo.value = 'last_quarter';
        
        fetchAndPopulate('/municipios', selectMunicipio, 'Todos os Municípios', item => ({ value: item.nome, text: item.nome }));
        fetchAndPopulate('/bairros', selectBairro, 'Todos os Bairros', item => ({ value: item.nome, text: item.nome }));
        
        buscarOcorrencias();
    }

    // EVENT LISTENERS 
    inicializarMapa();
    
    fetchAndPopulate('/regioes', selectRegiao, 'Todas as Regiões', item => ({ value: item.nome, text: item.nome }));
    fetchAndPopulate('/municipios', selectMunicipio, 'Todos os Municípios', item => ({ value: item.nome, text: item.nome }));
    fetchAndPopulate('/bairros', selectBairro, 'Todos os Bairros', item => ({ value: item.nome, text: item.nome }));
    
    selectRegiao.addEventListener('change', () => {
        const endpoint = selectRegiao.value ? `/municipios?regiao=${encodeURIComponent(selectRegiao.value)}` : '/municipios';
        fetchAndPopulate(endpoint, selectMunicipio, 'Todos os Municípios', item => ({ value: item.nome, text: item.nome }));
        selectBairro.innerHTML = '<option value="">-- Selecione um município --</option>';
        selectBairro.disabled = true;
    });

    selectMunicipio.addEventListener('change', () => {
        const endpoint = selectMunicipio.value ? `/bairros?municipio=${encodeURIComponent(selectMunicipio.value)}` : '/bairros';
        fetchAndPopulate(endpoint, selectBairro, 'Todos os Bairros', item => ({ value: item.nome, text: item.nome }));
    });
    
    geralSearchInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') handleGeneralSearch();
    });

    btnBuscar.addEventListener('click', () => {
        if (geralSearchInput.value.trim()) {
            handleGeneralSearch();
        } else {
            buscarOcorrencias();
        }
    });
    btnLimpar.addEventListener('click', limparFiltros);
    
    viewToggleBtn.addEventListener('click', () => {
        if (currentView === 'bubbles') {
            currentView = 'heatmap';
            viewToggleBtn.title = 'Alternar para Mapa de Camadas';
            viewIcon.textContent = '⚫';
            viewText.textContent = 'Mapa de Camadas';
        } else {
            currentView = 'bubbles';
            viewToggleBtn.title = 'Alternar para Mapa de Calor';
            viewIcon.textContent = '🔥';
            viewText.textContent = 'Mapa de Calor';
        }
        if (lastGeoJsonData) {
            const isFiltered = !!(selectRegiao.value || selectMunicipio.value || selectBairro.value);
            renderDataOnMap(lastGeoJsonData, isFiltered);
        }
    });
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.lang = 'pt-BR';
        recognition.interimResults = false;
        voiceSearchButton.addEventListener('click', () => {
            try {
                recognition.start();
                showInfo("A ouvir...", "info");
            } catch (error) { console.log("Recognition already started."); }
        });
        recognition.onresult = (event) => {
            const text = event.results[event.results.length - 1][0].transcript;
            geralSearchInput.value = text;
            showInfo(`Você disse: "${text}". A buscar...`, "success");
            setTimeout(handleGeneralSearch, 1000);
        };
        recognition.onspeechend = () => {
            recognition.stop();
            hideInfo();
        };
        recognition.onerror = (event) => {
            showInfo(`Erro na busca por voz: ${event.error}`, "danger");
        };
    } else {
        voiceSearchButton.disabled = true;
        voiceSearchButton.title = 'Busca por voz não suportada neste navegador.';
    }

    btnLocalizacao.addEventListener('click', () => {
        if (navigator.geolocation) {
            showInfo('Obtendo sua localização...', 'info');
            navigator.geolocation.getCurrentPosition(position => {
                const { latitude, longitude } = position.coords;
                map.setView([latitude, longitude], 15);
                L.marker([latitude, longitude]).addTo(map).bindPopup("Você está aqui!").openPopup();
                hideInfo();
            }, () => {
                showInfo('Não foi possível obter sua localização.', 'danger');
            });
        } else {
            showInfo('Geolocalização não é suportada por este navegador.', 'warning');
        }
    });

    darkModeToggle.addEventListener('click', toggleDarkMode);
    
    if (localStorage.getItem('darkMode') === 'enabled') {
        document.body.classList.add('dark-mode');
        darkModeToggle.textContent = '☀️';
    }
    
    btnInsights.addEventListener('click', () => {
        insightsMessage.classList.remove('d-none');
    });

    closeInsightsBtn.addEventListener('click', () => {
        insightsMessage.classList.add('d-none');
    });
    
    buscarOcorrencias();
});