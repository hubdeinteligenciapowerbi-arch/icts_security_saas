const selectMunicipio = document.getElementById('municipio');
const selectBairro = document.getElementById('regiao');
const selectPeriodo = document.getElementById('periodo');
const infoMessage = document.getElementById('info-message');

let municipiosAPI = [];
let regioesAPI = [];
const anoBase = 2025;

function normalizarTexto(texto) {
  return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function showInfo(msg) {
  infoMessage.textContent = msg || "";
}

async function carregarBairros() {
  try {
    showInfo("Carregando bairros...");
    const res = await fetch('http://localhost:8000/regioes');
    if (!res.ok) throw new Error("Erro ao buscar bairros");
    const json = await res.json();

    if (!json.success || !Array.isArray(json.data)) throw new Error("Formato inesperado da resposta");

    regioesAPI = json.data;

    selectBairro.innerHTML = '<option value="">Todos</option>';
    regioesAPI.forEach(r => {
      const option = document.createElement('option');
      option.value = r.codRegiao;      
      option.textContent = r.nome;     
      selectBairro.appendChild(option);
    });

    showInfo("Bairros carregados.");
  } catch (err) {
    console.error(err);
    showInfo("Erro ao carregar bairros.");
  }
}

async function carregarMunicipios() {
  try {
    showInfo("Carregando municípios...");
    const res = await fetch('http://localhost:8000/municipios');
    if (!res.ok) throw new Error("Erro ao buscar municípios");
    const json = await res.json();

    if (!json.success || !Array.isArray(json.data)) throw new Error("Formato inesperado da resposta");

    municipiosAPI = json.data.map(m => ({
      nome: normalizarTexto(m.nome),
      original: m.nome,
      codRegiao: m.codRegiao
    }));

    popularMunicipios(municipiosAPI);

    showInfo("Municípios carregados.");
  } catch (err) {
    console.error(err);
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

// Quando usuário seleciona um bairro (região), filtra os municípios
selectBairro.addEventListener('change', () => {
  const codRegiaoSelecionada = selectBairro.value;
  if (!codRegiaoSelecionada) {
    popularMunicipios(municipiosAPI);
    showInfo("Mostrando todos os municípios.");
  } else {
    const municipiosFiltrados = municipiosAPI.filter(m => m.codRegiao == codRegiaoSelecionada);
    popularMunicipios(municipiosFiltrados);
    showInfo(`Mostrando municípios da região ${codRegiaoSelecionada}.`);
  }
});

function carregarPeriodos() {
  selectPeriodo.innerHTML = '<option value="">Qualquer data</option>';
  const anos = [2025]; // pode adicionar mais anos futuramente
  anos.forEach(ano => {
    const option = document.createElement('option');
    option.value = ano;
    option.textContent = ano;
    selectPeriodo.appendChild(option);
  });
}

carregarBairros();
carregarMunicipios();
carregarPeriodos();