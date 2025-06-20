const selectMunicipio = document.getElementById('municipio');
const selectBairro = document.getElementById('regiao');
const selectPeriodo = document.getElementById('periodo');
const infoMessage = document.getElementById('info-message');
const dadosSegurancaDiv = document.getElementById('dados-seguranca');
const btnLimpar = document.getElementById('btn-limpar');
const btnLocalizacao = document.getElementById('btn-localizacao');
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const voiceStatus = document.getElementById('voice-status');
const darkModeToggle = document.getElementById('dark-mode-toggle');
const voiceButton = document.getElementById('voice-button');
const btnInsights = document.getElementById('btn-insights');
btnInsights.addEventListener('click', gerarInsights);

let municipiosAPI = [];
let regioesAPI = [];
let marcadorMapa = null;
const anoBase = 2025;

const map = L.map('map').setView([-23.55052, -46.633308], 10);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: 'Map data © OpenStreetMap contributors'
}).addTo(map);

darkModeToggle.addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  darkModeToggle.textContent = isDark ? "☀️" : "🌙";
});

function normalizarTexto(texto) {
  return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function showInfo(msg) {
  infoMessage.textContent = msg || "";
  infoMessage.classList.remove("d-none");
}

function verificarHabilitarInsights() {
  if (selectMunicipio.value || selectBairro.value) {
    btnInsights.disabled = false;
  } else {
    btnInsights.disabled = true;
  }
}

async function carregarBairros() {
  try {
    showInfo("Carregando bairros...");
    const res = await fetch('http://localhost:8000/regioes');
    const json = await res.json();

    if (!res.ok || !json.success || !Array.isArray(json.data)) throw new Error();

    regioesAPI = json.data;
    selectBairro.innerHTML = '<option value="">Todos</option>';

    regioesAPI.forEach(r => {
      const option = document.createElement('option');
      option.value = r.codRegiao;
      option.textContent = r.nome;
      selectBairro.appendChild(option);
    });

    showInfo("Bairros carregados.");
  } catch {
    showInfo("Erro ao carregar bairros.");
  }
}

async function carregarMunicipios() {
  try {
    showInfo("Carregando municípios...");
    const res = await fetch('http://localhost:8000/municipios');
    const json = await res.json();

    if (!res.ok || !json.success || !Array.isArray(json.data)) throw new Error();

    municipiosAPI = json.data.map(m => ({
      nome: normalizarTexto(m.nome),
      original: m.nome,
      codRegiao: m.codRegiao
    }));

    popularMunicipios(municipiosAPI);
    showInfo("Municípios carregados.");
  } catch {
    showInfo("Erro ao carregar municípios.");
  }
}

function popularMunicipios(municipios) {
  selectMunicipio.innerHTML = '<option value="">Todos</option>';
  municipios.forEach(m => {
    const option = document.createElement('option');
    option.value = m.original;
    option.textContent = m.original;
    selectMunicipio.appendChild(option);
  });
}

function carregarPeriodos() {
  selectPeriodo.innerHTML = '<option value="">Ano Atual</option>';
  const opcoes = ["ultimos_30_dias", "ultimo_trimestre"];
  opcoes.forEach(val => {
    const option = document.createElement("option");
    option.value = val;
    option.textContent = val.replace(/_/g, " ").replace(/^./, s => s.toUpperCase());
    selectPeriodo.appendChild(option);
  });
}

selectBairro.addEventListener('change', () => {
  const codRegiaoSelecionada = selectBairro.value;
  if (!codRegiaoSelecionada) {
    popularMunicipios(municipiosAPI);
    showInfo("Mostrando todos os municípios.");
  } else {
    const filtrados = municipiosAPI.filter(m => m.codRegiao == codRegiaoSelecionada);
    popularMunicipios(filtrados);
    showInfo(`Mostrando municípios da região ${codRegiaoSelecionada}.`);
  }
  verificarHabilitarInsights();
  buscarOcorrencias();
});

selectMunicipio.addEventListener("change", () => {
  verificarHabilitarInsights();
  buscarOcorrencias();
});

selectPeriodo.addEventListener("change", buscarOcorrencias);

async function buscarOcorrencias() {
  showInfo("Buscando dados de segurança pública...");
  dadosSegurancaDiv.textContent = "";

  const anoSelecionado = selectPeriodo.value || anoBase;
  let tipoGrupo = "";
  let idGrupo = null;

  if (selectMunicipio.value) {
    tipoGrupo = "MUNICIPIO";
    const municipio = municipiosAPI.find(m => m.original === selectMunicipio.value);
    if (!municipio) {
      showInfo("Município selecionado inválido.");
      return;
    }
    idGrupo = municipio.codRegiao;
  } else if (selectBairro.value) {
    tipoGrupo = "REGIAO";
    idGrupo = Number(selectBairro.value);
  } else {
    showInfo("Selecione um município ou região para consultar.");
    return;
  }

  try {
    const url = new URL("http://localhost:8000/ocorrencias");
    url.searchParams.set("ano", anoSelecionado);
    url.searchParams.set("tipoGrupo", tipoGrupo);
    url.searchParams.set("idGrupo", idGrupo);
    url.searchParams.set("grupoDelito", 6);

    const res = await fetch(url);
    const json = await res.json();

    if (!res.ok || !json.resumo || Object.keys(json.resumo).length === 0) {
      showInfo("Nenhum dado disponível para o filtro selecionado.");
      dadosSegurancaDiv.textContent = "Nenhum dado encontrado.";
      return;
    }

    const camposResumo = {
      "Total Mortes": ["HOMICÍDIO DOLOSO (2)", "LATROCÍNIO", "LESÃO CORPORAL SEGUIDA DE MORTE"],
      "Total Homicídios": ["HOMICÍDIO DOLOSO (2)"],
      "Total Latrocínios": ["LATROCÍNIO"],
      "Total Roubo de Veículos": ["ROUBO DE VEÍCULO"],
      "Total Furtos": ["FURTO - OUTROS", "FURTO DE VEÍCULO"]
    };

    function somaCampos(lista) {
      return lista.reduce((acc, nome) => acc + (json.resumo[nome] || 0), 0);
    }

    dadosSegurancaDiv.innerHTML = `
      <strong>Resumo das Ocorrências em ${anoSelecionado}:</strong><br>
      ${Object.entries(camposResumo).map(([label, campos]) =>
        `${label}: ${somaCampos(campos)}<br>`).join("")}
    `;

    if (selectMunicipio.value) {
      centralizarNoMapa(`${selectMunicipio.value}, São Paulo, Brasil`);
    } else if (selectBairro.value) {
      const nomeRegiao = regioesAPI.find(r => r.codRegiao == selectBairro.value)?.nome;
      if (nomeRegiao) centralizarNoMapa(`${nomeRegiao}, São Paulo, Brasil`);
    }

    showInfo(`Dados carregados para ${tipoGrupo} ${idGrupo} no ano ${anoSelecionado}.`);
  } catch {
    showInfo("Erro ao buscar dados de segurança pública.");
  }
}

async function centralizarNoMapa(endereco) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(endereco)}&format=json&limit=1`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.length > 0) {
      const { lat, lon } = data[0];
      if (marcadorMapa) map.removeLayer(marcadorMapa);
      marcadorMapa = L.marker([lat, lon]).addTo(map).bindPopup(endereco).openPopup();
      map.setView([lat, lon], 12);
    }
  } catch (e) {
    console.error("Erro ao centralizar no mapa:", e);
  }
}

btnLimpar.addEventListener("click", () => {
  selectMunicipio.value = "";
  selectBairro.value = "";
  selectPeriodo.value = "";
  searchInput.value = "";
  dadosSegurancaDiv.innerHTML = "";
  verificarHabilitarInsights();
  showInfo("Filtros limpos.");
  if (marcadorMapa) map.removeLayer(marcadorMapa);
});

btnLocalizacao.addEventListener("click", () => {
  if (!navigator.geolocation) return showInfo("Geolocalização não suportada.");

  showInfo("Obtendo sua localização...");
  navigator.geolocation.getCurrentPosition(async ({ coords }) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.latitude}&lon=${coords.longitude}`);
      const data = await res.json();
      const cidade = data.address?.city || data.address?.town || data.address?.village || "";
      const cidadeNorm = normalizarTexto(cidade);

      const municipio = municipiosAPI.find(m => normalizarTexto(m.original) === cidadeNorm);
      if (municipio) {
        selectMunicipio.value = municipio.original;
        selectMunicipio.dispatchEvent(new Event("change"));
        showInfo(`Município detectado: ${municipio.original}`);
      } else {
        showInfo(`Município não encontrado: ${cidade}`);
      }
    } catch {
      showInfo("Erro ao identificar o município pela localização.");
    }
  }, () => showInfo("Não foi possível obter a localização."));
});

