from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import requests

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_URL = "https://www.ssp.sp.gov.br/v1/"
HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json",
}

@app.get("/")
def root():
    return {"message": "API is running"}

@app.get("/regioes")
def regioes():
    url = BASE_URL + "Regioes/RecuperaRegioes"
    r = requests.get(url, headers=HEADERS)
    r.raise_for_status()
    return r.json()

@app.get("/municipios")
def municipios():
    url = BASE_URL + "Municipios/RecuperaMunicipios"
    r = requests.get(url, headers=HEADERS)
    r.raise_for_status()
    return r.json()

@app.get("/reverse-geocode")
def reverse_geocode(lat: float = Query(...), lon: float = Query(...)):
    try:
        nominatim_url = "https://nominatim.openstreetmap.org/reverse"
        params = {
            "format": "jsonv2",
            "lat": lat,
            "lon": lon
        }
        headers = {
            "User-Agent": "sua-aplicacao/1.0 (contato@email.com)"
        }
        response = requests.get(nominatim_url, params=params, headers=headers)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro na geolocalização: {str(e)}")

@app.get("/ocorrencias")
def ocorrencias(
    ano: int = Query(...),
    tipoGrupo: str = Query(...),
    idGrupo: int = Query(...),
    grupoDelito: int = Query(6)
):
    print(f"Recebido: ano={ano}, tipoGrupo={tipoGrupo}, idGrupo={idGrupo}, grupoDelito={grupoDelito}")
    url = f"{BASE_URL}OcorrenciasMensais/RecuperaDadosMensaisAgrupados"

    def fetch_dados(tipo, grupo):
        params = {
            "ano": ano,
            "tipoGrupo": tipo,
            "idGrupo": grupo,
            "grupoDelito": grupoDelito
        }
        response = requests.get(url, headers=HEADERS, params=params)
        response.raise_for_status()
        return response.json()

    try:
        dados = fetch_dados(tipoGrupo, idGrupo)

        if not dados.get("success") or not dados.get("data"):
            return {"ano": ano, "resumo": {}, "mensagem": "Nenhum dado encontrado"}

        resumo = {}
        for item in dados["data"]:
            for dado in item.get("listaDados", []):
                nome = dado["delito"]["delito"]
                total = dado["total"]
                resumo[nome] = resumo.get(nome, 0) + total

        return {
            "ano": ano,
            "resumo": resumo
        }

    except requests.RequestException as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar dados: {str(e)}")