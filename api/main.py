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
    print("Rota raiz acessada")
    return {"message": "API is running"}

@app.get("/regioes")
def regioes():
    url = BASE_URL + "Regioes/RecuperaRegioes"
    print(f"Requisição para {url}")
    try:
        r = requests.get(url, headers=HEADERS)
        r.raise_for_status()
        print("Dados das regiões obtidos com sucesso")
        return r.json()
    except Exception as e:
        print(f"Erro na requisição Regioes: {e}")
        raise HTTPException(status_code=500, detail=f"Erro na requisição Regioes: {str(e)}")

@app.get("/municipios")
def municipios():
    url = BASE_URL + "Municipios/RecuperaMunicipios"
    print(f"Requisição para {url}")
    try:
        r = requests.get(url, headers=HEADERS)
        r.raise_for_status()
        print("Dados dos municípios obtidos com sucesso")
        return r.json()
    except Exception as e:
        print(f"Erro na requisição Municipios: {e}")
        raise HTTPException(status_code=500, detail=f"Erro na requisição Municipios: {str(e)}")

@app.get("/reverse-geocode")
def reverse_geocode(lat: float = Query(...), lon: float = Query(...)):
    print(f"Reverse geocode requisitado para lat={lat}, lon={lon}")
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
        print("Reverse geocode realizado com sucesso")
        return response.json()
    except Exception as e:
        print(f"Erro na geolocalização: {e}")
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
    print(f"Requisição para {url} com params ano={ano}, tipoGrupo={tipoGrupo}, idGrupo={idGrupo}, grupoDelito={grupoDelito}")

    def fetch_dados(tipo, grupo):
        params = {
            "ano": ano,
            "tipoGrupo": tipo,
            "idGrupo": grupo,
            "grupoDelito": grupoDelito
        }
        print(f"Chamando API externa com params: {params}")
        response = requests.get(url, headers=HEADERS, params=params)
        response.raise_for_status()
        print("Dados recebidos da API externa")
        return response.json()

    try:
        dados = fetch_dados(tipoGrupo, idGrupo)

        if not dados.get("success") or not dados.get("data"):
            print("Nenhum dado encontrado na resposta")
            return {"ano": ano, "resumo": {}, "mensagem": "Nenhum dado encontrado"}

        resumo = {}
        for item in dados["data"]:
            for dado in item.get("listaDados", []):
                nome = dado["delito"]["delito"]
                total = dado["total"]
                resumo[nome] = resumo.get(nome, 0) + total

        print(f"Resumo calculado: {resumo}")

        return {
            "ano": ano,
            "resumo": resumo
        }

    except requests.RequestException as e:
        print(f"Erro ao buscar dados: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao buscar dados: {str(e)}")