function aplicarFiltroPesquisa() {
  const termo = normalizarTexto(searchInput.value.trim());
  if (!termo) {
    showInfo("Digite um local para buscar.");
    return;
  }

  const municipio = municipiosAPI.find(m => normalizarTexto(m.original).includes(termo));
  if (municipio) {
    selectMunicipio.value = municipio.original;
    selectMunicipio.dispatchEvent(new Event("change"));
    showInfo(`Busca aplicada ao município: ${municipio.original}`);
    return;
  }

  const regiao = regioesAPI.find(r => normalizarTexto(r.nome).includes(termo));
  if (regiao) {
    selectBairro.value = regiao.codRegiao;
    selectBairro.dispatchEvent(new Event("change"));
    showInfo(`Busca aplicada à região: ${regiao.nome}`);
    return;
  }

  showInfo("Local não encontrado. Verifique o nome digitado.");
}

searchButton.addEventListener("click", aplicarFiltroPesquisa);
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") aplicarFiltroPesquisa();
});

async function gerarInsights() {
  if (btnInsights.disabled) {
    showInfo("Escolha primeiro um município ou região para prosseguir.");
    return;
  }

  const container = document.getElementById('insights-message');
  const content = container.querySelector('.insights-content');
  container.classList.add('d-none');
  content.innerHTML = '';

  try {
    const resumo = {
      "HOMICÍDIO DOLOSO (2)": 839,
      "LATROCÍNIO": 51,
      "FURTO DE VEÍCULO": 200
    };

    const res = await fetch('http://localhost:8000/insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(resumo)
    });
    if (!res.ok) throw new Error();

    const data = await res.json();
    const texto = data.insights;

    const linhas = texto.split('\n');
    let html = '';
    linhas.forEach(line => {
      if (line.startsWith('**Insight')) {
        html += `<h5 style="margin:14px 0 6px; color:#dc3545;">${line.replace(/\*\*/g,'')}</h5>`;
      }
      else if (line.startsWith('* **')) {
        const partes = line.match(/\*\s\*\*(.+?)\*\*:(.+)/);
        if (partes) {
          html += `<ul><li><strong>${partes[1]}:</strong>${partes[2].trim()}</li></ul>`;
        }
      }
      else if (line.startsWith('* ')) {
        html += `<ul><li>${line.replace(/^\*\s/, '')}</li></ul>`;
      }
      else {
        html += `<p>${line}</p>`;
      }
    });

    content.innerHTML = html;
    container.classList.remove('d-none');

    container.querySelector('.close-btn')
      .onclick = () => container.classList.add('d-none');

    document.addEventListener('click', e => {
      if (!container.contains(e.target) && e.target !== btnInsights) {
        container.classList.add('d-none');
      }
    }, { once: true });

  } catch {
    showInfo("Erro ao gerar insights de segurança.");
  }
}


voiceButton.addEventListener("click", iniciarPesquisaVoz);

function iniciarPesquisaVoz() {
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    showInfo("Reconhecimento de voz não suportado neste navegador.");
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  recognition.lang = 'pt-BR';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    voiceStatus.textContent = "🎤 Ouvindo... diga o nome do município ou região.";
    voiceButton.disabled = true;
  };

  recognition.onresult = (event) => {
    const resultado = event.results[0][0].transcript.trim();
    searchInput.value = resultado;
    voiceStatus.textContent = `Você disse: "${resultado}"`;
    aplicarFiltroPesquisa();
  };

  recognition.onerror = (event) => {
    console.error("Erro no reconhecimento de voz:", event.error);
    showInfo(`Erro no reconhecimento de voz: ${event.error}`);
    voiceStatus.textContent = "";
  };

  recognition.onend = () => {
    voiceButton.disabled = false;
    setTimeout(() => voiceStatus.textContent = "", 4000);
  };

  recognition.start();
}

(async function inicializar() {
  btnInsights.disabled = true;
  await carregarBairros();
  await carregarMunicipios();
  carregarPeriodos();
  buscarOcorrencias();
})();
